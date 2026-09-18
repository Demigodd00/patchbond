# PatchBond

Accountable, commit-bound software repair on GenLayer. A client freezes a reproducible bug, source scope, requirements, an assigned author and a fixed test-GEN reward. Validators independently retrieve GitHub evidence and compare the patch against each mandatory requirement. Deterministic contract rules control credits and deadlines; the model never selects a payout amount or recipient.

[Public app](https://patchbond.blazekingsley2.chatgpt.site) · [App and contract source](https://github.com/Demigodd00/patchbond) · [Accepted correction demo](https://patchbond.blazekingsley2.chatgpt.site/?mode=live&job=PB-STUDIO-CORRECT-001) · [Submission fields](docs/SUBMISSION.md) · [512px PNG logo](public/patchbond-logo.png)

This repository contains the frontend, intelligent contract, tests, and public verification records. The [separate CI fixture repository](https://github.com/Demigodd00/patchbond-studionet-fixtures) contains the small example software patches reviewed by PatchBond, not the app itself. The public source export omits deployment-account hosting configuration and all ignored local account/operator data; local development does not need that hosting configuration.

## Release status

This is a **GenLayer StudioNet project**, not a real-money production application. Its deployed contract is [0x57512255289dcC4403Cc05c9e49a5BD6417528D7](https://explorer-studio.genlayer.com/contracts/0x57512255289dcC4403Cc05c9e49a5BD6417528D7), on stable StudioNet chain 61999. The app defaults to live finalized contract state. The separate walkthrough uses browser-local simulated examples and never contacts validators or moves funds.

The deployed source, ABI and policy have been read back and verified. Genuine GitHub CI evidence and GenLayer reviews are recorded in [the verification report](public/verification.json), separately from mocked tests. The later [Chrome/MetaMask verification](public/wallet-verification.json) confirms a successful user-approved commitment and clean rejection recovery without another commitment or balance deduction. Its approved 0.001 GEN test commitment remains OPEN at the recorded checkpoint; this is not a fourth completed settlement flow. Native GEN balances and transfers in StudioNet are simulated. No Bradbury deployment or real-value funds are required or claimed. Do not describe this as audited or bug-free. No existing app or prior contract was reused; no browser wallet private keys were accessed.

## Run locally

Node 24 and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Python 3.12 development checks:

```sh
python -m pip install -r requirements-dev.txt
python -m pytest tests/direct -q
genvm-lint check contracts/patch_bond.py --json
```

The direct test harness mocks source retrieval and model output. Live StudioNet integration uses scripts/studionet.mjs with separate disposable test accounts and a [public fixture repository](https://github.com/Demigodd00/patchbond-studionet-fixtures). See docs/DEPLOYMENT.md for reproduction. Never publish the ignored .local directory, which holds generated account keys and resumable operator state.

## Walkthrough

1. Create a simulated commitment; the form explicitly labels placeholder Git and workflow identifiers as simulated.
2. Switch the role to Demo patch author and accept.
3. Record a simulated patch, then request a simulated review.
4. Select Changes requested or Insufficient evidence, skip the simulated wait, and finalize.
5. Submit a different revision, review it as Accepted, then finalize after the window.
6. As the author, simulate withdrawal. Export the record to inspect both revisions.

The timer shortcut exists only in walkthrough mode. A challenge rereads the same evidence; it is not a way to introduce new claims. Each revision permits one challenge and restarts a 600-second application window. The application window is separate from GenLayer protocol finality.

## Bounded evidence policy

- Public GitHub repositories only; canonical repository ID is pinned. GitHub HTTPS responses are the authority—not an independent proof of code execution.
- One direct-child patch commit of the frozen base; at most four **modified existing** allowlisted files. No added, deleted, renamed, or `.github/` patch files.
- Workflow path, exact UTF-8 byte count, SHA-256, numeric workflow ID and required job name are precommitted. The client must inspect the workflow and its external dependencies. The contract cannot make an inadequately specified test meaningful.
- Specific run and attempt on the exact head commit, in the pinned repository, started after acceptance, completed successfully. The required job must be unique; all its listed steps must succeed. Conditional/skipped-step workflows are intentionally unsupported in this MVP.
- Before/after source plus workflow is bounded to 24 KB. Full content is retained in contract history; no arbitrary code execution occurs in the validator prompt.
- Model output is schema-checked and grounded in exact after-source quotes. Validators independently recompute scope and every consequential requirement status. Their agreed statuses deterministically derive Accepted, Changes requested, or Inconclusive.
- Ambiguity cannot accept a patch. One correction is allowed; unresolved final failure or eligible expiry returns the fixed reward to the client ledger.

## Settlement and trust limitations

Reward: 0.001–1 native **simulated StudioNet** GEN, fixed at creation. No author performance stake, fee, admin verdict override, or production insurance promise. StudioNet scope is a deployment convention enforced by the client; the source does not attest to its own chain ID.

Acceptance credits the author. Terminal failure/expiry credits the client. Withdrawal consumes the caller's credit once and emits an EVM transfer for protocol finalization. Accounting tests can verify credit consumption and message creation; they do not prove receipt at the destination. Smart-contract recipient failures and outbound-transfer recovery are not supported guarantees; initially use test-only externally owned accounts and verify final receipt. A pending proposed acceptance cannot be overridden by the expiry refund path.

Unavailable sources fail closed. Recovery requires a caller to submit a transaction after its deadline—there is no background scheduler. GitHub availability/rate limiting, model agreement and hosted network finalization latency are external dependencies.

## Deployment and evidence

See [deployment checklist](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), and [verification record](docs/VERIFICATION.md). Contract source is `contracts/patch_bond.py`. Keep secrets out of the repository and the frontend. The browser client uses user-approved wallet requests only.

The [public app](https://patchbond.blazekingsley2.chatgpt.site) and its verification reports are accessible without a Sites sign-in. Recheck anonymous access with `node scripts/check-public.mjs`. Publishing the interface is not contract deployment and does not make a simulated example valid submission evidence. The user submitted PatchBond on 2026-09-14; no Portal action was performed by the agent. See the [18 September wallet-error fix and review clarification](docs/STEWARDSHIP_RESPONSE_2026-09-18.md).
