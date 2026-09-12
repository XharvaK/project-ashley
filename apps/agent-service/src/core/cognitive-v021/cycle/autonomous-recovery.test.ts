import { describe, expect, it } from "vitest";
import { appendAshleyEvidence, appendOwnerUtterance, listConversationEvidence } from "../evidence/conversation-log.js";
import { admitWake } from "../wake/ledger.js";
import { appendInboxEvent, updateCycleState } from "./inbox.js";
import { consumeNextInboxEvent, startInboxConsumer } from "./inbox-consumer.js";
import { startDurableAttempt, settleDurableAttempt } from "../retry/ledger.js";
import { frontierAwareEvidenceSelection } from "../thought/input.js";
import { openTestSidecar } from "../test-support.js";

const RETRY_AGE_MS = 15 * 60 * 1_000;

function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("autonomous_recovery_timeout"));
        return;
      }
      setTimeout(poll, 5);
    };
    poll();
  });
}

function seedSharedWakeBacklog(): {
  db: ReturnType<typeof openTestSidecar>;
  conversationId: string;
  wakeId: string;
  eventA: string;
  eventB: string;
  eventC: string;
  ownerA: string;
  ownerB: string;
  ownerC: string;
} {
  const db = openTestSidecar();
  const conversationId = "conversation:autonomous-recovery";
  const cycleId = "cycle:autonomous-recovery";
  const admitted = admitWake(db, {
    occurrenceId: "occurrence:autonomous-recovery",
    triggerRef: "trigger:autonomous-recovery",
    sourceKind: "inbox",
    conversationId,
    cycleId,
    capturedAuthorityRevision: 1,
    nowMs: 1,
  });
  const wakeId = admitted.wake.wakeId;
  updateCycleState(db, cycleId, "thinking", 2);

  appendAshleyEvidence(db, {
    conversationId,
    text: "R0",
    discordMessageIds: ["discord:autonomous-r0"],
    delivered: true,
    nowMs: 50,
  });
  const ownerA = appendOwnerUtterance(db, {
    conversationId,
    text: "Owner A substantive question",
    discordMessageIds: ["discord:autonomous-a"],
    nowMs: 100,
  });
  const ownerB = appendOwnerUtterance(db, {
    conversationId,
    text: "ash you there?",
    discordMessageIds: ["discord:autonomous-b"],
    nowMs: 200,
  });
  const ownerC = appendOwnerUtterance(db, {
    conversationId,
    text: "Hello?",
    discordMessageIds: ["discord:autonomous-c"],
    nowMs: 300,
  });

  const appendEvent = (id: string, evidenceRowId: string, createdAtMs: number): void => {
    appendInboxEvent(db, {
      id,
      conversationId,
      kind: "owner_utterance",
      payload: { cycleId, wakeId, evidenceRowId },
      createdAtMs,
      wakeId,
    });
  };
  const eventA = "event:autonomous-a";
  const eventB = "event:autonomous-b";
  const eventC = "event:autonomous-c";
  appendEvent(eventA, ownerA.rowId, 100);
  appendEvent(eventB, ownerB.rowId, 200);
  appendEvent(eventC, ownerC.rowId, 300);

  const started = startDurableAttempt(db, { eventId: eventA, workerId: "seed-worker", nowMs: 1_000 });
  settleDurableAttempt(db, {
    eventId: eventA,
    attemptId: started.attemptId,
    claimToken: started.claimToken,
    result: {
      kind: "failed",
      failureClass: "transient_retryable",
      errorCode: "provider_unavailable",
      dispatchTruth: "not_started",
    },
    nowMs: 1_100,
  });

  return {
    db,
    conversationId,
    wakeId,
    eventA,
    eventB,
    eventC,
    ownerA: ownerA.text ?? "",
    ownerB: ownerB.text ?? "",
    ownerC: ownerC.text ?? "",
  };
}

describe("autonomous unanswered conversation recovery", () => {
  it("AUTONOMOUS_UNANSWERED_CONVERSATION_RECOVERY resumes one shared-wake backlog without new Owner input", async () => {
    const fixture = seedSharedWakeBacklog();
    const beforeEventCount = Number((fixture.db.prepare("SELECT COUNT(*) AS count FROM inbox_events").get() as { count: number }).count);
    const claimedEventIds: string[] = [];
    const contextSnapshots: string[][] = [];
    const loop = startInboxConsumer(fixture.db, {
      workerId: "autonomous-recovery-worker",
      pollMs: 1,
      nowMs: () => 1_000 + RETRY_AGE_MS + 1,
      handler: async (event) => {
        claimedEventIds.push(event.id);
        contextSnapshots.push(
          frontierAwareEvidenceSelection(fixture.db, fixture.conversationId, { lastNTurns: 12 })
            .selectedEvidence
            .map((row) => row.text ?? ""),
        );
        return { kind: "completed" as const };
      },
    });
    const duplicateRecoveryLoop = startInboxConsumer(fixture.db, {
      workerId: "duplicate-recovery-worker",
      pollMs: 1,
      nowMs: () => 1_000 + RETRY_AGE_MS + 1,
      handler: async (event) => {
        claimedEventIds.push(event.id);
        contextSnapshots.push(
          frontierAwareEvidenceSelection(fixture.db, fixture.conversationId, { lastNTurns: 12 })
            .selectedEvidence
            .map((row) => row.text ?? ""),
        );
        return { kind: "completed" as const };
      },
    });

    try {
      await waitFor(() => {
        const row = fixture.db.prepare("SELECT state FROM inbox_events WHERE id = ?").get(fixture.eventB) as { state?: string } | undefined;
        return row?.state === "terminal";
      });

      expect(claimedEventIds).toEqual([fixture.eventB]);
      expect(contextSnapshots).toEqual([["R0", fixture.ownerA, fixture.ownerB, fixture.ownerC]]);
      expect(Number((fixture.db.prepare("SELECT COUNT(*) AS count FROM inbox_events").get() as { count: number }).count)).toBe(beforeEventCount);
      expect(fixture.db.prepare("SELECT state, terminal_reason, quarantine_reason FROM inbox_events WHERE id = ?").get(fixture.eventA)).toMatchObject({
        state: "quarantined",
        terminal_reason: "age_exhausted",
        quarantine_reason: "age_exhausted",
      });
      expect(fixture.db.prepare("SELECT state, status, attempt_count FROM inbox_events WHERE id = ?").get(fixture.eventB)).toMatchObject({
        state: "terminal",
        status: "consumed",
        attempt_count: 1,
      });
      expect(fixture.db.prepare("SELECT state, status, attempt_count FROM inbox_events WHERE id = ?").get(fixture.eventC)).toMatchObject({
        state: "pending",
        status: "pending",
        attempt_count: 0,
      });
      expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM durable_work_attempts").get()).toMatchObject({ count: 2 });
      expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: 0 });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(claimedEventIds).toEqual([fixture.eventB]);
      expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM durable_work_attempts").get()).toMatchObject({ count: 2 });
    } finally {
      loop.stop();
      duplicateRecoveryLoop.stop();
      await loop.done;
      await duplicateRecoveryLoop.done;
      fixture.db.close();
    }
  });

  it("does not autonomously recover a conversation with no unanswered Owner backlog", async () => {
    const db = openTestSidecar();
    let handlerCalls = 0;
    appendAshleyEvidence(db, {
      conversationId: "conversation:no-backlog",
      text: "R0",
      delivered: true,
      nowMs: 1,
    });
    const loop = startInboxConsumer(db, {
      workerId: "no-backlog-worker",
      pollMs: 1,
      handler: async () => {
        handlerCalls += 1;
        return { kind: "completed" as const };
      },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(handlerCalls).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM durable_work_attempts").get()).toMatchObject({ count: 0 });
    } finally {
      loop.stop();
      await loop.done;
      db.close();
    }
  });

  it("does not autonomously recover an Owner message already followed by a delivered Ashley response", async () => {
    const db = openTestSidecar();
    const conversationId = "conversation:already-answered";
    const event = appendInboxEvent(db, {
      id: "event:already-answered",
      conversationId,
      kind: "owner_utterance",
      payload: { ownerMessage: "Owner A" },
      createdAtMs: 1,
    });
    appendOwnerUtterance(db, {
      conversationId,
      text: "Owner A",
      discordMessageIds: ["discord:already-answered-a"],
      nowMs: 1,
    });
    appendAshleyEvidence(db, {
      conversationId,
      text: "R1",
      discordMessageIds: ["discord:already-answered-r1"],
      delivered: true,
      nowMs: 2,
    });
    const started = startDurableAttempt(db, { eventId: event.id, workerId: "answer-worker", nowMs: 10 });
    expect(settleDurableAttempt(db, {
      eventId: event.id,
      attemptId: started.attemptId,
      claimToken: started.claimToken,
      result: { kind: "completed" },
      nowMs: 20,
    })).toEqual({ kind: "completed" });

    let handlerCalls = 0;
    const loop = startInboxConsumer(db, {
      workerId: "already-answered-worker",
      pollMs: 1,
      handler: async () => {
        handlerCalls += 1;
        return { kind: "completed" as const };
      },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(handlerCalls).toBe(0);
      expect(db.prepare("SELECT state, status FROM inbox_events WHERE id = ?").get(event.id)).toMatchObject({ state: "terminal", status: "consumed" });
      expect(db.prepare("SELECT COUNT(*) AS count FROM durable_work_attempts WHERE event_id = ?").get(event.id)).toMatchObject({ count: 1 });
    } finally {
      loop.stop();
      await loop.done;
      db.close();
    }
  });

  it("does not resurrect a legitimately terminal or refused obligation", async () => {
    const db = openTestSidecar();
    const conversationId = "conversation:terminal-obligation";
    const owner = appendOwnerUtterance(db, {
      conversationId,
      text: "Owner A",
      discordMessageIds: ["discord:terminal-owner"],
      nowMs: 1,
    });
    const event = appendInboxEvent(db, {
      id: "event:terminal-obligation",
      conversationId,
      kind: "owner_utterance",
      payload: { evidenceRowId: owner.rowId },
      createdAtMs: 1,
    });
    const started = startDurableAttempt(db, { eventId: event.id, workerId: "refusal-worker", nowMs: 10 });
    expect(settleDurableAttempt(db, {
      eventId: event.id,
      attemptId: started.attemptId,
      claimToken: started.claimToken,
      result: {
        kind: "failed",
        failureClass: "permanent_terminal",
        errorCode: "authority_refused",
        dispatchTruth: "provider_responded",
      },
      nowMs: 20,
    })).toEqual({ kind: "terminal", reason: "permanent_failure" });

    let handlerCalls = 0;
    const loop = startInboxConsumer(db, {
      workerId: "terminal-recovery-worker",
      pollMs: 1,
      handler: async () => {
        handlerCalls += 1;
        return { kind: "completed" as const };
      },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(handlerCalls).toBe(0);
      expect(db.prepare("SELECT state, status, terminal_reason FROM inbox_events WHERE id = ?").get(event.id)).toMatchObject({
        state: "terminal",
        status: "failed_terminal",
        terminal_reason: "permanent_failure",
      });
      expect(db.prepare("SELECT state, terminal_reason FROM wakes WHERE wake_id = ?").get(event.wakeId)).toMatchObject({
        state: "terminal",
        terminal_reason: "refused",
      });
    } finally {
      loop.stop();
      await loop.done;
      db.close();
    }
  });

  it("limits a newer unresolved backlog to Owner messages after the last delivered Ashley turn", () => {
    const db = openTestSidecar();
    try {
      const conversationId = "conversation:newer-backlog";
      appendOwnerUtterance(db, { conversationId, text: "Owner A", nowMs: 1 });
      appendAshleyEvidence(db, { conversationId, text: "R1", delivered: true, nowMs: 2 });
      const ownerB = appendOwnerUtterance(db, { conversationId, text: "Owner B", nowMs: 3 });
      const ownerC = appendOwnerUtterance(db, { conversationId, text: "Owner C", nowMs: 4 });
      const evidence = listConversationEvidence(db, conversationId);
      const lastDeliveredAshleyIndex = evidence.reduce(
        (latest, row, index) => row.role === "ashley" && row.delivered ? index : latest,
        -1,
      );
      const unresolvedOwnerText = evidence
        .slice(lastDeliveredAshleyIndex + 1)
        .filter((row) => row.role === "owner")
        .map((row) => row.text);
      expect(unresolvedOwnerText).toEqual([ownerB.text, ownerC.text]);
      expect(frontierAwareEvidenceSelection(db, conversationId, { lastNTurns: 12 }).selectedEvidence.map((row) => row.text)).toEqual([
        "Owner A",
        "R1",
        ownerB.text,
        ownerC.text,
      ]);
    } finally {
      db.close();
    }
  });
});
