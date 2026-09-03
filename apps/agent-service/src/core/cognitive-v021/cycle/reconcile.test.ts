import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../../db.js";
import { admitTestCycle, openTestSidecar } from "../test-support.js";
import { updateCycleState, getCycle, appendCycleLogIds } from "./inbox.js";
import { insertDeferredFrontierRecord, getDeferredFrontier } from "../frontier/ledger.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { admitCognitiveIngress } from "../ingress/http.js";
import { reconcileStartupOwnership } from "./reconcile.js";

describe("v0.2.1 startup ownership reconciliation", () => {
  it("discovers and retires true zombie cycle (thinking with terminal wake) to silent", () => {
    const sidecar = openTestSidecar();
    try {
      const cycle = admitTestCycle(sidecar, {
        conversationId: "thread-1",
        triggerKind: "owner_message",
        occupantId: "doc",
        authorityEpoch: 1,
        nowMs: 1,
      });
      updateCycleState(sidecar, cycle.cycleId, "thinking", 2);
      sidecar.prepare("UPDATE wakes SET state = 'terminal', terminal_reason = 'completed', updated_at_ms = 3 WHERE wake_id = ?").run(cycle.wakeId);

      const result = reconcileStartupOwnership(sidecar, { nowMs: 4 });
      expect(result.retiredCycleIds).toContain(cycle.cycleId);
      expect(getCycle(sidecar, cycle.cycleId)?.state).toBe("silent");
    } finally {
      sidecar.close();
    }
  });

  it("preserves capacity_wait cycle whose frontier deadline has elapsed (Campaign 1 invariant)", () => {
    const sidecar = openTestSidecar();
    try {
      const cycle = admitTestCycle(sidecar, {
        conversationId: "thread-wait",
        triggerKind: "owner_message",
        occupantId: "doc",
        authorityEpoch: 1,
        nowMs: 1,
      });
      updateCycleState(sidecar, cycle.cycleId, "capacity_wait", 2);
      const frontier = insertDeferredFrontierRecord(sidecar, {
        conversationId: "thread-wait",
        cycleId: cycle.cycleId,
        generation: cycle.generation,
        nextEligibleAtMs: 10_000,
        latestEvidenceRowId: "ev-1",
        nowMs: 1,
      });

      // Well past the 120s capacity deadline ceiling
      const nowMs = 300_000;
      const result = reconcileStartupOwnership(sidecar, { nowMs });

      expect(result.retiredCycleIds).not.toContain(cycle.cycleId);
      expect(getCycle(sidecar, cycle.cycleId)?.state).toBe("capacity_wait");
      expect(getDeferredFrontier(sidecar, frontier.frontierId)?.state).toBe("waiting");
    } finally {
      sidecar.close();
    }
  });

  it("preserves capacity_wait cycle when frontier is in running state even if deadline elapsed (Witness E)", () => {
    const sidecar = openTestSidecar();
    try {
      const cycle = admitTestCycle(sidecar, {
        conversationId: "thread-running-wait",
        triggerKind: "owner_message",
        occupantId: "doc",
        authorityEpoch: 1,
        nowMs: 1,
      });
      updateCycleState(sidecar, cycle.cycleId, "capacity_wait", 2);
      const frontier = insertDeferredFrontierRecord(sidecar, {
        conversationId: "thread-running-wait",
        cycleId: cycle.cycleId,
        generation: cycle.generation,
        nextEligibleAtMs: 10_000,
        latestEvidenceRowId: "ev-running-1",
        nowMs: 1,
      });
      // Transition frontier to running
      sidecar.prepare("UPDATE deferred_reactive_frontiers SET state = 'running' WHERE frontier_id = ?").run(frontier.frontierId);

      // Well past the 120s capacity deadline ceiling
      const nowMs = 300_000;
      const result = reconcileStartupOwnership(sidecar, { nowMs });

      expect(result.retiredCycleIds).not.toContain(cycle.cycleId);
      expect(getCycle(sidecar, cycle.cycleId)?.state).toBe("capacity_wait");
      expect(getDeferredFrontier(sidecar, frontier.frontierId)?.state).toBe("running");
    } finally {
      sidecar.close();
    }
  });

  it("recovers historical partial ingress orphaned evidence into terminal inbox event and enables clean duplicate replay (Witness A & D)", () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const cycle = admitTestCycle(sidecar, {
        conversationId: "thread-orphan",
        triggerKind: "owner_message",
        occupantId: "doc",
        authorityEpoch: 1,
        nowMs: 1,
      });
      updateCycleState(sidecar, cycle.cycleId, "thinking", 2);
      sidecar.prepare("UPDATE wakes SET state = 'terminal', terminal_reason = 'completed', updated_at_ms = 3 WHERE wake_id = ?").run(cycle.wakeId);

      // Simulate partial ingress: evidence written and composed into zombie cycle, but appendInboxEvent failed
      const evidence = appendOwnerUtterance(sidecar, {
        conversationId: "thread-orphan",
        text: "orphaned turn text",
        discordMessageIds: ["d-orphan-1"],
        nowMs: 4,
      });
      appendCycleLogIds(sidecar, cycle.cycleId, [evidence.rowId], 5);

      // Before recovery: evidence has no inbox event
      const beforeInbox = sidecar.prepare(
        "SELECT 1 FROM inbox_events WHERE json_extract(payload_json, '$.evidenceRowId') = ?",
      ).get(evidence.rowId);
      expect(beforeInbox).toBeUndefined();

      // Startup reconciliation runs (First Start)
      const result = reconcileStartupOwnership(sidecar, { nowMs: 6 });
      expect(result.retiredCycleIds).toContain(cycle.cycleId);
      expect(result.recoveredOrphanEvidenceRowIds).toContain(evidence.rowId);

      // After recovery: terminal inbox event exists
      const afterInbox = sidecar.prepare(
        "SELECT * FROM inbox_events WHERE json_extract(payload_json, '$.evidenceRowId') = ?",
      ).get(evidence.rowId) as Record<string, unknown>;
      expect(afterInbox).toBeDefined();
      expect(afterInbox.state).toBe("terminal");
      expect(afterInbox.status).toBe("consumed");
      expect(afterInbox.terminal_reason).toBe("historical_partial_ingress_abandoned");

      // Witness D: Second Start Idempotence
      const secondResult = reconcileStartupOwnership(sidecar, { nowMs: 7 });
      expect(secondResult.retiredCycleIds).toEqual([]);
      expect(secondResult.recoveredOrphanEvidenceRowIds).toEqual([]);
      const totalDispositions = sidecar.prepare(
        "SELECT COUNT(*) AS count FROM inbox_events WHERE json_extract(payload_json, '$.evidenceRowId') = ?",
      ).get(evidence.rowId) as { count: number };
      expect(totalDispositions.count).toBe(1);

      // Duplicate replay now succeeds with duplicate: true instead of throwing missing inbox error
      const replay = admitCognitiveIngress(sidecar, nuclear, {
        userId: "doc",
        message: "orphaned turn text",
        channel: "discord",
        inboundDiscordMessageIds: ["d-orphan-1"],
        finalFragmentReceivedAtMs: 8,
      }, { nowMs: 8 });

      expect(replay.accepted).toBe(true);
      expect(replay.duplicate).toBe(true);
      expect(replay.evidenceRowId).toBe(evidence.rowId);
    } finally {
      nuclear.close();
      sidecar.close();
    }
  });

  it("does NOT recover evidence composed into pre-existing silent cycle and preserves B7 fail-closed (Witness B)", () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const cycleS = admitTestCycle(sidecar, {
        conversationId: "thread-silent-unrelated",
        triggerKind: "owner_message",
        occupantId: "doc",
        authorityEpoch: 1,
        nowMs: 1,
      });
      // Legitimate pre-existing silent cycle
      updateCycleState(sidecar, cycleS.cycleId, "silent", 2);

      const evidence = appendOwnerUtterance(sidecar, {
        conversationId: "thread-silent-unrelated",
        text: "silent turn text",
        discordMessageIds: ["d-silent-1"],
        nowMs: 3,
      });
      appendCycleLogIds(sidecar, cycleS.cycleId, [evidence.rowId], 4);

      // Startup reconciliation runs
      const result = reconcileStartupOwnership(sidecar, { nowMs: 5 });
      // Pre-existing silent cycle must NOT be retired again and its evidence must NOT be recovered
      expect(result.retiredCycleIds).not.toContain(cycleS.cycleId);
      expect(result.recoveredOrphanEvidenceRowIds).not.toContain(evidence.rowId);

      // Inbox event must NOT be synthesized
      const inboxRow = sidecar.prepare(
        "SELECT 1 FROM inbox_events WHERE json_extract(payload_json, '$.evidenceRowId') = ?",
      ).get(evidence.rowId);
      expect(inboxRow).toBeUndefined();

      // Duplicate replay must still fail closed according to B7
      expect(() => {
        admitCognitiveIngress(sidecar, nuclear, {
          userId: "doc",
          message: "silent turn text",
          channel: "discord",
          inboundDiscordMessageIds: ["d-silent-1"],
          finalFragmentReceivedAtMs: 6,
        }, { nowMs: 6 });
      }).toThrow("corrupt_duplicate_work_disposition_missing_inbox");
    } finally {
      nuclear.close();
      sidecar.close();
    }
  });

  it("does NOT recover evidence composed into pre-existing idle cycle and preserves B7 fail-closed (Witness C)", () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const cycleI = admitTestCycle(sidecar, {
        conversationId: "thread-idle-unrelated",
        triggerKind: "owner_message",
        occupantId: "doc",
        authorityEpoch: 1,
        nowMs: 1,
      });
      // Legitimate pre-existing idle cycle
      updateCycleState(sidecar, cycleI.cycleId, "idle", 2);

      const evidence = appendOwnerUtterance(sidecar, {
        conversationId: "thread-idle-unrelated",
        text: "idle turn text",
        discordMessageIds: ["d-idle-1"],
        nowMs: 3,
      });
      appendCycleLogIds(sidecar, cycleI.cycleId, [evidence.rowId], 4);

      // Startup reconciliation runs
      const result = reconcileStartupOwnership(sidecar, { nowMs: 5 });
      expect(result.retiredCycleIds).not.toContain(cycleI.cycleId);
      expect(result.recoveredOrphanEvidenceRowIds).not.toContain(evidence.rowId);

      // Inbox event must NOT be synthesized
      const inboxRow = sidecar.prepare(
        "SELECT 1 FROM inbox_events WHERE json_extract(payload_json, '$.evidenceRowId') = ?",
      ).get(evidence.rowId);
      expect(inboxRow).toBeUndefined();

      // Duplicate replay must still fail closed according to B7
      expect(() => {
        admitCognitiveIngress(sidecar, nuclear, {
          userId: "doc",
          message: "idle turn text",
          channel: "discord",
          inboundDiscordMessageIds: ["d-idle-1"],
          finalFragmentReceivedAtMs: 6,
        }, { nowMs: 6 });
      }).toThrow("corrupt_duplicate_work_disposition_missing_inbox");
    } finally {
      nuclear.close();
      sidecar.close();
    }
  });

  it("preserves fail-closed behavior for evidence missing inbox that was NOT composed into a zombie cycle", () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const evidence = appendOwnerUtterance(sidecar, {
        conversationId: "thread-failclosed",
        text: "rogue turn text",
        discordMessageIds: ["d-rogue-1"],
        nowMs: 1,
      });

      const result = reconcileStartupOwnership(sidecar, { nowMs: 2 });
      expect(result.recoveredOrphanEvidenceRowIds).not.toContain(evidence.rowId);

      // Duplicate replay must still fail closed
      expect(() => {
        admitCognitiveIngress(sidecar, nuclear, {
          userId: "doc",
          message: "rogue turn text",
          channel: "discord",
          inboundDiscordMessageIds: ["d-rogue-1"],
          finalFragmentReceivedAtMs: 3,
        }, { nowMs: 3 });
      }).toThrow("corrupt_duplicate_work_disposition_missing_inbox");
    } finally {
      nuclear.close();
      sidecar.close();
    }
  });
});
