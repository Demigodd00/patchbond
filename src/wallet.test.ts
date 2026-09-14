import {describe,it,expect} from 'vitest';
import {verifySession,verifyDeployment,pendingKey,type Session,type Deployment} from './chain';

const address='0x'+'a'.repeat(40);
function session(account=address,chain='0xf22f'):Session {
 return {address:address as `0x${string}`,client:{} as Session['client'],provider:{request:async({method})=>method==='eth_accounts'?[account]:chain}};
}
describe('StudioNet signing boundary',()=>{
 it('uses an isolated StudioNet pending transaction key',()=>expect(pendingKey).toBe('patchbond:pending:61999'));
 it('accepts the same test wallet on chain 61999',async()=>{await expect(verifySession(session())).resolves.toBeUndefined();});
 it('blocks a changed wallet before signing',async()=>{await expect(verifySession(session('0x'+'b'.repeat(40)))).rejects.toThrow('Reconnect');});
 it.each(['0x107d','0x1','0xf22d'])('blocks wrong chain %s',async chain=>{await expect(verifySession(session(address,chain))).rejects.toThrow('StudioNet');});
 it('blocks an old-network deployment without contacting its RPC',async()=>{const old={verified:true,address,chainId:4221,network:'studionet',version:'patchbond.v0.1',sourceSha256:'a'.repeat(64)} as Deployment;await expect(verifyDeployment(old)).rejects.toThrow('deployment');});
 it('blocks an unverified deployment without contacting its RPC',async()=>{await expect(verifyDeployment({verified:false} as Deployment)).rejects.toThrow('deployment');});
});
