# INIT-03 Persistent Cognitive Continuity and Motivation Surface

## Goal

Implement the supplied INIT-03 contract locally, wave by wave, while preserving Ashley's semantic authority in the existing SQLite cognition, continuity, agency, relationship, provenance, and reflection owners.

The implementation must provide:

- durable Open Cognitive Items (OCI) for bounded unresolved questions, revisits, and concerns;
- deterministic, source-grounded materialization with idempotent concurrent creation;
- bounded projections into the existing motivation and Thought flow;
- conservative relationship, withdrawal, delay, reconsideration, resolution, forget, provenance, and model-continuity behavior;
- owner-only diagnostics and deterministic offline qualification evidence;
- no production, Mint, deployment, sandbox/MCP, provider/routing, or Recall-promotion changes.

The supplied INIT-03 text is the accepted design contract for this local implementation. Repository facts below were verified during discovery and are not inferred from historical documents.

## Architecture

The feature has four distinct layers:

1. Source records remain authoritative in their existing tables and capabilities.
2. OCI is the durable semantic inventory for bounded unresolved cognitive continuity.
3. Attention metadata stores only operational delay/reconsideration state.
4. Per-wake motivation projections are transient candidates. They must not become a second persistent motivation authority.

The initial OCI capability decision is composition of the existing source capability, provenance, and contract checks. No capability named cognitive_items is introduced unless implementation evidence proves that source composition cannot express the required gate. If a dedicated capability becomes necessary, it is observe-only and non-influential until its full contract is defined and qualified.

OCI kinds are question, revisit, and concern.

OCI statuses are OPEN, RESOLVED, WITHDRAWN, and SUPERSEDED. DEFERRED is not a status.

An OCI stores a bounded semantic conclusion or prompt-independent summary, source type and identifier, entity_uuid, deterministic owner-scoped semantic/idempotency material, creation metadata, provenance, source capability context, model/build continuity metadata, attention metadata, and transition history. It must not store source_text, chain-of-thought, raw model reasoning, prompt fragments, or unbounded conversation history.

Originating cognition or Reflection may propose an item. The deterministic materializer is the persistence authority and validates owner, source, entity, forgotten/redacted state, capability, provenance, idempotency key, classification, model continuity, and transaction scope before insert or merge.

## Global constraints

- Work only in C:/Users/Xharv/Projects/composer-assistant.
- Preserve the pre-existing modification to AGENTS.md. Do not stage or edit it.
- Stop and report if any other pre-existing dirty path appears before the next wave.
- Local commits are authorized after each passing wave. Push, deployment, Mint, production writes, production migrations, Recall mutation, provider changes, and sandbox/MCP execution are not authorized.
- Do not lower the existing Thought/material floor or make Ashley more talkative as a shortcut.
- Do not use or repurpose scheduled_proactive_messages as OCI or motivation storage.
- Do not add care, attachment, relationship-health, or engagement scores.
- Keep the Attention Governor as runtime/model/resource scheduling. Any candidate band is a separate deterministic qualification concept.
- Offline checks must not use network, Mistral, Groq, NVIDIA, OpenRouter, or any other live provider.
- Use focused tests before broader checks. Never weaken an acceptance test, authorization gate, safety boundary, or offline isolation check.
- Stage explicit files only. Verify the staged path list before every commit.

## File map

### Wave 0

- Create docs/architecture/initiative/INIT03_Persistent_Cognitive_Continuity_Contract_v1.md.
- Create docs/superpowers/specs/2026-08-09-init03-persistent-cognitive-continuity-design.md.
- Create this plan at docs/superpowers/plans/2026-08-09-init03-persistent-cognitive-continuity.md.
- No behavioral code, schema, capability, runtime, production, or Recall changes.

### Wave 1

- Create apps/agent-service/src/core/cognition/migration-23.ts for the smallest durable OCI and attention metadata schema.
- Update apps/agent-service/src/core/db.ts to register migration 23 and keep schema version assertions exact.
- Update apps/agent-service/src/core/continuity/nuclear-targetable.ts only if OCI rows require explicit target resolution.
- Create focused schema/store tests under apps/agent-service/src/core/cognition/.

### Wave 2

- Create apps/agent-service/src/core/cognition/open-items.ts with proposal types, deterministic key construction, validation, materialization, transitions, and bounded reads.
- Create focused proposal/materializer tests.
- Update apps/agent-service/src/core/cognition/worker.ts only at the existing deterministic materialization seam.
- Update existing cognition job tests only when required to prove transaction and restart behavior.

### Wave 3

- Update apps/agent-service/src/core/agency/motivations.ts to read safe source projections and OCI projections without duplicating existing source records.
- Add self-commitment, existing-question, identity-curiosity, curiosity, unfinished, Mind State, reminder, callback, own-time grounded, and OCI source coverage according to the source matrix.
- Add focused motivation projection tests and preserve the current floor, withdrawal gate, and source capability gates.

### Wave 4

- Update relationship projection helpers and relationship tests for self-commitments, mutual commitments, relational tensions, reconnection, and withdrawal.
- Keep relationship influence capability-gated, conservative, bounded, and non-pressuring.
- Keep scheduled_proactive_messages withdrawal-only and schema-only unless an existing accepted source contract changes independently.

### Wave 5

- Create apps/agent-service/src/core/agency/candidate-selection.ts for deterministic candidate-band construction, diversity, deduplication, and bounded OCI/source precedence.
- Update apps/agent-service/src/core/agency/decide.ts, apps/agent-service/src/core/agency/thought.ts, and apps/agent-service/src/core/runtime.ts only where needed to consume the bounded candidate surface.
- Add tests proving no floor regression, one candidate per wake, OCI-only/source-only behavior, and no stale projection reuse.

### Wave 6

- Create apps/agent-service/src/core/cognition/reconsideration.ts for durable delay, reconsideration, resolution validation, bounded delay classes, and Reflection review requests.
- Extend apps/agent-service/src/core/reflection/initiative.ts only for the bounded review seam; preserve existing outcome learning.
- Add tests for delay persistence, restart, bounded repeated delay, no silent expiry, and valid/invalid transitions.

### Wave 7

- Update apps/agent-service/src/core/memory/forget.ts and relationship forget helpers for OCI redaction/tombstone handling using current conventions.
- Update provenance/model-continuity validation at the owning cognition/materializer seam.
- Add tests for forgotten/redacted sources, shadow/live separation, model identity/epoch mismatch, and no time-shift from shadow to live.

### Wave 8

- Add owner-only diagnostics for OCI counts, source status, candidate band, delay/reconsideration, provenance, and transition reasons.
- Update the existing owner-only cognition/reflection/initiative route surface rather than adding public authority.
- Add tests for non-owner rejection and bounded diagnostic payloads with no sensitive plaintext.

### Wave 9

- Create an offline deterministic INIT-03 qualification harness under the existing qualification/test layout.
- Cover baseline, ON/OFF/OCI-only/source-only, isolated shadow, offline network refusal, source forgetting, withdrawal, delay, resolution, duplicate/concurrency, restart, and material-floor invariants.
- Generate a local evidence report without claiming production qualification.

### Wave 10

- Add adversarial tests for source mismatch, owner mismatch, entity mismatch, capability mismatch, malformed proposal, key collision, duplicate concurrent creation, stale model continuity, forgotten source, redacted source, cross-owner access, invalid transition, sensitive-key leakage, and scheduling misuse.
- Run the narrowest relevant regression suite before the full suite.

### Wave 11

- Run current project checks discovered from package scripts: agent tests, build:agent, phase0:offline, and any focused qualification commands added by this initiative.
- Run git diff --check and verify no unauthorized paths, network behavior, production files, Mint files, or AGENTS.md changes were staged.
- Do not alter unrelated failures. Record them precisely if present.

### Wave 12

- Create docs/architecture/initiative/INIT03_Persistent_Cognitive_Continuity_Qualification_v1.md using the required report format.
- Update only architecture/index documentation that is required to describe the implemented local authority and its limits.
- Record wave commits, tests, evidence, performance observations, rollout A/B/C, production untouched, and the remaining human gate.
- Do not represent local qualification as production readiness or deployment.

## Detailed execution tasks

### Task 0: Contract and plan

- [ ] Confirm branch, HEAD, origin/master, and status.
- [ ] Confirm AGENTS.md is the only pre-existing dirty path.
- [ ] Create the contract, design spec, and this plan.
- [ ] Self-review for unresolved placeholders, contradictory authority, unbounded data, forbidden statuses, and production language.
- [ ] Run git diff --check.
- [ ] Stage only the three Wave 0 documents.
- [ ] Commit with: docs(initiative): define INIT-03 cognitive continuity contract

### Task 1: Durable OCI schema

- [ ] Reconfirm a clean baseline except AGENTS.md.
- [ ] Add migration 23 with owner-scoped OCI uniqueness and explicit status/kind constraints.
- [ ] Store semantic_summary as bounded text and reject source_text/reasoning/prompt/history fields.
- [ ] Store entity_uuid, source reference, semantic/idempotency key, provenance, source capability context, build/model continuity, timestamps, and attention metadata.
- [ ] Add indexes for owner/status/kind, source/entity, key lookup, and due reconsideration.
- [ ] Register the migration without changing existing migration meaning.
- [ ] Test create, reopen/read, uniqueness, foreign-reference behavior, indexes, and rollback-safe startup.
- [ ] Run focused tests, build:agent, and phase0:offline as appropriate.
- [ ] Stage only Wave 1 files and commit with the two Wave 1 subjects recorded in the contract.

### Task 2: Proposal and deterministic materializer

- [ ] Define explicit proposal input and materialized OCI output types.
- [ ] Normalize only bounded semantic fields.
- [ ] Construct owner-scoped key material from semantic source identity, entity_uuid, normalized classification, and stable semantic conclusion; hash sensitive material before persistence/logging.
- [ ] Validate source existence, owner, entity, capability, contract, provenance, forgotten/redacted status, model continuity, and classification.
- [ ] Make concurrent creation idempotent at the database constraint and transaction boundary.
- [ ] Make origin metadata observational. Do not allow a model/origin object to write an OCI directly.
- [ ] Test insert, same-key merge, distinct same-source questions, malformed input, cross-owner input, source mutation, and concurrent writers.
- [ ] Integrate only with the existing cognition job transaction.
- [ ] Stage only Wave 2 files and commit with the recorded Wave 2 subjects.

### Task 3: Safe source projections

- [ ] Build a single bounded projection reader for the accepted source matrix.
- [ ] Preserve existing score formulas and floor.
- [ ] Add missing self-commitment, identity-curiosity, own-time grounded, and OCI seams only when their source contracts are verified.
- [ ] Keep due reminders claimable and relationship-gated.
- [ ] Do not read or persist scheduled proactive intent as motivation.
- [ ] Prevent duplicate candidates from the same source and OCI.
- [ ] Test each source class, withdrawal, capability-off, forgotten source, and OCI/source duplicate.
- [ ] Stage only Wave 3 files and commit with the recorded Wave 3 subject.

### Task 4: Bounded relationship producers

- [ ] Treat self-commitments as Ashley-owned continuity and mutual commitments as bilateral continuity.
- [ ] Do not convert mutual commitments into claims of external fulfillment.
- [ ] Treat tension as conservative concern only when the relationship contract and capability state allow it.
- [ ] Treat withdrawal as a gate and never as pressure evidence.
- [ ] Treat reconnection as a low-band bounded candidate.
- [ ] Test each producer with capability ON/OFF and withdrawal ON/OFF.
- [ ] Stage only Wave 4 files and commit with the recorded Wave 4 subject.

### Task 5: Candidate band and Thought

- [ ] Define deterministic candidate bands separate from Attention Governor lanes.
- [ ] Bound count, score, summary length, source diversity, and OCI/source duplication.
- [ ] Preserve current proactive eligibility, terminal checks, and score floor.
- [ ] Keep model selection advisory and validate all returned candidate identifiers.
- [ ] Ensure OCI-only and source-only cases are independently observable.
- [ ] Test one candidate per wake, stable ordering, diversity, no stale projections, and no floor regression.
- [ ] Stage only Wave 5 files and commit with the recorded Wave 5 subject.

### Task 6: Durable delay and reconsideration

- [ ] Define semantic delay classes and a fixed host duration map.
- [ ] Persist defer_until and reason in attention metadata.
- [ ] Ensure restart reads durable state and does not reset delay.
- [ ] Bound repeated delay and route prolonged unresolved state to Reflection review.
- [ ] Validate OPEN -> RESOLVED, OPEN -> WITHDRAWN, and OPEN -> SUPERSEDED transitions with owner/source authority.
- [ ] Reject invalid reverse or cross-owner transitions.
- [ ] Do not delete, silently expire, demote, or reinterpret unresolved items.
- [ ] Stage only Wave 6 files and commit with the recorded Wave 6 subject.

### Task 7: Provenance, forget, and model continuity

- [ ] Resolve OCI source targets through current forget targeting.
- [ ] Make forgotten/redacted source semantic content unavailable.
- [ ] Preserve tombstone/reason conventions and no sensitive payload retention.
- [ ] Reject or quarantine stale model identity/epoch proposals according to the contract.
- [ ] Preserve live/shadow separation and prevent shadow-to-live time shift.
- [ ] Test atomic forget plus OCI behavior.
- [ ] Stage only Wave 7 files and commit with the recorded Wave 7 subject.

### Task 8: Diagnostics

- [ ] Add bounded owner-only summaries.
- [ ] Include counts, source class, status, defer/review state, provenance class, and transition reason.
- [ ] Exclude semantic source plaintext, raw reasoning, prompt fragments, and secret key material.
- [ ] Test owner access, non-owner rejection, and payload bounds.
- [ ] Stage only Wave 8 files and commit with the recorded Wave 8 subject.

### Task 9: Offline qualification

- [ ] Build deterministic fixtures for every source class and transition.
- [ ] Run ON, OFF, OCI-only, source-only, isolated, forgotten, withdrawn, delayed, resolved, restart, concurrency, and counterfactual cases.
- [ ] Assert no network and no live provider use.
- [ ] Assert the Thought/material floor remains unchanged.
- [ ] Record evidence in a local qualification artifact.
- [ ] Stage only Wave 9 files and commit with the recorded Wave 9 subject.

### Task 10: Adversarial hardening

- [ ] Run all adversarial tests.
- [ ] Check sensitive material is absent from keys, logs, diagnostics, and fixtures.
- [ ] Check no unauthorized capability, scheduled intent, sandbox, MCP, provider, routing, or Recall surface was introduced.
- [ ] Stage only Wave 10 files and commit with the recorded Wave 10 subject.

### Task 11: Full verification

- [ ] Run focused tests and project regression tests.
- [ ] Run build:agent and phase0:offline.
- [ ] Run git diff --check.
- [ ] Inspect git status and staged path lists.
- [ ] Record every passing, failing, skipped, and unavailable check.
- [ ] Commit only if the wave gate is satisfied.

### Task 12: Qualification report

- [ ] Write the required INIT-03 report with PASS or BLOCKED.
- [ ] State the verified baseline and every local commit.
- [ ] State the final architecture, source producer matrix, delay/provenance behavior, tests, performance, and rollout A/B/C.
- [ ] State production, Mint, deployment, Recall, sandbox/MCP, and provider boundaries explicitly.
- [ ] State the one remaining human gate.
- [ ] End with STOP.
- [ ] Stage only Wave 12 documentation and commit with: docs(initiative): record INIT-03 qualification

## Wave gate

After every wave:

1. Run the focused checks for that wave.
2. Inspect the diff and tests.
3. Run git diff --check.
4. Confirm AGENTS.md is not staged and no unrelated path is changed.
5. Commit only the named wave scope.
6. If a required check fails or an authority boundary is unclear, stop the wave and report the exact blocker. Do not bypass the gate.

## Done criteria

The initiative is complete only when the implementation, focused tests, offline qualification, adversarial checks, full verification, documentation, and local wave commits all pass the supplied contract. Completion must not imply production readiness. The final report must preserve all blocked or unverified claims and must end with STOP.
