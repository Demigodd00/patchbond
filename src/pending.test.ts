import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({receipt:vi.fn()}));
vi.mock('genlayer-js',()=>({createClient:()=>({getTransaction:mocks.receipt}),chains:{studionet:{id:61999}}}));
import {checkPending,pendingKey,lastTransactionKey,type Pending} from './chain';
const p:Pending={hash:('0x'+'a'.repeat(64)) as `0x${string}`,address:'0x'+'b'.repeat(40),account:'0x'+'c'.repeat(40),method:'accept_job',jobId:'PB-TEST-001',submittedAt:100};
let store:Map<string,string>;
beforeEach(()=>{store=new Map([[pendingKey,JSON.stringify(p)]]);vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});mocks.receipt.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
describe('persistent receipt recovery',()=>{
 it('retains the pending hash when the network is unavailable',async()=>{mocks.receipt.mockRejectedValue(new Error('offline'));await expect(checkPending(p)).rejects.toThrow('offline');expect(store.has(pendingKey)).toBe(true);expect(store.has(lastTransactionKey)).toBe(false);});
 it('does not treat optimistic acceptance as finalized',async()=>{mocks.receipt.mockResolvedValue({status:'ACCEPTED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS'}]}});expect(await checkPending(p)).toBe('pending');expect(store.has(pendingKey)).toBe(true);});
 it('saves the finalized success link before clearing pending state',async()=>{mocks.receipt.mockResolvedValue({status:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS'}]}});expect(await checkPending(p)).toBe('success');expect(store.has(pendingKey)).toBe(false);expect(JSON.parse(store.get(lastTransactionKey)!)).toEqual({...p,outcome:'success'});});
 it('records a finalized execution failure truthfully',async()=>{mocks.receipt.mockResolvedValue({status:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'ERROR'}]}});expect(await checkPending(p)).toBe('error');expect(store.has(pendingKey)).toBe(false);expect(JSON.parse(store.get(lastTransactionKey)!).outcome).toBe('error');});
 it('does not erase a newer transaction from another tab',async()=>{const newer={...p,hash:'0x'+'d'.repeat(64)};store.set(pendingKey,JSON.stringify(newer));mocks.receipt.mockResolvedValue({status:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS'}]}});await checkPending(p);expect(JSON.parse(store.get(pendingKey)!)).toEqual(newer);expect(store.has(lastTransactionKey)).toBe(false);});
 it('rejects malformed transaction hashes before an RPC call',async()=>{await expect(checkPending({...p,hash:'0xinvalid'})).rejects.toThrow('Invalid pending');expect(mocks.receipt).not.toHaveBeenCalled();});
 it('clears a cancelled transaction instead of waiting forever for finalization',async()=>{mocks.receipt.mockResolvedValue({statusName:'CANCELED'});expect(await checkPending(p)).toBe('error');expect(store.has(pendingKey)).toBe(false);expect(JSON.parse(store.get(lastTransactionKey)!).outcome).toBe('error');});
});
