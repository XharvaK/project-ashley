import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalize, computeBundleId } from "./canonical-json.js";
import {
  exportFieldObservation,
  type ExportOptions,
} from "./exporter.js";
import { createContinuityFixture, createNuclearFixture, git, readJson, removeTemp, tempDir, writeJsonLines } from "../../../test/observer-support.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) removeTemp(path);
});

function fixture(): { dataRoot: string; outRoot: string; sessionsRoot: string; checkout: string } {
  const root = tempDir("observer-export-");
  temporaryPaths.push(root);
  const dataRoot = join(root, "ashley-data");
  const outRoot = join(root, "field-bundles");
  const sessionsRoot = join(dataRoot, "conversations", "sessions");
  mkdirSync(join(dataRoot, "conversations"), { recursive: true });
  const nuclear = createNuclearFixture(join(dataRoot, "conversations", "nuclear.db"));
  nuclear.prepare("INSERT INTO mem_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    1,
    "thread-1",
    "owner-1",
    "user",
    "export me",
    "discord",
    "2026-08-26T01:10:00.000Z",
    "never_public",
  );
  nuclear.close();
  const continuity = createContinuityFixture(join(dataRoot, "continuity.db"));
  continuity.prepare("INSERT INTO lineage_state VALUES (?, ?, ?, ?, ?)").run(
    1,
    "lineage-1",
    41,
    "build-1",
    "2026-08-26T00:00:00.000Z",
  );
  continuity.close();
  writeJsonLines(sessionsRoot, "session-1", [
    { ts: "2026-08-26T01:10:00.000Z", role: "user", text: "export me" },
  ]);
  return {
    dataRoot,
    outRoot,
    sessionsRoot,
    checkout: git(process.cwd(), ["rev-parse", "--show-toplevel"]),
  };
}

function options(fixturePaths: ReturnType<typeof fixture>, now: string): ExportOptions {
  return {
    dataRoot: fixturePaths.dataRoot,
    outRoot: fixturePaths.outRoot,
    ashleyCheckout: fixturePaths.checkout,
    fieldDay: "2026-08-26",
    closedAsOf: "2026-08-27T02:00:00.000Z",
    now: new Date(now),
    environment: {},
  };
}

describe("deterministic observer export", () => {
  it("writes only extracted bundle files, cleans snapshots, and does not mutate source", async () => {
    const paths = fixture();
    const nuclearPath = join(paths.dataRoot, "conversations", "nuclear.db");
    const before = readFileSync(nuclearPath);
    const first = await exportFieldObservation(options(paths, "2026-08-28T00:00:00.000Z"));
    const second = await exportFieldObservation(options(paths, "2026-08-28T00:01:00.000Z"));
    expect(second.bundleId).toBe(first.bundleId);
    expect(first.files).toEqual(["manifest.json", "identity.json", "transcript.json", "evidence.json"]);
    expect(readFileSync(nuclearPath)).toEqual(before);
    expect(first.coverage).toBe("NORMAL");
    expect(readJson<{ bundle_id: string }>(join(first.bundleDir, "manifest.json")).bundle_id).toBe(first.bundleId);
    expect(first.bundleDir).not.toContain(`${join(paths.dataRoot, "conversations")}`);
    expect(requireNoDatabaseFiles(paths.outRoot)).toBe(true);
  });

  it("creates a new revision identity for changed evidence and retains the prior bundle", async () => {
    const paths = fixture();
    const first = await exportFieldObservation(options(paths, "2026-08-28T00:00:00.000Z"));
    appendFileSync(join(paths.sessionsRoot, "session-1", "messages.jsonl"), JSON.stringify({
      ts: "2026-08-26T01:11:00.000Z",
      role: "assistant",
      text: "new evidence",
    }) + "\n", "utf8");
    const second = await exportFieldObservation(options(paths, "2026-08-28T00:02:00.000Z"));
    expect(second.bundleId).not.toBe(first.bundleId);
    expect(readFileSync(join(first.bundleDir, "manifest.json"))).toBeTruthy();
    const manifest = readJson<{ revision_of?: string; previous_bundle_ids?: string[] }>(join(second.bundleDir, "manifest.json"));
    expect(manifest.revision_of).toBe(first.bundleId);
    expect(manifest.previous_bundle_ids).toContain(first.bundleId);
  });

  it("keeps volatile values out of the semantic hash and binds contract versions", () => {
    const base = {
      bundle_schema_version: 1,
      exporter_version: "observer-exporter@0.1.0",
      redaction_profile: "ashley-credential-omission-v1",
      field_day: "2026-08-26",
      timezone: "Europe/Istanbul",
      boundary: "04:00",
      identity: { checkoutSha: "a", runtimeBuildIdentity: "UNKNOWN" },
      transcript: { sessions: [] },
      evidence: { capability_events: [] },
      coverage: "DEGRADED_PARTIAL",
      surfaces: { failed: [] },
    };
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(computeBundleId(base)).toBe(computeBundleId({ ...base }));
    expect(computeBundleId({ ...base, exporter_version: "observer-exporter@0.2.0" })).not.toBe(computeBundleId(base));
    expect(computeBundleId({ ...base, redaction_profile: "other-profile" })).not.toBe(computeBundleId(base));
    expect(computeBundleId({ ...base, extracted_at: "2026-08-28T00:00:00.000Z" })).toBe(computeBundleId(base));
  });
});

function requireNoDatabaseFiles(root: string): boolean {
  const entries = readDirRecursive(root);
  return entries.every((path) => !path.endsWith(".db") && !path.endsWith("-wal") && !path.endsWith("-shm"));
}

function readDirRecursive(root: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const output: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) output.push(...readDirRecursive(path));
    else output.push(path);
  }
  return output;
}
