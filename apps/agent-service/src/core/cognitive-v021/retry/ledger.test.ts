import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { admitWake } from "../wake/ledger.js";
import { claimNextDurableWork, startDurableAttempt, settleDurableAttempt } from "./ledger.js";
import type { HandlerResult } from "../types.js";

function db(): DatabaseSync {
  return openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } });
}

function seedEvent(sidecar: DatabaseSync): void {
  admitWake(sidecar, {
    occurrenceId: "occurrence:retry", triggerRef: "trigger:retry", sourceKind: "inbox",
    conversationId: "conversation:retry", cycleId: "cycle:retry", capturedAuthorityRevision: 1, nowMs: 1,
  });
  const wake = sidecar.prepare("SELECT wake_id FROM wakes WHERE occurrence_id = ?").get("occurrence:retry") as { wake_id: string };
  sidecar.prepare(
    `INSERT INTO inbox_events (id, conversation_id, kind, payload_json, created_at_ms, status, wake_id)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  ).run("event:retry", "conversation:retry", "test", "{}", 1, wake.wake_id);
}

describe("durable attempt ledger", () => {
  it("creates one bounded attempt and moves a retryable failure to durable retry_wait", () => {
    const sidecar = db();
    seedEvent(sidecar);
    const started = startDurableAttempt(sidecar, { eventId: "event:retry", workerId: "worker-1", nowMs: 1_000 });
    expect(started.ordinal).toBe(1);
    expect(started.dispatchTruth).toBe("not_started");
    const settled = settleDurableAttempt(sidecar, {
      eventId: "event:retry", attemptId: started.attemptId, claimToken: started.claimToken,
      result: { kind: "failed", failureClass: "transient_retryable", errorCode: "provider_unavailable", dispatchTruth: "not_started" }, nowMs: 1_100,
    });
    expect(settled).toEqual({ kind: "retry_wait", nextEligibleAtMs: 2_100 });
    expect(sidecar.prepare("SELECT state, status, attempt_count, next_eligible_at_ms FROM inbox_events WHERE id = ?").get("event:retry")).toMatchObject({ state: "retry_wait", status: "failed_retryable", attempt_count: 1, next_eligible_at_ms: 2_100 });
    sidecar.close();
  });

  it("never replays an outcome-unknown attempt", () => {
    const sidecar = db();
    seedEvent(sidecar);
    const started = startDurableAttempt(sidecar, { eventId: "event:retry", workerId: "worker-1", nowMs: 1_000 });
    expect(settleDurableAttempt(sidecar, {
      eventId: "event:retry", attemptId: started.attemptId, claimToken: started.claimToken,
      result: { kind: "outcome_unknown", operationId: "operation:retry", errorCode: "timeout" }, nowMs: 1_100,
    })).toEqual({ kind: "reconciling" });
    expect(sidecar.prepare("SELECT state FROM inbox_events WHERE id = ?").get("event:retry")).toMatchObject({ state: "reconciling" });
    sidecar.close();
  });

  it("keeps five attempt ordinals on one W5 wake and then quarantines the fifth failure", () => {
    const sidecar = db();
    seedEvent(sidecar);
    let nowMs = 1_000;
    const attempts: string[] = [];
    for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
      const started = startDurableAttempt(sidecar, { eventId: "event:retry", workerId: `worker-${ordinal}`, nowMs });
      attempts.push(started.attemptId);
      const result = settleDurableAttempt(sidecar, {
        eventId: "event:retry",
        attemptId: started.attemptId,
        claimToken: started.claimToken,
        result: {
          kind: "failed",
          failureClass: "transient_retryable",
          errorCode: "provider_unavailable",
          dispatchTruth: "not_started",
        },
        nowMs,
      });
      if (ordinal < 5) {
        expect(result.kind).toBe("retry_wait");
        nowMs = (result as { nextEligibleAtMs: number }).nextEligibleAtMs;
      } else {
        expect(result).toEqual({ kind: "terminal", reason: "attempts_exhausted" });
      }
    }
    expect(new Set((sidecar.prepare("SELECT wake_id FROM durable_work_attempts WHERE event_id = ? ORDER BY ordinal").all("event:retry") as Array<{ wake_id: string }>).map((row) => row.wake_id)).size).toBe(1);
    expect((sidecar.prepare("SELECT state, status, attempt_count, terminal_reason FROM inbox_events WHERE id = ?").get("event:retry"))).toMatchObject({ state: "quarantined", status: "failed_terminal", attempt_count: 5, terminal_reason: "attempts_exhausted" });
    expect((sidecar.prepare("SELECT COUNT(*) AS count FROM durable_work_attempts WHERE event_id = ?").get("event:retry") as { count: number }).count).toBe(attempts.length);
    sidecar.close();
  });

  it("makes a duplicate attempt settlement idempotent and quarantines a contradictory result", () => {
    const sidecar = db();
    seedEvent(sidecar);
    const started = startDurableAttempt(sidecar, { eventId: "event:retry", workerId: "worker-1", nowMs: 1_000 });
    const result: HandlerResult = {
      kind: "failed",
      failureClass: "transient_retryable",
      errorCode: "provider_unavailable",
      dispatchTruth: "not_started",
    };
    expect(settleDurableAttempt(sidecar, { eventId: "event:retry", attemptId: started.attemptId, claimToken: started.claimToken, result, nowMs: 1_100 })).toMatchObject({ kind: "retry_wait" });
    expect(settleDurableAttempt(sidecar, { eventId: "event:retry", attemptId: started.attemptId, claimToken: started.claimToken, result, nowMs: 1_200 })).toMatchObject({ kind: "retry_wait", nextEligibleAtMs: 2_100 });
    expect(settleDurableAttempt(sidecar, {
      eventId: "event:retry",
      attemptId: started.attemptId,
      claimToken: started.claimToken,
      result: { kind: "failed", failureClass: "permanent_terminal", errorCode: "invalid_request", dispatchTruth: "provider_responded" },
      nowMs: 1_300,
    })).toEqual({ kind: "terminal", reason: "contradictory_result" });
    expect(sidecar.prepare("SELECT state, quarantine_reason FROM inbox_events WHERE id = ?").get("event:retry")).toMatchObject({ state: "quarantined", quarantine_reason: "contradictory_result" });
    sidecar.close();
  });

  it("does not let retry-wait poison work block another conversation", () => {
    const sidecar = db();
    seedEvent(sidecar);
    sidecar.prepare(
      `INSERT INTO wakes
         (wake_id, occurrence_id, trigger_ref, source_kind, conversation_id, cycle_id,
          state, terminal_reason, captured_authority_revision, created_at_ms, updated_at_ms)
       VALUES ('wake:other', 'occurrence:other', 'trigger:other', 'inbox',
          'conversation:other', 'cycle:other', 'pending', NULL, 1, 1, 1)`,
    ).run();
    sidecar.prepare(
      `INSERT INTO cycle_records
         (cycle_id, conversation_id, generation, wake_id, state, trigger_kind, trigger_ref,
          authority_epoch, architecture_epoch, admitted_at_ms, updated_at_ms, compose_log_ids_json)
       VALUES ('cycle:other', 'conversation:other', 1, 'wake:other', 'admitted',
          'owner_message', 'trigger:other', 1, 'v0.2.1', 1, 1, '[]')`,
    ).run();
    sidecar.prepare(
      `INSERT INTO inbox_events
         (id, conversation_id, kind, payload_json, created_at_ms, status, wake_id, lane)
       VALUES ('event:other', 'conversation:other', 'test', '{}', 2, 'pending', 'wake:other', 'interactive')`,
    ).run();

    const first = claimNextDurableWork(sidecar, { workerId: "worker", nowMs: 1_000 });
    expect(first?.eventId).toBe("event:retry");
    if (!first) throw new Error("first_claim_missing");
    expect(settleDurableAttempt(sidecar, {
      eventId: first.eventId,
      attemptId: first.attemptId,
      claimToken: first.claimToken,
      result: { kind: "failed", failureClass: "transient_retryable", errorCode: "provider_unavailable", dispatchTruth: "not_started" },
      nowMs: 1_001,
    }).kind).toBe("retry_wait");

    const other = claimNextDurableWork(sidecar, { workerId: "worker-2", nowMs: 1_002 });
    expect(other?.eventId).toBe("event:other");
    sidecar.close();
  });

  it("allows only one worker to create the active attempt", () => {
    const sidecar = db();
    seedEvent(sidecar);
    const first = claimNextDurableWork(sidecar, { workerId: "worker-a", nowMs: 1_000 });
    const second = claimNextDurableWork(sidecar, { workerId: "worker-b", nowMs: 1_001 });
    expect(first?.eventId).toBe("event:retry");
    expect(second).toBeNull();
    expect((sidecar.prepare("SELECT COUNT(*) AS count FROM durable_work_attempts WHERE event_id = 'event:retry'").get() as { count: number }).count).toBe(1);
    sidecar.close();
  });

  it("routes an expired attempt with possible dispatch to reconciliation, never replay", () => {
    const sidecar = db();
    seedEvent(sidecar);
    const first = claimNextDurableWork(sidecar, { workerId: "worker-a", nowMs: 1_000, leaseMs: 5 });
    if (!first) throw new Error("first_claim_missing");
    sidecar.prepare("UPDATE durable_work_attempts SET dispatch_truth = 'attempted' WHERE attempt_id = ?").run(first.attemptId);
    expect(claimNextDurableWork(sidecar, { workerId: "worker-b", nowMs: 1_006 })).toBeNull();
    expect(sidecar.prepare("SELECT state FROM inbox_events WHERE id = 'event:retry'").get()).toMatchObject({ state: "reconciling" });
    expect(sidecar.prepare("SELECT state FROM wakes WHERE wake_id = ?").get(first.wakeId)).toMatchObject({ state: "reconciling" });
    expect((sidecar.prepare("SELECT COUNT(*) AS count FROM durable_work_attempts WHERE event_id = 'event:retry'").get() as { count: number }).count).toBe(1);
    sidecar.close();
  });

  it("quarantines work at the fifteen-minute age boundary", () => {
    const sidecar = db();
    seedEvent(sidecar);
    const first = startDurableAttempt(sidecar, { eventId: "event:retry", workerId: "worker", nowMs: 1_000 });
    expect(settleDurableAttempt(sidecar, {
      eventId: "event:retry",
      attemptId: first.attemptId,
      claimToken: first.claimToken,
      result: { kind: "failed", failureClass: "transient_retryable", errorCode: "provider_unavailable", dispatchTruth: "not_started" },
      nowMs: 901_000,
    })).toEqual({ kind: "terminal", reason: "age_exhausted" });
    expect(sidecar.prepare("SELECT state, terminal_reason, quarantine_reason FROM inbox_events WHERE id = 'event:retry'").get()).toMatchObject({ state: "quarantined", terminal_reason: "age_exhausted", quarantine_reason: "age_exhausted" });
    sidecar.close();
  });

  it("commits the primary retry terminal state before a failed C3 derived write", () => {
    const sidecar = db();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      seedEvent(sidecar);
      const first = startDurableAttempt(sidecar, { eventId: "event:retry", workerId: "worker", nowMs: 1_000 });
      sidecar.exec(
        `CREATE TRIGGER c3_retry_write_failure
           BEFORE INSERT ON c3_terminal_experiences
           BEGIN SELECT RAISE(ABORT, 'c3_retry_write_failure'); END`,
      );
      expect(settleDurableAttempt(sidecar, {
        eventId: "event:retry",
        attemptId: first.attemptId,
        claimToken: first.claimToken,
        result: { kind: "failed", failureClass: "transient_retryable", errorCode: "provider_unavailable", dispatchTruth: "not_started" },
        nowMs: 901_000,
      })).toEqual({ kind: "terminal", reason: "age_exhausted" });
      expect(sidecar.prepare("SELECT state, terminal_reason FROM inbox_events WHERE id = 'event:retry'").get()).toMatchObject({ state: "quarantined", terminal_reason: "age_exhausted" });
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM c3_terminal_experiences").get()).toMatchObject({ count: 0 });
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("c3_write_deferred_for_forward_repair"), expect.anything());
    } finally {
      warning.mockRestore();
      sidecar.close();
    }
  });
});
