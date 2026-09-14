// Offline assertions against the generated, publicly shareable StudioNet report.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const r=JSON.parse(fs.readFileSync(new URL('../public/verification.json',import.meta.url),'utf8'));
assert.equal(r.chainId,61999);
assert.ok(r.transactions.length>=20,'Full flow receipts missing');
for(const t of r.transactions){assert.equal(t.status,'FINALIZED',t.hash);assert.equal(t.passed,true,t.hash);assert.equal(t.leaderOnly,false,t.hash);}
const semantic=r.transactions.filter(t=>['review_patch','challenge_review'].includes(t.method)&&t.execution==='SUCCESS');
assert.ok(semantic.length>=4,'Initial, challenged and corrected review receipts required');
for(const t of semantic)assert.ok(Object.values(t.votes).filter(v=>v==='agree').length>=3,'Independent consensus majority missing: '+t.hash);
const good=r.jobs.find(j=>j.id==='PB-STUDIO-HAPPY-001');
const corrected=r.jobs.find(j=>j.id==='PB-STUDIO-CORRECT-001');
const expired=r.jobs.find(j=>j.id==='PB-STUDIO-EXPIRY-001');
assert.equal(good.status,'ACCEPTED');assert.equal(good.revision,1);
assert.equal(corrected.status,'ACCEPTED');assert.equal(corrected.revision,2);
assert.equal(corrected.reviews[0].outcome,'CHANGES_REQUESTED');
assert.equal(corrected.reviews[0].challenge_used,true);
assert.equal(corrected.reviews[1].outcome,'ACCEPTED');
assert.notEqual(corrected.reviews[0].head_sha,corrected.reviews[1].head_sha);
assert.notEqual(corrected.reviews[0].evidence_hash,corrected.reviews[1].evidence_hash);
for(const j of [good,corrected])for(const review of j.reviews){assert.ok(review.finalized_at>=Math.max(...review.assessments.map(a=>a.at))+600,'Window was not respected');}
assert.equal(expired.status,'REFUNDED');assert.ok(expired.settled_at>=expired.accept_by);
const before=r.balanceChecks.initial,after=r.balanceChecks.final;
assert.ok(before&&after,'Before/after balance verification required');
assert.equal(BigInt(after.balances.author)-BigInt(before.balances.author),20000000000000000n);
assert.equal(BigInt(after.balances.client)-BigInt(before.balances.client),10000000000000000n);
assert.equal(after.balances.contract,'0');
assert.equal(after.accounting.locked,'0');assert.equal(after.accounting.credited,'0');assert.equal(after.accounting.claimable,'0');
assert.equal(after.accounting.withdrawn,'30000000000000000');
assert.equal(after.accounting.deposited,after.accounting.withdrawn);
assert.equal(r.transfers.length,3,'Three finalized outbound transfers required');
for(const transfer of r.transfers){assert.equal(transfer.status,'FINALIZED');assert.equal(transfer.credited,true);assert.equal(transfer.value,'10000000000000000');assert.equal(transfer.from.toLowerCase(),r.contract.toLowerCase());assert.ok([good.author,good.client].includes(transfer.to.toLowerCase()));}
const errors=r.transactions.filter(t=>t.expectedError).map(t=>t.expectedError);
for(const expected of ['Only assigned author','Decision is not ready to finalize','Challenge already used','Stale revision or review already started','No claimable credit'])assert.ok(errors.some(e=>e.includes(expected)),'Missing rejection test: '+expected);
console.log('Verified: finalized receipts, independent review votes, all three flows, exact windows, preserved corrections, refund and native simulated-GEN balance conservation.');
