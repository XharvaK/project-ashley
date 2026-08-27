import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fieldDayWindow } from "./field-day.js";
import { computeBundleId } from "./canonical-json.js";
import { observerError } from "./errors.js";
import { extractEvidence, extractIdentity, mergeEvidenceSurfaces } from "./evidence.js";
import { assertOutputRootSafe, assertExistingDirectory, assertPathContained, ensureDirectory } from "./path-safety.js";
import { REDACTION_PROFILE } from "./privacy.js";
import {
  assertNoAshleyControlCredentials,
  assertNoAshleyProcessControlCredentials,
} from "./security.js";
import { assembleTranscript } from "./transcript.js";
import { backupDatabase, openReadOnlyDatabase } from "./sqlite.js";
import type {
  ExportOptions,
  ExportResult,
  JsonObject,
  SurfaceReport,
} from "./types.js";

export type { ExportOptions } from "./types.js";

export const EXPORTER_VERSION = "observer-exporter@0.1.0" as const;
export const BUNDLE_SCHEMA_VERSION = 1 as const;

const BUNDLE_FILES = [
  "manifest.json",
  "identity.json",
  "transcript.json",
  "evidence.json",
] as const;

function checkoutSha(checkout: string): string | "UNKNOWN" {
  try {
    const value = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{40}$/iu.test(value) ? value : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function jsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readPreviousBundleIds(dayRoot: string, currentId: string): string[] {
  if (!existsSync(dayRoot) || !statSync(dayRoot).isDirectory()) return [];
  const ids: string[] = [];
  for (const entry of readdirSync(dayRoot).sort()) {
    if (entry === currentId) continue;
    const manifest = join(dayRoot, entry, "manifest.json");
    if (!existsSync(manifest)) continue;
    try {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { bundle_id?: unknown };
      if (typeof parsed.bundle_id === "string" && /^[0-9a-f]{64}$/iu.test(parsed.bundle_id)) {
        ids.push(parsed.bundle_id);
      }
    } catch {
      // A malformed unrelated directory does not become bundle lineage.
    }
  }
  return [...new Set(ids)].sort();
}

function addSurfaceFailure(surface: SurfaceReport, name: string, errorClass: string): void {
  surface.failed.push({ name, error_class: errorClass, state: "UNKNOWN" });
}

function combineSurfaceReports(
  identity: SurfaceReport,
  evidence: SurfaceReport,
  transcript: { jsonlAvailable: boolean },
): SurfaceReport {
  const combined = mergeEvidenceSurfaces(identity, evidence);
  if (transcript.jsonlAvailable) combined.used.push("jsonl_root");
  else combined.failed.push({ name: "jsonl_root", error_class: "source_missing", state: "UNKNOWN" });
  combined.used = [...new Set(combined.used)].sort();
  combined.failed.sort((a, b) => a.name.localeCompare(b.name));
  return combined;
}

function snapshotSource(
  sourcePath: string,
  snapshotPath: string,
  name: string,
  surface: SurfaceReport,
): Promise<boolean> {
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    addSurfaceFailure(surface, name, "source_missing");
    return Promise.resolve(false);
  }
  return backupDatabase(sourcePath, snapshotPath)
    .then(() => true)
    .catch(() => {
      addSurfaceFailure(surface, name, "sqlite_backup_failed");
      return false;
    });
}

function validateClosedAsOf(options: ExportOptions, end: Date): void {
  if (options.closedAsOf == null) return;
  const closedAsOf = Date.parse(options.closedAsOf);
  if (Number.isNaN(closedAsOf)) throw observerError("closed_as_of_invalid");
  if (closedAsOf < end.getTime()) throw observerError("field_day_not_closed");
}

export async function preflightExporter(options: ExportOptions): Promise<{
  ready: true;
  fieldDay: string;
  sourceFiles: { nuclear: boolean; continuity: boolean; jsonl: boolean };
}> {
  if (options.environment) assertNoAshleyControlCredentials(options.environment);
  else assertNoAshleyProcessControlCredentials();
  const window = fieldDayWindow(options.fieldDay);
  validateClosedAsOf(options, window.end);
  const dataRoot = assertExistingDirectory(options.dataRoot, "data_root_missing");
  assertOutputRootSafe(options.outRoot, dataRoot);
  return {
    ready: true,
    fieldDay: window.fieldDay,
    sourceFiles: {
      nuclear: existsSync(join(dataRoot, "conversations", "nuclear.db")),
      continuity: existsSync(join(dataRoot, "continuity.db")),
      jsonl: existsSync(join(dataRoot, "conversations", "sessions")),
    },
  };
}

export async function exportFieldObservation(options: ExportOptions): Promise<ExportResult> {
  if (options.environment) assertNoAshleyControlCredentials(options.environment);
  else assertNoAshleyProcessControlCredentials();
  const window = fieldDayWindow(options.fieldDay);
  validateClosedAsOf(options, window.end);
  const dataRoot = assertExistingDirectory(options.dataRoot, "data_root_missing");
  const outRoot = assertOutputRootSafe(options.outRoot, dataRoot);
  ensureDirectory(outRoot);
  const workRoot = ensureDirectory(assertPathContained(outRoot, join(outRoot, ".work")));
  const runRoot = mkdtempSync(join(workRoot, `${randomUUID()}-`));
  const snapshotStatus: SurfaceReport = { tables: {}, used: [], failed: [] };
  let nuclear = null as ReturnType<typeof openReadOnlyDatabase> | null;
  let continuity = null as ReturnType<typeof openReadOnlyDatabase> | null;
  try {
    const nuclearPath = join(dataRoot, "conversations", "nuclear.db");
    const continuityPath = join(dataRoot, "continuity.db");
    const nuclearSnapshot = join(runRoot, "nuclear.db");
    const continuitySnapshot = join(runRoot, "continuity.db");
    const nuclearReady = await snapshotSource(nuclearPath, nuclearSnapshot, "nuclear_snapshot", snapshotStatus);
    const continuityReady = await snapshotSource(continuityPath, continuitySnapshot, "continuity_snapshot", snapshotStatus);
    if (nuclearReady) nuclear = openReadOnlyDatabase(nuclearSnapshot);
    if (continuityReady) continuity = openReadOnlyDatabase(continuitySnapshot);

    const sha = checkoutSha(options.ashleyCheckout);
    const identityResult = extractIdentity({
      nuclear,
      continuity,
      checkoutSha: sha,
      fieldDay: window.fieldDay,
    });
    const evidenceResult = extractEvidence({ nuclear, continuity, window });
    const transcriptResult = assembleTranscript({
      sessionsRoot: join(dataRoot, "conversations", "sessions"),
      window,
      nuclear,
      identity: identityResult.identity,
    });
    const jsonlAvailable = existsSync(join(dataRoot, "conversations", "sessions"));
    const surfaces = combineSurfaceReports(identityResult.surfaces, evidenceResult.surfaces, { jsonlAvailable });
    for (const failure of snapshotStatus.failed) {
      if (!surfaces.failed.some((candidate) => candidate.name === failure.name && candidate.error_class === failure.error_class)) {
        surfaces.failed.push(failure);
      }
    }
    surfaces.used = [...new Set([...surfaces.used, ...snapshotStatus.used])].sort();
    surfaces.failed.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const semantic: Record<string, unknown> = {
      bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      exporter_version: EXPORTER_VERSION,
      redaction_profile: REDACTION_PROFILE,
      field_day: window.fieldDay,
      timezone: window.timezone,
      boundary: window.boundary,
      identity: identityResult.identity,
      transcript: transcriptResult.transcript,
      evidence: evidenceResult.evidence,
      coverage: transcriptResult.coverage,
      surfaces,
    };
    const bundleId = computeBundleId(semantic);
    const bundlesRoot = assertPathContained(outRoot, join(outRoot, "bundles"));
    const dayRoot = ensureDirectory(assertPathContained(bundlesRoot, join(bundlesRoot, window.fieldDay)));
    const bundleDir = assertPathContained(dayRoot, join(dayRoot, bundleId));
    const previousBundleIds = readPreviousBundleIds(dayRoot, bundleId);
    if (existsSync(bundleDir)) {
      const existingManifest = join(bundleDir, "manifest.json");
      if (!BUNDLE_FILES.every((file) => existsSync(join(bundleDir, file)))) throw observerError("bundle_collision");
      const parsed = JSON.parse(readFileSync(existingManifest, "utf8")) as { bundle_id?: unknown };
      if (parsed.bundle_id !== bundleId) throw observerError("bundle_collision");
      return {
        bundleId,
        bundleDir,
        files: [...BUNDLE_FILES],
        coverage: transcriptResult.coverage,
        identity: identityResult.identity,
      };
    }
    ensureDirectory(bundleDir);
    const manifest: JsonObject = {
      bundle_id: bundleId,
      bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      field_day: window.fieldDay,
      timezone: window.timezone,
      boundary: window.boundary,
      exporter_version: EXPORTER_VERSION,
      redaction_profile: REDACTION_PROFILE,
      identity: identityResult.identity as unknown as JsonObject,
      surfaces_used: surfaces.used,
      surfaces_failed: surfaces.failed as unknown as JsonObject[],
      coverage: transcriptResult.coverage,
      files: [...BUNDLE_FILES],
      extracted_at: (options.now ?? new Date()).toISOString(),
    };
    if (previousBundleIds.length > 0) {
      manifest.revision_of = previousBundleIds[previousBundleIds.length - 1];
      manifest.previous_bundle_ids = previousBundleIds;
      manifest.revision_reason = "late_or_changed_source_evidence";
    }
    jsonFile(join(bundleDir, "identity.json"), identityResult.identity);
    jsonFile(join(bundleDir, "transcript.json"), transcriptResult.transcript);
    jsonFile(join(bundleDir, "evidence.json"), evidenceResult.evidence);
    jsonFile(join(bundleDir, "manifest.json"), manifest);
    return {
      bundleId,
      bundleDir,
      files: [...BUNDLE_FILES],
      coverage: transcriptResult.coverage,
      identity: identityResult.identity,
    };
  } finally {
    nuclear?.close();
    continuity?.close();
    rmSync(runRoot, { recursive: true, force: true });
  }
}
