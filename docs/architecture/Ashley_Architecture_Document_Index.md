# Project Ashley Architecture Document Index

**Status:** Canonical document-status inventory

**Canonicalized:** 2026-08-21

This index answers which documents govern current architecture, which support
it, and which preserve historical research. It does not replace the documents
it indexes. Current roadmap direction lives in the
[Canonical Architecture Roadmap](Ashley_Architecture_Roadmap.md).
Volatile implementation facts are resolved live from Git, source,
exact-candidate packets, or production observation. This index is
navigation and document-status authority. It is not a second architecture
owner and not a current-state dashboard.

## 0. Cold start

1. [`VISION.md`](../../VISION.md)
2. [`Ashley_Core_Principles.md`](../Ashley_Core_Principles.md)
3. [`Ashley_Constitution.md`](../Ashley_Constitution.md)
4. [`Ashley_Stewardship_Compact.md`](../Ashley_Stewardship_Compact.md) and [`Ashley_Ethics.md`](../Ashley_Ethics.md)
5. [`Ashley_Hierarchy.md`](../Ashley_Hierarchy.md)
6. [Canonical Architecture Roadmap](Ashley_Architecture_Roadmap.md)
7. [Architecture Freeze](Ashley_Architecture_Freeze.md) (owner map and event terminology; not a dashboard)
8. [Cross-Phase Architecture](Ashley_Cross_Phase_Architecture.md)
9. task-specific focused contract
10. live state resolution from Git / source / exact-candidate evidence / production observation

Constitution, Stewardship Compact, and Ethics are not skippable. Steps 1–8 are
architecture / governance authority. Step 9 is the task contract. Step 10
resolves volatile facts from their actual owners.

### Live state resolution

Resolve volatile truth from its real authority when needed. Do not infer
current maturity from source presence, architecture, or historical packets.

| Fact | Authority |
|---|---|
| Repository HEAD | Git / `git rev-parse HEAD` |
| Worktree state | Git / `git status --short` |
| Supported schema | source (`apps/agent-service/src/core/db.ts`) |
| Current route bindings | routing source + explicitly audited [`Routing_Status.md`](../Routing_Status.md) |
| Qualification / release state | exact-candidate evidence packet |
| Deployed SHA | production observation |
| Promoted capabilities | production observation |
| Architectural prerequisites | canonical roadmap / focused contract |
| Owner-selected current task | owner / current working context; do not infer |

If current truth cannot be established from permitted evidence: `UNKNOWN`.
Architecture documents must not act as current-state dashboards.

| Do | Do not |
|---|---|
| Resolve volatile facts from their actual owner | Resurrect Sandbox V1 broker architecture |
| Follow the focused contract for the task | Treat worktree source as deployed |
| Use Wave Acceptance verification semantics | Treat a passed test as capability promotion, or `RELEASE_QUALIFIED` as `PRODUCTION_ACCEPTED` |
| | Copy schema or model IDs into timeless architecture |
| | Infer self-change authority from Sandbox M5/M7 |
| | Implement a later milestone while its documented predecessor gate is unmet |
| | Infer current maturity from source presence, architecture, or historical packets |

Today’s pending gate is not recorded here. Resolve it live. Architecture owns
prerequisite relationships only.

Repository documentation was reconciled against the supplied Frozen
Architecture Baseline and a later owner-supplied ChatGPT-history decision
reconciliation. Raw inaccessible conversations were not directly searched by
this worker.

## Status definitions

| Status | Meaning in this index |
|---|---|
| `AUTHORITATIVE` | Governs the stated domain. Lower documents do not override it. |
| `CURRENT PHASE CONTRACT` | Current authoritative contract for one roadmap phase beneath the roadmap and Cross-Phase Architecture. |
| `SUPPORTING` | Current explanatory, operational, or evidence material beneath authoritative direction. |
| `HISTORICAL` | Preserves a dated implementation, review, qualification, or decision snapshot. |
| `SUPERSEDED` | Preserves a position that no longer describes current architecture or roadmap. |
| `REFERENCE` | Useful research, procedure, or design input without current authority. |
| `SALVAGEABLE SEMANTICS / SUPERSEDED MECHANISM` | Reusable laws or contracts remain; topology or implementation mechanism is not current. |
| `CONFLICTING / NEEDS REVIEW` | Contains a material statement that conflicts with current source or the Frozen Architecture Baseline. Do not use that statement as current direction. |

`Wave_accepted`, local test success, release qualification, deployment,
activation, and capability promotion are separate states. This index does not
upgrade one into another.

## 1. Governance and canonical direction

| Title | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Vision | [`VISION.md`](../../VISION.md) | Why Ashley exists; reciprocal non-servant direction | Current | `AUTHORITATIVE` | Normatively prior. Not a runtime prompt. |
| Ashley Core Principles | [`docs/Ashley_Core_Principles.md`](../Ashley_Core_Principles.md) | Highest constitutional constraints beneath the Vision | Current | `AUTHORITATIVE` | Governs all lower architecture and implementation. |
| Ashley Constitution | [`docs/Ashley_Constitution.md`](../Ashley_Constitution.md) | Long-form behavioral and architectural constitution | Current | `AUTHORITATIVE` | Preserves stable principles and intentionally evolvable implementation. |
| Ashley Stewardship Compact | [`docs/Ashley_Stewardship_Compact.md`](../Ashley_Stewardship_Compact.md) | Operator authority, consultation, emergency stop, custody | Current | `AUTHORITATIVE` | Peer specialized governance beneath the Constitution. |
| Ashley Ethics | [`docs/Ashley_Ethics.md`](../Ashley_Ethics.md) | Relational, privacy, credential, and external-entity ethics | Current | `AUTHORITATIVE` | Peer specialized governance beneath the Constitution. |
| Ashley Hierarchy | [`docs/Ashley_Hierarchy.md`](../Ashley_Hierarchy.md) | Normative order and conflict rule | Current | `AUTHORITATIVE` | Defines precedence from Vision through runtime. |
| Ashley Glossary | [`docs/Ashley_Glossary.md`](../Ashley_Glossary.md) | Normative project vocabulary | Current | `AUTHORITATIVE` | Use for established semantic terms. The roadmap adds phase terms without redefining glossary entries. |
| Ashley Design Patterns | [`docs/Ashley_Design_Patterns.md`](../Ashley_Design_Patterns.md) | Architecture ownership and review patterns | Current | `SUPPORTING` | Applies governing semantics to recurring design choices. |
| Canonical Architecture Roadmap | [`docs/architecture/Ashley_Architecture_Roadmap.md`](Ashley_Architecture_Roadmap.md) | Current implementation boundary, owner-selected delivery map, classified dependency edges, phase names, delivery focus, engineering milestones from live state, and framework disposition | 2026-08-21; milestone conversion 2026-08-23 | `AUTHORITATIVE` | Canonical source for current architectural direction beneath governance. The 2026-08-23 conversion adds no phases; it orders existing items as engineering milestones. |
| Architecture Freeze | [`docs/architecture/Ashley_Architecture_Freeze.md`](Ashley_Architecture_Freeze.md) | Frozen owner map, event-term split, external inspiration disposition, architecture-justified sequence before advanced autonomy | 2026-08-23 | `AUTHORITATIVE` | Completeness research landed here. Adds no owners. Distinguishes historical research, frozen architecture, planned work, and owner-selected delivery. |
| Architecture Freeze documentation sync | [`docs/handoffs/ashley-architecture-freeze-doc-sync.md`](../handoffs/ashley-architecture-freeze-doc-sync.md) | Change plan, term classification, and consistency report for the freeze documentation pass | 2026-08-23 | `SUPPORTING` | Records this documentation synchronization. It is not an architecture owner and authorizes no implementation. |
| Roadmap engineering-milestone conversion | [`docs/handoffs/ashley-roadmap-engineering-milestones.md`](../handoffs/ashley-roadmap-engineering-milestones.md) | Converts existing roadmap items into dependency-ordered engineering milestones from live state | 2026-08-23 | `SUPPORTING` | Records the milestone conversion. Adds no phases. Authorizes no implementation. |
| Milestone Execution Governance | [`docs/architecture/Ashley_Milestone_Execution_Governance.md`](Ashley_Milestone_Execution_Governance.md) | Execution contracts, leakage guards, artifact ladder, and next-action ranking for already-named milestones | 2026-08-23 | `AUTHORITATIVE` | Governs execution discipline over existing milestones. Adds no owners, phases, or primitives. Does not accept M3/M4 or authorize implementation. |
| Milestone execution governance review | [`docs/handoffs/ashley-milestone-execution-governance.md`](../handoffs/ashley-milestone-execution-governance.md) | Review record for the execution-governance pass | 2026-08-23 | `SUPPORTING` | Records the review. Not an architecture owner. |
| Cross-Phase Architecture | [`docs/architecture/Ashley_Cross_Phase_Architecture.md`](Ashley_Cross_Phase_Architecture.md) | Shared laws, classified dependency edges, state ownership, authority matrix, effect/ambiguity contract, and current-fact policy | 2026-08-21 | `AUTHORITATIVE` | Governs interfaces used by every phase. Owns `HARD_DEPENDENCY`, `EVIDENCE_DEPENDENCY`, `OWNER_SELECTED_IMPLEMENTATION_ORDER`, and `CROSS_CUTTING_INTERFACE`. The roadmap owns delivery priority. |
| Sandbox V2 M-Series Roadmap | [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md) | Current M0-M7 boundaries, V1 supersession, state ownership, authority progression, operational truth, and acceptance gates | 2026-08-21 | `AUTHORITATIVE` | Governs Sandbox V2 beneath higher governance and the canonical architecture roadmap. Read before implementing any later V2 milestone. |
| Architecture Document Index | [`docs/architecture/Ashley_Architecture_Document_Index.md`](Ashley_Architecture_Document_Index.md) | Document authority and history | 2026-08-17 | `AUTHORITATIVE` | Canonical source for document status and relevance. |
| Ashley Architecture Index | [`docs/Architecture_Index.md`](../Architecture_Index.md) | Runtime modules, ownership, endpoints, and current design links | Current | `SUPPORTING` | Implementation-oriented map. It is not the roadmap. |
| Architecture Review Protocol | [`docs/Architecture_Review_Protocol.md`](../Architecture_Review_Protocol.md) | Architecture review discipline | Current | `SUPPORTING` | Applies governance and ownership rules during review. |
| Wave Acceptance Protocol | [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md) | Design, implementation, qualification, release, deployment, promotion states | Current | `AUTHORITATIVE` | Governs acceptance claims and evidence separation. |
| Vision Implementation Map | [`docs/Vision_Implementation_Map.md`](../Vision_Implementation_Map.md) | Vision commitment to owner/evidence/failure/status mapping | Current | `SUPPORTING` | Traceability beneath governance. |
| Project AGENTS instructions | [`AGENTS.md`](../../AGENTS.md) | Repository operations and architecture summary | Current | `SUPPORTING` | Contributor instructions. Not an independent architecture authority. |
| Public README | [`README.md`](../../README.md) | Public project positioning and entry links | Current | `SUPPORTING` | Landing page only. Follow canonical documents for architecture detail. |

## 2. Current subsystem and design documents

| Title | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Routing Status | [`docs/Routing_Status.md`](../Routing_Status.md) | Purpose routes, providers, models, quotas, disabled routes | Wave 1; living source status | `SUPPORTING` | Living source snapshot. Route facts are split across `config/models.json`, `PURPOSE_TO_ROUTE`, and registry dispatch. Read that file for current model IDs. Not Model Fabric architecture. |
| Model Fabric Architecture | [`docs/architecture/Model_Fabric_Architecture.md`](Model_Fabric_Architecture.md) | Semantic dispatch boundary, ContextProjection transport, specialist sessions, first-slice constraints | 2026-08-21 | `CURRENT PHASE CONTRACT` | Current-facing Model Fabric owner. Model IDs remain policy. Implementation is not authorized. |
| Model Fabric Codebase Reconnaissance | [`docs/architecture/Model_Fabric_01_Codebase_Reconnaissance.md`](Model_Fabric_01_Codebase_Reconnaissance.md) | Dated model-call inventory, routing defects, transport seams | 2026-08-13 | `HISTORICAL` | Exact-baseline source snapshot. Historical filename retained. Future target policy is Lightning primary for specialist/utility routes, without rewriting current routing. |
| Model Fabric Contract Draft | [`docs/architecture/Model_Fabric_01_Contract_Draft.md`](Model_Fabric_01_Contract_Draft.md) | Frozen provider-neutral field contracts and first-slice specification | 2026-08-13 | `SUPPORTING` | Field-level contracts beneath the Model Fabric Architecture. Historical filename retained. First-slice fallback remains prohibited. |
| Model Fabric Implementation Spike | [`docs/architecture/Model_Fabric_01_Implementation_Spike.md`](Model_Fabric_01_Implementation_Spike.md) | Default-off Thought-observation shadow slice | 2026-08-13 | `SUPPORTING` | Planned only. Lightning is first primary; GPT-OSS-120B fallback is later and separately qualified. Implementation is not authorized. |
| Ashley Evaluation / Qualification Plane | [`docs/architecture/Ashley_Evaluation_Qualification_Plane.md`](Ashley_Evaluation_Qualification_Plane.md) | Cross-cutting invariant, evidence, qualification, and promotion contracts | 2026-08-13 | `AUTHORITATIVE` | Ashley owns qualification meaning and promotion. Model Fabric supplies bound profile and receipt facts. Canonical release-readiness term is `RELEASE_QUALIFIED`. |
| Ashley Evaluation Inventory | [`docs/architecture/evaluation/Ashley_Evaluation_Inventory.md`](evaluation/Ashley_Evaluation_Inventory.md) | Current evaluation mechanisms and gaps | 2026-08-13 | `SUPPORTING` | Source-grounded inventory. Existing checks do not automatically qualify a replacement model or fallback role. |
| Evaluation First Spike | [`docs/architecture/evaluation/Evaluation_First_Spike.md`](evaluation/Evaluation_First_Spike.md) | Future `MODEL_PROFILE` evidence and qualification slice | 2026-08-13 | `SUPPORTING` | Implementation waits for Model Fabric first-slice gates. It creates no second profile registry or promotion path. |
| Observability Plane | [`docs/architecture/Ashley_Observability_Plane.md`](Ashley_Observability_Plane.md) | Telemetry, correlation, redaction, retention, and diagnostic-versus-control boundaries | 2026-08-21 | `AUTHORITATIVE` | Observability is not evaluation, qualification, memory, or an Effect Witness. OpenTelemetry is a mechanism candidate, not a required semantic interface. |
| External Effect and Authority Architecture | [`docs/architecture/External_Effect_and_Authority_Architecture.md`](External_Effect_and_Authority_Architecture.md) | Cross-cutting observation, credential, representation, commit, receipt, witness, and reconciliation contracts | 2026-08-21 | `AUTHORITATIVE` | Parent of connectors, procedures, Computer Use, and Sandbox M7 engineering effects. Computer Use is one consumer, not the parent of generic external action. |
| Operational Continuity Architecture | [`docs/architecture/Operational_Continuity_Architecture.md`](Operational_Continuity_Architecture.md) | WorkConcern, attempt, lease, resume, cancellation, artifacts, and effect reconciliation | 2026-08-21 | `CURRENT PHASE CONTRACT` | Durable work is not OpenConcern or Mind State. Restate, Temporal, and DBOS remain mechanism candidates. |
| Procedural Skill Graduation Architecture | [`docs/architecture/Procedural_Skill_Graduation_Architecture.md`](Procedural_Skill_Graduation_Architecture.md) | Experience to qualified reusable procedure without automatic authority | 2026-08-21 | `CURRENT PHASE CONTRACT` | Installed or imported skills remain inert until Ashley-owned qualification and current invocation admission. |
| Computer Use Architecture | [`docs/architecture/Computer_Use_Architecture.md`](Computer_Use_Architecture.md) | Semantic application observation and interaction | 2026-08-21 | `CURRENT PHASE CONTRACT` | Mechanism preference is connector, procedure, deterministic UI, then visual fallback. A logged-in session is not permission. |
| Learned Autonomy Architecture | [`docs/architecture/Learned_Autonomy_Architecture.md`](Learned_Autonomy_Architecture.md) | Evidence-bound interests, preferences, salience, and goals | 2026-08-21 | `CURRENT PHASE CONTRACT` | Advances Ashley herself. Learned preference is not authority. Does not depend on Computer Use. |
| Context Budget Architecture | [`docs/architecture/Context_Budget_Architecture.md`](Context_Budget_Architecture.md) | Bounded attention over persistent state | 2026-08-21 | `CURRENT PHASE CONTRACT` | Context eviction is not forgetting. Minimal Model Fabric `ContextProjection` is transport only. |
| Cognitive Graduation Architecture | [`docs/architecture/Cognitive_Graduation_Architecture.md`](Cognitive_Graduation_Architecture.md) | Epistemic maturation, lived-experience continuity, integrated cognitive coherence | 2026-08-21 | `CURRENT PHASE CONTRACT` | Integration and qualification over existing cognitive owners. Not a catch-all and not Relational Graduation. |
| Relational Graduation Architecture | [`docs/architecture/Relational_Graduation_Architecture.md`](Relational_Graduation_Architecture.md) | Mutual commitment, tension, withdrawal, non-manipulation, companion continuity | 2026-08-21 | `CURRENT PHASE CONTRACT` | Sibling of Cognitive Graduation. Independent state, evidence, rollback, and acceptance. |
| Memory and Recall | [`docs/memory-and-recall.md`](../memory-and-recall.md) | Nuclear Recall, provenance, forgetting, and continuity | Current nuclear era | `SUPPORTING` | Use with current source and schema migrations. `nuclear.db` and `continuity.db` remain authoritative for their domains. |
| Ashley Memory Evidence Architecture | [`docs/architecture/Ashley_Memory_Evidence_Architecture.md`](Ashley_Memory_Evidence_Architecture.md) | Persistent memory evidence: canonical evidence vs memory assertions vs retrieval projections; provenance; temporal / revision / forgetting semantics | 2026-08-17 | `AUTHORITATIVE` | Governs persistent memory evidence, assertions, retrieval projections, provenance, and temporal / revision / forgetting semantics within its domain. Implementation remains roadmap-gated. |
| Proactive messages | [`docs/proactive-initiative.md`](../proactive-initiative.md) | Initiative scheduling, Agency decision, reserve/send/commit | Current nuclear era | `SUPPORTING` | Explains implemented proactive flow. Timer mechanics never become Agency. |
| Grounded Curiosity Reader | [`docs/curiosity-reader.md`](../curiosity-reader.md) | Bounded public reading and evidence | Current nuclear era | `SUPPORTING` | Reading is untrusted evidence and never sends directly. |
| Sandbox V2 M3 Design | [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_M3_DESIGN.md`](sandbox/ASHLEY_SANDBOX_V2_M3_DESIGN.md) | Current private writable candidate-workspace milestone contract | 2026-08 | `SUPPORTING` | Owns M3 detail beneath the V2 M-series roadmap. Current exact-SHA physical and production acceptance require separate evidence. |
| Sandbox V2 M4 Design | [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_M4_DESIGN.md`](sandbox/ASHLEY_SANDBOX_V2_M4_DESIGN.md) | M4 verification milestone contract: snapshot identity, recipe catalog, evidence, honesty boundary | 2026-08-22 | `SUPPORTING` | Owns M4 detail beneath the V2 M-series roadmap. Design accepted. Implementation, qualification, and production acceptance require separate evidence. |
| Sandbox V2 M5 Design | [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_M5_DESIGN.md`](sandbox/ASHLEY_SANDBOX_V2_M5_DESIGN.md) | M5 authorship milestone contract: candidate change-set, seal, advisory proposal, non-apply | 2026-08-23 | `SUPPORTING` | Owns M5 detail beneath the V2 M-series roadmap. Design accepted. Local settlement is a separate handoff. Physical qualification and production acceptance remain later. Authorship is not apply-to-Ashley. |
| Sandbox Design | [`docs/Sandbox_Design.md`](../Sandbox_Design.md) | V1 OS-boundary threat model, broker, authority, IPC, isolation | Wave 07 | `HISTORICAL` | Preserves V1 broker provenance and salvageable isolation laws. Its broker topology is superseded for V2. |
| Sandbox Operations | [`docs/Sandbox_Operations.md`](../Sandbox_Operations.md) | V1 broker recovery, sweep, ceilings, and reconciliation | Sandbox V1 hardening era | `HISTORICAL` | Salvage bounded-cleanup and crash-finality lessons only through current V2 contracts. The broker runbook is not current V2 operations. |
| Sandbox Status | [`docs/Sandbox_Status.md`](../Sandbox_Status.md) | V1 broker readiness and isolation snapshots | SANDBOX-ISOLATION-01/02E | `HISTORICAL` | Dated V1 status evidence. It does not describe current V2 readiness or grant current exact-SHA qualification. |
| Sandbox Production Release Packet v1 | [`docs/architecture/sandbox/Sandbox_Production_Release_Packet_v1.md`](sandbox/Sandbox_Production_Release_Packet_v1.md) | V1 broker release gates and operator evidence | 2026-08-12 | `HISTORICAL` | Exact-scope V1 release-planning provenance only. It does not govern or qualify V2. |
| Offline Qualification Network Isolation v1 | [`docs/qualification/Offline_Qualification_Network_Isolation_v1.md`](../qualification/Offline_Qualification_Network_Isolation_v1.md) | Offline harness and network-isolation evidence | 2026-08-09 | `HISTORICAL` | Qualification evidence for its exact scope and build only. |
| Self-Modification Design | [`docs/Self_Modification_Design.md`](../Self_Modification_Design.md) | V1 change proposals and isolated source workflow | Wave 08 | `REFERENCE` | Change-set, stale-base, provenance, secret-exclusion, receipt, and approval-is-not-effect semantics may inform V2 M5/M7. V1 broker topology and `source_*` scopes are superseded. Self-Change Governance is a recommended extension of existing owners, not a new roadmap phase. |
| External Agency Design | [`docs/External_Agency_Design.md`](../External_Agency_Design.md) | Wave 09 external accounts, vault, actions, dual authorization | Wave 09 | `SALVAGEABLE SEMANTICS / SUPERSEDED MECHANISM` | Salvage credential, privacy, payload, idempotency, receipt, and reconciliation semantics. Wave broker topology is not current. Local source is undeployed fake-adapter only. |
| Stabilization Design | [`docs/Stabilization_Design.md`](../Stabilization_Design.md) | Wave 10 assurance and stabilization | 2026-08-04 | `SUPPORTING` | Accepted assurance design. Wave acceptance remains distinct from release qualification. |
| Behavioral Evidence Inventory Audit | [`docs/behavioral-evidence-inventory-audit.md`](../behavioral-evidence-inventory-audit.md) | Evidence surface audit | Current nuclear era | `REFERENCE` | Read-only audit evidence for its snapshot. Not a roadmap. |
| Rollout Execution vs Influence Audit | [`docs/rollout-execution-influence-audit.md`](../rollout-execution-influence-audit.md) | Observe/apply and execution/influence separation | Current nuclear era | `SUPPORTING` | Preserves authority-at-creation and non-time-shift distinctions. |
| Persona eval and staged ship | [`docs/persona-eval.md`](../persona-eval.md) | Persona evaluation and rollout | Earlier evaluation era | `REFERENCE` | Evaluation patterns only. Current roadmap and Wave Acceptance Protocol govern phase ordering. |
| Consciousness and Personhood Research Track | [`docs/personhood-research.md`](../personhood-research.md) | Research questions about personhood | Ongoing research | `REFERENCE` | Research track beneath the Vision. It does not grant consciousness claims or runtime authority. |

## 3. Initiative and cognitive-continuity records

| Title | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Initiative Production Path Audit v1 | [`docs/architecture/initiative/Initiative_Production_Path_Audit_v1.md`](initiative/Initiative_Production_Path_Audit_v1.md) | Initiative runtime-path audit | 2026-08-09 | `HISTORICAL` | Evidence snapshot for implemented initiative paths. |
| INIT-03 Persistent Cognitive Continuity Contract v1 | [`docs/architecture/initiative/INIT03_Persistent_Cognitive_Continuity_Contract_v1.md`](initiative/INIT03_Persistent_Cognitive_Continuity_Contract_v1.md) | Cognition generations, wake/review, continuity | 2026-08-09 | `SUPPORTING` | Accepted local contract. Operational Continuity is a broader future phase and must not be conflated with INIT-03. |
| INIT-03 Implementation and Qualification Report v1 | [`docs/architecture/initiative/INIT03_Implementation_and_Qualification_Report_v1.md`](initiative/INIT03_Implementation_and_Qualification_Report_v1.md) | Local implementation and qualification evidence | 2026-08-10 to 2026-08-11 | `HISTORICAL` | Local evidence for the recorded build. Independent closure and live release remain separate. |

## 4. Foundation, salvage, and framework research

| Title | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Ashley Architecture Salvage Map v1 | [`docs/architecture/Ashley_Architecture_Salvage_Map_v1.md`](Ashley_Architecture_Salvage_Map_v1.md) | First framework and subsystem salvage map | 2026-08-08 to 2026-08-09 | `SUPERSEDED` | Preserves Pass 1 research. Do not use its candidate priority as the current roadmap. |
| Ashley Foundation Architecture Decision v1 | [`docs/architecture/Ashley_Foundation_Architecture_Decision_v1.md`](Ashley_Foundation_Architecture_Decision_v1.md) | P-01 foundation and semantic-boundary decision | 2026-08-09 | `HISTORICAL` | Semantic ownership and `KEEP CURRENT` reasoning remain supporting. Its roadmap ordering and “implementation not started” snapshot are no longer current. |
| Ashley Architecture Salvage Map v2 | [`docs/architecture/Ashley_Architecture_Salvage_Map_v2.md`](Ashley_Architecture_Salvage_Map_v2.md) | Accepted 31-subsystem decision surface | 2026-08-09 | `HISTORICAL` | Strong provenance for ownership seams. Later roadmap positions, including durable execution, are governed by the canonical roadmap. |
| Salvage Map Adversarial Audit v1 | [`docs/architecture/salvage/Ashley_Salvage_Map_Adversarial_Audit_v1.md`](salvage/Ashley_Salvage_Map_Adversarial_Audit_v1.md) | Red-team of KEEP and candidate claims | 2026-08-09 | `HISTORICAL` | Supports semantic ownership and narrow machinery seams. Candidate priorities are not current direction. |
| Ashley Subsystem Inventory | [`docs/architecture/salvage/Ashley_Subsystem_Inventory.md`](salvage/Ashley_Subsystem_Inventory.md) | 31-subsystem source inventory | 2026-08-09 | `HISTORICAL` | Useful source-era inventory. Verify against current source before use. |
| Foundation Candidate Dossiers | [`docs/architecture/salvage/Foundation_Candidate_Dossiers.md`](salvage/Foundation_Candidate_Dossiers.md) | Framework research dossiers | 2026-08-09 | `REFERENCE` | Research provenance only. External projects and adoption status may drift. |
| Porting Spike Backlog | [`docs/architecture/salvage/Porting_Spike_Backlog.md`](salvage/Porting_Spike_Backlog.md) | Proposed framework and porting spikes | 2026-08-09 | `SUPERSEDED` | Research-only backlog explicitly did not authorize work. Canonical roadmap now governs phase order. |
| Research Gaps and Contradictions | [`docs/architecture/salvage/Research_Gaps_and_Contradictions.md`](salvage/Research_Gaps_and_Contradictions.md) | Candidate conflicts and research gaps | 2026-08-09 | `HISTORICAL` | Preserves why Mastra, AgentFS, OpenHands, and Letta roles were narrowed. Some gaps were later resolved by P-01/P-02. |
| Semantica Salvage Audit v1 | [`docs/architecture/salvage/Semantica_Salvage_Audit_v1.md`](salvage/Semantica_Salvage_Audit_v1.md) | Semantic-framework source audit | 2026-08-09 | `REFERENCE` | Supports no-wholesale-adoption and a possible read-only PROV-O export adapter. Semantica is not Ashley authority. |
| Autonomous Work Semantics Salvage | [`docs/architecture/research/Autonomous_Work_Semantics_Salvage.md`](research/Autonomous_Work_Semantics_Salvage.md) | Autonomous-work semantic distinctions and candidate reconciliation | 2026-08-13 | `REFERENCE` | Records architectural pressure and future direction without freezing candidate names, selecting a substrate, or authorizing implementation. Historical `-01` labels are provenance. |
| Operational Continuity Codebase Reconnaissance | [`docs/architecture/research/Operational_Continuity_01_Codebase_Reconnaissance.md`](research/Operational_Continuity_01_Codebase_Reconnaissance.md) | Dated inventory of durable jobs, delivery, leases, and recovery patterns | 2026-08-14 | `HISTORICAL` | Exact-baseline snapshot. V1 broker, schema v27, and serial phase labels are not current. Use the Operational Continuity Architecture for current direction. Historical filename retained. The phrase “Event Fabric” in that snapshot means the durable inbox, not the later typed Event Spine. |
| Sandbox Final Activation Path Reconnaissance | [`docs/architecture/research/Sandbox_Final_Activation_Path_Reconnaissance.md`](research/Sandbox_Final_Activation_Path_Reconnaissance.md) | V1 broker install/activation path | 2026-08 | `HISTORICAL` | Historical Sandbox V1 broker activation reconnaissance. It does not define Sandbox V2 activation. |
| Untracked root qualification packets | repository root (`M3_*`, `oc-m1-*`, `QUALIFICATION_PACKET_*`, and similar) | Exact-candidate or investigation working evidence | mixed | `HISTORICAL` / untracked working evidence | Not architecture. Bind only the packet’s stated SHA, host, and claim. Do not infer current HEAD maturity from a historical packet. |
| Model Fabric Final Implementation Packet | [`docs/architecture/research/Model_Fabric_01_Final_Implementation_Packet.md`](research/Model_Fabric_01_Final_Implementation_Packet.md) | Read-only first-slice planning snapshot | 2026-08-14 | `REFERENCE` | Planning packet only. Does not authorize implementation or outrank the Model Fabric Architecture. |
| MemPalace Architecture Salvage Map | [`docs/architecture/research/MemPalace_Salvage_Map.md`](research/MemPalace_Salvage_Map.md) | Adjudicated MemPalace research and salvage decisions | 2026-08-17 | `SUPPORTING` | Adjudicated research provenance beneath the Ashley-native memory evidence architecture. Its decisions are frozen; none authorize implementation. It does not normatively outrank the architecture document. Historical `-01` labels are provenance. |

## 5. P-01 and P-02 evidence

| Title | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| P-01A Current Cognition Characterization | [`docs/architecture/spikes/P01A_Current_Cognition_Characterization.md`](spikes/P01A_Current_Cognition_Characterization.md) | Candidate-neutral cognition job contract | 2026-08-09 | `HISTORICAL` | Passed characterization evidence for its source baseline. |
| P-01B Workflow Parity Report | [`docs/architecture/spikes/P01B_Workflow_Parity_Report.md`](spikes/P01B_Workflow_Parity_Report.md) | Real Mastra and LangGraph parity | 2026-08-09 | `HISTORICAL` | Both comparators passed isolated parity but proved zero production Ashley LOC retirement. No adoption authorization. |
| P-01 Foundation Selection Evidence | [`docs/architecture/spikes/P01_Foundation_Selection_Evidence.md`](spikes/P01_Foundation_Selection_Evidence.md) | Final `KEEP CURRENT` decision | 2026-08-09 | `SUPPORTING` | Controls the completed P-01 foundation comparison. It does not cancel the later Restate/Temporal/DBOS Operational Continuity spike. |
| P-01 Overnight Final Report | [`docs/architecture/spikes/P01_Overnight_Final_Report.md`](spikes/P01_Overnight_Final_Report.md) | First partial overnight run | 2026-08-09 | `SUPERSEDED` | Preserves the initial stopped LangGraph run. Later P-01B evidence completed the comparison. |
| P-02 Agent Plugins Conformance Report | [`docs/architecture/spikes/P02_Agent_Plugins_Conformance_Report.md`](spikes/P02_Agent_Plugins_Conformance_Report.md) | Inert parser and quarantine conformance | 2026-08-09 | `HISTORICAL` | Parser spike passed. Runtime, MCP activation, trust, and policy authority were not authorized. |

## 6. Wave and boundary evidence

| Title / family | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Boundary 2–7 architecture reviews | [`docs/handoffs/boundary-2-thought-output-review.md`](../handoffs/boundary-2-thought-output-review.md), [`boundary-3-expression-rendering-review.md`](../handoffs/boundary-3-expression-rendering-review.md), [`boundary-4-identity-cleanup-review.md`](../handoffs/boundary-4-identity-cleanup-review.md), [`boundary-5-mind-state-cleanup-review.md`](../handoffs/boundary-5-mind-state-cleanup-review.md), [`boundary-6-thought-completion-review.md`](../handoffs/boundary-6-thought-completion-review.md), [`boundary-7-context-transport-review.md`](../handoffs/boundary-7-context-transport-review.md) | Ownership-boundary reviews | 2026-08-03 | `HISTORICAL` | Important provenance for Thought, Expression, Rendering, Identity, Mind State, and ContextComposer boundaries. |
| Wave 06–10 design and gate packets | [`docs/handoffs/`](../handoffs) | Per-wave design and acceptance evidence | 2026-08-04 | `HISTORICAL` | Exact wave evidence only. `Wave_accepted` is not release-qualified, deployed, or promoted. |
| Waves 00–05 Implementation Record | [`docs/handoffs/waves-00-05-implementation-record.md`](../handoffs/waves-00-05-implementation-record.md) | Early nuclear implementation | 2026-08-04 | `HISTORICAL` | Provenance for early implementation. Current source wins. |
| Wave 2 Provenance Gate Packet | [`docs/handoffs/wave-2-provenance-gate-packet.md`](../handoffs/wave-2-provenance-gate-packet.md) | Provenance and time-shift isolation | 2026-08-08 | `HISTORICAL` | Evidence for its stated wave and status only. |
| Wave 4 Counterfactual Non-Interference Report | [`docs/handoffs/wave-4-counterfactual-noninterference-report.md`](../handoffs/wave-4-counterfactual-noninterference-report.md) | Offline non-interference qualification | 2026-08-08 | `HISTORICAL` | Offline qualification only. Not live promotion evidence. |
| Promotion Readiness Remediation Report | [`docs/handoffs/promotion-readiness-remediation-report.md`](../handoffs/promotion-readiness-remediation-report.md) | Promotion remediation evidence | Earlier rollout | `HISTORICAL` | Use only for its exact evaluated build and gates. |
| Wave 4 Kilo Handoff | [`docs/handoffs/wave-4-kilo-handoff.md`](../handoffs/wave-4-kilo-handoff.md) | Worker handoff | Earlier rollout | `REFERENCE` | Handoff context, not current authority. |
| Sandbox V2 M5 local settlement | [`docs/handoffs/m5-local-settlement.md`](../handoffs/m5-local-settlement.md) | M5 independent review and local verification packet | 2026-08-23 | `SUPPORTING` | Records `LOCALLY SETTLED` only. Not physically qualified, not production accepted. |
| Sandbox V2 M6 design handoff | [`docs/handoffs/m6-design-handoff.md`](../handoffs/m6-design-handoff.md) | Frozen M6 question after M5 local settlement | 2026-08-23 | `SUPPORTING` | Restates roadmap §14. Does not authorize M6 implementation by itself. |
| Sandbox V2 M6 local settlement | [`docs/handoffs/m6-local-settlement.md`](../handoffs/m6-local-settlement.md) | M6 independent review and local verification packet | 2026-08-23 | `SUPPORTING` | Records `LOCALLY SETTLED` only. Not physically qualified, not production accepted. |
| Sandbox V2 M7 design handoff | [`docs/handoffs/m7-design-handoff.md`](../handoffs/m7-design-handoff.md) | Frozen M7 `patch_export` question after M6 local settlement | 2026-08-23 | `SUPPORTING` | Restates roadmap §15. Does not authorize M7 implementation by itself. |

## 7. Explicitly historical design handoffs

| Title / family | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Ashley Antigravity handoff | [`docs/handoffs/ashley-antigravity-2026-08-01/`](../handoffs/ashley-antigravity-2026-08-01) | Early questions, wave plan, Curiosity expansion | 2026-08-01 | `SUPERSEDED` | Preserves early architecture discussion. It is not the current roadmap. |
| Ashley Persona Strategy handoff | [`docs/handoffs/ashley-persona-2026-08-01/`](../handoffs/ashley-persona-2026-08-01) | Persona, voice examples, and early wave plan | 2026-08-01 | `SUPERSEDED` | Voice-related and phase-order claims are historical. Text foundation and canonical roadmap now govern. |
| Vision Drafting Prompt | [`docs/VISION_DRAFTING_PROMPT.md`](../VISION_DRAFTING_PROMPT.md) | Input used to draft the Vision | Vision drafting era | `HISTORICAL` | Provenance only. `VISION.md` is authoritative. |
| Cursor Review Protocol | [`docs/Cursor_Review_Protocol.md`](../Cursor_Review_Protocol.md) | External review procedure | Earlier tooling era | `REFERENCE` | Procedure only. It does not outrank Architecture Review or Wave Acceptance. |

## 8. Implementation plans and specifications

| Family | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Superpowers design specifications | [`docs/superpowers/specs/`](../superpowers/specs) | Autonomy plumbing, INIT-03, offline harness, isolation qualification path | 2026-08-09 to 2026-08-12 | `HISTORICAL` | Approved or proposed design inputs for their named work only. They do not define current global roadmap status. |
| Superpowers implementation plans | [`docs/superpowers/plans/`](../superpowers/plans) | Task-level implementation instructions | 2026-08-09 to 2026-08-12 | `HISTORICAL` | Execution records and plans. Current source and canonical roadmap win. |

## 9. Known conflicts and dispositions

| Document claim | Conflict | Current disposition |
|---|---|---|
| `Ashley_Foundation_Architecture_Decision_v1.md`: implementation not started and P-01 still next | P-01A/P-01B/P-01C evidence now exists. | Document is `HISTORICAL`. The semantic ownership decision remains supporting. |
| `Ashley_Architecture_Salvage_Map_v2.md`: Restate and Temporal rejected for the current foundation | Operational Continuity later reopened durable execution as Restate versus Temporal versus DBOS. | The old foundation-cycle rejection remains provenance. The future comparative spike is current. |
| `P01_Overnight_Final_Report.md`: LangGraph parity not executed | Later narrow authorization completed real LangGraph parity. | Initial report is `SUPERSEDED`; use `P01B_Workflow_Parity_Report.md` and `P01_Foundation_Selection_Evidence.md`. |
| `Sandbox_Status.md`: physical isolation qualification had not passed | The supplied later Frozen Architecture Baseline states physical Sandbox Isolation has undergone real Linux Mint qualification. | Treat the file as a dated prequalification snapshot. Sandbox Autonomy still remains `CURRENT WORK`. |
| Earlier indexes: `Sandbox_Design.md` is the current authoritative Sandbox topology | Current V2 source uses direct, unprivileged Bubblewrap and does not route through the V1 broker. | The V2 M-series roadmap is authoritative for current Sandbox direction. V1 broker documents are historical or reference-only. |
| `Model_Fabric_01_Contract_Draft.md` header previously read as the current phase owner | Canonical names omit `-01`. Semantic ownership moved to `Model_Fabric_Architecture.md`. | The `_01_` contract remains supporting frozen field specification. Historical filename is retained. |
| `External_Agency_Design.md` as current external-action architecture | Generic external-effect authority is broader than Computer Use and is not a child of the V1 broker. | `External_Effect_and_Authority_Architecture.md` is the current cross-cutting owner. The Wave 09 design is salvageable semantics only. |
| `Routing_Status.md` and earlier indexes as complete `models.json` authority | Current dispatch is split across config, purpose mapping, and registry. | Living status must be refreshed from source. Model IDs stay in Routing Status. Model Fabric owns future semantic dispatch. |
| 2026-08-01 handoffs: voice and older phase order | Current roadmap is a delivery map plus classified edges: Sandbox remains the current delivery gate; Model Fabric follows by owner-selected order, not semantic derivation; operational spine, cognitive-growth, and attention tracks; sibling Cognitive and Relational Graduation. | Handoffs are `SUPERSEDED` as roadmap sources and preserved as provenance. Historical research may still use `-01` labels. |
| Evaluation plane header: “this document proposes architecture” | Document Index classified the plane as `AUTHORITATIVE`. | Header repaired in this pass: plane is `AUTHORITATIVE`; implementation is still not authorized. Historical reconnaissance SHA remains historical. |
| Architecture Index Schema v9/v10 and planned model IDs as current-facing facts | Source-derived schema and Routing Status own those values. Cross-Phase current-fact policy forbids copying them into implementation maps. | Replaced with pointers to `db.ts` and Routing Status. Historical schema discussion remains in wave packets. |
| Sandbox V2 umbrella: External Agency Design is `SEPARATE ARCHITECTURE` | External Effect and Authority is the current cross-cutting owner. External Agency Design is salvageable semantics / superseded mechanism. | Umbrella row repaired in the hardening pass. |
| Sandbox V2 umbrella §17.3 exact SHA `042f211...` as current gate truth | Exact SHA and qualification/promotion state are packet or production claims, not timeless architecture. | §17.3 records the predecessor rule only. Live maturity is resolved from Git/source/packets/production observation. |
| Routing Status snapshot SHA moved without a route-table audit | A snapshot SHA is not an audit of route bindings. | 2026-08-22 settlement: read-only route-table audit against committed `01d066d`. Routing Status now distinguishes document-reviewed revision from route-table audit baseline. Source remains authoritative. |
| Data-plane maturity copied into Cross-Phase | Cross-Phase is architecture, not a dashboard. | Volatile `COMMITTED` / `DEPLOYED` / `PRODUCTION_ACCEPTED` / SHA / timestamp removed from Cross-Phase §2.2. Resolve implementation maturity live. |
| Committed `Ashley_Current_State.md` as where-we-are index | A committed status dashboard goes stale whenever HEAD, worktree, deployment, qualification, promotion, or owner-selected work changes. | File deleted. Live state resolution lives in AGENTS and this index. No replacement dashboard. |
| Root-level qualification packets and V1 activation reconnaissance | Packets and `Sandbox_Final_Activation_Path_Reconnaissance.md` can be read as current V2 activation or current HEAD qualification. | Packets remain `UNTRACKED WORKING EVIDENCE / NOT AUTHORITY`. V1 activation reconnaissance is bannered historical. |

## 10. Preservation rule

Historical and superseded documents remain accessible. Do not delete or
rewrite their original reasoning merely to make them look current. Add a short
status banner only when a document is likely to be mistaken for the current
roadmap. Resolve current direction in the canonical roadmap and record the
document's status here.
