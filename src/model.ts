export type Outcome='ACCEPTED'|'CHANGES_REQUESTED'|'INCONCLUSIVE';
export type Status='OPEN'|'IN_PROGRESS'|'REVIEW_READY'|'REVIEW_PENDING'|'CHANGES_REQUESTED'|'ACCEPTED'|'REFUNDED';
export type Job={id:string;title:string;repo:string;bug?:string;author:string;client:string;base_sha:string;requirements:string[];allowed_paths:string[];workflow_path:string;workflow_sha256:string;workflow_bytes:number;workflow_id:number;required_job:string;reward:string;accept_by:number;submit_by:number;expires_at:number;created_at:number;accepted_at:number;revision_due:number;status:Status;revision:number;challenge_until:number;reviews:Review[];recipient?:string;settled_at?:number};
export type Review={revision:number;head_sha:string;run_id:number;attempt:number;status:'submitted'|'reviewed';evidence_hash:string;outcome?:Outcome;checks?:{id:string;status:string;reason:string;quote:string}[];scope_ok?:boolean;challenge?:string;challenge_used:boolean;finalized_at:number;evidence?:Record<string,unknown>;assessments?:{at:number;kind:string;result:{outcome:Outcome}}[]};
export const names:Record<Status,string>={OPEN:'Awaiting author',IN_PROGRESS:'In progress',REVIEW_READY:'Ready for review',REVIEW_PENDING:'Challenge window',CHANGES_REQUESTED:'Changes requested',ACCEPTED:'Accepted',REFUNDED:'Refunded'};
export const short=(s:string)=>s.length>16?s.slice(0,8)+'…'+s.slice(-6):s;
export const demoJobs=():Job[]=>{const n=Math.floor(Date.now()/1000);return [
 {id:'PB-DEMO-001',title:'Prevent duplicate checkout requests',repo:'demo/checkout-service',requirements:['Repeated requests with the same idempotency key return the original order.','Requests with different keys create distinct orders.','Do not change authorization or disable input validation.'],allowed_paths:['src/orders.py'],status:'IN_PROGRESS' as Status,revision:0,reviews:[]},
 {id:'PB-DEMO-002',title:'Preserve timezone offsets in exports',repo:'demo/calendar-api',requirements:['Preserve the source UTC offset when exporting an event.','Continue rejecting malformed timestamps.'],allowed_paths:['src/export.py'],status:'REVIEW_READY' as Status,revision:1,reviews:[{revision:1,head_sha:'b'.repeat(40),run_id:202,attempt:1,status:'submitted' as const,evidence_hash:'d'.repeat(64),challenge_used:false,finalized_at:0}]},
 {id:'PB-DEMO-003',title:'Reject unsigned webhook callbacks',repo:'demo/webhook-relay',requirements:['Reject a callback when its signature is missing.','Keep valid signed callbacks working.'],allowed_paths:['src/webhooks.py'],status:'ACCEPTED' as Status,revision:1,reviews:[{revision:1,head_sha:'c'.repeat(40),run_id:303,attempt:1,status:'reviewed' as const,evidence_hash:'e'.repeat(64),outcome:'ACCEPTED' as const,scope_ok:true,checks:[{id:'R1',status:'SUPPORTED',quote:'if not signature: return 401',reason:'The missing-signature branch rejects the request.'},{id:'R2',status:'SUPPORTED',quote:'verify_signature(payload, signature)',reason:'The existing verification path is retained.'}],challenge_used:false,finalized_at:n-3600}]}
 ].map((j,i)=>({...j,author:'0x'+'2'.repeat(40),client:'0x'+'1'.repeat(40),base_sha:'a'.repeat(40),workflow_path:'.github/workflows/patchbond.yml',workflow_sha256:'f'.repeat(64),workflow_bytes:526,workflow_id:100,required_job:'acceptance',reward:['25000000000000000','15000000000000000','10000000000000000'][i],created_at:n-7200,accepted_at:n-3600,accept_by:n+3600,submit_by:n+86400,expires_at:n+172800,revision_due:n+86400,challenge_until:0}));};
export function formatGEN(v:string){return (Number(BigInt(v))/1e18).toLocaleString(undefined,{maximumFractionDigits:6});}
export function parseGEN(value:string):string {
 if(!/^\d+(\.\d{1,18})?$/.test(value))throw new Error('Use a decimal test-GEN amount with at most 18 decimal places.');
 const [whole,fraction='']=value.split('.'); const atto=BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
 if(atto<10n**15n||atto>10n**18n)throw new Error('The reward must be 0.001 to 1 test GEN.');
 return atto.toString();
}
export function nextDemo(job:Job,action:string,params:Record<string,string>,role:'client'|'author',timestamp:number):Job {
 const j=structuredClone(job);const ensure=(b:boolean,m:string)=>{if(!b)throw new Error(m);};
 const last=()=>j.reviews[j.reviews.length-1];
 if(action==='accept_job'){ensure(role==='author'&&j.status==='OPEN'&&timestamp<j.accept_by,'Only the assigned author can accept an open commitment.');j.status='IN_PROGRESS';j.accepted_at=timestamp;}
 else if(action==='submit_patch'){
  ensure(role==='author'&&['IN_PROGRESS','CHANGES_REQUESTED'].includes(j.status)&&j.revision<2&&timestamp<j.revision_due,'Submission is not available.');
  ensure(/^[0-9a-f]{40}$/.test(params.head)&&params.head!==j.base_sha&&!j.reviews.some(r=>r.head_sha===params.head),'Use a new full 40-character patch commit.');
  ensure(Number.isSafeInteger(Number(params.run))&&Number(params.run)>0&&Number.isInteger(Number(params.attempt))&&Number(params.attempt)>0&&Number(params.attempt)<=1000,'CI run and attempt must be positive integers.');
  j.revision++;j.reviews.push({revision:j.revision,head_sha:params.head,run_id:Number(params.run),attempt:Number(params.attempt),status:'submitted',evidence_hash:'SIMULATED — no live evidence digest',challenge_used:false,finalized_at:0});j.status='REVIEW_READY';
 }else if(action==='review_patch'||action==='challenge_review'){
  const challenge=action==='challenge_review';ensure(challenge?j.status==='REVIEW_PENDING'&&timestamp<j.challenge_until&&!last().challenge_used:j.status==='REVIEW_READY'&&timestamp+600<j.expires_at,'Review or challenge is not available.');
  if(challenge)ensure(!!params.statement?.trim(),'Explain why the existing evidence was misread.');
  const outcome=params.outcome as Outcome;ensure(['ACCEPTED','CHANGES_REQUESTED','INCONCLUSIVE'].includes(outcome),'Choose a simulated outcome.');
  const r=last();r.outcome=outcome;r.status='reviewed';r.scope_ok=true;r.checks=j.requirements.map((_,i)=>({id:'R'+(i+1),status:outcome==='ACCEPTED'?'SUPPORTED':outcome==='INCONCLUSIVE'?'INSUFFICIENT':'CONTRADICTED',reason:'Simulated outcome selected for this walkthrough; no validators were called.',quote:''}));
  r.assessments=[...(r.assessments||[]),{at:timestamp,kind:challenge?'challenge':'initial',result:{outcome}}];if(challenge){r.challenge=params.statement;r.challenge_used=true;}j.status='REVIEW_PENDING';j.challenge_until=timestamp+600;
 }else if(action==='finalize'){
  ensure(j.status==='REVIEW_PENDING'&&timestamp>=j.challenge_until,'The challenge window has not closed.');last().finalized_at=timestamp;
  if(last().outcome==='ACCEPTED'){j.status='ACCEPTED';j.recipient=j.author;}
  else if(j.revision===1&&timestamp+1200<j.expires_at){j.status='CHANGES_REQUESTED';j.revision_due=Math.min(timestamp+3600,j.expires_at-1200);}
  else{j.status='REFUNDED';j.recipient=j.client;}
 }else if(action==='recover_expired'){
  ensure(!['ACCEPTED','REFUNDED','REVIEW_PENDING'].includes(j.status),'Finalize a pending decision instead.');
  const end=j.status==='OPEN'?j.accept_by:['IN_PROGRESS','CHANGES_REQUESTED'].includes(j.status)?j.revision_due:j.expires_at;
  ensure(timestamp>=end,'The recovery deadline has not arrived.');j.status='REFUNDED';j.recipient=j.client;
 }else throw new Error('Unknown action.');
 return j;
}
