import {describe,expect,it} from 'vitest';
import recorded from '../public/verification.json';
import type {Job} from './model';
import {canonicalEvidence,verifyJobEvidence} from './verify-evidence';

const sample=()=>structuredClone(recorded.jobs.find(j=>j.id==='PB-STUDIO-CORRECT-001')) as unknown as Job;
const offline=(async()=>{throw Error('GitHub unavailable');}) as typeof fetch;

describe('public evidence verifier',()=>{
 it('recomputes the contract evidence digest from the recorded accepted example',async()=>{
  const review=sample().reviews[1];
  const bytes=new TextEncoder().encode(canonicalEvidence(review.evidence));
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  expect(hash).toBe(review.evidence_hash);
  expect(bytes.length).toBe(review.evidence_bytes);
 });
 it('reports an incomplete check when GitHub cannot be reached',async()=>{
  const report=await verifyJobEvidence(sample(),offline);
  expect(report.verdict).toBe('incomplete');
  expect(report.checks.some(c=>c.status==='fail')).toBe(false);
  expect(report.checks.some(c=>c.status==='unavailable')).toBe(true);
 });
 it('detects changed onchain evidence and unsupported decision quotes',async()=>{
  const job=sample();job.reviews[1].evidence_hash='0'.repeat(64);job.reviews[1].checks![0].quote='not found in source';
  const report=await verifyJobEvidence(job,offline);
  expect(report.verdict).toBe('failed');
  expect(report.checks.find(c=>c.label==='Revision 2: onchain evidence digest')?.status).toBe('fail');
  expect(report.checks.find(c=>c.label==='Revision 2: decision trail')?.status).toBe('fail');
 });
 it('reports a malformed revision as a failed check',async()=>{
  const job=sample();delete (job.reviews[1].evidence as Record<string,any>).files[0].after;
  const report=await verifyJobEvidence(job,offline);
  expect(report.verdict).toBe('failed');
  expect(report.checks.find(c=>c.label==='Revision 2: record shape')?.status).toBe('fail');
 });
});
