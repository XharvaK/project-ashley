import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb, NUCLEAR_SUPPORTED_VERSION } from "../db.js";
import { openContinuityDb } from "./db.js";
import {
  DECLARED_CONTRACT_ID,
  LEGACY_V2_CONTRACT_ID,
} from "../attention/contract-material.js";
import { listCapabilityStatuses } from "../rollout/capabilities.js";
import { TARGETABLE_TABLES } from "./nuclear-targetable.js";
import { usableFetchMs } from "../perception/turn-budget.js";
import { classifyResearchIntent } from "../perception/research-intent.js";
import { buildInlineDataUri } from "../perception/ingest.js";

describe("wave06 migration", () => {
  it("migrates fresh db to v16 with v3 contract and perception tables", () => {
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
    expect(NUCLEAR_SUPPORTED_VERSION).toBe(18);
    const version = (
      nuclear.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    expect(version).toBe(18);
    const sidecarVersion = continuity
      .prepare(`SELECT nuclear_schema_version FROM lineage_state WHERE id = 1`)
      .get() as { nuclear_schema_version?: number };
    expect(sidecarVersion.nuclear_schema_version).toBe(18);
    for (const table of ["perception_artifacts", "conversational_reads"]) {
      expect(
        nuclear
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
          )
          .get(table),
      ).toBeTruthy();
    }
    const active = nuclear
      .prepare(
        `SELECT contract_id FROM capability_contracts WHERE active = 1 LIMIT 1`,
      )
      .get() as { contract_id?: string };
    expect(active.contract_id).toBe(DECLARED_CONTRACT_ID);
    nuclear.close();
    continuity.close();
  });

  it("preserves v2 contract row when activating v3", () => {
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
    const contracts = nuclear
      .prepare(
        `SELECT contract_id, active FROM capability_contracts ORDER BY contract_id`,
      )
      .all() as Array<{ contract_id?: string; active?: number }>;
    expect(
      contracts.some(
        (row) => row.contract_id === LEGACY_V2_CONTRACT_ID && row.active === 0,
      ),
    ).toBe(true);
    expect(
      contracts.some(
        (row) => row.contract_id === DECLARED_CONTRACT_ID && row.active === 1,
      ),
    ).toBe(true);
    const v3Rows = nuclear
      .prepare(
        `SELECT COUNT(*) AS c FROM capability_releases WHERE contract_id = ?`,
      )
      .get(DECLARED_CONTRACT_ID) as { c?: number };
    expect(Number(v3Rows.c ?? 0)).toBeGreaterThan(0);
    nuclear.close();
    continuity.close();
  });

  it("seeds v3-only capabilities observe", () => {
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
    for (const capability of [
      "vision",
      "attachment_text",
      "conversational_read",
      "web_search",
    ] as const) {
      const row = listCapabilityStatuses(nuclear, "apply").find(
        (item) => item.capability === capability,
      );
      expect(row).toMatchObject({
        capability,
        state: "observe",
        contractId: DECLARED_CONTRACT_ID,
      });
    }
    nuclear.close();
    continuity.close();
  });

  it("includes perception tables in targetable registry", () => {
    const names = TARGETABLE_TABLES.map((row) => row.table);
    expect(names).toContain("perception_artifacts");
    expect(names).toContain("conversational_reads");
  });
});

describe("wave06 perception helpers", () => {
  it("bounds fetch budget to thought remaining minus dispatch safety", () => {
    const thoughtDeadline = Date.now() + 5_000;
    const usable = usableFetchMs(thoughtDeadline);
    expect(usable).toBeLessThanOrEqual(5_000 - 300);
    expect(usable).toBeGreaterThan(0);
  });

  it("classifies explicit conversational read intent only", () => {
    expect(
      classifyResearchIntent("please read this page https://example.com/a"),
    ).toEqual({ intent: true, url: "https://example.com/a" });
    expect(classifyResearchIntent("https://example.com/a")).toEqual({
      intent: false,
    });
  });

  it("builds pinned data-uri inline image payload", () => {
    const uri = buildInlineDataUri(new Uint8Array([1, 2, 3]), "image/png");
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
  });
});
