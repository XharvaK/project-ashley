import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { installFakeClock, uninstallFakeClock } from "../qualification/fake-clock.js";
import { openNuclearDb } from "../db.js";
import { recordRecallLiveCutover } from "./cutover.js";
import { currentContractId } from "../rollout/capabilities.js";

describe("recordRecallLiveCutover", () => {
  beforeEach(() => installFakeClock());
  afterEach(() => uninstallFakeClock());

  it("calculates cutoff from MAX(id) of mem_messages atomically, records operator_cutover, and allows idempotent retry", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      db.exec(`
        INSERT INTO mem_threads (id, owner_id, status, channel, created_at, updated_at)
        VALUES ('thread1', 'doc', 'active', 'discord', '2026', '2026');
        INSERT INTO mem_messages (id, thread_id, owner_id, role, text, channel, created_at)
        VALUES (1, 'thread1', 'doc', 'user', 'msg1', 'discord', '2026'),
               (2, 'thread1', 'doc', 'user', 'msg2', 'discord', '2026');
      `);

      db.exec(`INSERT INTO capability_releases (capability, release_id, state, updated_at) VALUES ('recall', '${currentContractId()}', 'active', 'now')`);

      const res = recordRecallLiveCutover(db, "doc", { authorizedBy: "doc", masterMode: "observe" });
      expect(res.success).toBe(true);
      expect(res.status).toBe("cutover_recorded");
      expect(res.cutoffMessageId).toBe(2);

      const cutovers = db.prepare("SELECT * FROM recall_live_cutovers").all() as any[];
      expect(cutovers.length).toBe(1);
      expect(cutovers[0].cutoff_message_id).toBe(2);

      const events = db.prepare("SELECT * FROM capability_events WHERE kind = 'operator_cutover'").all();
      expect(events.length).toBe(1);

      db.prepare(
        `INSERT INTO mem_messages
           (thread_id, owner_id, role, text, channel, created_at)
         VALUES ('thread1', 'doc', 'user', 'post-cutover', 'discord', '2026')`,
      ).run();

      // Idempotent retry
      const res2 = recordRecallLiveCutover(db, "doc", { authorizedBy: "doc", masterMode: "observe" });
      expect(res2.success).toBe(true);
      expect(res2.status).toBe("already_cutover");
      expect(res2.cutoffMessageId).toBe(2);

      const events2 = db.prepare("SELECT * FROM capability_events WHERE kind = 'operator_cutover'").all();
      expect(events2.length).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rolls back cutover insertion if audit event fails", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      db.exec(`INSERT INTO capability_releases (capability, release_id, state, updated_at) VALUES ('recall', '${currentContractId()}', 'active', 'now')`);

      // Intentionally cause event insertion to fail by dropping the table
      db.exec("DROP TABLE capability_events");

      expect(() => recordRecallLiveCutover(db, "doc", { authorizedBy: "doc", masterMode: "observe" })).toThrow();

      const cutovers = db.prepare("SELECT * FROM recall_live_cutovers").all();
      expect(cutovers.length).toBe(0);
    } finally {
      db.close();
    }
  });

  it("requires a non-empty owner and does not create a cutover for an invalid owner", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      expect(() => recordRecallLiveCutover(db, " ", { authorizedBy: "doc", masterMode: "observe" }))
        .toThrow("cutover_requires_owner");
      expect(db.prepare("SELECT COUNT(*) AS c FROM recall_live_cutovers").get()).toEqual({ c: 0 });
    } finally {
      db.close();
    }
  });

  it("fails closed unless the current Recall release is active in observe mode", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      expect(recordRecallLiveCutover(db, "doc", {
        authorizedBy: "doc",
        masterMode: "observe",
      })).toMatchObject({ success: false, status: "not_active" });

      db.prepare(
        "UPDATE capability_releases SET state = 'active' WHERE capability = 'recall' AND release_id = ?",
      ).run(currentContractId());
      expect(recordRecallLiveCutover(db, "doc", {
        authorizedBy: "doc",
        masterMode: "apply",
      })).toMatchObject({ success: false, status: "not_observe" });

      db.prepare("UPDATE capability_contracts SET spec_hash = ? WHERE active = 1").run("mismatch");
      expect(recordRecallLiveCutover(db, "doc", {
        authorizedBy: "doc",
        masterMode: "observe",
      })).toMatchObject({ success: false, status: "contract_mismatch" });
      expect(db.prepare("SELECT COUNT(*) AS c FROM recall_live_cutovers").get()).toEqual({ c: 0 });
    } finally {
      db.close();
    }
  });

  it("does not commit a cutover when the audit insert is ignored", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const releaseId = currentContractId();
      db.exec(`INSERT INTO capability_releases (capability, release_id, state, updated_at) VALUES ('recall', '${releaseId}', 'active', 'now')`);
      db.prepare(
        `INSERT INTO capability_events
           (capability, release_id, kind, source_key, detail_json, occurred_at,
            contract_id, build_identity, model_epoch)
         VALUES ('recall', ?, 'operator_cutover', ?, '{}', ?, ?, 'test-build', 0)`,
      ).run(
        releaseId,
        `operator_cutover:doc:${releaseId}`,
        new Date().toISOString(),
        releaseId,
      );

      expect(() => recordRecallLiveCutover(db, "doc", { authorizedBy: "doc", masterMode: "observe" }))
        .toThrow(/audit/i);
      expect(db.prepare("SELECT COUNT(*) AS c FROM recall_live_cutovers").get()).toEqual({ c: 0 });
    } finally {
      db.close();
    }
  });
});
