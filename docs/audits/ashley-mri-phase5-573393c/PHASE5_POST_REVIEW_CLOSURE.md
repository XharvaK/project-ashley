# Project Ashley Phase 5 Post-Review Closure

Reference HEAD: `573393c3fdb2392a45137d4625635658eb4b5d88`
Worktree: `C:\Users\Xharv\Projects\composer-assistant-audit-573393c`
Scope: bounded closure of the two residual independent-review findings.
No packet contradiction was found.

PHASE5_CLOSURE_STATUS=PASS

LEGACY_THOUGHT_SURFACE=closed

The legacy surface consisted of:

- `parseThoughtStepOutput` in `apps/agent-service/src/core/cognitive-v021/thought/parse.ts`. It accepted explicit `ThoughtStepOutput` envelopes, compact flat settlement drafts, `observation_request`, `effect_proposal`, and `failure` forms. It accepted model-authored `cycleId`, `generation`, `pass`, `requestId`, and `occupantId`, and its `pickDraft` path silently dropped unknown draft fields.
- `LEGACY_THOUGHT_OUTPUT_SCHEMA` in `apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts`. The exact current source showed this as a file-local `const`, not an exported symbol. It described the predecessor root forms and old mechanical fields. Mimo's specific exported-symbol statement was therefore not confirmed, but the dead legacy schema authority was confirmed.

The complete repository caller/surface trace found:

- No production invocation of `parseThoughtStepOutput`.
- `apps/agent-service/src/core/cognitive-v021/index.ts` re-exported `parseThoughtStepOutput`.
- `apps/agent-service/src/core/cognitive-v021/thought/run.ts` had an unused import of it. The live call was already `parseThoughtSemanticOutput` at `run.ts:439-442`.
- The only behavioral caller was the test-only `thought/parse.test.ts`; that legacy-behavior test was removed.
- No import or caller of `LEGACY_THOUGHT_OUTPUT_SCHEMA` was found. Its definition was removed.
- Qualification uses `parseThoughtSemanticOutput` at `qualification/thought-capability-qualification.ts:429`. Structural retry and the operation loop receive the kernel-produced envelope after the successor parser; neither reaches a legacy parser.

No historical provider-response decoder remains. The retained `migration/import-legacy.ts` code imports historical durable state and is not a Thought provider-response decoder. The `persistedMalformedRetries` JSON read in `thought/run.ts` reads internal stored failure metadata only; it is not a legacy model-output authority.

The final live provider-output authority is `parseThoughtSemanticOutput` only. Its exact-record validation rejects predecessor envelope fields and unknown mechanical or delivery fields. `runThoughtModel` binds cycle, generation, pass, request, occupant, and kernel-attempt identity from code-side input and captured attempt facts. No environment variable or runtime toggle reactivates legacy parsing.

BARRIER_FINDING=patched

Artifact 83 establishes the barrier recovery relation in §K as:

`stable -> transitioning -> reconciling -> stable`

Artifact 83 §N makes `reconciling` the fail-closed state after a canonical commit/projection gap and requires startup reconciliation before dispatch. Artifact 83 §P makes transition identity part of idempotent recovery. The `markReconcilingInTransaction` relation is therefore:

- `transitioning -> reconciling`: legal for recovery when the active transition cannot yet be proven stable, including the canonical-owner/projection gap and the forget commit-failure recovery path.
- `reconciling -> reconciling`: legal as idempotent recovery reapplication. It may update the recovery reason and must preserve the active transition identity.
- `stable -> reconciling`: illegal. A new canonical transition must begin with `stable -> transitioning`.
- Stabilization remains a separate operation. `transitioning` or `reconciling` may become `stable` only through the existing vector/token-checked stabilization path, which clears `active_transition_id` at the stable boundary.

The complete caller graph for `markReconcilingInTransaction` is:

- `barrier.ts:252`: called by `markAuthorityBarrierReconciling`, which is reached by `memory/forget.ts:1256` after a failed forget canonical commit when a transition had started, and by startup reconciliation at `barrier.ts:285` when pending derived invalidations exist and projection readiness is not proven.
- `barrier.ts:266`: called by `markAuthorityBarrierReconcilingInExistingTransaction`. No current production caller of this wrapper was found.
- Startup entry points `serve.ts:99` and `db.ts:3346` call `reconcileAuthorityBarrierOnStartup`; that function returns immediately for `stable` and otherwise uses the recovery semantics above.

Mimo's underlying observation was confirmed: the old implementation unconditionally wrote `reconciling`, cleared `active_transition_id`, and did not validate the affected-row count. Mimo's suggested `WHERE state != 'reconciling'` predicate was not used. Its implication that `transitioning -> reconciling` is illegal was rejected by artifact 83 §K/§N/§P and the caller contexts.

The patched source at `barrier.ts:227-242` now:

- rejects `stable` with `authority_barrier_reconcile_source_invalid`;
- updates only when the source is `transitioning` or `reconciling`;
- omits `active_transition_id` from the update so the current identity is preserved;
- rejects an unexpected affected-row count with `authority_barrier_reconcile_conflict`.

The adversarial barrier tests in `authority/barrier.test.ts:57-88` prove the legal recovery transition, idempotent reapplication, active-ID preservation, and stable-source rejection. Before the source patch, the new tests failed on both disputed behaviors: the ID was `null` after recovery and the stable-source call did not throw. After the patch, they pass.

ARCHITECTURE_REOPEN_REQUIRED=no

FILES_CHANGED=

Bounded-pass source/test/document paths touched in the already dirty candidate worktree:

- `apps/agent-service/src/core/cognitive-v021/authority/barrier.ts`
- `apps/agent-service/src/core/cognitive-v021/authority/barrier.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/parse.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/run.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/run.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/semantic-output-contract.test.ts`
- `apps/agent-service/src/core/cognitive-v021/index.ts`
- deleted `apps/agent-service/src/core/cognitive-v021/thought/parse.test.ts`
- `docs/audits/ashley-mri-phase5-573393c/PHASE5_POST_REVIEW_CLOSURE.md`

Pre-existing Phase 5 candidate changes in these files were preserved. No unrelated worktree changes were cleaned, reset, or overwritten.

TESTS_CHANGED=

- Added adversarial W4 barrier tests for source-state legality, recovery reapplication, active transition identity, and fail-closed stable-source behavior.
- Added successor contract, predecessor-envelope rejection, kernel-owned identity rejection, and four-branch structured-request tests in `semantic-output-contract.test.ts`.
- Changed the Thought run regression to send a predecessor envelope and prove no publication.
- Removed the test-only legacy parser behavior suite with the deleted legacy parser.

BUILD_RESULT=PASS

`npm run build --prefix apps/agent-service` passed with `tsc` and no diagnostics.

FOCUSED_TEST_RESULT=PASS

The final focused runs passed:

- Semantic output, Thought run, structural retry, projection retry, barrier, settlement publication, settlement validation, and memory-barrier suites: `21` files, `63` tests passed.
- Final post-edit semantic/run confirmation: `2` files, `7` tests passed.
- `git diff --check` reported no whitespace errors. Git emitted only existing LF/CRLF normalization warnings for modified working-copy files.

FULL_CORPUS_RESULT=PASS

Required command:

`npm run test --prefix apps/agent-service -- --no-file-parallelism --reporter=dot`

Result: `368` test files passed; `2,253` tests passed; `2` tests skipped. Duration: `954.85s`.

W2_EVIDENCE_CHANGED=no

W3_EVIDENCE_CHANGED=no

W8_EVIDENCE_CHANGED=no

W9_STARTED=no

PRODUCTION_MUTATION=no

COMMIT_CREATED=no

PUSH_PERFORMED=no

The closure pass stops here. No deploy, activation, capability promotion, provider substitution, live W2 rerun, architecture reopen, commit, or push was performed.
