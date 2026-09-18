import type {createClient} from 'genlayer-js';
import {TransactionHashVariant,type Hash} from 'genlayer-js/types';
import {ActionError,formatError,isUserRejection} from './errors.ts';
export interface Provider{request(args:{method:string;params?:unknown[]}):Promise<unknown>;on?:(event:string,listener:()=>void)=>void;removeListener?:(event:string,listener:()=>void)=>void;providers?:Provider[];isMetaMask?:boolean}
export type WalletOption={info:{uuid:string;name:string};provider:Provider};
export type Session={address:`0x${string}`;provider:Provider;client:ReturnType<typeof createClient>};
export type Deployment={verified:boolean;address:string|null;chainId:number;sourceSha256:string;version:string;network:'studionet'};
export type Pending={hash:`0x${string}`;address:string;account:string;method:string;jobId:string;submittedAt:number};
export const pendingKey='patchbond:pending:61999';
export const lastTransactionKey='patchbond:last-transaction:61999';
let reader:Promise<ReturnType<typeof createClient>>|undefined;
const getReader=()=>reader??=import('genlayer-js').then(({createClient,chains})=>createClient({chain:chains.studionet}));
const isHash=(value:unknown):value is `0x${string}`=>typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value);
let memoryPending:Pending|null=null;

// A fresh guard is created only by an explicit user action, not by polling.
// It also blocks SDK ABI-fallback paths from invoking the wallet twice.
export function singleSendProvider(provider:Provider,onHash:(hash:`0x${string}`)=>void){
 let requested=false;
 const guarded:Provider={request:async request=>{
  if(!['eth_sendTransaction','eth_sendRawTransaction','eth_signTransaction'].includes(request.method))return provider.request(request);
  if(requested)throw new ActionError('An additional wallet submission was blocked. Check wallet Activity and the StudioNet explorer before retrying.');
  requested=true;
  const result=await provider.request(request);
  if(request.method!=='eth_signTransaction'&&isHash(result))onHash(result);
  return result;
 }};
 return {provider:guarded,wasRequested:()=>requested};
}
export function discoverWallets(listener:(wallets:WalletOption[])=>void){
 const found:WalletOption[]=[];
 const announce=(e:Event)=>{const w=(e as CustomEvent<WalletOption>).detail;if(w?.info?.uuid&&typeof w.provider?.request==='function'&&!found.some(x=>x.provider===w.provider)){found.push(w);listener([...found]);}};
 window.addEventListener('eip6963:announceProvider',announce);window.dispatchEvent(new Event('eip6963:requestProvider'));
 const timer=setTimeout(()=>{const p=(window as unknown as {ethereum?:Provider}).ethereum;if(p){for(const provider of p.providers||[p])if(!found.some(x=>x.provider===provider))found.push({provider,info:{uuid:'legacy-'+found.length,name:provider.isMetaMask?'MetaMask':'Browser wallet'}});listener([...found]);}},400);
 return()=>{clearTimeout(timer);window.removeEventListener('eip6963:announceProvider',announce);};
}
export async function connect(w:WalletOption):Promise<Session>{
 const {createClient,chains}=await import('genlayer-js');const c={...chains.studionet,blockExplorers:{default:{name:'GenLayer Studio Explorer',url:'https://explorer-studio.genlayer.com'}}};
 await w.provider.request({method:'eth_requestAccounts'});
 if(Number(await w.provider.request({method:'eth_chainId'}))!==c.id){try{await w.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+c.id.toString(16)}]});}catch(e){if((e as {code?:number}).code!==4902)throw e;await w.provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x'+c.id.toString(16),chainName:c.name,nativeCurrency:c.nativeCurrency,rpcUrls:c.rpcUrls.default.http,blockExplorerUrls:[c.blockExplorers!.default.url]}]});}}
 const accounts=await w.provider.request({method:'eth_accounts'}) as string[];if(!/^0x[0-9a-fA-F]{40}$/.test(accounts?.[0]||''))throw new Error('No wallet account selected.');
 const address=accounts[0].toLowerCase() as `0x${string}`;const session={address,provider:w.provider,client:createClient({chain:c,account:address,provider:w.provider as never})};await verifySession(session);return session;
}
export async function verifySession(s:Session){const accounts=await s.provider.request({method:'eth_accounts'}) as string[];const chain=await s.provider.request({method:'eth_chainId'});if(accounts?.[0]?.toLowerCase()!==s.address||Number(chain)!==61999)throw new Error('Your account or network changed. Reconnect to StudioNet before signing.');}
export async function read<T>(d:Deployment,method:string,args:unknown[]=[]):Promise<T>{if(!d.verified||!d.address)throw new Error('No verified deployment is configured.');const c=await getReader();const value=await c.readContract({address:d.address as `0x${string}`,functionName:method,args:args as never[],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});return JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?Number(v):v)) as T;}
export async function verifyDeployment(d:Deployment){
 if(!d.verified||!/^0x[0-9a-fA-F]{40}$/.test(d.address||'')||d.chainId!==61999||d.network!=='studionet'||d.version!=='patchbond.v0.1')throw new Error('Live signing is unavailable until the deployment is verified.');
 const config=await read<{version:string;challenge_seconds:number;fee_bps:number}>(d,'get_config');if(config.version!==d.version||config.challenge_seconds!==600||config.fee_bps!==0)throw new Error('Contract policy does not match this release.');
 const code=await(await getReader()).getContractCode(d.address as `0x${string}`);const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code.replaceAll('\r\n','\n')));const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==d.sourceSha256)throw new Error('Onchain source does not match this release. Signing is blocked.');
}
export function receiptOutcome(receipt:unknown):'pending'|'success'|'error'{
 if(!receipt||typeof receipt!=='object')return 'pending';const r=receipt as Record<string,unknown>;
 const status=String(r.statusName??r.status_name??r.status??'').toUpperCase();if(['CANCELED','CANCELLED','DROPPED'].includes(status))return 'error';if(status!=='FINALIZED')return 'pending';
 const consensus=(r.consensusData??r.consensus_data) as Record<string,unknown>|undefined;const raw=consensus?.leaderReceipt??consensus?.leader_receipt;const lead=(Array.isArray(raw)?[...raw].reverse().find(x=>x?.mode==='leader')??raw.at(-1):raw) as Record<string,unknown>|undefined;
 const execution=String(lead?.execution_result??lead?.executionResult??'').toUpperCase();const normalized=String(r.txExecutionResultName??r.tx_execution_result_name??'').toUpperCase();
 if(['ERROR','FAILURE','VM_ERROR'].includes(execution)||normalized==='FINISHED_WITH_ERROR')return 'error';
 return execution==='SUCCESS'||normalized==='FINISHED_WITH_RETURN'?'success':'pending';
}
export async function checkPending(p:Pending){if(!isHash(p.hash))throw new Error('Invalid pending transaction hash.');const r=await(await getReader()).getTransaction({hash:p.hash as Hash});const result=receiptOutcome(r);if(result!=='pending'){const current=localStorage.getItem(pendingKey);if(current&&JSON.parse(current).hash===p.hash){localStorage.setItem(lastTransactionKey,JSON.stringify({...p,outcome:result}));localStorage.removeItem(pendingKey);}if(memoryPending?.hash===p.hash)memoryPending=null;}return result;}
export async function send(d:Deployment,s:Session,method:string,args:unknown[],value:string,onPending:(p:Pending)=>void){
 if(!navigator.locks)throw new Error('Use a current browser over HTTPS to coordinate signing safely.');
 const counts:Record<string,number>={create_job:1,accept_job:1,submit_patch:4,review_patch:2,challenge_review:3,finalize:1,recover_expired:1,withdraw:0};
 if(!(method in counts)||args.length!==counts[method]||(method!=='create_job'&&BigInt(value)!==0n))throw new Error('Invalid contract action or value.');
 return navigator.locks.request('patchbond:sign:61999',{ifAvailable:true},async lock=>{
  if(!lock||memoryPending||localStorage.getItem(pendingKey))throw new Error('Check the pending transaction before signing again.');
  let phase='Deployment verification',known:Pending|undefined;
  const remember=(hash:`0x${string}`)=>{
   if(known){if(known.hash!==hash)throw new Error('Conflicting transaction hashes returned.');return;}
   known={hash,address:d.address!,account:s.address,method,jobId:method==='create_job'?JSON.parse(String(args[0])).id:String(args[0]??''),submittedAt:Date.now()};
   memoryPending=known;onPending(known);localStorage.setItem(pendingKey,JSON.stringify(known));
  };
  const guard=singleSendProvider(s.provider,remember);
  try{
   const response=await fetch('/deployment.json',{cache:'no-store'});if(!response.ok)throw new Error('Cannot check the active deployment.');const active=await response.json() as Deployment;
   if(active.address!==d.address||active.sourceSha256!==d.sourceSha256||!active.verified)throw new Error('Deployment changed. Reload before signing.');
   await verifyDeployment(d);phase='Wallet account/network check';await verifySession(s);
   phase='Balance check';if(method==='create_job'&&await s.client.getBalance({address:s.address})<BigInt(value))throw new Error('Insufficient simulated GEN. Use the account faucet at studio.genlayer.com for this test wallet. Never send real funds.');
   phase='Browser storage check';localStorage.setItem(pendingKey+':probe','1');localStorage.removeItem(pendingKey+':probe');
   // Parse before asking the wallet so malformed metadata cannot lose a sent hash.
   if(method==='create_job'&&typeof JSON.parse(String(args[0])).id!=='string')throw new Error('A commitment ID is required.');
   phase='Transaction preparation';const {createClient,chains}=await import('genlayer-js');
   const writer=createClient({chain:chains.studionet,account:s.address,provider:guard.provider as never});
   const hash=await writer.writeContract({address:d.address as `0x${string}`,functionName:method,args:args as never[],value:BigInt(value)});
   if(!isHash(hash))throw new Error('No valid transaction hash was returned.');
   remember(hash);return known!;
  }catch(error){
   const detail=formatError(error);
   if(known)throw new ActionError(`A transaction hash was received: ${known.hash}. Keep it and check its execution result; do not resubmit. ${detail}`);
   if(guard.wasRequested())throw new ActionError(isUserRejection(error)?detail:`Wallet submission returned no valid transaction hash. Its status is unknown; check wallet Activity and the StudioNet explorer before any manual retry. Nothing was automatically resubmitted. ${detail}`);
   throw new ActionError(`${phase} failed before any wallet submission. ${detail}`);
  }
 });
}
