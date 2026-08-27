# C1 QUALIFICATION BOOTSTRAP IMPLEMENTATION SETTLEMENT

Status: IMPLEMENTED / FOCUSED-TESTED —
FULL CORPUS FAILURES RECORDED

This document records the implementation settlement for the C1 Qualification
Bootstrap. It is prepared for the owner and independent differential reviewer.
It does not assert any later capability lifecycle state.

Independent differential review: `ACCEPT_WITH_NONBLOCKING_NOTES`

Functional SHA: `f3da03db4831a11ac60261d142aa354749cd188a`

Accepted settlement descendant: `23d7c418fbc2f22f1685e7da2fb292d0416391e1`

Blocking findings: `0`

Candidate regressions: `0`

## Source identity

- Repository: `C:\Users\Xharv\Projects\composer-assistant`
- Implementation worktree: `C:\Users\Xharv\Projects\project-ashley-c1-qualification-bootstrap-implementation`
- Branch: `codex/c1-qualification-bootstrap`
- Starting SHA: `d5a110be2e4e5c52ca31ec56d8c9f5dd55a08ec1`
- Implementation SHA: `f3da03db4831a11ac60261d142aa354749cd188a`
- Settlement document commit: the local commit containing this document is
  recorded as `ending_sha` in the implementation return.
- Plan source: `C:\Users\Xharv\Documents\Codex\2026-08-27\referenced-chatgpt-conversation-this-is-an\outputs\2026-08-27-c1-qualification-bootstrap-implementation-plan.md`
- User request source: `C:\Users\Xharv\.codex\attachments\fb018a78-812c-4115-9e9e-9212e100de0b\pasted-text.txt`

The implementation SHA is the exact source candidate before this documentation
commit. The source candidate is a descendant of the authorized starting SHA.

## Implemented contract

- Dedicated C1 epoch custody is stored in control-plane tables introduced by
  Migration 41. Epochs bind owner, build identity, capability contract,
  predecessor, evaluation definition, live-shadow evidence, and release seal.
- C1 evaluation definition is `c1-memory-evidence-v1`, version `1`, with
  definition hash
  `2a4d38685a60c2d2e27c979f050e884037f98b0806d0cc8ad0fe117e819e1a4e`.
- The six required deterministic seeds are:
  `owner_self_description_precedence`, `recorded_event_scope_only`,
  `ashley_history_scope_only`, `confidence_not_authority`,
  `proof_carrying_or_uncertain_disagreement`, and
  `non_revival_identity_nonmutation`.
- Generic capability events cannot satisfy C1. The dedicated owner-authenticated
  evaluation route requires the exact definition, hash, seed set, owner, build,
  contract, current epoch, Recall predecessor state, and observe-mode boundary.
- The live-shadow source key is exactly
  `c1-shadow:v1:decision:<positive integer>`. The deterministic evaluation key
  is `c1-eval:v1:<definition_hash>:<run_id>`.
- The shadow seam evaluates persisted Decision evidence and final composed-turn
  identifiers immediately before `expressSpeak` in reactive and proactive
  Expression attempts. It does not change live Decision, context, motivation,
  message, memory-row, or provider-bound state.
- The shadow receipt is `c1-shadow-receipt/v1`. It is text-free and provider
  independent. Candidate collection is bounded to 32 sources; the receipt
  samples at most 12 sources with at most 8 assertion IDs and 8 correction IDs
  per sample; the canonical receipt is limited to 4000 UTF-8 bytes.
- C1 decision classes are `no_c1_material`, `same_current`, `would_relabel`,
  `would_filter`, `would_narrow`, `mixed_change`, `unmapped_fail_closed`, and
  `evaluation_error`.
- The currentness marker remains `mem_facts` during the implementation and
  qualification campaign. The implementation includes separate readiness and
  currentness-transition controls. The transition is guarded by global observe,
  a paused and quiescent Expression plane, an active exact release, an exact
  sealed epoch, build and contract identity, Recall dependency state, and a
  pre-transition consistency report.
- The transition result exposes sticky diagnostics: reverse transition is not
  available, release rollback does not restore the legacy marker, barriers and
  terminations remain enforced, and semantic filtering remains owned by
  assertions and barriers.
- Owner-authenticated routes added to the route surface are:
  `/nuclear/capabilities/memory-evidence/qualification-epoch/start`,
  `/nuclear/capabilities/memory-evidence/qualification-epochs`,
  `/nuclear/capabilities/memory-evidence/evaluation`,
  `/nuclear/capabilities/memory-evidence/readiness`, and
  `/nuclear/capabilities/memory-evidence/cutover`.

## Checkpoint commits

The implementation checkpoints are local and were authorized for this run:

1. `fe8d25c` — `test(c1): specify qualification epoch storage`
2. `43862ea` — `feat(c1): bind memory evidence qualification to epochs`
3. `731be06` — `feat(c1): add pre-influence memory shadow witness`
4. `491ac59` — `feat(c1): record witnesses at expression attempts`
5. `f3da03d` — `feat(c1): guard readiness and currentness activation`

Only the C1 implementation paths were staged for these commits. The unrelated
deletion set under `apps/sandbox-broker`, `apps/sandbox-m1`,
`apps/sandbox-policy`, `apps/sandbox-tree`, and `apps/sandbox-v2` was preserved
and was not staged.

## Tests-first evidence

- Red tests were added before each production slice for Migration 41 and epoch
  custody, exact evaluation binding, generic-path rejection, shadow witness
  semantics, reactive and proactive runtime seams, readiness, route trust, and
  guarded transition behavior.
- The initial failures were caused by the absent C1 storage, binding, witness,
  runtime, and control-plane implementations. The final C1-focused tests pass.
- Focused C1 activation and control-plane run:
  `npm run test:offline --prefix apps/agent-service -- src/core/memory/activation.test.ts src/capabilities-endpoint.test.ts src/route-surface.test.ts src/core/memory/cutover.test.ts --reporter=verbose`
  — 4 files, 35 tests passed.
- Focused C1 plus runtime run:
  `npm run test:offline --prefix apps/agent-service -- src/core/memory/activation.test.ts src/capabilities-endpoint.test.ts src/route-surface.test.ts src/core/memory/cutover.test.ts src/core/runtime.test.ts --reporter=dot`
  — 5 files, 63 tests passed.
- The isolated shadow witness suite passed 10 tests. The isolated runtime suite
  passed 27 tests.
- Earlier checkpoint-focused suites also passed: Task 0 baseline 10 files / 70
  tests, Task 2 3 files / 40 tests, and Task 3 9 files / 34 tests.

## Verification evidence

- Build:
  `npm run build --prefix apps/agent-service` — exit code 0.
- Focused offline suites: pass as recorded above.
- Full offline agent-service corpus:
  `npm run test:offline --prefix apps/agent-service` — exit code 1.
  Exact result: 36 failed files, 216 passed files out of 252; 87 failed tests,
  1,788 passed tests, and 2 skipped tests out of 1,877.
- `git diff --check` — exit code 0 for the current worktree. The committed
  implementation range also passes `git diff --check`.
- Source-derived schema state at the implementation SHA is
  `NUCLEAR_SUPPORTED_VERSION = 41` in
  `apps/agent-service/src/core/db.ts`. Migration 41 is tested by the dedicated
  C1 migration suite.
- The state-inventory and C1 consistency tests pass in the focused evidence.
- No provider call, QXY mutation, synthetic production traffic, deployment, or
  host activation script was performed. The offline configuration excludes the
  three host activation scripts and installs the offline network guard.
- The required scoped scan for
  `Authority Kernel|authority_kernel|C2|C3|C4|C5` returned no matches in
  `apps/agent-service/src/core/memory` and
  `apps/agent-service/src/core/rollout/memory-evidence-qualification-epoch.ts`.
  No new C2-C5 behavior or Authority Kernel code was added.

## Full-corpus blocker

The full corpus result is recorded, not suppressed. The selected worktree
currently contains 278 unrelated deleted paths, all under the five historical
`apps/sandbox-*` packages. These deletions were preserved. The starting SHA
contains the sandbox-broker source, while the current deleted package caused
the `verify-agent-tsc.driver` failures to report a missing
`apps/sandbox-broker/dist/crypto/delegated-policy.js` module.

Additional observed corpus failures include migration tests that still assert
schema 35 even though the starting SHA source was already schema 40 and this
candidate adds Migration 41, plus baseline V2 runtime and M3 witness failures.
The V2 deterministic arbitration failure was reproduced at the starting SHA.
Every full-corpus failure was not independently attributed in this run, so no
broader inference is made from the aggregate failure count.

Because the full verification command failed, this document does not claim
implementation closure for the whole repository. It leaves the exact C1 source
candidate and evidence available for independent differential review.

## Review handoff

The independent differential review recorded the verdict above against the
exact implementation range
`d5a110be2e4e5c52ca31ec56d8c9f5dd55a08ec1..f3da03db4831a11ac60261d142aa354749cd188a`,
with settlement descendant
`23d7c418fbc2f22f1685e7da2fb292d0416391e1`. It confirmed the C1-only scope and
the currentness/provider-boundary constraints. The nonblocking notes and the
review-environment preservation facts are recorded in
[`C1_QUALIFICATION_BOOTSTRAP_INDEPENDENT_REVIEW.md`](C1_QUALIFICATION_BOOTSTRAP_INDEPENDENT_REVIEW.md).

The implementation worker did not delegate this task, create another
implementation task, or restart the implementation. No push was performed.
