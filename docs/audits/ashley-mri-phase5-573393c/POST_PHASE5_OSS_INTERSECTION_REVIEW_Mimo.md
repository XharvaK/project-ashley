# POST-PHASE-5 OSS INTERSECTION REVIEW

## 1. Executive Verdict

```text
PHASE5_REOPEN_REQUIRED=no
PHASE4_REOPEN_CANDIDATES=0
PHASE5_TEST_HARDENINGS=4
PHASE5_MECHANICAL_REFINEMENTS=2
PHASE5_QUALIFICATION_HARDENINGS=3
DEFER_TO_MATURATION=3
DEFER_TO_FUTURE_SUBSTRATE=2
```

Phase 5 remains fundamentally sound. The OSS archaeology confirms that Ashley's frozen architectural choices — strict semantic parsing prohibition on tolerant repair, Thought as sole semantic author, Kernel Envelope mechanics, wake singularity, durable retry authority, and private budget durability — are correct and well-motivated. No architecture reopening candidates were found.

Four test hardenings, two mechanical refinements, and three qualification hardenings are recommended. All are bounded changes that do not alter frozen Phase 4 contracts.

## 2. Phase 5 Wave-by-Wave Intersection Matrix

| Finding ID | Wave | Phase 5 Mechanism | OSS Evidence | Disposition | Severity | Confidence |
|---|---|---|---|---|---|---|
| OSS-INT-001 | W0 | Strict parser, no tolerant repair | BAML SAP coercion behavior | TEST_HARDENING | HIGH | HIGH |
| OSS-INT-002 | W0 | Four-branch semantic contract | LLGuidance syntactic-only guarantee | NO_INTERSECTION | NOTE | HIGH |
| OSS-INT-003 | W0 | Structural correction fresh invocation | Outlines finite automaton limits | NO_INTERSECTION | NOTE | HIGH |
| OSS-INT-004 | W1 | Capability identity fingerprint | Promptfoo is-json/contains-json schema validation | QUALIFICATION_HARDENING | MEDIUM | HIGH |
| OSS-INT-005 | W1 | Logical vs wire binding evidence | Constrained decoding syntactic/semantic gap | TEST_HARDENING | HIGH | HIGH |
| OSS-INT-006 | W2 | Conjunctive qualification gates | Inspect AI structured output + scanning | QUALIFICATION_HARDENING | MEDIUM | MEDIUM |
| OSS-INT-007 | W4 | Version vector currentness barrier | SpiceDB ZedToken/at_least_as_fresh | NO_INTERSECTION | NOTE | HIGH |
| OSS-INT-008 | W4 | Stale derived ineligibility | SpiceDB New Enemy Problem + CVE-2026-55866 | TEST_HARDENING | HIGH | HIGH |
| OSS-INT-009 | W4 | Cross-store barrier not ACID | OpenFGA cache controller invalidation | NO_INTERSECTION | NOTE | MEDIUM |
| OSS-INT-010 | W5 | Wake singularity, one consequence chain | Restate durable execution determinism trap | TEST_HARDENING | HIGH | HIGH |
| OSS-INT-011 | W5 | FutureTrigger maturity atomicity | Restate journal replay determinism | NO_INTERSECTION | NOTE | HIGH |
| OSS-INT-012 | W6 | No hidden SDK retry | Restate exactly-once via journal + idempotency | MECHANICAL_REFINEMENT | MEDIUM | HIGH |
| OSS-INT-013 | W6 | Outcome-unknown reconciliation | DBOS transactional execution pattern | NO_INTERSECTION | NOTE | HIGH |
| OSS-INT-014 | W7 | Durable budget, restart cannot refill | DBOS checkpoint + replay semantics | NO_INTERSECTION | NOTE | HIGH |
| OSS-INT-015 | W7 | Clock rollback safety | Restate Date.now() trap outside ctx.run | MECHANICAL_REFINEMENT | MEDIUM | HIGH |
| OSS-INT-016 | W2/W3 | Qualification evidence format | Inspect AI structured output evaluation | QUALIFICATION_HARDENING | MEDIUM | MEDIUM |
| OSS-INT-017 | W1/W2 | Wire evidence capture | Promptfoo is-valid-function-call | NO_INTERSECTION | NOTE | MEDIUM |
| OSS-INT-018 | Maturation | Longitudinal memory provenance | Graphiti/X temporal semantics | DEFER_TO_MATURATION | LOW | MEDIUM |
| OSS-INT-019 | Maturation | Derived state reconciliation | Hindsight/TencentDB memory | DEFER_TO_MATURATION | LOW | MEDIUM |
| OSS-INT-020 | Maturation | Skill learning packaging | Acontext/construction patterns | DEFER_TO_MATURATION | LOW | LOW |
| OSS-INT-021 | Substrate | Worker infrastructure | ACP/Serena/ast-grep | DEFER_TO_FUTURE_SUBSTRATE | LOW | LOW |
| OSS-INT-022 | Substrate | Sandbox alternatives | CubeSandbox/Wasmtime | DEFER_TO_FUTURE_SUBSTRATE | LOW | LOW |

## 3. Detailed Findings

### OSS-INT-001: BAML SAP Coercion as Negative Test Cases

```text
FINDING_ID=OSS-INT-001
PHASE5_WAVE=W0
PHASE5_ARTIFACT=79_W0_THOUGHT_CONTROL_BOUNDARY_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=G14 (strict semantic parsing mandatory); parse.ts; semantic-output-contract.test.ts
OSS_PROJECT=BoundaryML/baml
OSS_EXACT_PRIMITIVE_OR_FAILURE=Schema-Aligned Parsing (SAP) TypeCoercer performs type coercion: string→number, singleton→array, missing optional→null, malformed nested→default
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=github.com/BoundaryML/baml commit beead9571295045d62a2d21b34926e814723795d; deepwiki.com/BoundaryML/baml/2.3-type-system-and-validation
DISPOSITION=TEST_HARDENING
SEVERITY=HIGH
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W0 plan correctly prohibits tolerant semantic repair (G14). parseThoughtStepOutput rejects unknown fields, wrong types, and coerced values. However, the test plan in artifact 79 section S does not explicitly enumerate BAML-class coercion scenarios as negative test cases.

EXTERNAL_EVIDENCE=BAML's TypeCoercer trait explicitly performs: (1) string→number coercion, (2) loose enum matching via fuzzy matching, (3) singleton→array promotion, (4) missing optional fields→null, (5) malformed nested structures→null/default. BAML treats these as features ("robustness"). The `@check` annotations are soft constraints; `@assert` are hard constraints. When @assert fails, coercion returns None (deserialization failure). BAML's SAP algorithm computes "least cost edit" from model output to schema-parseable form — this is exactly the tolerant repair Ashley prohibits.

WHY_IT_MATTERS=BAML demonstrates that structured output systems routinely perform semantic coercion that changes meaning while "fixing" shape. Ashley's W0 parser must reject these cases. The test suite should include explicit coercion negative cases: model emits "42" for a number field, model emits a singleton where array is expected, model omits a required field that parser would silently default, model emits a nested object with missing required subfields that a coercer would fill with defaults.

SMALLEST_SAFE_DELTA=Add to artifact 79 section S (new tests) a specific test case set: `thought/semantic-coercion-rejection.test.ts` covering BAML-class coercion patterns. Each case proves the strict parser rejects the coerced output with the exact failure code. No production code change needed — this is a test hardening only.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=If a future adapter or provider uses a BAML-like coercive parser layer, the test suite would not catch the regression. The prohibition exists in G14 but lacks explicit negative test coverage for the most common coercion patterns documented in OSS.

IF_CHANGED_RISK=No risk. Adding negative tests strengthens the existing contract without changing it.
```

### OSS-INT-002: Constrained Decoding Syntactic-Only Guarantee

```text
FINDING_ID=OSS-INT-002
PHASE5_WAVE=W0
PHASE5_ARTIFACT=79_W0_THOUGHT_CONTROL_BOUNDARY_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=G4 (Thought explicitly selects branch); G5 (Kernel never infers); output-contract.ts
OSS_PROJECT=guidance-ai/llguidance; dottxt-ai/outlines
OSS_EXACT_PRIMITIVE_OR_FAILURE=Constrained decoding guarantees syntactic schema validity but NOT semantic correctness. "A well-formed object in which the extracted total is wrong, the chosen category is wrong, and the confidently populated required field is a fabrication."
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=tmls.nyc/research/structured-outputs-constrained-decoding (2026-06-03); github.com/guidance-ai/llguidance README
DISPOSITION=NO_INTERSECTION
SEVERITY=NOTE
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W0 already distinguishes structural validity from semantic correctness. The KernelEnvelope captures attempt identity and the semantic branch is explicitly selected by the model. Phase 5 does not rely on constrained decoding for semantic correctness.

EXTERNAL_EVIDENCE=LLGuidance powers OpenAI Structured Outputs and computes token masks for JSON Schema conformance. Outlines uses finite automata for regular-language constraints. Both guarantee output conforms to schema syntax. Neither guarantees the values are semantically correct. This is documented: "Constrained decoding guarantees the first completely and the second not at all."

WHY_IT_MATTERS=This confirms Ashley's architecture is correct: syntactic validity (W0 parser) and semantic correctness (Authority evaluation) are separate concerns. No change needed.

SMALLEST_SAFE_DELTA=None. Phase 5 already correctly separates these concerns.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=None.
IF_CHANGED_RISK=None.
```

### OSS-INT-003: Outlines Automaton Limits

```text
FINDING_ID=OSS-INT-003
PHASE5_WAVE=W0
PHASE5_ARTIFACT=79_W0_THOUGHT_CONTROL_BOUNDARY_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=output-contract.ts closed four-branch schema
OSS_PROJECT=dottxt-ai/outlines
OSS_EXACT_PRIMITIVE_OR_FAILURE=Outlines uses finite-state automata which cannot express arbitrary nesting required by real JSON Schema. Context-free grammar engines (XGrammar, GBNF) handle recursion at higher cost.
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=tmls.nyc/research/structured-outputs-constrained-decoding; github.com/dottxt-ai/outlines README
DISPOSITION=NO_INTERSECTION
SEVERITY=NOTE
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=Ashley does not use constrained decoding at generation time. The W0 parser operates post-generation. The schema is a closed four-branch discriminated union which is context-free but does not require arbitrary nesting.

WHY_IT_MATTERS=This confirms Ashley's approach is appropriate for its schema complexity. The closed four-branch schema is expressible as a context-free grammar. No change needed.

SMALLEST_SAFE_DELTA=None.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=None.
IF_CHANGED_RISK=None.
```

### OSS-INT-004: Promptfoo Schema Validation as Qualification Evidence

```text
FINDING_ID=OSS-INT-004
PHASE5_WAVE=W1
PHASE5_ARTIFACT=80_W1_RELEASE_TRUTH_QUALIFICATION_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=ThoughtCapabilityIdentity; qualification harness; evaluateQualificationCase
OSS_PROJECT=promptfoo
OSS_EXACT_PRIMITIVE_OR_FAILURE=Promptfoo provides deterministic is-json/contains-json assertions with optional JSON Schema validation, plus is-valid-function-call/is-valid-openai-tools-call for function call schema conformance
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=promptfoo.dev/docs/configuration/expected-outputs/deterministic/
DISPOSITION=QUALIFICATION_HARDENING
SEVERITY=MEDIUM
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W1 qualification tests verify semantic contract conformance through the W0 parser and Kernel Envelope. The qualification evidence includes component fingerprints but does not independently verify JSON Schema conformance of the raw model output against the exact W0 schema.

EXTERNAL_EVIDENCE=Promptfoo's is-json assertion with a schema value performs independent JSON Schema validation of model output. This is a different evidence class from W0 parser output — it proves the raw wire output conforms to the schema before Ashley's parser processes it. This could serve as an additional qualification gate: if the raw output does not conform to the schema, the parser is doing more work than necessary and the qualification result is weaker.

WHY_IT_MATTERS=Adding an independent schema conformance check to W2 qualification would strengthen the evidence that the model can produce schema-valid output under the W0 contract, without relying solely on Ashley's parser to detect schema violations. This is a qualification hardening, not a mechanical change.

SMALLEST_SAFE_DELTA=In artifact 81 (W2), add to section S (test plan) an adversarial case: verify that the raw model output independently validates against the W0 JSON Schema before parsing. This proves the qualification is not solely dependent on parser tolerance.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=Qualification evidence is weaker if schema conformance is only verified through Ashley's parser, which may accept slightly malformed output through its strict-but- forgiving error categorization.

IF_CHANGED_RISK=Low risk. Adding an independent schema validation step is additive evidence.
```

### OSS-INT-005: Syntactic/Semantic Gap as Test Case

```text
FINDING_ID=OSS-INT-005
PHASE5_WAVE=W0/W1
PHASE5_ARTIFACT=79; 80
PHASE5_EXACT_SECTION_OR_MECHANISM=W0 parser strict validation; W1 qualification conjunctive gates
OSS_PROJECT=guidance-ai/llguidance; dottxt-ai/outlines; boundaryml/baml
OSS_EXACT_PRIMITIVE_OR_FAILURE=All constrained decoding systems guarantee syntactic validity but not semantic correctness. "A guaranteed-valid response feels trustworthy and invites teams to drop validation, when in fact a perfectly shaped answer can be confidently wrong."
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=tmls.nyc/research/structured-outputs-constrained-decoding (2026-06-03)
DISPOSITION=TEST_HARDENING
SEVERITY=HIGH
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W2 qualification includes semanticPlausibility as a conjunct. However, the test plan does not explicitly include cases where output is syntactically valid but semantically wrong (e.g., correct schema shape, wrong branch selection, wrong values in observation/effect fields).

EXTERNAL_EVIDENCE=The structured output research community has identified this as "the most expensive confusion in production structured-output systems." Constrained decoding guarantees schema conformance but a model can emit a valid settlement branch with wrong Authority epoch, a valid effect_intent with invented operation IDs, or a valid observation_intent with stale trigger references.

WHY_IT_MATTERS=W2 qualification should include adversarial cases where the model produces schema-valid but semantically wrong output. This tests that the full W0→Authority→Settlement pipeline catches semantic errors, not just syntactic ones.

SMALLEST_SAFE_DELTA=Add to artifact 81 section T (failure-injection matrix) three cases: (1) model emits settlement branch with stale Authority epoch (should be caught by W4 fence), (2) model emits effect_intent with fabricated operation ID (should be caught by kernel operation binding), (3) model emits observation_intent with wrong trigger ref (should be caught by reference allowlist).

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=Qualification may pass cases where semantically wrong output would reach production if Authority/Settlement gates have latent bugs.

IF_CHANGED_RISK=No risk. These are additional test cases.
```

### OSS-INT-006: Inspect AI for Qualification Evidence

```text
FINDING_ID=OSS-INT-006
PHASE5_WAVE=W2/W3
PHASE5_ARTIFACT=81_W2; 82_W3
PHASE5_EXACT_SECTION_OR_MECHANISM=W2 qualification runner; W3 Stage A evaluator
OSS_PROJECT=UKGovernmentBEIS/inspect_ai
OSS_EXACT_PRIMITIVE_OR_FAILURE=Inspect AI provides structured output constraint, trace-based observability, model-graded scoring, and scanner-based detection of misconfigured environments and evaluation awareness
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=github.com/UKGovernmentBEIS/inspect_ai; inspect.aisi.org.uk
DISPOSITION=QUALIFICATION_HARDENING
SEVERITY=MEDIUM
CONFIDENCE=MEDIUM

CURRENT_PHASE5_BEHAVIOR=W2 qualification uses a custom runner (thought-capability-qualification.ts) with conjunctive gates. W3 uses qualification tests and Stage A evaluator.

EXTERNAL_EVIDENCE=Inspect AI is the UK AISI's official evaluation framework. It provides: (1) structured output enforcement during generation, (2) trace-based observability for agent trajectories, (3) scanner-based detection of evaluation awareness (model gaming the eval), (4) model-graded scoring with multi-model voting. These are evaluation-quality primitives, not promotion authority.

WHY_IT_MATTERS=Inspect AI's scanner capability (detecting evaluation awareness) could strengthen W2/W3 qualification by verifying the model is not gaming the qualification harness. However, this is an evaluation maturation concern, not a Phase 5 mechanical requirement. Inspect AI's structured output enforcement is provider-side and does not directly intersect Ashley's post-generation parsing.

SMALLEST_SAFE_DELTA=In artifact 81 section Q (observability), note that W2 qualification evidence should include model-graded plausibility review by an independent evaluator (not the same model being qualified) as an optional strengthening step. This is a qualification evidence enhancement, not a mechanical requirement.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=None. W2 qualification is already conjunctive and strict.
IF_CHANGED_RISK=Low risk. Adding an independent plausibility reviewer is additive.
```

### OSS-INT-008: SpiceDB Stale Authorization as W4 Adversarial Test

```text
FINDING_ID=OSS-INT-008
PHASE5_WAVE=W4
PHASE5_ARTIFACT=83_W4_R1_SEMANTIC_AUTHORITY_DERIVED_RETRACTION_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=Authority barrier; version vector; second currentness fence; stale proposal refusal
OSS_PROJECT=authzed/spicedb
OSS_EXACT_PRIMITIVE_OR_FAILURE=SpiceDB CVE-2026-55866: Under concurrency, CheckPermission returns PERMISSIONSHIP_HAS_PERMISSION for a resource whose correct answer is PERMISSIONSHIP_CONDITIONAL_PERMISSION when a subject reaches the permission through a caveated branch and a non-caveated branch simultaneously
EVIDENCE_CLASS=CONFIRMED_FROM_ADVISORY
SOURCE=github.com/authzed/spicedb/security/advisories/GHSA-4vrg-r928-h5vv (2026-06-19)
DISPOSITION=TEST_HARDENING
SEVERITY=HIGH
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W4 implements barrier CAS, version vector fencing, and second currentness fence at publication. The failure-injection matrix (artifact 83 section T) covers transition-after-proposal, canonical-commit-projection-failure, and stale-proposal-after-rollback.

EXTERNAL_EVIDENCE=SpiceDB's CVE-2026-55866 demonstrates that authorization systems can return incorrect permission states under concurrent evaluation when paths through caveated and non-caveated branches are evaluated concurrently. The fix was to disable the dispatch result cache. This is analogous to Ashley's scenario where Authority packs might be evaluated against a mix of current and stale data during concurrent canonical mutations.

WHY_IT_MATTERS=W4's barrier and version vector correctly prevent this class of bug in Ashley's architecture. However, the test suite should include an explicit concurrency test case where: (1) two concurrent Authority evaluations read different barrier states, (2) one reads stable+current vector while the other reads transitioning+stale vector, (3) verify the stale read is rejected by the second fence. This mirrors the SpiceDB concurrency bug pattern.

SMALLEST_SAFE_DELTA=Add to artifact 83 section T (failure-injection matrix): "Concurrent Authority evaluation under barrier transition: one reader sees stable+current vector, another sees transitioning+stale vector; stale read must be refused by publication second fence." This is a test hardening only.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=If the barrier CAS or version vector fencing has a latent concurrency bug similar to SpiceDB's dispatch cache issue, it would not be caught by current tests.

IF_CHANGED_RISK=No risk. Adding a concurrency test case.
```

### OSS-INT-010: Restate Determinism Trap as W5/W6 Test Case

```text
FINDING_ID=OSS-INT-010
PHASE5_WAVE=W5
PHASE5_ARTIFACT=84_W5_R2_WAKE_SINGULARITY_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=Wake identity determinism; occurrence identity derivation; restart/crash contract
OSS_PROJECT=restatedev/restate
OSS_EXACT_PRIMITIVE_OR_FAILURE=Restate's durable execution requires deterministic workflow functions. Non-deterministic operations (Date.now(), Math.random(), UUID generation) outside ctx.run cause replay divergence. "The crash happened during post_e9. The runtime does not know whether the side effect made it to the ledger... The replay diverged on the startedAt value because new Date() ran a second time and produced a later instant."
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=tiarebalbi.com/en/blog/durable-execution-replayable-backend-workflows-restate (2026-05-19); docs.restate.dev/foundations/key-concepts
DISPOSITION=TEST_HARDENING
SEVERITY=HIGH
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W5 plan (artifact 84) requires deterministic occurrence identity derivation from source kind plus durable trigger/event occurrence. The plan states: "Occurrence identity deterministically derives from source kind plus durable trigger/event occurrence, not current time on retry." However, the test plan does not explicitly inject non-deterministic clock/UUID scenarios during restart recovery.

EXTERNAL_EVIDENCE=Restate's TypeScript SDK does NOT sandbox Date.now() or Math.random() outside ctx.run. A workflow that works in tests can trip on the first worker death after a non-journaled call. The recommended countermeasure is a forced-replay harness in CI. DBOS has the same requirement: "The workflow function must be deterministic: if executed multiple times, with the same arguments and step return values, the workflow should invoke the same steps with the same inputs in the same order."

WHY_IT_MATTERS=W5's wake identity derivation must be tested under restart with non-deterministic inputs. The test suite should include: (1) restart after FutureTrigger maturity with a different wall clock — verify same occurrence ID, (2) restart with corrupted timestamp in durable state — verify deterministic derivation from trigger/event, not wall clock, (3) two concurrent triggers with identical semantics — verify single wake convergence.

SMALLEST_SAFE_DELTA=Add to artifact 84 section S (test plan) under restart/crash: "Restart with non-deterministic wall clock: verify wake occurrence ID derives from durable trigger/event, not current time. Force-replay test: restart wake admission with different system clock and verify identical occurrence ID."

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=If wake occurrence identity derivation accidentally reads wall clock during restart recovery, the identity would diverge on each restart, violating the singularity contract.

IF_CHANGED_RISK=No risk. Adding deterministic-replay test cases.
```

### OSS-INT-012: Restate Journal Pattern as W6 Retry Authority Refinement

```text
FINDING_ID=OSS-INT-012
PHASE5_WAVE=W6
PHASE5_ARTIFACT=85_W6_R4_FAILURE_RETRY_AUTHORITY_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=settleDurableAttempt; attempt receipt; dispatch_truth
OSS_PROJECT=restatedev/restate
OSS_EXACT_PRIMITIVE_OR_FAILURE=Restate's journal records both the operation and its result durably. On retry, completed steps are skipped and only incomplete steps re-execute. "If sending the receipt fails, Restate automatically retries the function but skips the payment processing since it already completed successfully."
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=docs.restate.dev/foundations/key-concepts; restatedev/restate GitHub
DISPOSITION=MECHANICAL_REFINEMENT
SEVERITY=MEDIUM
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W6 creates DurableAttemptReceipt with attemptId, ordinal, dispatchTruth, and failureClass. The retry ledger tracks attempts and next eligibility. However, the receipt does not explicitly track which sub-operations within an attempt completed versus which failed.

EXTERNAL_EVIDENCE=Restate's journal pattern provides finer-grained progress tracking than Ashley's attempt-level receipt. Each ctx.run block is independently journaled. This allows retry to skip completed sub-operations. Ashley's W6 tracks attempt-level truth but not sub-operation-level truth.

WHY_IT_MATTERS=For Ashley's durable work (e.g., effect dispatch), the attempt-level receipt may be insufficient to determine whether a sub-operation within the attempt completed. However, Ashley's architecture already handles this through operation-specific idempotency (effect receipts, observation subscriptions). The Restate journal pattern is a maturation concern for future sub-operation tracking, not a Phase 5 mechanical requirement.

SMALLEST_SAFE_DELTA=In artifact 85 section Q (observability), add a note that attempt receipts should capture the highest-resolution dispatch truth available from the adapter (not_started / attempted / provider_responded / unknown), and that future maturation may benefit from sub-operation-level journaling. No code change required.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=None for Phase 5. The attempt-level receipt is sufficient for the frozen retry contract.
IF_CHANGED_RISK=None.
```

### OSS-INT-015: Clock Rollback Safety Pattern

```text
FINDING_ID=OSS-INT-015
PHASE5_WAVE=W7
PHASE5_ARTIFACT=86_W7_R5_DURABLE_PRIVATE_BUDGET_MECHANICAL_PLAN.md
PHASE5_EXACT_SECTION_OR_MECHANISM=computePolicyTime; reconcilePolicyClock; CLOCK_DISCONTINUITY_THRESHOLD=5 minutes
OSS_PROJECT=restatedev/restate; dbos-inc/dbos-transact
OSS_EXACT_PRIMITIVE_OR_FAILURE=Restate's TypeScript SDK does not sandbox Date.now() outside ctx.run. DBOS requires all non-deterministic operations (including wall clock reads) to be in steps. Both systems treat clock reads as side effects that must be journaled for determinism.
EVIDENCE_CLASS=CONFIRMED_FROM_SOURCE
SOURCE=tiarebalbi.com/en/blog/durable-execution-replayable-backend-workflows-restate; docs.dbos.dev/architecture
DISPOSITION=MECHANICAL_REFINEMENT
SEVERITY=MEDIUM
CONFIDENCE=HIGH

CURRENT_PHASE5_BEHAVIOR=W7 uses max(lastPolicyNowMs, wallClockNowMs) for policy time and blocks admission when discrepancy >5 minutes. The plan explicitly handles clock rollback: "A greater-than-five-minute discrepancy in either direction blocks new reservations."

EXTERNAL_EVIDENCE=Both Restate and DBOS treat wall clock reads as side effects requiring journaling. Restate's trap is that Date.now() outside ctx.run produces different values on replay. DBOS's solution is to put all non-deterministic operations in steps. Ashley's W7 already handles this correctly through the high-water policy clock pattern, but the test plan should verify that the high-water clock survives restart with a backward clock.

WHY_IT_MATTERS=W7's clock safety is correct. The refinement is to add an explicit test case: restart with wall clock set 10 minutes backward — verify policy time does not move backward and new admissions are blocked. This mirrors the Restate Date.now() trap.

SMALLEST_SAFE_DELTA=Add to artifact 86 section T (failure-injection matrix): "Restart with wall clock 10m backward: policy time high-water preserved, new admissions blocked until clock reconciliation." This is a test hardening.

PHASE4_REOPEN_REQUIRED=no
IF_NO_CHANGE_RISK=None. W7 already has the correct high-water pattern.
IF_CHANGED_RISK=None.
```

## 4. Proposed Phase 5 Deltas

### TEST_HARDENINGS

**H1: BAML-class coercion negative tests (W0)**
- Artifact: 79, section S
- Add `thought/semantic-coercion-rejection.test.ts`
- Cases: string→number, singleton→array, missing optional→null, malformed nested→default
- Each proves strict parser rejects with exact failure code

**H2: Syntactically-valid-but-semantically-wrong adversarial tests (W0/W2)**
- Artifact: 81, section T
- Add three failure-injection cases:
  1. settlement branch with stale Authority epoch
  2. effect_intent with fabricated operation ID
  3. observation_intent with wrong trigger ref
- Each proves full pipeline catches semantic errors

**H3: SpiceDB-class concurrency test for Authority barrier (W4)**
- Artifact: 83, section T
- Add concurrent Authority evaluation under barrier transition
- One reader stable+current, another transitioning+stale
- Stale read refused by publication second fence

**H4: Deterministic replay test for wake identity (W5)**
- Artifact: 84, section S
- Add restart with non-deterministic wall clock
- Verify occurrence ID derives from durable trigger/event, not current time

### MECHANICAL_REFINEMENTS

**R1: Attempt receipt dispatch truth granularity note (W6)**
- Artifact: 85, section Q
- Add observability note: capture highest-resolution dispatch truth from adapter
- Future maturation may benefit from sub-operation-level journaling

**R2: Clock rollback restart test (W7)**
- Artifact: 86, section T
- Add failure-injection case: restart with wall clock 10m backward
- Verify policy time high-water preserved, admissions blocked

### QUALIFICATION_HARDENINGS

**Q1: Independent schema conformance in W2 qualification (W2)**
- Artifact: 81, section S
- Add adversarial case: verify raw model output validates against W0 JSON Schema before parsing
- Independent evidence that model produces schema-valid output

**Q2: Independent plausibility reviewer note (W2)**
- Artifact: 81, section Q
- Note optional strengthening: model-graded plausibility review by independent evaluator
- Not a mechanical requirement, an evidence enhancement

**Q3: Semantic correctness adversarial cases in qualification (W2)**
- Artifact: 81, section T
- Add cases where output is syntactically valid but semantically wrong
- Tests full Authority/Settlement pipeline catches semantic errors

## 5. Architecture Reopen Candidates

NONE

The OSS archaeology confirms all frozen Phase 4 architectural contracts:

- Thought as sole semantic author: confirmed correct by constrained decoding research showing syntactic/semantic gap
- Authority as governance not orchestrator: confirmed correct by SpiceDB/OpenFGA showing authorization must be separate from execution
- Settlement as semantic publication boundary: confirmed correct by Restate/DBOS showing operational truth must be separate from semantic truth
- Kernel mechanics not model meaning: confirmed correct by BAML showing model cannot be trusted for mechanical identity
- One wake one cycle one consequence chain: confirmed correct by Restate showing duplicate delivery creates duplicate histories
- Effect intent != effect completion: confirmed correct by DBOS showing transactional execution requires explicit receipt
- Raw evidence outranks derived state: confirmed correct by SpiceDB New Enemy Problem showing stale derived state can reintroduce revoked access

No mechanical evidence was found that threatens any Phase 4 contract.

## 6. Deferred OSS Knowledge for Cognitive Maturation

**D1: Graphiti temporal semantics**
- Bitemporal representation, provenance tracking, contradiction/supersession
- Useful for future LearnedSelf identity revision with temporal reasoning
- DEFER_TO_MATURATION

**D2: Hindsight/TencentDB hierarchical memory**
- Multi-level memory abstraction, conversation-level vs entity-level
- Useful for future memory architecture evolution
- DEFER_TO_MATURATION

**D3: Acontext skill packaging**
- Skill abstraction patterns for future capability learning
- DEFER_TO_MATURATION

## 7. Deferred Execution/Body Technologies

**S1: ACP/Serena/tree-sitter/ast-grep**
- Code intelligence for future Worker Bridge
- No present MRI intersection
- DEFER_TO_FUTURE_SUBSTRATE

**S2: CubeSandbox/Wasmtime**
- Alternative sandbox substrates
- Current Bubblewrap V2 satisfies requirements
- DEFER_TO_FUTURE_SUBSTRATE

## 8. Final Adversarial Verdict

```text
REFERENCE_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
PHASE5_FUNDAMENTALLY_SOUND=yes
PHASE5_IMPLEMENTATION_READY_AS_WRITTEN=yes
PHASE5_PATCH_BEFORE_LUNA=no
PHASE4_REOPEN_REQUIRED=no
ARCHITECTURE_REOPEN_COUNT=0
BLOCKING_FINDINGS=0
HIGH_FINDINGS=4
TEST_HARDENING_COUNT=4
MECHANICAL_REFINEMENT_COUNT=2
QUALIFICATION_HARDENING_COUNT=3
MATURATION_DEFER_COUNT=3
SUBSTRATE_DEFER_COUNT=2
```

TOP_5_PRE_LUNA_ACTIONS:
1. Add BAML-class coercion negative tests to W0 test suite (H1)
2. Add syntactically-valid-but-semantically-wrong adversarial cases to W2 qualification (H2)
3. Add concurrent Authority evaluation under barrier transition test to W4 (H3)
4. Add deterministic replay test for wake identity under restart to W5 (H4)
5. Add independent schema conformance verification to W2 qualification (Q1)

These are all additive test/qualification hardenings. None change frozen architecture. Phase 5 is implementation-ready as written; the five actions above would make it mechanically stronger before Luna begins.
