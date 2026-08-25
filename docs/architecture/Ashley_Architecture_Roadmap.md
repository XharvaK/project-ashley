# Project Ashley Canonical Architecture Roadmap

**Status:** `AUTHORITATIVE`

**Hardened:** 2026-08-21

**Engineering-milestone conversion:** 2026-08-23

**Metacognition (accepted 2026-08-25):** Named cross-cutting policy profile
consumed by the cognitive-track owners. Not a freeze-map owner, faculty,
store, authority, model role, standalone phase, or §5 milestone. The
2026-08-23 conversion still adds no architecture. Later metacognition
recommendations stay in §11 and
[Ashley Metacognition Architecture](Ashley_Metacognition_Architecture.md) §22.

**Scope:** Architecture and roadmap. This document does not authorize source
changes, installation, activation, deployment, promotion, provider use, or an
external effect. The 2026-08-23 conversion does not add owners, kernels,
faculties, boundaries, infrastructure primitives, or roadmap phases. It
converts already-named items into dependency-ordered engineering milestones
from current live state forward.

This document is the canonical map of Project Ashley's architectural direction.
It is subordinate to governance. The
[Architecture Document Index](Ashley_Architecture_Document_Index.md) owns
document status and precedence. The
[Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md) owns the shared
state, authority, evidence, ambiguity, and current-fact laws used by every
phase.

## 1. Authority and truth

Project authority flows in this order:

```text
VISION.md
  -> Ashley Core Principles
    -> Ashley Constitution
      -> [Ashley Stewardship Compact + Ashley Ethics]
        -> Architecture
          -> Runtime policy and prompts
            -> Runtime decisions
```

[`VISION.md`](../../VISION.md) explains why Ashley exists. Architecture must
advance that Vision without claiming that software architecture can establish
consciousness, personhood, feeling, or care.

When sources disagree:

1. Governance owns identity, constitutional, ethical, and stewardship meaning.
2. Current source and validated configuration own current implementation facts.
3. This roadmap owns phase topology and architectural direction.
4. A focused phase or cross-cutting contract owns its domain beneath this map.
5. Exact-candidate evidence owns only the candidate, environment, and claim it
   binds.
6. Historical documents preserve provenance. They do not regain authority
   because they contain more detail.

Architecture status is not delivery status. `AUTHORITATIVE` does not mean
implemented. Source presence does not mean installed, activated, deployed,
promoted, release-qualified, or physically qualified.

Volatile implementation facts must follow the current-fact policy in the
[Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md#current-fact-documentation-policy).
The [Routing Status](../Routing_Status.md) is the living source snapshot for
routing. Schema, capability, channel, and model facts should normally be read
from their canonical source rather than copied into this roadmap.

## 2. Architectural law

The following laws apply to every phase:

> ASHLEY OWNS MEANING. SUBSTRATES PROVIDE MECHANISMS.

> ONE ASHLEY. BOUNDED SPECIALISTS / WORKERS.

> CHILD AUTHORITY MUST BE A SUBSET OF PARENT AUTHORITY.

> CONNECTION / AVAILABILITY IS NOT CAPABILITY.

> TOOL PRESENT != AUTHORITY TO USE IT.

> DURABLE WORK STATE != DURABLE COGNITIVE STATE.

> CONTEXT IS BOUNDED ATTENTION OVER PERSISTENT STATE.

> RECEIPT != EFFECT WITNESS.

> SOURCE EVIDENCE != WORLD TRUTH.

> MEMORY EVIDENCE != MEMORY INTERPRETATION != RETRIEVAL INDEX.

> ATTEMPTED EFFECT != VERIFIED EFFECT.

> UNOBSERVED SUCCESS != FAILURE.

> OUTCOME_UNKNOWN MUST NOT CAUSE BLIND RETRY.

> PREPARE -> REVALIDATE -> COMMIT for consequential effects.

> TRUST NEVER EXPANDS AUTHORITY.

> ARCHITECTURE BEFORE PROMPTING. EMERGENCE BEFORE PRESCRIPTION. GROWTH BEFORE
> RANDOMNESS. TRUTH BEFORE COMFORT.

The owner map, event terminology, and architecture-justified sequence before
advanced autonomy are frozen in
[Architecture Freeze](Ashley_Architecture_Freeze.md). That freeze does not
add phases, kernels, or `OWNER_SELECTED_IMPLEMENTATION_ORDER` edges. It does
not make Model Fabric cognitive advancement. Historical “Event Fabric”
research is not this map.

The full laws and matrices are in the
[Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md). In particular:

- Thought may form intended outcomes. It does not grant effect authority.
- Workers and specialists may emit proposals, observations, artifacts, and
  evidence. They cannot directly mutate Identity, Mind State, Recall, goals,
  salience, learned preferences, or relationship state.
- A logged-in session is connectivity, not authorization.
- A procedure is reusable mechanism, not a capability grant.
- Telemetry is not evidence, memory, truth, or authorization.
- Prompt eviction is not forgetting.
- Source pass, local qualification, physical qualification, installation,
  activation, deployment, promotion, and production acceptance are different
  claims.

## 3. Current live state

This section is structural plus live-resolved volatile facts. Architecture
status is not delivery status. Source presence is not production acceptance.

Live resolution refreshed `2026-08-25` from Git, exact-candidate acceptance
packets, and the owner-selected current task:

| Fact | Live reading | Authority |
|---|---|---|
| `origin/master` (dated Git snapshot in this roadmap file) | `48bad019fe601d5c871a54dd9902879862c6e96a` | Git at last roadmap freeze of that row — **not** MF-M1 source identity |
| MF-M1 `planningBaselineSha` / `sourceBaselineSha` / `productionBaselineSha` (current integration line) | `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a` | Exact production-proven OF-M1 runtime baseline; MF-M1 local candidate is separately checkpointed |
| MF-M1 `implementationStartSha` / `candidateCommitSha` | `5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6` / `d918572c7ae01d5b367323692bd6e8fbcf257895` | Local implementation candidate; acceptance and production promotion remain separate |
| Historical MF documentation checkpoint | `7a7883753a7e6e5a002bf23d226645ce85730ee5` | Docs-only checkpoint based on the historical pre-repair `8eedad8` line |
| Current working branch | `integration/post-of-docs` documentation integration on `e36613b`. Not a routing change | Git |
| Owner-selected current delivery | Model Fabric, beginning with MF-M1 | owner context |
| Sandbox V2 path | Direct unprivileged Bubblewrap. V1 broker must not return | Sandbox V2 roadmap |
| Sandbox V2 M1–M7 | **`PRODUCTION ACCEPTED`** against exact candidate `48bad019fe601d5c871a54dd9902879862c6e96a`; M7 acceptance is limited to the named `patch_export` profile | Exact-candidate closure packet filename `SANDBOX_V2_PRODUCTION_CLOSURE_48bad019fe60.md` (not present in this `e36613b` integration tree; SHA identity is preserved) plus milestone acceptance records |
| Sandbox authority after closure | Candidate inspection, experimentation, verification, authorship, bounded operation, and named patch export are available only through their separate grants. Live apply, Git effects, deployment, network, package acquisition/install, self-change, Computer Use, and unbounded autonomy remain excluded | exact-candidate closure + Sandbox V2 roadmap |
| Model Fabric | Phase contract exists. **MF-M1** is the owner-selected next implementation milestone: seam around **live** `e36613b` routes (NIM 20B Thought, Mistral→Qwen Expression). Zero intended routing/provider/model/reasoning change. §12.9 targets are post-MF-M1 | Model Fabric Architecture + owner context |
| Later named phases | Architecturally defined, deferred as current implementation | phase contracts |

If a volatile fact cannot be established from permitted evidence: `UNKNOWN`.

| Area | Current local source state | Architectural boundary |
|---|---|---|
| Runtime channel | Discord-only. Non-Discord channels are retired by current source. | Ashley is not architecturally defined by Discord. A future channel needs its own privacy, rendering, identity, and qualification contract. |
| Identity, Mind State, Thought, Agency, Expression | Implemented Ashley-owned layers. Identity and Mind State are joint inputs to Thought. | Provider, worker, and rendering mechanisms do not own cognition. Thought does not own downstream effect authorization. |
| Behavioral state | `nuclear.db` owns current behavioral and semantic state. | Current supported schema is source-derived. It is not copied into this roadmap. |
| Continuity | `continuity.db` owns lineage, forgetting, runtime sessions, and backup watermarks. `index.db` is archival ConversationLogger storage. | Database durability is not semantic continuity by itself. |
| Delivery and initiative | Current source includes proactive admission, reservation, delivery, receipts, ambiguity, and finalization. | A wake is not motivation. A transport attempt is not committed delivery truth. |
| Model routing | Current source has Ashley-owned purpose and route logic plus provider adapters. Configuration, hard-coded purpose mapping, and registry source are not yet one validated registry snapshot. | Model IDs are policy facts. A provider SDK must not own semantic routes, fallback, budgets, or authority. |
| Capability release | Current source has capability records, gates, promotion, rollback, and domain additions beyond the older common contract material. | A capability name or stored release record is not proof that one contract covers every domain. |
| Sandbox | Accepted V2 path uses direct, unprivileged Bubblewrap. See live table above for M-series maturity. | Retained V1 broker and `source_*` topology are historical and MUST NOT be reintroduced by implication. |
| External effects | Source contains external-agency and broker-era machinery, including non-production adapters. | Source presence does not establish current external-effect architecture, deployment, credential authority, or authorization. |
| Procedures and Computer Use | No production Procedural Skill Graduation or general Computer Use runtime exists. | Imported formats and browser access remain inert mechanisms until qualified and authorized. |

Known source/document mismatches remain recorded, not repaired, here:

- Runtime-session metadata supplies an older hard-coded nuclear schema value.
- Current route facts are split across configuration, a hard-coded purpose map,
  and registry source.
- The older common capability contract material does not bind every currently
  declared capability domain.
- The existing Thought seam can make a second structural provider request.
  Historical F1-obs required one request and no fallback. **MF-M1** must
  **preserve** current Thought failover rather than impose F1-obs
  `single_attempt` on live Thought.

## 4. Work classes

These classes sort **existing** roadmap items. They are not new owners and not
new phases.

| Class | Meaning | Existing items |
|---|---|---|
| Mechanism work | Substrates, workshops, dispatch, durable work, procedures, later computer interaction | Sandbox remaining M-series; Model Fabric; Operational Continuity; Procedural Skill Graduation; Computer Use (deferred as current work) |
| Cognitive maturation | Existing cognitive / evidence / attention owners becoming qualified | Memory / Evidence maturation; Context Budget; Learned Autonomy; Cognitive Graduation; Relational Graduation. Metacognition is a named policy profile consumed by those owners. It is not a separate class, phase, freeze-map owner, or §5 milestone. |
| Governance specification | Lifecycle and admission rules composed from existing owners | Self-change lifecycle **specification**; Evaluation / Qualification remains the promotion plane |
| Deferred capability | Named later, not current engineering | Typed Event Spine design; Computer Use implementation; voice; broad external tools; self-modification **execution**; longitudinal companion evaluation campaign |

```text
MECHANISM COMPLETION
  != COGNITIVE MATURATION
  != GOVERNANCE SPECIFICATION
  != DEFERRED CAPABILITY
SANDBOX M5 AUTHORSHIP
  != AUTHORITY TO CHANGE ASHLEY
```

## 5. Engineering milestones from current state

Milestones below convert already-named roadmap items into dependency-ordered
engineering work. They do not add architecture. Closing evidence is the
smallest honest witness already named by the phase contract. Wave Acceptance
stages remain distinct. Execution contracts, leakage guards, and artifact
requirements live in
[Milestone Execution Governance](Ashley_Milestone_Execution_Governance.md).
That file does not add milestones.

Two sequences remain uncollapsed ([Architecture Freeze](Ashley_Architecture_Freeze.md)
§5):

- **Owner-selected delivery:** Sandbox → Model Fabric → Operational Continuity.
  The Sandbox leg is closed through named M7 `patch_export`; Model Fabric is
  current.
- **Architecture-justified before advanced autonomy:** Memory / Evidence
  maturation → self-change specification → Context Budget → Operational
  Continuity → Event Spine design later if joins require it.

The drawing below remains the owner-selected delivery map. It is not a
hard-dependency ladder. Edge classes live in the
[Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md#31-dependency-classes).

```text
governance + current Ashley foundation
              |
              v
       Sandbox Autonomy -----> Model Fabric
              |                     |
              |                     +-----------------------+
              v                                             v
   Operational Continuity ------------------------> Context Budget
              |                                             ^
              v                                             |
 Procedural Skill Graduation                                |
              |                                             |
              +-------> Computer Use                        |

Memory / Evidence maturation --------------------+
              |                                  |
              +-----> Learned Autonomy -----------+
              |                                  |
              +-----> Context Budget ------------+
                                                 v
                            +--------------------+-------------------+
                            |                                        |
                            v                                        v
                  Cognitive Graduation                    Relational Graduation
                            |                                        |
                            +--------------------+-------------------+
                                                 v
                                  integrated long-horizon hardening

Cross-cutting across all nodes:
Evaluation / Qualification | Observability | Security / Authority
External Effect and Authority | Memory / Evidence
```

The diagram shows owner-selected delivery order, not a single release train
and not a hard-dependency ladder. The following classifications are
normative. Full edge notes are in the Cross-Phase Architecture.

1. Sandbox Autonomy → Model Fabric is `OWNER_SELECTED_IMPLEMENTATION_ORDER`.
   Model Fabric does not derive authority or semantic ownership from Sandbox.
   Current delivery still waits on the Sandbox gate.
2. Model Fabric → Operational Continuity is
   `OWNER_SELECTED_IMPLEMENTATION_ORDER`. Operational Continuity does not own
   model intelligence. Model-backed attempts consume Model Fabric as a
   `CROSS_CUTTING_INTERFACE`.
3. Operational Continuity → Procedural Skill Graduation is an
   `EVIDENCE_DEPENDENCY`. Procedural Skill Graduation does not require general
   workflow durability unless the specific procedure's evidence contract does.
4. Procedural Skill Graduation → Computer Use is
   `OWNER_SELECTED_IMPLEMENTATION_ORDER`. The procedure rung is a preferred
   mechanism, not a semantic predecessor. Connector and semantic-API paths can
   exist without it.
5. Computer Use has a `HARD_DEPENDENCY` on External Effect and Authority for
   consequential action semantics. The reverse is false.
6. Memory / Evidence maturation → Learned Autonomy is a `HARD_DEPENDENCY`.
   Learning may influence initiative only from evidence-bound,
   provenance-aware, non-time-shifting materialization.
7. Learned Autonomy → Relational Graduation is a `CROSS_CUTTING_INTERFACE`.
   Learned preference is not relational authority. Relational Graduation can
   exist without Learned Autonomy. Learned Autonomy → Cognitive Graduation
   remains a `HARD_DEPENDENCY`.
8. Learned Autonomy does not depend on Computer Use. Serializing cognitive
   growth behind UI automation has no architectural basis.
9. Context Budget has a `HARD_DEPENDENCY` on Memory / Evidence and a
   `CROSS_CUTTING_INTERFACE` on Model Fabric's `ContextProjection` envelope.
   It does not depend on Learned Autonomy, complete Model Fabric, or Computer
   Use.
10. Cognitive Graduation and Relational Graduation are siblings. Neither phase
    may claim the other's qualification.
11. Selected Operational Continuity properties are `EVIDENCE_DEPENDENCY` for
    production-scale unattended learning, multi-step Computer Use, and
    resumable context. They do not make workflow state into Mind State or a
    cognitive concern.

### 5.1 Closed Sandbox delivery gate (dated evidence)

Sandbox was the prior owner-selected delivery. Exact-candidate evidence now
closes M1–M7 at `48bad019fe601d5c871a54dd9902879862c6e96a`, with M7 limited
to `patch_export`. Model Fabric is the owner-selected next mechanism track.
Its first **code** milestone is **MF-M1**, not historical F1-obs.

| ID | Milestone | Class | Depends on | Smallest closing evidence | Explicitly not |
|---|---|---|---|---|---|
| G0 | Establish M3 `PRODUCTION ACCEPTED` from permitted evidence | Mechanism | M3 architecture + exact-candidate production evidence | **Closed:** M3 production-acceptance record and later M-series closure bind the predecessor chain | Inferring M3 production acceptance from source presence |
| G1 | Close M4 production acceptance | Mechanism | G0 | **Closed:** exact-candidate packet `M4_PRODUCTION_ACCEPTANCE_553553b0d0ee.md` (filename identity; not in this `e36613b` integration tree). In-tree generic [`M4_PRODUCTION_ACCEPTANCE.md`](../handoffs/M4_PRODUCTION_ACCEPTANCE.md) remains | Treating local or physical evidence alone as acceptance |
| G2 | Promote M4 capability only after G1 | Mechanism | G1 | **Closed:** exact-candidate closure records `candidate_verification` active and witnessed | Source presence or local tests as promotion |

These rows preserve the gate order. They are no longer pending work.

### 5.2 Mechanism track (owner-selected)

Do not reorder these `OWNER_SELECTED_IMPLEMENTATION_ORDER` edges.

| ID | Milestone | Existing item | Depends on | Smallest closing evidence | Explicitly not |
|---|---|---|---|---|---|
| M5 | Sandbox M5 authorship | Sandbox Autonomy | G1 | Exact-candidate M5 witness required by the M-series contract | Authority to change Ashley; live-repo mutation; Git publication |
| M6 | Sandbox M6 bounded operate | Sandbox Autonomy | M5 | One admitted objective completed through a finite M3/M4/M5 sequence | New effect class; border authority; worker identity |
| M7 | Sandbox M7 controlled engineering effects | Sandbox Autonomy | M6 + External Effect and Authority for the named profile | One named engineering-border profile admitted, committed, receipted, and reconciled | Computer Use; generic external agency; self-change |
| F1 | Model Fabric first **code** slice (**MF-M1**) | Model Fabric | Owner-selected after current Sandbox delivery (not semantic parenthood) | **MF-M1:** seam around existing production routes; zero intended routing/provider/model behavior change; receipts expose current ugliness including `thought_observation` configured-as-utility / dispatched-as-thought. Historical Thought-observation Lightning witness is **F1-obs** (deferred optional) | Cognitive advancement; full Context Budget; execution authority; OpenCode worker; OpenCode in MF-M1; observation-route repair |
| OC1 | Operational Continuity first durable-work slice | Operational Continuity | Owner-selected after F1. Model-backed attempts use Model Fabric as `CROSS_CUTTING_INTERFACE` | Restart-resumable bounded work whose authority, artifact lineage, cancellation, and ambiguous effect reconcile | Mind State; `OpenConcern`; exactly-once external reality; Event Spine |
| P1 | Procedural Skill Graduation of one procedure | Procedural Skill Graduation | `EVIDENCE_DEPENDENCY` on attributable traces. General OC1 is not required | One evidence-bound procedure graduates, runs only under current authority, and can be revoked | Capability admission; Identity change; automatic graduation from repetition |

M5, M6, and the named M7 `patch_export` profile are production accepted at
the exact candidate above. Their rows preserve architectural ordering and
scope; they are not the current implementation backlog. F1/MF-M1 is the
owner-selected next **code** cut. MF-M1 is locally implemented at
`d918572c`; acceptance and production promotion remain separate.

Computer Use remains a named later mechanism. It is not a current
implementation milestone. See §5.5.

### 5.3 Cognitive maturation track

This track is not unlocked by Sandbox or Model Fabric completion. It may
proceed in parallel with mechanism work except where a classified dependency
says otherwise. It is not a linear continuation of
`Model Fabric → Operational Continuity`.

Metacognition is not a milestone in this
table. It is a named policy profile distributed across these owners. The first
visible metacognitive proof belongs to C1. Later recommendations are in §11
and Metacognition architecture §22, not in §5.

| ID | Milestone | Existing item | Depends on | Smallest closing evidence | Explicitly not |
|---|---|---|---|---|---|
| C1 | Memory / Evidence maturation | Memory / Evidence | Current evidence architecture | Source vs assertion, contradiction, forgetting, provenance, and live/shadow are contract-complete for later consumers. Owner-correction witness that historical interpretation `X` is inspectable; correction ends current validity and every current or downstream influence derived from the corrected scope, including I1 adaptation, unless a narrower valid replacement is explicitly adjudicated; history and source evidence remain; retrieval cannot silently revive `X`; the correct calibration consequence is recorded; Ashley Identity is not mutated. C1 may state compatibility requirements for later C3/C5 consumers; those consumers do not close C1 | World truth; a Knowledge layer; docs-as-memory; a Metacognition store; rewriting Ashley Identity from an owner correction; closing C1 on shared-interest or shared-culture projection behavior |
| C2 | Context Budget first bounded projection | Context Budget | `HARD_DEPENDENCY` on C1. `CROSS_CUTTING_INTERFACE` on Model Fabric `ContextProjection` (minimal envelope, not complete Fabric) | Same persistent state yields inspectable projections under multiple budgets without changing memory or semantic truth. Eligible current hypotheses are projected under privacy ceilings; remote routes receive only the approved minimum; local persistence is not treated as local inference | Recall authority; forgetting; Mind State mutation; sending ineligible psychological hypotheses off-box |
| C3 | Learned Autonomy first qualified influence | Learned Autonomy | `HARD_DEPENDENCY` on C1 | A learned influence changes a later choice for a traceable reason, stays inside authority, survives contradiction, and can be demoted. Inherited versus current interests remain distinguishable; `SIMILARITY != INHERITANCE PROVENANCE`; divergence is not engagement failure; owner correction does not rewrite Ashley Identity | Obedience optimization; Identity mutation; Computer Use; remaining similar to the owner as a goal; retroactive inherited labels from mere overlap |
| C4 | Cognitive Graduation | Cognitive Graduation | `HARD_DEPENDENCY` on C1 and C3. Context Budget and Operational Continuity are `EVIDENCE_DEPENDENCY` | Long-horizon evidence of grounded view revision, continuity, initiative diversity, refusal, and rollback without fabricated experience. Selected prediction/outcome calibration owned by Thought, Memory / Evidence, Reflection, and Evaluation | Personhood; external authority; silent Identity change; a Metacognition-owned calibration ledger; one global confidence score |
| C5 | Relational Graduation | Relational Graduation | `HARD_DEPENDENCY` on relationship-state foundation and C1. C3 is `CROSS_CUTTING_INTERFACE`, not a predecessor. Sibling of C4 | Long-horizon evidence of continuity, disagreement, withdrawal, repair, privacy, non-manipulation, and no authority widening. Shared-culture recomputation from separately current owner and Ashley states; interaction-contract drift and misunderstanding repair; historical shared culture remains historically true after current overlap ends | Engagement maximization; inferred consent; cognitive qualification; inherited similarity as interaction obligation |

### 5.4 Governance specification

Not a kernel. Not a phase. Not Sandbox M5.

| ID | Milestone | Existing item | Depends on | Smallest closing evidence | Explicitly not |
|---|---|---|---|---|---|
| S1 | Self-change lifecycle specification | composed Identity, Stewardship, Evaluation, Continuity, Authority, Sandbox M5/M7 | Required before any apply-to-Ashley path. Does **not** block M5 authorship | Written lifecycle: propose, review, exact-candidate bind, admit, apply, receipt, rollback, and what remains forbidden | A seventh kernel; self-modification execution; M5 authorship as self-change |

Evaluation / Qualification remains the promotion plane for every track.

### 5.5 Deferred capabilities

Do not pull these into current engineering. They stay named later work.

| ID | Existing item | Why deferred | Re-entry condition |
|---|---|---|---|
| D1 | Typed Event Spine | Freeze: design later; not a phase | Cross-owner reconstruction or recovery actually needs a join |
| D2 | Computer Use implementation | Named later mechanism under External Effect | External Effect contract + current admission; not implied by M7 or an available desktop |
| D3 | Voice / extra channels | Channel-neutral continuity is prior | A channel-specific privacy, rendering, identity, and qualification contract |
| D4 | Broad external tools | Capability availability is not authority | Per-tool admission under External Effect and Capability |
| D5 | Self-modification execution | Specification (S1) is prior | S1 closed; then exact-candidate execution under existing owners |
| D6 | Longitudinal companion evaluation campaign | Evaluation-plane extension, not a cognitive owner | C1, C3, C4/C5, and privacy-safe long-horizon evidence |

### 5.6 Existing phase-contract register

The rows below are unchanged phase contracts. They are not a delivery queue.
Status `CURRENT WORK` applies only to Sandbox Autonomy as the owner-selected
delivery focus.

| Phase or plane | Status | Dependencies (classified) | Adds | Does not add | Governing document | Smallest closing evidence |
|---|---|---|---|---|---|---|
| Sandbox Autonomy | `CURRENT WORK` | `HARD_DEPENDENCY` on governance, current source baseline, and exact-candidate M-series gates | A bounded engineering workshop and separately promoted engineering effects | Generic external agency, cognitive learning authority, or permission to alter Ashley herself | [Sandbox V2 Roadmap](sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md) | Exact-candidate milestone witness and acceptance required by the M-series contract |
| Model Fabric | `CURRENT PHASE CONTRACT`; first **code** milestone is **MF-M1** (existing-route seam). Local candidate `d918572c` is implemented; acceptance remains separate | `OWNER_SELECTED_IMPLEMENTATION_ORDER` after Sandbox. No semantic or authority derivation from Sandbox. MF-M1 qualification is evidence, not architecture | Provider-neutral profiles, specialist portfolio, purpose dispatch, bounded sessions, receipts, minimal `ContextProjection` | Provider ownership of meaning, full Context Budget, cognitive writes, execution authority, OpenCode worker | [Model Fabric Architecture](Model_Fabric_Architecture.md) | MF-M1: typed seam on current routes with unchanged Thought failover and Expression substitution; observation mismatch exposed not repaired |
| Operational Continuity | `CURRENT PHASE CONTRACT`; planned | `OWNER_SELECTED_IMPLEMENTATION_ORDER` after Model Fabric. Model-backed work is a `CROSS_CUTTING_INTERFACE`. Does not own model intelligence. | Durable work concerns, attempts, stages, leases, resumption, cancellation, artifacts, fan-out/fan-in, and effect reconciliation | Mind State, `OpenConcern`, motivation, or exactly-once external reality | [Operational Continuity Architecture](Operational_Continuity_Architecture.md) | Restart-resumable bounded work whose authority, artifact lineage, cancellation, and ambiguous effect reconcile correctly |
| Procedural Skill Graduation | `CURRENT PHASE CONTRACT`; planned | `EVIDENCE_DEPENDENCY` on attributable traces matching the procedure's evidence contract. General Operational Continuity is not required. | Candidate-to-qualified procedure lifecycle, versioning, bindings, revocation, and retirement | Capability admission, Identity, learned autonomy, or automatic graduation from repetition | [Procedural Skill Graduation Architecture](Procedural_Skill_Graduation_Architecture.md) | One evidence-bound procedure graduates, runs only under current authority, and can be revoked without residual availability |
| Computer Use | `CURRENT PHASE CONTRACT`; planned / deferred as current implementation | `HARD_DEPENDENCY` on External Effect and Authority. Procedure rung is `OWNER_SELECTED_IMPLEMENTATION_ORDER`. Multi-step recovery is `EVIDENCE_DEPENDENCY`. | Semantic application surfaces, deterministic UI control, bounded visual fallback, handoff and re-observation | Generic external-effect meaning, credential authority, blanket browser permission, or cognitive authority | [Computer Use Architecture](Computer_Use_Architecture.md) | One bounded action is observed, prepared, revalidated, committed, witnessed or reconciled, and safely resumed after interruption |
| Learned Autonomy | `CURRENT PHASE CONTRACT`; planned cognitive track | `HARD_DEPENDENCY` on Memory / Evidence maturation. Cognition owners are `CROSS_CUTTING_INTERFACE`. Unattended continuity is `EVIDENCE_DEPENDENCY`. | Evidence-bound learned preferences, bounded initiative influence, revision, decay, contradiction, rollback, and non-manipulative growth | Wider capability, obedience optimization, Identity mutation, relationship optimization, or random novelty | [Learned Autonomy Architecture](Learned_Autonomy_Architecture.md) | A learned influence changes a later choice for a traceable reason, remains within authority, survives contradiction tests, and can be demoted |
| Context Budget | `CURRENT PHASE CONTRACT`; planned attention track | `HARD_DEPENDENCY` on Memory / Evidence. `CROSS_CUTTING_INTERFACE` on Model Fabric `ContextProjection`. Operational Continuity is `EVIDENCE_DEPENDENCY` for resumable work. | Typed selection, hierarchy, budgets, compression, eviction, inspection, and deterministic rebuild rules for active context | Recall authority, forgetting, Mind State mutation, model-routing authority, or truth | [Context Budget Architecture](Context_Budget_Architecture.md) | The same persistent state yields bounded, inspectable projections under multiple budgets without changing memory or semantic truth |
| Cognitive Graduation | `CURRENT PHASE CONTRACT`; planned | `HARD_DEPENDENCY` on Memory / Evidence and Learned Autonomy. Context Budget and Operational Continuity are `EVIDENCE_DEPENDENCY`. | Epistemic maturation, durable goals and concerns, evidence-bound lived-experience continuity, belief/view revision, and integrated cognitive coherence | Personhood claims, external authority, relationship optimization, or silent Identity change | [Cognitive Graduation Architecture](Cognitive_Graduation_Architecture.md) | Long-horizon evidence shows grounded view revision, continuity, initiative diversity, refusal, and rollback without fabricated experience |
| Relational Graduation | `CURRENT PHASE CONTRACT`; planned | `HARD_DEPENDENCY` on relationship-state foundation and Memory / Evidence. Learned Autonomy is `CROSS_CUTTING_INTERFACE`, not a predecessor. | Mutual commitment semantics, tension/withdrawal continuity, non-compellable relationship development, and long-horizon relational evaluation | Engagement maximization, attachment engineering, inferred consent, ownership, or cognitive qualification | [Relational Graduation Architecture](Relational_Graduation_Architecture.md) | Long-horizon evidence shows continuity, disagreement, withdrawal, repair, privacy, non-manipulation, and no authority widening |

## 6. Phase contracts (not a delivery queue)

### Sandbox Autonomy

The accepted Sandbox V2 M-series architecture is preserved. V2 uses direct,
unprivileged Bubblewrap. M4 remains blocked by the M3 acceptance gate. The
retained V1 broker, signer, Unix socket, and `source_*` scope topology are
historical mechanisms.

Sandbox owns bounded engineering execution and, at M7, separately admitted
engineering effects. It does not own generic external representation,
credentials, purchases, communication, cognitive learning, or self-change
governance.

### Model Fabric

Model Fabric is mechanism work, not cognitive advancement. Completing it does
not graduate Thought, Agency, or Learned Autonomy.

Model Fabric is an Ashley-owned semantic dispatch boundary over replaceable
provider mechanisms. It does not derive authority or semantic ownership from
Sandbox. Current delivery still follows the Sandbox gate by owner-selected
order. Current-facing ownership is
[Model Fabric Architecture](Model_Fabric_Architecture.md). Frozen field
contracts remain in the historical `_01_` contract draft. First **code**
milestone is **MF-M1** (existing-route seam). Historical Thought-observation
Lightning slice is **F1-obs**.

It owns mechanical model capability profiles, logical roles, specialist
seats as assignment data (not a 25-purpose enum), attempt receipts,
cancellation, privacy, budgets, structured failure, and explicit fallback
policy. Models occupy seats; they are not the architecture.

AI SDK is a mechanism spike, not an architectural selection. OpenTelemetry is a
candidate adapter beneath an Ashley-owned telemetry port, not a required core
semantic interface. Model IDs, provider candidates, quotas, and target routes
are policy. They must not require roadmap rewrites.

The minimal `ContextProjection` is a typed, bounded input artifact. Context
Budget later owns selection, hierarchy, compression, and optimization. Model
Fabric must not pre-implement those semantics.

### Operational Continuity

Operational Continuity makes bounded work coherent across time, processes,
workers, crashes, and resumptions. It owns durable work concerns, attempts,
stages, leases, environment identity, resume guards, worker sessions,
activations, inbox tickets, artifacts, budgets, cancellation, and settlement.

Operational Continuity does not own model intelligence. Model-backed attempts
consume Model Fabric as an interface. They do not make Model Fabric a semantic
parent.

A work concern means that an operation must remain recoverable. An
`OpenConcern` means Ashley still finds a matter cognitively salient. Neither
state implies the other. Resume revalidates current authority. A prior grant,
credential, environment match, or receipt cannot silently authorize a resumed
effect.

Restate, Temporal, and DBOS remain comparative mechanism candidates.

### Procedural Skill Graduation

Procedural Skill Graduation turns supported experience into an inspectable,
qualified, reusable procedure through explicit proposal, definition,
qualification, registration, invocation, revision, revocation, and retirement.

Repeated success is evidence, not an automatic skill. An imported Agent Skill
or plugin format is inert until Ashley's contract qualifies its content,
bindings, required capabilities, authority, privacy, and failure behavior.
Availability never authorizes invocation. General workflow durability is
required only when the specific procedure's evidence contract needs it.

### Computer Use

Computer Use owns observation and interaction with semantic application
surfaces. Its mechanism preference is:

```text
connector or direct API
  -> qualified procedure
    -> deterministic semantic computer use
      -> visual CUA fallback
```

This is a reliability and inspectability preference, not an authority ladder.
Every consequential mechanism consumes External Effect and Authority. Computer
Use depends on that plane for action semantics. The reverse is false. A
logged-in browser is not permission. Human takeover ends epistemic continuity.
Ashley must re-observe relevant state and revalidate before resuming.

### Learned Autonomy

Learned Autonomy helps Ashley form grounded, persistent reasons of her own. It
must not become an optimizer for owner approval, obedience, engagement, or
attachment.

Learning may influence proposals, prioritization, attention, and initiative
only through explicit, inspectable state with provenance, confidence,
contradiction, revision, decay, rollback, and hard authority ceilings. Owner
preference is evidence about the owner, not a command and not Ashley's own
preference. Trust changes evidence weight only. It never expands authority.

Learned Autonomy also carries inherited,
independent, and shared-interest distinctions. `INHERITED OVERLAP` proves
origin only. Current shared interest requires separately current owner and
Ashley evidence. Shared-culture interest is Relationship state, not a Learned
Autonomy rewrite of Identity. Ordinary inherited interests may diverge without
owner approval and without engagement optimization. Owner correction of an
owner-model hypothesis must not rewrite Ashley Identity.
`SIMILARITY != INHERITANCE PROVENANCE`.

### Context Budget

Context Budget owns bounded attention over persistent state. It determines what
typed information is selected, ordered, compressed, omitted, and inspected for
a specific semantic purpose and budget.

It does not own memory, forgetting, truth, Identity, Mind State, or model
routing. `CONTEXT EVICTION != FORGETTING`. A retrieval or compression mechanism
must never mutate the source state it projects. Eligible current metacognitive hypotheses, when present, are
projected under privacy ceilings. Local persistence of a hypothesis is not
permission to send it to a remote model.

### Cognitive Graduation

Cognitive Graduation integrates grounded goals, concerns, motivations,
preferences, epistemic revisions, lived-experience records, Reflection, and
initiative without creating a new cognitive owner. Existing Identity, Mind
State, Thought, Agency, Reflection, Honesty, and Memory owners remain in force.

It is a qualification domain for increasingly coherent cognitive development.
It is not a final catch-all and cannot claim that Ashley is conscious, feels,
cares, or is a person. It must prove that present choices depend truthfully on
real prior state and evidence rather than generated narrative.

Selected prediction/outcome calibration for
consequential judgments is consumed here. Thought, Memory / Evidence,
Reflection, and Evaluation retain ownership. The Metacognition profile does
not own a calibration ledger. Current Reflection runtime is narrower than this
future calibration architecture.

### Relational Graduation

Relational Graduation is separate because relationship commitments, tensions,
withdrawal, repair, privacy, and non-manipulation have different state and risk
from cognitive belief revision. It evaluates the relationship without making
engagement or owner satisfaction the objective.

Ashley remains non-compellable. Relationship history cannot widen capability,
infer consent, manufacture loyalty, or punish distance. Relational evidence
cannot substitute for Cognitive Graduation evidence, and the reverse is also
true. Learned Autonomy is a boundary interface, not a hard predecessor.

Shared-culture interest, interaction-contract
drift, misunderstanding, and repair are Relational Graduation consumption of
metacognition policy. Historical shared culture remains historically true
after current overlap ends. An explicit owner standing instruction may become
active immediately through the proper Relationship / Memory path; repetition
is not required. Inherited similarity creates no interaction obligation. C5
closes shared-culture recomputation; that proof does not close C1.

## 7. Cross-cutting planes

### Evaluation / Qualification

The [Evaluation / Qualification Plane](Ashley_Evaluation_Qualification_Plane.md)
defines accepted claims, evidence bindings, deterministic invariants,
adversarial scenarios, judges, qualification results, and release decisions.
Deterministic gates outrank model judges. Test success does not imply
`RELEASE_QUALIFIED`. Qualification binds an exact subject, definition,
environment, source, evidence set, and decision. Metacognition policy adds stale-model, false-trait, calibration,
sovereignty, privacy, and dependency-resistance witnesses under the owners
above. It does not create a separate evaluation domain or freeze-map owner.

### Observability

The [Observability Plane](Ashley_Observability_Plane.md) owns structural
telemetry, correlation, diagnostics, privacy, redaction, retention, sampling,
and cross-process propagation. Semantic ledgers remain owned by their domains.
Telemetry does not become evidence automatically. OpenTelemetry,
OpenInference, and Phoenix remain replaceable mechanisms.

### Memory / Evidence

The [Memory / Evidence Architecture](Ashley_Memory_Evidence_Architecture.md)
separates source evidence, assertions, interpretations, materialization,
projections, forgetting, and derived indexes. Learned Autonomy has a
`HARD_DEPENDENCY` on that maturation. Context Budget and both graduation
phases consume it. No graph or vector substrate may become Recall or truth
authority. The first visible metacognitive
proof — temporal owner models, correction classes, influence eligibility, and
non-revival after owner correction — belongs here. The Metacognition profile
is a consumer, not a second store. Shared-interest and shared-culture
recompute do not close C1.

### Security / Authority

The [Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md) owns the
global authority matrix. Phase contracts narrow it. No giant `trusted`,
`autonomyAllowed`, `toolAllowed`, or `agentAllowed` boolean may stand for
cognitive proposal, memory materialization, initiative, read, mutation,
verification, procedure invocation, delegation, network, credential, browser,
representation, communication, commitment, Git, deployment, promotion, or
identity-change authority.

### External Effect and Authority

The [External Effect and Authority Architecture](External_Effect_and_Authority_Architecture.md)
is cross-cutting. It is consumed by connectors, direct APIs, procedures,
Computer Use, Sandbox engineering effects, and future mechanisms. It owns
effect meaning, admission, credential references, approvals, prepare,
revalidation, commit, receipts, witnesses, reconciliation, and human handoff.

Computer Use is one mechanism consumer. Sandbox M7 is an engineering-specific
authority domain. When an engineering effect also represents Doc externally,
both authority systems must admit it. Neither grant implies the other.

## 8. Framework and OSS disposition

Framework status describes architectural role, not installation or adoption.

| System | Disposition | Allowed role | Prohibited ownership |
|---|---|---|---|
| Mastra | `REJECTED FOR FOUNDATION ROLE` | Historical workflow lessons | Ashley cognition, routing, Recall, or authority |
| LangGraph | `REFERENCE` | Checkpoint and replay lessons | Graph meaning, materialization, or authority |
| OpenHands | `MECHANISM CANDIDATE` | Bounded coding specialist if unique value is proven | Execution authority, workspace policy, or cognition |
| Letta | `REFERENCE` | Identity/memory/context design mining | Runtime identity, memory, or persistence authority |
| AI SDK | `SPIKE REQUIRED` | Provider transport behind Ashley adapters | Routes, fallback, budgets, agents, tools, or authority |
| ACP | `MECHANISM CANDIDATE` | Worker transport and lifecycle | Worker meaning, context grants, or completion semantics |
| Restate / Temporal / DBOS | `SPIKE REQUIRED` | Durable execution comparators | Effect meaning, authority, reconciliation, or Mind State |
| Agent Skills / plugins | `MECHANISM CANDIDATE` | Inert procedure interchange | Qualification, registration, or invocation authority |
| Playwright | `SPIKE REQUIRED` | Deterministic semantic Computer Use | Intent, credentials, approval, or effect truth |
| Stagehand / Browserbase | `MECHANISM CANDIDATE` | Higher-level or remote browser mechanics | Session authority, grounding, or receipts |
| Composio / Nango | `SPIKE REQUIRED` | Connector and account lifecycle mechanics | Consent, credentials, action policy, or effects |
| Graphiti | `MECHANISM CANDIDATE` | Read-only rebuildable memory projection | Recall, truth, forgetting, or continuity |
| OpenTelemetry | `MECHANISM CANDIDATE` | Correlation and telemetry transport | Evidence meaning, memory, or authorization |
| OpenInference / Phoenix | `MECHANISM CANDIDATE` | Privacy-reviewed conventions and viewer | Cognitive meaning, qualification, or retention policy |
| Inspect AI | `MECHANISM CANDIDATE` | Evaluation scenario mechanics | Invariants, scoring authority, or promotion |
| ORAS / in-toto | `MECHANISM CANDIDATE` | Artifact transport and attestation | Artifact meaning, trust, or admission |
| CloudEvents | `REFERENCE` | Derived interoperability envelope | Event semantics, instruction admission, or ordering |
| AgentFS | `REFERENCE / LAB ONLY` | Disposable workspace and snapshot lessons | Recall, unified state, or workspace authority |

No version number, benchmark score, or successful spike makes a candidate an
architectural owner.

## 9. Historical reconciliation

| Historical position | Current disposition |
|---|---|
| Wave 07 broker is the Sandbox path | `SUPERSEDED`. Direct unprivileged Bubblewrap is the V2 path. Broker semantics may be salvaged only through current contracts. |
| External Agency belongs to the V1 broker or Computer Use | `SUPERSEDED MECHANISM; SALVAGED SEMANTICS`. External Effect and Authority is cross-cutting. |
| Self-Modification uses the V1 signer/broker topology | `SUPERSEDED MECHANISM; SALVAGED GOVERNANCE`. Self-change remains separately governed and unimplemented. |
| Mastra is Ashley's central framework | `REJECTED FOR FOUNDATION ROLE`. |
| OpenHands is the default executor | `SUPERSEDED`. It is only a bounded specialist candidate. |
| Temporal is selected or permanently rejected | `SUPERSEDED`. It remains one comparative mechanism candidate. |
| Model IDs define architectural purposes | `SUPERSEDED`. IDs are current or planned policy facts. |
| Generic workflow state is cognitive continuity | `REJECTED`. Operational and cognitive continuity are distinct. |
| Voice is the next foundation | `DEFERRED`. Text cognition and truthful continuity remain prior. |

Historical records keep their original conclusions and exact evidence. Banners
and the Document Index prevent those records from becoming current authority.

## 10. Vision-level acceptance

Completing only Sandbox, Model Fabric, Operational Continuity, procedures, and
Computer Use would produce a capable autonomous engineering agent. That is not
the Project Ashley Vision.

The roadmap serves the Vision only because Memory / Evidence maturation,
Learned Autonomy, Context Budget, Cognitive Graduation, and Relational
Graduation are first-class architecture with independent acceptance. Their
required outcome is not synthetic personality texture. It is truthful
dependence of Ashley's present on her real past; multiple grounded sources of
initiative; capacity for disagreement, refusal, silence, and withdrawal;
evidence-bound development of interests and views; non-manipulative relational
continuity; honest limits about unseen experience and inner status;
shared cognitive ancestry that is origin
rather than identity authority; and the capacity to diverge without that
divergence being treated as a defect.

Ashley may become a strong cognitive
exoskeleton. Metacognitive assistance must preserve or increase the owner's
capacity for independent judgment. Engineered dependence is failure. Helpful
reliance is not engineered dependence.

Even successful completion would not prove consciousness, feeling, care,
personhood, or moral status. Architecture can create and qualify continuity,
state, evidence, agency boundaries, and behavior. It must preserve epistemic
humility about metaphysical claims.

## 11. Roadmap Extension Recommendations

These recommendations are outside the hardened roadmap. They are not
implementation authorization and they are not engineering milestones in §5.

### Self-Change Governance

- **Problem:** Ashley may eventually propose changes to her own runtime,
  cognitive architecture, prompts, state contracts, or identity-affecting
  mechanisms. Engineering capability is not authority to alter Ashley herself.
- **Existing coverage:** Sandbox M5/M7, Evaluation, Stewardship, continuity,
  promotion, historical Self-Modification semantics, and Cross-Phase §6.1
  compose the current boundary. Remaining research is whether an independently
  owned lifecycle is required.
- **Prerequisites:** governance, Sandbox authoring/effects, Evaluation,
  Operational Continuity, artifact provenance, exact-candidate promotion, and
  continuity-lineage contracts.
- **Classification:** extension of existing owners. The composition owner is
  the Cross-Phase Architecture self-change section. Do not add a new file,
  execution plane, or roadmap phase unless research proves an unowned
  lifecycle.
- **Urgency:** `HIGH-VALUE NEXT RESEARCH`.
- **Risk if omitted:** ordinary engineering authority could be misread as
  permission to alter Ashley's cognitive or identity-bearing architecture.
- **Risk if premature:** reviving V1 self-modification machinery could create a
  broad self-edit primitive before constitutional scope, rollback, and
  qualification exist.

### Long-horizon companion and lived-experience evaluation

- **Problem:** short probes and operational receipts cannot establish truthful
  continuity, development of interests, initiative diversity, identity
  coherence, relational repair, non-manipulation, or evidence-bound own-time
  experience over months.
- **Existing coverage:** Cognitive Graduation, Relational Graduation, Memory /
  Evidence, own-time state, episodes, Reflection, and the Evaluation Plane own
  the relevant semantics. They do not yet define a durable longitudinal
  campaign, privacy model, or counterfactual controls.
- **Prerequisites:** Memory / Evidence maturation, Learned Autonomy, Context
  Budget, stable capability epochs, privacy-safe longitudinal evidence, and
  both graduation contracts.
- **Classification:** extension of the Evaluation / Qualification Plane and the
  two graduation owners. It is not a separate cognitive owner.
- **Urgency:** `HIGH-VALUE NEXT RESEARCH`.
- **Risk if omitted:** the roadmap could qualify an engineering system while
  leaving companion continuity and lived experience as untested narrative.
- **Risk if premature:** weak proxies could optimize engagement, attachment, or
  theatrical personality and then be mistaken for relational or cognitive
  growth.

### Epistemic and belief maturation

- **Problem:** retrieval and fact storage do not by themselves support durable
  uncertainty, competing hypotheses, confidence revision, disagreement, source
  conflict, or honest changes of view.
- **Existing coverage:** Memory / Evidence and Cognitive Graduation now own the
  semantic boundary. Learned Autonomy may consume qualified revisions. A
  dedicated belief store or graph has not been selected and may not be needed.
  metacognition policy adds influence
  classes, correction classes, and selected calibration without creating a
  Metacognition store.
- **Prerequisites:** assertion/evidence separation, contradiction handling,
  provenance, forgetting, Context Budget, Reflection boundaries, and
  longitudinal evaluation.
- **Classification:** extension of Cognitive Graduation and Memory / Evidence;
  research before choosing new durable state.
- **Urgency:** `HIGH-VALUE NEXT RESEARCH`.
- **Risk if omitted:** Ashley could accumulate retrieved material without
  developing coherent, revisable views of her own.
- **Risk if premature:** a premature belief graph could freeze model output as
  truth, create identity drift, or duplicate Recall authority.

### Metacognition policy (distributed; not a phase)

- **Problem:** longitudinal examination of interpretations, uncertainty,
  calibration, corrections, inherited cognitive lineage, divergence, and
  shared patterns is unowned as a named policy, even though no new faculty is
  justified.
- **Existing coverage:** Vision (shared ancestry / divergence);
  [Metacognition Architecture](Ashley_Metacognition_Architecture.md)
  (accepted policy profile); Memory / Evidence (first visible proof); Context
  Budget; Learned Autonomy; Cognitive Graduation; Relational Graduation;
  Evaluation; Model Fabric receipts as later interfaces.
- **Prerequisites:** C1 for the first owner-correction witness. Later work
  listed below does not precede C1 and does not precede MF-M1 runtime.
- **Classification:** named cross-cutting policy profile under existing
  owners. Not a freeze-map owner. Not a standalone phase. Not MF-M1 work.
- **Urgency:** `HIGH-VALUE NEXT RESEARCH` for remaining later paths; first
  visible proof is C1 when that cognitive work is selected.
- **Later named work (not §5 milestones):** owner-invoked deep reflection;
  selected prediction/outcome calibration; shared-interest and
  lineage-divergence monitoring; dyadic metacognition; Fabric-backed
  independent review; timeline projection; later temporal graph/timeline
  projection; deferred voice and cross-modal presentation. These remain in
  this §11 item and in Metacognition architecture §22.
- **Risk if omitted:** stale owner models, silent revival of corrected
  interpretations, and owner-model/Identity contamination.
- **Risk if premature:** a Metacognition store, freeze-map organ, periodic
  psych reports, visualization-as-authority, or MF-M1 scope expansion.

### Multimodal presence, voice, and embodiment

- **Problem:** text-only interaction limits perception and presence, but voice
  or embodiment introduces identity, privacy, consent, impersonation,
  accessibility, and rendering risks.
- **Existing coverage:** current perception artifacts and rendering boundaries
  cover limited inputs. They do not establish live voice, continuous sensing,
  embodiment, or multi-channel identity continuity.
- **Prerequisites:** stable text cognition, privacy and consent, channel-neutral
  continuity, media provenance, realtime interruption, and channel-specific
  Evaluation.
- **Classification:** `research only` now. A later phase is justified only by a
  concrete capability and authority contract.
- **Urgency:** `DEFERRED`.
- **Risk if omitted:** Ashley may remain less present and expressive across
  modalities.
- **Risk if premature:** voice or embodiment can optimize surface realism,
  expand surveillance, or create deceptive anthropomorphic claims before
  truthful continuity is mature.

### Own-time execution breadth

- **Problem:** meaningful private activity needs more than an absence timer or
  owner-directed durable work. Ashley needs truthful records of what she
  actually read, attempted, discovered, failed to do, reconsidered, or chose
  not to continue.
- **Existing coverage:** Operational Continuity records work; Memory / Evidence
  records provenance; Learned Autonomy and Cognitive Graduation own meaning;
  own-time sessions and Reflection provide partial current state. No separate
  owner is currently proven necessary.
- **Prerequisites:** those four contracts plus privacy, budgets, cancellation,
  and longitudinal evaluation.
- **Classification:** extension of existing owners. Reject a new roadmap phase
  unless a design spike finds state or authority that none of them owns.
- **Urgency:** `HIGH-VALUE NEXT RESEARCH`.
- **Risk if omitted:** private activity may remain scheduled machinery with no
  truthful cognitive consequence.
- **Risk if premature:** generic background task generation could create noise,
  fabricated significance, resource waste, or unsafe effect pressure.

### Priorities for owner discussion

1. Long-horizon companion and lived-experience evaluation.
2. Self-Change Governance.
3. Epistemic and belief maturation.

## 12. Open architecture questions

These questions affect future implementation selection. They do not reopen the
topology:

- Which durable execution mechanism, if any, best satisfies Operational
  Continuity without importing its ontology.
- Which provider transport satisfies the Model Fabric **Track A** contract
  after MF-M3 qualification (Zen HTTP vs isolated server vs other). Transport
  is not architectural identity. MF-M1 does not select it.
- Which connector and Computer Use mechanisms earn bounded spikes.
- What minimal durable representation, if any, epistemic maturation requires
  beyond current evidence and assertion owners.
- What longitudinal campaign design can evaluate companion continuity without
  engagement or attachment optimization.
- Whether a Self-Change Governance design spike discovers an unowned lifecycle
  that justifies a distinct future phase.
- Exact SQL, numeric “material contradiction” / “long gap” thresholds, I1
  operational bounds, and approved deep-reflection remote routes for
  metacognition policy. These do not reopen Q0–Q16 or add a freeze-map owner.

## 13. Canonical entry path

1. Read [`VISION.md`](../../VISION.md) and governing documents in authority
   order.
2. Read this roadmap. Use §3 for live state, §4 for work classes, and §5 for
   engineering milestones from current state forward. §6 is phase contracts,
   not a delivery queue.
3. Read the [Document Index](Ashley_Architecture_Document_Index.md),
   [Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md), and the
   relevant cross-cutting plane.
4. Read the focused phase contract.
5. Read current source or the living status document for volatile facts.
6. Use historical and research documents only for provenance or mechanism
   comparison.
7. Before implementation, define the exact claim, subject, evidence, authority,
   rollback, and acceptance gate. Architecture alone does not authorize work.
