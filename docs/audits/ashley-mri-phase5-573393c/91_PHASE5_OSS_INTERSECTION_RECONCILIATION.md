# 91 — Phase 5 OSS Intersection Reconciliation

## Scope and verdict

This report reconciles the Mimo, Muse Spark 1.2, and Claude Opus OSS-intersection reviews against Phase 4 artifacts 55–75, Phase 5 artifacts 77–90, and source at exact reference SHA `573393c3fdb2392a45137d4625635658eb4b5d88`.

The reviews are evidence and failure-pattern catalogs. They are not architecture authority. Phase 4 remains architecture authority. Phase 5 remains its mechanical compilation.

```text
PHASE5_OSS_RECONCILIATION=ACCEPT
PHASE4_REOPEN_REQUIRED=no
ACCEPTED_DELTA_COUNT=4
MODIFIED_DELTA_COUNT=3
REJECTED_DELTA_COUNT=0
TEST_HARDENING_COUNT=4
MECHANICAL_REFINEMENT_COUNT=1
QUALIFICATION_HARDENING_COUNT=2
NEW_RUNTIME_DEPENDENCIES=0
WAVE_ORDER_CHANGED=no
W9_CREATED=no
```

Counts apply to the seven deduplicated candidate deltas C1–C7. Reviewer-only proposals rejected outside those candidates are listed separately and are not double-counted.

## Source adjudication baseline

- W0 current `thought/parse.ts` parses the legacy model-echo contract. Artifact 79 already replaces that contract with the closed Phase 4 four-branch union and deletes numeric/string coercion. The missing element was an explicit coercion-negative and semantic-wrong catalog.
- W1 artifacts already separate `logicalBindingId`, `wireBindingId`, and `schemaEnforcementMode`. Current adapters can record the emitted request, but a provider does not always expose an authoritative declaration of the internal grammar engine used. Absence must remain `unavailable`.
- No JSON Schema validation dependency exists in `apps/agent-service/package.json`. W2 therefore cannot justify Promptfoo/BAML or a new runtime dependency for independent conformance.
- Current `retrieval/derived-store.ts` owns rebuildable FTS generation/state. Current `retrieval/fts.ts` joins FTS hits back to canonical sidecar rows. Artifact 83 already strengthens this to durable invalidation journal, scope/generation/source-fingerprint eligibility, canonical checks before and after FTS materialization, non-current rebuild, and atomic activation.
- Current `thought/projection-allocator/cache.ts` is an in-memory map keyed per cycle/generation/pass and used only to preserve the same semantic projection across structural correction. It is not durable retrieval currentness authority.
- NIM, Groq, and Zen adapters each make one injected `fetch` call. Mistral uses the SDK and `mistral-client.ts` sets `MISTRAL_RETRY_CONFIG.strategy="none"`. Artifact 85 required call-count proof generally but did not enumerate every adapter and proof form.

## Consolidated delta decisions

### C1 — ACCEPT: W0 strict coercion negative suite

**Source evidence:** `thought/parse.ts` and `thought/output-contract.ts` still implement the predecessor echo contract at the reference SHA. Artifact 79 explicitly deletes fallback numeric/string coercion in the successor parser but its test list did not enumerate the common coercion classes.

**Artifact affected:** 79; summarized in 89 and 90.

**Smallest patch:** Require strict rejection of string-to-number/boolean, loose enum/case, singleton-to-array, missing-to-null/default, malformed nested-to-null/default, empty/minimal, ambiguous, additional, and forbidden-field values. No repair/default path is added.

**Reason:** These fixtures falsify G14 directly and prevent a future adapter/helper from silently converting malformed meaning into apparently valid semantics.

**Architecture change:** no.

### C2 — MODIFY: structural validity is not semantic validity

**Source evidence:** Phase 4 artifact 58 assigns semantic fields to Thought and mechanics to Kernel. Review examples using `authorityEpoch`, durable operation IDs, `triggerRef`, request IDs, cycle, or generation as semantic-wrong values violate that ownership model. Artifact 81 had one combined `semanticPlausibility` field and did not name the adversarial semantic classes.

**Artifacts affected:** 79 and 81; summarized in 89 and 90.

**Smallest patch:** Add semantic-wrong fixtures only for Thought-owned values: branch/payload consistency, unsupported commitments, fabrication under absent evidence, allowlisted-but-irrelevant evidence, observation request versus `evidenceNeed`, and effect request versus `expectedOutcome`. Test kernel-owned output fields separately as forbidden fields. Record semantic validity separately from structural dimensions.

**Reason:** This preserves the full Kernel Envelope while proving that a schema-valid proposal may still be unacceptable.

**Architecture change:** no.

### C3 — ACCEPT: W1/W2 logical versus actual wire enforcement

**Source evidence:** Artifact 80 already binds logical and emitted-wire identity, and current NIM request construction can expose the exact emitted parameters. A provider may not return authoritative grammar-engine metadata.

**Artifacts affected:** 80 and 81; summarized in 89 and 90.

**Smallest patch:** Add a negative qualification witness where logical enforcement is stronger than emitted or observable enforcement. Record requested mode, emitted request mode/digest, provider-declared enforcement or explicit `unavailable`, and empirical conformance separately. The stronger capability is not qualified on mismatch or missing required evidence.

**Reason:** Logical intent cannot prove transport enforcement. Missing provider declarations must not be invented.

**Architecture change:** no.

### C4 — MODIFY: independent conformance and strict-parser value

**Source evidence:** No suitable JSON Schema validator is declared in the agent-service dependency graph at the reference SHA. Adding Promptfoo/BAML would violate the smallest-mechanism rule. Artifact 81 already owns a new offline qualification harness.

**Artifact affected:** 81; summarized in 89 and 90.

**Smallest patch:** Add a qualification-only deterministic raw-schema oracle derived from the exact exported W0 schema. It is separate from the runtime semantic parser, supports only the emitted closed-schema keyword subset, fails closed on unsupported keywords, and changes/fails on schema drift. Add a required deterministic `PROVIDER_ACCEPTED_PARSER_REJECTED` negative harness witness. Record JSON syntax, closed-schema conformance, strict parse, and semantic validity separately.

**Reason:** This provides independent evidence without a new runtime dependency or a second tolerant parser. The negative witness proves why Ashley still requires the strict parser.

**Architecture change:** no.

### C5 — MODIFY: W4 concurrency and stale-derived hardening

**Source evidence:** Artifact 83 already requires a durable invalidation journal, scope/generation/source-fingerprint checks, canonical eligibility before and after FTS materialization, non-current rebuild, atomic activation, and a publication fence. Current `ProjectionCache` is cycle-local structural-retry state, not durable currentness authority.

**Artifact affected:** 83; summarized in 89 and 90.

**Smallest patch:** Add explicit reader/transition, pre-invalidation retrieval finishing after commit, stale physical FTS/cache row, rebuild activation, multiple-support removal, and final canonical recheck cases. Do not freeze the proposed `snapshotHash + authorityEpoch + generation + TTL` cache identity.

**Reason:** The failure class is real. The reviewer mechanism is not necessary. Correctness remains with the existing barrier, journal, canonical eligibility, generation activation, and publication fence.

**Architecture change:** no.

### C6 — ACCEPT: W5 replay and late-completion hardening

**Source evidence:** Artifact 84 already freezes occurrence uniqueness, same wake/cycle recovery, consequence uniqueness, durable cancellation, `reconciling`, and no replay after unknown dispatch. Its matrix did not enumerate lost-ack and late-completion races fully.

**Artifact affected:** 84; summarized in 89 and 90.

**Smallest patch:** Add forced replay, duplicate wake delivery, duplicate completion resolution, external success followed by lost transition/ack, lease expiry while success is in flight, late success after expiry/cancellation/quarantine, same-lineage convergence, and outcome-unknown no-redispatch cases.

**Reason:** These are direct falsification cases for the existing R2 contract. They add no state or authority.

**Architecture change:** no.

### C7 — ACCEPT: W6 retry-authority proof

**Source evidence:** Native NIM/Groq/Zen adapters make one injected `fetch` call. Mistral uses an SDK configured with `MISTRAL_RETRY_CONFIG.strategy="none"`. Artifact 85 required hidden-retry checks but its command set named only NIM plus the shared client.

**Artifact affected:** 85; summarized in 89 and 90.

**Smallest patch:** Require per-adapter static and dynamic proof. Native-fetch adapters use injected call counts on retryable failures. Mistral proves the no-retry constructor option and one SDK completion call. Every later retry-governed adapter must join the matrix. Two physical dispatches for one Ashley attempt fail qualification.

**Reason:** Ashley's 5/15-minute policy is false if an SDK silently multiplies one durable attempt.

**Architecture change:** no.

## Reviewer-only proposals rejected or already satisfied

These dispositions are not counted again in C1–C7.

- **Visible/free-form reasoning channel:** REJECT. Phase 4 did not freeze a second visible scratchpad/output channel. The current Cognitive Workspace and provider-native reasoning policy already own internal reasoning mechanics. Adding a new channel would be architecture invention and could expose non-authoritative scratch material.
- **Specific cache key `snapshotHash + authorityEpoch + generation + TTL`:** REJECT as a prescribed mechanism. C5 accepts the failure tests, not this design.
- **Promptfoo, Inspect AI, Phoenix, or independent model grader as required authority:** REJECT. They remain optional research references. Deterministic gates and governed human review retain authority.
- **Token-healing parser tests:** REJECT for W0 source. Token reachability belongs to provider/wire enforcement and empirical W2 qualification. Ashley's post-generation parser receives complete raw bytes and does not control provider token masks.
- **Sub-operation journal or Restate/Temporal/DBOS import:** REJECT. Existing operation receipts and reconciliation own the frozen requirement.
- **New W6 per-lane concurrency-cap schema:** REJECT. Artifact 85 already uses one active `(conversation,lane)`, deterministic fairness, poison isolation, and starvation proof. No source evidence requires a second capacity policy.
- **New W0 outbox co-commit architecture:** ALREADY SATISFIED. Artifact 79 section L places semantic deltas, settlement, causal ledger, cycle state, and outbox in one publication transaction.
- **W7 backward-clock restart case:** ALREADY SATISFIED by artifact 86's clock high-water, restart, and greater-than-five-minute discontinuity tests.

## Dependency and boundary reconciliation

Artifact 88 remains correct. No accepted delta changes source/architecture predecessors, evidence/acceptance predecessors, migration order, shared ownership, or the conservative sequence:

```text
W0 -> W1 -> W2 -> W3 -> W4 -> W5 -> W6 -> W7 -> W8 -> STOP
```

Artifact 89 now carries the hardened Luna checkpoints. Artifact 90 records the hardened final state. W8 remains read-only measurement and preservation. W9 remains blocked and no W9 plan exists.

Deferred maturation remains outside MRI: XTDB, Graphiti, Hindsight, TencentDB Agent Memory, Acontext, Cognee, and LangMem. Deferred body/substrate remains outside MRI: ACP, Serena, tree-sitter, SCIP, ast-grep, CubeSandbox, Wasmtime, browser, desktop, voice, and non-Discord channels. SQLite and Bubblewrap remain unchanged.

## Verification verdict

```text
REFERENCE_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
PHASE4_REOPEN_REQUIRED=no
PHASE5_FUNDAMENTALLY_SOUND=yes
PHASE5_FINAL_HARDENED=yes
READY_FOR_FINAL_INDEPENDENT_REVIEW=yes
READY_FOR_LUNA_AFTER_REVIEW=yes
```
