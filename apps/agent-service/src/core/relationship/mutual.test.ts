import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import { defaultUnclassifiedConversational } from "../privacy/classification.js";
import {
  confirmMutualAshleyDelivery,
  confirmMutualDoc,
  proposeMutualCommitment,
  tryActivateMutualCommitment,
} from "./transitions.js";

describe("mutual commitments", () => {
  it("stays proposed until dual confirmation", () => {
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    const db = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
    const uuid = proposeMutualCommitment(db, {
      ownerId: "doc",
      text: "together we'll cook Sunday",
      sourceEntityType: "message",
      sourceEntityUuid: "msg-1",
      classification: defaultUnclassifiedConversational(),
    });
    expect(tryActivateMutualCommitment(db, uuid)).toBe(false);
    confirmMutualDoc(db, uuid, "doc-msg-1");
    expect(tryActivateMutualCommitment(db, uuid)).toBe(false);
    confirmMutualAshleyDelivery(db, uuid, "delivery-1");
    expect(tryActivateMutualCommitment(db, uuid)).toBe(true);
    const row = db
      .prepare(`SELECT status FROM mutual_commitments WHERE entity_uuid = ?`)
      .get(uuid) as { status?: string };
    expect(row.status).toBe("active");
    db.close();
    continuity.close();
  });
});
