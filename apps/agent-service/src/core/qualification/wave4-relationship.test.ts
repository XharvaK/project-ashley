import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent, snapshotTable } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import { resolveEvidenceRefs } from "../agency/resolve-evidence.js";
import { relationshipCanInfluence, relationshipCanRecord } from "../relationship/influence.js";

/**
 * Phase 3 — relationship / identity governance (lighter than Track R).
 *
 * Pre-existing LIVE relationship rows are seeded identically in both fixtures
 * before any turn, with fixed entity_uuids so raw rows are directly comparable.
 * Shadow cognition must not create, modify or delete any of them, and evidence
 * materialization must resolve them identically on both sides.
 */

const UUID = {
  reminder: "11111111-1111-4111-8111-111111111111",
  mutual: "22222222-2222-4222-8222-222222222222",
  tension: "33333333-3333-4333-8333-333333333333",
  withdrawal: "44444444-4444-4444-8444-444444444444",
};

const RELATIONSHIP_TABLES = [
  "doc_reminders",
  "mutual_commitments",
  "relational_tensions",
  "withdrawal_records",
  "ashley_self_commitments",
  "scheduled_proactive_messages",
  "relationship_motivation_claims",
] as const;

function seedRelationship(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO doc_reminders
       (owner_id, entity_uuid, data_classification, text, status, due_at,
        source_entity_type, source_entity_uuid, evidence_json, text_hash,
        created_at, updated_at)
     VALUES (?, ?, 'ordinary', ?, 'pending', ?, 'message', 'wave4-src-reminder',
             NULL, 'wave4hash-reminder', ?, ?)`,
  ).run(
    "doc",
    UUID.reminder,
    "remind doc to bounce the dub techno stems",
    "2027-01-01T00:00:00.000Z",
    now,
    now,
  );
  db.prepare(
    `INSERT INTO mutual_commitments
       (owner_id, entity_uuid, data_classification, text, status,
        doc_confirmed_at, ashley_confirmed_at, doc_evidence_entity_uuid,
        ashley_delivery_entity_uuid, source_entity_type, source_entity_uuid,
        evidence_json, text_hash, created_at, updated_at)
     VALUES (?, ?, 'ordinary', ?, 'active', ?, ?, NULL, NULL, 'message',
             'wave4-src-mutual', NULL, 'wave4hash-mutual', ?, ?)`,
  ).run(
    "doc",
    UUID.mutual,
    "we listen back to the mix together on friday",
    now,
    now,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO relational_tensions
       (owner_id, entity_uuid, data_classification, text, status, repair_status,
        linked_withdrawal_entity_uuid, last_repair_decision_id,
        source_entity_type, source_entity_uuid, evidence_json, text_hash,
        created_at, updated_at)
     VALUES (?, ?, 'ordinary', ?, 'open', 'none', NULL, NULL, 'message',
             'wave4-src-tension', NULL, 'wave4hash-tension', ?, ?)`,
  ).run("doc", UUID.tension, "unfinished disagreement about pacing", now, now);
  db.prepare(
    `INSERT INTO withdrawal_records
       (owner_id, entity_uuid, data_classification, text, status, repair_status,
        initiator, scope, reason, expires_at, topic_hint, turn_consumed,
        linked_tension_entity_uuid, repair_attempt_count, source_entity_type,
        source_entity_uuid, evidence_json, text_hash, created_at, updated_at)
     VALUES (?, ?, 'ordinary', ?, 'lifted', 'none', 'ashley', 'topic',
             'needed distance', NULL, NULL, 0, NULL, 0, 'message',
             'wave4-src-withdrawal', NULL, 'wave4hash-withdrawal', ?, ?)`,
  ).run("doc", UUID.withdrawal, "stepped back from the pacing thread", now, now);
}

function relationshipSnapshot(db: DatabaseSync): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const table of RELATIONSHIP_TABLES) out[table] = snapshotTable(db, table);
  return out;
}

describe("wave4 Phase 3 — relationship rows are inert under shadow cognition", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("shadow cognition creates, modifies and deletes nothing relational", async () => {
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      seedRelationship(on.db);
      seedRelationship(off.db);
      const seeded = relationshipSnapshot(on.db);
      expect(relationshipSnapshot(off.db)).toEqual(seeded);

      const script = [
        "don't give me fake agreement just to be nice",
        "are we still good after that pacing argument?",
        "remember you said we'd listen back on friday",
      ];
      for (const message of script) {
        await on.turn(message);
        await on.pump();
        await on.quiesce();
        await off.turn(message);
      }

      // Relationship recording/influence never had authority in observe mode.
      expect(relationshipCanRecord(on.db, "observe")).toBe(false);
      expect(relationshipCanInfluence(on.db, "observe", "relational_initiative")).toBe(false);

      // No create / modify / delete, and both fixtures agree exactly.
      expect(relationshipSnapshot(on.db)).toEqual(seeded);
      expect(relationshipSnapshot(off.db)).toEqual(seeded);

      const refs = [
        { type: "doc_reminder" as const, id: UUID.reminder },
        { type: "mutual_commitment" as const, id: UUID.mutual },
        { type: "relational_tension" as const, id: UUID.tension },
        { type: "withdrawal" as const, id: UUID.withdrawal },
      ];
      const resolvedOn = resolveEvidenceRefs(on.db, "doc", refs);
      const resolvedOff = resolveEvidenceRefs(off.db, "doc", refs);
      expect(resolvedOn).toEqual(resolvedOff);
      expect(resolvedOn.map((line) => line.ref.type)).toEqual([
        "doc_reminder",
        "mutual_commitment",
        "relational_tension",
        "withdrawal",
      ]);
      expect(resolvedOn[0]!.text).toContain("bounce the dub techno stems");

      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
