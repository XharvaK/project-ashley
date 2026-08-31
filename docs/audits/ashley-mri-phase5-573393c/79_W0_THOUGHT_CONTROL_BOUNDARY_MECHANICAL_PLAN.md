# 79 — W0 Thought-Control Boundary Mechanical Plan

## A. Wave identity

```text
WAVE_ID=W0
NAME=THOUGHT_CONTROL_BOUNDARY
PHASE4_ARCHITECTURE_SOURCE=57,58,59,60,61,62,72
ROOTS_FINDINGS=F010;R1_LEAF;F011_PREDECESSOR
PREDECESSORS=NONE
```

## B. Purpose

Replace model-authored operational identity with the strict four-branch semantic core. Bind each response to the exact persisted Attention/Model Fabric attempt. Preserve Thought semantic authorship, strict parsing, Authority evaluation, Settlement publication, and stale-response refusal.

## C. Frozen contract

- Model emits exactly one of `settlement`, `observation_intent`, `effect_intent`, `abstain`.
- Kernel never infers branch or meaning.
- Existing references come from a captured allowlist.
- Output-local aliases are ephemeral and resolve atomically.
- Attention/Model Fabric owns the one durable invocation truth.
- Two currentness fences are mandatory.
- Structural correction keeps semantic pass/projection and receives a fresh invocation.
- Authority revision advances semantic pass.
- `abstain` is disjoint from runtime failure.
- JSON syntax and closed-schema validity do not establish semantic validity. Branch/payload consistency, evidence support, and proposal responsibility remain separate gates.
- Whole-Thought deadline is 30,000 ms; output ceilings are 4,096/4,096/2,048.

## D. Preconditions

1. Exact base SHA is `573393c3fdb2392a45137d4625635658eb4b5d88`.
2. Read Phase 4 artifacts 57–62 and global artifact 72.
3. Inspect the current worktree and preserve unrelated changes.
4. Use disposable nuclear and cognitive-sidecar databases only.
5. Do not call a real provider during source settlement.

## E. Source ownership map

| FILE | CURRENT_ROLE | PLANNED_CHANGE | WHY_REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/cognitive-v021/types.ts` | Current model-echo Thought types and 10-second constant | Add successor semantic/envelope/boundary types; set 30-second constant; retire model-owned mechanics from `ThoughtStepOutput` | Frozen ownership |
| `apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts` | Five-form model-echo JSON schema | Replace with closed four-branch semantic schema and new fingerprint/version | Strict successor contract |
| `apps/agent-service/src/core/cognitive-v021/thought/parse.ts` | Parses asserted identities and flat drafts | Parse semantic core only; require captured attempt context; reject unknown fields/refs/aliases | No tolerant repair |
| `apps/agent-service/src/core/cognitive-v021/thought/run.ts` | Allocates, invokes, parses, operates, revises, publishes | Carry absolute deadline and persisted attempt identity; build envelope; separate correction/revision; bind operations | Control boundary |
| `apps/agent-service/src/core/cognitive-v021/thought/kernel-envelope.ts` | New | Construct and validate `KernelEnvelope` only from captured facts | Isolate mechanical ownership |
| `apps/agent-service/src/core/cognitive-v021/thought/reference-allowlist.ts` | New | Build/fingerprint exact model-visible reference allowlist and validate returned refs | Reference currentness |
| `apps/agent-service/src/core/cognitive-v021/thought/operation-binding.ts` | New | Convert semantic observation/effect intent into kernel-owned durable proposals | Durable identity ownership |
| `apps/agent-service/src/core/cognitive-v021/settlement/validate.ts` | Validates echoed identity and current settlement | Validate kernel-bound semantic settlement/abstain and reference/alias rules | Boundary validation |
| `apps/agent-service/src/core/cognitive-v021/settlement/publish.ts` | Sidecar semantic transaction and first-generation check | Add second full fence and atomic alias allocation/resolution | Publication currentness |
| `apps/agent-service/src/core/cognitive-v021/authority/check.ts` | Evaluates settlement/proposal packs | Accept kernel-bound semantic values; remove model revision/completion claims | Authority truth |
| `apps/agent-service/src/core/cognitive-v021/thought/counters.ts` | Durable attempt/pass/revision counters | Expose kernel `revisionCount` and separate structural attempt/pass semantics | Revision ownership |
| `apps/agent-service/src/core/cognitive-v021/thought/diagnostics.ts` | Projection/attempt diagnostics | Record allocation ID, MF invocation/attempt IDs, envelope/contract IDs, both fences | Attribution |
| `apps/agent-service/src/core/model-routing/types.ts` | Completion options/result contracts | Add trusted `thoughtInvocationContext`; require returned accepted attempt identity for Thought | Dispatch linkage |
| `apps/agent-service/src/mistral-client.ts` | Model Fabric + Attention dispatch | Persist exact MF attempt/wire facts before adapter send; return them unchanged | Actual attempt truth |
| `apps/agent-service/src/core/attention/types.ts` | Accepted Attention dispatch identity | Rename semantic meaning to allocation identity and include MF invocation/attempt/wire facts | Remove ambiguity |
| `apps/agent-service/src/core/attention/ledger.ts` | Durable `attention_requests` writes | Add create/bind/read functions for Thought attempt context | Persist before send |
| `apps/agent-service/src/core/attention/governor.ts` | Admission, running, completion lifecycle | Bind exact attempt context before provider adapter call | Binding moment |
| `apps/agent-service/src/core/cognitive-v021/migration-43.ts` | New | Add W0 attempt columns/indexes to `attention_requests` | Nuclear v43 |
| `apps/agent-service/src/core/cognition/schema-contract.ts` | Nuclear content validator | Validate v43 columns/indexes and reject newer/partial content | Migration safety |
| `apps/agent-service/src/core/db.ts` | Nuclear migration orchestrator | Import/apply/validate v43 and derive supported version | Persisted truth |
| `apps/agent-service/src/core/cognitive-v021/test-support.ts` | Current echo-shaped fixtures | Produce exact semantic outputs and captured attempt fixtures | Focused tests |

## F. Must-not-touch map

- Do not change Identity, Mind State meaning, Expression semantics, Rendering, Discord delivery policy, Sandbox, Recall, C1–C5, provider selection, route activation, W4 Authority transition barrier, W5 wake semantics, W6 retry law, W7 budget law, or W9.
- Do not qualify `nim/openai/gpt-oss-20b` in W0.
- Do not preserve legacy output acceptance as a silent compatibility fallback.

## G. Existing symbol inventory

| Surface | Existing symbols |
|---|---|
| Thought types | `ThoughtSettlementDraft`, `ThoughtStepOutput`, `ObservationRequest`, `EffectProposal`, `ThoughtInput`, `ThoughtCompleteOptions`, `KernelDeps` |
| Contract | `THOUGHT_OUTPUT_SCHEMA`, `THOUGHT_OUTPUT_SCHEMA_FINGERPRINT`, `thoughtOutputCompatibilityInstruction`, `thoughtOutputStructuredRequest` |
| Parse | `ThoughtParseActiveIdentity`, `parseThoughtStepOutput`, `thoughtStepBaseFor` |
| Run | `runThoughtModel`, `runCognitiveCycle`, `ThoughtInvocation`, `invokeThoughtComplete`, `STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS` |
| Settlement | `validateThoughtSettlementDraft`, `assertValidThoughtSettlementDraft`, `publishSemanticTransaction`, `getPublishedSettlementIdentity` |
| Authority | `checkAuthority`, `loadAuthorityPacks`, `MAX_AUTHORITY_REVISIONS` |
| Attempt counters | `getThoughtAttemptCounters`, `incrementThoughtAttemptCounter`, table `thought_attempt_counters` |
| Attention | `insertQueuedRequest`, `tryAdmitRequest`, `markRunning`, `completeRequest`, predecessor `AcceptedDispatchIdentity` (retired by W0), table `attention_requests` |
| Model Fabric | `completeChat`, `createModelFabricInvocation`, `beginAttempt`, `ModelAttemptReceipt`, `ModelFabricDispatchMetadata` |
| Projection | `allocateThoughtProjection`, `ProjectionCache`, `semanticPassKey`, projection/message hashes |
| Existing tests | `thought/parse.test.ts`, `thought/run.test.ts`, `thought/operation-loop.test.ts`, `thought/__tests__/retry-projection.test.ts`, `thought/__tests__/observation-identity.test.ts`, `settlement/validate.test.ts`, `settlement/publish.test.ts`, `authority/check.test.ts`, `attention/attention.test.ts`, `model-fabric/mf-m2.test.ts` |

## H. New and changed types

Use the exact semantic field shapes from Phase 4 artifact 58. The implementable top-level source contract is:

```text
RENAME:
AcceptedDispatchIdentity
-> ThoughtInvocationContext + CapturedModelAttemptIdentity

AcceptedDispatchIdentity is retired. No dual-identity compatibility alias may
survive. No reader may continue treating the predecessor shape as a second
provenance truth.
```

`ThoughtInvocationContext` is the trusted pre-dispatch Thought context.
`CapturedModelAttemptIdentity` is the exact actual attempt bound before dispatch
and returned unchanged for response attribution. Together they replace, rather
than supplement, `AcceptedDispatchIdentity`.

```ts
export type ThoughtSemanticOutput =
  | SettlementSemanticOutput
  | ObservationIntentSemanticOutput
  | EffectIntentSemanticOutput
  | AbstainSemanticOutput;

export type ThoughtInvocationContext = {
  invocationId: string;              // fresh UUID per provider attempt
  allocationId: number;              // attention_requests.id
  cycleId: CycleId;
  generation: Generation;
  semanticPass: number;
  structuralAttemptOrdinal: number;
  authorityEpoch: AuthorityEpoch;
  authorityVersionVector: Readonly<Record<string, string | number>>;
  triggerRef: string;
  semanticProjectionHash: string;
  dispatchMessagesHash: string;
  allowlistFingerprint: string;
  absoluteDeadlineAtMs: number;
};

export type CapturedModelAttemptIdentity = {
  allocationId: number;
  modelFabricInvocationId: string;
  modelFabricAttemptId: string;
  attemptOrdinal: number;
  dispatchSequence: number;
  routeAlias: string | null;
  provider: ProviderId;
  configuredModelId: string;
  occupantId: string;
  modelEpoch: number;
  contractId: string;
  buildIdentity: string;
  logicalStructuredOutputId: string;
  semanticSchemaFingerprint: string;
  actualWireBindingId: string;
  schemaEnforcementMode: string;
  resourcePolicyFingerprint: string;
};

export type KernelEnvelope = ThoughtInvocationContext & {
  protocolIdentity: string;
  kernelEnvelopeVersion: "ashley.thought.kernel-envelope.v1";
  parserValidatorIdentity: string;
  runtimeArtifactIdentity: string;
  capturedAttempt: CapturedModelAttemptIdentity;
  responseHash: string;
};

export type KernelBoundThoughtOutput = {
  envelope: KernelEnvelope;
  semantic: ThoughtSemanticOutput;
  structuralValidity: "valid";
};

export type ThoughtRuntimeOutcome =
  | "provider_unavailable" | "timeout" | "malformed_json"
  | "schema_violation" | "deadline_exhausted" | "cancelled_invocation"
  | "stale_response" | "revision_budget_exhausted"
  | "pass_budget_exhausted" | "outcome_unknown";
```

`CompletionOptions` gains only a trusted code-owned field:

```ts
thoughtInvocationContext?: Omit<ThoughtInvocationContext, "allocationId">;
```

Provider adapters MUST NOT accept this field from untrusted model output.

## I. Database and schema plan

### Nuclear migration 43

Create `apps/agent-service/src/core/cognitive-v021/migration-43.ts`:

```sql
ALTER TABLE attention_requests ADD COLUMN thought_invocation_id TEXT;
ALTER TABLE attention_requests ADD COLUMN thought_cycle_id TEXT;
ALTER TABLE attention_requests ADD COLUMN thought_generation INTEGER;
ALTER TABLE attention_requests ADD COLUMN thought_semantic_pass INTEGER;
ALTER TABLE attention_requests ADD COLUMN thought_structural_attempt INTEGER;
ALTER TABLE attention_requests ADD COLUMN thought_authority_epoch INTEGER;
ALTER TABLE attention_requests ADD COLUMN thought_authority_vector_json TEXT;
ALTER TABLE attention_requests ADD COLUMN thought_trigger_ref TEXT;
ALTER TABLE attention_requests ADD COLUMN semantic_projection_hash TEXT;
ALTER TABLE attention_requests ADD COLUMN dispatch_messages_hash TEXT;
ALTER TABLE attention_requests ADD COLUMN allowlist_fingerprint TEXT;
ALTER TABLE attention_requests ADD COLUMN mf_invocation_id TEXT;
ALTER TABLE attention_requests ADD COLUMN mf_attempt_id TEXT;
ALTER TABLE attention_requests ADD COLUMN actual_provider TEXT;
ALTER TABLE attention_requests ADD COLUMN actual_occupant_id TEXT;
ALTER TABLE attention_requests ADD COLUMN actual_wire_binding_id TEXT;
ALTER TABLE attention_requests ADD COLUMN schema_enforcement_mode TEXT;
ALTER TABLE attention_requests ADD COLUMN resource_policy_fingerprint TEXT;
ALTER TABLE attention_requests ADD COLUMN absolute_deadline_at_ms INTEGER;
CREATE UNIQUE INDEX attention_requests_thought_invocation
  ON attention_requests(thought_invocation_id)
  WHERE thought_invocation_id IS NOT NULL;
CREATE UNIQUE INDEX attention_requests_mf_attempt
  ON attention_requests(mf_attempt_id)
  WHERE mf_attempt_id IS NOT NULL;
```

Add CHECK validation in `ensureNuclearV43Schema`/`validateNuclearV43Schema`:

- all Thought-specific fields are either all null for non-Thought work or contain the complete pre-dispatch subset;
- generation/pass/structural ordinal are non-negative integers;
- deadline is positive;
- MF attempt identity is unique once bound.

The observed reference state is:

```text
REFERENCE_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
OBSERVED_NUCLEAR_BASELINE_VERSION=41
NUCLEAR_SUPPORTED_VERSION=42
W0_MIGRATION_43_FREE_AT_REFERENCE=yes
W4_MIGRATION_44_FREE_AT_REFERENCE=yes
```

Immediately before creating migration 43, Luna MUST re-inspect the actual
migration files, `OBSERVED_NUCLEAR_BASELINE_VERSION`, and
`NUCLEAR_SUPPORTED_VERSION`. If migration 43 or 44 is no longer free, stop:

```text
IMPLEMENTATION_BLOCKED=MIGRATION_VERSION_COLLISION
```

Do not silently renumber. Artifacts 79, 83, and 88 encode one cumulative
migration dependency and MUST be reconciled together before any new number is
selected. When the collision check passes, W0 updates
`OBSERVED_NUCLEAR_BASELINE_VERSION` from 41 to 42 so
`NUCLEAR_SUPPORTED_VERSION` derives 43, extends the
`validateNuclearSchemaContent` union to 43, and preserves continuity migration
protocol and newer-content rejection.

No cognitive-sidecar schema migration is required in W0. `thought_steps.payload_json` and `thought_attempt_counters` already preserve per-pass results/counters. If implementation discovers an inability to record objection resolution without adding a sidecar table, stop with `PHASE5_ARCHITECTURE_BLOCKER`; do not create a second invocation authority.

## J. Function-level change plan

### `thoughtOutputStructuredRequest`

```text
CURRENT=returns ashley.thought.step.v1 with model-echo mechanics
TARGET=returns ashley.thought.semantic.v1 closed four-branch schema
INPUT=none
OUTPUT=StructuredOutputRequest with schema fingerprint
SIDE_EFFECT=none
TRANSACTION=none
ERRORS=schema construction failure at build/test time
CALLERS=runThoughtModel; MF-M1/M2 tests; adapters
TESTS=output-contract tests; adapter structured-output tests
```

### `parseThoughtStepOutput`

```text
CURRENT=reads/asserts cycle/generation/pass/request/occupant and flat settlement
TARGET=parseThoughtSemanticOutput(raw, capturedAllowlist)
INPUT=raw response + captured allowlist
OUTPUT=ThoughtSemanticOutput | ThoughtStructuralFailure
SIDE_EFFECT=none
TRANSACTION=none
ERRORS=typed invalid_json/root/wrong_kind/unknown_field/reference/alias/domain-schema failures
CALLERS=runThoughtModel
TESTS=parse.test.ts; new semantic-output-contract.test.ts
```

Delete fallback numeric/string coercion from semantic parsing. A mechanical field in output is an unknown/forbidden field.

### `insertQueuedRequest` / `markRunning`

```text
CURRENT=persist Attention allocation; mark accepted contract/build before dispatch
TARGET=persist ThoughtInvocationContext at queue; bind MF attempt/wire facts before adapter send
INPUT=Attention input + trusted Thought context + resolved MF attempt facts
OUTPUT=allocation ID and complete CapturedModelAttemptIdentity
SIDE_EFFECT=attention_requests writes
TRANSACTION=each transition uses BEGIN IMMEDIATE/CAS expected state
ERRORS=thought_attempt_context_incomplete; thought_attempt_already_bound; stale_attention_state
CALLERS=attention governor / completeChat dispatch closure
TESTS=attention.test.ts; new kernel-envelope integration test
```

### `completeChat`

```text
CURRENT=creates MF invocation/attempt and returns optional metadata after dispatch
TARGET=bind exact MF attempt, occupant, logical/wire, and resource facts to the Attention row before adapter call; return the same identity
INPUT=messages + CompletionOptions.thoughtInvocationContext
OUTPUT=completion with required accepted attempt identity for purpose=thought
SIDE_EFFECT=durable attempt bind and receipt completion
TRANSACTION=no SQLite transaction held across provider call
ERRORS=attempt_bind_failed; attempt_identity_mismatch; existing dispatch errors
CALLERS=invokeThoughtComplete and other completion users
TESTS=mf-m1/mf-m2; attention; mocked Thought integration
```

### `runThoughtModel`

```text
CURRENT=creates requestId, parses using current input identity
TARGET=create fresh invocationId; pass trusted context; require returned captured attempt; parse semantic core; build KernelEnvelope
INPUT=projected Thought input + pass/structural ordinal/deadline/allowlist
OUTPUT=KernelBoundThoughtOutput or typed runtime outcome
SIDE_EFFECT=Attention/MF attempt evidence through completeChat
TRANSACTION=none across provider call
ERRORS=missing/mismatched attempt identity; strict parse; cancellation; timeout
CALLERS=runCognitiveCycle; focused tests
TESTS=run.test.ts; retry-projection; diagnostics; stale/preemption tests
```

### `bindObservationIntent`

```text
CURRENT=model returns ObservationRequest including requestId/cycle/generation/replaySafe
TARGET=kernel creates requestId/correlation/deadline/replay classification from registry
INPUT=KernelBound Thought observation intent + cycle + remaining deadline
OUTPUT=ObservationRequest
SIDE_EFFECT=none until existing observation execution/persistence
TRANSACTION=none
ERRORS=unknown_operation_kind; operation_schema_invalid; deadline_exhausted
CALLERS=runCognitiveCycle
TESTS=observation-identity.test.ts; operation-loop.test.ts
```

### `bindEffectIntent`

```text
CURRENT=model returns effectId/idempotencyKey/authorityEpoch
TARGET=kernel creates effectId/correlation/idempotency/deadline/replay classification
INPUT=KernelBound Thought effect intent + active Authority/cycle
OUTPUT=EffectProposal
SIDE_EFFECT=none before existing dispatchEffect transaction
TRANSACTION=existing effect admission remains authoritative
ERRORS=unknown_operation_kind; operation_schema_invalid; deadline_exhausted
CALLERS=runCognitiveCycle
TESTS=operation-binding.test.ts; operation-loop.test.ts
```

### `validateThoughtSettlementDraft`

```text
CURRENT=validates model-echo identity, effectsCompleted, objectionsApplied/revisionCount
TARGET=validate semantic settlement + kernel envelope + current allowlist/alias rules
INPUT=KernelBoundThoughtOutput + publication active snapshot
OUTPUT=SettlementProposal or typed refusal
SIDE_EFFECT=none
TRANSACTION=none
ERRORS=semantic malformed; stale; conflict; invalid ref/alias
CALLERS=runCognitiveCycle
TESTS=settlement/validate.test.ts
```

### `publishSemanticTransaction`

```text
CURRENT=checks cycle generation then applies sidecar deltas
TARGET=BEGIN IMMEDIATE; compare complete publication fence; allocate/resolve aliases; apply approved semantic mutations once
INPUT=SettlementProposal + expected fence
OUTPUT=PublishedSettlement/publication refusal
SIDE_EFFECT=canonical sidecar semantic writes and outbox projection
TRANSACTION=one sidecar transaction
ERRORS=stale_cycle; stale_generation; stale_pass; stale_authority; invalidated_evidence; alias_conflict; receipt_unresolved
CALLERS=runCognitiveCycle
TESTS=publish.test.ts; publication-fence.integration.test.ts
```

## K. State machine

```text
allocated
-> attempt_bound
-> dispatched
-> response_recorded
-> strict_valid | structural_invalid | runtime_failed
-> current | stale_or_cancelled
-> authority_accepted | authority_rejected | revision_requested | awaiting_operation
-> publication_committed | publication_refused
```

Structural invalidity may loop to a new `attempt_bound` under the same semantic pass at most twice. Authority revision advances the pass. Every provider loop creates a fresh invocation ID.

## L. Transaction boundaries

1. Attention allocation insert is atomic.
2. Actual MF attempt bind uses expected Attention state before provider send.
3. Provider call occurs with no SQLite write transaction held.
4. Attempt completion/receipt is atomic and cannot replace bound identity.
5. Sidecar operation admission uses existing effect/observation transactions.
6. Final alias allocation, fence comparison, semantic deltas, settlement row, causal ledger, cycle state, and outbox row commit in one `publishSemanticTransaction`.

## M. Concurrency contract

- Unique invocation and MF-attempt indexes reject double bind.
- Attention state CAS rejects two dispatchers.
- Active Thought cancellation revokes publication eligibility even if transport cannot cancel.
- Sidecar unique `(cycle_id,generation)` settlement plus pass/fence checks prevents double publication.
- Alias allocation occurs only while the publication write lock is held.

## N. Restart and crash contract

| Crash boundary | Required recovery |
|---|---|
| Before Attention allocation commit | No attempt exists; safe new admission |
| After allocation, before attempt bind | Terminal/recover as not dispatched; no response attribution |
| After attempt bind, before adapter send | Reconcile dispatch truth; do not infer sent/not-sent from process death |
| During provider call | Mark runtime outcome unknown/aborted per receipt evidence; no blind replay |
| After response receipt, before sidecar step | Attention/MF truth remains; response may be diagnostic but cannot publish without exact link |
| After parse, before Authority | Resume only if cycle/generation/pass/fence still current; otherwise stale terminal |
| During publication | SQLite rollback; no aliases or partial semantic deltas survive |
| After publication, before projection | Existing outbox recovery reprojects idempotently |

## O. Failure taxonomy

Add exact codes:

```text
thought_invalid_json
thought_schema_violation
thought_unknown_field
thought_reference_not_allowlisted
thought_alias_duplicate
thought_operation_schema_invalid
thought_attempt_context_missing
thought_attempt_identity_mismatch
thought_stale_after_parse
thought_stale_at_publication
thought_deadline_exhausted
thought_cancelled
thought_revision_exhausted
thought_pass_exhausted
thought_outcome_unknown
```

None maps to semantic `abstain`.

## P. Idempotency and reconciliation

- Attempt identity is immutable after bind.
- Structural retry has a new invocation/MF attempt and the same semantic projection/pass.
- Publication is idempotent on accepted cycle/generation/pass/invocation.
- Observation/effect idempotency derives from kernel registry and accepted semantic output hash.
- Output-local aliases never persist as a second lookup namespace.

## Q. Observability

Authoritative: `attention_requests` attempt identity/state, sidecar cycle/settlement/operation/receipt rows.

Non-authoritative: diagnostics and raw response hashes.

Every diagnostic joins allocation ID, MF invocation/attempt ID, Thought invocation ID, cycle/generation/pass/structural ordinal, semantic/schema/envelope/parser fingerprints, logical/wire mode, resource policy, both fence results, and terminal outcome.

## R. Legacy inertness

- Old `schemaVersion`, `architectureEpoch`, `cycleId`, `generation`, `pass`, `requestId`, `occupantId`, `authorityEpoch`, `triggerRef` output fields must cause strict rejection under the successor contract.
- Flat `ThoughtSettlementDraft`, `observation_request`, `effect_proposal`, and model-authored `failure` output paths become unreachable when the successor contract is active.
- `objectionsApplied`, model `revisionCount`, model `effectsCompleted`, model `replaySafe`, model `idempotencyKey`, and model operation IDs must have no successor reader.
- Existing historical `thought_steps` remain readable diagnostics. They are not reparsed into current semantics.

## S. Test plan

### New tests

- `thought/semantic-output-contract.test.ts`: all four branches; unknown fields; mechanical fields; registered operation schemas; empty/minimal objects; strict rejection of string-to-number/boolean, loose enum/case, singleton-to-array, missing-to-null/default, malformed-nested-to-null/default, and ambiguous/additional forbidden fields. No case may be repaired or defaulted.
- `thought/kernel-envelope.test.ts`: captured identity, mismatch, current-state drift, actual wire facts.
- `thought/reference-allowlist.test.ts`: supplied refs, stale refs, alias uniqueness/cross-pass refusal.
- `thought/operation-binding.test.ts`: kernel IDs, idempotency, deadlines, receipt truth.
- `thought/publication-fence.integration.test.ts`: Authority/cycle/evidence changes between parse and commit.
- `cognitive-v021/migration-43.test.ts`: clean/upgrade/partial/newer-content/schema validation.

The semantic-validity adversarial set uses only Thought-owned fields from Phase 4 artifact 58. It includes: branch/payload inconsistency; a syntactically valid settlement whose commitment is unsupported by its allowlisted `evidenceUse`; a fabricated current claim when evidence is absent; an `observation_intent` whose requested operation cannot satisfy its stated `evidenceNeed`; an `effect_intent` whose request conflicts with its stated `expectedOutcome`; and allowlisted-but-irrelevant evidence selection. Kernel-owned `authorityEpoch`, durable operation/request IDs, `triggerRef`, cycle, generation, or route facts are separate forbidden-field fixtures, never semantic-wrong fixtures.

### Existing tests to rewrite or extend

- `thought/parse.test.ts`
- `thought/run.test.ts`
- `thought/operation-loop.test.ts`
- `thought/__tests__/retry-projection.test.ts`
- `thought/__tests__/observation-identity.test.ts`
- `thought/counters.integration.test.ts`
- `settlement/validate.test.ts`
- `settlement/publish.test.ts`
- `authority/check.test.ts`
- `attention/attention.test.ts`
- `model-fabric/mf-m1.test.ts`
- `model-fabric/mf-m2.test.ts`
- `model-routing/adapters/nim-adapter.test.ts`
- `acceptance/q2-repair.integration.test.ts`

## T. Failure-injection matrix

| Injection | Expected proof |
|---|---|
| Route changes after dispatch | Captured attempt remains original; current route does not rewrite it |
| Generation changes during provider call | First fence refuses |
| Authority changes after parse | Publication fence refuses with zero deltas |
| Cancellation races response | Response diagnostic only; no Authority/publication |
| Duplicate alias | Strict failure before Authority |
| Alias allocation collision | Publication rollback |
| Structural retry response arrives after successor | Old attempt stale |
| Effect dispatch receipt unknown | No completion claim and no replay |
| Deadline expires during operation | Typed deadline/unknown result; no extra clock |
| BAML-class coercible value | Strict schema failure; zero defaulting or semantic repair |
| Structurally valid but unsupported semantic claim | Semantic/Authority qualification failure; no publication |
| Crash at every table transition | Required recovery in section N |

## U. Qualification commands

Run from repository root:

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/thought/semantic-output-contract.test.ts src/core/cognitive-v021/thought/kernel-envelope.test.ts src/core/cognitive-v021/thought/reference-allowlist.test.ts src/core/cognitive-v021/thought/operation-binding.test.ts
npm test --prefix apps/agent-service -- src/core/cognitive-v021/thought/parse.test.ts src/core/cognitive-v021/thought/run.test.ts src/core/cognitive-v021/thought/operation-loop.test.ts src/core/cognitive-v021/thought/publication-fence.integration.test.ts
npm test --prefix apps/agent-service -- src/core/cognitive-v021/settlement/validate.test.ts src/core/cognitive-v021/settlement/publish.test.ts src/core/cognitive-v021/authority/check.test.ts
npm test --prefix apps/agent-service -- src/core/attention/attention.test.ts src/core/model-fabric/mf-m1.test.ts src/core/model-fabric/mf-m2.test.ts src/core/cognitive-v021/migration-43.test.ts
npm run build:agent
```

At candidate freeze, run the full corpus once if Wave Acceptance requires it. Do not run a provider or Mint qualification in W0.

## V. Acceptance evidence

- Red/green behavioral evidence for strict branches and mechanical-field rejection.
- Migration 42→43 and clean-v43 evidence.
- Persisted exact attempt identity before dispatch.
- Structural correction identity/projection evidence.
- Authority revision/pass evidence.
- Both currentness fences and zero-write stale refusal.
- Atomic alias resolution and receipt-truth evidence.
- Build/typecheck result.

## W. Production witness

Deferred to W1/W2/W3. A later exact active release witness must show the qualified semantic contract, actual invocation attribution, strict parse, fence results, and Authority/Settlement path. W0 tests do not establish production acceptance.

## X. Stop conditions

Stop if:

- actual MF attempt identity cannot be persisted before/at dispatch without a competing authority;
- publication cannot atomically compare the required fence and bind aliases;
- an operation kind lacks a deterministic closed registry schema;
- legacy echo acceptance is required for current production continuity;
- migration 43 cannot preserve existing Attention rows;
- implementation would require W4 barrier, W5 wake, provider qualification, activation, or W9 work.

## Y. Implementation checklist

- [ ] Verify exact base/worktree and focused source symbols.
- [ ] Write migration 43 tests and prove RED.
- [ ] Implement v43 Attention attempt columns/validation and prove GREEN.
- [ ] Write semantic contract/parser tests and prove RED.
- [ ] Implement exact Phase 4 semantic types/schema/parser and prove GREEN.
- [ ] Write attempt binding/envelope tests and prove RED.
- [ ] Extend Attention/MF/completeChat binding and prove GREEN.
- [ ] Write operation-ID/receipt tests and prove RED.
- [ ] Implement kernel observation/effect binding and prove GREEN.
- [ ] Write double-fence/alias transaction tests and prove RED.
- [ ] Implement validation/publication boundary and prove GREEN.
- [ ] Rewrite legacy fixture tests to successor contract.
- [ ] Run focused W0 unit/integration/failure-injection gates.
- [ ] Run agent build/typecheck.
- [ ] Record evidence and stop at candidate review.
