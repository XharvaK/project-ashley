import { describe, expect, it } from "vitest";
import { admitCycle } from "../cycle/inbox.js";
import { openTestSidecar, makeThoughtDraft } from "../test-support.js";
import { publishSemanticTransaction } from "../settlement/publish.js";
import { tickAdmission } from "./admission.js";
import { admitOwnerSuppliedClaim } from "./admission.js";
import { appendRememberRequest } from "./nomination.js";
import type { DurableNomination } from "../types.js";

function nomination(overrides: Partial<DurableNomination> = {}): DurableNomination {
  return {
    nominationId: "nomination-1",
    cycleId: "cycle-1",
    generation: 1,
    assertionKey: "owner:subject",
    statement: "The owner prefers the first subject.",
    memoryKind: "owner_world_claim",
    dimensions: {
      source: "owner_utterance",
      status: "asserted",
      time: "current",
      reliability: "owner_supplied",
    },
    dataClassification: "never_public",
    supersedesAssertionKey: null,
    concernId: null,
    ...overrides,
  };
}

function publishNomination(
  db: Parameters<typeof tickAdmission>[0],
  input: DurableNomination,
  settlementId: string,
): void {
  const draft = makeThoughtDraft({
    cycleId: input.cycleId,
    generation: input.generation,
    speech: {
      mode: "none",
      mustSay: [],
      mustNot: [],
      surfaceDraft: null,
      acceptableRealizations: [],
      presentationDirectives: [],
    },
    durableNominations: [input],
  });
  publishSemanticTransaction(db, {
    ...draft,
    settlementId,
    speech: { ...draft.speech, finalLicensedText: null },
  });
}

describe("v0.2.1 fenced Memory admission", () => {
  it("admits queued nominations only when the admission worker runs", () => {
    const db = openTestSidecar();
    try {
      admitCycle(db, {
        cycleId: "cycle-1",
        conversationId: "thread-1",
        generation: 1,
        triggerKind: "owner_message",
        triggerRef: "owner-1",
        occupantId: "doc",
        nowMs: 1,
      });
      publishNomination(db, nomination(), "settlement-1");
      expect(db.prepare("SELECT COUNT(*) AS count FROM sidecar_memory_assertions").get()).toMatchObject({ count: 0 });

      const result = tickAdmission(db, { nowMs: 2 });
      expect(result.admitted).toBe(1);
      expect(db.prepare("SELECT statement, live, admitted_generation FROM sidecar_memory_assertions").get()).toMatchObject({
        statement: "The owner prefers the first subject.",
        live: 1,
        admitted_generation: 1,
      });
      expect(db.prepare("SELECT provenance, source FROM sidecar_memory_supports").get()).toMatchObject({ provenance: "native", source: "owner_utterance" });
      expect(tickAdmission(db, { nowMs: 3 }).admitted).toBe(0);
    } finally {
      db.close();
    }
  });

  it("skips an older nomination when a later published generation supersedes it", () => {
    const db = openTestSidecar();
    try {
      admitCycle(db, { cycleId: "cycle-1", conversationId: "thread-1", generation: 1, triggerKind: "owner_message", triggerRef: "one", occupantId: "doc", nowMs: 1 });
      publishNomination(db, nomination({ nominationId: "nomination-old", cycleId: "cycle-1", generation: 1, statement: "The old claim." }), "settlement-old");
      admitCycle(db, { cycleId: "cycle-2", conversationId: "thread-1", generation: 2, triggerKind: "owner_message", triggerRef: "two", occupantId: "doc", nowMs: 2 });
      publishNomination(db, nomination({ nominationId: "nomination-new", cycleId: "cycle-2", generation: 2, statement: "The corrected claim.", supersedesAssertionKey: "owner:subject" }), "settlement-new");

      const result = tickAdmission(db, { nowMs: 3 });
      expect(result.skippedSuperseded).toBe(1);
      expect(db.prepare("SELECT result FROM admission_log WHERE nomination_id = 'nomination-old' ORDER BY id DESC LIMIT 1").get()).toMatchObject({ result: "admission_skipped_superseded" });
      expect(db.prepare("SELECT assertion_key, statement, live, lineage_parent_key FROM sidecar_memory_assertions").all()).toEqual([
        expect.objectContaining({ assertion_key: "owner:subject", statement: "The corrected claim.", live: 1, lineage_parent_key: "owner:subject" }),
      ]);
    } finally {
      db.close();
    }
  });

  it("does not promote repeated inferred support to owner supplied", () => {
    const db = openTestSidecar();
    try {
      admitCycle(db, { cycleId: "cycle-1", conversationId: "thread-1", generation: 1, triggerKind: "owner_message", triggerRef: "one", occupantId: "doc", nowMs: 1 });
      const inferred = nomination({
        memoryKind: "ashley_interpretation",
        dimensions: { source: "ashley_interpretation", status: "interpreted", time: "current", reliability: "inferred" },
      });
      publishNomination(db, inferred, "settlement-1");
      admitCycle(db, { cycleId: "cycle-2", conversationId: "thread-1", generation: 2, triggerKind: "owner_message", triggerRef: "two", occupantId: "doc", nowMs: 2 });
      publishNomination(db, { ...inferred, nominationId: "nomination-2", cycleId: "cycle-2", generation: 2 }, "settlement-2");
      tickAdmission(db, { nowMs: 3 });
      expect(db.prepare("SELECT json_extract(dimensions_json, '$.reliability') AS reliability FROM sidecar_memory_assertions").get()).toMatchObject({ reliability: "inferred" });
      expect(db.prepare("SELECT COUNT(*) AS count FROM sidecar_memory_supports").get()).toMatchObject({ count: 2 });
    } finally {
      db.close();
    }
  });

  it("admits an explicit owner claim only after its published Thought nomination", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitCycle(db, { cycleId: "cycle-remember", conversationId: "thread-1", generation: 1, triggerKind: "owner_message", triggerRef: "remember", occupantId: "doc", nowMs: 1 });
      const request = appendRememberRequest(db, { conversationId: "thread-1", text: "Remember that I prefer careful systems.", discordMessageIds: ["remember-1"], nowMs: 2 });
      const remembered = nomination({
        nominationId: "nomination-remember",
        cycleId: cycle.cycleId,
        assertionKey: "owner:careful-systems",
        statement: "The owner prefers careful systems.",
        memoryKind: "owner_preference",
      });
      publishNomination(db, remembered, "settlement-remember");
      expect(admitOwnerSuppliedClaim(db, { settlementId: "settlement-remember", nominationId: remembered.nominationId, evidence: request.evidence, nowMs: 3 })).toMatchObject({ result: "admitted" });
      expect(db.prepare("SELECT memory_kind FROM sidecar_memory_assertions WHERE assertion_key = 'owner:careful-systems'").get()).toMatchObject({ memory_kind: "owner_preference" });
      const inbox = db.prepare("SELECT payload_json FROM inbox_events WHERE id = ?").get(request.inbox.id) as { payload_json: string };
      expect(inbox.payload_json).not.toContain("Remember that I prefer careful systems.");
    } finally {
      db.close();
    }
  });

  it("keeps credential-shaped remember content as an omitted, non-admitted reference", () => {
    const db = openTestSidecar();
    try {
      const request = appendRememberRequest(db, { conversationId: "thread-1", text: "Remember api-key: abcdefghijklmnopqrstuvwxyz123456", discordMessageIds: ["remember-secret"], nowMs: 1 });
      expect(request.evidence).toMatchObject({ text: "[credential omitted]", dataClassification: "secret", secretOmitted: true });
      expect(request.inbox.payload).toEqual(expect.objectContaining({ rememberRequested: true, evidenceRowId: request.evidence.rowId }));
      expect(JSON.stringify(request.inbox.payload)).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
      expect(db.prepare("SELECT COUNT(*) AS count FROM durable_nominations").get()).toMatchObject({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM sidecar_memory_assertions").get()).toMatchObject({ count: 0 });
    } finally {
      db.close();
    }
  });
});
