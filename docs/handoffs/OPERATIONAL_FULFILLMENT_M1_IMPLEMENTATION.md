# Operational Fulfillment M1 Implementation & Review Repair Report

## 1. Executive Summary

Operational Fulfillment M1 eliminates two production-proven debts without expanding capability or effect authority:
1. **Prompt Delivery**: Eliminates operational completion wake latency by replacing proactive 15–45m wait with dedicated operational fulfillment pump polling every 1500ms.
2. **Semantic Separation**: Replaces proactive initiative mimicry (`delivery_lane = 'operational_fulfillment'`) with first-class delivery lane isolation.

Durable Bounded Work remains **CLOSED and PRODUCTION PROVEN**.

---

## 2. The Four Blocking Problems & Targeted Resolutions

### Blocker A: Migration 35 Interrupted Recovery
- **Issue**: `reconcilePendingNuclearMigration()` in `apps/agent-service/src/core/db.ts` did not recognize transitions through `34 -> 35`. A crash between SQLite commit and sidecar finalization threw `continuity_pending_migration_unsupported`.
- **Resolution**: Updated `reconcilePendingNuclearMigration()` to explicitly support pending transitions up through `34 -> 35`. Verified by `migration-35.test.ts` failure injection test.

### Blocker B: Schema Failure Expectation
- **Issue**: `apps/agent-service/src/core/data-plane-authority.test.ts` expected `unsupported_nuclear_schema:99>34`.
- **Resolution**: Updated expectation regex to `99>35` and updated all version assertions across migration test suites to 35.

### Blocker C: Crash Between Reservation Create and Obligation Bind
- **Issue**: Reservation creation and obligation binding were separate operations, allowing potential orphan reservations if a crash occurred in between.
- **Resolution**: Implemented `claimAndBindOperationalCompletionReservation` executing inside a single atomic `BEGIN IMMEDIATE` transaction:
  1. Revalidates under lock that the job obligation exists in `operational_job_deliveries`.
  2. Resolves active thread.
  3. Claims operational fulfillment delivery reservation and planned bubbles.
  4. Binds `delivery_reservation_id` in `operational_job_deliveries`.
  5. Commits atomically.

### Blocker D: Transport Failure Must Remain Retryable
- **Issue**: Transport failures during Discord delivery needed to remain retryable without altering terminal job status or rerunning effects.
- **Resolution**:
  - Maintained single logical obligation row in `operational_job_deliveries`.
  - When Discord send fails with zero substantive content visible (`firstSentAt == null`), reservation transitions to `aborted`.
  - Recovery loop detects unfulfilled state, atomically creates a replacement reservation, and updates `delivery_reservation_id`.
  - Preserved partial delivery safety: does not blindly replay when `firstSentAt != null`.

---

## 3. Verified Architectural Invariants

1. **`JOB TERMINAL != DELIVERY COMPLETE`**: Job enters `succeeded` or `failed` phase first; completion delivery is owed and tracked in `operational_job_deliveries`.
2. **`DELIVERY OWED != PROACTIVE INITIATIVE`**: Uses `delivery_lane = 'operational_fulfillment'`. No dummy `decision_log` or `initiative_reservations` rows.
3. **`DELIVERY FAILURE != JOB FAILURE`**: Delivery failures never modify `operational_jobs` terminal status.
4. **`DELIVERY RETRY != EFFECT RETRY`**: Retrying transport send re-renders honesty completion from settled facts; zero calls to Thought, M6, M3, M4, or M5.
5. **`LOST WAKE != LOST COMPLETION`**: Fast poll + recovery sweep picks up any unfulfilled delivery obligations.
6. **`COMPLETION WAKE != AGENCY SPEAKING DECISION`**: Operational fulfillment is owed, not optional. `/proactive pause` does not inhibit delivery.

---

## 4. Verification Evidence

- `apps/agent-service/src/core/sandbox/migration-35.test.ts`: 4/4 passing
- `apps/agent-service/src/core/sandbox/operational-fulfillment-m1.test.ts`: 8/8 passing
- `apps/agent-service/src/core/sandbox/durable-cognition.test.ts`: 24/24 passing
- `apps/agent-service/src/core/sandbox/durable-job-runner.test.ts`: 15/15 passing
- `apps/agent-service/src/core/data-plane-authority.test.ts`: 10/10 passing
- All migration test suites (`migration-*`): 19/19 files, 77/77 passing
- `apps/discord-bot` test suite: 20 suites, 105/105 passing
- Clean TypeScript compilation for both `agent-service` and `discord-bot`.

---

## 5. Targeted Repair 2: Canonical Completion Rendering Restored

- Restored accepted canonical completion floor renderer in `apps/agent-service/src/core/sandbox/durable-job-completion.ts`.
- Preserves all nuanced completion distinctions:
  - Non-M6 Thought settlement (`needs_clarification`, `capability_unavailable`, `non_m6_operation`, `no_bounded_operation`).
  - Distinguishes refusal / `owner_boundary` truthful speech.
  - Reconstructed child evidence truth for M3 candidate workspace, M4 verification receipts, and M5 sealed candidate change-sets without live-apply inflation.
  - Verified evidence-bounded semantic stability across transport retries.
