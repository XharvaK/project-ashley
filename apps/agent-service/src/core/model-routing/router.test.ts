import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi, afterEach } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import { resolveRoute, quotaContractFor, routeForBucket } from "./router.js";
import { routeBinding } from "./registry.js";

const originalRps = env.mistralRequestsPerSecond;
const originalTpm = env.mistralTokensPerMinute;

afterEach(() => {
  env.mistralRequestsPerSecond = originalRps;
  env.mistralTokensPerMinute = originalTpm;
  vi.restoreAllMocks();
});

describe("model-routing router", () => {
  it("resolves expression and maintenance purposes to their routes", () => {
    expect(resolveRoute("expression").route).toBe("ashley_expression");
    expect(resolveRoute("maintenance").route).toBe("utility_bulk");
  });

  it("derives mistral bucket limits from env", () => {
    env.mistralRequestsPerSecond = 3;
    env.mistralTokensPerMinute = 12_345;
    const c = quotaContractFor("mistral:mistral-medium-latest");
    expect(c.rps).toBe(3);
    expect(c.tpm).toBe(12_345);
    expect(c.rpm).toBe(180);
    expect(c.tpd).toBe(12_345 * 60);
  });

  it("derives groq bucket limits from the contract table", () => {
    const c = quotaContractFor("groq:openai/gpt-oss-20b");
    expect(c).toMatchObject({ rps: 40, tpm: 8000 });
  });

  it("returns undefined for unknown buckets", () => {
    expect(routeForBucket("bogus:model")).toBeUndefined();
  });

  it("survives a full migrate to v18 with routing columns present", () => {
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    const db = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
    const cols = (
      db
        .prepare(`PRAGMA table_info(attention_requests)`)
        .all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(cols).toEqual(
      expect.arrayContaining(["provider_id", "route_alias", "quota_bucket"]),
    );
    expect(routeBinding("thought").provider).toBe("nim");
    expect(routeBinding("thought").configuredModelId).toBe("openai/gpt-oss-20b");
    db.close();
    continuity.close();
  });
});
