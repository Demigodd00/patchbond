# PatchBond v0.1 — bounded software repair

The frontend prepares transactions and renders contract state. It cannot decide a live verdict. GenLayer validators independently fetch GitHub evidence and evaluate whether a bounded code change meets the client's frozen requirements. Deterministic code chooses the entire fixed reward or refund; the model never selects an amount.

## Initial scope

One client, one assigned patch author, public GitHub repositories, a single-parent commit directly on the agreed base, at most four changed UTF-8 files, one correction attempt, one challenge per revision, 600-second application challenge windows. A native test-GEN reward is funded by the client. No author performance stake or additional fee. No private repository credentials, arbitrary URL fetches, server-side AI decisions, or execution of submitted code by this app.

## Evidence authority

GitHub is the registered evidence authority, not the author. Validate the numeric repository ID, commit and parent IDs, workflow ID/path and exact workflow bytes pinned at creation. A completed push workflow must target the exact patch commit, have a fresh fixed run attempt, and include the named successful required job with completed successful steps. Branches and user-selected external evidence URLs are not accepted. Validators fetch complete before/after source at commit-pinned raw URLs and store hashes and byte lengths. Workflow success is a trusted CI assertion, not proof of a correct test suite. The client must choose a workflow which tests the checked-out head, uses immutable dependencies/actions and does not consume private secrets or a mutable remote test oracle.

## Lifecycle

OPEN -> IN_PROGRESS -> REVIEW_READY -> REVIEW_PENDING -> ACCEPTED (reward credit) or CHANGES_REQUESTED. One new submission can replace a failed first revision; old snapshots and reviews remain immutable. A failed second revision refunds the client. Review disagreement or unavailable sources leaves the state unchanged for retry. Fixed expiry makes unreviewable unfinished work refundable. A pending proposed acceptance cannot be bypassed by expiry: the proposal must finalize under its existing challenge rules. Withdrawal is pull-based, recipient is the caller and native transfers are emitted only on protocol finalization.

## Verification boundary

Direct tests simulate GitHub and LLM responses; they do not prove live validator consensus or wallet transfers. A canonical stable StudioNet deployment is now configured; its source and ABI were checked against this release. The verification report separates genuine StudioNet receipts and public GitHub runs from mocks. StudioNet native GEN is simulated and the hosted sandbox may reset its data. The frontend's local walkthrough does not call validators or create onchain results. No Bradbury or real-money deployment is required or claimed.
