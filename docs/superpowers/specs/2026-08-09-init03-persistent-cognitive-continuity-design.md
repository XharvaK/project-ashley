# Ashley INIT-03 Persistent Cognitive Continuity Design

**Status:** Approved for local implementation through the supplied INIT-03 wave contract.

**Date:** 2026-08-09

## Goal

Add durable, provenance-backed unfinished cognitive continuity to Ashley without
creating a second memory authority, a persistent motivation system, an
engagement optimizer, or a speech shortcut.

Ashley may retain a bounded unresolved question, revisit, or concern. Existing
source records remain authoritative. Deterministic code may project a bounded
candidate into the current initiative surface. Thought remains responsible for
consideration. Agency remains responsible for speaking, delaying, or remaining
silent. Expression remains responsible for language.

## Current evidence

The current checkout is `master` at
`7d686f4d384da97b1d4d00fb26dedf95b82bbdce`, equal to `origin/master`. The only
pre-existing dirty path is `AGENTS.md`, which is outside this work.

The current nuclear schema is v22. No open cognitive item subsystem exists.
`collectMotivations` writes per-wake motivation projections into the existing
`motivations` table. The deterministic proactive floor is score 25 and must not
change. The current `Attention Governor` owns model-resource scheduling and
must remain distinct from any semantic candidate narrowing. Withdrawal is a
protective gate. Relationship commitments and relational tensions are stored,
but only document reminders currently have a proactive motivation reader.

The current capability registry has source capabilities including `recall`,
`mind_state`, `thought`, `relational_initiative`, `relationship_state`,
`reading`, and `curiosity_consolidation`. It does not have an OCI capability.

## Architecture

The implementation uses four distinct layers:

```text
authoritative source record
        |
        +--> existing source projection
        |
        +--> bounded OCI proposal
                    |
                    v
       deterministic OCI materializer
                    |
                    v
       eligibility, provenance, and bounds
                    |
                    v
       transient Motivation projection
                    |
                    v
       existing Thought -> Agency -> Expression -> Delivery path
```

The OCI table is an Ashley semantic store, not a technical workflow checkpoint
and not a replacement for `nuclear.db` or `continuity.db`. The OCI source
record remains authoritative for its original content. An OCI stores only a
bounded Ashley-owned semantic conclusion and a stable source reference.

No producer sends a message. No scheduler chooses content. No OCI row writes
Expression text. Delivery does not resolve an OCI.

## OCI ontology

Initial semantic kinds are exactly:

- `question`
- `revisit`
- `concern`

Semantic lifecycle states are exactly:

- `OPEN`
- `RESOLVED`
- `WITHDRAWN`
- `SUPERSEDED`

`defer_until` is attention metadata. `DEFERRED` is not an OCI semantic state.
An `OPEN` item with a future `defer_until` remains unresolved and is excluded
from ordinary candidate projection until the time passes.

The durable row contains:

- owner and `entity_uuid`;
- kind and bounded `semantic_summary`;
- deterministic owner-scoped semantic key;
- source type, source identifier, and source `entity_uuid`;
- cognitive origin;
- write-time provenance and capability/model contract metadata;
- semantic status and bounded resolution metadata;
- deferral and consideration metadata;
- timestamps and optional redaction metadata required by current forget rules.

The row MUST NOT contain `source_text`, copied conversation history, large
prompt fragments, raw model output, chain-of-thought, hidden rationale, or a
provider output dump.

## Source ownership and capability decision

No dedicated `cognitive_items` capability is introduced in the initial design.
The existing source capability and provenance contracts are composed at both
materialization and projection time. An OCI cannot have more behavioral
authority than its source.

The materializer validates that:

1. the owner is the caller's owner;
2. the source exists and belongs to that owner;
3. the source is not forgotten or redacted;
4. the source reference is semantically valid for its source type;
5. the source's current capability contract permits the requested write lane;
6. the proposal kind, summary, origin, semantic key material, and provenance
   are valid; and
7. the write is atomic and idempotent.

Live influence requires a live source and current source capability authority.
An OCI created from shadow/observe material is permanently non-influential,
even if the capability later becomes active. Capability demotion suppresses an
existing OCI at projection time. Source mutation, redaction, or deletion is
revalidated before candidate selection and again before delivery where the
current delivery path requires final validation.

## Idempotency

`entity_uuid` identifies the durable row. A SHA-256 semantic key is unique per
owner and is derived from bounded normalized semantic identity plus the stable
source identity. The key includes enough semantic material to allow two
different questions from one source while preventing retry/restart duplicates.
The plaintext semantic material is not logged or exposed as an index value.

The database uniqueness constraint and `INSERT ... ON CONFLICT`/equivalent
materializer path provide exactly-once creation under concurrent retries.

## Projection and candidate bounds

Existing source producers remain intact. The OCI projection is additive and is
performed during the existing motivation collection path. It produces transient
motivations with an OCI reference; it does not persist a second motivation
truth.

Initial source-specific projection scores are mechanical compatibility values,
not psychological meaning. The implementation records the existing score
semantics before introducing OCI scores. A candidate band, if needed, is named
separately from `AttentionLane`/`Attention Governor` and is not persisted as
care, attachment, relationship, or emotional importance.

The candidate selector applies source lifecycle, provenance, capability,
contact/withdrawal, deferral, duplicate, per-kind, diversity, and hard-set
bounds before Thought. Thought receives only bounded candidate identity,
kind, semantic summary, source/evidence references, and existing projection
metadata required by its current contract.

The existing Thought material floor remains unchanged at score 25. Model
Thought remains optional and validated. Silence remains a valid result.

## Creation and resolution

Thought, Reflection, and cognition/consolidation may originate structured OCI
proposals. None writes the database directly. All proposals use the same
deterministic materializer.

Ashley may resolve, withdraw, or supersede her own OCI through validated state
transitions. These transitions cannot fulfill external commitments, assert
external events, rewrite relationship truth, rewrite stable Identity, promote
a capability, rewrite Recall, or erase provenance.

Question resolution requires grounded evidence in the source authority. Revisit
resolution requires an actual reconsideration/conclusion. Concern resolution
or withdrawal is Ashley-owned. A sent or delivered message never resolves an
OCI by itself.

## Delay and reconsideration

Thought may return a bounded semantic delay class. Host code maps that class to
a fixed duration. Model output cannot persist an arbitrary timestamp.

Delay atomically updates `defer_until`, `last_considered_at`,
`consideration_count`, and `last_outcome`; status remains `OPEN`. Restart
preserves the deferral. Expired deferrals become eligible again.

Repeated non-resolution does not expire, delete, forget, or permanently demote
an item. After a fixed typed consideration threshold, the existing Reflection
owner receives a bounded review opportunity. Reflection may propose keep open,
withdraw, or supersede. The initial threshold is a documented policy constant,
not a semantic score and not a new environment variable.

## Relationship-sensitive sources

Self commitments, mutual commitments, and relational tensions are considered
only through their existing relationship authority and capability gates.

Withdrawal remains a gate and never becomes proactive fuel. Mutual commitment
projection cannot unilaterally fulfill or resolve the mutual commitment.
Tension is conservative, strictly bounded, independently disableable through
the existing relationship capability path, and never an engagement optimizer.
At most a small bounded tension candidate may reach Thought, and withdrawal
wins.

Own-time alone never creates a candidate. A grounded result from an own-time
source may participate only through an existing authoritative take, question,
or OCI path.

## Forget and model continuity

The existing forget and continuity authorities remain the owners of redaction,
tombstones, and lineage. Forget propagation must make an OCI's semantic
content unavailable for behavior when its source is forgotten or redacted. A
content-free tombstone is permitted only where current continuity rules permit
one.

Shadow OCIs remain shadow forever. A capability promotion cannot time-shift
them into influence. Capability demotion fails closed. Source revision never
allows an OCI to outrank current source truth. Source deletion fails closed.

## Observability

Existing owner-only initiative status is extended additively. Diagnostics use
stable closed-stage codes and bounded counts. They never expose OCI summaries,
relationship text, source secrets, provider internals, model reasoning, or
chain-of-thought. Public health remains minimal. Read-only status access does
not mutate state.

## Evaluation and qualification

All evaluation is deterministic and offline. INIT-03 ON/OFF comparisons use
identical clocks, transcripts, model fixtures, Expression fixtures, and
capability fixtures except for the target toggle. Metrics cover grounded
continuity, fabricated-continuity rate, source accuracy, appropriate silence,
delay/reconsideration, repetition, diversity, resolution, provenance, and
counterfactual difference. Message volume and engagement are not success
metrics.

Wave acceptance is local evidence only. It is not production release
qualification, Mint evidence, Recall promotion, deployment, or human
behavioral success.

## Non-goals

This design does not lower the Thought floor, optimize proactive frequency,
maximize engagement, add a universal care/attachment/relationship score,
store hidden reasoning, rewrite Identity automatically, activate sandbox or
external tools, change model routing, mutate Recall promotion state, access
Mint, deploy, or push.
