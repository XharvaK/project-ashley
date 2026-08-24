# Durable Bounded Work — Slice 2 Implementation

SANDBOX V2 AUTHORITY = UNCHANGED

M6 EFFECT SEMANTICS = UNCHANGED

DURABILITY != NEW AUTHORITY

JOB EXISTS != OPERATION ADMITTED

## Production Thought wiring repair (CI only)

`f2253231dbe3696c2d9397f428dae549ddc8329a` is **superseded**. That candidate could admit `cognition_pending` while `serve.ts` started the durable runner **without** `runDurableThought`, so production never dispatched owner-reactive Thought.

`aba0439675185968b7495c1006dffbe1f7d2096c` wired `runProductionDurableThought` behind `ASHLEY_DURABLE_OPERATIONAL_THOUGHT_ENABLED`, but the driver still had retry/authority holes:

- source lookup preferred `source_user_message_id` then a conversation-shaped scan
- `collectMotivations` persisted rows on every Thought attempt
- `deliberateDecision` was given `deliveryReservationId: admissionReservationId`, so an expired Discord interactive deadline could abort background Thought
- missing source retried as ordinary structural failure instead of fail-closed

This repair keeps production wiring only. No Mint deploy. No production flag change.

### Call graph (owner-reactive)

`operational_jobs.source_message_entity_uuid` → exact `mem_messages` row (owner + optional id match) → `collectMotivations(..., "reactive", { persist: false })` → `decide(..., "reactive")` → `deliberateDecision` → Attention / Initial Thought (`complete`) → `mapDecisionToNormalizedDurableThought` → cognition persist/admission → **existing** atomic M6 attach.

Proactive Agency initiative scoring is **not** on this path. Trigger is `"reactive"`. Test H: zero `initiative_reservations`.

### Retry / restart persistence

| Artifact | Retry behavior |
|---|---|
| motivations | not inserted (`persist: false`) |
| decision_log | not written by this driver |
| initiative reservations | not created (reactive; claim path is proactive-only) |
| mind-state / episodes / callbacks / user-message ingest / completion obligations | not created by the driver |
| Attention request rows | expected, attempt-scoped |
| M6 | only after validated normalized Thought + existing cognition admission |

Missing source: terminal `stopReason=missing_source_message`, no M6.

### Background Thought deadline

`thoughtDeadlineAtMsForJob` maps **remaining cognition lifetime** onto wall-clock `Date.now()`. It does **not** pass `deliveryReservationId`. Discord interactive expiry therefore cannot starve the 15-minute cognition window. Attempt bound is still provider/Attention via that deadline. `M6_MAX_WALL_MS = 900000` unchanged; M6 wall still starts at attach.

### Authority boundary

`durable-thought-production.ts` returns ok/error only. It does not attach M6. Invalid/fallback Thought is structural error; cognition does not persist a bounded_operation or admit M6.

### Local gates (this pass)

- `durable-thought-production` + `durable-cognition` + `durable-job-runner` + migration 33/34: **50 passed / 0 failed**
- agent-service, sandbox-v2, discord-bot `tsc --noEmit`: **clean**

### Linux CI

Final candidate SHA is the tip of `cursor/m-series-local-completion-2357` after this repair commit (filled after push).

Slice-1 accepted Linux baseline: `91b39f968b8da7380418ff2c68a2246e3a61018b` — 1482 pass / 5 fail (`thought-delay.test.ts` ×2, `m5-phase-f.test.ts` ×3). Do not repair those five.

## Slice-1 dependency

Differential Slice-1 candidate: `91b39f968b8da7380418ff2c68a2246e3a61018b`

Original production baseline: `669f40f3e8c7e6bbf5734d5a7d596dc5ba5d0a20`

This slice does not reopen Sandbox V2 authority, Model Fabric routing, or Mint deploy.

## Eligibility (narrow explicit class)

A reactive owner message is eligible for durable cognition only when all of:

1. `ASHLEY_DURABLE_BOUNDED_OPERATION_ENABLED=true`
2. `ASHLEY_DURABLE_OPERATIONAL_THOUGHT_ENABLED=true`
3. bounded-operation capability is currently offerable
4. the text matches the explicit invocation class:
   - `using the bounded operation capability`
   - `durable bounded operation`
   - a leading `[durable-work]` marker

Ordinary conversation stays on the current synchronous Thought path. There is no second LLM preclassifier and no generic operational-language detector.

Tradeoff: Slice 2 will not detach Thought for paraphrases that do not use this explicit class. That is conservative by design.

## Pre-Thought envelope

Eligible turns persist `operational_jobs` with:

- `status=admitted`
- `job_phase=cognition_pending`
- `cognition_state=pending`
- `bounded_operation_task_id=NULL`
- no M6 plan, workspace, changeset, or effect grant

The Discord turn may return an ack that means only: the owner request was durably accepted for processing. Ack failure does not delete the job.

## Cognition lifecycle

`cognition_state`: pending → running → waiting_retry | succeeded | failed | expired | cancelled

Normalized Thought (schema version 1) is persisted after a successful attempt. Attention remains the provider-request ledger; `thought_attention_request_id` is a correlation, not a completion proof.

Unknown-after-restart Attention rows are treated as transport failure, never as success.

## Retry / lifetime

Clocks are separate: Discord ack ≠ Thought attempt timeout ≠ cognition lifetime ≠ M6 lifetime ≠ completion-report lifetime.

- cognition lifetime: 15 minutes (`cognition_expires_at_ms`), starts when the envelope is admitted
- M6 execution lifetime: established at M6 attach/admission using existing Slice-1/M6 wall policy (`M6_MAX_WALL_MS` from attach now). Cognition wait does not consume M6 remaining time.
- transport retries: max 5, backoff 5s / 15s / 45s / 90s / 180s (fake clocks in tests)
- structural retries: max 2, then terminal `structural_thought_failed`
- routing/model selection is unchanged; this layer only decides WHEN another attempt may occur

Normalized Thought schema v1 now also carries `resultKind`, `reasonCode`, and `clarificationQuestion` so restart can render the owed owner response without a second Thought call and without persisting raw provider reasoning.

`thought_attention_request_id` remains the latest attempt. `thought_attention_attempt_ids_json` plus Attention ledger rows enumerate every Thought Attention attempt for a job.

## Atomic M6 attach

When normalized Thought is `bounded_operation`, one transaction writes the M6 admitted task (`origin_job_id`) and set-once `bounded_operation_task_id`, then `job_phase=execution_admitted`. Slice-1 runner then claims only jobs with a non-null M6 id.

## Non-M6 outcomes

No M3/M4/M5/M7 durable execution in this slice. Non-M6 / clarification / refusal / ordinary-conversation results settle the cognition job, enqueue owed completion, and create no M6 task. Clarification does not open an immortal wait; the owner's next message is a new reactive admission.

## Cancellation

Before M6 attach: cancel flag, no further Thought attempt, no effects, settle cancelled, owe completion.

After M6 attach: Slice-1 cancellation semantics.

## Flags

| Slice1 | Slice2 | Behavior |
|---|---|---|
| OFF | OFF | legacy sync Thought + sync M6 |
| ON | OFF | sync Thought → durable M6 (Slice 1) |
| ON | ON | durable envelope → async Thought → durable M6 |
| OFF | ON | boot error; fail closed |

## Tests

`durable-cognition.test.ts`, `durable-cognition-eligibility.test.ts`, `migration-34.test.ts`, plus existing Slice-1 durable runner tests.

## Known Linux baseline reds (unchanged policy)

`thought-delay.test.ts` (2), `m5-phase-f.test.ts` (3). Slice 2 must not add new failures relative to Slice 1.

## Untouched

Mint deploy. Independent review. Sandbox V2 live activation. Provider routing. M7 patch export.
