# Project Ashley Model Fabric Architecture

**Status:** `CURRENT PHASE CONTRACT`

**Date:** 2026-08-21

**Implementation status:** Planned. Current source has Ashley-owned purpose and
route logic plus provider adapters. It does not implement this contract.
Implementation currently waits on the owner-selected Sandbox delivery gate and
exact first-slice dependency qualification. That wait is delivery order, not
semantic or authority derivation from Sandbox.

**Scope:** Architecture only. This document does not authorize implementation,
provider activation, model migration, Sandbox changes, deployment, capability
promotion, or Recall changes.

**Historical filename note:** Frozen field contracts and the first-slice
specification remain in
[`Model_Fabric_01_Contract_Draft.md`](Model_Fabric_01_Contract_Draft.md). That
filename is retained for provenance. The canonical phase name is Model Fabric.

## 1. Purpose

Model Fabric is Ashley's semantic dispatch boundary over replaceable provider
mechanisms. It decides which mechanical model capability may serve an Ashley
purpose, under what budget, privacy, reliability, cancellation, and receipt
rules, without letting a provider, SDK, session, or model identifier own
meaning.

It answers:

> Which bounded model attempt may run, for which purpose, with which exact
> projection, and what mechanical facts did that attempt produce?

It does not answer:

> What does Ashley believe, want, remember, or authorize?

Model Fabric is mechanism work, not cognitive advancement. Completing a
Fabric slice does not graduate Thought, Agency, or Learned Autonomy.

## 2. Vision and Principle basis

Model Fabric serves the Vision by keeping Ashley one subject across changing
providers. Continuity, judgment, refusal, and identity cannot be outsourced to
a model family.

It preserves:

- Ashley owns meaning. Substrates provide mechanisms.
- One Ashley. Bounded specialists are not peer identities.
- Connection, availability, and a configured model ID are not capability.
- Context is bounded attention over persistent state.
- Telemetry is not evidence. A receipt is not an Effect Witness.
- Architecture before prompting.

## 3. New capability

The phase adds:

- provider-neutral `ModelCapabilityProfile` mechanics;
- Ashley-owned purpose and route policy;
- bounded `SpecialistSession` correlation and budget;
- immutable caller-built `ContextProjection` transport;
- one-attempt receipts, cancellation, privacy classification, and structured
  failure;
- explicit fallback policy, including the first-slice prohibition on fallback;
- a temporary compatibility resolver with explicit removal criteria.

## 4. Explicit non-capabilities

```text
MODEL ID IS NOT ARCHITECTURAL IDENTITY.
PROVIDER SDK IS NOT ROUTING AUTHORITY.
SPECIALIST SESSION IS NOT ASHLEY.
CONTEXT PROJECTION IS NOT CONTEXT BUDGET.
RECEIPT IS NOT QUALIFICATION.
FALLBACK IS NOT RELIABILITY BY DEFAULT.
```

Model Fabric does not add:

- Thought, Agency, Identity, Mind State, Recall, or relationship authority;
- Context Budget selection, compression, eviction, or retrieval ownership;
- execution, credential, browser, Git, deployment, or external-effect
  authority;
- automatic promotion of a profile, provider, or fallback;
- a second specialist registry inside Sandbox;
- OpenTelemetry types inside semantic domain contracts.

## 5. Predecessor and dependency contracts

Classified dependencies. See
[Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md#31-dependency-classes).

`OWNER_SELECTED_IMPLEMENTATION_ORDER`:

- current Sandbox delivery gate. Model Fabric does not derive authority or
  semantic ownership from Sandbox.

`CROSS_CUTTING_INTERFACE`:

- Evaluation / Qualification Plane for profile qualification meaning;
- Observability Plane for the Ashley-owned telemetry port;
- current Identity, Mind State, Thought, Agency, and privacy boundaries.

Supporting, not semantic, predecessors:

- [`docs/Routing_Status.md`](../Routing_Status.md) for current route facts;
- Memory Evidence only where a later purpose must cite evidence identity;
- Operational Continuity only when a later specialist run is durable work.

First-slice package and transport qualification is evidence, not architecture.

Context Budget is a later consumer. Model Fabric must expose the minimal typed
`ContextProjection` envelope now and must not pre-implement selection,
hierarchy, compression, or optimization.

## 6. Current owner to final owner

| Concern | Current owner | Final owner |
|---|---|---|
| Semantic purpose | Caller (Thought, Expression, cognition, engineering) | Same caller |
| Route and model binding | Split among `config/models.json`, `PURPOSE_TO_ROUTE`, and registry dispatch | Ashley `ModelRoutePolicy` plus validated registry snapshot |
| Provider wire conversion | Provider adapters | `ModelProviderAdapter` |
| Context content | Context Composer and caller | Caller-built `ContextProjection`; later Context Budget selects it |
| Qualification and promotion | Capability / owner decisions | Evaluation Plane plus explicit promotion |
| Telemetry transport | Process logs and owner diagnostics | Observability Plane port with optional adapters |

## 7. State introduced and its owner

| Record | Owner | Meaning |
|---|---|---|
| `ModelCapabilityProfile` | Model Fabric | Mechanical capability, privacy ceiling, reliability class, structured-output contract, and binding identity. Not qualification history. |
| `ResolvedModelRoute` | Model Fabric | Immutable dispatch decision for one attempt. |
| `SpecialistSession` | Model Fabric | Bounded specialist-work correlation, budget, and output contract. Not a worker, Ashley, or authority container. |
| `ContextProjection` | Caller policy plus Context Composer | Immutable model-facing content artifact. Rebuildable. Not memory. |
| `ModelAttempt` / `ModelAttemptReceipt` | Model Fabric | One provider request and its mechanical outcome. |
| `ModelRoutePolicy` | Model Fabric | Semantic purpose to eligible profile mapping. |

Live route values remain policy. They live in source/config and
[`docs/Routing_Status.md`](../Routing_Status.md), not in this architecture.

## 8. Authority added and explicitly not added

The phase may add authority to:

- dispatch one admitted model attempt for one purpose;
- bind one exact projection and profile;
- cancel an in-flight attempt;
- record a receipt;
- refuse dispatch when policy, budget, privacy, or profile qualification fails.

It does not add authority to interpret the result, materialize memory, start
initiative, invoke tools, or execute effects. A specialist cannot widen its
purpose, budget, or privacy ceiling.

## 9. Request, intent, and proposal ontology

The dispatch ontology is:

```text
caller purpose and output contract
  -> SpecialistSession
    -> ContextProjection
      -> ModelRoutePolicy
        -> ResolvedModelRoute
          -> ModelAttempt
            -> ModelAttemptReceipt
              -> caller-owned validation and materialization
```

A model response is a candidate input. It is not a decision, memory, or
authorization.

These identifiers are not interchangeable:

| Identifier | Meaning |
|---|---|
| `thought_observation` | Current attention/routing purpose requested by the observation job |
| `utility_bulk` | Current configured compatibility route for that purpose |
| `thought` | Route currently forced by `runThoughtModel` |
| `thought.observation` | Planned Model Fabric semantic purpose |
| `thought_observation_shadow` | Planned default-off first-slice mode |

## 10. Mechanism boundary

AI SDK is approved only as a bounded mechanism spike. It may not own routes,
fallback, budgets, agents, tools, or authority.

Provider adapters convert Ashley contracts to wire contracts. They must not
select purposes, expand context after dispatch, or retry beyond the resolved
reliability class.

OpenTelemetry is a candidate adapter beneath the Observability Plane port, not
a required semantic interface. OpenInference and Phoenix are optional, privacy-
reviewed candidates. Inspect AI is a later evaluation substrate, not acceptance
authority.

## 11. Privacy and secret policy

Every attempt binds a privacy classification and disclosure ceiling. Prompts,
outputs, credentials, private paths, raw memory, and chain of thought are
denied to telemetry by default.

A lower-trust profile receives only the projection authorized for that exact
request. Compatibility shims must not copy a higher-trust prompt into a
lower-trust provider.

## 12. Resource and budget policy

Each attempt and specialist session has ceilings for tokens, time, cost,
retries, and output size. The first Thought-observation slice is
`single_attempt` with `fallbackRouteIds = []` and at most one provider
request.

Budget exhaustion fails closed. It does not select a different provider or
widen privacy.

## 13. Evidence contract

A Model Fabric receipt may prove:

- profile, route, provider, and model-binding identity;
- projection content binding or content-free fingerprint as specified;
- attempt start, cancellation, transport outcome, and structured-failure class;
- token, latency, and cost facts reported by the adapter.

It may not prove that Ashley accepted the result, that the result is true, or
that an external effect occurred.

Qualification of a profile is owned by the Evaluation / Qualification Plane.
A passing local test is not `RELEASE_QUALIFIED`.

## 14. Operational or cognitive truth contract

Operational truth: whether an attempt was admitted, dispatched, cancelled,
received, or remained `OUTCOME_UNKNOWN` after send.

Cognitive truth remains with Thought and other semantic owners after they
validate the candidate.

A second structural provider request at the current Thought seam is a known
source mismatch. The first slice requires one request and no fallback. This
documentation task records the mismatch. It does not repair it.

## 15. Failure and ambiguity semantics

| Class | Meaning | Fabric behavior |
|---|---|---|
| Local admission refusal | Policy, budget, privacy, or missing key before send | No attempt; no quota consumption where current source already fails closed |
| Definitive provider error | Provider refused or returned a classified terminal error | Receipt records failure; retry only if the reliability class allows it |
| Cancellation | Caller or budget stopped the attempt | Receipt records cancel; no semantic success |
| `OUTCOME_UNKNOWN` | Send may have occurred without a usable result | No blind retry; caller reconciles before any new attempt that could duplicate effects |

## 16. Retry and reconciliation semantics

Retry is a new `ModelAttempt` under the same or a newly resolved route. The
first slice has no fallback and no retry. Later purposes may define bounded
retry only where duplication is harmless and the profile reliability class
allows it.

Reconciliation of model work with no external effect preserves attempt truth.
It does not invent a cognitive outcome.

## 17. Persistence and restart semantics

Receipts persist when audit or later qualification needs them. Specialist
session lineage does not preserve live dispatch authority across restart.

After restart, a new attempt requires current policy, current capability, and a
newly built `ContextProjection`. Cached provider sessions are mechanism state,
not permission.

## 18. Delegation and worker semantics

A specialist is a bounded model-work contract. A worker is an Operational
Continuity mechanism. They are not the same identity.

Specialists and workers may return proposals and artifacts. They cannot write
Identity, Mind State, Recall, goals, salience, learned preferences, or
relationship state.

Child authority is a subset of current parent authority. Trust in a model
family does not expand it.

## 19. Cognition handoff

```text
ModelAttemptReceipt
  -> caller schema and provenance validation
    -> existing Thought / Expression / cognition owner
      -> optional Memory Evidence proposal
```

Model Fabric stops at the receipt. Semantic admission stays with the caller.

## 20. Memory and materialization boundary

`ContextProjection` is a disposable attention artifact. Evicting it is not
forgetting. Summaries inside a projection are not source evidence.

Model Fabric must not query databases, run retrieval callbacks, or mutate
canonical memory to finish a prompt.

## 21. Observability

Attempts emit redacted mechanical facts through the Observability Plane:

- purpose, profile, route, and attempt identifiers;
- privacy class;
- admission, dispatch, cancel, and failure class;
- token, latency, and cost;
- content-binding hashes, not raw prompts.

Telemetry cannot create a profile, select a fallback, or qualify a model.

## 22. Evaluation and qualification

Profile qualification binds exact source, environment, profile identity,
purpose, fixtures, and claim. Deterministic contract tests outrank model
judges.

The first slice must prove:

1. one provider request and no fallback;
2. default-off shadow replacement without changing active Thought;
3. exact projection binding;
4. cancellation and structured failure;
5. privacy non-disclosure;
6. no cognitive write from the receipt;
7. no Sandbox or engineering-operator coupling.

Live provider qualification, physical-host qualification, activation, and
promotion remain separate later gates.

## 23. Rollback, demotion, revision, and retirement

A profile, provider, or fallback can be independently disabled, demoted, or
retired. Rollback stops new dispatch. It does not rewrite receipts or convert
shadow evidence into live influence.

Changing a model ID updates versioned policy and profile identity. It must not
require an architecture rewrite when purpose, privacy, reliability, output
contract, and authority remain unchanged.

## 24. Smallest production witness

One default-off Thought-observation shadow attempt that:

1. builds one immutable `ContextProjection`;
2. resolves one Lightning-backed profile;
3. makes one provider request;
4. records one receipt;
5. performs no fallback;
6. leaves active Thought unchanged;
7. writes no Identity, Mind State, Recall, or capability state.

This witness does not qualify Expression, utility routes, engineering
specialists, or production promotion.

## 25. Acceptance gate

Model Fabric may be accepted only when:

- the semantic owners in this document remain unconflicted;
- frozen field contracts in the historical contract draft still match;
- the first slice meets the witness above;
- Evaluation binds profile identity without owning routing;
- Observability remains a port, not a semantic interface;
- `RELEASE_QUALIFIED`, deployment, and promotion remain separate.

## 26. Interfaces to later phases

- Context Budget later constructs and selects `ContextProjection` contents.
- Operational Continuity may correlate model attempts into durable work.
- Procedural Skill Graduation may call named purposes for model-backed steps.
- Computer Use may use qualified perception profiles.
- Learned Autonomy, Cognitive Graduation, and Relational Graduation consume
  results only through existing semantic owners.

## 27. Deferred work

- exact schema and storage placement;
- AI SDK spike outcome;
- adapter topology;
- later utility and specialist migrations;
- any fallback enablement;
- Inspect AI, OpenInference, and Phoenix trials;
- production exporter configuration.

## Separation of concerns

| Layer | Owner | Must not become |
|---|---|---|
| Semantic architecture | This document | Current model IDs or provider SDKs |
| Frozen field and first-slice specification | [`Model_Fabric_01_Contract_Draft.md`](Model_Fabric_01_Contract_Draft.md) | Living route dashboard |
| Current route and model policy | [`docs/Routing_Status.md`](../Routing_Status.md) plus source/config | Architectural identity |
| Provider mechanics | Adapters and later spike evidence | Purpose ownership |
| First implementation slice | [`Model_Fabric_01_Implementation_Spike.md`](Model_Fabric_01_Implementation_Spike.md) | Authorization to implement |
| Planning snapshot | [`research/Model_Fabric_01_Final_Implementation_Packet.md`](research/Model_Fabric_01_Final_Implementation_Packet.md) | Current source or implementation authority |
| Historical source inventory | [`Model_Fabric_01_Codebase_Reconnaissance.md`](Model_Fabric_01_Codebase_Reconnaissance.md) | Current worktree truth |

### Planned target policy

These values are `PLANNED TARGET` policy, not architecture:

- `thought.decision` remains Groq `openai/gpt-oss-120b` primary;
- Lightning-backed specialist and utility routes target NVIDIA
  `nvidia/nemotron-3.5-lightning-30b-a3b` primary;
- Groq `openai/gpt-oss-120b` is a later, route-qualified fallback candidate for
  those Lightning-backed routes;
- the former Groq 20B utility candidate has no planned role;
- Mistral Medium remains Expression primary;
- the first `thought.observation` slice uses Lightning, remains
  `single_attempt`, and has no fallback provider dispatch.

Current Expression fallback is a present-source Expression policy. It is not
the Model Fabric first-slice fallback policy.
