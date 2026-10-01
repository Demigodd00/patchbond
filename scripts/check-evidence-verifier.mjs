import {read,verifyDeployment} from '../src/chain.ts';
import {verifyJobEvidence} from '../src/verify-evidence.ts';
import deployment from '../public/deployment.json' with {type:'json'};

const ids=['PB-STUDIO-HAPPY-001','PB-STUDIO-CORRECT-001'];
await verifyDeployment(deployment);
const results=[];
for(const id of ids){
 const job=await read(deployment,'get_job',[id]);
 if(job.id!==id)throw Error(`Wrong chain record for ${id}`);
 const report=await verifyJobEvidence(job);
 results.push({id,status:job.status,revisions:job.reviews.length,verdict:report.verdict,checks:report.checks.length,failures:report.checks.filter(c=>c.status!=='pass')});
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),network:'StudioNet',contract:deployment.address,checks:'Finalized contract state, public GitHub source and CI; no wallet request or new transaction',results},null,2));
if(results.some(r=>r.verdict!=='verified'))process.exitCode=1;
