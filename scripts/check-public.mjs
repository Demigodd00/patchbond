// Read-only anonymous publication check: no cookies, credentials or auth bypass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin = 'https://patchbond.blazekingsley2.chatgpt.site';
const expected = JSON.parse(fs.readFileSync(new URL('../public/deployment.json', import.meta.url), 'utf8'));

async function get(path, contentType) {
  const response = await fetch(new URL(path, origin), {
    redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `${path}: must be public, not a sign-in redirect`);
  assert.ok(response.headers.get('content-type')?.includes(contentType), `${path}: unexpected content type`);
  return response.text();
}

const html = await get('/', 'text/html');
assert.match(html, /<title>PatchBond[^<]*<\/title>/);
assert.match(html, /id="root"/);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
assert.ok(scripts.length, 'App JavaScript missing');
let sourceLinkFound = false;
for (const path of scripts) {
  assert.equal(new URL(path, origin).origin, origin, 'Unexpected off-site executable asset');
  const source = await get(path, 'javascript');
  assert.ok(source.length > 100, 'App script is empty');
  sourceLinkFound ||= source.includes('https://github.com/Demigodd00/patchbond"');
}
assert.ok(sourceLinkFound, 'Full app source link missing from published app');
const logoResponse = await fetch(new URL('/patchbond-logo.png', origin), {
  redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000),
});
assert.equal(logoResponse.status, 200, 'PNG logo must be publicly accessible');
assert.ok(logoResponse.headers.get('content-type')?.includes('image/png'));
const logo = Buffer.from(await logoResponse.arrayBuffer());
assert.deepEqual(logo, fs.readFileSync(new URL('../public/patchbond-logo.png', import.meta.url)));
assert.equal(logo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(logo.readUInt32BE(16), 512);
assert.equal(logo.readUInt32BE(20), 512);
assert.ok(logo.length < 2 * 1024 * 1024);
const deployment = JSON.parse(await get('/deployment.json', 'application/json'));
assert.equal(deployment.address, expected.address);
assert.equal(deployment.chainId, 61999);
assert.equal(deployment.sourceSha256, expected.sourceSha256);
assert.equal(deployment.verified, true);
const report = JSON.parse(await get('/verification.json', 'application/json'));
assert.equal(report.contract, expected.address);
assert.equal(report.chainId, 61999);
assert.ok(report.transactions.length >= 25 && report.transactions.every(tx => tx.passed));
assert.equal(report.jobs.find(job => job.id === 'PB-STUDIO-CORRECT-001')?.status, 'ACCEPTED');
const client = JSON.parse(await get('/client-verification.json', 'application/json'));
assert.equal(client.deploymentIdentityVerified, true);
assert.ok(client.checks.length >= 2 && client.checks.every(check => check.passed));
const wallet = JSON.parse(await get('/wallet-verification.json', 'application/json'));
const expectedWallet = JSON.parse(fs.readFileSync(new URL('../public/wallet-verification.json', import.meta.url), 'utf8'));
assert.deepEqual(wallet, expectedWallet, 'Published wallet evidence differs from the verified checkpoint');
assert.equal(wallet.contract, expected.address);
assert.equal(wallet.chainId, 61999);
assert.equal(wallet.approval.passed, true);
assert.equal(wallet.approval.transactionStatus, 'FINALIZED');
assert.equal(wallet.approval.execution, 'SUCCESS');
assert.equal(wallet.rejection.passed, true);
assert.equal(wallet.rejection.finalizedJobAbsent, true);
assert.equal(wallet.balancesWei.afterApproval, wallet.balancesWei.afterRejection);
console.log(JSON.stringify({at: new Date().toISOString(), origin, anonymousAccess: 'passed',
  appAssets: scripts.length, deploymentIdentity: 'passed', publicEvidence: 'passed',
  publicWalletEvidence: 'passed', sourceLink: 'passed', submissionLogo: 'passed'}, null, 2));
