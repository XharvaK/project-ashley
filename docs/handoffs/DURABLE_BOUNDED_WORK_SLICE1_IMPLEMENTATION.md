# Durable Bounded Work — Slice 1 Implementation

SANDBOX V2 AUTHORITY = UNCHANGED

M6 EFFECT SEMANTICS = UNCHANGED

DURABILITY != NEW AUTHORITY

## Accepted architecture

Slice 1 detaches **execution** after synchronous Thought admits a `bounded_operation`. Thought still runs in the Discord turn. Slow Thought/provider admission is **not** implemented (slice 2).

`DURABLE_WORK_IDENTITY != M6_EXECUTION_IDENTITY`

- Envelope: `operational_jobs.job_id`
- Execution: `bounded_operation_tasks.task_id`
- Historical synchronous M6 rows keep `origin_job_id = NULL` and are ignored by the runner.

## Schema

Nuclear schema **v33**. Additive tables/columns:

- `operational_jobs`, `operational_job_deliveries`
- `verification_receipts` (M4 recovery evidence, not permission)
- `bounded_operation_tasks.origin_job_id`
- durable columns on `bounded_operation_steps`
- `candidate_changesets.origin_child_task_id`

`project_id` is schema-nullable for slice 2. Slice 1 application still requires a non-null project id before admitted durable M6.

## Envelope

Owns identity, provenance, lifecycle, fencing, cancellation flag, and reporting obligation. Does not own sandbox effects. M3/M4/M5 remain the only child effect owners.

Unique: `job_id`, `entity_uuid`, `(owner_id, source_message_entity_uuid)`, `bounded_operation_task_id` where non-null.

Statuses: admitted, running, succeeded, failed, cancelled, deadline_exceeded, outcome_unknown.

`cancel_requested` is a flag, not a status.

## M6 relationship

Transactional admit writes the M6 admitted row and the operational envelope together, or neither. Runner claims only envelopes, never historical M6.

## Fencing

`runner_owner_token` + `runner_lease_generation` + `runner_lease_until_ms`. Claim uses conditional UPDATE `changes === 1`. Lost fence must not cross a new effect boundary.

## Child task predeclaration

Each durable step persists `child_task_id` + `causation_key` as `declared` before effect. Restart reuses that id. M3/M4/M5 adapters accept optional caller `taskId`.

## Crash reconciliation

- M3: workspace `originChildTaskId` recovery provenance
- M4: receipt exists → reconcile; in_flight without receipt → `outcome_unknown` (verification is not treated as side-effect free)
- M5: `origin_child_task_id` on the changeset row written in the same insert as the seal

AMBIGUOUS_EFFECT stops the job as `outcome_unknown`. No blind replay.

## Completion delivery

`operational_job_deliveries` unique `(job_id, delivery_kind)` with kinds `ack` | `completion`. Terminal commit then idempotent completion enqueue (`delivery_reservation_id = 0` until a real reservation exists).

Owed reporting path (job already terminal):

1. Reconstruct `OperationalClaimLicense` from canonical child evidence only (workspace manager / verification receipts / candidate changesets). Plan text and `derived_license_json` are not truth.
2. Honesty-finalize a deterministic floor from those facts.
3. Optionally attempt Expression (reporting retries only). Expression failure uses the floor. This is not job failure and does not rerun M3/M4/M5/M6.
4. Claim a ledgered delivery reservation via the weekly-review pattern: `decision_log.trigger = 'proactive'` with `reason = 'operational_completion'` and `initiative_reservations.material_key = 'operational-completion:{jobId}'`. CHECK still forbids a third trigger value; the material key is the distinguisher from Agency initiative and weekly review.
5. Bind `operational_job_deliveries.delivery_reservation_id` to that reservation. Discord drains reserved bubbles the same as weekly review. Lost Discord receipt may retry transport; it must not create a second completion obligation or rerun effects.

Agency initiative scoring is not consulted. Cancel still owes a completion report. Status GET remains observation-only.

**Later consolidation (not a Slice-1 blocker):** owed completion still reuses `trigger='proactive'` because a third CHECK value would be a schema migration for aesthetic purity. Distinction is `reason` + unique `material_key` + unique `(job_id, completion)` delivery row. A dedicated trigger enum is a future architecture-consolidation candidate.

## Control plane

- `GET /nuclear/jobs?owner_id=` lists jobs; `job_id` selects one snapshot.
- `POST /nuclear/jobs/cancel` sets `cancel_requested` (flag). NL cancel mapping is deferred.
- One active durable job per owner is refused at **admission** (`durable_job_already_active`), not only in the runner.

## Runner lifecycle

`startDurableOperationalJobRunner` / `stopDurableOperationalJobRunner` use an abortable sleep loop. Shutdown aborts the wait. `shouldStop` prevents starting the next child after stop begins. Committed child truth remains durable.

## Honesty reconstruction

Final speech must reconstruct from canonical child evidence (workspace/snapshot/recipe/changeset ids and hashes). `derived_license_json` is optional cache, not truth. Plan text is not evidence of effects.

## Feature flag

`ASHLEY_DURABLE_BOUNDED_OPERATION_ENABLED` / `env.durableBoundedOperationEnabled`. Default **off**. Off path remains full synchronous `executeBoundedOperationV2`.

Ordinary chat is still gated only by `chat_in_progress` / active owner generation, not by job existence.

## Tests

`durable-job-runner.test.ts` covers unique envelope, fence, detached admit, same child id after crash, M4 unknown vs receipt reconcile, M3-success/M4-fail/M5-skipped, cancel-before-effect, one logical completion, one-active-job admission, new source message after terminal, owed completion draft without invented ids, Expression-failure floor, idle runner stop.

## Remaining Windows reds (not Slice-1 production)

Baseline: `669f40f3e8c7e6bbf5734d5a7d596dc5ba5d0a20`.

`npm run phase0:offline` on this Windows host (sets `ASHLEY_PHASE0_OFFLINE=true`, then agent-service `tsc` + `test:offline`):

**1467 passed / 18 failed / 2 skipped / 5 files failed.** Build (`tsc`) succeeded.

| File | n | Class | Evidence |
|---|---|---|---|
| `thought-delay.test.ts` | 2 | F | Empty diff vs baseline. Actual error is `invalid_evidence_disposition_pairing`, not `payload_invalid`. Not Slice-1 source. |
| `m5-phase-f.test.ts` | 3 | E | Empty diff vs baseline. Expression witness-string mismatch, previously documented. |
| `m7-phase-d.test.ts` | 6 | C | Windows `tmp_not_canonical`. Fixture uses `%TEMP%` (`C:\…`); production POSIX canonicalizer stays fail-closed. |
| `capabilities-endpoint.test.ts` | 1 | D | Empty diff vs baseline. `offline_network_guard` / `bad port` because phase0 sets `ASHLEY_PHASE0_OFFLINE=true`. |
| `thought-provider-failover.test.ts` | 6 | D | Empty diff vs baseline. `offline_network_blocked:nim` under the same phase0 network guard. Linux CI `npm test` does not set this env. |

Supported corpus authority: GitHub Actions `test.yml` job `offline` on `ubuntu-latest` (`apps/agent-service` `npm run build` + `npm test`).

## Local gates (this pass)

- Focused durable + migration-32/33 tests: green (19)
- `tsc --noEmit` / `npm run build` agent-service, sandbox-v2, discord-bot: green
- Feature flag `ASHLEY_DURABLE_BOUNDED_OPERATION_ENABLED` default **false**
- Mint deploy: **not performed**
- Slice 2: **not started**
- Sandbox V2 authority: **unchanged**

## Deferred slice 2

Do not create the envelope before Thought, do not add `waiting_provider`, do not detach admission Thought/provider work.

## Untouched

M7 patch export. Sandbox V2 M1–M7 live activation remains CLOSED. No V1 engineering supervisor reuse.
