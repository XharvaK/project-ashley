import { describe, expect, it } from "vitest";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { applyWorkingContextDelta, listWorkingContext } from "../evidence/working-context.js";
import { insertOutboxPending } from "../speech/outbox.js";
import { openTestSidecar } from "../test-support.js";
import { retrieveCandidates } from "../retrieval/discover.js";
import { upsertMemoryAssertion } from "./assertions.js";
import { buildOwnerKnowledgeView } from "./views.js";
import { applyV021Forget } from "./forget.js";

describe("v0.2.1 forget matrix", () => {
  it("redacts semantic content and suppresses future delivery", () => {
    const db = openTestSidecar();
    try {
      const evidence = appendOwnerUtterance(db, { conversationId: "thread-1", text: "HY3 is the relevant model.", discordMessageIds: ["forget-1"], nowMs: 1 });
      applyWorkingContextDelta(db, { op: "upsert", item: { id: "wc-hy3", conversationId: "thread-1", type: "owner_teaching", text: "HY3 is the relevant model.", concernId: "concern-hy3", sourceTurnIds: [evidence.rowId], status: "active", supersedesId: null } }, { cycleId: "cycle-1", generation: 1 });
      db.prepare("INSERT INTO observation_subscriptions (subscription_id, conversation_id, spec_json, cancelled) VALUES (?, ?, ?, 0)").run("subscription-hy3", "thread-1", JSON.stringify({ topicKeys: ["HY3"], scope: "HY3" }));
      upsertMemoryAssertion(db, { assertionKey: "memory:hy3", statement: "HY3 is the relevant model.", memoryKind: "owner_world_claim", dimensions: { source: "owner_utterance", status: "asserted", time: "current", reliability: "owner_supplied" }, dataClassification: "never_public", lineageParentKey: null, admittedGeneration: 1, live: true });
      const outbox = insertOutboxPending(db, { settlementId: "settlement-hy3", cycleId: "cycle-1", generation: 1, conversationId: "thread-1", licensedText: "I remember HY3.", deliveryIntent: { ownerId: "doc", channel: "discord", threadId: "thread-1", conversationId: "thread-1", trigger: "idle", deliveryLane: "proactive", purpose: "licensed_speech" } });

      const result = applyV021Forget(db, { topic: "HY3", nowMs: 2 });
      expect(result.targets.some((target) => target.entityType === "v021_conversation_evidence")).toBe(true);
      expect(db.prepare("SELECT text, source_status FROM conversation_evidence_log WHERE row_id = ?").get(evidence.rowId)).toMatchObject({ text: null, source_status: "redacted" });
      expect(listWorkingContext(db, "thread-1")).toEqual([]);
      expect(buildOwnerKnowledgeView(db)).toEqual([]);
      expect(db.prepare("SELECT cancelled, spec_json FROM observation_subscriptions WHERE subscription_id = 'subscription-hy3'").get()).toMatchObject({ cancelled: 1, spec_json: "{}" });
      expect(db.prepare("SELECT send_status, licensed_text FROM speech_outbox WHERE outbox_id = ?").get(outbox.outboxId)).toMatchObject({ send_status: "suppressed", licensed_text: "[redacted]" });
      expect(retrieveCandidates(db, { conversationId: "thread-1", request: { triggerTerms: ["HY3"], workingContextTopics: [], assertionKeys: ["memory:hy3"], includeLogSearch: true } }).hits).toEqual([]);
    } finally {
      db.close();
    }
  });
});
