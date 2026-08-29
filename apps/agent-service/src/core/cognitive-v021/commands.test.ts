import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import { openCognitiveSidecarDb } from "./sidecar/db.js";
import { resolveActiveThread, insertMessage } from "../memory/threads.js";
import { getAuthoritativeLineageId } from "../continuity/db.js";
import { getInboxEvent } from "./cycle/inbox.js";
import { appendOwnerUtterance, appendAshleyEvidence } from "./evidence/conversation-log.js";
import { upsertMemoryAssertion } from "./memory/assertions.js";
import { scheduleFutureTrigger } from "./initiative/future-triggers.js";
import {
  admitV021RememberCommand,
  getV021MemorySummary,
  previewV021Forget,
  confirmV021Forget,
} from "./commands.js";

const OWNER = "owner-commands";

function stores(): {
  sidecar: DatabaseSync;
  nuclear: DatabaseSync;
  continuity: DatabaseSync;
} {
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  const nuclear = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
  const sidecar = openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
  return { sidecar, nuclear, continuity };
}

describe("v0.2.1 command wiring", () => {
  it("queues /remember as a reference-only directive and is replay-idempotent", () => {
    const { sidecar, nuclear, continuity } = stores();
    try {
      const first = admitV021RememberCommand(sidecar, nuclear, {
        ownerId: OWNER,
        text: "I prefer short, careful answers.",
        sensitivity: "none",
        discordMessageId: "remember-interaction-1",
        nowMs: 10,
      });
      const second = admitV021RememberCommand(sidecar, nuclear, {
        ownerId: OWNER,
        text: "I prefer short, careful answers.",
        sensitivity: "none",
        discordMessageId: "remember-interaction-1",
        nowMs: 11,
      });

      expect(first.queued).toBe(true);
      expect(first.fact).toBeNull();
      expect(second.duplicate).toBe(true);
      expect(second.evidenceRowId).toBe(first.evidenceRowId);
      expect(second.inboxEventId).toBe(first.inboxEventId);
      expect(second.cycleId).toBe(first.cycleId);
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM inbox_events").get()).toMatchObject({ count: 1 });
      expect(nuclear.prepare("SELECT COUNT(*) AS count FROM mem_facts").get()).toMatchObject({ count: 0 });

      const event = getInboxEvent(sidecar, first.inboxEventId);
      expect(event).not.toBeNull();
      expect(event?.payload).not.toHaveProperty("text");
      expect(JSON.stringify(event?.payload)).not.toContain("short, careful");
      expect(sidecar.prepare("SELECT text FROM conversation_evidence_log WHERE row_id = ?").get(first.evidenceRowId)).toMatchObject({
        text: "I prefer short, careful answers.",
      });
      expect(getAuthoritativeLineageId(continuity)).toEqual(expect.any(String));
    } finally {
      sidecar.close();
      nuclear.close();
      continuity.close();
    }
  });

  it("renders /memory from live sidecar assertions and delivered evidence only", () => {
    const { sidecar, nuclear, continuity } = stores();
    try {
      const threadId = resolveActiveThread(nuclear, OWNER, "discord");
      upsertMemoryAssertion(sidecar, {
        assertionKey: "owner:preference",
        statement: "The owner prefers concise answers.",
        memoryKind: "owner_preference",
        dimensions: { source: "owner_utterance", status: "asserted", time: "current", reliability: "owner_supplied" },
        dataClassification: "never_public",
        lineageParentKey: null,
        admittedGeneration: 1,
        live: true,
      });
      upsertMemoryAssertion(sidecar, {
        assertionKey: "quarantine:old",
        statement: "Old imported material.",
        memoryKind: "owner_world_claim",
        dimensions: { source: "owner_utterance", status: "asserted", time: "historical", reliability: "owner_supplied" },
        dataClassification: "never_public",
        lineageParentKey: null,
        admittedGeneration: null,
        live: false,
      });
      appendOwnerUtterance(sidecar, { conversationId: threadId, text: "We discussed the concise answer style.", nowMs: 20 });
      appendAshleyEvidence(sidecar, { conversationId: threadId, text: "Delivered answer.", delivered: true, nowMs: 21 });
      appendAshleyEvidence(sidecar, { conversationId: threadId, text: "Undelivered draft.", delivered: false, nowMs: 22 });

      const summary = getV021MemorySummary(sidecar, nuclear, OWNER, false);
      expect(summary.threadId).toBe(threadId);
      expect(summary.facts).toEqual([
        expect.objectContaining({ key: "owner:preference", value: "The owner prefers concise answers." }),
      ]);
      expect(summary.facts.some((fact) => fact.key === "quarantine:old")).toBe(false);
      expect(summary.narrative).toContain("We discussed the concise answer style.");
      expect(summary.narrative).toContain("Delivered answer.");
      expect(summary.narrative).not.toContain("Undelivered draft.");
    } finally {
      sidecar.close();
      nuclear.close();
      continuity.close();
    }
  });

  it("uses a continuity preview and exact v021 targets for forget", () => {
    const { sidecar, nuclear, continuity } = stores();
    try {
      const threadId = resolveActiveThread(nuclear, OWNER, "discord");
      const evidence = appendOwnerUtterance(sidecar, {
        conversationId: threadId,
        text: "Keep the old project topic private.",
        nowMs: 30,
      });
      upsertMemoryAssertion(sidecar, {
        assertionKey: "owner:old-project",
        statement: "The old project topic is private.",
        memoryKind: "owner_world_claim",
        dimensions: { source: "owner_utterance", status: "asserted", time: "current", reliability: "owner_supplied" },
        dataClassification: "never_public",
        lineageParentKey: null,
        admittedGeneration: 1,
        live: true,
      });
      scheduleFutureTrigger(sidecar, {
        triggerId: "old-project-trigger",
        conversationId: threadId,
        concernId: "old-project-concern",
        snapshotHash: "snapshot",
        dueAtMs: 100,
        payload: { topicKey: "old project" },
      });
      const messageId = insertMessage(nuclear, {
        threadId,
        ownerId: OWNER,
        role: "user",
        text: "Old project topic in compatibility memory.",
        channel: "discord",
      });

      const preview = previewV021Forget(sidecar, nuclear, continuity, {
        ownerId: OWNER,
        topic: "old project",
        nowMs: 40,
      });
      expect(preview.previewId).toEqual(expect.any(String));
      expect(preview.preview.length).toBeGreaterThan(0);
      expect(preview.categoryCounts).toEqual(expect.objectContaining({
        v021_conversation_evidence: 1,
        v021_memory_assertion: 1,
        mem_messages: 1,
      }));
      const previewId = preview.previewId;
      if (!previewId) throw new Error("test_preview_id_missing");

      const result = confirmV021Forget(sidecar, nuclear, continuity, {
        ownerId: OWNER,
        previewId,
        nowMs: 41,
      });
      expect(result.receiptId).toEqual(expect.any(String));
      expect(result.tombstoneId).toEqual(expect.any(String));
      expect(sidecar.prepare("SELECT text, source_status FROM conversation_evidence_log WHERE row_id = ?").get(evidence.rowId)).toMatchObject({ text: null, source_status: "redacted" });
      expect(sidecar.prepare("SELECT statement, live FROM sidecar_memory_assertions WHERE assertion_key = 'owner:old-project'").get()).toMatchObject({ statement: "[redacted]", live: 0 });
      expect(sidecar.prepare("SELECT status FROM future_triggers WHERE trigger_id = 'old-project-trigger'").get()).toMatchObject({ status: "cancelled" });
      expect(nuclear.prepare("SELECT text, redacted_at FROM mem_messages WHERE id = ?").get(messageId)).toMatchObject({ text: "" });
      if (!result.tombstoneId) throw new Error("test_tombstone_id_missing");
      expect(continuity.prepare("SELECT status FROM forget_tombstones WHERE tombstone_id = ?").get(result.tombstoneId)).toMatchObject({ status: "applied" });
    } finally {
      sidecar.close();
      nuclear.close();
      continuity.close();
    }
  });
});
