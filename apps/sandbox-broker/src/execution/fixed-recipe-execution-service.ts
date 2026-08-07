/**
 * Fixed-recipe execution service (Sandbox Wave 4, Commit 9).
 *
 * The single broker entry point that turns an authorized, capability-backed
 * request into exactly one fixed-recipe run. The full chain, in order:
 *
 *   1. request shape           — bounded fields, finite clock
 *   2. delegated authorization — signed envelope, trusted key, active policy,
 *                                nonce replay guard, broker path facts
 *   3. session binding         — active session, revision, owner, policy hash
 *   4. capability              — broker-issued signed token, window, binding
 *   5. recipe                  — readiness (execution_ready), policy listing,
 *                                fixed plan from the broker-owned registry
 *   6. limits                  — strictest-of broker/policy/recipe/request
 *   7. executable              — resolved via mappings, real regular file
 *   8. cwd + workspace         — existing directory, disposable revalidation,
 *                                write/delete containment inside the tree
 *   9. network isolation       — spawn-coupled: the provider returns the
 *                                complete isolated spawn specification, or a
 *                                typed refusal. Refusal → no spawn, no budget.
 *  10. reservation             — atomic, single-use, budgeted
 *  11. spawn                   — shell-free, bounded; executes EXACTLY the
 *                                specification prepared by the isolation
 *                                provider (R5A: NO ISOLATION → NO SPAWN)
 *  12. finalize                — succeeded/failed, never refunded
 *  13. receipt                 — bounded, hashed, deterministic
 *
 * Refusals before the reservation never spawn and never consume budget.
 * After the reservation is accepted the run is always finalized and a
 * receipt is always produced.
 *
 * No routes, no models, no patches, no live-checkout mutation: this module
 * only executes broker-owned fixed recipes.
 */

import { lstatSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import { sha256Hex } from "../crypto/types.js";
import type { ActiveVerifiedSandboxPolicy } from "../policy/delegated-authorization.js";
import {
  authorizeDelegatedSandboxRequest,
  type BrokerDelegatedAuthorizationAudit,
  type DelegatedTrustedKeyConfig,
} from "../policy/delegated-authorization.js";
import type { OwnerApprovalVerifierConfig } from "../crypto/owner-approval.js";
import { fixedRecipeRegistry, type FixedRecipe } from "../policy/recipe-registry.js";
import { resolveSandboxRecipe } from "../policy/recipe-resolver.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { toNativeBrokerPath } from "../policy/path.js";
import type { ProcessRunner } from "../process/fake-runner.js";
import type { BrokerSessionService } from "../sessions/session-service.js";
import { revalidateDisposableWorkspace } from "../workspace/workspace-revalidate.js";
import { BROKER_HARD_LIMITS, combineExecutionLimits } from "./execution-limits.js";
import {
  createUnavailableNetworkIsolation,
  type NetworkIsolationProvider,
} from "./network-isolation.js";
import { resolveFixedRecipeExecutable, type ExecutableMappings } from "./executable-resolver.js";
import { buildBoundedCapture } from "./bounded-output.js";
import { buildExecutionReceipt } from "./receipt.js";
import type {
  BrokerExecutionAudit,
  FixedRecipeExecutionRequest,
  FixedRecipeExecutionResult,
} from "./execution-types.js";
import { classifyRecipeReadiness } from "./execution-types.js";

/** Union of audit records this service may emit (discriminate on `kind`). */
export type BrokerAuditRecord = BrokerExecutionAudit | BrokerDelegatedAuthorizationAudit;

export type FixedRecipeExecutionServiceOptions = {
  sessionService: BrokerSessionService;
  trustedDelegatedKey: DelegatedTrustedKeyConfig | null;
  activePolicy: ActiveVerifiedSandboxPolicy | null;
  trustedOwnerId: string;
  trustedOwnerPolicyKeyIds: ReadonlySet<string>;
  reserveNonce: (nonce: string) => boolean;
  rootConfig: BrokerRootConfig;
  processRunner: ProcessRunner;
  networkIsolation?: NetworkIsolationProvider;
  executableMappings: ExecutableMappings;
  registry?: ReadonlyMap<string, FixedRecipe>;
  environmentSource?: () => Record<string, string | undefined>;
  /**
   * Trusted owner approval keys (Commit 11). Null disables owner approval
   * verification: an `owner_approval_required` decision fails closed.
   */
  trustedOwnerApprovalKeys?: OwnerApprovalVerifierConfig | null;
  auditSink?: (record: BrokerAuditRecord) => void;
  nowMs?: () => number;
};

const CAPABILITY_USE_ID_MAX_LENGTH = 128;

function isBoundedString(value: unknown, max: number, min = 1): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

export class FixedRecipeExecutionService {
  private readonly options: FixedRecipeExecutionServiceOptions;
  private readonly registry: ReadonlyMap<string, FixedRecipe>;
  private readonly networkIsolation: NetworkIsolationProvider;
  private readonly nowMs: () => number;

  constructor(options: FixedRecipeExecutionServiceOptions) {
    this.options = options;
    this.registry = options.registry ?? fixedRecipeRegistry();
    this.networkIsolation = options.networkIsolation ?? createUnavailableNetworkIsolation();
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  async executeFixedRecipe(
    request: FixedRecipeExecutionRequest,
  ): Promise<FixedRecipeExecutionResult> {
    const startedAtMs = this.nowMs();
    const startedAtIso = new Date(startedAtMs).toISOString();

    const refuse = (
      stage: string,
      errorCode: string,
      reason: string,
      partial: Partial<Omit<BrokerExecutionAudit, "kind" | "outcome" | "errorCode" | "stage">> = {},
    ): FixedRecipeExecutionResult => {
      const audit = this.buildAudit(request, {
        outcome: "refused",
        errorCode,
        stage,
        createdAtIso: new Date(this.nowMs()).toISOString(),
        ...partial,
      });
      this.options.auditSink?.(audit);
      return {
        ok: false,
        errorCode,
        reason,
        stage,
        audit,
        receipt: null,
      };
    };

    // ---- stage: request ----
    if (!Number.isFinite(request.nowMs)) {
      return refuse("request", "invalid_clock", "invalid_now_ms");
    }
    if (
      !isBoundedString(request.sessionUuid, 64) ||
      !isBoundedString(request.capabilityUseId, CAPABILITY_USE_ID_MAX_LENGTH) ||
      !Number.isInteger(request.expectedSessionRevision) ||
      request.expectedSessionRevision < 1 ||
      !request.envelope.signature ||
      !request.capability.signature.value
    ) {
      return refuse("request", "request_invalid", "request_fields_out_of_bounds");
    }
    if (request.envelope.sessionUuid !== request.sessionUuid) {
      return refuse("request", "session_uuid_mismatch", "envelope_session_uuid_mismatch");
    }
    if (request.limits !== undefined) {
      const check = combineExecutionLimits([
        { label: "broker", limits: BROKER_HARD_LIMITS },
        { label: "request", limits: request.limits },
      ]);
      if (!check.ok) {
        return refuse("request", "limits_invalid", check.reasons.join(","));
      }
    }

    // ---- stage: authorization ----
    const authorization = authorizeDelegatedSandboxRequest({
      envelope: request.envelope,
      trustedDelegatedKey: this.options.trustedDelegatedKey,
      activePolicy: this.options.activePolicy,
      trustedOwnerId: this.options.trustedOwnerId,
      trustedOwnerPolicyKeyIds: this.options.trustedOwnerPolicyKeyIds,
      reserveNonce: this.options.reserveNonce,
      nowMs: request.nowMs,
      rootConfig: this.options.rootConfig,
      ownerApproval: request.ownerApproval ?? null,
      trustedOwnerApprovalKeys: this.options.trustedOwnerApprovalKeys ?? null,
      auditSink: this.options.auditSink,
    });
    if (!authorization.ok) {
      return refuse(
        "authorization",
        authorization.errorCode,
        authorization.reason,
      );
    }
    const ownerApproved =
      authorization.decision === "owner_approved" &&
      request.ownerApproval !== undefined;

    // ---- stage: session ----
    const session = this.options.sessionService.getSession(request.sessionUuid);
    if (session === null) {
      return refuse("session", "unknown_session", "session_not_found");
    }
    if (session.state !== "active") {
      return refuse("session", "session_not_active", `session_is_${session.state}`);
    }
    if (request.nowMs >= Date.parse(session.expiresAt)) {
      return refuse("session", "session_expired", "session_expired");
    }
    if (session.revision !== request.expectedSessionRevision) {
      return refuse(
        "session",
        "revision_mismatch",
        `expected_revision_${request.expectedSessionRevision}_current_${session.revision}`,
      );
    }
    if (
      session.ownerId !== request.envelope.ownerId ||
      session.policyHash !== request.envelope.policyHash
    ) {
      return refuse("session", "session_binding_mismatch", "session_binding_mismatch");
    }
    if (ownerApproved) {
      const recorded = this.options.sessionService.getOwnerAuthorization(
        request.ownerApproval!.proposalId,
      );
      if (
        recorded === null ||
        recorded.sessionUuid !== request.sessionUuid ||
        recorded.ownerId !== request.envelope.ownerId ||
        recorded.policyHash !== request.envelope.policyHash
      ) {
        return refuse(
          "session",
          "owner_approval_not_recorded",
          "owner_approval_authorization_not_recorded_for_session",
        );
      }
    }

    // ---- stage: capability ----
    const verifiedCapability = this.options.sessionService.verifySessionCapability(
      request.capability,
      request.nowMs,
    );
    if (!verifiedCapability.ok) {
      return refuse("capability", verifiedCapability.errorCode, verifiedCapability.reason);
    }
    const capabilityPayload = request.capability.payload;
    if (
      capabilityPayload.capabilityId !== request.envelope.capabilityId ||
      capabilityPayload.sessionUuid !== request.sessionUuid ||
      capabilityPayload.policyHash !== request.envelope.policyHash
    ) {
      return refuse("capability", "capability_binding_mismatch", "capability_binding_mismatch");
    }
    const capabilityWindowStart = Date.parse(capabilityPayload.issuedAt);
    const capabilityWindowEnd = Date.parse(capabilityPayload.expiresAt);
    if (
      !Number.isFinite(capabilityWindowStart) ||
      !Number.isFinite(capabilityWindowEnd) ||
      request.envelope.issuedAt < capabilityWindowStart ||
      request.envelope.expiresAt > capabilityWindowEnd
    ) {
      return refuse("capability", "envelope_outside_capability_window", "envelope_outside_capability_window");
    }

    // ---- stage: recipe ----
    const readiness = classifyRecipeReadiness(
      request.envelope.recipeId,
      this.registry as ReadonlyMap<string, { supported: boolean }>,
    );
    if (readiness === "disabled") {
      return refuse("recipe", "recipe_disabled", request.envelope.recipeId);
    }
    if (readiness === "planning_only") {
      return refuse("recipe", "recipe_planning_only", request.envelope.recipeId);
    }
    const policy = this.options.activePolicy;
    if (
      policy === null ||
      !policy.policy.allowedRecipeIds.includes(request.envelope.recipeId)
    ) {
      return refuse("recipe", "recipe_not_allowed_by_policy", request.envelope.recipeId);
    }
    const plan = resolveSandboxRecipe({
      recipeId: request.envelope.recipeId,
      registry: this.registry,
      roots: this.options.rootConfig,
    });
    if (!plan.ok) {
      return refuse("recipe", "recipe_plan_unavailable", plan.reason);
    }
    const recipe = this.registry.get(request.envelope.recipeId);
    if (recipe === undefined) {
      return refuse("recipe", "recipe_disabled", request.envelope.recipeId);
    }

    // ---- stage: limits ----
    const combined = combineExecutionLimits([
      { label: "broker", limits: BROKER_HARD_LIMITS },
      {
        label: "policy",
        limits: {
          wallMs: authorization.effectiveLimits.wallMsMax,
          maxProcesses: authorization.effectiveLimits.maxProcesses,
          maxOutputBytes: authorization.effectiveLimits.maxOutputBytes,
        },
      },
      { label: "recipe", limits: plan.plan.limits },
      { label: "request", limits: request.limits },
    ]);
    if (!combined.ok) {
      return refuse("limits", "limits_invalid", combined.reasons.join(","));
    }
    const effectiveLimits = combined.value;

    // ---- stage: executable ----
    const resolvedExecutable = resolveFixedRecipeExecutable({
      recipe,
      mappings: this.options.executableMappings,
      rootConfig: this.options.rootConfig,
    });
    if (!resolvedExecutable.ok) {
      return refuse("executable", resolvedExecutable.errorCode, resolvedExecutable.reason);
    }

    // ---- stage: cwd + workspace ----
    let nativeCwd: string;
    try {
      const cwdNative = toNativeBrokerPath(plan.plan.cwd);
      const stats = lstatSync(cwdNative);
      if (!stats.isDirectory()) {
        return refuse("cwd", "cwd_not_directory", plan.plan.cwd);
      }
      nativeCwd = realpathSync(cwdNative);
    } catch {
      return refuse("cwd", "cwd_missing", plan.plan.cwd);
    }

    const hasWriteDelete = authorization.canonicalPaths.some(
      (fact) => fact.intent !== "read",
    );
    if (hasWriteDelete && session.workspaceId === undefined) {
      return refuse("workspace", "workspace_bound_execution_required", "write_or_delete_target_without_workspace");
    }
    let treeRoot: string | null = null;
    if (session.workspaceId !== undefined) {
      const revalidated = revalidateDisposableWorkspace({
        workspaceId: session.workspaceId,
        rootConfig: this.options.rootConfig,
        nowMs: request.nowMs,
      });
      if (!revalidated.ok) {
        return refuse("workspace", "workspace_revalidation_failed", revalidated.errorCode);
      }
      treeRoot = revalidated.locations.treeRoot;
    }
    for (const fact of authorization.canonicalPaths) {
      if (fact.intent === "read") {
        const live = this.options.rootConfig.readOnlyRoots[0];
        if (live !== undefined && fact.canonicalPath.startsWith(`${live}/`)) continue;
        if (treeRoot !== null && fact.canonicalPath.startsWith(`${treeRoot}/`)) continue;
        return refuse("workspace", "read_outside_configured_roots", fact.canonicalPath);
      }
      if (treeRoot === null || !fact.canonicalPath.startsWith(`${treeRoot}/`)) {
        return refuse("workspace", "write_outside_disposable_workspace", fact.canonicalPath);
      }
    }

    // ---- stage: network isolation (spawn-coupled, R5A) ----
    // The isolation provider returns the complete immutable spawn
    // specification. The runner below executes exactly this specification
    // and nothing else: the exact child that executes the fixed recipe is
    // the child created inside the verified isolation mechanism. A refusal
    // here never spawns and never consumes a reservation.
    const runRequest = {
      taskId: request.capabilityUseId,
      argv: [resolvedExecutable.executable, ...plan.plan.argv.slice(1)],
      cwd: nativeCwd,
      env: this.buildEnvironment(plan.plan.envAllowlist),
      wallMs: effectiveLimits.wallMs,
      maxProcesses: effectiveLimits.maxProcesses,
      maxOutputBytes: effectiveLimits.maxOutputBytes,
    };
    const isolation = await this.networkIsolation.prepare(runRequest);
    if (!isolation.ok) {
      return refuse(
        "network",
        isolation.errorCode,
        isolation.reason,
        { networkIsolation: "unavailable_refused" },
      );
    }

    // ---- stage: reservation ----
    const capabilityId = request.envelope.capabilityId as SandboxCapabilityId;
    const reserved = this.options.sessionService.reserveToolExecution(
      request.sessionUuid,
      capabilityId,
      request.capabilityUseId,
      {
        policyHash: request.envelope.policyHash,
        expectedRevision: request.expectedSessionRevision,
        nowMs: request.nowMs,
      },
    );
    if (!reserved.ok) {
      return refuse("reservation", reserved.errorCode, reserved.reason);
    }

    // ---- stage: spawn ----
    const startedWall = process.hrtime.bigint();
    let exitCode: number;
    let stdout: string;
    let stderr: string;
    let truncated: boolean;
    let terminalReason: string;
    try {
      const runResult = await this.options.processRunner.run(isolation.request);
      exitCode = runResult.exitCode;
      stdout = runResult.stdout;
      stderr = runResult.stderr;
      truncated = runResult.truncated;
      terminalReason = runResult.terminalReason;
    } catch (error) {
      exitCode = 1;
      stdout = "";
      stderr = "";
      truncated = false;
      terminalReason = `runner_error:${String((error as Error).message ?? "unknown")}`;
    }
    const wallMs = Number(process.hrtime.bigint() - startedWall) / 1_000_000;
    const outcome =
      exitCode === 0 && !truncated && terminalReason === "success"
        ? ("succeeded" as const)
        : ("failed" as const);

    // ---- stage: finalize ----
    this.options.sessionService.finalizeToolExecution(
      request.capabilityUseId,
      outcome,
      this.nowMs(),
    );

    // ---- stage: receipt ----
    const capture = buildBoundedCapture(stdout, stderr, effectiveLimits.maxOutputBytes);
    const receiptTruncated = truncated || capture.truncated;
    const completedAtMs = this.nowMs();
    const receipt = buildExecutionReceipt({
      receiptId: `receipt-${request.capabilityUseId}`,
      sessionUuid: request.sessionUuid,
      capabilityUseId: request.capabilityUseId,
      proposalId: request.envelope.proposalId,
      ownerId: request.envelope.ownerId,
      recipeId: request.envelope.recipeId,
      readiness,
      category: recipe.category,
      terminalState:
        outcome === "succeeded"
          ? { state: "succeeded", exitCode: 0 }
          : { state: "failed", exitCode, terminalReason },
      stdoutHash: capture.stdoutHash,
      stderrHash: capture.stderrHash,
      stdoutBytes: capture.stdoutBytes,
      stderrBytes: capture.stderrBytes,
      truncated: receiptTruncated,
      wallMs: Math.round(wallMs),
      startedAtIso,
      completedAtIso: new Date(completedAtMs).toISOString(),
      effectiveLimits,
      networkIsolation: "enforced",
    });
    const audit = this.buildAudit(request, {
      outcome: "completed",
      errorCode: null,
      stage: "receipt",
      createdAtIso: new Date(completedAtMs).toISOString(),
      sessionUuid: request.sessionUuid,
      capabilityUseId: request.capabilityUseId,
      recipeId: request.envelope.recipeId,
      readiness,
      category: recipe.category,
      exitCode,
      terminalReason,
      stdoutHash: capture.stdoutHash,
      stderrHash: capture.stderrHash,
      truncated: receiptTruncated,
      stdoutBytes: capture.stdoutBytes,
      stderrBytes: capture.stderrBytes,
      wallMs: Math.round(wallMs),
      networkIsolation: "enforced",
      receiptHash: receipt.receiptHash,
    });
    this.options.auditSink?.(audit);
    return {
      ok: true,
      outcome,
      receipt,
      audit,
    };
  }

  /**
   * Builds the execution environment from the recipe's allowlist plus the
   * broker-owned environment source. Only allowlisted names may pass;
   * `HOME` is always a synthetic per-run directory so provider keys and
   * credential helpers in the real home are unreachable; the git recipes'
   * interactivity guards default to safe values when the source omits them.
   */
  buildEnvironment(envAllowlist: readonly string[]): Record<string, string> {
    const source = this.options.environmentSource?.() ?? {};
    const home = mkdtempSync(path.join(tmpdir(), "ashley-recipe-home-"));
    const env: Record<string, string> = {};
    for (const name of envAllowlist) {
      if (name === "HOME") {
        env.HOME = home;
        continue;
      }
      const value = source[name];
      if (value === undefined || value.length === 0) {
        if (name === "GIT_TERMINAL_PROMPT") env[name] = "0";
        else if (name === "GIT_PAGER") env[name] = "cat";
        continue;
      }
      env[name] = value;
    }
    return env;
  }

  /**
   * Builds the complete audit record. Fields not supplied by the caller
   * default from the request; readiness is always computable from the
   * registry (unknown recipe ids classify as disabled).
   */
  private buildAudit(
    request: FixedRecipeExecutionRequest,
    fields: Partial<Omit<BrokerExecutionAudit, "kind">> & {
      outcome: BrokerExecutionAudit["outcome"];
      errorCode: BrokerExecutionAudit["errorCode"];
      stage: string;
      createdAtIso: string;
    },
  ): BrokerExecutionAudit {
    const readiness = classifyRecipeReadiness(
      request.envelope.recipeId,
      this.registry as ReadonlyMap<string, { supported: boolean }>,
    );
    return {
      kind: "broker_fixed_recipe_execution",
      proposalId: request.envelope.proposalId,
      ownerId: request.envelope.ownerId,
      sessionUuid: request.sessionUuid,
      capabilityUseId: null,
      recipeId: request.envelope.recipeId,
      readiness,
      category: null,
      exitCode: null,
      terminalReason: null,
      truncated: false,
      stdoutHash: null,
      stderrHash: null,
      stdoutBytes: null,
      stderrBytes: null,
      wallMs: null,
      networkIsolation: "not_attempted",
      receiptHash: null,
      nonceHash: sha256Hex(request.envelope.nonce),
      ...fields,
    };
  }
}
