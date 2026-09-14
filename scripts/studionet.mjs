// Explicitly scoped operator for disposable StudioNet test accounts only.
// Never imports a browser wallet or an existing user keystore.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createAccount, generatePrivateKey, createClient, chains} from 'genlayer-js';
import {TransactionHashVariant} from 'genlayer-js/types';
const dir = new URL('../.local/', import.meta.url);
fs.mkdirSync(dir, {recursive:true});
const accountFile = new URL('studionet-accounts.json', dir);
if (!fs.existsSync(accountFile)) {
  const keys = Object.fromEntries(['client','author','observer'].map(role=>[role,generatePrivateKey()]));
  fs.writeFileSync(accountFile, JSON.stringify(keys), {flag:'wx',mode:0o600});
}
const keys = JSON.parse(fs.readFileSync(accountFile,'utf8'));
const clients = Object.fromEntries(Object.entries(keys).map(([role,key])=>[role,createClient({chain:chains.studionet,account:createAccount(key)})]));
const file = new URL('studionet-state.json',dir);
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {network:'studionet',chainId:61999,transactions:[]};
const json = x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const save = ()=>fs.writeFileSync(file,json(state));
const output = x=>console.log(json(x));
const read = (method,args=[])=>clients.client.readContract({address:state.address,functionName:method,args,transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
const [command,...argv] = process.argv.slice(2);
if (Number(await clients.client.request({method:'eth_chainId'}))!==61999) throw Error('Wrong network');
const addresses=Object.fromEntries(Object.entries(clients).map(([role,c])=>[role,c.account.address]));
if(command==='accounts') output(addresses);
else if(command==='balance') output(await clients.client.getBalance({address:argv[0]||addresses.client}));
else if(command==='fund') {
  // Studio's built-in simulated faucet; never runs against a production/testnet EVM RPC.
  const role=argv[0]||'client';if(!addresses[role])throw Error('Unknown isolated test account');
  output(await clients.client.request({method:'sim_fundAccount',params:[addresses[role],100000000000000000]}));
}
else if(command==='deploy') {
  if(state.deployHash) throw Error('Deployment already sent; inspect receipt instead of duplicating');
  const code=fs.readFileSync(new URL('../contracts/patch_bond.py',import.meta.url),'utf8').replaceAll('\r\n','\n');
  state.sourceSha256=crypto.createHash('sha256').update(code).digest('hex');
  state.deployHash=await clients.client.deployContract({code,args:[]});save();output({hash:state.deployHash,sourceSha256:state.sourceSha256});
} else if(command==='receipt') {
  const hash=argv[0]||state.deployHash;
  const r=await clients.client.getTransaction({hash});
  fs.writeFileSync(new URL(hash+'.json',dir),json(r));
  const raw=r.consensusData??r.consensus_data;
  const lr=raw?.leaderReceipt??raw?.leader_receipt;
  const leaders=Array.isArray(lr)?lr:[lr];
  output({hash,status:r.statusName??r.status_name??r.status,to:r.toAddress??r.to_address??r.to,contractAddress:r.contractAddress??r.contract_address,
    leaders:leaders.filter(Boolean).map(l=>({execution:l.executionResult??l.execution_result,result:l.result,mode:l.mode}))});
} else if(command==='bind') {
  if(state.address) throw Error('Already bound');
  const address=argv[0];if(!/^0x[0-9a-fA-F]{40}$/.test(address))throw Error('Invalid address');
  const code=await clients.client.getContractCode(address);
  const hash=crypto.createHash('sha256').update(code.replaceAll('\r\n','\n')).digest('hex');
  if(hash!==state.sourceSha256) throw Error('Source mismatch');
  const schema=await clients.client.getContractSchema(address);
  state.address=address;state.schema=schema;state.accounts=addresses;save();output({address,hash,schema});
} else if(command==='read') {
  const [method,...args]=argv;
  output(await clients.client.readContract({address:state.address,functionName:method,args:args.map(x=>{try{return JSON.parse(x)}catch{return x}}),transactionHashVariant:TransactionHashVariant.LATEST_FINAL}));
} else if(command==='summary') {
  const rows=await read('list_jobs',[0,50]);
  const result=[];
  for(const row of rows){const job=await read('get_job',[row.id]);result.push({id:job.id,status:job.status,revision:job.revision,challenge_until:job.challenge_until,accept_by:job.accept_by,reviews:job.reviews.map(r=>({outcome:r.outcome,checks:r.checks,challenge_used:r.challenge_used,head_sha:r.head_sha}))});}
  output({now:Math.floor(Date.now()/1000),jobs:result});
} else if(command==='balances') {
  const result={at:new Date().toISOString(),balances:{}};
  for(const [role,address] of Object.entries({...addresses,contract:state.address}))result.balances[role]=String(await clients.client.getBalance({address}));
  result.accounting=await read('get_accounting',[addresses.author]);
  if(argv[0]){state.balanceChecks??={};state.balanceChecks[argv[0]]=result;save();}
  output(result);
} else if(command==='expect-error') {
  const [hash,message]=argv;if(!state.transactions.some(t=>t.hash===hash)||!message)throw Error('Unknown recorded transaction');
  state.expectedErrors??={};state.expectedErrors[hash]=message;save();output({hash,expectedError:message});
} else if(command==='report') {
  // Generate only public evidence. Never serializes keys or private operator state.
  const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
  const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  const jobs=[];
  for(const row of await read('list_jobs',[0,50])) {
    const job=await read('get_job',[row.id]);
    for(const revision of job.reviews) {
      const captured=JSON.stringify(canonical(revision.evidence));
      if(sha256(captured)!==revision.evidence_hash||Buffer.byteLength(captured)!==revision.evidence_bytes)throw Error('Captured evidence hash mismatch');
      for(const proof of [revision.evidence.workflow,...revision.evidence.files.flatMap(f=>[f.before,f.after])])if(sha256(proof.text)!==proof.sha256||Buffer.byteLength(proof.text)!==proof.bytes)throw Error('Source proof mismatch');
    }
    jobs.push(job);
  }
  const transactions=[],transfers=[];
  for(const entry of [{hash:state.deployHash,method:'deploy',role:'client'},...state.transactions]) {
    const receiptFile=new URL(entry.hash+'.json',dir);
    let r=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile,'utf8')):null;
    if(!r||String(r.statusName??r.status).toUpperCase()!=='FINALIZED'){r=await clients.client.getTransaction({hash:entry.hash});fs.writeFileSync(receiptFile,json(r));await new Promise(resolve=>setTimeout(resolve,1500));}
    const data=r.consensus_data??r.consensusData;const lr=data?.leader_receipt??data?.leaderReceipt;
    const leader=Array.isArray(lr)?[...lr].reverse().find(l=>l.mode==='leader'):lr;
    const status=String(r.statusName??r.status).toUpperCase();
    const execution=leader?.execution_result??leader?.executionResult;
    const expectedError=state.expectedErrors?.[entry.hash];
    const error=leader?.result?.payload;
    const passed=status==='FINALIZED'&&(expectedError?execution==='ERROR'&&typeof error==='string'&&error.includes(expectedError):execution==='SUCCESS');
    if(entry.method==='withdraw'&&execution==='SUCCESS')for(const hash of r.triggered_transactions||[]){
      const transferFile=new URL(hash+'.json',dir);
      let transfer=fs.existsSync(transferFile)?JSON.parse(fs.readFileSync(transferFile,'utf8')):null;
      if(!transfer||String(transfer.statusName??transfer.status).toUpperCase()!=='FINALIZED'){transfer=await clients.client.getTransaction({hash});fs.writeFileSync(transferFile,json(transfer));}
      transfers.push({hash,url:'https://explorer-studio.genlayer.com/transactions/'+hash,parent:entry.hash,status:String(transfer.statusName??transfer.status).toUpperCase(),from:transfer.from_address,to:transfer.to_address,value:String(transfer.value),credited:transfer.value_credited});
    }
    transactions.push({hash:entry.hash,url:'https://explorer-studio.genlayer.com/transactions/'+entry.hash,method:entry.method,role:entry.role,status,execution,passed,expectedError:expectedError||null,error:execution==='ERROR'?error:null,votes:data?.votes,leaderOnly:r.leader_only});
  }
  const report={generatedAt:new Date().toISOString(),network:'StudioNet',chainId:61999,scope:'Hosted sandbox execution and simulated native GEN; not production funds or a security audit',contract:state.address,sourceSha256:state.sourceSha256,fixtureRepository:'https://github.com/Demigodd00/patchbond-studionet-fixtures',transactions,jobs,balanceChecks:state.balanceChecks||{},limitations:['Browser extension wallet signing has not been exercised in this run; dedicated SDK software accounts were used.','StudioNet storage and balances may be reset by its operator.','GitHub source availability, runner dependencies and validator liveness remain external dependencies.','Smart-contract recipients and real-money production settlement are outside scope.']};
  report.transfers=transfers;
  fs.writeFileSync(new URL('../public/verification.json',import.meta.url),json(report)+'\n');
  output({jobs:jobs.map(j=>({id:j.id,status:j.status,revision:j.revision})),transactionChecks:transactions.map(t=>({hash:t.hash,method:t.method,passed:t.passed,execution:t.execution})),evidenceHashesVerified:true});
} else if(command==='write') {
  const [role,method,value='0',...params]=argv;
  if(!clients[role])throw Error('Unknown test role');
  const args=params.map(x=>{try{return JSON.parse(x)}catch{return x}});
  const hash=await clients[role].writeContract({address:state.address,functionName:method,args,value:BigInt(value)});
  state.transactions.push({hash,role,method,args,at:new Date().toISOString()});save();output({hash,role,method});
} else if(command==='create') {
  const [id,title,acceptSeconds='3600']=argv;
  const fixture=JSON.parse(fs.readFileSync(new URL('../tests/studionet-fixture.json',import.meta.url),'utf8'));
  const now=Math.floor(Date.now()/1000);
  const terms={...fixture,id,title,author:addresses.author,accept_by:now+Number(acceptSeconds),submit_by:now+14400};
  const hash=await clients.client.writeContract({address:state.address,functionName:'create_job',args:[JSON.stringify(terms)],value:10n**16n});
  state.transactions.push({hash,role:'client',method:'create_job',args:[terms],at:new Date().toISOString()});save();output({hash,id});
} else if(command==='state') output(state);
else throw Error('Unknown command');
