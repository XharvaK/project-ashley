# Autonomous Work Semantics Salvage

**Status:** `REFERENCE` / architecture research only

**Date:** 2026-08-13

**Implementation status:** No source, Sandbox, Model Fabric, runtime, config,
dependency, activation, deployment, promotion, commit, or push changes are
authorized by this document.

**Purpose:** Reconcile semantic pressure exposed by autonomous-work use cases
with current Ashley-owned architecture. The use cases are evidence for
architectural discovery. They are not feature requirements.

## Scope and governing boundaries

The reviewed signals included flight and grocery selection, quote negotiation,
meeting booking, persistent spreadsheet and document maintenance, large bounded
worker workloads, ticket watching, and recurring outputs from external sources.
The reusable pattern is:

```text
persistent intention
  -> observation
    -> choice under constraints and preferences
      -> bounded authority
        -> possible external commitment
          -> effect
            -> verification and reconciliation
```

This pattern refines architecture beneath the existing authority chain. It does
not authorize any of the example features, connected accounts, external
credentials, live adapters, Sandbox activation, Model Fabric implementation, or
new roadmap phase.

The following laws remain unchanged:

```text
ASHLEY OWNS MEANING. SUBSTRATES PROVIDE MECHANISMS.
ONE ASHLEY. BOUNDED SPECIALISTS / WORKERS.
CHILD AUTHORITY IS A SUBSET OF PARENT AUTHORITY.
CONNECTED / AVAILABLE IS NOT CAPABILITY.
MODEL OUTPUT IS NOT AUTHORITY.
EVENT IS NOT INSTRUCTION.
PERSISTED LINEAGE IS NOT LIVE AUTHORITY.
PREPARE -> REVALIDATE -> COMMIT.
RECEIPT IS NOT AN EFFECT WITNESS.
AMBIGUOUS POSSIBLE EFFECT -> OUTCOME_UNKNOWN -> RECONCILE.
CONTEXT IS NOT MEMORY.
EVICTION IS NOT FORGETTING.
DURABLE OPERATIONAL STATE IS NOT DURABLE COGNITIVE STATE.
```

## Evidence reviewed

- [Canonical Architecture Roadmap](../Ashley_Architecture_Roadmap.md) —
  current authority, frozen phase order, Operational Continuity, procedures,
  Computer Use, Learned Autonomy, effect lifecycle, and worker boundaries.
- [Architecture Document Index](../Ashley_Architecture_Document_Index.md) —
  document authority and historical-status rules.
- [Ashley Foundation Architecture Decision v1](../Ashley_Foundation_Architecture_Decision_v1.md)
  and [Ashley Architecture Salvage Map v2](../Ashley_Architecture_Salvage_Map_v2.md)
  — Ashley-owned semantic boundaries and machinery seams.
- [MODEL-FABRIC-01 Contract Draft](../Model_Fabric_01_Contract_Draft.md) and
  [Implementation Spike](../Model_Fabric_01_Implementation_Spike.md) — bounded
  specialist sessions, parent/child budget attenuation, model-result
  non-authority, and receipt semantics.
- [Ashley Evaluation / Qualification Plane](../Ashley_Evaluation_Qualification_Plane.md)
  — Effect Witness, `OUTCOME_UNKNOWN`, reconciliation, and qualification
  ownership.
- [External Agency Design](../../External_Agency_Design.md) — current
  external-action policy, capability gates, owner approval, credential
  separation, action lifecycle, and reconciliation design.
- [Sandbox Design](../../Sandbox_Design.md) — local artifact identity,
  immutable `entityUuid`, opaque `artifactRef`, exact forget targeting, and
  execution-workspace boundaries.
- Current source seams in `apps/agent-service/src/core/external-agency/`,
  `apps/agent-service/src/core/agency/effect-intent.ts`, relationship state,
  and `apps/sandbox-broker/src/`.

## Current overlap and architectural signal

### External effects and commitments

Ashley already has an external-action boundary. The current design and source
contain action kinds, risk classes, capability gates, signed policy
authorization, owner approval for selected risk classes, payload hashes,
idempotency, dispatch leases, receipts, `reconciliation_required`, and
`outcome_unknown`. `docDecisionAuthorizesExternalDispatch` is explicitly false,
and irreversible action is denied by default in the current policy seam.

This is substantial overlap, but it does not yet state whether an effect
creates an obligation or commitment in the owner's name. `irreversible`,
`public`, or `send_private` are risk or transport classifications. They are not
the same semantic as accepting terms, spending money, reserving owner time, or
creating another obligation. The missing distinction belongs beside the
existing Effect Intent / external-action / Effect Reconciliation boundary. It
does not justify a second action registry.

Relationship commitments already exist in Ashley's Mind State and relationship
subsystem. They represent relational meaning such as Ashley or mutual
commitments. They must not be silently reused as legal, financial, scheduling,
or provider-side external commitments.

### Representation of the owner

Ashley has communication and external-action mechanics, but the reviewed
architecture does not define an explicit scope for communicating *on behalf of
the owner*. External accounts, calendar access, browser sessions, credentials,
and adapters are mechanisms or authentication surfaces. They do not define who
Ashley represents or what she may say, negotiate, accept, or promise.

The missing distinction should be an Ashley-owned authorization/policy scope
attached to an existing capability and external-action path. `WorkloadPrincipal`
can identify a bounded workload and attenuate authority; it should not become
the semantic owner of representation. Agency and Thought may propose a
represented-party action, but they do not grant representation authority.

### Preference-aware choice

Identity already contains values and preferences, Mind State contains dynamic
items, and Agency/Thought owns decision and effort allocation. Learned
Autonomy is explicitly deferred and currently says that experience may inform
initiative and salience without widening authority.

The missing distinction is a choice-input taxonomy, not a generic optimizer:
hard constraint, explicit owner preference, learned or inferred preference,
situational preference, and optimization objective. Recall can supply
provenance-bearing evidence. It must not become an optimization configuration
store or authority source. An inferred preference must remain revisable and
must not silently become a hard constraint or permission.

### Remote persistent objects

Sandbox already has exact identity for local broker artifacts: immutable
`entityUuid` plus opaque `artifactRef`, with continuity/tombstone integration.
External Agency can bind a payload to a local artifact reference and hash.

That is not yet a stable identity for a remote spreadsheet, document, calendar,
deck, site, or collection. A URL, provider response, or tool result is not
sufficient identity. A future remote-object seam needs provider/namespace,
stable provider object identity, observed revision, mutation base, scope, and
post-write observation. It should remain distinct from local
`ExecutionWorkspace` artifacts and from Recall, while allowing explicit links
between them.

### Bounded worker workloads

Operational Continuity already names `WorkerProvider`, Worker Orchestration,
`WorkloadPrincipal`, authority-at-creation, child attenuation, Artifact
Registry, durable effect reconciliation, and `EffectCommitRecord` /
`EffectReconciliation`. The missing evidence is an explicit fan-out/fan-in
workload and crash corpus.

Fan-out/fan-in is a workload shape, not a multi-agent cognition architecture.
The parent Ashley operation remains the semantic owner. Worker outputs remain
candidate results with provenance. Aggregation may produce a partial result,
but it cannot create authority, change Ashley's decision criteria silently, or
turn worker participation into a peer identity.

## Candidate reconciliation matrix

### Candidate: External Commitment

**EXISTING ASHLEY OWNER:** Ashley `AgencyEffectIntent`; External Agency action
policy and dispatch FSM; `EffectCommitRecord`; `EffectReconciliation`; owner
approval and capability contracts.

**NEW CONTRACT REQUIRED:** `MAYBE`

**PREFERRED FINAL NAME:** Unresolved. Prefer a future commitment-bearing effect
classification or annotation before introducing `ExternalCommitment` as a
standalone type.

**SEMANTIC DEFINITION:** An externally observable effect that creates, accepts,
or materially changes an obligation, reservation, expenditure, agreement, or
other commitment in the represented party's name.

**WHAT IT MUST NOT MEAN:** It must not mean generic capability, authenticated
access, an action draft, an executor receipt, an ordinary machine-state change,
or an Ashley relational commitment.

**ROADMAP OWNER:** `OPERATIONAL-CONTINUITY-01`, with cross-cutting Agency /
authority / effect semantics and the existing External Agency design.

**IMPLEMENT NOW:** `NO`

**CANONICAL DOC CHANGE NOW:** `YES`

**RATIONALE:** The distinction is real and missing, but the current external
action, effect, owner-approval, and reconciliation seams already provide the
natural owner. A separate registry or lifecycle would duplicate authority.
Future work should classify commitment-bearing effects and define claim-specific
verification without equating commitment with irreversibility.

**RECOMMENDATION:** `ADAPT EXISTING CONTRACT`

### Candidate: Representation Authority

**EXISTING ASHLEY OWNER:** Ashley capability and authorization semantics;
External Agency action policy; owner approval; Agency/Thought proposal path;
`WorkloadPrincipal` only for bounded execution identity and attenuation.

**NEW CONTRACT REQUIRED:** `MAYBE`

**PREFERRED FINAL NAME:** Unresolved. Do not freeze `RepresentationAuthority`.
First test whether a representation scope on the existing external-action
authorization contract is sufficient.

**SEMANTIC DEFINITION:** Ashley-owned permission to communicate, negotiate,
schedule, or accept terms on behalf of a specified represented party within an
explicit scope.

**WHAT IT MUST NOT MEAN:** It must not mean communication capability, account
connectivity, calendar or email access, browser access, a provider credential,
model output, or permission to create an external commitment.

**ROADMAP OWNER:** Cross-cutting Agency / authority / effect semantics, then
`OPERATIONAL-CONTINUITY-01` and the gated External Agency path.

**IMPLEMENT NOW:** `NO`

**CANONICAL DOC CHANGE NOW:** `YES`

**RATIONALE:** The existing action policy can own a future representation
scope, but the current documents do not distinguish speaking as Ashley from
representing the owner. The distinction must be recorded without assigning it
to protocols, accounts, or `WorkloadPrincipal`.

**RECOMMENDATION:** `ADAPT EXISTING CONTRACT`

### Candidate: Preference-aware Choice

**EXISTING ASHLEY OWNER:** Agency and Thought decision semantics; stable
Identity values/preferences where genuinely identity-bearing; Mind State for
situational state; Learned Autonomy for future evidence-backed learning;
Recall only as provenance-bearing evidence.

**NEW CONTRACT REQUIRED:** `MAYBE`

**PREFERRED FINAL NAME:** Unresolved. Do not freeze `ChoicePolicy`.

**SEMANTIC DEFINITION:** Ashley-owned choice evaluation that distinguishes
feasibility constraints, explicit preferences, inferred preferences,
situational preferences, and objectives used to select among otherwise allowed
options.

**WHAT IT MUST NOT MEAN:** It must not mean authority, consent, a learned
preference promoted to a hard rule, a hidden optimization configuration in
Recall, or an identity rewrite caused by one choice.

**ROADMAP OWNER:** `LEARNED-AUTONOMY-01`, with Agency/Thought as the current
decision owner and `OPERATIONAL-CONTINUITY-01` as the future workload consumer.

**IMPLEMENT NOW:** `NO`

**CANONICAL DOC CHANGE NOW:** `YES`

**RATIONALE:** The taxonomy prevents a known authority error without freezing
an optimizer. Explicit owner constraints must outrank preferences; inferred
preferences remain evidence and may be revised. Agency should select among
feasible options, not Identity or Recall.

**RECOMMENDATION:** `ADAPT EXISTING CONTRACT`

### Candidate: External Artifact / Managed Object Identity

**EXISTING ASHLEY OWNER:** Sandbox Artifact Registry and exact continuity
targeting for local artifacts; `ExecutionWorkspace` for local work; External
Agency payload binding for action content; future Operational Continuity
Artifact Registry / connector semantics for remote objects.

**NEW CONTRACT REQUIRED:** `MAYBE`

**PREFERRED FINAL NAME:** Unresolved. `ExternalArtifactRef` and
`ManagedObjectRef` remain candidate names only.

**SEMANTIC DEFINITION:** A provider-scoped identity and observed revision for a
durable remote object, with a bounded mutation base, allowed operation scope,
provenance, and post-effect observation.

**WHAT IT MUST NOT MEAN:** It must not mean a URL, a tool result, local
`artifactRef`, an `ExecutionWorkspace` path, Recall, memory authority, or
permission to mutate the object.

**ROADMAP OWNER:** `OPERATIONAL-CONTINUITY-01`, integrated with the existing
Artifact Registry, `ExecutionWorkspace`, connector mechanics, and effect
reconciliation.

**IMPLEMENT NOW:** `NO`

**CANONICAL DOC CHANGE NOW:** `YES`

**RATIONALE:** Local artifact identity is adequate for current broker work, but
remote revision identity is a distinct operational need. The correct response
is a future extension or adapter under the existing artifact/effect seams, not
a second artifact system and not Recall.

**RECOMMENDATION:** `ADAPT EXISTING CONTRACT`

### Candidate: Fan-out / Fan-in Workload

**EXISTING ASHLEY OWNER:** Operational Continuity Worker Orchestration,
`WorkerProvider`, `WorkloadPrincipal`, child-budget attenuation, result
provenance, and Effect Reconciliation.

**NEW CONTRACT REQUIRED:** `NO`

**PREFERRED FINAL NAME:** `Fan-out / fan-in workload` as a test-workload label,
not a new semantic contract or agent type.

**SEMANTIC DEFINITION:** One Ashley operation dispatches many bounded workers,
collects independently attributed results, and produces an Ashley-owned
aggregate under explicit concurrency, budget, cancellation, and partial-result
rules.

**WHAT IT MUST NOT MEAN:** It must not mean peer Ashleys, multi-agent
cognition, independent worker goals, authority amplification, or aggregation
authority.

**ROADMAP OWNER:** `OPERATIONAL-CONTINUITY-01`.

**IMPLEMENT NOW:** `NO`

**CANONICAL DOC CHANGE NOW:** `YES`

**RATIONALE:** The workload exposes the exact failure and authority cases that
the future continuity contract must prove. Existing worker and reconciliation
owners are sufficient; the missing item is an explicit test corpus.

**RECOMMENDATION:** `ACCEPT AS DIRECTION`

## Architectural questions answered

1. **Ordinary effect versus owner commitment:** Partially distinguished. The
   external-action design distinguishes risk, action kind, authorization, and
   reconciliation, but not the semantic fact that an effect creates an
   obligation or commitment in the owner's name. Add that distinction as a
   future effect classification, not as a new authority source.

2. **Communication versus representation:** Not currently explicit. The
   current architecture supports communication and external actions, but
   capability to communicate does not establish permission to represent the
   owner.

3. **Location of representation scope:** Attach it to an Ashley-owned
   capability / authorization / external-action policy boundary. Agency and
   Thought may propose; owner approval may be required by risk and scope.
   `WorkloadPrincipal` should carry workload identity and attenuation, not
   represented-party meaning. Protocols, accounts, browsers, calendars, and
   credentials remain mechanisms.

4. **Shape of an external commitment concept:** Prefer a classification or
   policy annotation on existing `EffectIntent`, external-action records,
   `EffectCommitRecord`, and `EffectReconciliation`. Only a later concrete
   workload should justify a separate linked contract.

5. **Verification after `COMMIT`:** Re-observe the provider or destination
   state with a claim-specific independent Effect Witness when the effect is
   consequential, externally observable, ambiguous, or recovery-sensitive.
   Preserve the executor receipt separately. If the claim is unresolved,
   retain `OUTCOME_UNKNOWN` and reconcile.

6. **Effect Witness by effect type:** Witness scope differs by claim. A
   purchase may require provider order and payment/fulfillment state; a
   reservation may require a provider reservation record and its terms; a
   communication may require provider acceptance or destination record, not
   proof that a human read it; an agreement requires an authoritative accepted
   terms record; scheduling requires an event record and relevant attendee or
   calendar state. No single receipt or witness proves all of these claims.

7. **Location of learned preferences:** Keep preference evidence in
   Ashley-owned learning / Agency decision inputs with provenance, confidence,
   recency, and reversibility. Stable values or preferences may remain part of
   Identity only when they are genuinely identity-bearing and pass their
   existing review semantics. Recall supplies evidence; it does not become an
   optimizer or authority.

8. **Precedence of explicit constraints:** The future choice boundary must
   filter hard constraints first. Explicit owner constraints outrank explicit
   preferences, inferred preferences, and optimization objectives. Situational
   constraints may narrow the feasible set. Inferred preference never silently
   becomes a hard constraint or authorization.

9. **Remote-object identity today:** Ashley has adequate local identity for
   broker artifacts, but no accepted stable identity contract for arbitrary
   remote persistent objects. A provider URL or tool result is insufficient.

10. **Remote revision and effect lifecycle:** Observe revision `N`; prepare a
    bounded mutation bound to the provider, object, scope, and `N`; revalidate
    current identity, revision, target, authority, and approval immediately
    before commit; commit once; observe the resulting revision or provider
    state. Ambiguous dispatch remains `OUTCOME_UNKNOWN` until reconciled.

11. **Remote versus local artifacts:** They must remain distinct. Local
    `artifactRef` identifies content held by Ashley's execution substrate.
    Remote-object identity identifies provider state and revision. They may be
    linked by provenance and payload references, but neither replaces the
    other.

12. **Fan-out/fan-in crash corpus:** The Operational Continuity spike should
    cover parent admission failure; child admission and budget reservation;
    bounded concurrency; parent crash before child dispatch; child crash;
    child timeout and cancellation races; sibling failure containment; child
    dispatch with ambiguous outcome; duplicate child completion; parent crash
    after child commit; stale aggregation; child-first drain; dead-worker
    cleanup; partial aggregate publication; and reconciliation after restart.

13. **97 success, 2 failure, 1 unknown:** The parent has 97 successful child
    results, 2 definitive failures, and 1 unresolved possible effect. The
    aggregate may expose the 97 successes and the two failures as a partial
    result if the workload policy permits, but it must retain the unknown child
    as `OUTCOME_UNKNOWN`. It must not claim complete success or blindly retry
    the unknown child.

14. **Partial aggregation:** Yes, when the parent contract explicitly permits
    partial results and each child status remains attributable. Partial
    aggregation is not proof that the overall operation is complete. A
    consequential unresolved child keeps the relevant parent outcome open or
    reconciliation-bound.

15. **Aggregator authority:** The aggregator may normalize, correlate, and
    summarize bounded child results under the parent budget. It may not grant
    capabilities, authorize effects, mutate Identity or Recall, create owner
    commitments, or convert a worker receipt into an Effect Witness.

16. **Worker output and parent criteria:** Worker output must not alter parent
    optimization or decision criteria implicitly. If a future workload permits
    evidence to update criteria, the output must pass an Ashley-owned admission
    boundary with provenance, schema, policy, and re-evaluation. A model or
    worker cannot widen authority merely by recommending a new criterion.

## Canonical-document change decision

Canonical changes are justified now only as short architectural notes:

- clarify that mechanism capability is distinct from authority to create an
  external commitment or represent the owner;
- add remote-object revision interaction, commitment-bearing effects, and
  fan-out/fan-in as Operational Continuity test direction;
- record that a qualified procedure does not grant permission to invoke it;
- clarify that computer/browser access does not imply purchase,
  representation, or commitment authority;
- add the preference taxonomy and `learned preference != authority` to Learned
  Autonomy;
- index this dossier as `REFERENCE` without making candidate names canonical.

No Core Principle, Constitution, Vision, Glossary, README, Model Fabric
contract, Sandbox implementation, durable engine, provider, connector, or
roadmap phase is selected by this reconciliation.

## Decisions deliberately deferred

- Final names and type shapes for commitment-bearing effects,
  representation scope, choice inputs, and remote managed objects.
- Whether commitment data belongs only on `EffectIntent` / external-action
  records or needs a separately linked record after a concrete workload exists.
- Exact representation approval levels for scheduling, quote collection,
  negotiation, and final agreement.
- Exact independent witnesses and provider read-after-write semantics for each
  external effect class.
- Exact remote-object provider adapter and revision model.
- Restate versus Temporal versus DBOS selection.
- Any fan-out/fan-in engine, queue, durable store, or worker protocol adoption.
- Any learned-preference storage schema or optimization engine.

**Canonical names frozen by this dossier:** `NONE`.

**Implementation authorized:** `NO`.
