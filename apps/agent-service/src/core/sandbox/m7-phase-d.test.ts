import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { canonicalizePath } from "@composer-assistant/sandbox-policy";
import { V2ProjectReadRegistry } from "@composer-assistant/sandbox-v2";
import { openNuclearDb } from "../db.js";
import {
  capabilityCanInfluence,
  currentBuildIdentity,
  currentContractId,
  graduationPolicyFor,
} from "../rollout/capabilities.js";
import { canOfferPatchExport } from "./project-registry.js";
import { executePatchExportV2 } from "./patch-export-execution.js";
import { persistProposedChangeSet, persistQuarantinedChangeSet } from "./changeset-store.js";
import { getPatchExportRecord } from "./patch-export-store.js";
import { deriveOperationalTruth } from "./operational-truth.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import { parsePatchExportRequest } from "../agency/thought.js";
import type { CognitionPatchExportRequest } from "../types.js";

const HASH = "ab".repeat(32);
const CHANGESET_ID = "cs_" + "ab".repeat(16);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const canonical = canonicalizePath(realpathSync(dir));
  if (!canonical.ok) throw new Error("tmp_not_canonical");
  tempDirs.push(canonical.value);
  return canonical.value;
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project-ashley",
    canonicalRoot: "/home/xarvak/project-ashley",
    displayName: "Ashley",
    enabled: true,
    readAllowed: true,
    candidateWorkspaceAllowed: true,
    engineeringAllowed: false,
    verificationAllowed: true,
    allowedRecipeIds: ["typescript_fixture_compile_v1"],
    authorshipAllowed: true,
    operationAllowed: true,
    ...overrides,
  };
}

function activate(db: DatabaseSync, names: readonly string[]): void {
  const relId = currentContractId();
  const now = new Date().toISOString();
  for (const cap of names) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

const CHILD_CAPS = [
  "recall",
  "mind_state",
  "thought",
  "candidate_authorship",
  "bounded_operation",
  "patch_export",
] as const;

function exportRequest(
  overrides: Partial<CognitionPatchExportRequest> = {},
): CognitionPatchExportRequest {
  return {
    operation: "patch_export",
    projectId: "project-ashley",
    changesetId: CHANGESET_ID,
    ...overrides,
  };
}

function seedSealedChangeSet(
  db: DatabaseSync,
  artifactRef: string,
  patchSha256: string,
  extras: { statusOwner?: string; projectId?: string } = {},
): void {
  persistProposedChangeSet(db, {
    ownerId: extras.statusOwner ?? "doc",
    changesetId: CHANGESET_ID,
    projectId: extras.projectId ?? "project-ashley",
    workspaceId: "ws-m7-01ab",
    sourceSnapshotId: "snap_src",
    candidateSnapshotId: "snap_cand",
    candidateTreeHash: HASH,
    baseTreeHash: "cd".repeat(32),
    baseCommit: null,
    sourceCleanliness: "unknown",
    treeHashAlgorithm: "m4-provisional-tree-v0",
    objective: "seal an advisory candidate",
    rationale: "review copy only",
    riskClass: "low",
    evidenceRefs: [],
    verificationRecipeIds: [],
    changedPaths: [{ path: "src/a.ts", changeKind: "modified", beforeSha256: HASH, afterSha256: HASH }],
    linkedVerificationRefs: [],
    patchSha256,
    patchBytes: 32,
    artifactRef,
  });
}

describe("M7 Phase D patch_export authority + witness", () => {
  it("uses operator_cutover for patch_export", () => {
    expect(graduationPolicyFor("patch_export")).toEqual({
      kind: "operator_cutover",
      minEvalSeeds: 3,
      requiresQualification: true,
    });
  });

  it("observe/disabled capability refuses and does not copy", async () => {
    const destRoot = tmp("ashley-m7-obs-dst-");
    const sourceDir = tmp("ashley-m7-obs-src-");
    const artifactRef = `${sourceDir}/sealed.patch`;
    writeFileSync(artifactRef, "patch");
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const registry = new V2ProjectReadRegistry([
      entry({
        patchExportAllowed: true,
        exportDestinationCanonicalRoot: destRoot,
      }),
    ]);
    expect(
      canOfferPatchExport(db, {
        registry,
        masterMode: "apply",
        substrateAvailable: true,
        lifecycleEnabled: true,
      }),
    ).toBe(false);
    seedSealedChangeSet(db, artifactRef, createHash("sha256").update("patch").digest("hex"));
    const result = await executePatchExportV2({
      request: exportRequest(),
      ownerId: "doc",
      db,
      registry,
      masterMode: "apply",
      envOverrides: { sandboxEngineeringLifecycleEnabled: true, sandboxAvailable: () => true },
    });
    expect(result.license.error).toBe("patch_export_gate_denied");
    expect(getPatchExportRecord(db, result.license.taskId ?? "")).toBeNull();
    db.close();
  });

  it("unrelated capabilities do not grant M7", async () => {
    const destRoot = tmp("ashley-m7-unrel-dst-");
    const sourceDir = tmp("ashley-m7-unrel-src-");
    const artifactRef = `${sourceDir}/sealed.patch`;
    writeFileSync(artifactRef, "patch");
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, ["recall", "mind_state", "thought", "candidate_authorship", "bounded_operation"]);
    expect(capabilityCanInfluence(db, "patch_export", "apply")).toBe(false);
    const registry = new V2ProjectReadRegistry([
      entry({
        authorshipAllowed: true,
        operationAllowed: true,
        patchExportAllowed: true,
        exportDestinationCanonicalRoot: destRoot,
      }),
    ]);
    seedSealedChangeSet(db, artifactRef, createHash("sha256").update("patch").digest("hex"));
    const result = await executePatchExportV2({
      request: exportRequest(),
      ownerId: "doc",
      db,
      registry,
      masterMode: "apply",
      envOverrides: { sandboxEngineeringLifecycleEnabled: true, sandboxAvailable: () => true },
    });
    expect(result.license.error).toBe("patch_export_gate_denied");
    db.close();
  });

  it("M5/M6 grants without patchExportAllowed refuse", async () => {
    const destRoot = tmp("ashley-m7-grant-dst-");
    const sourceDir = tmp("ashley-m7-grant-src-");
    const artifactRef = `${sourceDir}/sealed.patch`;
    writeFileSync(artifactRef, "patch");
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([
      entry({
        authorshipAllowed: true,
        operationAllowed: true,
        engineeringAllowed: true,
        patchExportAllowed: false,
      }),
    ]);
    seedSealedChangeSet(db, artifactRef, createHash("sha256").update("patch").digest("hex"));
    const result = await executePatchExportV2({
      request: exportRequest(),
      ownerId: "doc",
      db,
      registry,
      masterMode: "apply",
      envOverrides: { sandboxEngineeringLifecycleEnabled: true, sandboxAvailable: () => true },
    });
    expect(result.license.error).toBe("patch_export_not_allowed");
    db.close();
  });

  it("copies a sealed artifact, witnesses the digest, and does not apply", async () => {
    const destRoot = tmp("ashley-m7-ok-dst-");
    const sourceDir = tmp("ashley-m7-ok-src-");
    const body = "diff --git a/src/a.ts b/src/a.ts\n";
    const artifactRef = `${sourceDir}/sealed.patch`;
    writeFileSync(artifactRef, body);
    const patchSha256 = createHash("sha256").update(body).digest("hex");
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([
      entry({
        patchExportAllowed: true,
        exportDestinationCanonicalRoot: destRoot,
      }),
    ]);
    seedSealedChangeSet(db, artifactRef, patchSha256);
    const result = await executePatchExportV2({
      request: exportRequest(),
      ownerId: "doc",
      db,
      registry,
      masterMode: "apply",
      envOverrides: { sandboxEngineeringLifecycleEnabled: true, sandboxAvailable: () => true },
    });
    expect(result.license.state).toBe("succeeded");
    expect(result.license.patchExportClaimEffect?.applied).toBe(false);
    expect(result.license.patchExportClaimEffect?.witnessedSha256).toBe(patchSha256);
    expect(result.license.executionTruth).toBe("effect_verified");
    const honesty = finalizeHonesty({
      text: "I applied the patch to Ashley.",
      readingLicensed: false,
      operationalLicense: result.license,
    });
    expect(honesty.text).toContain("copied sealed candidate change-set");
    expect(honesty.text).toContain("has not been applied");
    const truth = deriveOperationalTruth(result.license);
    expect(truth.state).toBe("verified_success");
    expect(truth.locked).toBe(true);
    const row = getPatchExportRecord(db, result.license.taskId ?? "");
    expect(row?.applied).toBe(0);
    expect(row?.liveUnwritten).toBe(1);
    expect(row?.gitUnwritten).toBe(1);
    db.close();
  });

  it("refuses quarantined or missing artifacts", async () => {
    const destRoot = tmp("ashley-m7-q-dst-");
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([
      entry({
        patchExportAllowed: true,
        exportDestinationCanonicalRoot: destRoot,
      }),
    ]);
    persistQuarantinedChangeSet(db, {
      ownerId: "doc",
      changesetId: CHANGESET_ID,
      projectId: "project-ashley",
      workspaceId: "ws-m7-01ab",
      sourceSnapshotId: "snap_src",
      objective: "x",
      rationale: "y",
      riskClass: "low",
      evidenceRefs: [],
      verificationRecipeIds: [],
      quarantineReason: "secret_detected",
    });
    const quarantined = await executePatchExportV2({
      request: exportRequest(),
      ownerId: "doc",
      db,
      registry,
      masterMode: "apply",
      envOverrides: { sandboxEngineeringLifecycleEnabled: true, sandboxAvailable: () => true },
    });
    expect(quarantined.license.error).toBe("changeset_not_exportable");
    const missing = await executePatchExportV2({
      request: exportRequest({ changesetId: "cs_" + "ff".repeat(16) }),
      ownerId: "doc",
      db,
      registry,
      masterMode: "apply",
      envOverrides: { sandboxEngineeringLifecycleEnabled: true, sandboxAvailable: () => true },
    });
    expect(missing.license.error).toBe("changeset_missing");
    db.close();
  });

  it("refuses a destination supplied by Thought", () => {
    const parsed = parsePatchExportRequest({
      operation: "patch_export",
      projectId: "project-ashley",
      changesetId: CHANGESET_ID,
      destinationRoot: "/tmp/evil",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe("destinationRoot");
    const apply = parsePatchExportRequest({
      operation: "patch_export",
      projectId: "project-ashley",
      changesetId: CHANGESET_ID,
      apply: true,
    });
    expect(apply.ok).toBe(false);
  });

  it("refuses unauthorized projects", async () => {
    const destRoot = tmp("ashley-m7-proj-dst-");
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([
      entry({
        patchExportAllowed: true,
        exportDestinationCanonicalRoot: destRoot,
      }),
    ]);
    const result = await executePatchExportV2({
      request: exportRequest({ projectId: "not-a-project" }),
      ownerId: "doc",
      db,
      registry,
      masterMode: "apply",
      envOverrides: { sandboxEngineeringLifecycleEnabled: true, sandboxAvailable: () => true },
    });
    expect(result.license.error).toBe("patch_export_not_allowed");
    db.close();
  });
});
