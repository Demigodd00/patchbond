# Verification record — 2026-09-12

## Scope

This release is a GenLayer **stable StudioNet** project (61999), not a production financial application. Hosted GenVM execution, public GitHub retrieval, CI runs and validator reviews are genuine StudioNet interactions. Native GEN and balances are simulated. Bradbury and real-money checks are neither required nor claimed.

## Automated local checks

- 38 direct-mode contract tests pass: actors, frozen scope, hashes/lengths, run/workflow identity, stale/duplicate evidence, consequential validator-result comparison, correction, challenge, insufficient evidence, settlement and expiry.
- 37 TypeScript tests pass: amount precision, walkthrough lifecycle, deadline and correction rules, finalized execution handling, idle-validator receipt handling, StudioNet identity, wallet changes, wrong-network rejection, interrupted receipt recovery, cancelled transactions and cross-tab pending-hash preservation.
- Full GenVM `check` passes: syntax/lint plus validation of 12 methods (4 views, 8 writes), concrete pinned runner. A newer available runner is advisory, not an unpinned dependency.
- TypeScript and Vite production build pass. The SDK's approximately 112 KB gzip chunk exceeds Vite's advisory uncompressed size threshold. Windows cannot launch the Sites build wrapper's package-manager shim; the same TypeScript and Vite build steps were run directly.

Direct tests mock GitHub/LLM responses. The direct withdrawal test records only an emitted-message intent, not transfer delivery. It is not substituted for the live balance evidence below.

## Live StudioNet evidence

[public/verification.json](../public/verification.json) is generated from finalized contract reads and actual transaction receipts. It includes full explorer URLs, validator votes, expected rejection reasons, all code/evidence hashes, complete immutable revisions and measured account balances. Its generator independently recomputes every captured source hash, byte length and combined evidence commitment.

`node scripts/check-verification.mjs` requires all of the following; it fails rather than silently skipping an unfinished case:

- Happy path: funded commitment, assigned-author acceptance, real push CI, evidence capture, semantic acceptance, full 600-second wait, finalization and reward withdrawal.
- Correction: CI-green but incomplete patch receives Changes requested; a party's challenge preserves that result; after finalization a different commit and CI attempt are submitted, independently reviewed and finally accepted.
- Expiry: an unaccepted assignment refunds the fixed amount after its onchain deadline; client withdrawal is measured separately.
- Successful semantic transactions use full consensus, not leader-only execution, and have at least three agreement votes. The report preserves idle/disagreement votes too; it does not claim unanimous validator availability.
- Wrong actor, early finalization, duplicate challenge, stale review and empty-credit withdrawal fail as expected. Finalized execution errors are not reported as successful actions.
- Initial/final simulated balances for this original three-flow run reconcile: author receives 0.02 GEN, client receives a 0.01 GEN refund, and the contract ends that checkpoint with no locked or unclaimed funds. Each claim is counted once. The later MetaMask commitment below adds 0.001 GEN of locked funds; the historical final balance is not a claim about the current global balance.

A `passed: true` entry with execution ERROR means the recorded, explicitly expected rejection test passed. It does not mean that transaction executed successfully.

## Browser and publication boundary

The actual frontend deployment-identity and pending-recovery functions were also executed against genuine finalized success/error receipts, using in-memory storage outside a browser. Both recovered the correct outcome and retained the explorer hash. Reproduce with `node scripts/check-client-live.mjs`; results are in public/client-verification.json. This is a live RPC integration check, not a browser-extension signing test.

The earlier browser walkthrough tested role restrictions, correction/challenge/finalization, local persistence and WebMCP navigation. Those records remain explicitly simulated. The original three-flow live run used isolated SDK software accounts, not a user browser extension wallet. Pending-hash recovery and network/account guards are implemented; unit tests cover their pure validation logic. The later Chrome/MetaMask checks below are recorded separately from that run.

On 2026-09-12, the owner explicitly requested public access. The Site audience was changed to public, preserving ownership and editor permissions. Unauthenticated HTTP requests returned the actual app and JSON reports without redirects or sign-in cookies. Reproduce with `node scripts/check-public.mjs`.

The publication recheck reran all 75 automated tests, full GenVM validation, type checking and the production build. Fresh live contract reads confirmed both accepted jobs and the expired/refunded job; the three-flow evidence assertions and final balance reconciliation passed. Already-finalized receipts were reused, not presented as newly submitted transactions. GitHub independently returned success for the four real fixture CI runs.

Initial browser checks on the public release covered the live board's three records, commitment search, accepted revision 2 and preserved revision 1/challenge history, policy and evidence links, modal dismissal, walkthrough/live separation and required-field validation on the empty commitment form. The wallet chooser correctly reported no installed provider in that initial browser. No wallet connection or signing occurred in those initial checks; the subsequent tests used the owner's explicitly selected Chrome browser with MetaMask.

## Chrome / MetaMask follow-up — passed

[public/wallet-verification.json](../public/wallet-verification.json) records the follow-up on the same public app and contract. The owner handled the private MetaMask approval and rejection prompts; the agent operated the app and independently read the finalized chain state. No private key or browser session store was accessed.

- Approval: `PB-MM-SIGN-001` was created through Chrome/MetaMask. [Transaction 0x7d89597c…](https://explorer-studio.genlayer.com/transactions/0x7d89597cfbb06040521d638fba7f6f7ecb637038075ab4400087394d34255441) is FINALIZED with contract execution SUCCESS. The form closed, the explorer link persisted, controls re-enabled, and the board showed the new OPEN commitment.
- Rejection: MetaMask rejection of `PB-MM-REJECT-001` appeared as a user-denied-signature error. Form values remained intact; submit and close controls were enabled, with no pending transaction panel. The agent closed the form and dismissed the messages without submitting again.
- Read-only verification found four commitments including `PB-MM-SIGN-001`, none named `PB-MM-REJECT-001`, and an unchanged post-approval/post-rejection wallet balance of 0.010 simulated GEN. The balance before approval was 0.011 GEN.
- At the checkpoint, the approved signing-test commitment remains OPEN and locks 0.001 simulated GEN. Its acceptance deadline is Unix timestamp 1789232910. Expiry recovery requires a separate eligible refund transaction and withdrawal; neither is claimed as completed for this extra record. Original happy-path, correction and expiry settlements remain completed.

These checks close the previously untested MetaMask approval/rejection items. They do not claim a second full browser-driven settlement cycle, comprehensive extension compatibility, or a live wallet-switch/network-switch test.

No Portal submission has been made. Public CI fixtures are [here](https://github.com/Demigodd00/patchbond-studionet-fixtures). This is not a security audit or a guarantee of zero bugs. Hosted data resets, source outages, CI dependencies and validator liveness remain external limitations. Smart-contract withdrawal recipients, failed outbound-message recovery and production-value settlement are outside this release.
