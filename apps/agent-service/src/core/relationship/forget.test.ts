import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import { forgetOwnerTopic, forgetOwnerTopicImmediate } from "../memory/forget.js";
import { upsertDocReminder } from "./store.js";

describe("relationship forget", () => {
  it("includes relationship rows in preview and redacts on apply", () => {
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    const db = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
    const uuid = upsertDocReminder(db, {
      ownerId: "doc",
      text: "Secret garden watering schedule",
      dueAt: null,
      sourceEntityType: "message",
      sourceEntityUuid: "msg-1",
      classification: "ordinary",
    });
    const preview = forgetOwnerTopic(db, "doc", "garden watering", false, {
      continuity,
    });
    expect(preview.preview.some((line) => line.includes("doc_reminder"))).toBe(
      true,
    );
    const applied = forgetOwnerTopicImmediate(
      db,
      "doc",
      "garden watering",
      continuity,
    );
    expect(applied.previewId).toBeTruthy();
    const row = db
      .prepare(`SELECT text, status FROM doc_reminders WHERE entity_uuid = ?`)
      .get(uuid) as { text?: string; status?: string };
    expect(row.text).toBe("[redacted]");
    expect(row.status).toBe("cancelled");
    db.close();
    continuity.close();
  });
});
