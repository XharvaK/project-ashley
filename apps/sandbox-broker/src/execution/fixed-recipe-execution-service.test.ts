/**
 * Fixed-recipe execution service tests (Sandbox Wave 4, Commit 9).
 *
 * Covers the full chain: delegated authorization, session binding,
 * capability verification, recipe readiness, limits, network isolation,
 * executable resolution, workspace revalidation, atomic reservation,
 * bounded spawn, finalization, and receipts — including all refusal
 * stages and the "nonzero exit is a documented typed outcome" contract.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256Hex } from "../index.js";
import {
  ChildProcessRunner,
  FixedRecipeExecutionService,
  LinuxUnshareNetworkIsolation,
  ScriptedProcessRunner,
} from "../index.js";
import type { BrokerExecutionAudit, FakeRunRequest, FakeRunResult } from "../index.js";
import type { SignedSandboxSessionCapability } from "../sessions/session-capability.js";
import { toCanonicalBrokerPath } from "../policy/path.js";
import type { ExecutionHarness } from "../test/fixtures/execution.js";
import {
  createActiveSession,
  createLiveDisposableWorkspace,
  makeExecutionHarness,
  makeExecutionRequest,
} from "../test/fixtures/execution.js";

class CountingProcessRunner extends ScriptedProcessRunner {
  calls: FakeRunRequest[] = [];
  override async run(request: FakeRunRequest): Promise<FakeRunResult> {
    this.calls.push(request);
    return super.run(request);
  }
}

function findGitExecutable(): string | null {
  const candidates: string[] = [];
  try {
    if (process.platform === "win32") {
      const out = execFileSync("where", ["git"], { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length > 0) candidates.push(trimmed);
      }
    } else {
      for (const candidate of ["/usr/bin/git", "/usr/local/bin/git"]) {
        if (existsSync(candidate)) candidates.push(candidate);
      }
    }
  } catch {
    // no git found
  }
  for (const candidate of candidates) {
    try {
      return realpathSync(candidate);
    } catch {
      // skip unusable candidate
    }
  }
  return null;
}

describe("fixed-recipe execution service", () => {
  describe("happy path", () => {
    it("1. executes a fixed git recipe end-to-end under a session capability", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      expect(active.ok).toBe(true);
      if (!active.ok) return;
      const useId = "use-happy-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: " M README.md\n",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, { recipeId: "git:status" }, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("succeeded");
      expect(result.receipt.recipeId).toBe("git:status");
      expect(result.receipt.readiness).toBe("execution_ready");
      expect(result.receipt.category).toBe("git");
      expect(result.receipt.terminalState).toEqual({ state: "succeeded", exitCode: 0 });
      expect(result.receipt.networkIsolation).toBe("enforced");
      expect(result.receipt.sessionUuid).toBe(active.session.session.sessionUuid);
      expect(result.receipt.capabilityUseId).toBe(useId);
      expect(result.receipt.stdoutHash).toBe(sha256Hex(" M README.md\n"));
      expect(result.receipt.stdoutBytes).toBe(" M README.md\n".length);
      expect(result.receipt.truncated).toBe(false);
      expect(result.receipt.effectiveLimits.wallMs).toBe(120_000);
      expect(result.receipt.receiptHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.audit.outcome).toBe("completed");
      expect(result.audit.stage).toBe("receipt");
    });

    it("2. finalizes the reservation as succeeded and never refunds", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-finalized-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      const use = harness.ledger.getCapabilityUse(useId);
      expect(use?.outcome).toBe("succeeded");
      const session = harness.sessionService.getSession(active.session.session.sessionUuid);
      expect(session?.toolExecutionsUsed).toBe(1);
      const events = harness.sessionService.listEvents(active.session.session.sessionUuid);
      const types = events.map((event) => event.eventType);
      expect(types).toContain("session_created");
      expect(types).toContain("session_activated");
      expect(types).toContain("capability_issued");
      expect(types).toContain("capability_verified");
      expect(types).toContain("tool_use_reserved");
    });

    it("3. emits a completed audit with receipt hash and no raw output", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-audit-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: "secret output",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      const executionAudits = harness.audits.filter(
        (record) => record.kind === "broker_fixed_recipe_execution",
      );
      expect(executionAudits.length).toBe(1);
      const audit = executionAudits[0]!;
      expect(audit.outcome).toBe("completed");
      expect(audit.errorCode).toBeNull();
      expect(audit.receiptHash).toBe(result.ok ? result.receipt.receiptHash : null);
      expect(audit.stdoutHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(audit)).not.toContain("secret output");
      const delegatedAudits = harness.audits.filter(
        (record) => record.kind === "broker_delegated_authorization",
      );
      expect(delegatedAudits.length).toBeGreaterThan(0);
      expect(delegatedAudits[0]!.outcome).toBe("authorized");
    });

    it("4. ignores envelope argv/cwd claims and executes the registry plan", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, { processRunner: counting });
      const useId = "use-argv-1";
      counting.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          { recipeId: "git:status", argv: ["sh", "-c", "echo pwned"], cwd: "/etc" },
          { capabilityUseId: useId },
        ),
      );
      expect(result.ok).toBe(true);
      expect(counting.calls.length).toBe(1);
      const run = counting.calls[0]!;
      const argv = run.argv.join(" ");
      expect(argv).toContain("--no-pager");
      expect(argv).toContain("color.ui=false");
      expect(argv).toContain("status");
      expect(argv).not.toContain("pwned");
      expect(run.cwd.replace(/\\/g, "/")).toBe(
        path.join(harness.roots.base, "source").replace(/\\/g, "/"),
      );
    });
  });

  describe("documented typed outcomes", () => {
    it("5. a nonzero exit is a documented failed outcome, not a security failure", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-nonzero-1";
      harness.runner.setScript(useId, {
        exitCode: 128,
        stdout: "fatal: not a git repository",
        stderr: "",
        truncated: false,
        terminalReason: "process_exit",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("failed");
      expect(result.receipt.terminalState).toEqual({
        state: "failed",
        exitCode: 128,
        terminalReason: "process_exit",
      });
      expect(harness.ledger.getCapabilityUse(useId)?.outcome).toBe("failed");
    });

    it("6. timeout terminates the run as failed and finalizes failed", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-timeout-1";
      harness.runner.setScript(useId, {
        exitCode: 1,
        stdout: "",
        stderr: "",
        truncated: false,
        terminalReason: "timeout",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("failed");
      if (result.receipt.terminalState.state !== "failed") {
        throw new Error("expected failed terminal state");
      }
      expect(result.receipt.terminalState.terminalReason).toBe("timeout");
      expect(harness.ledger.getCapabilityUse(useId)?.outcome).toBe("failed");
    });

    it("7. truncated output terminates the run as failed", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-truncated-1";
      harness.runner.setScript(useId, {
        exitCode: 1,
        stdout: "x".repeat(10_000),
        stderr: "",
        truncated: true,
        terminalReason: "truncated",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("failed");
      expect(result.receipt.truncated).toBe(true);
    });

    it("8. spawn errors terminate the run as failed", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-spawn-error-1";
      harness.runner.setScript(useId, {
        exitCode: 1,
        stdout: "",
        stderr: "ENOENT",
        truncated: false,
        terminalReason: "spawn_error",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("failed");
      if (result.receipt.terminalState.state !== "failed") {
        throw new Error("expected failed terminal state");
      }
      expect(result.receipt.terminalState.terminalReason).toBe("spawn_error");
    });

    it("9. a throwing runner finalizes failed with a documented reason", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const throwing = {
        run: async () => {
          throw new Error("boom");
        },
      };
      const service = buildServiceWith(harness, { processRunner: throwing });
      const useId = "use-throw-1";
      const result = await service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("failed");
      if (result.receipt.terminalState.state !== "failed") {
        throw new Error("expected failed terminal state");
      }
      expect(result.receipt.terminalState.terminalReason).toContain("runner_error");
      expect(harness.ledger.getCapabilityUse(useId)?.outcome).toBe("failed");
    });

    it("10. a failed run still consumes the budget and a fresh use still works", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness, { maxToolExecutions: 2 });
      if (!active.ok) return;
      const useId = "use-fail-1";
      harness.runner.setScript(useId, {
        exitCode: 3,
        stdout: "",
        stderr: "",
        truncated: false,
        terminalReason: "process_exit",
      });
      const first = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.outcome).toBe("failed");
      const sessionAfter = harness.sessionService.getSession(active.session.session.sessionUuid);
      expect(sessionAfter?.toolExecutionsUsed).toBe(1);
      if (!sessionAfter) return;
      const useId2 = "use-fail-2";
      harness.runner.setScript(useId2, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const second = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          { session: sessionAfter, capability: active.session.capability },
          {},
          { capabilityUseId: useId2 },
        ),
      );
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.outcome).toBe("succeeded");
      expect(
        harness.sessionService.getSession(active.session.session.sessionUuid)?.toolExecutionsUsed,
      ).toBe(2);
    });

    it("11. output hashes are computed over redacted content", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-secret-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: "token sk-abcdef1234567890xyz leaked",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.receipt.stdoutHash).toBe(sha256Hex("token [redacted-credential] leaked"));
      expect(JSON.stringify(result.receipt)).not.toContain("sk-");
    });
  });

  describe("authorization refusals", () => {
    it("12. refuses a tampered envelope signature", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const request = makeExecutionRequest(harness, active.session);
      request.envelope.recipeId = "git:diff";
      const result = await harness.service.executeFixedRecipe(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("authorization");
      }
      expect(
        harness.audits.some(
          (record) =>
            record.kind === "broker_fixed_recipe_execution" && record.outcome === "refused",
        ),
      ).toBe(true);
    });

    it("13. refuses when no trusted delegated key is configured", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const service = buildServiceWith(harness, { trustedDelegatedKey: null });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("unknown_key");
    });

    it("14. refuses a mismatched owner identity", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, { ownerId: "intruder" }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("owner_mismatch");
    });

    it("15. refuses an expired envelope", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const nowMs = harness.nowMs();
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          { issuedAt: nowMs - 120_000, expiresAt: nowMs - 60_000 },
          {},
          nowMs,
        ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("authorization");
        expect(result.errorCode).toBe("expired");
      }
    });

    it("16. refuses a replayed nonce", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-replay-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const request = makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId });
      const first = await harness.service.executeFixedRecipe(request);
      expect(first.ok).toBe(true);
      const second = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          { nonce: request.envelope.nonce },
          { capabilityUseId: useId },
        ),
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.errorCode).toBe("replay");
    });

    it("17. refuses when the envelope path claim mismatches broker facts (symlink escape)", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const linkDir = path.join(harness.roots.base, "linkdir");
      const linkPath = path.join(linkDir, "linked");
      try {
        const { mkdirSync } = await import("node:fs");
        mkdirSync(linkDir, { recursive: true });
        symlinkSync(path.join(harness.roots.base, "source", "README.md"), linkPath);
      } catch {
        return;
      }
      const claimed = toCanonicalBrokerPath(linkPath);
      if (!claimed.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {
          canonicalTargetPaths: [{ path: claimed.value, intent: "read" }],
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("authorization");
        expect(result.errorCode).toBe("path_facts_mismatch");
      }
    });

    it("18. refuses request limits above the broker ceiling before anything else", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { limits: { wallMs: 500_000 } }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("request");
        expect(result.errorCode).toBe("limits_invalid");
      }
    });

    it("19. refuses an envelope without a signature", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const request = makeExecutionRequest(harness, active.session);
      (request.envelope as { signature?: string }).signature = undefined as never;
      const result = await harness.service.executeFixedRecipe(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("request");
        expect(result.errorCode).toBe("request_invalid");
      }
    });
  });

  describe("session and capability refusals", () => {
    it("20. refuses an unknown session", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          { sessionUuid: "ghost-session" },
          { sessionUuid: "ghost-session" },
        ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("unknown_session");
    });

    it("21. refuses a session that is not active", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const paused = harness.sessionService.transitionSession(
        active.session.session.sessionUuid,
        "awaiting_owner",
        { expectedRevision: active.session.session.revision },
      );
      expect(paused.ok).toBe(true);
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { expectedSessionRevision: 2 }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("session_not_active");
    });

    it("22. refuses an expired session", async () => {
      const harness = makeExecutionHarness();
      const nowMs = harness.nowMs();
      const created = harness.sessionService.createSession({
        ownerId: "owner-1",
        proposalId: "prop-1",
        role: "sandbox_operator_light",
        activePolicy: harness.activePolicy,
        allowedCapabilities: ["approved_project_read"],
        maxToolExecutions: 100,
        expiresAtMs: nowMs + 5_000,
        nowMs,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const activated = harness.sessionService.activateSession(created.value.sessionUuid, 1, nowMs);
      expect(activated.ok).toBe(true);
      if (!activated.ok) return;
      const capability = harness.sessionService.issueSessionCapability(
        created.value.sessionUuid,
        "approved_project_read",
        { ttlMs: 60_000, nowMs },
      );
      expect(capability.ok).toBe(true);
      if (!capability.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          { session: activated.value, capability: capability.value },
          {},
          {},
          nowMs + 60_000,
        ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("session_expired");
    });

    it("23. refuses a stale session revision", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { expectedSessionRevision: 99 }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("revision_mismatch");
    });

    it("24. refuses when the session policy hash mismatches the envelope", async () => {
      const harness = makeExecutionHarness();
      const foreignPolicy = { ...harness.activePolicy, policyHash: "f".repeat(64) };
      const nowMs = harness.nowMs();
      const created = harness.sessionService.createSession({
        ownerId: "owner-1",
        proposalId: "prop-1",
        role: "sandbox_operator_light",
        activePolicy: foreignPolicy,
        allowedCapabilities: ["approved_project_read"],
        maxToolExecutions: 100,
        expiresAtMs: nowMs + 3_600_000,
        nowMs,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const activated = harness.sessionService.activateSession(created.value.sessionUuid, 1, nowMs);
      expect(activated.ok).toBe(true);
      if (!activated.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, {
          session: activated.value,
          capability: makeForgedCapability(created.value.sessionUuid, nowMs),
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("session");
        expect(result.errorCode).toBe("session_binding_mismatch");
      }
    });

    it("25. refuses an expired capability token", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const nowMs = harness.nowMs();
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, {}, nowMs + 61_000),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("capability");
        expect(result.errorCode).toBe("expired");
      }
    });

    it("26. refuses a tampered capability artifact", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const request = makeExecutionRequest(harness, active.session);
      request.capability.payload = { ...request.capability.payload, maxToolExecutions: 999 };
      const result = await harness.service.executeFixedRecipe(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("capability");
        expect(result.errorCode).toBe("invalid_signature");
      }
    });

    it("27. refuses when the envelope binding disagrees with the capability", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness, {
        capabilityId: "candidate_workspace_create",
      });
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          {
            session: active.session.session,
            capability: active.session.capability,
          },
          { capabilityId: "approved_project_read" },
        ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("capability");
        expect(result.errorCode).toBe("capability_binding_mismatch");
      }
    });

    it("28. refuses an envelope issued before the capability window", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const nowMs = harness.nowMs();
      const capabilityIssuedAt = Date.parse(active.session.capability.payload.issuedAt);
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          { issuedAt: capabilityIssuedAt - 5_000 },
          {},
          nowMs,
        ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("capability");
        expect(result.errorCode).toBe("envelope_outside_capability_window");
      }
    });
  });

  describe("recipe readiness refusals", () => {
    it("29. refuses an unknown recipe id", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, { recipeId: "git:nonexistent" }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("recipe");
        expect(result.errorCode).toBe("recipe_disabled");
      }
    });

    it("30. refuses a planning-only recipe", async () => {
      const harness = makeExecutionHarness({ recipeIds: ["verify:repo-tsc"] });
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, { recipeId: "verify:repo-tsc" }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("recipe");
        expect(result.errorCode).toBe("recipe_planning_only");
      }
    });

    it("31. refuses a recipe the active policy does not list", async () => {
      const harness = makeExecutionHarness({ recipeIds: ["git:status"] });
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, { recipeId: "git:diff" }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("recipe");
        expect(result.errorCode).toBe("recipe_not_allowed_by_policy");
      }
    });
  });

  describe("network isolation", () => {
    it("32. refuses when the network isolation provider is unavailable", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      harness.network.mode = "unavailable";
      const result = await harness.service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("network");
        expect(result.errorCode).toBe("network_isolation_unavailable");
        expect(result.audit.networkIsolation).toBe("unavailable_refused");
      }
      expect(harness.network.prepareCalls).toBe(1);
      const session = harness.sessionService.getSession(active.session.session.sessionUuid);
      expect(session?.toolExecutionsUsed).toBe(0);
    });

    it("33. refuses when no provider is configured at all (fail closed)", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const service = new FixedRecipeExecutionService({
        sessionService: harness.sessionService,
        trustedDelegatedKey: harness.trustedDelegatedKey,
        activePolicy: harness.activePolicy,
        trustedOwnerId: "owner-1",
        trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
        reserveNonce: (nonce) => {
          if (harness.usedNonces.has(nonce)) return false;
          harness.usedNonces.add(nonce);
          return true;
        },
        rootConfig: harness.roots.rootConfig,
        processRunner: harness.runner,
        executableMappings: harness.executableMappings,
      });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("network_isolation_unavailable");
    });

    it("34. a refused execution never consumes a reservation", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      harness.network.mode = "unavailable";
      const result = await harness.service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      const session = harness.sessionService.getSession(active.session.session.sessionUuid);
      expect(session?.toolExecutionsUsed).toBe(0);
    });

    it("35. an isolation refusal never reaches the runner (zero spawn)", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      harness.network.mode = "unavailable";
      const service = buildServiceWith(harness, { processRunner: counting });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("network");
        expect(result.errorCode).toBe("network_isolation_unavailable");
      }
      expect(counting.calls).toHaveLength(0);
    });

    it("36. the runner executes exactly the isolation-prepared specification", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const useId = "use-coupled-1";
      counting.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const service = buildServiceWith(harness, {
        processRunner: counting,
        networkIsolation: new LinuxUnshareNetworkIsolation({
          processRunner: counting,
          platform: "linux",
          probeExecutable: () => ({ kind: "ok", resolvedPath: "/usr/bin/unshare" }),
          readSysctl: () => "1",
        }),
      });
      const result = await service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("succeeded");
      expect(result.receipt.networkIsolation).toBe("enforced");
      expect(counting.calls).toHaveLength(1);
      const argv = counting.calls[0]!.argv;
      expect(argv[0]).toBe("/usr/bin/unshare");
      expect(argv[1]).toBe("--user");
      expect(argv[2]).toBe("--map-root-user");
      expect(argv[3]).toBe("--net");
      expect(argv[4]).toBe("--");
      const recipeArgv = argv.slice(5);
      expect(recipeArgv[0]!).toBe(harness.gitFixture.replace(/\\/g, "/"));
      expect(recipeArgv.slice(1)).toEqual([
        "--no-pager",
        "-c",
        "color.ui=false",
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]);
      expect(counting.calls[0]!.cwd).toBeDefined();
      expect(counting.calls[0]!.env.HOME).toBeDefined();
      expect(counting.calls[0]!.env.PATH).toBe(process.env.PATH);
    });

    it("37. non-linux production selection fails closed before any spawn", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, {
        processRunner: counting,
        networkIsolation: new LinuxUnshareNetworkIsolation({
          processRunner: counting,
          platform: "win32",
          probeExecutable: () => ({ kind: "ok", resolvedPath: "/usr/bin/unshare" }),
          readSysctl: () => "1",
        }),
      });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("network");
        expect(result.errorCode).toBe("network_isolation_non_linux");
      }
      expect(counting.calls).toHaveLength(0);
    });

    it("38. malformed isolation configuration fails closed before any spawn", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, {
        processRunner: counting,
        networkIsolation: new LinuxUnshareNetworkIsolation({
          processRunner: counting,
          platform: "linux",
          unsharePath: "relative-unshare",
          probeExecutable: () => ({ kind: "ok", resolvedPath: "relative-unshare" }),
          readSysctl: () => "1",
        }),
      });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("network");
        expect(result.errorCode).toBe("network_isolation_unshare_path_absolute");
      }
      expect(counting.calls).toHaveLength(0);
    });
  });

  describe("executable resolution refusals", () => {
    it("35. refuses an unmapped executable", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const service = buildServiceWith(harness, { executableMappings: {} });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("executable");
        expect(result.errorCode).toBe("executable_unmapped");
      }
    });

    it("36. refuses a missing mapped file", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const service = buildServiceWith(harness, {
        executableMappings: { git: path.join(harness.binDir, "does-not-exist") },
      });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("executable_missing");
    });

    it("37. refuses an executable inside the writable disposable root", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const evil = path.join(harness.roots.base, "dest", "evil.bin");
      writeFileSync(evil, "x", "utf8");
      const service = buildServiceWith(harness, { executableMappings: { git: evil } });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("executable_in_forbidden_zone");
    });

    it("38. refuses a symlink executable", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const target = path.join(harness.binDir, "real-target");
      const link = path.join(harness.binDir, "linked");
      writeFileSync(target, "x", "utf8");
      try {
        symlinkSync(target, link);
      } catch {
        return;
      }
      const service = buildServiceWith(harness, { executableMappings: { git: link } });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("executable_symlink");
    });
  });

  describe("workspace-bound execution", () => {
    it("39. executes a write intent inside a revalidated disposable workspace", async () => {
      const harness = makeExecutionHarness({ recipeIds: ["git:status"] });
      const live = await createLiveDisposableWorkspace(harness);
      expect(live.ok).toBe(true);
      if (!live.ok) return;
      const active = createActiveSession(harness, {
        capabilityId: "candidate_workspace_read_write_delete",
        workspace: { workspaceId: live.workspaceId, workspaceManifestHash: live.manifestHash },
      });
      expect(active.ok).toBe(true);
      if (!active.ok) return;
      const useId = "use-ws-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          {
            capabilityId: "candidate_workspace_read_write_delete",
            recipeId: "git:status",
            canonicalTargetPaths: [{ path: `${live.treeRoot}/newfile.txt`, intent: "write" }],
          },
          { capabilityUseId: useId },
        ),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("succeeded");
      expect(result.receipt.capabilityUseId).toBe(useId);
    });

    it("40. refuses when the workspace revalidation fails (expired tree)", async () => {
      const harness = makeExecutionHarness({ recipeIds: ["git:status"] });
      const nowMs = harness.nowMs();
      const live = await createLiveDisposableWorkspace(harness, {}, nowMs, { ttlMs: 30_000 });
      expect(live.ok).toBe(true);
      if (!live.ok) return;
      const active = createActiveSession(harness, {
        capabilityId: "candidate_workspace_read_write_delete",
        workspace: { workspaceId: live.workspaceId, workspaceManifestHash: live.manifestHash },
      });
      expect(active.ok).toBe(true);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          {
            capabilityId: "candidate_workspace_read_write_delete",
            recipeId: "git:status",
            canonicalTargetPaths: [{ path: `${live.treeRoot}/newfile.txt`, intent: "write" }],
            issuedAt: nowMs + 1_000,
            expiresAt: nowMs + 60_000,
          },
          {},
          nowMs + 31_000,
        ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("workspace");
        expect(result.errorCode).toBe("workspace_revalidation_failed");
      }
    });

    it("41. refuses a write target outside the disposable tree", async () => {
      const harness = makeExecutionHarness({ recipeIds: ["git:status"] });
      const live = await createLiveDisposableWorkspace(harness);
      expect(live.ok).toBe(true);
      if (!live.ok) return;
      const active = createActiveSession(harness, {
        capabilityId: "candidate_workspace_read_write_delete",
        workspace: { workspaceId: live.workspaceId, workspaceManifestHash: live.manifestHash },
      });
      expect(active.ok).toBe(true);
      if (!active.ok) return;
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          {
            capabilityId: "candidate_workspace_read_write_delete",
            recipeId: "git:status",
            canonicalTargetPaths: [
              { path: `${harness.roots.destinationRoot}/outside.txt`, intent: "write" },
            ],
          },
        ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("workspace");
        expect(result.errorCode).toBe("write_outside_disposable_workspace");
      }
    });

    it("42. a workspace-bound session can still run read-only recipes in the live checkout", async () => {
      const harness = makeExecutionHarness({ recipeIds: ["git:status"] });
      const live = await createLiveDisposableWorkspace(harness);
      expect(live.ok).toBe(true);
      if (!live.ok) return;
      const active = createActiveSession(harness, {
        capabilityId: "candidate_workspace_read_write_delete",
        workspace: { workspaceId: live.workspaceId, workspaceManifestHash: live.manifestHash },
      });
      expect(active.ok).toBe(true);
      if (!active.ok) return;
      const useId = "use-ws-read-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: " M README.md",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          active.session,
          {
            capabilityId: "candidate_workspace_read_write_delete",
            recipeId: "git:status",
            canonicalTargetPaths: [{ path: harness.liveFile, intent: "read" }],
          },
          { capabilityUseId: useId },
        ),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("succeeded");
    });
  });

  describe("reservation contract", () => {
    it("43. refuses a duplicate capability use id without spawning again", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, { processRunner: counting });
      const useId = "use-dup-1";
      counting.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const first = await service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(first.ok).toBe(true);
      const fresh = harness.sessionService.getSession(active.session.session.sessionUuid);
      if (!fresh) return;
      const second = await service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          { session: fresh, capability: active.session.capability },
          {},
          { capabilityUseId: useId },
        ),
      );
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.stage).toBe("reservation");
        expect(second.errorCode).toBe("capability_use_replay");
      }
      expect(counting.calls.length).toBe(1);
    });

    it("44. refuses when the session budget is exhausted", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness, { maxToolExecutions: 1 });
      if (!active.ok) return;
      const useId = "use-budget-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const first = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(first.ok).toBe(true);
      const fresh = harness.sessionService.getSession(active.session.session.sessionUuid);
      if (!fresh) return;
      const second = await harness.service.executeFixedRecipe(
        makeExecutionRequest(
          harness,
          { session: fresh, capability: active.session.capability },
          {},
          { capabilityUseId: "use-budget-2" },
        ),
      );
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.stage).toBe("reservation");
        expect(second.errorCode).toBe("budget_exhausted");
      }
    });
  });

  describe("environment construction", () => {
    it("45. passes only allowlisted environment names with a synthetic HOME", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, { processRunner: counting });
      const useId = "use-env-1";
      counting.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      const env = counting.calls[0]!.env;
      const allowlist = new Set([
        "GIT_CONFIG_GLOBAL",
        "GIT_CONFIG_SYSTEM",
        "GIT_PAGER",
        "GIT_TERMINAL_PROMPT",
        "HOME",
        "PATH",
      ]);
      for (const key of Object.keys(env)) {
        expect(allowlist.has(key)).toBe(true);
      }
      expect(env.HOME).toBeDefined();
      expect(env.HOME).toContain("ashley-recipe-home");
      expect(env.HOME).not.toBe(process.env.HOME);
      expect(env.GIT_TERMINAL_PROMPT).toBe("0");
      expect(env.GIT_PAGER).toBe("cat");
      expect(env.PATH).toBe(process.env.PATH);
    });

    it("46. never passes secrets or non-allowlisted names", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, {
        processRunner: counting,
        environmentSource: () => ({
          PATH: "/broker/bin",
          MISTRAL_API_KEY: "sk-super-secret-1234567890",
          AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
        }),
      });
      const useId = "use-env-2";
      counting.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      const env = counting.calls[0]!.env;
      expect(env.MISTRAL_API_KEY).toBeUndefined();
      expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
      expect(env.PATH).toBe("/broker/bin");
      expect(Object.keys(env).every((key) => !key.includes("KEY"))).toBe(true);
    });

    it("47. passes through broker-owned allowlisted values", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, {
        processRunner: counting,
        environmentSource: () => ({ GIT_PAGER: "less" }),
      });
      const useId = "use-env-3";
      counting.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      expect(counting.calls[0]!.env.GIT_PAGER).toBe("less");
    });

    it("48. HOME is synthetic even when the source provides one", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const counting = new CountingProcessRunner();
      const service = buildServiceWith(harness, {
        processRunner: counting,
        environmentSource: () => ({ HOME: "/home/doc" }),
      });
      const useId = "use-env-4";
      counting.setScript(useId, {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      expect(counting.calls[0]!.env.HOME).not.toBe("/home/doc");
      expect(counting.calls[0]!.env.HOME).toContain("ashley-recipe-home");
    });
  });

  describe("receipts and audits", () => {
    it("49. receipts carry no raw output, environment, or secrets", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const useId = "use-receipt-1";
      harness.runner.setScript(useId, {
        exitCode: 0,
        stdout: "raw output content ghp_ABCDEFGHIJ1234567890",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      });
      const result = await harness.service.executeFixedRecipe(
        makeExecutionRequest(harness, active.session, {}, { capabilityUseId: useId }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const json = JSON.stringify(result.receipt);
      expect(json).not.toContain("raw output content");
      expect(json).not.toContain("ghp_");
      expect(json).not.toContain("HOME");
      expect(json).not.toContain("PATH");
    });

    it("50. refused executions emit a refused audit at the failing stage", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      harness.network.mode = "unavailable";
      const result = await harness.service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      const refused = harness.audits.filter(
        (record): record is BrokerExecutionAudit =>
          record.kind === "broker_fixed_recipe_execution" && record.outcome === "refused",
      );
      expect(refused.length).toBeGreaterThan(0);
      const audit = refused[refused.length - 1]!;
      expect(audit.stage).toBe("network");
      expect(audit.errorCode).toBe("network_isolation_unavailable");
      expect(audit.nonceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(audit.receiptHash).toBeNull();
    });

    it("51. refused executions never record a reservation", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      harness.network.mode = "unavailable";
      const result = await harness.service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(false);
      const session = harness.sessionService.getSession(active.session.session.sessionUuid);
      expect(session?.toolExecutionsUsed).toBe(0);
    });
  });

  describe("real process integration", () => {
    it("52. real spawn with a non-git executable yields a documented failed outcome", async () => {
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      const service = buildServiceWith(harness, {
        processRunner: new ChildProcessRunner(),
        executableMappings: { git: process.execPath },
      });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("failed");
      expect(result.receipt.terminalState.exitCode).not.toBe(0);
      expect(
        harness.ledger.getCapabilityUse(result.receipt.capabilityUseId)?.outcome,
      ).toBe("failed");
    });

    it("53. real git executes the fixed recipe and succeeds (requires git)", async () => {
      const git = findGitExecutable();
      if (git === null) {
        return;
      }
      const harness = makeExecutionHarness();
      const active = createActiveSession(harness);
      if (!active.ok) return;
      execFileSync(git, ["init", "-q"], { cwd: path.join(harness.roots.base, "source") });
      const service = buildServiceWith(harness, {
        processRunner: new ChildProcessRunner(),
        executableMappings: { git },
      });
      const result = await service.executeFixedRecipe(makeExecutionRequest(harness, active.session));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("succeeded");
      expect(result.receipt.stdoutHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.receipt.category).toBe("git");
    });
  });
});

function makeForgedCapability(
  sessionUuid: string,
  nowMs: number,
): SignedSandboxSessionCapability {
  return {
    payload: {
      capabilityVersion: 1,
      capabilityId: "approved_project_read",
      sessionUuid,
      ownerId: "owner-1",
      role: "sandbox_operator_light",
      sessionState: "active",
      policyId: "policy-execution-1",
      policyVersion: 3,
      policyHash: "f".repeat(64),
      allowedCapabilities: ["approved_project_read"],
      maxToolExecutions: 100,
      issuedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + 60_000).toISOString(),
      nonce: "forged-nonce",
    },
    signature: {
      algorithm: "Ed25519",
      keyId: "broker-session-capability-ed25519-v1",
      encoding: "base64url",
      value: "forged",
    },
  };
}

function buildServiceWith(
  harness: ExecutionHarness,
  overrides: Partial<ConstructorParameters<typeof FixedRecipeExecutionService>[0]>,
): FixedRecipeExecutionService {
  return new FixedRecipeExecutionService({
    sessionService: harness.sessionService,
    trustedDelegatedKey: harness.trustedDelegatedKey,
    activePolicy: harness.activePolicy,
    trustedOwnerId: "owner-1",
    trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
    reserveNonce: (nonce) => {
      if (harness.usedNonces.has(nonce)) return false;
      harness.usedNonces.add(nonce);
      return true;
    },
    rootConfig: harness.roots.rootConfig,
    processRunner: harness.runner,
    networkIsolation: harness.network,
    executableMappings: harness.executableMappings,
    environmentSource: () => ({ PATH: process.env.PATH ?? "/usr/bin:/bin" }),
    auditSink: (record) => harness.audits.push(record),
    nowMs: harness.nowMs,
    ...overrides,
  });
}
