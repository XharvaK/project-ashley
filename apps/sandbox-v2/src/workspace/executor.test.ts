import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { executeWorkspaceExperiment, type WorkspaceExperimentSpawnInput } from "./executor.js";
import { WorkspaceManager } from "./workspace-manager.js";
import { V2ProjectReadRegistry } from "../registry.js";
import type { ProjectRootEntry } from "@composer-assistant/sandbox-policy";

const CANONICAL_ROOT = "/srv/projects/composer-assistant";

function entry(overrides: Partial<ProjectRootEntry> = {}): ProjectRootEntry {
  return {
    projectId: "composer-assistant",
    canonicalRoot: CANONICAL_ROOT,
    displayName: "Composer Assistant",
    enabled: true,
    readAllowed: true,
    candidateWorkspaceAllowed: true,
    engineeringAllowed: false,
    ...overrides,
  };
}

function goodChecks() {
  return {
    envClean: true,
    homeAbsent: true,
    runAbsent: true,
    hostSentinelAbsent: true,
    fdClean: true,
    workspaceWritable: true,
    usrReadOnly: true,
    loopbackConnectSucceeded: false,
    externalIsolated: true,
    externalError: "ENETUNREACH",
  };
}

function makeRunner(evidence: (input: WorkspaceExperimentSpawnInput) => unknown) {
  return async (input: WorkspaceExperimentSpawnInput) => {
    const stdout = JSON.stringify(evidence(input));
    return {
      exitCode: 0,
      stdout,
      stderr: "",
      timedOut: false,
      stdoutOverflow: false,
      stderrOverflow: false,
    };
  };
}

describe("Stage 2 — Workspace Experiment Executor", () => {
  const tempDirs: string[] = [];

  function createTestSetup(): {
    registry: V2ProjectReadRegistry;
    manager: WorkspaceManager;
    treeRoot: string;
  } {
    const root = mkdtempSync(join(tmpdir(), "ashley-exec-test-"));
    tempDirs.push(root);
    const treeRoot = join(root, "tree");
    mkdirSync(treeRoot, { recursive: true });
    writeFileSync(join(treeRoot, "README.md"), "# Mock", "utf8");

    const reg = new V2ProjectReadRegistry([
      entry({ canonicalRoot: CANONICAL_ROOT, candidateWorkspaceAllowed: true }),
      entry({ projectId: "disallowed-project", canonicalRoot: "/srv/projects/disallowed", candidateWorkspaceAllowed: false }),
    ]);

    const fakeManager = {
      managedRoot: root,
      acquireWorkspace: async (ctx: any, reqId?: string) => ({
        ok: true,
        workspaceId: reqId ?? "ws-test-1",
        workspaceTreeRoot: treeRoot,
        manifest: {
          schemaVersion: 2 as const,
          workspaceId: reqId ?? "ws-test-1",
          projectId: ctx.projectId,
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          sourceSnapshotId: "snap_mock_12345",
        },
        isNew: !reqId,
      }),
    } as unknown as WorkspaceManager;

    return { registry: reg, manager: fakeManager, treeRoot };
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    tempDirs.length = 0;
  });

  it("fails closed when candidateWorkspaceAllowed is false", async () => {
    const { registry, manager } = createTestSetup();
    const result = await executeWorkspaceExperiment(
      {
        version: 2,
        operation: "workspace.read_file",
        projectId: "disallowed-project",
        path: "README.md",
      },
      {
        registry,
        workspaceManager: manager,
        available: () => true,
      },
    );
    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error).toBe("workspace_not_allowed");
    }
  });

  it("fails closed with request_too_large when inbound request exceeds 128 KiB", async () => {
    const { registry, manager } = createTestSetup();
    const result = await executeWorkspaceExperiment(
      {
        version: 2,
        operation: "workspace.write_file",
        projectId: "composer-assistant",
        path: "large.txt",
        content: "x".repeat(130 * 1024), // 130 KiB
        mustNotExist: true,
      },
      {
        registry,
        workspaceManager: manager,
        available: () => true,
      },
    );
    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error).toBe("request_too_large");
    }
  });

  it("executes workspace.write_file and returns verified safe facts with provenance", async () => {
    const { registry, manager } = createTestSetup();
    const spawnRunner = makeRunner((input) => {
      const parsedReq = JSON.parse(input.requestJson);
      expect(parsedReq.operation).toBe("workspace.write_file");
      expect(parsedReq.path).toBe("witness.txt");
      expect(parsedReq.mustNotExist).toBe(true);
      return {
        version: 2,
        operation: "workspace.write_file",
        ok: true,
        result: {
          kind: "workspace.write_file",
          path: "witness.txt",
          bytesWritten: 12,
          contentHash: "a".repeat(64),
          readMatches: true,
          deleted: false,
          verifiedAbsent: false,
          completedAtMs: Date.now(),
        },
        checks: goodChecks(),
      };
    });

    const result = await executeWorkspaceExperiment(
      {
        version: 2,
        operation: "workspace.write_file",
        projectId: "composer-assistant",
        path: "witness.txt",
        content: "witness-data",
        mustNotExist: true,
      },
      {
        registry,
        workspaceManager: manager,
        available: () => true,
        spawnRunner,
      },
    );

    expect(result.outcome).toBe("succeeded");
    if (result.outcome === "succeeded") {
      expect(result.operation).toBe("workspace.write_file");
      expect(result.workspaceId).toBeTruthy();
      expect(result.sourceSnapshotId).toMatch(/^snap_/);
      expect(result.result).toMatchObject({
        kind: "workspace.write_file",
        path: "witness.txt",
        bytesWritten: 12,
      });
    }
  });

  it("executes workspace.search_text with default path .", async () => {
    const { registry, manager } = createTestSetup();
    const spawnRunner = makeRunner((input) => {
      const parsedReq = JSON.parse(input.requestJson);
      expect(parsedReq.operation).toBe("workspace.search_text");
      expect(parsedReq.path).toBeUndefined(); // or default handled by runner
      expect(parsedReq.pattern).toBe("search-term");
      return {
        version: 2,
        operation: "workspace.search_text",
        ok: true,
        result: {
          kind: "workspace.search_text",
          path: ".",
          matches: [{ path: "README.md", line: 1, text: "search-term matched" }],
          truncated: false,
          filesScanned: 1,
        },
        checks: goodChecks(),
      };
    });

    const result = await executeWorkspaceExperiment(
      {
        version: 2,
        operation: "workspace.search_text",
        projectId: "composer-assistant",
        pattern: "search-term",
      },
      {
        registry,
        workspaceManager: manager,
        available: () => true,
        spawnRunner,
      },
    );

    expect(result.outcome).toBe("succeeded");
    if (result.outcome === "succeeded") {
      expect(result.result).toMatchObject({
        kind: "workspace.search_text",
        matches: [{ path: "README.md", line: 1 }],
      });
    }
  });
});
