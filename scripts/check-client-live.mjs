// Node 24: exercise the actual browser-client read/recovery functions against
// finalized StudioNet receipts, using an ephemeral in-memory storage adapter.
// This does not open, control, or sign with a browser extension wallet.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifyDeployment,checkPending,pendingKey,lastTransactionKey} from '../src/chain.ts';
const deployment=JSON.parse(fs.readFileSync(new URL('../public/deployment.json',import.meta.url),'utf8'));
await verifyDeployment(deployment);
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const checks=[];
for(const [hash,expected] of [
 ['0xe5a9e0feb0c3d292f701cf201b000eafec74225deba8734210d7507f89ee047a','success'],
 ['0x9c55cb0af7cf6dc209cfa2dfb4be41824bd63c9b1dfddfc99d101bdff745fac5','error']
]) {
 const p={hash,address:deployment.address,account:'0x7D2f45C228db908a6690e112D80777495CBC15b7',method:'finalize',jobId:'PB-STUDIO-HAPPY-001',submittedAt:0};
 memory.set(pendingKey,JSON.stringify(p));
 const result=await checkPending(p);
 assert.equal(result,expected);assert.equal(memory.has(pendingKey),false);
 assert.equal(JSON.parse(memory.get(lastTransactionKey)).outcome,expected);
 checks.push({hash,expected,actual:result,passed:true});
}
const report={at:new Date().toISOString(),scope:'Actual client read/recovery functions; live RPC; in-memory storage; no browser wallet signature',deploymentIdentityVerified:true,checks};
fs.writeFileSync(new URL('../public/client-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
