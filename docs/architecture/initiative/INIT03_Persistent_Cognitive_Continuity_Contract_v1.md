# Project Ashley — INIT-03 / Persistent Cognitive Continuity and Motivation Surface

## Contract status

Status: approved for local implementation through Wave 12.

Scope: repository-local implementation, deterministic offline qualification, and documentation.

This contract does not authorize production writes, production migrations, Mint changes, deployment, promotion, Recall mutation, sandbox execution, MCP execution, provider changes, routing changes, or external publication.

The contract is derived from the supplied INIT-03 implementation text and current repository evidence inspected on 2026-08-09.

## Purpose

Ashley needs durable continuity for unresolved cognitive material without converting continuity into pressure, engagement optimization, fake relationship scoring, or a second semantic authority.

INIT-03 adds a bounded persistent inventory of unresolved cognitive items and connects that inventory to the existing cognition, agency, Thought, relationship, provenance, forget, delay, and Reflection seams.

The implementation MUST preserve semantic ownership:

- source records remain authoritative for their own facts, commitments, reminders, curiosity, identity, relationship, and state semantics;
- deterministic SQLite materialization is authoritative for persisted Open Cognitive Items;
- Attention Governor scheduling remains operational scheduling;
- motivation projections remain transient per-wake candidates;
- Thought and model output remain advisory and MUST NOT write semantic state directly;
- Forget, provenance, capability, and owner boundaries remain authoritative at their existing owners.

## Governing constraints

The governing authority chain is:

1. VISION.md;
2. Ashley Core Principles;
3. Ashley Constitution;
4. relevant Stewardship, Ethics, and Hierarchy documents;
5. accepted architecture and initiative contracts.

INIT-03 MUST NOT weaken reciprocal relationship constraints, refusal, grounded continuity, source truth, owner authority, withdrawal, consent, provenance, or the existing Thought/material floor.

The initiative MUST NOT:

- lower the proactive score floor or make Ashley more talkative as a shortcut;
- use timers, randomness, or engagement optimization as a substitute for continuity;
- use or repurpose scheduled_proactive_messages as OCI or motivation storage;
- create care, attachment, relationship-health, or engagement scores;
- store raw source text, chain-of-thought, raw model reasoning, prompt fragments, or unbounded conversation history in OCI;
- let an originator, model, plugin, framework, MCP server, or scheduler become persistence authority;
- assert that a mutual commitment was fulfilled by the existence of an OCI;
- rewrite Identity, Recall, relationship truth, provenance, capability state, or external truth;
- turn shadow evidence into live evidence by time passing;
- introduce a production capability, production migration, sandbox/MCP path, provider path, routing path, or Recall promotion path.

## Current repository evidence

The verified local baseline is:

- checkout: C:/Users/Xharv/Projects/composer-assistant;
- branch: master;
- HEAD: 7d686f4d384da97b1d4d00fb26dedf95b82bbdce;
- origin/master: 7d686f4d384da97b1d4d00fb26dedf95b82bbdce;
- pre-existing dirty path: AGENTS.md only;
- nuclear schema version: 22;
- current proactive decision/material floor: 25;
- current Attention Governor lanes: interactive, urgent_grounded, exchange_cognition, curiosity_maintenance.

The next schema migration is v23. Existing behavior has no durable OCI inventory.

The current agency motivation reader already reads questions, curiosity takes, facts, opinions, ordinary unfinished material, Mind State items, Identity boundaries, and due reminders. It has additional callback, own-time, relationship, and capability seams elsewhere in the runtime. INIT-03 MUST extend verified seams without creating duplicate semantic records.

The current runtime has atomic proactive reservation and delivery. INIT-03 MUST preserve that transaction boundary and MUST NOT treat delivery success as semantic resolution.

The current Reflection initiative seam learns from proactive outcomes. INIT-03 MAY add bounded unresolved-item review requests to that seam, but MUST NOT replace or weaken existing outcome learning.

## Four-layer model

### Layer 1: source records

Source records are the existing authoritative records:

- questions and question state;
- curiosity takes;
- facts and opinions;
- ordinary unfinished material;
- Mind State items;
- Identity boundaries and curiosity;
- document reminders;
- callbacks and own-time grounded records;
- Ashley self-commitments;
- mutual commitments;
- relational tensions;
- withdrawal records;
- current provenance and forget state.

INIT-03 MUST NOT copy source semantics into a second authoritative table.

### Layer 2: persistent Open Cognitive Items

An OCI is a bounded semantic inventory entry for a source-grounded unresolved question, revisit, or concern.

OCI kinds are exactly:

- question;
- revisit;
- concern.

OCI statuses are exactly:

- OPEN;
- RESOLVED;
- WITHDRAWN;
- SUPERSEDED.

DEFERRED MUST NOT be introduced as an OCI status. Delay is attention metadata.

An OCI MUST be owner-scoped and MUST include:

- owner_id;
- kind;
- bounded semantic_summary;
- source_type;
- source_id;
- entity_uuid;
- deterministic owner-scoped semantic/idempotency key;
- source capability and contract context;
- provenance class and source epoch/version where applicable;
- build identity and model identity/epoch where applicable;
- created_at and updated_at;
- current status;
- attention metadata reference or fields;
- transition reason and bounded transition timestamps.

The semantic summary MUST be sufficient to identify the bounded unresolved conclusion without storing a prompt or raw reasoning trace.

The persisted record MUST NOT contain:

- source_text;
- raw conversation history;
- prompt fragments;
- chain-of-thought;
- raw model reasoning;
- unbounded entities or metadata;
- sensitive plaintext in a logged or indexed semantic key.

### Layer 3: attention metadata

Attention metadata stores operational reconsideration state for an OCI:

- delay class;
- defer_until;
- bounded delay reason;
- reconsideration count;
- review-request state;
- last reconsidered time.

Attention metadata MUST NOT redefine OCI semantic status.

The Attention Governor remains the runtime/model/resource scheduler. Candidate bands introduced for INIT-03 are a separate deterministic selection concept.

### Layer 4: transient motivation projection

Every wake MAY construct bounded motivation projections from source records and eligible OPEN OCI rows.

Motivation projections MUST be transient per wake. They MUST NOT become a second persistent motivation authority.

The existing motivations table MAY retain existing runtime learning/diagnostic behavior. INIT-03 MUST NOT use it as the durable OCI inventory and MUST avoid recording duplicate semantic source rows merely because a projection was built.

## Proposal and materialization contract

Cognition, Reflection, or another accepted origin seam MAY emit an OpenCognitiveItemProposal.

The proposal MUST contain only bounded semantic fields:

- owner_id;
- kind;
- bounded semantic summary;
- source type;
- source id;
- entity_uuid;
- origin metadata;
- stable semantic key material;
- provenance;
- source capability context;
- contract/build identity;
- model identity/epoch if the source is model-derived.

Origin is not persistence authority.

The deterministic materializer MUST validate:

- owner scope;
- exact kind;
- source existence;
- source ownership;
- entity_uuid correspondence;
- source capability and contract state;
- provenance and live/shadow separation;
- forgotten, redacted, or detached source state;
- bounded summary and classification;
- deterministic key construction;
- build and model continuity;
- transaction and uniqueness constraints.

The materializer MUST be the only normal path that creates or merges durable OCI rows.

## Idempotency and identity

The key is owner-scoped and deterministic.

Key material MUST distinguish:

- source type;
- source id;
- entity_uuid;
- normalized OCI kind;
- normalized bounded semantic conclusion;
- source semantic version or equivalent stable source revision where required.

The persisted/indexed key MUST be a stable digest or otherwise non-sensitive representation. Sensitive semantic plaintext MUST NOT appear in logs, diagnostics, or indexes.

Two distinct questions from one source are allowed when their normalized semantic conclusions differ. Repeated creation of the same owner/source/entity/kind/conclusion MUST converge on one OCI under concurrent writers.

## Status transitions and agency

Allowed normal transitions are:

- OPEN to RESOLVED;
- OPEN to WITHDRAWN;
- OPEN to SUPERSEDED.

The implementation MAY define narrowly justified re-opening behavior only if the existing source contract requires it and the transition is explicit, owner-scoped, and tested. Silent re-opening is prohibited.

Ashley may resolve an OCI only through validated local transitions. Ashley MUST NOT use OCI resolution to:

- assert external truth;
- claim that a mutual commitment was fulfilled;
- rewrite relationship state;
- rewrite Identity;
- rewrite Recall;
- rewrite provenance;
- promote a capability;
- bypass withdrawal or owner authority.

Invalid, cross-owner, source-mismatched, forgotten, or stale transitions MUST fail closed.

## Source producer matrix

The matrix is a contract for source adjudication. Each wave MUST record the actual implementation disposition.

| Source | Current evidence | INIT-03 disposition |
| --- | --- | --- |
| Existing questions | Read by current motivation collection | ALREADY WIRED; add OCI linkage without duplicate semantic candidates |
| Curiosity takes | Read by current motivation collection | ALREADY WIRED; preserve decay and curiosity capability |
| Facts and opinions | Read by current motivation collection | ALREADY WIRED; preserve source semantics |
| Ordinary unfinished | Read by current motivation collection | ALREADY WIRED; preserve current bounds |
| Mind State items | Read by current motivation collection | ALREADY WIRED; preserve activation/urgency semantics |
| Identity boundaries | Used as a refusal/boundary source | GATE ONLY unless a verified curiosity source exists |
| Identity curiosity | Not fully represented in current proactive reader | PARTIAL; add only through the owning Identity/source seam |
| Document reminders | Current due-reader exists | ALREADY WIRED; preserve relationship claim and due gate |
| Callbacks | Existing grounded callback/runtime seam exists | PARTIAL; project only verified grounded callbacks |
| Own-time grounded report | Reactive seam exists | PARTIAL; do not manufacture unattended continuity |
| Ashley self-commitments | Schema exists; current proactive reader is absent | DISCONNECTED; add bounded self-owned continuity projection |
| Mutual commitments | Schema and relationship claim seam exist; current proactive reader is absent | DISCONNECTED; add conservative bilateral continuity projection |
| Relational tensions | Schema exists; no proactive reader | DISCONNECTED; concern only with relationship capability and low band/cap |
| Withdrawal records | Existing gate exists | ALREADY WIRED as a gate; never use withdrawal as pressure evidence |
| Reconnection | Relationship source exists only where verified | GATE ONLY or PARTIAL; low-band, bounded, capability-gated |
| scheduled_proactive_messages | Schema exists | SCHEMA ONLY; do not use as OCI or motivation source |
| Attention Governor | Runtime scheduling exists | NOT SEMANTICALLY APPROPRIATE as OCI semantic authority |
| Existing motivations | Transient/projection and learning behavior exists | NOT SEMANTICALLY APPROPRIATE as durable OCI storage |

The matrix MUST be updated only with current evidence. A source marked DISCONNECTED is not permission to invent a new authority table.

## Capability and relationship boundaries

The initial design uses existing source capability composition:

- source capability contract;
- apply/observe mode;
- active capability state;
- direct dependency state;
- provenance and shadow predicates;
- withdrawal and owner gates.

No new OCI capability is required for the initial implementation.

Relationship-originated candidates MUST remain conservative:

- self-commitments may represent Ashley-owned continuity;
- mutual commitments may represent an unresolved bilateral continuity object, not fulfillment;
- tensions may produce only a bounded concern under the relationship contract;
- reconnection may produce only a low-band bounded candidate;
- withdrawal suppresses relationship initiative;
- no candidate may create pressure, guilt, escalation, or repeated unwanted contact.

## Candidate selection

Candidate selection MUST be deterministic and bounded.

It MUST:

- preserve current eligibility and material floors;
- cap candidate count and summary length;
- deduplicate source and OCI representations;
- preserve source diversity where eligible;
- prefer current source truth over stale projections;
- select at most one proactive candidate per wake;
- keep model selection advisory and validate returned identifiers.

Candidate bands MUST NOT be interpreted as care, attachment, relationship health, or engagement scores.

## Delay and reconsideration

Delay is a semantic decision with bounded operational classes.

The host MUST map each class to a fixed duration. The mapped defer_until MUST be persisted.

Restart MUST preserve defer_until and reconsideration count.

Repeated delay MUST remain bounded. Prolonged unresolved material MUST eventually request bounded Reflection review. The implementation MUST NOT silently expire, delete, demote, or reinterpret an unresolved OCI.

## Forget, redaction, and provenance

Forget is authoritative for source availability.

When a source is forgotten, redacted, or detached:

- OCI semantic content MUST become unavailable;
- the current tombstone/redaction convention MUST be used;
- raw sensitive text MUST NOT be retained in the OCI or diagnostics;
- attached attention state MUST NOT resurrect source meaning;
- relationship target cleanup MUST remain atomic where current conventions require it.

Shadow evidence MUST remain shadow. Time, delivery, or successful local processing MUST NOT promote it to live evidence or time-shift it into live continuity.

Model identity, model epoch, build identity, and source revision MUST be checked where model-derived semantic continuity depends on them. Stale proposals MUST be rejected, quarantined, or explicitly superseded according to the owning contract.

## Diagnostics and qualification

Diagnostics are owner-only.

They MAY report bounded counts, source classes, OCI status, delay/reconsideration state, provenance class, model/build continuity, and transition reasons.

They MUST NOT report raw source plaintext, raw reasoning, prompt fragments, or sensitive key material.

Qualification MUST be deterministic and offline. It MUST cover:

- baseline;
- capability ON/OFF;
- OCI-only;
- source-only;
- isolated shadow;
- offline network refusal;
- forgotten/redacted source;
- withdrawal;
- delay and restart;
- resolution and invalid transitions;
- concurrent duplicate creation;
- adversarial owner/source/entity/capability/key inputs;
- unchanged Thought/material floor.

Local qualification is not production qualification.

## Wave execution and stop gates

Waves are executed in order:

0. contract and plan;
1. OCI schema;
2. proposal/materializer;
3. safe source projections;
4. relationship producers;
5. candidate selection;
6. delay/reconsideration/resolution;
7. provenance/forget/model continuity;
8. diagnostics;
9. offline qualification;
10. adversarial hardening;
11. regression/build verification;
12. qualification report.

After each wave:

1. run focused tests;
2. inspect the diff;
3. run git diff --check;
4. verify AGENTS.md is not staged;
5. verify only the named wave paths are changed;
6. create the authorized local commit;
7. stop if a required check fails or authority is unclear.

The initiative MUST STOP before production, Mint, deployment, Recall promotion, sandbox/MCP execution, provider use, or external publication.

## Human gate

After local implementation and qualification, one human gate remains: explicit review of the final evidence and explicit separate authorization for any future production or Mint work. INIT-03 itself does not provide that authorization.

STOP.
