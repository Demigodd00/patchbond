import {describe,it,expect} from 'vitest';
import {ActionError,formatError,errorInfo} from './errors';

describe('human-readable wallet errors',()=>{
 it('extracts a plain JSON-RPC rejection',()=>expect(formatError({code:-32603,message:'RPC service unavailable'})).toContain('RPC service unavailable'));
 it('extracts nested original errors without displaying object coercion',()=>expect(formatError({message:'[object Object]',data:{originalError:{message:'Nonce request timed out',code:-32000}}})).toBe('Network/RPC error: Nonce request timed out (code -32000)'));
 it('finds nested wallet rejection through SDK wrappers',()=>expect(formatError({message:'Unknown error',cause:{code:'4001'}})).toMatch(/Wallet request rejected/));
 it('handles a pending wallet request without encouraging duplicate submission',()=>expect(formatError({code:-32002})).toMatch(/already pending.*do not submit another/));
 it.each([4100,4200,4900,4901,4902])('maps wallet/network code %s',code=>{const message=formatError({code});expect(message).not.toContain('[object Object]');expect(message).not.toContain('without readable details');});
 it('identifies insufficient test funds',()=>expect(formatError({data:{message:'insufficient funds for gas * price + value'}})).toMatch(/simulated GEN.*Never send real-value funds/));
 it('handles cyclic objects',()=>{const error:{cause?:unknown;message:string}={message:'RPC timeout'};error.cause=error;expect(formatError(error)).toContain('RPC timeout');});
 it.each([null,undefined,{},42,{message:'[object Object]'}])('has a readable fallback for %j',error=>{expect(formatError(error)).toContain('without readable details');expect(formatError(error)).not.toContain('[object Object]');});
 it('does not leak arbitrary request fields',()=>{const message=formatError({request:{secret:'do-not-display'},message:'Denied'});expect(message).toBe('Denied');});
 it('bounds provider text',()=>expect(formatError({message:'x'.repeat(10000)}).length).toBe(360));
 it('preserves phase and hash recovery guidance',()=>expect(formatError(new ActionError('Hash received. Do not resubmit.'))).toBe('Hash received. Do not resubmit.'));
 it('bounds recursive causes',()=>{let value:unknown={message:'very deep'};for(let i=0;i<100;i++)value={cause:value};expect(errorInfo(value).messages).toEqual([]);});
});
