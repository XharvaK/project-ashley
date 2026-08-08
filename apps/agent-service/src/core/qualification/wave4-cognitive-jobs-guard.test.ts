import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 1 guard (plan §4 justification): `cognitive_jobs` volatile columns
 * (status/attempts/updated_at/last_error) are excluded from the live
 * projection under the claim that NO live-behavior reader consumes them — only
 * the executor, the prune routine, and two owner-only diagnostic endpoints
 * (`/nuclear/cognition`, `/nuclear/health`) read them. This test fails loudly
 * if a future production file starts reading `cognitive_jobs`, so the
 * classification cannot silently become wrong.
 */

const SRC = join(import.meta.dirname, "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      if (entry === "qualification") continue; // this dir is test-helpers only
      out.push(...walk(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const ALLOWED_PRODUCTION_READERS = new Set([
  join(SRC, "core", "cognition", "jobs.ts"), // executor + pruneCognitiveHistory
  join(SRC, "core", "runtime.ts"), // getCognitionOverview + getHealthSnapshot (owner-only diagnostics)
  join(SRC, "core", "db.ts"), // schema definition only
  join(SRC, "core", "continuity", "nuclear-targetable.ts"), // classification metadata only
  join(SRC, "core", "agency", "own-time-report.ts"), // join on cognitive_jobs BUT filters r.provenance='live' only; gated own_time_report (inactive pre-promotion)
]);

describe("cognitive_jobs reader guard", () => {
  it("is read only by executor / prune / owner diagnostics / schema", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      if (!text.includes("cognitive_jobs")) continue;
      if (!ALLOWED_PRODUCTION_READERS.has(file)) {
        offenders.push(file.replace(SRC, "<src>"));
      }
    }
    expect(offenders, `new cognitive_jobs reader(s): ${offenders.join(", ")}`).toEqual([]);
  });

  it("runtime reads are confined to the two owner-only diagnostics", () => {
    const lines = readFileSync(join(SRC, "core", "runtime.ts"), "utf8").split("\n");
    const violating: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i]!.includes("FROM cognitive_jobs")) continue;
      const window = lines.slice(Math.max(0, i - 200), i + 1).join("\n");
      if (!window.includes("getCognitionOverview") && !window.includes("getHealthSnapshot")) {
        violating.push(i + 1);
      }
    }
    expect(violating).toEqual([]);
  });
});
