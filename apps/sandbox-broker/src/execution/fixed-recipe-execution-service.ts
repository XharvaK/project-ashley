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
 *   8. workspace + cwd         — revalidation first; workspace-anchored
 *                                recipes run at the disposable tree root,
 *                                write/delete containment inside the tree
 *   9. execution isolation     — merged provider + broker-owned evidence;
 *                                a recipe-declared `requiredIsolation` is
 *                                gated before reservation (isolation
 *                                activation level 1+), never spawned
 *                                otherwise (SANDBOX-ISOLATION-01)
 *  10. network isolation       — spawn-coupled: the provider returns the
 *                                complete isolated spawn specification, or a
 *                                typed refusal. Refusal → no spawn, no budget.
 *  11. reservation             — atomic, single-use, budgeted
 *  12. spawn                   — shell-free, bounded; executes EXACTLY the
 *                                specification prepared by the isolation
 *                                provider (R5A: NO ISOLATION → NO SPAWN);
 *                                synthetic per-run HOME is always removed
 *  13. finalize                — succeeded/failed, never refunded; any
 *                                post-reservation failure finalizes and
 *                                yields explicit `outcome_unknown` status,
 *                                never a known refusal or a throw
 *  14. receipt                 — bounded, hashed, deterministic
 *
 * Refusals before the reservation never spawn and never consume budget.
 * After the reservation is accepted the run is always finalized and a
 * receipt is always produced.
 *
 * No routes, no models, no patches, no live-checkout mutation: this module
 * only executes broker-owned fixed recipes.
 */

import { lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
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
import {
  augmentBrokerOwnedEvidence,
  formatIsolationEvidenceSummary,
  meetsIsolationRequirement,
  type BrokerOwnedIsolationFacts,
  type ExecutionIsolationProvider,
  type IsolationEvidence,
} from "./execution-isolation.js";
import { buildExecutionEnvironment } from "./environment.js";
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
  /**
   * Execution isolation provider (SANDBOX-ISOLATION-01). Extends the
   * network provider with per-property evidence; when absent the service
   * fails closed for any recipe that declares `requiredIsolation`.
   */
  executionIsolation?: ExecutionIsolationProvider;
  /**
   * Operator activation ceiling for the isolation gate (0 = legacy
   * behavior: recipes declaring `requiredIsolation` are refused before
   * reservation). A recipe's requirement is only enforced when the
   * activation level is at least 1.
   */
  isolationActivationLevel?: number;
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
  private readonly executionIsolation: ExecutionIsolationProvider | null;
  private readonly isolationActivationLevel: number;
  private readonly nowMs: () => number;

  constructor(options: FixedRecipeExecutionServiceOptions) {
    this.options = options;
    this.registry = options.registry ?? fixedRecipeRegistry();
    this.networkIsolation = options.networkIsolation ?? createUnavailableNetworkIsolation();
    this.executionIsolation = options.executionIsolation ?? null;
    this.isolationActivationLevel = options.isolationActivationLevel ?? 0;
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
        outcome: "refused",
        errorCode,
        reason,
        stage,
        audit,
        receipt: null,
      };
    };

    const outcomeUnknown = (
      stage: string,
      reason: string,
      partial: Partial<Omit<BrokerExecutionAudit, "kind" | "outcome" | "errorCode" | "stage">> = {},
    ): FixedRecipeExecutionResult => {
      const audit = this.buildAudit(request, {
        outcome: "outcome_unknown",
        errorCode: "outcome_unknown",
        stage,
        createdAtIso: new Date(this.nowMs()).toISOString(),
        ...partial,
      });
      this.options.auditSink?.(audit);
      return {
        ok: false,
        outcome: "outcome_unknown",
        errorCode: "outcome_unknown",
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

    // ---- stage: workspace (revalidated before cwd resolution) ----
    const hasWriteDelete = authorization.canonicalPaths.some(
      (fact) => fact.intent !== "read",
    );
    if (hasWriteDelete && session.workspaceId === undefined) {
      return refuse("workspace", "workspace_bound_execution_required", "write_or_delete_target_without_workspace");
    }
    let treeRoot: string | null = null;
    let manifestSourceRoot: string | null = null;
    let manifestSourceIdentity: string | null = null;
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
      manifestSourceRoot = revalidated.locations.manifest.sourceRoot;
      manifestSourceIdentity = revalidated.locations.manifest.sourceIdentity ?? null;
    }

    // ---- stage: cwd ----
    // A workspace-anchored recipe runs at the revalidated disposable tree
    // root, never at the shared workspace root; unbound executions keep the
    // resolved plan cwd.
    const planCwd =
      recipe.cwdPolicy === "workspace" && treeRoot !== null ? treeRoot : plan.plan.cwd;
    let nativeCwd: string;
    try {
      const cwdNative = toNativeBrokerPath(planCwd);
      const stats = lstatSync(cwdNative);
      if (!stats.isDirectory()) {
        return refuse("cwd", "cwd_not_directory", planCwd);
      }
      nativeCwd = realpathSync(cwdNative);
    } catch {
      return refuse("cwd", "cwd_missing", planCwd);
    }

    for (const fact of authorization.canonicalPaths) {
      if (fact.intent === "read") {
        const live = this.options.rootConfig.readOnlyRoots[0];
        if (live !== undefined && fact.canonicalPath.startsWith(`${live}/`)) continue;
        if (treeRoot !== null && fact.canonicalPath.startsWith(`${treeRoot}/`)) continue;
        if (
          manifestSourceRoot !== null &&
          fact.canonicalPath.startsWith(`${manifestSourceRoot}/`)
        ) {
          continue;
        }
        return refuse("workspace", "read_outside_configured_roots", fact.canonicalPath);
      }
      if (treeRoot === null || !fact.canonicalPath.startsWith(`${treeRoot}/`)) {
        return refuse("workspace", "write_outside_disposable_workspace", fact.canonicalPath);
      }
    }

    // ---- stage: execution isolation gate (spawn-coupled, SANDBOX-ISOLATION-01) ----
    // The merged evidence is the provider's honest mechanism claim plus the
    // broker-owned facts of THIS execution. A recipe that declares
    // `requiredIsolation` never runs unless the merged evidence satisfies
    // it; refusals here never spawn and never consume a reservation.
    const isolationFacts: BrokerOwnedIsolationFacts = {
      workspaceBound: session.workspaceId !== undefined,
      sourceIdentityBound: manifestSourceIdentity !== null,
      environmentHardened: true,
      resourceLimitsEnforced: true,
    };
    const isolationEvidence: IsolationEvidence | null =
      this.executionIsolation === null
        ? null
        : augmentBrokerOwnedEvidence(
            this.executionIsolation.evidence(),
            isolationFacts,
          );
    const isolationEvidenceSummary =
      isolationEvidence === null
        ? null
        : formatIsolationEvidenceSummary(isolationEvidence);
    if (recipe.requiredIsolation !== undefined) {
      if (this.isolationActivationLevel < 1) {
        return refuse(
          "isolation",
          "isolation_not_activated",
          `recipe_${recipe.recipeId}_requires_isolation`,
          { isolationEvidenceSummary },
        );
      }
      if (isolationEvidence === null) {
        return refuse(
          "isolation",
          "isolation_evidence_unavailable",
          "provider reports no isolation evidence",
        );
      }
      const check = meetsIsolationRequirement(
        isolationEvidence,
        recipe.requiredIsolation,
      );
      if (!check.ok) {
        return refuse(
          "isolation",
          `isolation_requirement_unmet:${check.unmet[0] ?? "unknown"}`,
          check.unmet.join(","),
          { isolationEvidenceSummary },
        );
      }
    }

    // ---- stage: network isolation (spawn-coupled, R5A) ----
    // The isolation provider returns the complete immutable spawn
    // specification. The runner below executes exactly this specification
    // and nothing else: the exact child that executes the fixed recipe is
    // the child created inside the verified isolation mechanism. A refusal
    // here never spawns and never consumes a reservation.
    const homeDir = mkdtempSync(path.join(tmpdir(), "ashley-recipe-home-"));
    try {
      const runRequest = {
        taskId: request.capabilityUseId,
        argv: [resolvedExecutable.executable, ...plan.plan.argv.slice(1)],
        cwd: nativeCwd,
        env: this.buildEnvironment(plan.plan.envAllowlist, homeDir),
        wallMs: effectiveLimits.wallMs,
        maxProcesses: effectiveLimits.maxProcesses,
        maxOutputBytes: effectiveLimits.maxOutputBytes,
      };
      const prepareProvider =
        this.executionIsolation ?? this.networkIsolation;
      const isolation = await prepareProvider.prepare(runRequest);
      if (!isolation.ok) {
        return refuse(
          "network",
          isolation.errorCode,
          isolation.reason,
          {
            networkIsolation: "unavailable_refused",
            isolationEvidenceSummary,
          },
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

      // ---- stage: spawn, finalize, receipt ----
      // Once the reservation is accepted the run must always be finalized
      // and never throw: the broker has no request timeout that drops
      // responses, so the catch-all below converts any unexpected failure
      // into an explicit `outcome_unknown` result after best-effort finalization.
      try {
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
          isolationEvidenceSummary,
        });
        this.options.auditSink?.(audit);
        return {
          ok: true,
          outcome,
          receipt,
          audit,
        };
      } catch (error) {
        try {
          this.options.sessionService.finalizeToolExecution(
            request.capabilityUseId,
            "failed",
            this.nowMs(),
          );
        } catch {
          // best effort: the reservation must never be left dangling
        }
        return outcomeUnknown(
          "execution",
          `post_reservation_failure:${String((error as Error).message ?? "unknown")}`,
          { isolationEvidenceSummary },
        );
      }
    } finally {
      try {
        rmSync(homeDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup of the synthetic per-run home
      }
    }
  }

  /**
   * Builds the execution environment from the recipe's allowlist plus the
   * broker-owned environment source through the strict builder
   * (SANDBOX-ISOLATION-01): only allowlisted names may pass, the denylist
   * overrides the allowlist, `HOME` is always the synthetic per-run
   * directory supplied by the caller, `PATH` is always broker-fixed, and
   * `NODE_OPTIONS` is denied. The git recipes' interactivity
   * guards default to safe values when the source omits them. The caller
   * owns cleanup of `homeDir`.
   */
  buildEnvironment(
    envAllowlist: readonly string[],
    homeDir: string,
  ): Record<string, string> {
    return buildExecutionEnvironment({
      allowlist: envAllowlist,
      source: this.options.environmentSource?.() ?? {},
      homeDir,
      defaults: { GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" },
    });
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
      isolationEvidenceSummary: null,
      ...fields,
    };
  }
}
