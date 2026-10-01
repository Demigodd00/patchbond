# PatchBond milestone 1 — public evidence verification

## What changed

Every live commitment now has a **Verify public evidence** action. Anyone can run it without a wallet. It reads the finalized StudioNet contract state, then independently retrieves the exact public GitHub commits, source files, workflow, CI run attempt, required job and steps recorded with each revision. The interface shows each check and links to the source. A shareable link can start the check for a specific commitment.

The verifier recomputes the SHA-256 digest and byte count of the evidence stored onchain, checks the source and workflow proofs, confirms the GitHub repository and commit ancestry, and checks that the recorded requirement quotes and outcomes follow the contract's structural rules. It checks the final recipient against the fixed accepted/refunded rule. GitHub outages or rate limits produce **Verification incomplete**, never a green result. A mismatch produces **Evidence check failed**.

This is a read-only capability for the accepted v0.1 contract. The contract address, challenge period, reward policy and recorded historical settlements did not change. The verifier checks provenance and internal consistency; it cannot independently decide whether source code satisfies a natural-language requirement or whether the client's pinned CI test suite was adequate.

## Reviewer path

1. Open [the accepted correction example](https://patchbond.blazekingsley2.chatgpt.site/?mode=live&job=PB-STUDIO-CORRECT-001&verify=1). The check should report **Evidence integrity verified** across both revisions. Expand the individual checks to inspect the direct-child commits, source snapshots, CI runs and challenge decision trail.
2. Open [the single-revision acceptance](https://patchbond.blazekingsley2.chatgpt.site/?mode=live&job=PB-STUDIO-HAPPY-001&verify=1). The same read-only check should verify the accepted revision.
3. Review [the original live settlement record](https://patchbond.blazekingsley2.chatgpt.site/verification.json) for finalized transactions and withdrawals. The verifier itself submits no transaction.

## Reproduction

From this public repository with Node 24 and its locked dependencies:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
node --experimental-strip-types scripts/check-evidence-verifier.mjs
```

The last command performs fresh read-only checks against the deployed StudioNet contract and GitHub. It exits nonzero on any failed or unavailable check. The [first recorded run](../public/milestone-1-verification.json) on 1 October 2026 verified both accepted examples: 16 checks on PB-STUDIO-HAPPY-001 and 29 checks across both revisions of PB-STUDIO-CORRECT-001, with no mismatches or unavailable sources. The 75 frontend tests include tampering, malformed records and unavailable-GitHub cases. These are new verifier checks of already-finalized transactions, not a new contract deployment or new wallet signing run.

## Scope for the milestone claim

The improvement is a public, reproducible evidence inspection path for the accepted PatchBond application. Use the live verifier links and this document as milestone evidence. Do not describe it as a new GenLayer contract version, a new settlement flow, a semantic correctness proof, or a production audit.
