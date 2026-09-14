import {describe,it,expect} from 'vitest';
import {demoJobs,nextDemo,parseGEN} from './model';
import {receiptOutcome} from './chain';

describe('fixed reward precision',()=>{
 it('preserves atto-GEN precision',()=>expect(parseGEN('0.001000000000000001')).toBe('1000000000000001'));
 it.each(['0','0.0009','1.01','NaN','1e-2','-0.01','0.0010000000000000001'])('rejects invalid amount %s',x=>expect(()=>parseGEN(x)).toThrow());
});
describe('walkthrough policy',()=>{
 it('enforces author authority and immutable history',()=>{const j=demoJobs()[0];expect(()=>nextDemo(j,'submit_patch',{head:'b'.repeat(40),run:'100',attempt:'1'},'client',j.created_at+7200)).toThrow();const updated=nextDemo(j,'submit_patch',{head:'b'.repeat(40),run:'100',attempt:'1'},'author',j.created_at+7200);expect(j.revision).toBe(0);expect(updated.revision).toBe(1);});
 it('enforces challenge window and single use',()=>{const j=demoJobs()[1],n=j.created_at+7200;const review=nextDemo(j,'review_patch',{outcome:'ACCEPTED'},'client',n);expect(()=>nextDemo(review,'finalize',{},'client',n+599)).toThrow();const challenged=nextDemo(review,'challenge_review',{outcome:'ACCEPTED',statement:'Check source'},'author',n+500);expect(challenged.challenge_until).toBe(n+1100);expect(()=>nextDemo(challenged,'challenge_review',{outcome:'ACCEPTED',statement:'Again'},'client',n+510)).toThrow();expect(nextDemo(challenged,'finalize',{},'author',n+1100).status).toBe('ACCEPTED');});
 it('allows one correction and does not accept insufficient evidence',()=>{const j=demoJobs()[1],n=j.created_at+7200;let current=nextDemo(j,'review_patch',{outcome:'INCONCLUSIVE'},'client',n);current=nextDemo(current,'finalize',{},'client',n+600);expect(current.status).toBe('CHANGES_REQUESTED');current=nextDemo(current,'submit_patch',{head:'c'.repeat(40),run:'101',attempt:'1'},'author',n+610);current=nextDemo(current,'review_patch',{outcome:'CHANGES_REQUESTED'},'client',n+620);current=nextDemo(current,'finalize',{},'client',n+1220);expect(current.status).toBe('REFUNDED');expect(current.reviews).toHaveLength(2);});
 it('does not recover a pending accepted reward',()=>{const j=demoJobs()[1];const pending=nextDemo(j,'review_patch',{outcome:'ACCEPTED'},'client',j.created_at+7200);expect(()=>nextDemo(pending,'recover_expired',{},'client',j.expires_at+1)).toThrow();});
});
describe('receipt truthfulness',()=>{
 it.each([null,{}, {status:'ACCEPTED',txExecutionResultName:'FINISHED_WITH_RETURN'},{status:'FINALIZED'}])('keeps unconfirmed execution pending',r=>expect(receiptOutcome(r)).toBe('pending'));
 it('requires finality and confirmed success',()=>expect(receiptOutcome({status:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN'})).toBe('success'));
 it('gives execution errors precedence',()=>expect(receiptOutcome({status:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN',consensusData:{leaderReceipt:{execution_result:'ERROR'}}})).toBe('error'));
 it('handles snake-case receipts',()=>expect(receiptOutcome({status_name:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS'}]}})).toBe('success'));
 it('recognizes cancelled transactions',()=>expect(receiptOutcome({status:'CANCELED'})).toBe('error'));
 it('uses the final leader result, not an idle validator receipt',()=>expect(receiptOutcome({status:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS'},{mode:'validator',execution_result:'ERROR'}]}})).toBe('success'));
 it('does not let a validator receipt override a failed leader',()=>expect(receiptOutcome({status:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'ERROR'},{mode:'validator',execution_result:'SUCCESS'}]}})).toBe('error'));
});
