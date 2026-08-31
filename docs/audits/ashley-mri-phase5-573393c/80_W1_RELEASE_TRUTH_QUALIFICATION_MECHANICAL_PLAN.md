# 80 — W1 Release Truth and Qualification Substrate Mechanical Plan

## A. WAVE IDENTITY

```text
WAVE_ID=W1
NAME=Release Truth and Qualification Substrate
PHASE4_ARCHITECTURE_SOURCE=66_R3_RELEASE_TRUTH_DESIGN.md; 71_MODEL_FABRIC_THOUGHT_CONTRACT_QUALIFICATION_DESIGN.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md; 74_PHASE5_HANDOFF_READINESS_MATRIX.md
ROOTS/FINDINGS=R3; F007; F009; F010 qualification binding
PREDECESSORS=SOURCE:W0; EVIDENCE:none
PLAN_STATUS=MECHANICALLY_READY
```

## B. PURPOSE

Create immutable evidence for an executable Thought capability and derive Release Truth by exact comparison with the running process. Keep transport readiness, cognitive qualification, release matching, and production acceptance separate.

## C. FROZEN CONTRACT

- `QUALIFICATION` is immutable capability/build-bound evidence.
- `RELEASE_TRUTH` proves that the active release contains exactly that capability.
- The capability fingerprint MUST bind executable/build identity, W0 semantic-contract fingerprint, Kernel Envelope version, parser/validator identity, provider, model/occupant, logical-to-wire binding, schema-enforcement mode, resource-policy fingerprint, and adapter/compatibility identity.
- Primary and fallback occupants require independent results.
- `ASHLEY_RELEASE_ID` is compared evidence. It is not authority by assertion.
- `TRANSPORT_ROUTE_READY`, `THOUGHT_CONTRACT_QUALIFIED`, `RELEASE_TRUTH_MATCHED`, and `PRODUCTION_ACCEPTED` are distinct predicates. Health is derived from them.
- Logical request evidence and emitted wire evidence MUST both exist. Neither substitutes for the other.
- Requested enforcement, emitted request parameters, provider-returned enforcement metadata when available, and empirical conformance are distinct evidence. A provider declaration that is not exposed MUST remain `unavailable`; it MUST NOT be reconstructed from the logical request.
- Transport health MUST NOT make an online provider call.

## D. PRECONDITIONS

1. W0 is `OFFLINE_VERIFIED`, and its contract identifiers are frozen.
2. Work begins from an owner-selected clean candidate or a preserved mixed worktree with named-file staging only.
3. `git rev-parse HEAD`, build identity inputs, active Model Fabric control root, target portfolio revision, and routing configuration are recorded.
4. No qualification is generated until `thoughtOutputStructuredRequest()`, `resolveDispatchContract()`, the Kernel Envelope version, and parser/validator fingerprints can be computed from the same candidate.

## E. SOURCE OWNERSHIP MAP

| FILE | CURRENT_ROLE | PLANNED_CHANGE | WHY_REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/model-fabric/catalog.ts` | Qualification result and binding contracts | Extend qualification subject/binding with immutable capability fingerprint and component identities; keep invalidation explicit | Existing profile-only binding is insufficient |
| `apps/agent-service/src/core/model-fabric/hash.ts` | Stable JSON and SHA-256 | Add canonical capability/resource/validator fingerprint builders or shared primitive calls | One deterministic identity algorithm |
| `apps/agent-service/src/core/model-fabric/types.ts` | Profiles, routes, structured output, receipts | Add typed logical/wire evidence and capability identity references to receipts | Attribute actual dispatch |
| `apps/agent-service/src/core/model-fabric/dispatch-contract.ts` | Resolves trusted structured-output control | Expose canonical logical binding identity and enforcement mode | Bind request intent to wire policy |
| `apps/agent-service/src/core/model-fabric/receipts.ts` | Invocation/attempt receipt builders | Persist capability fingerprint plus emitted-wire digest/mode per attempt | Prove what was sent |
| `apps/agent-service/src/core/model-fabric/activation.ts` | Immutable artifacts, approval, activation validation | Validate exact capability fingerprint and release-truth artifact before activation/readiness | Prevent profile-only or stale evidence use |
| `apps/agent-service/src/core/model-fabric/health.ts` | Derived route health | Add the four independent predicates and mismatch reasons; no network probe | Stop readiness conflation |
| `apps/agent-service/src/mistral-client.ts` | Route resolution and provider dispatch | Capture runtime build/capability identity before attempt and attach wire evidence after request construction | Join running attempt to qualification |
| `apps/agent-service/src/core/model-routing/adapters/nim-adapter.ts` | NIM request construction | Return/record deterministic sanitized wire-control evidence | Prove guided JSON vs JSON Schema |
| `apps/agent-service/src/core/model-routing/adapters/mistral-adapter.ts` | Mistral request construction | Same evidence interface | Independent occupant qualification |
| `apps/agent-service/src/core/model-routing/adapters/groq-adapter.ts` | Groq request construction | Same evidence interface | Independent occupant qualification |
| `apps/agent-service/src/core/model-routing/adapters/zen-adapter.ts` | Zen request construction | Same evidence interface | Independent occupant qualification |
| `apps/agent-service/src/env.ts` | Loads `ASHLEY_RELEASE_ID`; boot validation | Make missing/malformed identity explicit in derived release truth without treating env value as proof | Runtime comparison input |
| `apps/agent-service/src/core/model-fabric/capability-identity.ts` | NEW | Canonical component and aggregate fingerprint builders | Single owner for identity |
| `apps/agent-service/src/core/model-fabric/release-truth.ts` | NEW | Runtime evidence, immutable release comparison, mismatch taxonomy | R3 implementation owner |
| `apps/agent-service/src/core/model-fabric/qualification-ledger.ts` | NEW | Read/write immutable qualification and release-truth artifacts through existing control-root mechanics | Typed evidence boundary |

## F. MUST-NOT-TOUCH MAP

- Do not change provider selection, fallback order, model occupants, reasoning policy, prompts, W0 semantic meaning, or owner activation authority.
- Do not make `/health` perform provider calls.
- Do not make Git SHA alone the capability fingerprint.
- Do not treat route reachability, source tests, activation, deployment, or a matching env string as production acceptance.
- Do not add a second mutable qualification database. Reuse the existing immutable Model Fabric artifact/control-root pattern.

## G. EXISTING SYMBOL INVENTORY

- Catalog: `QualificationResultRecord`, `QualificationBinding`, `createQualificationBinding()`, `qualificationResultUsable()`, `loadFabricCatalog()`, `loadTargetPortfolio()`.
- Integrity/activation: `artifactContentHash()`, `assertArtifactIntegrity()`, `writeImmutableArtifact()`, `writeOwnerArtifact()`, `writeActivePointerAtomic()`, `validateActivation()`, `loadQualification()`, `readValidatedActiveActivation()`.
- Hashing: `stableJson()`, `sha256()`, `sha256Text()`, `freezeDeep()`.
- Dispatch: `THOUGHT_OUTPUT_CONTRACT_ID`, `THOUGHT_OUTPUT_SCHEMA_ID`, `ResolvedDispatchContract`, `resolveDispatchContract()`, `resolveAttemptDispatchContract()`.
- Receipts: `createModelFabricInvocation()`, `attachModelFabricMetadata()`, `ModelInvocationReceipt`, `ModelAttemptReceipt`, `ModelResolvedDispatchFacts`.
- Health: `HealthPredicates`, `healthPredicates()`, `createHealthRegistry()`, `approvedChainFor()`, `walkApprovedChain()`.
- Runtime: `completeChat()`, `MISTRAL_RETRY_CONFIG`, `env.ashleyReleaseId`, `validateBoot()`.
- NIM wire: `buildNimRequestBody()`, `createNimAdapter()`; trusted modes `nim_guided_json` and `nim_response_format_json_schema`.
- Tests: `core/model-fabric/mf-m2.test.ts`, `mf-m3.test.ts`, `mf-m5.test.ts`, `mf-m6.test.ts`, `mf-act.test.ts`, `mf-act-dispatch.test.ts`, `model-routing/adapters/nim-adapter.test.ts`, `mistral-client.test.ts`, `activation-qualification.test.ts`.

## H. NEW/CHANGED TYPES

```ts
type ThoughtResourcePolicyIdentity = Readonly<{
  ordinaryThoughtBudgetMs: 30000;
  interactiveMaxOutput: 4096;
  durableProactiveMaxOutput: 4096;
  structuralRetryMaxOutput: 2048;
  structuralRetriesMaxPerSemanticPass: 2;
  fingerprint: `sha256:${string}`;
}>;

type ThoughtCapabilityComponents = Readonly<{
  executableBuildIdentity: string;
  semanticContractFingerprint: `sha256:${string}`;
  kernelEnvelopeContractVersion: string;
  parserValidatorFingerprint: `sha256:${string}`;
  provider: string;
  configuredModelId: string;
  occupantId: string;
  logicalBindingId: string;
  wireBindingId: string;
  schemaEnforcementMode: "native_json_schema" | "guided_json" | "json_object_compatibility";
  resourcePolicyFingerprint: `sha256:${string}`;
  adapterCompatibilityFingerprint: `sha256:${string}`;
}>;

type ThoughtCapabilityIdentity = Readonly<{
  schema: "ashley.thought.capability_identity.v1";
  components: ThoughtCapabilityComponents;
  fingerprint: `sha256:${string}`;
}>;

type ThoughtQualificationResult = QualificationResultRecord & Readonly<{
  capability: ThoughtCapabilityIdentity;
  logicalEvidence: { contractId: string; schemaFingerprint: string; bindingId: string };
  wireEvidence: {
    adapterId: string;
    wireFormat: string;
    sanitizedBodyDigest: string;
    emittedEnforcementMode: string;
    providerDeclaredEnforcement: string | "unavailable";
  };
  resourceEvidence: { deadlineMs: number; maxOutputTokens: number; attempts: number };
}>;

type ReleaseTruthResult = Readonly<{
  schema: "ashley.release_truth.v1";
  releaseTruthId: string;
  observedAt: string;
  releaseIdClaim: string | null;
  processIdentity: { pid: number; startedAt: string; executableBuildIdentity: string };
  runtimeCapabilityFingerprint: string;
  qualificationResultId: string | null;
  qualifiedCapabilityFingerprint: string | null;
  matched: boolean;
  mismatchCodes: readonly ReleaseTruthMismatchCode[];
  contentHash: string;
}>;

type ReleaseTruthMismatchCode =
  | "release_id_missing" | "release_id_malformed" | "qualification_missing"
  | "qualification_invalidated" | "build_identity_mismatch"
  | "semantic_contract_mismatch" | "kernel_envelope_mismatch"
  | "parser_validator_mismatch" | "occupant_mismatch" | "wire_binding_mismatch"
  | "schema_enforcement_evidence_mismatch"
  | "resource_policy_mismatch" | "adapter_compatibility_mismatch";
```

## I. DATABASE / SCHEMA PLAN

No SQLite migration is authorized for W1. Qualification and Release Truth remain immutable content-hashed artifacts under the existing Model Fabric control root. Add `qualifications/<qualificationResultId>.json` fields through a new schema version and add `release-truth/<releaseTruthId>.json`; never rewrite an existing ID. Old v1 results remain readable for historical audit but are ineligible for the W1 Thought capability because they lack the aggregate fingerprint. Pending/malformed/newer schemas fail closed. Atomic temp-file, fsync, rename, and directory-sync behavior must match `writeImmutableArtifact()`. Rollback selects an earlier independently qualified capability; it does not mutate evidence.

## J. FUNCTION-LEVEL CHANGE PLAN

### `buildThoughtCapabilityIdentity()` — new

```text
CURRENT=No aggregate capability identity.
TARGET=Canonicalize all required components with stableJson(), hash once, deep-freeze.
INPUT=Build, W0, Model Fabric, resource, and adapter component identities.
OUTPUT=ThoughtCapabilityIdentity.
SIDE_EFFECT=None.
TRANSACTION=None.
ERRORS=capability_component_missing; capability_component_invalid.
CALLERS=qualification harness; completeChat pre-dispatch; releaseTruthForRuntime.
TESTS=capability-identity.test.ts.
```

### `createQualificationBinding()` / `qualificationResultUsable()`

```text
CURRENT=Binds PASS result to profile/inference identities.
TARGET=Additionally require exact aggregate capability fingerprint and eligible W1 schema.
INPUT=Result, policy row, occupant, profile, expected capability.
OUTPUT=Immutable binding or typed rejection.
SIDE_EFFECT=None.
TRANSACTION=None.
ERRORS=qualification_capability_missing; qualification_capability_mismatch.
CALLERS=activation and qualification artifact creation.
TESTS=mf-m3.test.ts; qualification-ledger.test.ts.
```

### `resolveDispatchContract()`

```text
CURRENT=Resolves semantic structured-output request to trusted logical/wire control.
TARGET=Return stable logicalBindingId, wireBindingId, and schemaEnforcementMode used in capability identity.
INPUT=Policy, occupant, response format, structured request.
OUTPUT=Extended ResolvedDispatchContract.
SIDE_EFFECT=None.
TRANSACTION=None.
ERRORS=Existing ModelFabricDispatchContractError plus binding identity failure.
CALLERS=completeChat(); attempt resolution.
TESTS=mf-m2.test.ts; dispatch-contract.test.ts.
```

### adapter request builders

```text
CURRENT=Build provider bodies.
TARGET=Return { body, evidence } where evidence contains adapter version, wire mode, schema digest, and sanitized body digest; exclude messages, secrets, and raw user content.
INPUT=Resolved attempt contract and completion request.
OUTPUT=Provider body plus WireDispatchEvidence.
SIDE_EFFECT=None before fetch.
TRANSACTION=None.
ERRORS=structured_output_untrusted; wire_evidence_unavailable.
CALLERS=Adapter complete methods.
TESTS=Each adapter test; NIM strongest-path cases.
```

### `completeChat()`

```text
CURRENT=Creates invocation/attempt receipts and dispatches through selected adapter.
TARGET=Capture runtime capability by value before dispatch; attach logical and actual wire evidence to the exact attempt.
INPUT=CompletionOptions plus trusted W0 projection identity.
OUTPUT=CompletionResult with attributable Model Fabric receipt.
SIDE_EFFECT=Provider call only after durable/caller provenance requirements hold.
TRANSACTION=No database transaction; receipt construction is monotonic in memory and caller persists it.
ERRORS=release_truth_unmatched is admission failure for activated Thought; existing provider failures remain transport outcomes.
CALLERS=W0 runThoughtModel and non-Thought callers; enforce only for logicalRole=thought.
TESTS=mistral-client.test.ts; mf-act-dispatch.test.ts.
```

### `releaseTruthForRuntime()` — new

```text
CURRENT=No exact active-release comparison.
TARGET=Load eligible immutable qualification; independently compute runtime identity; compare every component; emit all mismatch codes.
INPUT=Process/build observation, ASHLEY_RELEASE_ID claim, active activation, qualification ledger.
OUTPUT=ReleaseTruthResult.
SIDE_EFFECT=Optional immutable evidence write; no network.
TRANSACTION=One atomic artifact publication.
ERRORS=Artifact integrity/read/schema failures are mismatch evidence, never PASS.
CALLERS=health derivation; owner diagnostics; Thought activation admission.
TESTS=release-truth.test.ts; activation-qualification.test.ts.
```

### `healthPredicates()`

```text
CURRENT=Derives Model Fabric route predicates.
TARGET=Expose four separate booleans and reasons; never collapse them to one stored flag.
INPUT=Route config/credentials, qualification, release comparison, production witness reference.
OUTPUT=Derived health projection.
SIDE_EFFECT=None; no provider call.
TRANSACTION=None.
ERRORS=Unavailable evidence yields false plus reason.
CALLERS=health/status handlers and dispatch admission.
TESTS=mf-m5.test.ts; health.test.ts.
```

## K. STATE MACHINE

```text
UNOBSERVED
  -> TRANSPORT_ROUTE_READY | TRANSPORT_ROUTE_NOT_READY
TRANSPORT_ROUTE_READY
  -> THOUGHT_CONTRACT_NOT_QUALIFIED | THOUGHT_CONTRACT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED
  -> RELEASE_TRUTH_UNMATCHED | RELEASE_TRUTH_MATCHED
RELEASE_TRUTH_MATCHED
  -> DEPLOYED_UNPROVEN -> PRODUCTION_ACCEPTED
any evidence state -> INVALIDATED
INVALIDATED -> new qualification only; never back to qualified in place
```

## L. TRANSACTION BOUNDARIES

Qualification creation atomically publishes one immutable file after all evidence is complete. Release Truth atomically publishes one comparison artifact. Active-pointer change remains its existing independent owner-authorized atomic operation. A pointer MUST NOT reference a result until artifact integrity, capability identity, approval, and release comparison all pass.

## M. CONCURRENCY CONTRACT

Content-address or uniquely identify artifacts. Creation with an existing ID MUST compare bytes and reject differing content. Active pointer retains single atomic replacement. Each runtime process reports PID/start identity, so a stale process cannot satisfy a new process's comparison. Two writers may create identical content under different result IDs, but activation names one exact result. No last-writer-wins qualification flag exists.

## N. RESTART / CRASH CONTRACT

- Crash before rename: temp file is non-authoritative and cleaned/reconciled.
- Crash after file rename before directory sync: startup integrity scan treats uncertain persistence as unusable until present and valid.
- Crash after qualification but before Release Truth: qualification exists; release remains unmatched.
- Crash after Release Truth but before active-pointer update: no activation.
- Process restart changes process identity and requires a fresh runtime comparison; immutable qualification may be reused only if capability components match.
- Stale `ASHLEY_RELEASE_ID` can never override computed mismatch.

## O. FAILURE TAXONOMY

`TRANSPORT_ROUTE_NOT_READY` is routing/config. `THOUGHT_CONTRACT_NOT_QUALIFIED` is evidence. `RELEASE_TRUTH_UNMATCHED` is runtime comparison. `PRODUCTION_NOT_ACCEPTED` is lifecycle. Artifact codes: `qualification_missing`, `qualification_invalidated`, `qualification_integrity_invalid`, `qualification_schema_unsupported`, `capability_*_mismatch`, `wire_evidence_unavailable`, `release_id_missing`, `release_id_malformed`. Provider failures remain provider/runtime outcomes and do not rewrite qualification evidence.

## P. IDEMPOTENCY / RECONCILIATION

Fingerprints are pure and deterministic. Re-running an identical offline qualification may yield a new run/result ID but the same capability fingerprint. Startup enumerates referenced artifacts, validates content hashes, and marks dangling or corrupt references unusable. Reconciliation never repairs content; it only reports or repoints through owner-authorized artifacts.

## Q. OBSERVABILITY

Authoritative: immutable qualification result, content hash, active activation/approval artifacts, immutable Release Truth result, production witness accepted through its governing protocol. Non-authoritative: `/health`, logs, `ASHLEY_RELEASE_ID` alone, route availability, source HEAD alone, test output alone. Diagnostics expose fingerprint components, result IDs, process identity, four predicates, and mismatch codes; never secrets or prompt/user content.

## R. LEGACY INERTNESS

Existing `ashley.evaluation.qualification_result.v1` profile-only records remain audit-readable but cannot qualify W0. Compatibility rows cannot become qualification. `ASHLEY_RELEASE_ID` equality alone cannot set readiness. Existing route health cannot promote qualification or production acceptance. No legacy `RELEASE_QUALIFIED` status can be read as `PRODUCTION_ACCEPTED`.

## S. TEST PLAN

- Unit: new `core/model-fabric/capability-identity.test.ts`, `release-truth.test.ts`, `qualification-ledger.test.ts`; stable ordering, every component mutation, malformed/newer schemas, secret exclusion.
- Integration: extend `mf-m2.test.ts`, `mf-m3.test.ts`, `mf-m5.test.ts`, `mf-m6.test.ts`, `mf-act.test.ts`, `mf-act-dispatch.test.ts`, `activation-qualification.test.ts`, `mistral-client.test.ts`.
- Adapter: extend all adapter tests; NIM verifies both guided JSON and response-format JSON Schema and captures actual chosen mode.
- Concurrency: duplicate ID/different bytes, simultaneous active-pointer writers, two processes with distinct start identities.
- Restart/crash: every boundary in N.
- Adversarial: forged release ID; swapped model; same Git SHA with changed built output; changed README with identical executable capability; changed parser; changed resource policy; fallback using primary evidence; logical binding that differs from actual wire.
- Qualification-negative: logical request claims stronger enforcement than the emitted request or available provider evidence proves. The result is not qualified under the stronger mode. Absence of provider-declared grammar-engine metadata remains explicit `unavailable` and empirical qualification carries the remaining burden.
- Regression: non-Thought routes continue without W1 Thought gating; transport health performs zero fetches.

## T. FAILURE-INJECTION MATRIX

| Injection | Required result |
|---|---|
| Flip any capability component | Different fingerprint; mismatch |
| Forge `ASHLEY_RELEASE_ID` | No match without computed build/capability equality |
| Corrupt artifact byte | Integrity failure; unusable |
| Swap primary/fallback result | Occupant mismatch |
| Adapter emits different mode | Wire-binding mismatch |
| Logical mode stronger than emitted/observable enforcement | `schema_enforcement_evidence_mismatch`; stronger capability not qualified |
| Drop actual wire evidence | Qualification fails |
| Crash before/after rename | No partial authoritative artifact |
| Disable network during health | Health still returns derived transport state without fetch |

## U. QUALIFICATION COMMANDS

```powershell
npm test --prefix apps/agent-service -- src/core/model-fabric/capability-identity.test.ts src/core/model-fabric/release-truth.test.ts src/core/model-fabric/qualification-ledger.test.ts
npm test --prefix apps/agent-service -- src/core/model-fabric/mf-m2.test.ts src/core/model-fabric/mf-m3.test.ts src/core/model-fabric/mf-m5.test.ts src/core/model-fabric/mf-m6.test.ts src/core/model-fabric/mf-act.test.ts src/core/model-fabric/mf-act-dispatch.test.ts src/activation-qualification.test.ts src/mistral-client.test.ts
npm run build:agent
```

Paths are repository-relative. Luna MUST first confirm the workspace script accepts Vitest passthrough in the current `package.json`; otherwise use the exact current equivalent without changing gate scope.

## V. ACCEPTANCE EVIDENCE

An exact candidate packet contains candidate SHA/build identity, full test command/output, component manifest and aggregate fingerprint, primary/fallback separate result IDs, logical and sanitized-wire evidence, artifact hashes, mismatch test results, and reviewer identity. Offline evidence can establish source/candidate qualification. It cannot establish deployment or production acceptance.

## W. PRODUCTION WITNESS

The witness must observe the running PID/start identity, deployed executable/build identity, active activation and occupant, runtime capability fingerprint, exact qualification result, `RELEASE_TRUTH_MATCHED=true`, and separately governed production acceptance. It MUST prove no compatibility or fallback occupant borrowed another occupant's result. A health response alone is insufficient.

## X. STOP CONDITIONS

Stop on W0 instability; inability to derive an identity component; need to change occupant/routing policy; evidence requiring raw secrets/content; existing artifact rules unable to preserve immutability; logical/wire evidence disagreement; or conflict with Phase 4. Return `IMPLEMENTATION_BLOCKED=<exact contradiction>`.

## Y. IMPLEMENTATION CHECKLIST

1. Freeze W0 identifiers and resource policy.
2. Add pure component/aggregate fingerprint builders and mutation tests.
3. Version the qualification record and require aggregate capability identity.
4. Add logical binding identity to dispatch resolution.
5. Add sanitized actual-wire evidence to each adapter and attempt receipt.
6. Add immutable Release Truth artifact and comparison taxonomy.
7. Tighten activation validation and derived health predicates.
8. Run focused unit, integration, concurrency, restart, and adversarial tests.
9. Build agent-service.
10. Produce exact-candidate evidence; stop before provider qualification, activation, deployment, or production acceptance.
