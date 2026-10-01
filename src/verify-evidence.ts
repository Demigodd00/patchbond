import type {Job, Review} from './model.ts';

export type CheckStatus = 'pass' | 'fail' | 'unavailable';
export type EvidenceCheck = {label:string; status:CheckStatus; detail:string; url?:string};
export type EvidenceReport = {jobId:string; checkedAt:string; checks:EvidenceCheck[]; verdict:'verified'|'failed'|'incomplete'};
type SourceProof = {text:string;sha256:string;bytes:number};
type FileProof = {path:string;before:SourceProof;after:SourceProof};
type Capture = {repo:string;repository_id:number;base_sha:string;head_sha:string;workflow:SourceProof;files:FileProof[];ci:{run_id:number;attempt:number;workflow_id:number;started_at:number;job_id:number;job_name:string;conclusion:string;steps:{number:number;name:string;conclusion:string}[]}};
type PublicFetch = typeof fetch;
const encoder = new TextEncoder();
const shaPattern=/^[0-9a-f]{40}$/;
const repoPattern=/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;
const filePattern=/^[A-Za-z0-9_./-]+$/;

// Python's json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False)
// for the JSON-compatible, integer-only evidence schema emitted by v0.1.
export function canonicalEvidence(value:unknown):string {
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
 if(Array.isArray(value))return '['+value.map(canonicalEvidence).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalEvidence((value as Record<string,unknown>)[key])).join(',')+'}';
 throw Error('Unsupported evidence value');
}
async function digest(text:string){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(text));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
const byteLength=(text:string)=>encoder.encode(text).length;
const sourcePath=(path:string)=>filePattern.test(path)&&path.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');
const outcome=(checks:{status:string}[],scope:boolean)=>!scope||checks.some(c=>c.status==='CONTRADICTED')?'CHANGES_REQUESTED':checks.some(c=>c.status==='INSUFFICIENT')?'INCONCLUSIVE':'ACCEPTED';

async function publicText(url:string,fetcher:PublicFetch):Promise<string>{
 const response=await fetcher(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/vnd.github+json'}});
 if(!response.ok)throw Error(`GitHub returned HTTP ${response.status}`);
 const body=await response.arrayBuffer();if(body.byteLength>200000)throw Error('GitHub response exceeds verification limit');
 return new TextDecoder('utf-8',{fatal:true}).decode(body);
}
async function publicJson(url:string,fetcher:PublicFetch):Promise<Record<string,any>>{
 const data=JSON.parse(await publicText(url,fetcher));if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Unexpected GitHub response');return data;
}
const github=(job:Job)=>`https://api.github.com/repos/${job.repo}`;
const raw=(job:Job,commit:string,path:string)=>`https://raw.githubusercontent.com/${job.repo}/${commit}/${path}`;

export async function verifyJobEvidence(job:Job,fetcher:PublicFetch=fetch):Promise<EvidenceReport>{
 const checks:EvidenceCheck[]=[];
 const add=(label:string,ok:boolean,detail:string,url?:string)=>checks.push({label,status:ok?'pass':'fail',detail,url});
 const unavailable=(label:string,error:unknown,url?:string)=>checks.push({label,status:'unavailable',detail:error instanceof Error?error.message:'GitHub could not be reached',url});
 const baseValid=repoPattern.test(job.repo)&&shaPattern.test(job.base_sha)&&sourcePath(job.workflow_path)&&Array.isArray(job.allowed_paths)&&Array.isArray(job.requirements)&&Array.isArray(job.reviews)&&typeof job.repository_id==='number'&&Number.isSafeInteger(job.repository_id)&&job.repository_id>0;
 add('Pinned repository and base commit',baseValid,baseValid?'Record contains a canonical public repository identity and full base commit.':'The repository or base commit is malformed.');
 if(!baseValid)return {jobId:job.id,checkedAt:new Date().toISOString(),checks,verdict:'failed'};
 const prefix=github(job);
 try{const repository=await publicJson(prefix,fetcher);add('GitHub repository identity',repository.id===job.repository_id&&repository.private===false&&String(repository.full_name).toLowerCase()===job.repo.toLowerCase(),'Public repository ID and name match the frozen record.',`https://github.com/${job.repo}`);}catch(e){unavailable('GitHub repository identity',e,`https://github.com/${job.repo}`);}
 if(job.reviews.length===0)checks.push({label:'Patch evidence',status:'unavailable',detail:'No revision has been submitted for this commitment.'});
 for(const revision of job.reviews){
  try{await verifyRevision(job,revision,fetcher,add,unavailable);}
  catch{add(`Revision ${revision.revision}: record shape`,false,'Stored evidence could not be verified using the expected v0.1 schema.');}
 }
 if(job.status==='ACCEPTED'||job.status==='REFUNDED')add('Settlement recipient',job.recipient?.toLowerCase()===(job.status==='ACCEPTED'?job.author:job.client).toLowerCase(),'Recipient matches the fixed contract rule for the final outcome.');
 return {jobId:job.id,checkedAt:new Date().toISOString(),checks,verdict:checks.some(c=>c.status==='fail')?'failed':checks.some(c=>c.status==='unavailable')?'incomplete':'verified'};
}

async function verifyRevision(job:Job,r:Review,fetcher:PublicFetch,add:(label:string,ok:boolean,detail:string,url?:string)=>void,unavailable:(label:string,error:unknown,url?:string)=>void){
 const label=`Revision ${r.revision}`;
 const capture=r.evidence as Capture|undefined;
 const validHead=shaPattern.test(r.head_sha);
 if(!capture||!validHead||!Number.isSafeInteger(r.run_id)||!Number.isSafeInteger(r.attempt)){
  add(`${label}: record shape`,false,'The stored evidence or revision identity is malformed.');return;
 }
 try{
  const canonical=canonicalEvidence(capture);
  add(`${label}: onchain evidence digest`,await digest(canonical)===r.evidence_hash&&byteLength(canonical)===(r as Review&{evidence_bytes:number}).evidence_bytes,'Recomputed SHA-256 and byte count of the stored evidence.');
 }catch{add(`${label}: onchain evidence digest`,false,'The evidence cannot be encoded using the contract schema.');}
 const ci=capture.ci;
 const fields=capture.repo===job.repo&&capture.repository_id===job.repository_id&&capture.base_sha===job.base_sha&&capture.head_sha===r.head_sha&&ci?.run_id===r.run_id&&ci?.attempt===r.attempt&&ci?.workflow_id===job.workflow_id&&ci?.job_name===job.required_job&&ci?.conclusion==='success';
 add(`${label}: frozen identities`,!!fields,'Repository, commits, workflow and run IDs agree with the commitment.');
 if(!fields||!Array.isArray(capture.files)||capture.files.length<1||capture.files.length>4||!capture.files.every(f=>sourcePath(f.path)&&job.allowed_paths.includes(f.path))){
  add(`${label}: changed file scope`,false,'Captured file paths are missing or outside the frozen allowlist.');return;
 }
 add(`${label}: changed file scope`,true,'All captured files are within the frozen allowlist.');
 const workflow=capture.workflow;
 if(!workflow||typeof workflow.text!=='string'||typeof workflow.sha256!=='string'){
  add(`${label}: workflow proof`,false,'The stored workflow proof is missing.');return;
 }
 add(`${label}: workflow proof`,await digest(workflow.text)===workflow.sha256&&byteLength(workflow.text)===workflow.bytes&&workflow.sha256===job.workflow_sha256&&workflow.bytes===job.workflow_bytes,'Workflow bytes and SHA-256 match the frozen commitment.');
 const workflowUrl=raw(job,r.head_sha,job.workflow_path);
 try{const text=await publicText(workflowUrl,fetcher);add(`${label}: workflow on GitHub`,text===workflow.text,'Pinned workflow content matches the stored snapshot.',workflowUrl);}catch(e){unavailable(`${label}: workflow on GitHub`,e,workflowUrl);}
 for(const file of capture.files){
  for(const [phase,commit] of [['before',job.base_sha],['after',r.head_sha]] as const){
   const proof=file[phase],name=`${label}: ${file.path} ${phase}`;
   if(!proof||typeof proof.text!=='string'||typeof proof.sha256!=='string'){
    add(name,false,'Stored source proof is missing.');continue;
   }
   add(`${name} digest`,await digest(proof.text)===proof.sha256&&byteLength(proof.text)===proof.bytes,'Stored source bytes and SHA-256 agree.');
   const url=raw(job,commit,file.path);
   try{const text=await publicText(url,fetcher);add(`${name} on GitHub`,text===proof.text,'Commit-pinned GitHub source matches the onchain snapshot.',url);}catch(e){unavailable(`${name} on GitHub`,e,url);}
  }
 }
 const commitUrl=`${github(job)}/commits/${r.head_sha}?per_page=100`;
 try{
  const commit=await publicJson(commitUrl,fetcher);
  const files=commit.files as {filename:string;status:string}[]|undefined;
  const expected=capture.files.map(f=>f.path).sort();
  const actual=Array.isArray(files)?files.map(f=>f.filename).sort():[];
  add(`${label}: commit ancestry and scope`,commit.sha===r.head_sha&&commit.parents?.length===1&&commit.parents[0]?.sha===job.base_sha&&actual.length===expected.length&&actual.every((f,i)=>f===expected[i])&&files?.every(f=>f.status==='modified')===true,'GitHub commit is a direct child of the base and changes exactly the captured files.',`https://github.com/${job.repo}/commit/${r.head_sha}`);
 }catch(e){unavailable(`${label}: commit ancestry and scope`,e,`https://github.com/${job.repo}/commit/${r.head_sha}`);}
 const runPath=`${github(job)}/actions/runs/${r.run_id}/attempts/${r.attempt}`;
 const runUrl=`https://github.com/${job.repo}/actions/runs/${r.run_id}/attempts/${r.attempt}`;
 try{
  const run=await publicJson(runPath,fetcher);
  const started=Date.parse(String(run.run_started_at))/1000;
  add(`${label}: CI run`,run.id===r.run_id&&run.run_attempt===r.attempt&&run.head_sha===r.head_sha&&run.head_repository?.id===job.repository_id&&run.repository?.id===job.repository_id&&run.workflow_id===job.workflow_id&&String(run.path).split('@')[0]===job.workflow_path&&run.event==='push'&&run.status==='completed'&&run.conclusion==='success'&&started===ci.started_at&&started>=job.accepted_at&&typeof r.evidence_cutoff==='number'&&started<=r.evidence_cutoff,'Exact run attempt, timing, repository and workflow match the onchain record.',runUrl);
 }catch(e){unavailable(`${label}: CI run`,e,runUrl);}
 try{
  const result=await publicJson(runPath+'/jobs?per_page=100',fetcher);
  const jobs=result.jobs as Record<string,any>[]|undefined;
  const match=Array.isArray(jobs)?jobs.filter(j=>j.name===job.required_job):[];
  const j=match[0],steps=j?.steps as {number:number;name:string;conclusion:string;status:string}[]|undefined;
  add(`${label}: required CI job`,result.total_count===jobs?.length&&match.length===1&&j.id===ci.job_id&&j.run_id===r.run_id&&j.head_sha===r.head_sha&&j.status==='completed'&&j.conclusion==='success'&&Array.isArray(steps)&&steps.length===ci.steps.length&&steps.length>0&&steps.every((step,i)=>step.status==='completed'&&step.conclusion==='success'&&step.number===ci.steps[i].number&&step.name===ci.steps[i].name&&step.conclusion===ci.steps[i].conclusion),'Required job and every recorded step match the completed CI attempt.',runUrl);
 }catch(e){unavailable(`${label}: required CI job`,e,runUrl);}
 const quoted=(checks:Review['checks'])=>Array.isArray(checks)&&checks.length===job.requirements.length&&checks.every((c,i)=>c.id===`R${i+1}`&&['SUPPORTED','CONTRADICTED','INSUFFICIENT'].includes(c.status)&&typeof c.quote==='string'&&(c.status!=='SUPPORTED'||!!c.quote)&&(!c.quote||capture.files.some(f=>f.after.text.includes(c.quote))));
 if(r.status==='reviewed'){
  const assessed=Array.isArray(r.assessments)&&r.assessments.length>0&&r.assessments.every(a=>quoted((a.result as {checks:Review['checks']}).checks)&&outcome((a.result as {checks:NonNullable<Review['checks']>}).checks,(a.result as {scope_ok:boolean}).scope_ok)===a.result.outcome);
  add(`${label}: decision trail`,quoted(r.checks)&&outcome(r.checks!,r.scope_ok!)===r.outcome&&!!assessed&&r.assessments?.at(-1)?.result.outcome===r.outcome,'Requirement quotes appear in captured after-source; outcomes follow the contract rule. This does not rejudge correctness.');
 }
}
