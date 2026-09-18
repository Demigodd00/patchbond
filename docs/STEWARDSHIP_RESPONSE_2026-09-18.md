# PatchBond — wallet-error fix and review clarification

## Suggested response to the steward

Thank you for the feedback. The request is attached to my PatchBond submission, but the text names MemorySeal and asks for a Bradbury policy-creation flow. PatchBond is a software-patch review application submitted as a StudioNet project; it has patch commitments rather than policies. Could you confirm that this feedback was intended for PatchBond, and whether Bradbury is now required for this submission?

I nevertheless found and fixed an applicable wallet-error display issue in PatchBond. Plain or nested wallet/RPC error objects now produce readable messages instead of `[object Object]`. Errors identify whether they occurred during deployment verification, wallet/account validation, balance/storage checks, transaction preparation, or after a wallet request. A missing transaction hash after a wallet request is reported as an unknown outcome, not as success or proof that nothing was submitted.

The wallet can receive only one send request per explicit action, including SDK fallback paths. No automatic resubmission is performed. A returned hash is retained immediately for receipt checking, even if later SDK processing fails. Known pending transactions continue to block another send and are recovered after refresh.

The public app and source have been updated. The verification guide retains the existing successful StudioNet commitment, review, finalization, inspection, refund and withdrawal evidence, with Chrome/MetaMask approval and rejection documented separately. These are not Bradbury tests or MemorySeal policy tests.

## Links

- App: https://patchbond.blazekingsley2.chatgpt.site/
- Source: https://github.com/Demigodd00/patchbond
- StudioNet contract: https://explorer-studio.genlayer.com/address/0x57512255289dcC4403Cc05c9e49a5BD6417528D7
- Finalized correction example: https://patchbond.blazekingsley2.chatgpt.site/?mode=live&job=PB-STUDIO-CORRECT-001
- Original live receipts: https://patchbond.blazekingsley2.chatgpt.site/verification.json
- Original Chrome/MetaMask checkpoint: https://patchbond.blazekingsley2.chatgpt.site/wallet-verification.json

## Reproducible regression checks

From a checkout of this public repository, install the locked dependencies and run:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
node scripts/check-client-live.mjs
node scripts/check-verification.mjs
node scripts/check-public.mjs
```

`src/errors.test.ts` covers raw/nested RPC errors, wallet codes, cycles, empty objects, bounded messages and exclusion of arbitrary request fields. `src/submission.test.ts` covers pre-wallet errors, user rejection, ambiguous no-hash results, one-send enforcement against an SDK fallback attempt, malformed returned hashes, retained hashes after SDK/storage failures, and pending-hash protection across refresh. These are mocked transport regression tests, not new browser-wallet or blockchain transactions.

The live-client script checks the unchanged contract identity and already-finalized success/error receipts against the current StudioNet RPC. It updates only the read-check timestamp/report and does not submit a transaction. The original full live-flow reproduction is documented in [DEPLOYMENT.md](DEPLOYMENT.md).

## Scope and remaining clarification

- This change does not redeploy or alter the intelligent contract, switch networks, or change fixed settlement rules.
- The issue was reproduced with plain/nested provider errors in tests. We do not have the steward's failed request or logs, so this does not establish the cause of their reported transaction failure.
- A timeout without a hash after a wallet request remains ambiguous. Check wallet Activity and the explorer before a manual retry. The application does not claim that such a transaction never existed and never retries it automatically.
- The prior MetaMask tests and original three settled workflows remain historical checkpoints, not newly repeated browser-signing tests.
- No Bradbury test or policy-creation flow is claimed. Do not mark the steward's full request resolved until the project/network mismatch is clarified.
- No Portal reply or resubmission was performed by this fix.
