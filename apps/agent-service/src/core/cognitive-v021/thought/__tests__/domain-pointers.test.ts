import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../../test-support.js";
import { buildDomainPointers } from "../domain-pointers.js";

describe("MAT-II domain pointers", () => {
  it("projects compact IDs, status, and timestamps without operational payloads", () => {
    const db = openTestSidecar();
    try {
      db.prepare(
        `INSERT INTO concerns
           (concern_id, conversation_id, statement, source_refs_json, dimensions_json, assertion_key, status, snapshot_hash, updated_cycle)
         VALUES (?, ?, ?, '[]', '{}', NULL, 'active', 'snapshot', ?)`
      ).run("concern-1", "conversation-1", "private concern text", "cycle-1");
      db.prepare(
        `INSERT INTO future_triggers
           (trigger_id, conversation_id, concern_id, due_at_ms, snapshot_hash, status, payload_json)
         VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`
      ).run("trigger-1", "conversation-1", "concern-1", 1234, "snapshot", JSON.stringify({ private: "payload" }));
      db.prepare(
        `INSERT INTO observation_subscriptions
           (subscription_id, conversation_id, spec_json, cancelled)
         VALUES (?, ?, ?, 0)`
      ).run("subscription-1", "conversation-1", JSON.stringify({ private: "spec" }));
      db.prepare(
        `INSERT INTO mind_occupancy
           (conversation_id, concern_id, status, priority, updated_cycle, updated_generation)
         VALUES (?, ?, 'active', 9, ?, 2)`
      ).run("conversation-1", "concern-1", "cycle-1");

      const section = buildDomainPointers(db, "conversation-1", "cycle-1");
      const serialized = JSON.stringify(section);

      expect(section.pointers).toEqual(expect.arrayContaining([
        expect.objectContaining({ domain: "concerns", entityIds: ["concern-1"], status: "active" }),
        expect.objectContaining({ domain: "future_triggers", entityIds: ["trigger-1"], status: "scheduled" }),
        expect.objectContaining({ domain: "observation_subscriptions", entityIds: ["subscription-1"] }),
      ]));
      expect(serialized).not.toContain("private concern text");
      expect(serialized).not.toContain("private");
      expect(serialized).not.toContain("payload_json");
      expect(section.pointers.some((pointer) => pointer.domain === "mind_occupancy")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("reports optional pointer-store failure as UNREACHABLE and continues", () => {
    const db = openTestSidecar();
    try {
      db.exec("DROP TABLE concerns");
      const section = buildDomainPointers(db, "conversation-1", "cycle-1");
      expect(section.pointers).toEqual(expect.arrayContaining([
        expect.objectContaining({ domain: "concerns", disposition: "UNREACHABLE" }),
      ]));
    } finally {
      db.close();
    }
  });

  it("fails closed on Mind Occupancy store failure without claiming an empty house", () => {
    const db = openTestSidecar();
    try {
      db.exec("DROP TABLE mind_occupancy");
      expect(() => buildDomainPointers(db, "conversation-1", "cycle-1"))
        .toThrowError("mind_occupancy_unreachable");
      expect(() => buildDomainPointers(db, "conversation-1", "cycle-1"))
        .not.toThrowError("empty_house");
    } finally {
      db.close();
    }
  });
});
