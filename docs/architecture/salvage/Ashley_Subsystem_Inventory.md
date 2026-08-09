
# Ashley subsystem inventory

**Snapshot:** baseline 0efb0250989e2b67a9b0b3d7e8fce81568ae0975; research date
2026-08-09. LOC figures are physical TypeScript line counts from the baseline
working tree. Retireable LOC means a possible future target after parity
evidence, never an instruction to delete now.

Each meaningful subsystem has exactly one recommended disposition. The field
names below are the required salvage-map schema.

## S01 — Governance and constitutional source

- SUBSYSTEM: Vision, Core Principles, Constitution, Stewardship Compact, Ethics, Hierarchy, Architecture Index, acceptance protocol.
- PURPOSE: Define why Ashley exists, constitutional constraints, authority chain, ethical boundaries, architecture precedence, and release-state words.
- CURRENT SOURCE FILES/MODULES: VISION.md; docs/Ashley_Core_Principles.md; docs/ASHLEY_Constitution.md; docs/Ashley_Stewardship_Compact.md; docs/Ashley_Ethics.md; docs/Ashley_Hierarchy.md; docs/Architecture_Index.md; docs/Wave_Acceptance_Protocol.md.
- CURRENT DATA TABLES/STATE: Governance documents; no runtime table.
- UPSTREAM: Vision and operator consultation.
- DOWNSTREAM: Every identity, capability, broker, prompt, release, and review decision.
- BEHAVIORAL/AUTHORITY IMPACT: Highest; changing it changes what Ashley is.
- CURRENT TEST COVERAGE: Governance references, ethics/wave audits, and architecture tests; constitutional legitimacy remains a human review.
- ASHLEY-SPECIFIC SEMANTICS: Autonomous companion-collaborator, honesty, agency, refusal, non-manipulation, truthful continuity, systems over prompts.
- GENERIC INFRASTRUCTURE: None.
- TECH DEBT: Historical design documents use older wave vocabulary.
- MAINTENANCE BURDEN: Low code burden; high review discipline.
- ESTIMATED LOC: Document-only; source LOC not applicable.
- POTENTIAL RETIREABLE LOC: 0; historical documents require disposition, not framework migration.
- POSSIBLE FOUNDATIONS: None; candidate docs are subordinate evidence only.
- INTEGRATION SEAM: Governance review and capability/identity review gates.
- MIGRATION DEPENDENCIES: None; all future foundations must conform.
- RISK: Framework-driven semantic drift or prompt substitution.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which historical design docs should be archived after a human review without losing provenance?

## S02 — Identity and foundational identity review

- SUBSYSTEM: Stable identity, boundaries, values, opinions, questions, tastes, and owner-only review.
- PURPOSE: Own who Ashley is, what she values, and which foundational changes require consultation.
- CURRENT SOURCE FILES/MODULES: apps/agent-service/src/core/identity; core/change-proposal; identity-review routes in core/runtime.ts and server.ts; workspace/prompts/nuclear.
- CURRENT DATA TABLES/STATE: identity_entries, opinions, questions, identity_reviews, entity UUID/classification fields.
- UPSTREAM: Governance, owner-authenticated review, grounded learning review.
- DOWNSTREAM: Thought, ContextComposer, Expression, capability gates, proactive motivations.
- BEHAVIORAL/AUTHORITY IMPACT: Foundational; generic agent memory may not write identity or authorize an identity change.
- CURRENT TEST COVERAGE: Identity review, provenance, owner auth, refusal, and identity-expression tests.
- ASHLEY-SPECIFIC SEMANTICS: Identity before personality; foundational review; no fabricated selfhood, memory, certainty, or capability.
- GENERIC INFRASTRUCTURE: SQLite CRUD and HTTP serialization.
- TECH DEBT: Identity and review routes share runtime/server plumbing.
- MAINTENANCE BURDEN: Medium; constitutional correctness dominates.
- ESTIMATED LOC: core/identity is 904 LOC across 5 TS files; shared runtime/db excluded.
- POTENTIAL RETIREABLE LOC: 0 semantic LOC; at most 20–60 route boilerplate.
- POSSIBLE FOUNDATIONS: None; workflow state may carry a review job only.
- INTEGRATION SEAM: AshleyMemoryAuthority plus identity-review gate.
- MIGRATION DEPENDENCIES: Exact revision IDs, entity UUIDs, continuity, owner authentication.
- RISK: High; framework substitution could create unauthorized foundational influence.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which identity-review read paths may be exposed to a future plugin without widening owner-only authority?

## S03 — Mind State, affect, and own-time

- SUBSYSTEM: Dynamic goals, concerns, commitments, unfinished items, affective state, absence/return sessions, urgent wakes.
- PURPOSE: Represent current condition and grounded internal change that may feed Thought.
- CURRENT SOURCE FILES/MODULES: apps/agent-service/src/core/state; core/agency/own-time.ts; Mind State materializers in core/cognition/worker.ts.
- CURRENT DATA TABLES/STATE: mind_state_items, affective_state, affective_events, own_time_sessions, urgent wake fields.
- UPSTREAM: Grounded episodes, relationship state, owner presence, curiosity, completed exchanges.
- DOWNSTREAM: Motivations, Thought, bounded own-time report, proactive eligibility, reflection.
- BEHAVIORAL/AUTHORITY IMPACT: High; state is not a workflow checkpoint and affect is not a model persona claim.
- CURRENT TEST COVERAGE: State, affect, own-time, cognition integration, urgent wake, and capability-gate tests.
- ASHLEY-SPECIFIC SEMANTICS: Grounded digital affect; no invented human emotion; dynamic state distinct from stable identity.
- GENERIC INFRASTRUCTURE: Table updates, timestamps, leases, and job triggers.
- TECH DEBT: Materialization and job scheduling are coupled in the worker.
- MAINTENANCE BURDEN: Medium-high due to provenance and influence gates.
- ESTIMATED LOC: core/state is 1,035 LOC across 9 files; own-time shared with agency/runtime.
- POTENTIAL RETIREABLE LOC: 0 semantic LOC; 80–160 generic job-call plumbing.
- POSSIBLE FOUNDATIONS: Workflow engine for the enclosing cognition job only.
- INTEGRATION SEAM: AshleyMemoryAuthority and AshleyCapabilityAuthority.
- MIGRATION DEPENDENCIES: Episode provenance, capability contract, model epoch, urgent wake lease, exact owner session.
- RISK: High; shadow state could silently become live behavior.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which transitions need a durable event stream versus the existing atomic materializer?

## S04 — Thought and Agency decision boundary

- SUBSYSTEM: Deterministic decision floor, model Thought, evidence refs, refusal, effort allocation, initiative decisions.
- PURPOSE: Decide whether, why, and how Ashley may speak or act.
- CURRENT SOURCE FILES/MODULES: core/agency/decide.ts (468 LOC); thought.ts (333 LOC); motivations.ts (384 LOC); core/agency; core/runtime.ts.
- CURRENT DATA TABLES/STATE: motivations, decision_log, initiative reservations, evidence links, capability events/contracts.
- UPSTREAM: Identity, Mind State, user message, grounded motivations, capability authority, delivery state.
- DOWNSTREAM: ContextComposer, Expression, delivery, reflection, external and sandbox proposal boundaries.
- BEHAVIORAL/AUTHORITY IMPACT: Highest runtime authority.
- CURRENT TEST COVERAGE: Broad deterministic decision, Thought schema, coercion, refusal, evidence, initiative, and counterfactual tests.
- ASHLEY-SPECIFIC SEMANTICS: Speak/silence/delay/ask/revisit/share/challenge/refuse; model Thought cannot bypass the safety floor.
- GENERIC INFRASTRUCTURE: JSON parsing, model call, persistence, timers.
- TECH DEBT: AshleyCore is a large orchestrator and Thought has multiple call lanes.
- MAINTENANCE BURDEN: High but valuable; this is the semantic center.
- ESTIMATED LOC: core/agency is 5,016 LOC across 19 files.
- POTENTIAL RETIREABLE LOC: 0 decision semantics; 50–120 call/retry plumbing after a stable interface.
- POSSIBLE FOUNDATIONS: Workflow runtime may host a Thought attempt but may not replace decide.
- INTEGRATION SEAM: AshleyCapabilityAuthority, AshleyEvidenceResolver, AshleyWorkflowRuntime for bounded jobs.
- MIGRATION DEPENDENCIES: Route registry, attention admission, exact evidence, identity/state blocks, delivery reservation.
- RISK: Critical; framework agent loops can erase refusal or agency.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Can a future workflow substrate host model Thought without introducing a second retry or side-effect owner?

## S05 — Context composition and evidence selection

- SUBSYSTEM: ContextComposer and selected context contract.
- PURPOSE: Assemble identity, state, memory, evidence, prompts, thread, and current message without reinterpretation.
- CURRENT SOURCE FILES/MODULES: core/context-composer.ts (156 LOC); core/memory/assemble.ts (69 LOC); prompt loaders.
- CURRENT DATA TABLES/STATE: mem_threads, mem_messages, facts, episodes, evidence links, capability state.
- UPSTREAM: Thought-selected evidence, hot thread, gated identity and state.
- DOWNSTREAM: Expression and Thought-model input.
- BEHAVIORAL/AUTHORITY IMPACT: High; composer must not become an unreviewed relevance or authority judge.
- CURRENT TEST COVERAGE: Context assembly, selected-memory, prompt, and duplicate-current-message tests.
- ASHLEY-SPECIFIC SEMANTICS: Memory is not identity; only exact selected evidence is included; current message appears once.
- GENERIC INFRASTRUCTURE: String assembly and transport object construction.
- TECH DEBT: Shared turn-context type is a coupling point.
- MAINTENANCE BURDEN: Medium.
- ESTIMATED LOC: 225 LOC in the two named files.
- POTENTIAL RETIREABLE LOC: 0 semantic selection; 20–40 assembly boilerplate.
- POSSIBLE FOUNDATIONS: None; framework prompt/context stores are not a fit.
- INTEGRATION SEAM: AshleyEvidenceResolver and stable TurnContext.
- MIGRATION DEPENDENCIES: Identity/state gates, Recall authority, prompt version, Thought decision.
- RISK: High; generic memory retrieval could leak or fabricate.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Can future traces expose context hashes without secrets or unlicensed evidence?

## S06 — Expression, nuclear prompts, and rendering

- SUBSYSTEM: Intentional language plus Discord transport rendering.
- PURPOSE: Express an authorized decision honestly and render it as platform bubbles/attachments.
- CURRENT SOURCE FILES/MODULES: core/conversation/expression.ts (234 LOC); prompts.ts; rendering.ts (13 LOC); workspace/prompts/nuclear.
- CURRENT DATA TABLES/STATE: Prompt/version metadata, delivery reservations, auxiliary receipts.
- UPSTREAM: TurnContext, decision, route, delivery reservation.
- DOWNSTREAM: Discord sender and delivery ledger.
- BEHAVIORAL/AUTHORITY IMPACT: Expression may reject or constrain claims but cannot authorize capabilities; rendering has no semantic authority.
- CURRENT TEST COVERAGE: Expression honesty, route/fallback, prompt, bubble, media, and rendering tests.
- ASHLEY-SPECIFIC SEMANTICS: No fabricated memories, activity, sources, emotion, capability, or delivery; thin prompts.
- GENERIC INFRASTRUCTURE: Provider adapter, text splitting, Discord limits.
- TECH DEBT: Provider and transport concerns touch expression.
- MAINTENANCE BURDEN: Medium.
- ESTIMATED LOC: 247 core LOC plus prompt artifacts.
- POTENTIAL RETIREABLE LOC: 30–80 provider/formatting plumbing after adapters.
- POSSIBLE FOUNDATIONS: Model SDKs already in use; current routing is complete.
- INTEGRATION SEAM: AshleyDeliveryLedger and route registry.
- MIGRATION DEPENDENCIES: Attention governor, capability gates, receipts.
- RISK: Medium-high; generic response layer could invent authority.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Is any future tool response allowed to reach Expression without an EvidenceResolver claim license?

## S07 — Recall, facts, episodes, and redaction

- SUBSYSTEM: Memory threads/messages/facts, grounded episodes, FTS, evidence selection, forget/redaction.
- PURPOSE: Preserve truthful continuity and make only grounded evidence available to behavior.
- CURRENT SOURCE FILES/MODULES: core/memory; core/memory/forget.ts; core/privacy; core/provenance.
- CURRENT DATA TABLES/STATE: mem_threads, mem_messages, mem_facts, episodes, episode_messages, episodes_fts, evidence_links, forget_receipts, cur_reads, provenance/cutover tables.
- UPSTREAM: User messages, exact source IDs, cognitive jobs, owner forget.
- DOWNSTREAM: ContextComposer, motivations, Thought, learning, observability.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; Recall is not generic semantic memory or model-authored context.
- CURRENT TEST COVERAGE: Broad memory, FTS, evidence, redaction, forget, continuity, provenance, schema-v22, and counterfactual tests.
- ASHLEY-SPECIFIC SEMANTICS: Exact provenance, shadow/live at creation, forgotten/tombstoned state, no time-shifting observe into influence.
- GENERIC INFRASTRUCTURE: SQLite, FTS5, query/index maintenance.
- TECH DEBT: db.ts and memory modules carry a large migration surface.
- MAINTENANCE BURDEN: High and justified.
- ESTIMATED LOC: core/memory is 2,367 LOC across 8 files; db and forget are separate.
- POTENTIAL RETIREABLE LOC: 0 semantic LOC; 100–250 query/index helpers only after a proven abstraction.
- POSSIBLE FOUNDATIONS: AgentFS/Letta/framework memory are not replacements; storage mechanics only.
- INTEGRATION SEAM: AshleyMemoryAuthority and AshleyEvidenceResolver.
- MIGRATION DEPENDENCIES: Entity UUIDs, continuity sidecar, receipt-backed redaction, schema-v22 cutover.
- RISK: Critical; false continuity and authority leakage.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Can generic storage preserve sidecar transactions and exact forget preview without dual truth?

## S08 — Reflection and bounded learning

- SUBSYSTEM: Post-outcome reflection and initiative calibration.
- PURPOSE: Interpret outcomes and calibrate future Thought without controlling the current turn.
- CURRENT SOURCE FILES/MODULES: core/reflection (788 LOC); core/learning (1,022 LOC); reflection processing in runtime.
- CURRENT DATA TABLES/STATE: reflection_events, initiative_learning, learning_revisions, capability events.
- UPSTREAM: Committed/aborted delivery and grounded episode outcome.
- DOWNSTREAM: Future bounded motivations/calibration and review surfaces.
- BEHAVIORAL/AUTHORITY IMPACT: High; reflection has no current-turn authority.
- CURRENT TEST COVERAGE: Reflection lifecycle, bounded calibration, revision, provenance, and non-interference tests.
- ASHLEY-SPECIFIC SEMANTICS: Post-outcome interpretation, not hidden prompt rewriting or live identity mutation.
- GENERIC INFRASTRUCTURE: Event rows, job queue, retries.
- TECH DEBT: Reflection, cognition, and revision share worker plumbing.
- MAINTENANCE BURDEN: Medium.
- ESTIMATED LOC: 1,810 LOC across reflection and learning directories.
- POTENTIAL RETIREABLE LOC: 100–220 generic job/event plumbing.
- POSSIBLE FOUNDATIONS: Workflow engine for post-outcome mechanics only.
- INTEGRATION SEAM: AshleyWorkflowRuntime plus capability/revision gate.
- MIGRATION DEPENDENCIES: Delivery receipts, episode provenance, identity review, exact revision IDs.
- RISK: High if retries turn reflection into repeated influence.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: What idempotency contract is needed if a framework replays a completed reflection step?

## S09 — Relationship state and commitments

- SUBSYSTEM: Explicit relational records and relationship motivation claims.
- PURPOSE: Represent reciprocal commitments, tensions, withdrawals, reminders, and bounded relational initiative.
- CURRENT SOURCE FILES/MODULES: core/relationship; relationship routes in runtime/server; agency/motivations.ts.
- CURRENT DATA TABLES/STATE: doc_reminders, ashley_self_commitments, mutual_commitments, scheduled_proactive_messages, relational_tensions, withdrawal_records, relationship_motivation_claims.
- UPSTREAM: Owner-authored records, conversations, delivery outcomes, relationship_state capability.
- DOWNSTREAM: Motivations, Thought, proactive eligibility, owner-only summary.
- BEHAVIORAL/AUTHORITY IMPACT: High; no scalar trust/attachment shortcut.
- CURRENT TEST COVERAGE: Relationship CRUD, coercion, owner-only routes, motivation, and capability tests.
- ASHLEY-SPECIFIC SEMANTICS: Reciprocity, consent, withdrawal, no dependence engineering; reminders are motivations, not auto-sends.
- GENERIC INFRASTRUCTURE: SQLite records and HTTP/Discord presentation.
- TECH DEBT: Six tables plus claims create migration and summary complexity.
- MAINTENANCE BURDEN: Medium-high.
- ESTIMATED LOC: 1,684 LOC across 18 files.
- POTENTIAL RETIREABLE LOC: 0 semantic LOC; 40–100 summary plumbing.
- POSSIBLE FOUNDATIONS: No framework memory or personality system.
- INTEGRATION SEAM: AshleyCapabilityAuthority and AshleyEvidenceResolver.
- MIGRATION DEPENDENCIES: Relationship migration-14, owner auth, delivery, withdrawal, coercion gates.
- RISK: Critical if a framework reduces relationship to engagement metrics.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which workflow events may be commitment evidence without becoming a commitment automatically?

## S10 — Curiosity, public reading, and source probation

- SUBSYSTEM: Scan/rank/choose/fetch/extract/record/take/consolidate/motivate.
- PURPOSE: Let unanswered questions and bounded interests produce grounded curiosity without direct sending or source authority.
- CURRENT SOURCE FILES/MODULES: core/curiosity; config/curiosity-sources.json; curiosity loop in runtime.
- CURRENT DATA TABLES/STATE: cur_sources, cur_items, cur_reads, cur_takes, cur_provenance, cur_source_candidates, motivations and jobs.
- UPSTREAM: Identity questions/interests, Mind State, public HTTP(S).
- DOWNSTREAM: Evidence, takes, questions, motivations, Thought.
- BEHAVIORAL/AUTHORITY IMPACT: High; public text is untrusted evidence and cannot send or change authority.
- CURRENT TEST COVERAGE: Network policy, redirect/DNS/size bounds, source probation, take normalization, provenance, and no-direct-send tests.
- ASHLEY-SPECIFIC SEMANTICS: Curiosity from unanswered questions; live only under source/capability gates; reading never directly sends.
- GENERIC INFRASTRUCTURE: HTTP client, feed parsing, scheduler, job retries.
- TECH DEBT: Network and consolidation pipeline are broad and asynchronous.
- MAINTENANCE BURDEN: High due to untrusted input and source drift.
- ESTIMATED LOC: 1,760 LOC across 10 files.
- POTENTIAL RETIREABLE LOC: 150–300 fetch/feed/job plumbing after parity.
- POSSIBLE FOUNDATIONS: Workflow engine for bounded maintenance; MCP for read-only adapters only.
- INTEGRATION SEAM: AshleyEvidenceResolver and AshleyWorkflowRuntime.
- MIGRATION DEPENDENCIES: Network policy, provenance-at-creation, source probation, curiosity_consolidation.
- RISK: High; tool/plugin output can be prompt injection or fake evidence.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Can a generic runner preserve the five-stage network deadline and source-policy budget?

## S11 — Ashley-owned model routing

- SUBSYSTEM: Purpose/lane route registry and provider adapters.
- PURPOSE: Select an approved provider/model for expression, Thought, utility, cognition, and fallback.
- CURRENT SOURCE FILES/MODULES: core/model-routing; mistral-client.ts; attention adapters; docs/Routing_Status.md.
- CURRENT DATA TABLES/STATE: Route configuration, model continuity state, attention requests, capability contracts.
- UPSTREAM: Static config and owner-approved route registry.
- DOWNSTREAM: Thought, Expression, cognition, curiosity model calls.
- BEHAVIORAL/AUTHORITY IMPACT: High; route selection is policy, not generic agent discovery.
- CURRENT TEST COVERAGE: Route mapping, provider failure, fallback, attention, and contract tests.
- ASHLEY-SPECIFIC SEMANTICS: Smart routing is complete; provider selection is not reopened here.
- GENERIC INFRASTRUCTURE: SDK adapters, HTTP calls, streaming.
- TECH DEBT: Provider adapters are intertwined with attention dispatch.
- MAINTENANCE BURDEN: Medium.
- ESTIMATED LOC: router.ts 175 LOC; model-routing directory and client are separate.
- POTENTIAL RETIREABLE LOC: 100–250 provider adapter plumbing only.
- POSSIBLE FOUNDATIONS: Existing model SDKs; no agent framework.
- INTEGRATION SEAM: AshleyCapabilityAuthority and route registry.
- MIGRATION DEPENDENCIES: Attention lanes, model epoch, capability contract, secret/config boundaries.
- RISK: High if a foundation silently chooses models or changes evidence.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: None for this goal.

## S12 — Capability rollout, provenance, and authority-at-creation

- SUBSYSTEM: Capability contracts, release state, dependency graph, shadow/live materialization, cutover, rollback.
- PURPOSE: Decide whether artifacts may influence behavior and preserve authority at creation.
- CURRENT SOURCE FILES/MODULES: core/rollout/capabilities.ts (779 LOC); core/provenance; core/rollout; capability migrations in db.ts.
- CURRENT DATA TABLES/STATE: capability_releases, capability_events, capability_contracts, model continuity, provenance columns, Recall cutovers.
- UPSTREAM: Operator configuration, evaluators, master mode, release gates.
- DOWNSTREAM: Thought, Recall, Mind State, reading, external/sandbox action, attention, cognition.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; this is the authority ledger.
- CURRENT TEST COVERAGE: Gate, dependency, contract hash, rollback, epoch, shadow/live, counterfactual, schema-v21/v22 tests.
- ASHLEY-SPECIFIC SEMANTICS: Observe is not influence; live is written only while authority holds; no later promotion of shadow rows.
- GENERIC INFRASTRUCTURE: Hashing, state transitions, event persistence.
- TECH DEBT: Many capability names and versioned contracts increase review surface.
- MAINTENANCE BURDEN: High and non-negotiable.
- ESTIMATED LOC: 1,546 LOC across 5 rollout files plus provenance modules.
- POTENTIAL RETIREABLE LOC: 0 semantic LOC; 40–100 hash/event helper.
- POSSIBLE FOUNDATIONS: None as owner; workflow metadata may reference it.
- INTEGRATION SEAM: AshleyCapabilityAuthority.
- MIGRATION DEPENDENCIES: Every influence materializer, contract hash, model epoch, evaluator, cutover.
- RISK: Critical; framework state can be mistaken for authority.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: What minimal capability snapshot must a future run carry to prove non-interference after restart?

## S13 — Durable attention admission

- SUBSYSTEM: Lane quotas, deadlines, starvation, durable request ledger, model continuity and dispatch admission.
- PURPOSE: Control when model work may consume attention and leave the process.
- CURRENT SOURCE FILES/MODULES: core/attention; mistral-client.ts.
- CURRENT DATA TABLES/STATE: attention_dispatch_counter, attention_requests, attention_daily_usage, model continuity and contract state.
- UPSTREAM: Thought/cognition/curiosity lane request, capability and route.
- DOWNSTREAM: Provider calls, deadlines, recovery, observability.
- BEHAVIORAL/AUTHORITY IMPACT: High; policy/eligibility remains Ashley-owned.
- CURRENT TEST COVERAGE: Quota, deadline, lease/recovery, starvation, contract/epoch, and provider dispatch tests.
- ASHLEY-SPECIFIC SEMANTICS: Lane meaning, urgent grounded priority, outbound/model permission, budget, continuity epoch.
- GENERIC INFRASTRUCTURE: Queue, lease, counter, retry, dispatch ledger.
- TECH DEBT: Policy and generic queue implementation share files.
- MAINTENANCE BURDEN: High.
- ESTIMATED LOC: 2,457 LOC across 12 attention files; primary ledger 599 LOC.
- POTENTIAL RETIREABLE LOC: 250–500 queue/lease plumbing, not policy.
- POSSIBLE FOUNDATIONS: Mastra/LangGraph workflow execution or a generic queue after parity.
- INTEGRATION SEAM: AshleyCapabilityAuthority plus AshleyAttentionPolicy.
- MIGRATION DEPENDENCIES: Model routing, deadlines, daily quotas, recovery, contract/epoch.
- RISK: High; starvation or an unauthorized outbound call.
- RECOMMENDED DISPOSITION: WRAP.
- CONFIDENCE: Medium-high.
- OPEN QUESTIONS: Can a foundation provide only queue/recovery mechanics while preserving fail-closed lane admission?

## S14 — Cognitive jobs and worker

- SUBSYSTEM: Durable consolidation job claim/recover, model analysis, episode/Mind State/Affect/learning materialization.
- PURPOSE: Complete exchanges after delivery without granting current-turn authority.
- CURRENT SOURCE FILES/MODULES: core/cognition/jobs.ts (159 LOC); core/cognition/worker.ts (644 LOC); core/runtime.ts.
- CURRENT DATA TABLES/STATE: cognitive_jobs, cognitive_runs, episodes, episode messages, Mind State/Affect, learning revisions, provenance.
- UPSTREAM: Completed delivery receipt and exact conversation provenance.
- DOWNSTREAM: Recall, Mind State, Affect, bounded learning, future Thought.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; output is normalized and gated, never current-turn authority.
- CURRENT TEST COVERAGE: Lease/recovery, atomic materialization, exact user quote/source IDs, shadow/live, retry/failure tests.
- ASHLEY-SPECIFIC SEMANTICS: Atomic cognition, provenance-at-creation, observe/influence ceiling, no current-turn effect.
- GENERIC INFRASTRUCTURE: Claim/lease/retry/run state and step orchestration.
- TECH DEBT: Worker mixes generic lifecycle with semantic materializers.
- MAINTENANCE BURDEN: High; safe extraction is difficult but valuable.
- ESTIMATED LOC: 1,088 LOC across 4 cognition files; jobs and worker figures above.
- POTENTIAL RETIREABLE LOC: 250–450 generic lifecycle after parity; no blanket worker deletion.
- POSSIBLE FOUNDATIONS: Mastra and LangGraph, compared on the same fixture.
- INTEGRATION SEAM: AshleyWorkflowRuntime around a semantic worker core.
- MIGRATION DEPENDENCIES: Attention, capability contracts, SQLite atomicity, receipts, exact provenance.
- RISK: Critical; replay can duplicate learning or promote shadow evidence.
- RECOMMENDED DISPOSITION: SPIKE REQUIRED.
- CONFIDENCE: High that a spike is needed; low on winner.
- OPEN QUESTIONS: Which step boundaries preserve the atomic transaction and which belong outside a framework run?

## S15 — Delivery ledger and receipts

- SUBSYSTEM: Inbound IDs, outbound reservations, bubbles, auxiliary receipts, commit/partial/abort finalization.
- PURPOSE: Make delivery observable and keep language honest about what was actually sent.
- CURRENT SOURCE FILES/MODULES: core/delivery; Discord sending and receipt clients; finalization in core/runtime.ts.
- CURRENT DATA TABLES/STATE: delivery_reservations, inbound_messages, bubbles, auxiliary_messages.
- UPSTREAM: HTTP chat request, Thought/Expression output, Discord send result.
- DOWNSTREAM: Cognition enqueue, reflection, observability, user-facing claims.
- BEHAVIORAL/AUTHORITY IMPACT: High; delivery truth is semantic evidence.
- CURRENT TEST COVERAGE: Reservation FSM, idempotency, deadlines, bubble limits, receipts, partial/abort, cognition enqueue.
- ASHLEY-SPECIFIC SEMANTICS: Draft is not send; send without receipt is not committed; auxiliary content separately evidenced.
- GENERIC INFRASTRUCTURE: FSM, leases, timeout, persistence, Discord adapter.
- TECH DEBT: Platform receipt mechanics cross agent and Discord services.
- MAINTENANCE BURDEN: High but justified.
- ESTIMATED LOC: 1,174 LOC across 8 delivery files; store 435 LOC.
- POTENTIAL RETIREABLE LOC: 100–220 generic FSM/serialization only.
- POSSIBLE FOUNDATIONS: Workflow event/receipt mechanics; never framework message history as truth.
- INTEGRATION SEAM: AshleyDeliveryLedger.
- MIGRATION DEPENDENCIES: Discord API, deadlines, cognition provenance, privacy/redaction.
- RISK: Critical if generated output is reported as delivered.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Can receipt storage move independently without creating a second source of delivery truth?

## S16 — Discord adapter and user boundary

- SUBSYSTEM: Gateway buffering/queueing, slash commands, sending, attachments, initiative polling.
- PURPOSE: Provide the only current user-facing platform and transport Ashley boundary.
- CURRENT SOURCE FILES/MODULES: apps/discord-bot/src/handlers; initiative; commands; chat; agent-client.ts.
- CURRENT DATA TABLES/STATE: In-memory buffers/queues; delivery state in agent service; Discord IDs and attachment metadata.
- UPSTREAM: Discord gateway.
- DOWNSTREAM: Agent HTTP API and delivery receipts.
- BEHAVIORAL/AUTHORITY IMPACT: Platform boundary; must not make cognition decisions.
- CURRENT TEST COVERAGE: Message, queue, command owner-gate, attachment, initiative, and sending tests.
- ASHLEY-SPECIFIC SEMANTICS: Discord-only, owner gate, command meanings, natural dialogue primary, no direct cognition in bot.
- GENERIC INFRASTRUCTURE: Discord.js, buffering, HTTP client, timers.
- TECH DEBT: Fragment/queue and delivery lifecycle are distributed.
- MAINTENANCE BURDEN: Medium.
- ESTIMATED LOC: 3,791 LOC across 52 TS files.
- POTENTIAL RETIREABLE LOC: 100–300 transport boilerplate if SDK boundary is standardized; no command semantics.
- POSSIBLE FOUNDATIONS: None; workflow frameworks do not replace Discord.
- INTEGRATION SEAM: AshleyDeliveryLedger and agent HTTP contract.
- MIGRATION DEPENDENCIES: Discord API, receipt endpoints, owner auth, initiative scheduler.
- RISK: Medium-high; platform retries can duplicate turns or sends.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which failures are delivery outcomes versus platform-adapter retries?

## S17 — HTTP API, server, and owner observability

- SUBSYSTEM: Express routes, owner auth, health/diagnostics, chat/delivery/initiative/memory/capability/broker endpoints.
- PURPOSE: Expose bounded service interfaces while keeping public readiness minimal and owner metadata protected.
- CURRENT SOURCE FILES/MODULES: apps/agent-service/src/server.ts (1500 LOC), agent.ts, route assertions and server tests.
- CURRENT DATA TABLES/STATE: Reads runtime tables and continuity sidecar; does not own semantic data.
- UPSTREAM: Discord client, owner-authenticated clients, runtime.
- DOWNSTREAM: AshleyCore, broker clients, observability consumers.
- BEHAVIORAL/AUTHORITY IMPACT: Auth and redaction are semantic; route glue is generic.
- CURRENT TEST COVERAGE: Route/auth/health/owner diagnostics, malformed input, redaction, status tests.
- ASHLEY-SPECIFIC SEMANTICS: Owner-only endpoints, public minimal readiness, no secrets, explicit capability/status meanings.
- GENERIC INFRASTRUCTURE: Express, JSON parsing, route registration.
- TECH DEBT: Large server file and many feature endpoints.
- MAINTENANCE BURDEN: High.
- ESTIMATED LOC: 1,500 LOC.
- POTENTIAL RETIREABLE LOC: 200–400 generic route/serialization after a stable service contract.
- POSSIBLE FOUNDATIONS: Standard HTTP framework only; not an agent framework.
- INTEGRATION SEAM: Versioned Ashley service interfaces.
- MIGRATION DEPENDENCIES: Owner auth, continuity, broker IPC, Discord client.
- RISK: High if generic endpoints bypass owner/capability gates.
- RECOMMENDED DISPOSITION: WRAP.
- CONFIDENCE: Medium-high.
- OPEN QUESTIONS: Would route partitioning reduce maintenance without making feature ownership less observable?

## S18 — Nuclear SQLite schema and migrations

- SUBSYSTEM: Primary SQLite schema v22 and migration history.
- PURPOSE: Provide atomic durable state for nuclear identity, Recall, agency, delivery, cognition, capabilities, relationships, and brokers.
- CURRENT SOURCE FILES/MODULES: core/db.ts (2208 LOC), migration files under core, schema tests.
- CURRENT DATA TABLES/STATE: Tables through schema v22: identity, memory, curiosity, decisions, reflection, episodes, state, learning, delivery, attention, relationship, perception, proposals, external actions, sandbox approvals, provenance, Recall cutover.
- UPSTREAM: Runtime writes, owner actions, atomic workers.
- DOWNSTREAM: Every semantic and support subsystem.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; transaction boundaries encode truth.
- CURRENT TEST COVERAGE: Migration compatibility, schema, atomicity, provenance, rollback, feature tests.
- ASHLEY-SPECIFIC SEMANTICS: Table meanings, provenance labels, exact rows, entity UUIDs, authority-at-creation.
- GENERIC INFRASTRUCTURE: SQLite driver, migrations, indexes, transactions.
- TECH DEBT: Large monolithic migration surface and many domains.
- MAINTENANCE BURDEN: Very high.
- ESTIMATED LOC: 2,208 LOC in db.ts plus migrations.
- POTENTIAL RETIREABLE LOC: 0 schema semantics; 100–250 migration helpers only after a reviewed strategy.
- POSSIBLE FOUNDATIONS: SQLite-compatible workflow storage may be compared; no framework schema replaces this by default.
- INTEGRATION SEAM: Transactional repository interfaces owned by Ashley.
- MIGRATION DEPENDENCIES: All migrations, backup watermarks, sidecar, tests, release qualification.
- RISK: Critical; dual stores split truth.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which generic job tables could be mirrored without moving semantic tables out of the nuclear transaction?

## S19 — Continuity sidecar, lineage, and forget

- SUBSYSTEM: Authoritative continuity sidecar and entity registry.
- PURPOSE: Track lineage, forks, sessions, forget previews/tombstones, and backup watermarks separately from nuclear runtime state.
- CURRENT SOURCE FILES/MODULES: core/continuity (1,938 LOC across 13 files), entity UUID/forget/session/registry modules.
- CURRENT DATA TABLES/STATE: continuity_meta, lineage_state/forks/events, runtime_sessions, forget_previews/targets/tombstones, backup_watermarks.
- UPSTREAM: Owner actions, runtime sessions, nuclear entity registry.
- DOWNSTREAM: Forget, sandbox tombstones, privacy, diagnostics, restore.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; external erasure honesty and fork boundaries depend on it.
- CURRENT TEST COVERAGE: Lineage, fork guards, sessions, forget preview/apply, tombstone signatures, backup tests.
- ASHLEY-SPECIFIC SEMANTICS: Exact-target forget, no false erasure claim, continuity is not signing authority.
- GENERIC INFRASTRUCTURE: Sidecar SQLite, event ledger, registry lookups.
- TECH DEBT: Cross-database coordination and broker key custody are complex.
- MAINTENANCE BURDEN: High.
- ESTIMATED LOC: 1,938 LOC across 13 files.
- POTENTIAL RETIREABLE LOC: 0 semantic LOC; 50–120 registry/query helpers.
- POSSIBLE FOUNDATIONS: None as owner; workflow IDs may reference lineage.
- INTEGRATION SEAM: AshleyMemoryAuthority plus continuity broker protocol.
- MIGRATION DEPENDENCIES: Entity UUIDs, signed tombstones, backup and restore.
- RISK: Critical; framework run IDs cannot replace lineage/tombstones.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: What recovery proof is required when a future run outlives a continuity fork or tombstone?

## S20 — Privacy, classification, and disclosure

- SUBSYSTEM: Classification, public-disclosure checks, secret omission, attachment/read policy.
- PURPOSE: Prevent secrets and sensitive data from entering models, memory, public channels, tools, or brokers.
- CURRENT SOURCE FILES/MODULES: core/privacy; core/perception; core/honesty; disclosure tests.
- CURRENT DATA TABLES/STATE: Classification fields, perception_artifacts, conversational_reads, receipt-backed redaction.
- UPSTREAM: User messages, attachments, external text, identity metadata.
- DOWNSTREAM: Context, Expression, public disclosure, tools, brokers.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; classification is policy input, not a model guess.
- CURRENT TEST COVERAGE: Public disclosure, secret omission, attachment, perception honesty, redaction, untrusted-input tests.
- ASHLEY-SPECIFIC SEMANTICS: Secret never model/memory; external text never authority; public output requires classification and Thought license.
- GENERIC INFRASTRUCTURE: Field validation and content hashing.
- TECH DEBT: Perception/attachment modes and disclosure paths are expanding.
- MAINTENANCE BURDEN: High.
- ESTIMATED LOC: Privacy 208 LOC across 5 files; perception 1,888 LOC across 14 files.
- POTENTIAL RETIREABLE LOC: 0 policy; 40–120 parser/validation boilerplate.
- POSSIBLE FOUNDATIONS: MCP/plugin metadata may be inputs only.
- INTEGRATION SEAM: AshleyToolRuntime and AshleyEvidenceResolver.
- MIGRATION DEPENDENCIES: Capability gates, model payload assembly, delivery receipts.
- RISK: Critical; plugins and tools enlarge the untrusted-input surface.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which package metadata must be classified before discovery?

## S21 — Sandbox policy and agent-side broker client

- SUBSYSTEM: Agent proposals, approval/key custody, signed envelopes, IPC transport, policy types.
- PURPOSE: Let Ashley propose bounded local execution while a separate broker owns authorization and execution.
- CURRENT SOURCE FILES/MODULES: core/sandbox (11,283 LOC across 39 files); apps/sandbox-policy/src (2,939 LOC across 17 files).
- CURRENT DATA TABLES/STATE: Sandbox approvals/events, continuity tombstones, key metadata, proposal state, broker sessions/artifacts.
- UPSTREAM: Thought/proposals, owner approval, continuity, capability gates.
- DOWNSTREAM: Sandbox broker IPC and audit.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; agent never executes as broker UID.
- CURRENT TEST COVERAGE: Policy, signed envelope, path, key custody, client, transport, approval, tombstone, broker integration tests.
- ASHLEY-SPECIFIC SEMANTICS: Dedicated UID/socket, signed scopes, exact targets, no secrets/model/broker in workspace, untrusted repo instructions.
- GENERIC INFRASTRUCTURE: IPC framing, key storage helpers, path parsing.
- TECH DEBT: Large local implementation and release/deployment distinction.
- MAINTENANCE BURDEN: Very high.
- ESTIMATED LOC: 14,222 LOC across agent-side sandbox/policy.
- POTENTIAL RETIREABLE LOC: 0 authority; 300–900 protocol/serialization helpers only after proof.
- POSSIBLE FOUNDATIONS: OpenHands/AgentFS may be guests behind this boundary.
- INTEGRATION SEAM: AshleyExecutionBroker.
- MIGRATION DEPENDENCIES: Sandbox design, Ed25519 custody, continuity keys, broker protocol, Mint topology.
- RISK: Critical; same-user execution or widened scope.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Can a guest coding runtime meet fixed-recipe/no-secret rules without expanding signed scope?

## S22 — Sandbox broker execution substrate

- SUBSYSTEM: Broker server, policy, sessions, workspaces, process runners, recipes, manifests, audit, daemon protocol.
- PURPOSE: Enforce OS-boundary execution outside Ashley's agent process.
- CURRENT SOURCE FILES/MODULES: apps/sandbox-broker/src (25,609 LOC across 135 TS files), including policy, sessions, workspace, execution, protocol, crypto, store.
- CURRENT DATA TABLES/STATE: Broker store, session ledger, workspace manifests, approvals/events, tombstones, key metadata.
- UPSTREAM: Signed agent/owner/continuity envelopes.
- DOWNSTREAM: Bounded process/artifact execution and receipts.
- BEHAVIORAL/AUTHORITY IMPACT: Critical security authority; not generic agent execution.
- CURRENT TEST COVERAGE: Extensive broker, protocol, crypto, session, path, recipe, process, workspace tests; local wave qualification docs.
- ASHLEY-SPECIFIC SEMANTICS: Dedicated UID, socket, allowlisted recipe, approval, exact artifact, no secret/model/broker access, audit and revocation.
- GENERIC INFRASTRUCTURE: Process launch, IPC, workspace copy/sweep, stores.
- TECH DEBT: Large bespoke surface; local implementation is not Mint proof.
- MAINTENANCE BURDEN: Very high.
- ESTIMATED LOC: 25,609 LOC across 135 TS files.
- POTENTIAL RETIREABLE LOC: 0 wholesale; perhaps 1,000–3,000 generic helpers after security-equivalent proof.
- POSSIBLE FOUNDATIONS: OpenHands runtime or AgentFS may be nested guests; never replace broker authority.
- INTEGRATION SEAM: Signed AshleyExecutionBroker protocol.
- MIGRATION DEPENDENCIES: Mint install, key custody, systemd/socket, recipes, release qualification; none authorized here.
- RISK: Critical; generic executor can widen host authority.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which guest capabilities can be admitted without a third authority layer?

## S23 — Self-modification and change-proposal workflow

- SUBSYSTEM: Source proposals, isolated copies, verification receipts, consultation, broker recipes.
- PURPOSE: Describe a future safe change path without live mutation.
- CURRENT SOURCE FILES/MODULES: core/change-proposal (1,702 LOC across 17 files); docs/Self_Modification_Design.md; broker source workflow.
- CURRENT DATA TABLES/STATE: change_proposals, change_events, source artifacts, verification receipts, consultation/review state.
- UPSTREAM: Owner/consultation, Ashley proposal, isolated broker artifact.
- DOWNSTREAM: Review surfaces only; no automatic deploy/apply.
- BEHAVIORAL/AUTHORITY IMPACT: High; proposal is not authority or code mutation.
- CURRENT TEST COVERAGE: Proposal FSM, routing, source guards, receipts, untrusted repo, broker recipe tests.
- ASHLEY-SPECIFIC SEMANTICS: Human consultation, no repo instruction authority, no capability/identity back door.
- GENERIC INFRASTRUCTURE: Workflow/FSM, patch/artifact storage, verification.
- TECH DEBT: Design-only and local-implementation states are easy to conflate.
- MAINTENANCE BURDEN: High if activated prematurely.
- ESTIMATED LOC: 1,702 LOC agent-side plus broker source portions.
- POTENTIAL RETIREABLE LOC: 300–600 generic FSM/storage only after CSM authorization.
- POSSIBLE FOUNDATIONS: Workflow engine may host proposal lifecycle later.
- INTEGRATION SEAM: AshleyWorkflowRuntime plus execution broker.
- MIGRATION DEPENDENCIES: Consultation, signed recipes, isolated workspace, verification, governance.
- RISK: Critical; self-modification is explicitly deferred.
- RECOMMENDED DISPOSITION: DEFER.
- CONFIDENCE: High.
- OPEN QUESTIONS: None for overnight foundation choice.

## S24 — External-agency policy and broker

- SUBSYSTEM: Action policy, vault, dual authorization, adapters, dispatch FSM, reconciliation, disclosure.
- PURPOSE: Provide a future controlled external-action path distinct from sandbox and identity.
- CURRENT SOURCE FILES/MODULES: core/external-agency (1,804 LOC across 13 files); apps/external-broker/src (2,090 LOC across 22 files); docs/External_Agency_Design.md.
- CURRENT DATA TABLES/STATE: external_actions, external_events, external_entities, external_vault_index, action policy/state.
- UPSTREAM: Thought/action proposal, policy signer, owner approval, classification, capability.
- DOWNSTREAM: Fake/local adapters, receipts, reconciliation, owner review.
- BEHAVIORAL/AUTHORITY IMPACT: Critical; every dispatch needs trusted signed authorization and disclosure rules.
- CURRENT TEST COVERAGE: Deny matrix, signature, vault boundary, FSM, reconciliation, adapter, untrusted-agent tests.
- ASHLEY-SPECIFIC SEMANTICS: No credential in model/memory/sandbox; no password/delete/irreversible default; external agent never authority.
- GENERIC INFRASTRUCTURE: Adapter registry, FSM, durable store, transport.
- TECH DEBT: Design/implementation/deployment states remain separate.
- MAINTENANCE BURDEN: High.
- ESTIMATED LOC: 3,894 LOC across the two code areas.
- POTENTIAL RETIREABLE LOC: 200–500 generic adapter/FSM plumbing after production decision.
- POSSIBLE FOUNDATIONS: Generic workflow/FSM library may be compared; no hosted agent framework owns action.
- INTEGRATION SEAM: AshleyExecutionBroker sibling, not sandbox reuse.
- MIGRATION DEPENDENCIES: Vault, policy keys, owner auth, adapters, release gates, public disclosure.
- RISK: Critical; credential or public-action leakage.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which generic reconciliation primitives are reusable without workflow authority assumptions?

## S25 — Initiative scheduler and wake mechanics

- SUBSYSTEM: Discord jittered proactive scheduler and urgent wake polling.
- PURPOSE: Wake the service at bounded times; it does not decide what Ashley wants to say.
- CURRENT SOURCE FILES/MODULES: discord-bot/src/initiative/scheduler.ts (191 LOC), initiative API/client, core/runtime.ts tick path.
- CURRENT DATA TABLES/STATE: Initiative reservations, proactive caps, relationship/urgent state, delivery ledger.
- UPSTREAM: Timer, urgent poll, owner pause/resume.
- DOWNSTREAM: tickProactive, eligibility, Thought, delivery.
- BEHAVIORAL/AUTHORITY IMPACT: Timing is generic; eligibility and authorization are Ashley semantics.
- CURRENT TEST COVERAGE: Jitter, pause/resume, health, urgent polling, reservation, send/abort tests.
- ASHLEY-SPECIFIC SEMANTICS: Initiative must be motivated, bounded, paused by owner, and receipt-backed.
- GENERIC INFRASTRUCTURE: Timers, polling, backoff, health/restart wake.
- TECH DEBT: Durable wake state is split from Discord lifecycle.
- MAINTENANCE BURDEN: Medium.
- ESTIMATED LOC: 191 LOC scheduler plus shared initiative modules.
- POTENTIAL RETIREABLE LOC: 80–140 timer/poll plumbing after durable scheduler.
- POSSIBLE FOUNDATIONS: Mastra schedules or host scheduler; no candidate gets initiative authority.
- INTEGRATION SEAM: AshleyWorkflowRuntime for wake mechanics plus Agency.
- MIGRATION DEPENDENCIES: Reservations, caps, urgent lease, delivery receipts, Discord health.
- RISK: High if scheduler becomes timer-driven personality.
- RECOMMENDED DISPOSITION: WRAP.
- CONFIDENCE: Medium-high.
- OPEN QUESTIONS: Can schedules persist without stale sends after pause, rollback, or withdrawal?

## S26 — Qualification, evaluation, and counterfactual evidence

- SUBSYSTEM: Offline phase gates, persona/behavioral eval, stabilization, wave qualification, evidence audits.
- PURPOSE: Measure behavioral properties and separate local verification from release/deployment claims.
- CURRENT SOURCE FILES/MODULES: apps/agent-service/src/qualification; scripts; tests; docs/persona-eval.md; stabilization and audit docs.
- CURRENT DATA TABLES/STATE: Evaluation artifacts, capability events, qualification reports; no production promotion here.
- UPSTREAM: Source fixtures, deterministic gates, offline model/test runs.
- DOWNSTREAM: Human release/cutover decisions only.
- BEHAVIORAL/AUTHORITY IMPACT: High; evidence can inform but not auto-promote.
- CURRENT TEST COVERAGE: Broad unit/integration/phase0/stabilization and counterfactual tests.
- ASHLEY-SPECIFIC SEMANTICS: Deterministic persona/epistemic gates, observe/influence, wave ladder.
- GENERIC INFRASTRUCTURE: Test runners, snapshots, report parsing.
- TECH DEBT: Acceptance language can be confused with deployment.
- MAINTENANCE BURDEN: Medium-high.
- ESTIMATED LOC: Not a single subsystem; tracked test/script surface is 194 test files plus qualification modules.
- POTENTIAL RETIREABLE LOC: 0 without separate test-governance review.
- POSSIBLE FOUNDATIONS: Framework test/trace tools may supplement, not replace, Ashley gates.
- INTEGRATION SEAM: Capability authority and report schema.
- MIGRATION DEPENDENCIES: Reproducible fixtures, model route, evidence provenance, no-live-call rule.
- RISK: High if candidate demos become release evidence.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which future foundation properties need deterministic probe-specific gates?

## S27 — Observability and owner diagnostics

- SUBSYSTEM: Health, nuclear health, decisions, reflections, episodes, cognition, revisions, continuity, relationship, capabilities, identity reviews, status.
- PURPOSE: Make authority and lifecycle state inspectable to the owner without exposing secrets or turning logs into behavior.
- CURRENT SOURCE FILES/MODULES: server.ts diagnostic routes; runtime metadata methods; observability/diagnostic tests.
- CURRENT DATA TABLES/STATE: Reads decision/reflection/episode/cognition/continuity/relationship/capability/revision and broker metadata.
- UPSTREAM: Every semantic ledger and lifecycle event.
- DOWNSTREAM: Owner review, qualification, incident diagnosis.
- BEHAVIORAL/AUTHORITY IMPACT: Medium-high; observability must not grant authority or leak secrets.
- CURRENT TEST COVERAGE: Owner auth, redaction, route shape, health readiness, status and metadata tests.
- ASHLEY-SPECIFIC SEMANTICS: Public health minimal; owner-only diagnostics; local evidence is not live/deployed evidence.
- GENERIC INFRASTRUCTURE: HTTP JSON and trace/log serialization.
- TECH DEBT: Many endpoints and evolving payload schemas.
- MAINTENANCE BURDEN: Medium-high.
- ESTIMATED LOC: Included in server/runtime; no safe isolated count.
- POTENTIAL RETIREABLE LOC: 100–250 serialization/route helpers.
- POSSIBLE FOUNDATIONS: OTel/trace exporters may supplement; do not replace authority/event records.
- INTEGRATION SEAM: Owner-authenticated diagnostic contract.
- MIGRATION DEPENDENCIES: Redaction/classification, continuity, capability contracts, report schemas.
- RISK: Medium-high; trace completion can be mistaken for send or live influence.
- RECOMMENDED DISPOSITION: KEEP.
- CONFIDENCE: High.
- OPEN QUESTIONS: Which framework traces are safe as secondary correlation IDs?

## S28 — Retired legacy surface

- SUBSYSTEM: Voice, Telegram, habits, Moltbook, legacy skills, legacy index.db/ChatService residue.
- PURPOSE: Keep the nuclear Discord contract small and prevent retired architectures becoming extension points.
- CURRENT SOURCE FILES/MODULES: Current docs say retired; exact residual files require a separate rg/reference audit.
- CURRENT DATA TABLES/STATE: index.db is archival; nuclear does not read it.
- UPSTREAM: Historical code/docs only.
- DOWNSTREAM: Potentially stale imports/config/tests.
- BEHAVIORAL/AUTHORITY IMPACT: Medium; stale surfaces can route around current gates.
- CURRENT TEST COVERAGE: Historical/retirement checks where present; not deletion authorization.
- ASHLEY-SPECIFIC SEMANTICS: Discord-only, nuclear-only source of truth.
- GENERIC INFRASTRUCTURE: Old adapters and storage.
- TECH DEBT: Residual naming and historical docs.
- MAINTENANCE BURDEN: Low if not reactivated; confusing if ambiguous.
- ESTIMATED LOC: Not counted until exact residual inventory.
- POTENTIAL RETIREABLE LOC: Unknown; measure before deletion.
- POSSIBLE FOUNDATIONS: None.
- INTEGRATION SEAM: None; remove references only under a separate approved change.
- MIGRATION DEPENDENCIES: git grep, package/config/test reference audit.
- RISK: Medium; premature deletion can remove evidence or break build.
- RECOMMENDED DISPOSITION: DELETE.
- CONFIDENCE: Medium on direction, low on exact files.
- OPEN QUESTIONS: Which residual files are tracked and live versus historical only?

## S29 — Plugin and tool interoperability

- SUBSYSTEM: Future Agent Plugins package discovery, Agent Skills, MCP configuration, tool admission, result quarantine.
- PURPOSE: Reduce integration duplication while keeping external components untrusted and policy-mediated.
- CURRENT SOURCE FILES/MODULES: No current implementation; relevant seams are core/sandbox, core/perception, core/privacy, model/tool routes, future AshleyPluginRuntime/AshleyToolRuntime.
- CURRENT DATA TABLES/STATE: No plugin tables; perception, classification, capability, and broker state remain nearest authorities.
- UPSTREAM: Human-approved package metadata and capability policy.
- DOWNSTREAM: Untrusted tools/evidence, never direct send/execute.
- BEHAVIORAL/AUTHORITY IMPACT: Critical if admitted; zero authority by default.
- CURRENT TEST COVERAGE: Existing untrusted-input, sandbox, and privacy tests; no Agent Plugins conformance fixtures.
- ASHLEY-SPECIFIC SEMANTICS: Discovery does not mean trust; tool output is data; execution remains broker-owned.
- GENERIC INFRASTRUCTURE: Manifest parsing, path containment, MCP transport, component-failure isolation.
- TECH DEBT: No stable packaging policy.
- MAINTENANCE BURDEN: Unknown; specification is Working Draft.
- ESTIMATED LOC: 0 current LOC.
- POTENTIAL RETIREABLE LOC: Future duplicate adapters only; no current claim.
- POSSIBLE FOUNDATIONS: Agent Plugins v1, MCP SDK, existing broker.
- INTEGRATION SEAM: AshleyPluginRuntime -> AshleyToolRuntime -> Thought/AshleyExecutionBroker.
- MIGRATION DEPENDENCIES: Version pin, schema fixtures, classification, capability contracts, sandbox policy, no process/network first spike.
- RISK: Critical; prompt injection, tool poisoning, path escape, secret leak.
- RECOMMENDED DISPOSITION: SPIKE REQUIRED.
- CONFIDENCE: High that a boundary is needed; low on adoption.
- OPEN QUESTIONS: What package admission evidence is enough for a read-only tool without mutation?

## S30 — Learned autonomy and Continuous Self-Modification

- SUBSYSTEM: Deferred learned autonomy, substrate independence, and CSM.
- PURPOSE: Future work on deeper autonomy and self-change beyond bounded reflection/proposals.
- CURRENT SOURCE FILES/MODULES: Design docs and bounded learning/change-proposal modules; no authorized end-to-end runtime.
- CURRENT DATA TABLES/STATE: Learning revisions and change proposals exist, but capabilities default observe and CSM is inactive.
- UPSTREAM: Future governance review and explicit owner authorization.
- DOWNSTREAM: None in current behavior; proposals/reviews only.
- BEHAVIORAL/AUTHORITY IMPACT: Critical by definition.
- CURRENT TEST COVERAGE: Bounded learning, proposal, rollback, and non-interference tests; no CSM acceptance.
- ASHLEY-SPECIFIC SEMANTICS: Human consultation, no self-authored authority, no hidden identity mutation.
- GENERIC INFRASTRUCTURE: Potential workflow, source isolation, verification.
- TECH DEBT: Future design can be confused with current implementation.
- MAINTENANCE BURDEN: Unknown and intentionally unexpanded.
- ESTIMATED LOC: Not a current subsystem; supporting modules counted above.
- POTENTIAL RETIREABLE LOC: Not estimated.
- POSSIBLE FOUNDATIONS: Workflow and broker candidates only after separate design.
- INTEGRATION SEAM: Future reviewed proposal path, never direct runtime.
- MIGRATION DEPENDENCIES: Governance, sandbox, continuity, capability review, verification, rollback.
- RISK: Critical.
- RECOMMENDED DISPOSITION: DEFER.
- CONFIDENCE: High.
- OPEN QUESTIONS: None for overnight salvage.

## S31 — Unresolved external foundation research

- SUBSYSTEM: Monoma identity and other emerging foundations not yet verified.
- PURPOSE: Prevent a name or trend entering architecture without authoritative source and Ashley-specific responsibility match.
- CURRENT SOURCE FILES/MODULES: This dossier and research-gap ledger only; no repository implementation.
- CURRENT DATA TABLES/STATE: None.
- UPSTREAM: Human-provided candidate names and official-source search.
- DOWNSTREAM: Human decision queue only.
- BEHAVIORAL/AUTHORITY IMPACT: Low now; potentially high if adopted by name.
- CURRENT TEST COVERAGE: None; source verification is the required test.
- ASHLEY-SPECIFIC SEMANTICS: Candidate must preserve semantic ownership and reversibility.
- GENERIC INFRASTRUCTURE: Candidate-dependent.
- TECH DEBT: Candidate landscape and names drift quickly.
- MAINTENANCE BURDEN: Low until a real candidate is identified.
- ESTIMATED LOC: 0 current LOC.
- POTENTIAL RETIREABLE LOC: 0.
- POSSIBLE FOUNDATIONS: Monoma only after identity verification; no overnight winner.
- INTEGRATION SEAM: Research ledger and bounded candidate dossier.
- MIGRATION DEPENDENCIES: Official repository/docs/license/maintenance evidence.
- RISK: Medium; false certainty can misdirect implementation.
- RECOMMENDED DISPOSITION: RESEARCH NEXT.
- CONFIDENCE: High that research is incomplete; low on candidate value.
- OPEN QUESTIONS: Which Monoma project, if any, did the goal intend?

