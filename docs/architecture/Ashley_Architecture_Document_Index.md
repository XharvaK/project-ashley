# Project Ashley Architecture Document Index

**Status:** Canonical document-status inventory

**Canonicalized:** 2026-08-13

This index answers which documents govern current architecture, which support
it, and which preserve historical research. It does not replace the documents
it indexes. Current roadmap direction lives in the
[Canonical Architecture Roadmap](Ashley_Architecture_Roadmap.md).

Repository documentation was reconciled against the supplied Frozen
Architecture Baseline and a later owner-supplied ChatGPT-history decision
reconciliation. Raw inaccessible conversations were not directly searched by
this worker.

## Status definitions

| Status | Meaning in this index |
|---|---|
| `AUTHORITATIVE` | Governs the stated domain. Lower documents do not override it. |
| `SUPPORTING` | Current explanatory, operational, or evidence material beneath authoritative direction. |
| `HISTORICAL` | Preserves a dated implementation, review, qualification, or decision snapshot. |
| `SUPERSEDED` | Preserves a position that no longer describes current architecture or roadmap. |
| `REFERENCE` | Useful research, procedure, or design input without current authority. |
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
| Canonical Architecture Roadmap | [`docs/architecture/Ashley_Architecture_Roadmap.md`](Ashley_Architecture_Roadmap.md) | Current implementation boundary, current work, frozen roadmap, OSS disposition, anti-drift | 2026-08-13 | `AUTHORITATIVE` | Canonical source for current architectural direction beneath governance. |
| Architecture Document Index | [`docs/architecture/Ashley_Architecture_Document_Index.md`](Ashley_Architecture_Document_Index.md) | Document authority and history | 2026-08-13 | `AUTHORITATIVE` | Canonical source for document status and relevance. |
| Ashley Architecture Index | [`docs/Architecture_Index.md`](../Architecture_Index.md) | Runtime modules, ownership, endpoints, and current design links | Current | `SUPPORTING` | Implementation-oriented map. It is not the roadmap. |
| Architecture Review Protocol | [`docs/Architecture_Review_Protocol.md`](../Architecture_Review_Protocol.md) | Architecture review discipline | Current | `SUPPORTING` | Applies governance and ownership rules during review. |
| Wave Acceptance Protocol | [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md) | Design, implementation, qualification, release, deployment, promotion states | Current | `AUTHORITATIVE` | Governs acceptance claims and evidence separation. |
| Vision Implementation Map | [`docs/Vision_Implementation_Map.md`](../Vision_Implementation_Map.md) | Vision commitment to owner/evidence/failure/status mapping | Current | `SUPPORTING` | Traceability beneath governance. |
| Project AGENTS instructions | [`AGENTS.md`](../../AGENTS.md) | Repository operations and architecture summary | Current | `SUPPORTING` | Contributor instructions. Not an independent architecture authority. |
| Public README | [`README.md`](../../README.md) | Public project positioning and entry links | Current | `SUPPORTING` | Landing page only. Follow canonical documents for architecture detail. |

## 2. Current subsystem and design documents

| Title | Path | Topic | Era / date | Status | Current relevance |
|---|---|---|---|---|---|
| Routing Status | [`docs/Routing_Status.md`](../Routing_Status.md) | Purpose routes, providers, models, quotas, disabled routes | Wave 1; current source verified 2026-08-13 | `SUPPORTING` | Matches current `config/models.json`: Mistral Expression, Groq 120b Thought, Groq 20b utility bulk. |
| MODEL-FABRIC-01 Codebase Reconnaissance | [`docs/architecture/Model_Fabric_01_Codebase_Reconnaissance.md`](Model_Fabric_01_Codebase_Reconnaissance.md) | Current model-call inventory, routing defects, transport seams | 2026-08-13 | `SUPPORTING` | Current-source facts remain historical truth. Future target policy is Lightning primary for specialist/utility routes, without rewriting current routing. |
| MODEL-FABRIC-01 Contract Draft | [`docs/architecture/Model_Fabric_01_Contract_Draft.md`](Model_Fabric_01_Contract_Draft.md) | Frozen provider-neutral contracts and policy boundaries | 2026-08-13 | `AUTHORITATIVE` | Contract semantics remain frozen. The first profile candidate is NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b`; first-slice fallback remains prohibited. |
| MODEL-FABRIC-01 Implementation Spike | [`docs/architecture/Model_Fabric_01_Implementation_Spike.md`](Model_Fabric_01_Implementation_Spike.md) | Default-off Thought-observation shadow slice | 2026-08-13 | `SUPPORTING` | Planned only. Lightning is first primary; GPT-OSS-120B fallback is later and separately qualified. Implementation is not authorized. |
| Ashley Evaluation / Qualification Plane | [`docs/architecture/Ashley_Evaluation_Qualification_Plane.md`](Ashley_Evaluation_Qualification_Plane.md) | Cross-cutting invariant, evidence, qualification, and promotion contracts | 2026-08-13 | `AUTHORITATIVE` | Ashley owns qualification meaning and promotion. Model Fabric supplies bound profile and receipt facts. |
| Ashley Evaluation Inventory | [`docs/architecture/evaluation/Ashley_Evaluation_Inventory.md`](evaluation/Ashley_Evaluation_Inventory.md) | Current evaluation mechanisms and gaps | 2026-08-13 | `SUPPORTING` | Source-grounded inventory. Existing checks do not automatically qualify a replacement model or fallback role. |
| Evaluation First Spike | [`docs/architecture/evaluation/Evaluation_First_Spike.md`](evaluation/Evaluation_First_Spike.md) | Future `MODEL_PROFILE` evidence and qualification slice | 2026-08-13 | `SUPPORTING` | Implementation waits for MODEL-FABRIC-01 gates C-F. It creates no second profile registry or promotion path. |
| Memory and Recall | [`docs/memory-and-recall.md`](../memory-and-recall.md) | Nuclear Recall, provenance, forgetting, and continuity | Current nuclear era | `SUPPORTING` | Use with current source and schema migrations. `nuclear.db` and `continuity.db` remain authoritative for their domains. |
| Proactive messages | [`docs/proactive-initiative.md`](../proactive-initiative.md) | Initiative scheduling, Agency decision, reserve/send/commit | Current nuclear era | `SUPPORTING` | Explains implemented proactive flow. Timer mechanics never become Agency. |
| Grounded Curiosity Reader | [`docs/curiosity-reader.md`](../curiosity-reader.md) | Bounded public reading and evidence | Current nuclear era | `SUPPORTING` | Reading is untrusted evidence and never sends directly. |
| Sandbox Design | [`docs/Sandbox_Design.md`](../Sandbox_Design.md) | OS-boundary threat model, broker, authority, IPC, isolation | Wave 07 onward | `AUTHORITATIVE` | Governing Sandbox design beneath higher governance. Current autonomy completion still follows the canonical roadmap. |
| Sandbox Operations | [`docs/Sandbox_Operations.md`](../Sandbox_Operations.md) | Local recovery, sweep, ceilings, and reconciliation | Sandbox hardening era | `SUPPORTING` | Operational runbook. It is not activation or production evidence. |
| Sandbox Status | [`docs/Sandbox_Status.md`](../Sandbox_Status.md) | Readiness and isolation snapshots | SANDBOX-ISOLATION-01/02E | `HISTORICAL` | Preserves a pre-final-qualification snapshot. Its statements that physical qualification had not passed do not override the later Frozen Architecture Baseline. |
| Sandbox Production Release Packet v1 | [`docs/architecture/sandbox/Sandbox_Production_Release_Packet_v1.md`](sandbox/Sandbox_Production_Release_Packet_v1.md) | Release gates and operator evidence | 2026-08-12 | `SUPPORTING` | Release packet only. It does not prove later correction, activation, deployment, or canaries. |
| Offline Qualification Network Isolation v1 | [`docs/qualification/Offline_Qualification_Network_Isolation_v1.md`](../qualification/Offline_Qualification_Network_Isolation_v1.md) | Offline harness and network-isolation evidence | 2026-08-09 | `HISTORICAL` | Qualification evidence for its exact scope and build only. |
| Self-Modification Design | [`docs/Self_Modification_Design.md`](../Self_Modification_Design.md) | Change proposals and isolated source workflow | Wave 08 | `SUPPORTING` | Design and gated local implementation context. Not deployment or autonomous self-change authority. |
| External Agency Design | [`docs/External_Agency_Design.md`](../External_Agency_Design.md) | External accounts, vault, actions, dual authorization | Wave 09 | `SUPPORTING` | Design-only authority boundary. Connector selection remains open. |
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
| Autonomous Work Semantics Salvage | [`docs/architecture/research/Autonomous_Work_Semantics_Salvage.md`](research/Autonomous_Work_Semantics_Salvage.md) | Autonomous-work semantic distinctions and candidate reconciliation | 2026-08-13 | `REFERENCE` | Records architectural pressure and future direction without freezing candidate names, selecting a substrate, or authorizing implementation. |

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
| 2026-08-01 handoffs: voice and older phase order | Current roadmap defers voice and orders Sandbox, Model Fabric, Operational Continuity, procedures, then computer use. | Handoffs are `SUPERSEDED` as roadmap sources and preserved as provenance. |

## 10. Preservation rule

Historical and superseded documents remain accessible. Do not delete or
rewrite their original reasoning merely to make them look current. Add a short
status banner only when a document is likely to be mistaken for the current
roadmap. Resolve current direction in the canonical roadmap and record the
document's status here.
