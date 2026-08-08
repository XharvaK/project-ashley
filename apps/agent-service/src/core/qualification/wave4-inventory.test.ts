import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { classifyTable, listTables, type Rule } from "./state-inventory.js";

/**
 * Phase 1 guard: every table that actually exists in a freshly opened nuclear
 * DB at schema v22 MUST be explicitly classified. This is the "enumerate every
 * table" requirement — a new table fails the harness by default instead of
 * being silently ignored.
 */
describe("wave4 state inventory enumeration", () => {
  let dbPath: string;
  let db: ReturnType<typeof openNuclearDb>;

  beforeEach(() => {
    dbPath = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    db = openNuclearDb(new DatabaseSync(dbPath));
  });
  afterEach(() => {
    try {
      db.close();
    } catch {
      /* noop */
    }
    rmSync(dbPath, { force: true });
  });

  it("classifies every real table in the nuclear DB", () => {
    const unclassified: string[] = [];
    for (const name of listTables(db)) {
      try {
        classifyTable(name);
      } catch {
        unclassified.push(name);
      }
    }
    expect(unclassified, `unclassified tables: ${unclassified.join(", ")}`).toEqual([]);
  });

  it("returns an explicit class for each known table", () => {
    const sample = [
      "internal_state",
      "episodes",
      "cognitive_jobs",
      "capability_events",
      "recall_live_cutovers",
      "forget_receipts",
    ];
    for (const name of sample) {
      const rule: Rule = classifyTable(name);
      expect(rule.cls).toBeDefined();
    }
  });

  it("keeps unknown tables unclassified by default", () => {
    expect(() => classifyTable("future_unclassified_table")).toThrow(
      /UNCLASSIFIED_TABLE/,
    );
  });
});
