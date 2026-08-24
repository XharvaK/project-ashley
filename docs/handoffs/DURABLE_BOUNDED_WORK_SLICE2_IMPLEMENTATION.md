# Durable Bounded Work — Slice 2 Implementation

SANDBOX V2 AUTHORITY = UNCHANGED

M6 EFFECT SEMANTICS = UNCHANGED

DURABILITY != NEW AUTHORITY

JOB EXISTS != OPERATION ADMITTED

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

- cognition lifetime: 15 minutes
- transport retries: max 5, backoff 5s / 15s / 45s / 90s / 180s (fake clocks in tests)
- structural retries: max 2, then terminal `structural_thought_failed`
- routing/model selection is unchanged; this layer only decides WHEN another attempt may occur

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
