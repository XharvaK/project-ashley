/**
 * Engineering workstation handlers (Autonomous Engineering Workstation wave).
 *
 * These handlers sit behind the broker's `sandbox.*` dispatch surface. They
 * re-validate the model-proposed structured action, authorize it against the
 * active delegated policy (broker-final), then perform a bounded, networkless
 * operation using the already-implemented filesystem / git / diagnostic
 * primitives. They perform NO authorization of their own beyond delegating to
 * `authorizeDelegatedSandboxRequest`; every tool action is gated by the policy,
 * capability ledger, and root containment.
 */

import * as path from "node:path";
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import {
  validateEngineeringAction,
  type EngineeringAction,
} from "@composer-assistant/sandbox-policy";
import {
  classifyProjectRootAccess,
  type ProjectRootRegistry,
} from "@composer-assistant/sandbox-policy";
import { isCanonicalForm, isWithin } from "@composer-assistant/sandbox-policy";
import type { DelegatedApprovalEnvelope } from "../crypto/delegated-approval.js";
import {
  authorizeDelegatedSandboxRequest,
  type ActiveVerifiedSandboxPolicy,
  type BrokerDelegatedAuthorizationResult,
  type DelegatedTrustedKeyConfig,
} from "../policy/delegated-authorization.js";
import type { OwnerApprovalVerifierConfig } from "../crypto/owner-approval.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import type { BrokerAuditRecord } from "../execution/fixed-recipe-execution-service.js";
import type { NetworkIsolationProvider } from "../execution/network-isolation.js";
import { runBoundedCommand } from "../execution/bounded-process.js";
import type { ProcessRunner } from "../process/fake-runner.js";
import type { ExecutableMappings } from "./../execution/executable-resolver.js";
import type { FixedRecipe } from "../policy/recipe-registry.js";
import type { BrokerResponse, RequestContext } from "../protocol/frame.js";
import {
  boundedListDir,
  boundedReadFile,
  boundedSearchText,
  boundedWriteFile,
  boundedDeleteFile,
} from "./fs-ops.js";
import {
  runCandidateGit,
  patchTargetsWithinRoot,
  collectPatchTargets,
} from "./candidate-git.js";
import { runDiagnostic } from "./diagnostics.js";
import {
  decideAgentRestart,
  executeAgentRestart,
  getAgentRestartIncidentStore,
  type AgentRestartState,
} from "./agent-restart.js";

/** Broker-owned minimum cooldown between restart attempts for the same incident. */
const DEFAULT_RESTART_COOLDOWN_MS = 5 * 60_000;

export type EngineeringNonceStore = { reserve: (nonce: string) => boolean };

export type EngineeringHandlerContext = {
  ownerId: string;
  activePolicy: ActiveVerifiedSandboxPolicy;
  trustedDelegatedKey: DelegatedTrustedKeyConfig;
  ownerKeyId: string;
  trustedOwnerApprovalKeys: OwnerApprovalVerifierConfig;
  rootConfig: BrokerRootConfig;
  projectRegistry: ProjectRootRegistry;
  candidateRepoRoot: string;
  artifactRoot: string;
  workspaceRoot: string;
  /** Broker-owned fixed recipe registry (qualified, Bubblewrap-backed contracts). */
  recipes: ReadonlyMap<string, FixedRecipe>;
  processRunner: ProcessRunner;
  networkIsolation: NetworkIsolationProvider;
  executableMappings: ExecutableMappings;
  envAllowlist: Set<string>;
  /** Durable single-use nonce store (shared with the rest of the broker). */
  nonceStore: EngineeringNonceStore;
  auditSink: (record: BrokerAuditRecord) => void;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function boundedString(value: unknown, max: number, min = 1): string | null {
  return typeof value === "string" && value.length >= min && value.length <= max ? value : null;
}

function err(errorCode: string, message: string): BrokerResponse<unknown> {
  return { ok: false, errorCode, message };
}

export function workspaceTreeRoot(rootConfig: BrokerRootConfig, workspaceId: string): string | null {
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(workspaceId)) return null;
  const abs = path.resolve(rootConfig.workspaceRoot, workspaceId);
  if (!isWithin(rootConfig.workspaceRoot, abs)) return null;
  return abs;
}

async function authorizeEngineering(
  ctx: EngineeringHandlerContext,
  envelope: unknown,
  capability: SandboxCapabilityId,
  nowMs: number,
): Promise<{ ok: true; auth: BrokerDelegatedAuthorizationResult } | { ok: false; errorCode: string; message: string }> {
  if (!isPlainRecord(envelope) || typeof envelope.signature !== "string") {
    return { ok: false, errorCode: "request_invalid", message: "envelope with signature required" };
  }
  const auth = authorizeDelegatedSandboxRequest({
    envelope: envelope as unknown as DelegatedApprovalEnvelope,
    trustedDelegatedKey: ctx.trustedDelegatedKey,
    activePolicy: ctx.activePolicy,
    trustedOwnerId: ctx.ownerId,
    trustedOwnerPolicyKeyIds: new Set([ctx.ownerKeyId]),
    reserveNonce: (nonce) => ctx.nonceStore.reserve(nonce),
    nowMs,
    rootConfig: ctx.rootConfig,
    trustedOwnerApprovalKeys: ctx.trustedOwnerApprovalKeys,
    auditSink: ctx.auditSink,
  });
  if (!auth.ok) {
    return { ok: false, errorCode: auth.errorCode, message: auth.reason };
  }
  if (auth.decision !== "autonomous_safe") {
    return { ok: false, errorCode: "unsupported_decision", message: `requires autonomous_safe, got ${auth.decision}` };
  }
  if (auth.capability !== capability) {
    return { ok: false, errorCode: "capability_mismatch", message: `expected ${capability}, got ${auth.capability}` };
  }
  return { ok: true, auth };
}

type EngPayload = { envelope: unknown; nowMs: number; action: EngineeringAction };

export async function handleEngineeringAction(
  ctx: EngineeringHandlerContext,
  messageType: string,
  payload: unknown,
): Promise<BrokerResponse<unknown>> {
  if (messageType !== "sandbox.engineering.action") {
    return err("unknown_message", `unknown engineering message: ${messageType}`);
  }
  if (!isPlainRecord(payload)) {
    return err("request_invalid", "payload must be an object");
  }
  const eng = payload as EngPayload;
  if (!isPlainRecord(eng.action) || !isPlainRecord(eng.envelope)) {
    return err("request_invalid", "action and envelope required");
  }
  // Authorization time is broker-owned. The agent may attach an observational
  // `nowMs`, but it must never govern policy validity or envelope expiry.
  const nowMs = Date.now();
  const action = eng.action as EngineeringAction;
  const validated = validateEngineeringAction(action);
  if (!validated.ok) {
    return err(validated.errorCode, validated.reason);
  }
  const capability = validated.capability;
  if (capability === null) {
    return err("meta_action_not_executable", "meta actions carry no tool execution");
  }
  const auth = await authorizeEngineering(ctx, eng.envelope, capability, nowMs);
  if (!auth.ok) {
    return err(auth.errorCode, auth.message);
  }
  const f = action.fields;
  const bounded = {
    executableMappings: ctx.executableMappings,
    rootConfig: ctx.rootConfig,
    processRunner: ctx.processRunner,
    networkIsolation: ctx.networkIsolation,
    envAllowlist: ctx.envAllowlist,
  };

  const projectEntry = (id: unknown) => ctx.projectRegistry.entries.get(String(id));

  switch (action.type) {
    case "inspect_project_file": {
      const entry = projectEntry(f.projectId);
      if (!entry) return err("unknown_project", "unknown project");
      if (!entry.readAllowed) return err("read_not_allowed", "read not allowed for project");
      const read = await boundedReadFile(entry.canonicalRoot, String(f.relativePath ?? ""), {
        offset: typeof f.offset === "number" ? f.offset : undefined,
        length: typeof f.length === "number" ? f.length : undefined,
      });
      if (!read.ok) return err(read.errorCode, read.reason);
      return { ok: true, data: { content: read.content, truncated: read.truncated, bytes: read.bytes } };
    }
    case "list_project_directory": {
      const entry = projectEntry(f.projectId);
      if (!entry) return err("unknown_project", "unknown project");
      if (!entry.readAllowed) return err("read_not_allowed", "read not allowed for project");
      const list = await boundedListDir(entry.canonicalRoot, String(f.relativePath ?? ""));
      if (!list.ok) return err(list.errorCode, list.reason);
      return { ok: true, data: { entries: list.entries } };
    }
    case "search_project_text": {
      const entry = projectEntry(f.projectId);
      if (!entry) return err("unknown_project", "unknown project");
      if (!entry.readAllowed) return err("read_not_allowed", "read not allowed for project");
      const search = await boundedSearchText(entry.canonicalRoot, String(f.pattern), {
        relativePath: f.relativePath ? String(f.relativePath) : undefined,
        maxMatches: typeof f.maxMatches === "number" ? f.maxMatches : undefined,
      });
      if (!search.ok) return err(search.errorCode, search.reason);
      return { ok: true, data: { matches: search.matches, truncated: search.truncated } };
    }
    case "inspect_project_git_status":
    case "inspect_project_git_diff":
    case "inspect_project_git_log": {
      const entry = projectEntry(f.projectId);
      if (!entry) return err("unknown_project", "unknown project");
      if (!entry.readAllowed) return err("read_not_allowed", "read not allowed for project");
      const sub =
        action.type === "inspect_project_git_status"
          ? "status"
          : action.type === "inspect_project_git_diff"
            ? "diff"
            : "log";
      const args: string[] = [];
      if (sub === "log") args.push("-n", String(Math.min(Number(f.maxEntries ?? 20), 200)));
      if (sub === "diff") args.push("--no-color");
      const git = await runCandidateGit(bounded, entry.canonicalRoot, sub, args, { write: false });
      if (!git.ok) return err(git.errorCode, git.reason);
      return { ok: true, data: { stdout: git.result.stdout, stderr: git.result.stderr, exitCode: git.result.exitCode } };
    }
    case "list_workspace_directory": {
      const root = workspaceTreeRoot(ctx.rootConfig, String(f.workspaceId));
      if (!root) return err("workspace_invalid", "invalid workspace");
      const list = await boundedListDir(root, String(f.relativePath ?? ""));
      if (!list.ok) return err(list.errorCode, list.reason);
      return { ok: true, data: { entries: list.entries } };
    }
    case "read_workspace_file": {
      const root = workspaceTreeRoot(ctx.rootConfig, String(f.workspaceId));
      if (!root) return err("workspace_invalid", "invalid workspace");
      const read = await boundedReadFile(root, String(f.relativePath ?? ""), {
        offset: typeof f.offset === "number" ? f.offset : undefined,
        length: typeof f.length === "number" ? f.length : undefined,
      });
      if (!read.ok) return err(read.errorCode, read.reason);
      return { ok: true, data: { content: read.content, truncated: read.truncated, bytes: read.bytes } };
    }
    case "search_workspace_text": {
      const root = workspaceTreeRoot(ctx.rootConfig, String(f.workspaceId));
      if (!root) return err("workspace_invalid", "invalid workspace");
      const search = await boundedSearchText(root, String(f.pattern), {
        relativePath: f.relativePath ? String(f.relativePath) : undefined,
        maxMatches: typeof f.maxMatches === "number" ? f.maxMatches : undefined,
      });
      if (!search.ok) return err(search.errorCode, search.reason);
      return { ok: true, data: { matches: search.matches, truncated: search.truncated } };
    }
    case "write_workspace_file": {
      const root = workspaceTreeRoot(ctx.rootConfig, String(f.workspaceId));
      if (!root) return err("workspace_invalid", "invalid workspace");
      const write = await boundedWriteFile(root, String(f.relativePath ?? ""), String(f.contentBase64 ?? ""));
      if (!write.ok) return err(write.errorCode, write.reason);
      return { ok: true, data: { written: true } };
    }
    case "delete_workspace_file": {
      const root = workspaceTreeRoot(ctx.rootConfig, String(f.workspaceId));
      if (!root) return err("workspace_invalid", "invalid workspace");
      const del = await boundedDeleteFile(root, String(f.relativePath ?? ""));
      if (!del.ok) return err(del.errorCode, del.reason);
      return { ok: true, data: { deleted: true } };
    }
    case "apply_workspace_patch": {
      const root = workspaceTreeRoot(ctx.rootConfig, String(f.workspaceId));
      if (!root) return err("workspace_invalid", "invalid workspace");
      const patchText = String(f.patchBase64 ?? "");
      if (!patchTargetsWithinRoot(root, patchText)) {
        return err("patch_escape", "patch targets escape workspace root");
      }
      const git = await runCandidateGit(bounded, root, "apply", ["--whitespace=nowarn", "-"], { write: true });
      if (!git.ok) return err(git.errorCode, git.reason);
      return { ok: true, data: { applied: git.result.exitCode === 0, stderr: git.result.stderr } };
    }
    case "generate_candidate_patch": {
      const root = workspaceTreeRoot(ctx.rootConfig, String(f.workspaceId));
      if (!root) return err("workspace_invalid", "invalid workspace");
      const git = await runCandidateGit(bounded, root, "diff", ["--no-color"], { write: false });
      if (!git.ok) return err(git.errorCode, git.reason);
      const artifactId = `patch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        await fs.mkdir(ctx.artifactRoot, { recursive: true });
        await fs.writeFile(path.join(ctx.artifactRoot, artifactId), git.result.stdout);
      } catch {
        return err("artifact_write_failed", "could not persist patch");
      }
      return { ok: true, data: { artifactRef: artifactId, bytes: git.result.stdout.length } };
    }
    case "generate_report_artifact": {
      const content = String(f.contentBase64 ?? "");
      const title = boundedString(f.title, 256) ?? "report";
      const artifactId = `report-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        await fs.mkdir(ctx.artifactRoot, { recursive: true });
        await fs.writeFile(path.join(ctx.artifactRoot, artifactId), Buffer.from(content, "base64"));
      } catch {
        return err("artifact_write_failed", "could not persist report");
      }
      return { ok: true, data: { artifactRef: artifactId, title } };
    }
    case "request_workspace": {
      // The broker owns workspace creation. The id is generated (never
      // caller-selected) and the directory is created under the host-owned
      // workspace root, so the model cannot choose an absolute path. An
      // isolated git repository is initialized so patch/diff operations work
      // without ever touching the live project source.
      const workspaceId = `ws-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
      const abs = path.resolve(ctx.workspaceRoot, workspaceId);
      if (!isWithin(ctx.workspaceRoot, abs)) {
        return err("workspace_invalid", "workspace path escaped root");
      }
      try {
        await fs.mkdir(abs, { recursive: true });
      } catch {
        return err("workspace_create_failed", "could not create workspace");
      }
      const init = await runCandidateGit(bounded, abs, "init", ["-q"], { write: true });
      if (!init.ok) {
        return err("workspace_create_failed", init.reason);
      }
      return { ok: true, data: { workspaceId, treeRoot: abs, created: true } };
    }
    case "commit_candidate": {
      const repoRef = boundedString(f.repoRef, 256);
      if (!repoRef) return err("repo_ref_invalid", "repoRef required");
      const repoRoot = path.resolve(ctx.candidateRepoRoot, repoRef);
      if (!isCanonicalForm(repoRoot) || !isWithin(ctx.candidateRepoRoot, repoRoot)) {
        return err("repo_escape", "repoRef escapes candidate repo root");
      }
      const message = boundedString(f.message, 2048);
      if (!message) return err("message_invalid", "commit message required");
      const args: string[] = ["-m", message];
      const paths = Array.isArray(f.paths)
        ? (f.paths as unknown[]).map((p) => String(p)).filter((p) => /^[A-Za-z0-9._/\-]+$/.test(p))
        : [];
      if (paths.length > 0) args.push("--", ...paths);
      const git = await runCandidateGit(bounded, repoRoot, "commit", args, { write: true });
      if (!git.ok) return err(git.errorCode, git.reason);
      return { ok: true, data: { exitCode: git.result.exitCode, stdout: git.result.stdout } };
    }
    case "execute_recipe": {
      const recipeId = boundedString(f.recipeId, 256);
      if (!recipeId) return err("recipe_id_invalid", "recipeId required");
      const recipe = ctx.recipes.get(recipeId);
      if (!recipe || !recipe.supported) {
        return err("recipe_unavailable", `recipe not available: ${recipeId}`);
      }
      // Resolve the working directory from the recipe's cwd policy and the
      // action's explicit workspace/project binding (fail closed otherwise).
      let cwd: string | null = null;
      if (typeof f.workspaceId === "string" && f.workspaceId.length > 0) {
        cwd = workspaceTreeRoot(ctx.rootConfig, f.workspaceId);
      } else if (typeof f.projectId === "string" && f.projectId.length > 0) {
        const entry = ctx.projectRegistry.entries.get(f.projectId);
        cwd = entry && entry.enabled && entry.engineeringAllowed ? entry.canonicalRoot : null;
      } else if (recipe.cwdPolicy === "workspace") {
        cwd = ctx.workspaceRoot;
      } else {
        const allowed = [...ctx.projectRegistry.entries.values()].filter(
          (e) => e.enabled && e.engineeringAllowed,
        );
        cwd = allowed.length === 1 ? allowed[0]!.canonicalRoot : null;
      }
      if (!cwd) {
        return err("recipe_cwd_unresolved", "could not resolve recipe working directory");
      }
      const executableId = path.basename(recipe.executable);
      const limits = recipe.limits ?? {
        wallMs: 120_000,
        maxProcesses: 2,
        maxOutputBytes: 4_194_304,
      };
      const result = await runBoundedCommand(bounded, {
        executableId,
        argv: [...recipe.argv],
        cwd,
        limits,
      });
      if (!result.ok) return err(result.errorCode, result.reason);
      return {
        ok: true,
        data: {
          exitCode: result.result.exitCode,
          stdout: result.result.stdout,
          stderr: result.result.stderr,
          truncated: result.result.truncated,
        },
      };
    }
    case "run_diagnostic": {
      const diagnosticId = boundedString(f.diagnosticId, 128);
      if (!diagnosticId) return err("diagnostic_id_invalid", "diagnosticId required");
      const diag = await runDiagnostic(bounded, diagnosticId);
      if (!diag.ok) return err(diag.errorCode, diag.reason);
      return {
        ok: true,
        data: {
          stdout: diag.result.stdout,
          stderr: diag.result.stderr,
          exitCode: diag.result.exitCode,
          truncated: diag.result.truncated,
        },
      };
    }
    case "request_owner_approval":
    case "complete":
    case "abort":
      return err("meta_action_not_executable", "meta actions carry no tool execution");
  }
  return err("unhandled_action", `unhandled action: ${action.type}`);
}

/** Narrow Ashley-agent restart lane entry point used by the broker surface. */
export async function handleAgentRestart(
  ctx: EngineeringHandlerContext,
  payload: unknown,
): Promise<BrokerResponse<unknown>> {
  if (!isPlainRecord(payload) || !isPlainRecord(payload.envelope)) {
    return err("request_invalid", "payload and envelope required");
  }
  const nowMs = Date.now();
  const auth = await authorizeEngineering(ctx, payload.envelope, "ashley_agent_service_restart", nowMs);
  if (!auth.ok) return err(auth.errorCode, auth.message);
  const f = payload as Record<string, unknown>;
  const unit = boundedString(f.unit, 128);
  const incidentId = boundedString(f.incidentId, 256);
  if (!unit || !incidentId) return err("request_invalid", "unit and incidentId required");
  const health = f.health as { healthy: boolean; deterministic: boolean } | undefined;
  if (!health) return err("request_invalid", "health required");
  // Incident identity and attempt/cooldown state are broker-owned; the agent's
  // claimed `restartState` is ignored (it must never govern the control loop).
  const restartStore = getAgentRestartIncidentStore();
  const state = restartStore.get(incidentId);
  const decision = decideAgentRestart({ unit, incidentId, nowMs, health, state });
  if (!decision.ok || !decision.allowed) {
    return err("restart_denied", decision.ok ? decision.reason : decision.errorCode);
  }
  const result = await executeAgentRestart(
    {
      executableMappings: ctx.executableMappings as Record<string, string>,
      processRunner: ctx.processRunner,
      networkIsolation: ctx.networkIsolation,
      envAllowlist: ctx.envAllowlist,
    },
    unit,
  );
  if (!result.ok) return err(result.errorCode, result.reason);
  // Record the attempt under the broker clock so the once-per-incident + cooldown
  // guarantee holds across requests and cannot be reset by the agent.
  restartStore.recordAttempt(incidentId, nowMs, DEFAULT_RESTART_COOLDOWN_MS);
  ctx.auditSink({ kind: "ashley_agent_restart", exitCode: result.exitCode } as unknown as BrokerAuditRecord);
  return { ok: true, data: { restarted: true, exitCode: result.exitCode } };
}

// Re-export for broker wiring.
export { collectPatchTargets, classifyProjectRootAccess };
