# StudioNet deployment and reproduction

PatchBond targets stable StudioNet, chain 61999, RPC `https://studio.genlayer.com/api`. No Bradbury or real-value funds are required. StudioNet executes GenVM and validator calls but its native GEN is simulated and hosted data may be reset.

- [Contract](https://explorer-studio.genlayer.com/contracts/0x57512255289dcC4403Cc05c9e49a5BD6417528D7)
- [Finalized deployment](https://explorer-studio.genlayer.com/transactions/0x965d3a4d6bb614628006beab58dbcf78ff5352b7809ba59b632788051c556146)
- Source: contracts/patch_bond.py; no constructor arguments; concrete runner pinned in its first line.
- LF source SHA-256: `227bec571d298a4bb14b90f1b295495947bdd259bdc471f214a712ed6d3f2f7d`.
- Deployed source, all 12 ABI methods, and policy were read back. Policy: v0.1, 600-second challenge, 2 revisions, 0% fee.
- deployment.json's verified flag means identity verification, not a security audit. Consult VERIFICATION.md and public/verification.json for completed tests.

## Reproduction operator

Run `node scripts/studionet.mjs COMMAND`. On first use it creates three isolated disposable accounts. Keys and resumable state stay in ignored .local/. Never publish that directory or paste keys into chat. The operator cannot select a different network or import an existing wallet.

1. `accounts` prints public addresses only. `fund client` requests 0.1 simulated GEN from StudioNet's faucet. For a browser wallet, use the account dropdown faucet in [Studio](https://studio.genlayer.com).
2. `deploy` submits the checked-in contract once and saves its hash. `receipt HASH` saves an actual receipt. Require both FINALIZED and successful leader execution; an idle validator is not a failed leader.
3. `bind ADDRESS` verifies source before recording it. `read get_config` checks policy.
4. `create PB-UNIQUE-ID 'Title'` locks 0.01 simulated GEN using tests/studionet-fixture.json. `write author accept_job 0 ID` accepts.
5. Publish a fresh direct-child patch from the base after acceptance. After push CI succeeds, `write author submit_patch 0 ID HEAD RUN ATTEMPT` captures it.
6. `write observer review_patch 0 ID REVISION` requests consensus. `read get_job ID` reads finalized evidence and assessments.
7. A party can challenge once per revision. Wait the full 600-second contract window, then `write observer finalize 0 ID`. One correction requires a different commit and CI attempt.
8. `write author withdraw 0` consumes credit. Compare recipient and contract balances and inspect triggered transfers through finalization. Expired assignments refund to client credit; client withdrawal is separate.

## Public fixture

[Demigodd00/patchbond-studionet-fixtures](https://github.com/Demigodd00/patchbond-studionet-fixtures) contains synthetic order-recording code. Base `f887c0fff08c700fe94f2d66b2558e1bedd2bfa6`. Workflow ID 356564406; job acceptance; SHA-256 `739a7d9591f1a65ce4e906998de6736253e9a9ce4cf0bb76d37c0a2272bd64ca`; 612 UTF-8 bytes.

The workflow fetches and verifies the exact push commit, then runs frozen smoke tests. It uses no third-party actions, secrets, or downloaded test oracle. GitHub's Ubuntu runner remains an external dependency. The incomplete patch deliberately also passes these smoke tests: CI is necessary but insufficient, and validators must inspect the code against each requirement.

Wallet assignment does not grant GitHub push access. Use only disposable externally owned wallets. Smart-contract recipients and real-money settlement are outside scope. The Site is publicly accessible at the owner's request; `node scripts/check-public.mjs` verifies anonymous access. Portal submission is a separate action and has not been performed.
