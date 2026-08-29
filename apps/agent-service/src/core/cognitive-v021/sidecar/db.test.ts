import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { reservedProductionCognitiveSidecarDbPath } from "../../data-plane.js";
import { openCognitiveSidecarDb } from "./db.js";

function fakeDatabaseWithMainFile(file: string): DatabaseSync {
  return {
    prepare: () => ({
      all: () => [{ name: "main", file }],
    }),
  } as unknown as DatabaseSync;
}

describe("cognitive v0.2.1 sidecar database", () => {
  it("creates the complete v1 schema on an isolated in-memory database", () => {
    const db = openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
      dataPlane: { kind: "isolated" },
    });

    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(1);
    expect(
      (
        db
          .prepare(
            "SELECT schema_version, architecture_epoch, implementation_spec_version, thought_contract_version, authority_epoch FROM cognitive_sidecar_meta WHERE id = 1",
          )
          .get() as Record<string, unknown>
      ),
    ).toEqual({
      schema_version: 1,
      architecture_epoch: "v0.2.1",
      implementation_spec_version: "0.2.1.r5",
      thought_contract_version: 1,
      authority_epoch: 1,
    });

    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(tables).toHaveLength(23);
    expect(tables).toContain("speech_outbox");
    expect(tables).toContain("thought_attempt_counters");
    db.close();
  });

  it("rejects a reserved production file when the caller has an isolated plane", () => {
    expect(() =>
      openCognitiveSidecarDb(
        fakeDatabaseWithMainFile(reservedProductionCognitiveSidecarDbPath()),
        { dataPlane: { kind: "isolated" } },
      ),
    ).toThrow(/production_data_plane_required/);
  });

  it("is idempotent and keeps one meta singleton with mutable epoch updates", () => {
    const db = new DatabaseSync(":memory:");
    openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });
    openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });

    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM cognitive_sidecar_meta")
          .get() as { count: number }
      ).count,
    ).toBe(1);
    expect(() =>
      db
        .prepare(
          "INSERT INTO cognitive_sidecar_meta (id, schema_version, architecture_epoch, implementation_spec_version, thought_contract_version) VALUES (1, 1, 'v0.2.1', '0.2.1.r5', 1)",
        )
        .run(),
    ).toThrow();

    db.prepare(
      "UPDATE cognitive_sidecar_meta SET authority_epoch = ? WHERE id = 1",
    ).run(7);
    expect(
      (
        db
          .prepare(
            "SELECT authority_epoch FROM cognitive_sidecar_meta WHERE id = 1",
          )
          .get() as { authority_epoch: number }
      ).authority_epoch,
    ).toBe(7);
    db.close();
  });
});
