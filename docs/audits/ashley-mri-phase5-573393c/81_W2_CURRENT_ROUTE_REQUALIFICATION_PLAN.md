# 81 — W2 Current Route Requalification Plan

## A. WAVE IDENTITY

```text
WAVE_ID=W2
NAME=Current Route Requalification
PHASE4_ARCHITECTURE_SOURCE=62_F010_REVISED_CLOSURE_CONTRACT.md; 66_R3_RELEASE_TRUTH_DESIGN.md; 71_MODEL_FABRIC_THOUGHT_CONTRACT_QUALIFICATION_DESIGN.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md; 74_PHASE5_HANDOFF_READINESS_MATRIX.md
ROOTS/FINDINGS=F010; R3
PREDECESSORS=SOURCE:W0,W1; EVIDENCE:W0_OFFLINE_VERIFIED,W1_OFFLINE_VERIFIED
FIRST_CANDIDATE=nim/openai/gpt-oss-20b
PLAN_STATUS=MECHANICALLY_READY_QUALIFICATION_ONLY
```

## B. PURPOSE

Qualify the current Thought occupant against the successor W0 semantic contract and W1 immutable capability identity. This wave does not redesign routing and does not select a replacement.

## C. FROZEN CONTRACT

- Use one exact candidate, the W0 strict parser/Kernel Envelope, and the W1 capability evidence format.
- Use the shared `30000ms` whole-Thought policy and output limits `4096/4096/2048`, with at most two structural corrections per semantic pass.
- Test the strongest path mechanically supported by the current NIM binding. Record the logical request and actual wire mode.
- PASS requires: transport success; nonempty raw content; strict semantic parse; Kernel Envelope binding; stale/current fencing; reachable Authority path; nonempty/plausible semantic output; and resource-policy compliance.
- Record JSON syntax, independent closed-schema conformance, strict-parser result, and semantic validity separately. Structural PASS never implies semantic PASS.
- No tolerant normalization. No silent model/provider substitution.
- A current-route failure returns `NOT_QUALIFIED`, then stops at the owner-approved expansion-selection gate.

## D. PRECONDITIONS

1. W0 and W1 exact source candidates are accepted for qualification.
2. `nim/openai/gpt-oss-20b` still resolves from current `registry.ts`, portfolio, activation, and environment. If it does not, record the divergence and stop.
3. Exact candidate build, W0/W1 fingerprints, NIM adapter identity, credential presence, route configuration, and qualification environment are captured before any live call.
4. Owner separately authorizes the bounded live provider run. Phase 5 planning itself does not authorize it.
5. Qualification uses an isolated temporary data root; no production database or service.

## E. SOURCE OWNERSHIP MAP

| FILE | CURRENT_ROLE | PLANNED CHANGE | WHY REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/agency/thought-live-provider-preflight.ts` | Legacy live structured-Thought preflight | Do not reuse semantically; retain as source evidence for bounded CLI, temporary DB, and credential checks | It targets the legacy Agency Thought contract |
| `apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts` | NEW | Exact W0/W1 qualification runner with fixture and separately authorized live modes | Successor boundary needs its own harness |
| `apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts` | NEW | Offline deterministic harness tests | Prove gates without provider cost |
| `apps/agent-service/src/core/cognitive-v021/thought/run.ts` | W0 invocation path | Add only a qualification seam if W0 does not already expose one; no semantic fork | Exercise real path |
| `apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts` | W0 schema/fingerprint | Read unchanged | Exact contract input |
| `apps/agent-service/src/core/cognitive-v021/thought/parse.ts` | Strict semantic parser | Read unchanged | PASS gate |
| `apps/agent-service/src/core/cognitive-v021/thought/kernel-envelope.ts` | W0 deterministic binding | Read unchanged | PASS gate |
| `apps/agent-service/src/core/model-fabric/qualification-ledger.ts` | W1 evidence writer | Publish one immutable result after complete run | Acceptance evidence |
| `apps/agent-service/src/core/model-fabric/release-truth.ts` | W1 runtime comparison | Bind exact qualification candidate | No floating result |
| `apps/agent-service/src/core/model-routing/registry.ts` | Current route declarations | Read unchanged | Verify current candidate |
| `apps/agent-service/src/core/model-routing/adapters/nim-adapter.ts` | NIM wire path | Read/observe through W1 evidence; no W2 redesign | Strongest wire proof |
| `apps/agent-service/src/mistral-client.ts` | Actual Model Fabric dispatch | Exercise with one route/no fallback qualification policy | Attempt identity and receipts |

## F. MUST-NOT-TOUCH MAP

No changes to route order, target portfolio, active pointer, provider credentials, production DB, running service, Discord, Mint, prompts, allocator, Authority semantics, or fallback selection. Do not reuse `core/agency/thought-live-provider-preflight.ts` as proof of the successor contract. Do not write PASS after partial checks.

## G. EXISTING SYMBOL INVENTORY

- Current candidate declarations: `model-routing/registry.ts`, `attention/governor.ts`, `env.nimApiKey`.
- Runtime: `completeChat()`, `MISTRAL_RETRY_CONFIG={ strategy: "none" }`, `runThoughtModel()`, `thoughtOutputStructuredRequest()`, `parseThoughtStepOutput()` and W0 successors.
- Wire: `buildNimRequestBody()`, `createNimAdapter()`, `nim_guided_json`, `nim_response_format_json_schema`, `structured_output_untrusted`.
- Attempt evidence: `createModelFabricInvocation()`, `beginAttempt()`, `markDispatchAttempted()`, `markProviderResponse()`, receipts and W0 captured invocation.
- Legacy harness: `runPreflight()` and CLI in `core/agency/thought-live-provider-preflight.ts`; it creates a temporary `preflight.db` and requires explicit `--live`.
- Existing tests: `thought/run.test.ts`, `thought/parse.test.ts`, `model-fabric/mf-m2.test.ts`, `mf-act-dispatch.test.ts`, `model-routing/adapters/nim-adapter.test.ts`, `mistral-client.test.ts`.

## H. NEW/CHANGED TYPES

```ts
type ThoughtQualificationCaseId =
  | "settlement" | "observation_intent" | "effect_intent" | "abstain"
  | "structural_correction" | "stale_before_publish" | "authority_revision";

type ThoughtQualificationCaseResult = Readonly<{
  caseId: ThoughtQualificationCaseId;
  invocationIds: readonly string[];
  providerAttemptIds: readonly string[];
  transport: "success" | "failure";
  rawContentBytes: number;
  jsonSyntax: "pass" | "fail";
  closedSchemaConformance: "pass" | "fail";
  strictParser: "pass" | "fail";
  kernelBinding: "pass" | "fail";
  fencing: "pass" | "fail";
  authorityReachability: "pass" | "fail";
  semanticValidity: "pass" | "fail";
  resourcePolicy: "pass" | "fail";
  elapsedMs: number;
  outputTokens: number | null;
  failureCodes: readonly string[];
}>;

type ThoughtRouteQualification = Readonly<{
  schema: "ashley.thought.route_qualification.v1";
  candidate: { provider: "nim"; model: "openai/gpt-oss-20b"; occupantId: string };
  capabilityFingerprint: string;
  runId: string;
  environment: "fixture" | "isolated_live";
  cases: readonly ThoughtQualificationCaseResult[];
  verdict: "PASS" | "NOT_QUALIFIED" | "NOT_RUN" | "OUTCOME_UNKNOWN";
}>;
```

## I. DATABASE / SCHEMA PLAN

No repository database migration. Live qualification uses a fresh temporary nuclear/cognitive store only if the real W0 path requires persistence. W1 writes the final immutable artifact outside SQLite. A crash leaves no promotable partial result. Production databases are prohibited. Fixture updates cover all four semantic branches and infrastructure failures.

## J. FUNCTION-LEVEL CHANGE PLAN

### `runThoughtCapabilityQualification()` — new

```text
CURRENT=No successor-contract qualification runner.
TARGET=Run declared cases through the real W0/W1 path and require every PASS predicate.
INPUT=Exact build/capability identity, provider/model, mode, isolated paths, fixed cases, deadline clock.
OUTPUT=ThoughtRouteQualification plus W1 result when and only when verdict PASS.
SIDE_EFFECT=Fixture: none outside temp files. Live: bounded provider calls after separate authorization.
TRANSACTION=One case result becomes immutable only after its entire invocation chain terminates; aggregate artifact written last.
ERRORS=Typed NOT_RUN, NOT_QUALIFIED, OUTCOME_UNKNOWN; thrown errors become case evidence.
CALLERS=Qualification CLI only.
TESTS=thought-capability-qualification.test.ts.
```

### `evaluateQualificationCase()` — new

```text
CURRENT=No conjunctive gate evaluator.
TARGET=Fail on any missing predicate, tolerant parse, inferred branch, identity mismatch, deadline overrun, empty semantics, unsupported commitment, fabricated claim under missing evidence, branch/payload inconsistency, or irrelevant/non-allowlisted evidence selection.
INPUT=Raw response, W0 bound output, receipts, timing, fence/Authority trace.
OUTPUT=ThoughtQualificationCaseResult.
SIDE_EFFECT=None.
TRANSACTION=None.
ERRORS=All gate-specific codes retained; no normalization.
CALLERS=runThoughtCapabilityQualification().
TESTS=Mutation table covering every required field.
```

Before calling the W0 parser, the qualification harness validates the raw
response against the exact exported W0 successor schema through a
qualification-only deterministic oracle. The W0 exported schema remains the
sole schema authority.

The oracle keyword contract is:

- derive the supported JSON Schema keyword inventory from the exact exported
  successor W0 schema;
- enumerate as qualification evidence the distinct keywords actually emitted
  by that exact schema;
- support exactly that enumerated subset;
- fail closed on any encountered keyword outside that subset;
- perform no defaults, coercion, normalization, branch inference, semantic
  validation, or repair;
- require any added, removed, or changed emitted keyword to alter the
  oracle/qualification identity or fail drift tests until explicitly supported;
- treat the keyword inventory as qualification evidence, never as a second
  schema authority.

At the reference SHA no JSON Schema validator dependency exists. Luna MUST first
re-inspect the current dependency graph. Do not add Promptfoo, BAML, tolerant
repair, or a new runtime dependency.

### `main()` qualification CLI — new

```text
CURRENT=Legacy Agency CLI exists.
TARGET=Default fixture/offline mode; live mode requires `--live`, exact `--provider nim --model openai/gpt-oss-20b`, bounded `--samples`, output directory, and explicit no-fallback assertion.
INPUT=CLI and environment.
OUTPUT=Machine JSON and human summary.
SIDE_EFFECT=Live provider request only in authorized live mode; immutable artifact only after complete PASS.
TRANSACTION=None beyond W1 artifact publication.
ERRORS=Credential/config/candidate mismatch yields NOT_RUN before dispatch.
CALLERS=Operator in a separately authorized qualification session.
TESTS=CLI argument and zero-network default tests.
```

## K. STATE MACHINE

```text
PLANNED -> PREFLIGHTED -> FIXTURE_PASS
FIXTURE_PASS -> LIVE_AUTHORIZATION_REQUIRED
LIVE_AUTHORIZATION_REQUIRED -> LIVE_RUNNING -> PASS | NOT_QUALIFIED | OUTCOME_UNKNOWN
PASS -> IMMUTABLE_RESULT_WRITTEN
NOT_QUALIFIED -> EXPANSION_SELECTION_GATE_REQUIRED
OUTCOME_UNKNOWN -> RECONCILIATION_REQUIRED
```

No automatic edge exists from failure to another occupant.

## L. TRANSACTION BOUNDARIES

Persist W0 invocation provenance at/before each dispatch per W0. Bind response to that record. Perform the publication second fence inside W0 transaction. Write the W1 qualification artifact only after all required cases and fingerprints pass. Never publish a provisional PASS.

## M. CONCURRENCY CONTRACT

Use a unique run ID and isolated directory. Hold a run-level exclusive lock for the provider/model/capability tuple to prevent two live campaigns from generating competing conclusions. Each provider invocation has a fresh invocation and attempt identity. Structural correction shares cycle/generation/pass but not invocation identity. Stale generation cases never publish.

## N. RESTART / CRASH CONTRACT

Crash before dispatch is `NOT_RUN`. Crash after dispatch without attributable response is `OUTCOME_UNKNOWN`, not retry authorization. Crash after response before case persistence is reconstructed only from durable W0/W1 receipts; otherwise unknown. Crash after cases but before aggregate write requires re-evaluation of stored immutable case evidence, not a provider replay. Temporary stores are not production state.

## O. FAILURE TAXONOMY

Preflight: `candidate_route_mismatch`, `credential_missing`, `capability_fingerprint_mismatch`, `live_authority_missing`. Runtime: provider unavailable, timeout, cancelled, malformed JSON, schema violation, deadline exhaustion. Semantic: empty/unplausible semantic branch, branch unsupported, reference allowlist failure. Control: provenance mismatch, stale generation/epoch, Authority unreachable. These are kernel/runtime outcomes, never semantic `abstain`.

## P. IDEMPOTENCY / RECONCILIATION

Fixture runs are repeatable from fixed seeds. Live calls are not replayed after ambiguous transport. Reconcile the exact attempt receipt/provider evidence first. A new authorized run receives a new run and invocation identity. Duplicate successful runs may share capability fingerprint, but each qualification result remains immutable.

## Q. OBSERVABILITY

Authoritative: exact W1 qualification result and its linked invocation/attempt receipts. Supporting: raw-content digest/size, strict-parser result, bound-output digest, fence trace, Authority trace, timings, token usage, actual wire mode. Logs and human plausibility notes are non-authoritative; plausibility is a required reviewed gate but cannot override a deterministic failure. Never store secrets or full private prompt content in the artifact.

## R. LEGACY INERTNESS

`core/agency/thought-live-provider-preflight.ts` cannot qualify W0. Historical GPT-OSS-20B passes cannot be imported. JSON repair/coercion and permissive parsing are forbidden. Groq or other fallbacks cannot answer a NIM qualification case. Existing active route state cannot imply qualification.

## S. TEST PLAN

- Unit: new qualification runner/evaluator/CLI tests; every conjunct independently false; every semantic branch; infrastructure failure distinct from abstain.
- Integration: real W0 parser, Kernel Envelope, Attention provenance, Model Fabric receipts, Authority reachability, and publication fence using mocked NIM adapter.
- Concurrency/restart/crash: duplicate campaign lock, crash boundaries, stale response, structural-correction fresh invocation identity.
- Adversarial: tolerant JSON candidate; kernel field spoofing; response attributed to current rather than captured route; output alias collision; second-fence race; provider changes wire mode; elapsed 30001ms; primary call fails and fallback succeeds.
- Semantic adversarial: schema-valid branch/payload mismatch; unsupported commitment despite allowlisted evidence; fabricated current claim when evidence is absent; observation request that cannot satisfy `evidenceNeed`; effect request inconsistent with `expectedOutcome`; irrelevant support selection. Kernel-owned cycle/generation/epoch/IDs/trigger fields remain forbidden-field cases, not semantic-wrong fixtures.
- Strict-parser value: a deterministic accepted-transport fixture returns raw content that passes the provider/wire structural condition but fails the W0 parser. Record `PROVIDER_ACCEPTED_PARSER_REJECTED` as a required negative harness witness. It proves parser independence; it is not a successful occupant sample and cannot contribute to PASS.
- Regression: focused W0/W1 suites and adapter request tests.

## T. FAILURE-INJECTION MATRIX

| Injection | Verdict |
|---|---|
| Empty content after HTTP success | `NOT_QUALIFIED` |
| Markdown-fenced/coercible JSON | `NOT_QUALIFIED` |
| Raw JSON is syntactically valid but fails exact closed schema | `NOT_QUALIFIED`; schema and parser evidence retained separately |
| Provider/wire accepts value that strict parser rejects | Required `PROVIDER_ACCEPTED_PARSER_REJECTED` negative harness witness; candidate PASS unaffected only because this is a declared falsification fixture |
| Exact schema passes but semantic claim is unsupported/fabricated | `NOT_QUALIFIED`; semantic failure retained separately |
| Valid abstain branch | May PASS if all deterministic gates pass |
| Timeout/provider unavailable | `NOT_QUALIFIED`, runtime code retained |
| Ambiguous sent request | `OUTCOME_UNKNOWN`; no replay |
| Generation changes before publish | `NOT_QUALIFIED`; zero semantic write |
| Authority path absent | `NOT_QUALIFIED` |
| Fallback answers | `NOT_QUALIFIED` for NIM candidate |
| 30-second wall clock exceeded | `NOT_QUALIFIED` |

## U. QUALIFICATION COMMANDS

Offline implementation gates:

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts src/core/cognitive-v021/thought/run.test.ts src/core/cognitive-v021/thought/parse.test.ts src/core/model-fabric/mf-act-dispatch.test.ts src/core/model-routing/adapters/nim-adapter.test.ts src/mistral-client.test.ts
npm run build:agent
```

Planned live command, NOT authorized by this document:

```powershell
npx tsx apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts --live --provider nim --model openai/gpt-oss-20b --no-fallback --samples 3 --output <isolated-output-directory>
```

The implementing agent MUST reconcile the exact workspace invocation with current `package.json` before use.

## V. ACCEPTANCE EVIDENCE

Candidate packet: exact SHA/build; W0/W1 component fingerprints; fixed case manifest; fixture output; separately authorized live output; provider/model and actual wire mode; invocation/attempt IDs; raw digests/sizes; parser/binder/fence/Authority/resource gates; full commands and outputs; artifact hashes; reviewer conclusion. PASS is conjunctive.

## W. PRODUCTION WITNESS

W2 itself does not activate or deploy. Later production witness must link the running release to this exact capability via W1 and observe at least one attributable W0 invocation without stale publication, while keeping production acceptance separate. A live qualification call against NIM is not a deployed-service witness.

## X. STOP CONDITIONS

Stop if W0/W1 is not frozen; the current candidate differs; live authority is absent; isolation cannot be guaranteed; route fallback cannot be disabled/proven absent; strict output is mechanically unsupported; any PASS conjunct fails; outcome is ambiguous; or replacement selection is needed. Return `NOT_QUALIFIED` and `OWNER_APPROVED_EXPANSION_SELECTION_REQUIRED=yes`; never select a replacement.

## Y. IMPLEMENTATION CHECKLIST

1. Verify exact W0/W1 candidate and current NIM occupant.
2. Build successor-contract offline runner and conjunctive evaluator.
3. Prove default zero-network behavior and isolated storage.
4. Run fixture cases through real W0/W1 components.
5. Build and freeze exact candidate.
6. Stop for explicit live-run authorization.
7. If authorized, run the bounded NIM-only campaign once.
8. Classify PASS, NOT_QUALIFIED, NOT_RUN, or OUTCOME_UNKNOWN without repair.
9. On PASS, write immutable W1 evidence. On failure, stop at the owner gate.
