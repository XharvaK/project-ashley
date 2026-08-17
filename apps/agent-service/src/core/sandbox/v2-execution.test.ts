import { describe, it, expect } from "vitest";
import {
  executeProjectInspectionV2,
  executeReactiveSandboxTaskV2,
} from "./v2-execution.js";
import {
  loadOperatorProjectReadRegistry,
  listApprovedReadProjectIds,
  canOfferProjectInspection,
  V2ProjectReadRegistry,
} from "./project-registry.js";
import {
  formatSandboxV2LicenseAudit,
  type SandboxV2LicenseAuditRecord,
} from "./v2-license-audit.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import {
  currentReleaseId,
  currentContractId,
  currentBuildIdentity,
  capabilityNames,
} from "../rollout/capabilities.js";
import type {
  SandboxV2Request,
  SandboxV2Result,
} from "@composer-assistant/sandbox-v2";

describe("Sandbox V2 Execution Adapter & Operator Registry", () => {
  describe("Operator Project Registry & Offer Gating", () => {
    it("fails closed when unconfigured or non-existent", () => {
      const registry = loadOperatorProjectReadRegistry("/non/existent/path.json");
      expect(registry.list()).toHaveLength(0);
      const res = registry.resolveReadRoot("project-ashley");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("unknown_project");
      }
    });

    it("loads valid registry and returns only safe string IDs in listApprovedReadProjectIds", () => {
      const tmp = mkdtempSync(join(tmpdir(), "v2-reg-test-"));
      const configPath = join(tmp, "registry.json");
      writeFileSync(
        configPath,
        JSON.stringify([
          {
            projectId: "project-ashley",
            canonicalRoot: "/home/xarvak/project-ashley",
            displayName: "Ashley",
            enabled: true,
            readAllowed: true,
            candidateWorkspaceAllowed: false,
            engineeringAllowed: false,
          },
          {
            projectId: "disabled-project",
            canonicalRoot: "/home/xarvak/disabled-project",
            displayName: "Disabled",
            enabled: false,
            readAllowed: true,
            candidateWorkspaceAllowed: false,
            engineeringAllowed: false,
          },
          {
            projectId: "no-read-project",
            canonicalRoot: "/home/xarvak/no-read-project",
            displayName: "No Read",
            enabled: true,
            readAllowed: false,
            candidateWorkspaceAllowed: false,
            engineeringAllowed: false,
          },
        ]),
      );

      try {
        const registry = loadOperatorProjectReadRegistry(configPath);
        expect(registry.list()).toHaveLength(3);

        const approved = listApprovedReadProjectIds(registry);
        expect(approved).toEqual(["project-ashley"]);
        // Ensure no host paths leaked
        expect(approved.some((id) => id.includes("/") || id.includes("\\"))).toBe(false);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("evaluates canOfferProjectInspection across capability, lifecycle, substrate, and registry", () => {
      const path = join(tmpdir(), `ashley-offer-gate-${Date.now()}.db`);
      const db = openNuclearDb(new DatabaseSync(path));
      const registry = new V2ProjectReadRegistry([
        {
          projectId: "project-ashley",
          canonicalRoot: "/home/xarvak/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: false,
          engineeringAllowed: false,
        },
      ]);

      try {
        // Default capability state is 'observe' -> cannot offer
        expect(
          canOfferProjectInspection(db, {
            registry,
            lifecycleEnabled: true,
            substrateAvailable: true,
          }),
        ).toBe(false);

        // Activate project_inspection and dependencies
        const relId = currentReleaseId();
        const now = new Date().toISOString();
        for (const cap of capabilityNames) {
          db.prepare(
            `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
             VALUES (?, ?, 'active', ?, ?, ?, 0)`,
          ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
        }

        // With capability active, lifecycle true, substrate true, registry non-empty -> returns true
        expect(
          canOfferProjectInspection(db, {
            registry,
            lifecycleEnabled: true,
            substrateAvailable: true,
            masterMode: "apply",
          }),
        ).toBe(true);

        // Lifecycle disabled -> false
        expect(
          canOfferProjectInspection(db, {
            registry,
            lifecycleEnabled: false,
            substrateAvailable: true,
          }),
        ).toBe(false);

        // Substrate unavailable -> false
        expect(
          canOfferProjectInspection(db, {
            registry,
            lifecycleEnabled: true,
            substrateAvailable: false,
          }),
        ).toBe(false);

        // Empty registry -> false
        expect(
          canOfferProjectInspection(db, {
            registry: new V2ProjectReadRegistry([]),
            lifecycleEnabled: true,
            substrateAvailable: true,
          }),
        ).toBe(false);
      } finally {
        db.close();
        try {
          rmSync(path, { force: true });
        } catch {}
      }
    });
  });

  describe("executeProjectInspectionV2", () => {
    it("fails immediately when deadlineAtMs is already exceeded", async () => {
      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "src/index.ts",
        },
        deadlineAtMs: Date.now() - 50,
      });

      expect(res.license.state).toBe("failed");
      expect(res.license.error).toBe("deadline_exceeded");
      expect(res.license.profile).toBe("project_investigation");
      expect(res.observation).toBeNull();
    });

    it("fails closed with project_inspection_gate_denied when capability is in observe mode", async () => {
      const path = join(tmpdir(), `ashley-cap-gate-${Date.now()}.db`);
      const db = openNuclearDb(new DatabaseSync(path));

      try {
        const res = await executeProjectInspectionV2({
          request: {
            operation: "project.read_file",
            projectId: "project-ashley",
            path: "src/index.ts",
          },
          db,
        });

        expect(res.license.state).toBe("none");
        expect(res.license.error).toBe("project_inspection_gate_denied");
        expect(res.observation).toBeNull();
      } finally {
        db.close();
        try {
          rmSync(path, { force: true });
        } catch {}
      }
    });

    it("returns state=none, error=sandbox_lifecycle_disabled when lifecycle is disabled", async () => {
      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "src/index.ts",
        },
        envOverrides: {
          sandboxEngineeringLifecycleEnabled: false,
        },
      });

      expect(res.license.state).toBe("none");
      expect(res.license.error).toBe("sandbox_lifecycle_disabled");
      expect(res.observation).toBeNull();
    });

    it("returns state=none, error=sandbox_unavailable when substrate is unavailable", async () => {
      const registry = new V2ProjectReadRegistry([
        {
          projectId: "project-ashley",
          canonicalRoot: "/home/xarvak/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: false,
          engineeringAllowed: false,
        },
      ]);

      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "src/index.ts",
        },
        registry,
        envOverrides: {
          sandboxAvailable: () => false,
          sandboxEngineeringLifecycleEnabled: true,
        },
      });

      expect(res.license.state).toBe("none");
      expect(res.license.profile).toBe("project_investigation");
      expect(res.license.error).toBe("sandbox_unavailable");
      expect(res.observation).toBeNull();
    });

    it("returns state=failed, error=invalid_result on malformed kernel read_file result", async () => {
      const mockResult: any = {
        outcome: "succeeded",
        operation: "project.read_file",
        executedAtMs: 123456789,
        result: {
          kind: "project.read_file",
          // missing contentBase64 and bytes
        },
      };

      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "src/index.ts",
        },
        dispatcher: {
          dispatch: async () => mockResult,
        } as any,
        envOverrides: {
          sandboxEngineeringLifecycleEnabled: true,
        },
      });

      expect(res.license.state).toBe("failed");
      expect(res.license.error).toBe("invalid_result");
      expect(res.observation).toBeNull();
    });

    it("executes project.read_file successfully via custom dispatcher/spawn seam", async () => {
      const mockResult: SandboxV2Result = {
        outcome: "succeeded",
        operation: "project.read_file",
        executedAtMs: 123456789,
        result: {
          kind: "project.read_file",
          path: "src/index.ts",
          contentBase64: Buffer.from("console.log('hello world');").toString("base64"),
          bytes: 27,
          sha256: "abc123hash",
          truncated: false,
        },
      };

      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "src/index.ts",
        },
        dispatcher: {
          dispatch: async (req: SandboxV2Request) => mockResult,
        } as any,
        envOverrides: {
          sandboxEngineeringLifecycleEnabled: true,
        },
      });

      expect(res.license.state).toBe("succeeded");
      expect(res.license.profile).toBe("project_investigation");
      expect(res.license.error).toBeUndefined();
      expect(res.observation).toEqual({
        projectId: "project-ashley",
        operation: "project.read_file",
        path: "src/index.ts",
        verified: true,
        truncated: false,
        executedAtMs: 123456789,
        contentUtf8: "console.log('hello world');",
        bytes: 27,
        sha256: "abc123hash",
      });
    });

    it("executes project.list_directory successfully with truncation flag preserved", async () => {
      const mockResult: SandboxV2Result = {
        outcome: "succeeded",
        operation: "project.list_directory",
        executedAtMs: 123456789,
        result: {
          kind: "project.list_directory",
          path: "src",
          entries: [
            { name: "index.ts", kind: "file", size: 100 },
            { name: "utils", kind: "dir", size: 0 },
          ],
          truncated: true,
        },
      };

      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.list_directory",
          projectId: "project-ashley",
          path: "src",
        },
        dispatcher: {
          dispatch: async () => mockResult,
        } as any,
        envOverrides: {
          sandboxEngineeringLifecycleEnabled: true,
        },
      });

      expect(res.license.state).toBe("succeeded");
      expect(res.observation).toEqual({
        projectId: "project-ashley",
        operation: "project.list_directory",
        path: "src",
        verified: true,
        truncated: true,
        executedAtMs: 123456789,
        entries: [
          { name: "index.ts", kind: "file", size: 100 },
          { name: "utils", kind: "dir", size: 0 },
        ],
      });
    });

    it("executes project.search_text successfully with zero matches and truncation", async () => {
      const mockResult: SandboxV2Result = {
        outcome: "succeeded",
        operation: "project.search_text",
        executedAtMs: 123456789,
        result: {
          kind: "project.search_text",
          path: ".",
          matches: [],
          filesScanned: 50,
          truncated: true,
        },
      };

      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.search_text",
          projectId: "project-ashley",
          pattern: "nonexistent_pattern",
        },
        dispatcher: {
          dispatch: async () => mockResult,
        } as any,
        envOverrides: {
          sandboxEngineeringLifecycleEnabled: true,
        },
      });

      expect(res.license.state).toBe("succeeded");
      expect(res.observation).toEqual({
        projectId: "project-ashley",
        operation: "project.search_text",
        path: ".",
        pattern: "nonexistent_pattern",
        verified: true,
        truncated: true,
        executedAtMs: 123456789,
        matches: [],
        filesScanned: 50,
      });
    });

    it("handles typed failure outcome cleanly", async () => {
      const mockResult: SandboxV2Result = {
        outcome: "failed",
        operation: "project.read_file",
        executedAtMs: 123456789,
        error: "not_found",
      };

      const res = await executeProjectInspectionV2({
        request: {
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "missing.ts",
        },
        dispatcher: {
          dispatch: async () => mockResult,
        } as any,
        envOverrides: {
          sandboxEngineeringLifecycleEnabled: true,
        },
      });

      expect(res.license.state).toBe("failed");
      expect(res.license.error).toBe("not_found");
      expect(res.observation).toBeNull();
    });
  });

  describe("v2-license-audit for project_investigation", () => {
    it("formats project_investigation audit record with metadata only and zero code content", () => {
      const audit = formatSandboxV2LicenseAudit(
        {
          state: "succeeded",
          profile: "project_investigation",
          taskId: "v2-insp-12345",
          sourceMessageEntityUuid: "msg-uuid-1",
        },
        {
          projectId: "project-ashley",
          operation: "project.read_file",
          path: "apps/agent-service/src/index.ts",
          verified: true,
          truncated: false,
          executedAtMs: 12345,
          contentUtf8: "TOP_SECRET_CODE();",
          bytes: 18,
          sha256: "sha256-abc",
        },
      );

      expect(audit).not.toBeNull();
      expect(audit?.discriminator).toBe("ASHLEY_SANDBOX_V2_LICENSE");
      expect(audit?.profile).toBe("project_investigation");
      expect(audit?.verified).toBe(true);
      expect(audit?.inspection).toEqual({
        operation: "project.read_file",
        projectId: "project-ashley",
        targetPath: "apps/agent-service/src/index.ts",
        targetPattern: undefined,
        truncated: false,
        bytes: 18,
        filesScanned: undefined,
        matchCount: undefined,
        entryCount: undefined,
      });

      const serialized = JSON.stringify(audit);
      expect(serialized).not.toContain("TOP_SECRET_CODE");
    });
  });

  describe("M1 Preservation", () => {
    it("preserves M1 file.roundtrip execution path", async () => {
      const mockM1Executor = async () => ({
        version: 1 as const,
        kind: "file.roundtrip" as const,
        ok: true as const,
        checks: {
          roundtrip: true,
          deleted: true,
          absent: true,
          homeAbsent: true,
          runAbsent: true,
          hostSentinelAbsent: true,
          envClean: true,
          loopbackIsolated: true,
          externalIsolated: true,
          fdClean: true,
        },
      });

      const license = await executeReactiveSandboxTaskV2({
        executor: mockM1Executor,
      });

      expect(license.state).toBe("succeeded");
      expect(license.profile).toBe("sandbox_workspace_file_roundtrip");
      expect(license.effectEvidence).toBeDefined();
    });
  });
});
