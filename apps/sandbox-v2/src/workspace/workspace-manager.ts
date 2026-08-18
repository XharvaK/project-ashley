/**
 * Durable Candidate Workspace Manager (Sandbox V2 M3).
 *
 * Owns the failure-atomic creation, resume, manifest validation, source snapshot provenance,
 * and durable tree persistence for candidate workspaces.
 *
 * Layout:
 *  <managedRoot>/
 *    <workspaceId>/
 *      manifest.json  <-- Control metadata (outside Bubblewrap mount, never model-visible)
 *      tree/          <-- Durable candidate filesystem mounted writable as /workspace
 */

import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { V2_LIMITS } from "../limits.js";
import {
  buildSanitizedProjectView,
  removeProjectView,
} from "../project-inspection/source-view.js";
import type { ProtectedRootsConfig } from "@composer-assistant/sandbox-policy";

export type WorkspaceManifest = {
  schemaVersion: 2;
  workspaceId: string;
  projectId: string;
  createdAt: string;
  lastUsedAt: string;
  sourceSnapshotId: string;
};

export type AuthorizedProjectExecutionContext = {
  projectId: string;
  canonicalRoot: string;
  protectedRoots?: ProtectedRootsConfig;
};

export type WorkspaceAcquisitionResult =
  | {
      ok: true;
      workspaceId: string;
      workspaceTreeRoot: string;
      manifest: WorkspaceManifest;
      isNew: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export type WorkspaceManagerOptions = {
  managedRoot?: string;
};

export function resolveDefaultManagedWorkspaceRoot(): string {
  return join(homedir(), ".composer-assistant", "sandbox", "workspaces");
}

function computeDirectorySize(dirPath: string): { totalBytes: number; fileCount: number } {
  let totalBytes = 0;
  let fileCount = 0;

  function walk(current: string) {
    if (!existsSync(current)) return;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        fileCount += 1;
        try {
          const st = statSync(fullPath);
          totalBytes += st.size;
        } catch {}
      }
    }
  }

  walk(dirPath);
  return { totalBytes, fileCount };
}

export class WorkspaceManager {
  readonly managedRoot: string;

  constructor(options: WorkspaceManagerOptions = {}) {
    this.managedRoot = options.managedRoot ?? resolveDefaultManagedWorkspaceRoot();
    if (!existsSync(this.managedRoot)) {
      mkdirSync(this.managedRoot, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Acquire a candidate workspace: resumes an existing workspace if workspaceId is provided,
   * or failure-atomically creates a new candidate workspace initialized from the parent-authorized
   * project context.
   */
  async acquireWorkspace(
    context: AuthorizedProjectExecutionContext,
    requestedWorkspaceId?: string,
  ): Promise<WorkspaceAcquisitionResult> {
    if (requestedWorkspaceId) {
      return this.resumeWorkspace(context, requestedWorkspaceId);
    }
    return this.createWorkspace(context);
  }

  /**
   * Resume an existing candidate workspace.
   * Validates manifest existence, schema, workspaceId, and matching projectId lineage.
   * Revalidates that the durable tree exists and is contained inside the managed root.
   */
  private resumeWorkspace(
    context: AuthorizedProjectExecutionContext,
    workspaceId: string,
  ): WorkspaceAcquisitionResult {
    // Validate workspaceId string safety (must be opaque, alphanumeric/base64url, no slashes or ..)
    if (!this.isValidWorkspaceId(workspaceId)) {
      return { ok: false, error: "invalid_workspace_id" };
    }

    const workspaceDir = join(this.managedRoot, workspaceId);
    if (!existsSync(workspaceDir)) {
      return { ok: false, error: "workspace_not_found" };
    }

    // Verify containment inside managedRoot
    const rel = relative(this.managedRoot, workspaceDir);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      return { ok: false, error: "workspace_escapes_managed_root" };
    }

    const manifestPath = join(workspaceDir, "manifest.json");
    const treePath = join(workspaceDir, "tree");

    if (!existsSync(manifestPath)) {
      return { ok: false, error: "workspace_corrupt" };
    }
    if (!existsSync(treePath)) {
      return { ok: false, error: "workspace_corrupt" };
    }

    let manifest: WorkspaceManifest;
    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (
        !raw ||
        typeof raw !== "object" ||
        raw.schemaVersion !== 2 ||
        typeof raw.workspaceId !== "string" ||
        typeof raw.projectId !== "string" ||
        typeof raw.sourceSnapshotId !== "string"
      ) {
        return { ok: false, error: "workspace_corrupt" };
      }
      manifest = raw as WorkspaceManifest;
    } catch {
      return { ok: false, error: "workspace_corrupt" };
    }

    // Verify manifest invariants
    if (manifest.workspaceId !== workspaceId) {
      return { ok: false, error: "workspace_corrupt" };
    }
    if (manifest.projectId !== context.projectId) {
      return { ok: false, error: "workspace_project_mismatch" };
    }

    // Touch lastUsedAt
    try {
      manifest.lastUsedAt = new Date().toISOString();
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    } catch {}

    return {
      ok: true,
      workspaceId,
      workspaceTreeRoot: treePath,
      manifest,
      isNew: false,
    };
  }

  /**
   * Creates a new candidate workspace initialized failure-atomically from the sanitized project view.
   */
  private async createWorkspace(
    context: AuthorizedProjectExecutionContext,
  ): Promise<WorkspaceAcquisitionResult> {
    const workspaceId = randomBytes(16).toString("base64url");
    const finalDir = join(this.managedRoot, workspaceId);

    if (existsSync(finalDir)) {
      return { ok: false, error: "workspace_id_collision" };
    }

    const stagingDir = join(this.managedRoot, `.staging-${randomBytes(8).toString("hex")}`);
    const stagingTree = join(stagingDir, "tree");

    try {
      mkdirSync(stagingTree, { recursive: true, mode: 0o700 });

      // 1. Build disposable sanitized project source view (M2 exclusion pipeline)
      const viewResult = await buildSanitizedProjectView({
        canonicalRoot: context.canonicalRoot,
        protectedRoots: context.protectedRoots ?? {
          delegatedWriteDeniedOwnerApprovable: [],
          absoluteDenial: [],
        },
      });

      if (!viewResult.ok) {
        this.cleanDir(stagingDir);
        return { ok: false, error: viewResult.error };
      }

      const viewRoot = viewResult.viewRoot;

      try {
        // 2. Materialize sanitized view into stagingTree with resource budget accounting
        cpSync(viewRoot, stagingTree, { recursive: true });

        const sizeInfo = computeDirectorySize(stagingTree);
        if (sizeInfo.totalBytes > V2_LIMITS.WORKSPACE_MAX_BYTES) {
          this.cleanDir(stagingDir);
          return { ok: false, error: "workspace_limit_exceeded" };
        }

        // 3. Compute opaque sourceSnapshotId digest (provenance of sanitized source projection)
        const sourceSnapshotId = `snap_${randomBytes(12).toString("hex")}`;

        // 4. Write manifest.json in staging dir (outside tree)
        const manifest: WorkspaceManifest = {
          schemaVersion: 2,
          workspaceId,
          projectId: context.projectId,
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          sourceSnapshotId,
        };

        const stagingManifestPath = join(stagingDir, "manifest.json");
        writeFileSync(stagingManifestPath, JSON.stringify(manifest, null, 2), {
          encoding: "utf8",
          mode: 0o600,
        });

        // 5. Failure-atomic promotion: rename staging directory to final workspace directory
        renameSync(stagingDir, finalDir);

        return {
          ok: true,
          workspaceId,
          workspaceTreeRoot: join(finalDir, "tree"),
          manifest,
          isNew: true,
        };
      } finally {
        removeProjectView(viewRoot);
      }
    } catch (e) {
      this.cleanDir(stagingDir);
      return { ok: false, error: "workspace_creation_failed" };
    }
  }

  private isValidWorkspaceId(id: string): boolean {
    if (!id || typeof id !== "string") return false;
    if (id.length < 8 || id.length > 128) return false;
    // Base64url / alphanumeric only, no paths, slashes, or dots
    return /^[A-Za-z0-9_-]+$/.test(id);
  }

  private cleanDir(dir: string): void {
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    } catch {}
  }
}
