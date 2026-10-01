import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,ExternalLink,RefreshCw,ShieldCheck,ShieldX} from 'lucide-react';
import {read,verifyDeployment,type Deployment} from './chain';
import {formatError} from './errors';
import type {Job} from './model';
import {verifyJobEvidence,type EvidenceReport} from './verify-evidence';
import './verification.css';

export function EvidenceVerification({jobId,deployment}:{jobId:string;deployment:Deployment|null}){
 const [report,setReport]=useState<EvidenceReport|null>(null),[running,setRunning]=useState(false),[error,setError]=useState('');
 const started=useRef(false);
 const link=new URLSearchParams({mode:'live',job:jobId,verify:'1'});
 async function verify(){
  if(running)return;
  setRunning(true);setError('');setReport(null);
  try{
   if(!deployment)throw Error('Verified StudioNet deployment is not available yet.');
   await verifyDeployment(deployment);
   const fresh=await read<Job>(deployment,'get_job',[jobId]);
   if(fresh.id!==jobId)throw Error('The chain returned a different commitment.');
   setReport(await verifyJobEvidence(fresh));
  }catch(e){setError(formatError(e));}finally{setRunning(false);}
 }
 useEffect(()=>{if(!started.current&&new URLSearchParams(location.search).get('verify')==='1'&&deployment){started.current=true;void verify();}},[deployment]);
 const passed=report?.checks.filter(c=>c.status==='pass').length||0;
 const failed=report?.checks.filter(c=>c.status==='fail').length||0;
 const unavailable=report?.checks.filter(c=>c.status==='unavailable').length||0;
 return <section className="panel evidence-verifier" aria-label="Public evidence verifier">
  <div className="panel-title"><ShieldCheck size={19}/><h2>Verify public evidence</h2><span>Read only</span></div>
  <p>Check this commitment against finalized StudioNet state and the exact GitHub commits and CI run recorded with each revision. No wallet is needed.</p>
  <div className="button-row"><button className="secondary" disabled={running||!deployment?.verified} onClick={()=>void verify()}>{running?<RefreshCw size={16} className="spin"/>:<ShieldCheck size={16}/>} {running?'Checking evidence…':report?'Check again':'Verify evidence'}</button><a className="verifier-link" href={`?${link}`}>Link to this verification</a></div>
  {error&&<p className="verifier-error" role="alert">{error}</p>}
  {report&&<>
   <div className={'verifier-result '+report.verdict} role="status">{report.verdict==='verified'?<CheckCircle2 size={22}/>:<ShieldX size={22}/>}<div><strong>{report.verdict==='verified'?'Evidence integrity verified':report.verdict==='failed'?'Evidence check failed':'Verification incomplete'}</strong><span>{passed} matched · {failed} mismatched · {unavailable} unavailable · Checked {new Date(report.checkedAt).toLocaleString()}</span></div></div>
   <p className="verifier-limit">These checks confirm record integrity, source provenance, and CI identity. They do not independently decide whether a patch satisfies the requirements or prove that CI tests were sufficient.</p>
   <details className="verifier-detail" open={report.verdict!=='verified'}><summary>See {report.checks.length} individual checks</summary><ul>{report.checks.map((check,i)=><li key={i} className={'verify-'+check.status}><span className="verify-mark" aria-label={check.status}>{check.status==='pass'?'✓':check.status==='fail'?'×':'?'}</span><div><strong>{check.label}</strong><p>{check.detail}</p>{check.url&&<a href={check.url} target="_blank" rel="noreferrer">View source <ExternalLink size={12}/></a>}</div></li>)}</ul></details>
  </>}
 </section>;
}
