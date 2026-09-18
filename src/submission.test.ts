import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Deployment,Session,Provider,Pending} from './chain';
const mocks=vi.hoisted(()=>({read:vi.fn(),code:vi.fn(),receipt:vi.fn(),write:vi.fn()}));
vi.mock('genlayer-js',()=>({createClient:(config:{provider?:Provider})=>config.provider?{writeContract:(args:unknown)=>mocks.write(config.provider,args)}:{readContract:mocks.read,getContractCode:mocks.code,getTransaction:mocks.receipt},chains:{studionet:{id:61999}}}));
let chain:typeof import('./chain');
let storage:Map<string,string>,s:Session,request:ReturnType<typeof vi.fn>,onPending:ReturnType<typeof vi.fn>;
const hash=('0x'+'a'.repeat(64)) as `0x${string}`,address=('0x'+'b'.repeat(40)) as `0x${string}`;
const source='contract fixture';
const d:Deployment={address,verified:true,chainId:61999,network:'studionet',version:'patchbond.v0.1',sourceSha256:''};
beforeEach(async()=>{
 d.sourceSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 vi.resetModules();chain=await import('./chain');storage=new Map();onPending=vi.fn();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 vi.stubGlobal('navigator',{locks:{request:async(_name:string,_options:unknown,fn:(lock:unknown)=>unknown)=>fn({name:'lock'})}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>d}));
 request=vi.fn(async({method}:{method:string})=>method==='eth_accounts'?[address]:method==='eth_chainId'?'0xf22f':hash);
 s={address,provider:{request},client:{getBalance:vi.fn().mockResolvedValue(1000000000000000000n)} as unknown as Session['client']};
 mocks.read.mockReset().mockResolvedValue({version:d.version,challenge_seconds:600,fee_bps:0});mocks.code.mockReset().mockResolvedValue(source);mocks.receipt.mockReset();
 mocks.write.mockReset().mockImplementation((provider:Provider)=>provider.request({method:'eth_sendTransaction',params:[{}]}));
});
afterEach(()=>vi.unstubAllGlobals());
const walletCalls=()=>request.mock.calls.filter(([r])=>r.method==='eth_sendTransaction').length;
const send=()=>chain.send(d,s,'accept_job',['PB-TEST-001'],'0',onPending);

describe('submission error and retry safety',()=>{
 it('explains a raw pre-hash RPC error without invoking the wallet',async()=>{
  mocks.read.mockRejectedValue({code:-32000,message:'Service unavailable'});
  await expect(send()).rejects.toThrow(/Deployment verification failed before any wallet submission.*Service unavailable/);
  expect(walletCalls()).toBe(0);expect(mocks.write).not.toHaveBeenCalled();expect(storage.size).toBe(0);
 });
 it('identifies an SDK preparation error before wallet submission',async()=>{
  mocks.write.mockRejectedValue({message:'[object Object]',data:{message:'Nonce lookup failed'}});
  await expect(send()).rejects.toThrow(/Transaction preparation failed before any wallet submission.*Nonce lookup failed/);
  expect(mocks.write).toHaveBeenCalledTimes(1);expect(walletCalls()).toBe(0);expect(onPending).not.toHaveBeenCalled();
 });
 it('rejects a changed wallet before signing',async()=>{
  request.mockImplementation(async({method})=>method==='eth_accounts'?['0x'+'c'.repeat(40)]:'0xf22f');
  await expect(send()).rejects.toThrow(/Wallet account\/network check failed before any wallet submission/);expect(walletCalls()).toBe(0);
 });
 it('reports wallet rejection without retry or a fabricated hash',async()=>{
  request.mockImplementation(async({method})=>{if(method==='eth_sendTransaction')throw {code:4001,message:'User rejected'};return method==='eth_accounts'?[address]:'0xf22f';});
  await expect(send()).rejects.toThrow('Wallet request rejected');expect(walletCalls()).toBe(1);expect(mocks.write).toHaveBeenCalledTimes(1);expect(onPending).not.toHaveBeenCalled();expect(storage.has(chain.pendingKey)).toBe(false);
 });
 it('treats a timeout after wallet invocation as unknown, not failed or successful',async()=>{
  request.mockImplementation(async({method})=>{if(method==='eth_sendTransaction')throw {cause:{message:'Network timeout'}};return method==='eth_accounts'?[address]:'0xf22f';});
  await expect(send()).rejects.toThrow(/status is unknown.*Nothing was automatically resubmitted/);expect(walletCalls()).toBe(1);expect(onPending).not.toHaveBeenCalled();
 });
 it('blocks SDK fallback from requesting another wallet transaction',async()=>{
  request.mockImplementation(async({method})=>{if(method==='eth_sendTransaction')throw {message:'invalid pointer in tuple'};return method==='eth_accounts'?[address]:'0xf22f';});
  mocks.write.mockImplementation(async(provider:Provider)=>{try{return await provider.request({method:'eth_sendTransaction'});}catch{return provider.request({method:'eth_sendTransaction'});}});
  await expect(send()).rejects.toThrow(/additional wallet submission was blocked/);expect(walletCalls()).toBe(1);
 });
 it.each([undefined,{},'0xinvalid'])('never treats malformed hash %j as a successful submission',async result=>{
  request.mockImplementation(async({method})=>method==='eth_accounts'?[address]:method==='eth_chainId'?'0xf22f':result);
  await expect(send()).rejects.toThrow(/no valid transaction hash/);expect(walletCalls()).toBe(1);expect(storage.has(chain.pendingKey)).toBe(false);expect(onPending).not.toHaveBeenCalled();
 });
 it('persists a valid hash and blocks another submission until the result is known',async()=>{
  const p=await send();expect(p.hash).toBe(hash);expect(JSON.parse(storage.get(chain.pendingKey)!)).toEqual(p);expect(onPending).toHaveBeenCalledWith(p);
  await expect(send()).rejects.toThrow('pending transaction');expect(walletCalls()).toBe(1);
  mocks.receipt.mockResolvedValue({status:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN'});expect(await chain.checkPending(p)).toBe('success');
  await expect(send()).resolves.toHaveProperty('hash',hash);expect(walletCalls()).toBe(2);
 });
 it('retains the wallet hash if SDK processing subsequently throws',async()=>{
  mocks.write.mockImplementation(async(provider:Provider)=>{await provider.request({method:'eth_sendTransaction'});throw {message:'SDK response decoding failed'};});
  await expect(send()).rejects.toThrow(`A transaction hash was received: ${hash}`);
  expect((JSON.parse(storage.get(chain.pendingKey)!) as Pending).hash).toBe(hash);expect(onPending).toHaveBeenCalledTimes(1);expect(walletCalls()).toBe(1);
 });
 it('does not sign if browser persistence is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw Error('Storage unavailable');},removeItem:()=>{}});
  await expect(send()).rejects.toThrow(/Browser storage check failed before any wallet submission/);expect(walletCalls()).toBe(0);
 });
 it('preserves the received hash in memory if persistence fails after the probe',async()=>{
  vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{if(k===chain.pendingKey)throw Error('Quota exceeded');storage.set(k,v);},removeItem:(k:string)=>storage.delete(k)});
  await expect(send()).rejects.toThrow(hash);expect(onPending).toHaveBeenCalledWith(expect.objectContaining({hash}));
  await expect(send()).rejects.toThrow('pending transaction');expect(walletCalls()).toBe(1);
 });
 it('never resubmits a persisted transaction after reload',async()=>{
  await send();vi.resetModules();chain=await import('./chain');await expect(send()).rejects.toThrow('pending transaction');expect(walletCalls()).toBe(1);
 });
});
