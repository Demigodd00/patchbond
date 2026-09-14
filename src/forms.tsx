import {useState,type FormEvent} from 'react';
import {parseGEN,type Job} from './model';

export function NewCommitment({demo,client,busy,onSubmit}:{demo:boolean;client:string;busy:boolean;onSubmit:(terms:Record<string,unknown>,reward:string)=>Promise<void>}){
 const [error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');const f=new FormData(e.currentTarget),s=(k:string)=>String(f.get(k)||'').trim();
  try{
   const reward=parseGEN(s('reward')),requirements=s('requirements').split('\n').map(x=>x.trim()).filter(Boolean),paths=s('paths').split('\n').map(x=>x.trim()).filter(Boolean);
   if(requirements.length<1||requirements.length>6||new Set(requirements).size!==requirements.length||requirements.some(x=>x.length>700))throw Error('Use 1–6 distinct requirements, at most 700 characters each.');
   if(paths.length<1||paths.length>4||new Set(paths).size!==paths.length||paths.some(p=>!/^[-A-Za-z0-9_./]+$/.test(p)||p.startsWith('.github/')||p.split('/').some(x=>!x||x==='.'||x==='..')))throw Error('Use 1–4 distinct relative file paths, with no wildcards, traversal or .github files.');
   const author=demo?'0x'+'2'.repeat(40):s('author').toLowerCase();if(author===client.toLowerCase()||/^0x0{40}$/.test(author))throw Error('The assigned author must be a different, nonzero wallet.');
   const n=Math.floor(Date.now()/1000);
   await onSubmit({id:s('id'),title:s('title'),repo:s('repo'),bug:s('bug'),base_sha:s('base'),author,requirements,allowed_paths:paths,workflow_path:s('workflow'),workflow_sha256:s('digest'),workflow_bytes:Number(s('bytes')),workflow_id:Number(s('workflow_id')),required_job:s('job'),accept_by:n+3600,submit_by:n+Number(s('hours'))*3600},reward);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 return <form onSubmit={submit} className="form-stack">
  <p>The client funds a fixed reward. Terms are public and immutable. The author has one hour to accept.</p>
  <div className="form-pair"><label>Commitment ID<input name="id" required pattern="PB-[A-Z0-9\-]{3,36}" placeholder="PB-CHECKOUT-001" maxLength={39}/></label><label>Fixed reward · test GEN<input name="reward" required inputMode="decimal" defaultValue="0.01"/></label></div>
  <label>Title<input name="title" required maxLength={100} placeholder="Prevent duplicate checkout requests"/></label>
  <label>Public GitHub repository<input name="repo" required pattern="[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+" placeholder="owner/repository"/></label>
  <label>Full base commit<input name="base" required pattern="[0-9a-f]{40}" placeholder="40-character commit SHA" defaultValue={demo?'a'.repeat(40):''}/></label>
  {!demo&&<label>Assigned author wallet<input name="author" required pattern="0x[0-9a-fA-F]{40}" placeholder="0x…" autoComplete="off"/></label>}
  <label>Bug and reproduction steps<textarea name="bug" required maxLength={3000} rows={3} placeholder="Describe the failure, expected behaviour and how to reproduce it."/></label>
  <label>Mandatory requirements · one per line<textarea name="requirements" required rows={4} placeholder="Repeated requests with the same key return the original order."/></label>
  <label>Allowed existing files · one per line<textarea name="paths" required rows={2} placeholder="src/orders.py"/></label>
  <details open={!demo}><summary>Pinned CI policy{demo?' · simulated defaults':''}</summary><div className="form-stack">
   <label>Workflow path<input name="workflow" required pattern="\.github/workflows/[A-Za-z0-9_-]+\.ya?ml" defaultValue=".github/workflows/patchbond.yml"/></label>
   <label>Workflow SHA-256<input name="digest" required pattern="[0-9a-f]{64}" defaultValue={demo?'f'.repeat(64):''}/></label>
   <div className="form-pair"><label>Exact workflow bytes<input name="bytes" required type="number" min="1" max="12000" defaultValue={demo?526:undefined}/></label><label>GitHub workflow ID<input name="workflow_id" required type="number" min="1" max="9007199254740991" defaultValue={demo?100:undefined}/></label></div>
   <label>Exact required job name<input name="job" required maxLength={100} defaultValue="acceptance"/></label>
  </div></details>
  <label>Patch due after creation<select name="hours" defaultValue="24"><option value="2">2 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></label>
  <label className="checkbox"><input type="checkbox" required/>I understand the fixed terms, deadlines and public evidence policy.</label>
  {error&&<div className="feedback error" role="alert">{error}</div>}
  <button className="primary" disabled={busy}>{busy?'Please wait…':demo?'Create simulated commitment':'Sign & fund commitment'}</button>
 </form>;
}

export function PatchForm({job,demo,busy,onSubmit}:{job:Job;demo:boolean;busy:boolean;onSubmit:(p:Record<string,string>)=>Promise<void>}){
 const [head,setHead]=useState(''),[run,setRun]=useState(''),[error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');const f=new FormData(e.currentTarget);try{await onSubmit({head,run,attempt:String(f.get('attempt'))});}catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <form className="form-stack" onSubmit={submit}><p>Submit one direct-child commit of the frozen base. The workflow must be unchanged and the registered CI job must pass on this exact commit.</p>
  {demo&&<button type="button" className="secondary" onClick={()=>{setHead((job.revision?'c':'b').repeat(40));setRun(String(1000+job.revision));}}>Use simulated patch identifiers</button>}
  <label>Full patch commit<input required pattern="[0-9a-f]{40}" value={head} onChange={e=>setHead(e.target.value.trim())}/></label>
  <div className="form-pair"><label>GitHub Actions run ID<input required type="number" min="1" max="9007199254740991" value={run} onChange={e=>setRun(e.target.value)}/></label><label>Attempt<input name="attempt" required type="number" min="1" max="1000" defaultValue="1"/></label></div>
  <label className="checkbox"><input type="checkbox" required/>I attest that these identifiers refer to this patch and its required CI run.</label>
  {error&&<div className="feedback error" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy?'Please wait…':demo?'Record simulated evidence':`Sign evidence · revision ${job.revision+1}`}</button>
 </form>;
}

export function ReviewForm({demo,challenge,busy,onSubmit}:{demo:boolean;challenge:boolean;busy:boolean;onSubmit:(p:Record<string,string>)=>Promise<void>}){
 const [error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');const f=new FormData(e.currentTarget);try{await onSubmit({outcome:String(f.get('outcome')||''),statement:String(f.get('statement')||'')});}catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <form className="form-stack" onSubmit={submit}><p>{demo?'Select an outcome to explore the rules. This does not call validators or verify code.':'GenLayer validators retrieve the registered evidence independently. Only their agreed result can advance the contract.'}</p>
  {challenge&&<label>Reason for reconsideration<textarea name="statement" required maxLength={1500} rows={5} placeholder="Explain how the existing code or CI evidence was misread. New claims are not evidence."/></label>}
  {demo&&<label>Simulated outcome<select name="outcome"><option value="ACCEPTED">Accepted</option><option value="CHANGES_REQUESTED">Changes requested</option><option value="INCONCLUSIVE">Insufficient evidence</option></select></label>}
  {error&&<div className="feedback error" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy?'Please wait…':challenge?'Request reassessment':demo?'Simulate GenLayer review':'Sign review request'}</button>
 </form>;
}
