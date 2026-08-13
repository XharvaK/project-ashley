/**
 * Qualified recipe spawn preparation (DeepSeek correction audit, HY3-1).
 *
 * The engineering `execute_recipe` lane previously ran through
 * `runBoundedCommand` — a narrow runner for candidate git + bounded
 * diagnostics that does NOT apply the fixed-recipe qualification chain. This
 * module is the single shared spawn-coupled tail that both the fixed-recipe
 * service (session/capability/reservation lane) and the engineering lane
 * (delegated envelope lane) execute:
 *
 *   1. recipe readiness + policy listing
 *   2. limits — strictest of broker/policy/recipe/request
 *   3. executable — resolved via mappings, real regular file
 *   4. cwd — canonical-to-native, real directory
 *   5. execution isolation gate — merged provider + broker-owned evidence;
 *      a recipe-declared `requiredIsolation` is gated before reservation,
 *      never spawned otherwise (SANDBOX-ISOLATION-01)
 *   6. network isolation — spawn-coupled: the provider returns the complete
 *      isolated spawn specification, or a typed refusal
 *      (R5A: NO ISOLATION → NO SPAWN)
 *
 * Refusals never spawn and never consume budget. The caller owns the
 * per-run synthetic `homeDir` lifecycle and the reservation/spawn/finalize
 * steps.
 */

import { lstatSync, realpathSync } from "node:fs";
import type { TaskLimits } from "../crypto/types.js";
import type { ActiveVerifiedSandboxPolicy } from "../policy/delegated-authorization.js";
import type { FixedRecipe } from "../policy/recipe-registry.js";
import { resolveSandboxRecipe } from "../policy/recipe-resolver.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { toNativeBrokerPath } from "../policy/path.js";
import type { FakeRunRequest } from "../process/fake-runner.js";
import {
  BROKER_HARD_LIMITS,
  combineExecutionLimits,
} from "./execution-limits.js";
import type { NetworkIsolationProvider } from "./network-isolation.js";
import {
  augmentBrokerOwnedEvidence,
  formatIsolationEvidenceSummary,
  meetsIsolationRequirement,
  type ExecutionIsolationProvider,
} from "./execution-isolation.js";
import { buildExecutionEnvironment } from "./environment.js";
import {
  resolveFixedRecipeExecutable,
  type ExecutableMappings,
} from "./executable-resolver.js";
import {
  classifyRecipeReadiness,
  type EffectiveExecutionLimits,
  type RecipeReadiness,
} from "./execution-types.js";

export type QualifiedRecipeInput = {
  recipeId: string;
  registry: ReadonlyMap<string, FixedRecipe>;
  policy: ActiveVerifiedSandboxPolicy | null;
  /** Policy-derived limits (from delegated authorization), if any. */
  policyLimits?: TaskLimits;
  /** Caller-supplied request limits, if any (strictest-of; may be partial). */
  requestLimits?: Partial<TaskLimits>;
  executableMappings: ExecutableMappings;
  rootConfig: BrokerRootConfig;
  /**
   * Execution isolation provider. Null fails closed for any recipe that
   * declares `requiredIsolation`.
   */
  executionIsolation: ExecutionIsolationProvider | null;
  /**
   * Operator activation ceiling for the isolation gate (0 = recipes
   * declaring `requiredIsolation` are refused before reservation).
   */
  isolationActivationLevel: number;
  networkIsolation: NetworkIsolationProvider;
  environmentSource: () => Record<string, string | undefined>;
  /**
   * Canonical (POSIX) working directory override. When set it wins over the
   * plan-derived cwd (engineering lane); when unset the plan cwd is used,
   * workspace-anchored to `treeRoot` when present.
   */
  explicitCwd?: string;
  /**
   * Tree root of the revalidated disposable workspace, or null when the run
   * is not workspace-bound. Drives the in-isolation cwd ("/workspace"), the
   * writable bind, and the isolation workspace roots.
   */
  treeRoot: string | null;
  /** Per-run synthetic HOME directory (caller owns its lifecycle). */
  homeDir: string;
  taskId: string;
  environmentDefaults?: Record<string, string>;
};

export type QualifiedSpawnRefusal = {
  stage: string;
  errorCode: string;
  reason: string;
  isolationEvidenceSummary: string | null;
};

export type QualifiedSpawnResult =
  | {
      ok: true;
      runRequest: FakeRunRequest;
      effectiveLimits: EffectiveExecutionLimits;
      nativeCwd: string;
      isolationEvidenceSummary: string | null;
      readiness: RecipeReadiness;
      recipe: FixedRecipe;
    }
  | { ok: false; refusal: QualifiedSpawnRefusal };

export async function prepareQualifiedSpawn(
  input: QualifiedRecipeInput,
): Promise<QualifiedSpawnResult> {
  const refuse = (
    stage: string,
    errorCode: string,
    reason: string,
    isolationEvidenceSummary: string | null = null,
  ): QualifiedSpawnResult => ({ ok: false, refusal: { stage, errorCode, reason, isolationEvidenceSummary } });

  // ---- stage: recipe ----
  const readiness = classifyRecipeReadiness(
    input.recipeId,
    input.registry as ReadonlyMap<string, { supported: boolean }>,
  );
  if (readiness === "disabled") {
    return refuse("recipe", "recipe_disabled", input.recipeId);
  }
  if (readiness === "planning_only") {
    return refuse("recipe", "recipe_planning_only", input.recipeId);
  }
  if (
    input.policy === null ||
    !input.policy.policy.allowedRecipeIds.includes(input.recipeId)
  ) {
    return refuse("recipe", "recipe_not_allowed_by_policy", input.recipeId);
  }
  const plan = resolveSandboxRecipe({
    recipeId: input.recipeId,
    registry: input.registry,
    roots: input.rootConfig,
  });
  if (!plan.ok) {
    return refuse("recipe", "recipe_plan_unavailable", plan.reason);
  }
  const recipe = input.registry.get(input.recipeId);
  if (recipe === undefined) {
    return refuse("recipe", "recipe_disabled", input.recipeId);
  }

  // ---- stage: limits ----
  const combined = combineExecutionLimits([
    { label: "broker", limits: BROKER_HARD_LIMITS },
    ...(input.policyLimits !== undefined
      ? [{ label: "policy", limits: input.policyLimits }]
      : []),
    { label: "recipe", limits: plan.plan.limits },
    ...(input.requestLimits !== undefined
      ? [{ label: "request", limits: input.requestLimits }]
      : []),
  ]);
  if (!combined.ok) {
    return refuse("limits", "limits_invalid", combined.reasons.join(","));
  }
  const effectiveLimits = combined.value;

  // ---- stage: executable ----
  const resolvedExecutable = resolveFixedRecipeExecutable({
    recipe,
    mappings: input.executableMappings,
    rootConfig: input.rootConfig,
  });
  if (!resolvedExecutable.ok) {
    return refuse("executable", resolvedExecutable.errorCode, resolvedExecutable.reason);
  }

  // ---- stage: cwd ----
  // An explicit cwd (engineering lane) wins; a workspace-anchored recipe
  // runs at the revalidated disposable tree root, never at the shared
  // workspace root; unbound executions keep the resolved plan cwd.
  const planCwd =
    input.explicitCwd ??
    (recipe.cwdPolicy === "workspace" && input.treeRoot !== null
      ? input.treeRoot
      : plan.plan.cwd);
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

  // ---- stage: execution isolation gate (spawn-coupled, SANDBOX-ISOLATION-01) ----
  // The merged evidence is the provider's honest mechanism claim plus the
  // broker-owned facts of THIS execution. A recipe that declares
  // `requiredIsolation` never runs unless the merged evidence satisfies it;
  // refusals here never spawn and never consume a reservation.
  const isolationEvidence =
    input.executionIsolation === null
      ? null
      : augmentBrokerOwnedEvidence(
          input.executionIsolation.evidence(),
          {
            workspaceBound: input.treeRoot !== null,
            sourceIdentityBound: false,
            environmentHardened: true,
            resourceLimitsEnforced: true,
          },
        );
  const isolationEvidenceSummary =
    isolationEvidence === null
      ? null
      : formatIsolationEvidenceSummary(isolationEvidence);
  if (recipe.requiredIsolation !== undefined) {
    if (input.isolationActivationLevel < 1) {
      return refuse(
        "isolation",
        "isolation_not_activated",
        `recipe_${recipe.recipeId}_requires_isolation`,
        isolationEvidenceSummary,
      );
    }
    if (isolationEvidence === null) {
      return refuse(
        "isolation",
        "isolation_evidence_unavailable",
        "provider reports no isolation evidence",
        isolationEvidenceSummary,
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
        isolationEvidenceSummary,
      );
    }
  }

  // ---- stage: network isolation (spawn-coupled, R5A) ----
  // The isolation provider returns the complete immutable spawn
  // specification. The runner must execute exactly this specification and
  // nothing else: the exact child that executes the fixed recipe is the
  // child created inside the verified isolation mechanism. A refusal here
  // never spawns and never consumes a reservation.
  const runRequest: FakeRunRequest = {
    taskId: input.taskId,
    argv: [resolvedExecutable.executable, ...plan.plan.argv.slice(1)],
    cwd: nativeCwd,
    ...(input.treeRoot !== null ? { isolationCwd: "/workspace" } : {}),
    env: buildExecutionEnvironment({
      allowlist: plan.plan.envAllowlist,
      source: input.environmentSource(),
      homeDir: input.homeDir,
      ...(input.environmentDefaults !== undefined
        ? { defaults: input.environmentDefaults }
        : {}),
    }),
    wallMs: effectiveLimits.wallMs,
    maxProcesses: effectiveLimits.maxProcesses,
    maxOutputBytes: effectiveLimits.maxOutputBytes,
    isolationBinds: [
      ...input.rootConfig.readOnlyRoots.map((src) => ({
        src,
        dest: src,
        writable: false,
      })),
      ...(input.treeRoot === null
        ? []
        : [{ src: input.treeRoot, dest: "/workspace", writable: true }]),
    ],
    isolationWorkspaceRoots: input.treeRoot === null ? [] : [input.treeRoot],
  };
  const prepareProvider = input.executionIsolation ?? input.networkIsolation;
  const isolation = await prepareProvider.prepare(runRequest);
  if (!isolation.ok) {
    return refuse("network", isolation.errorCode, isolation.reason, isolationEvidenceSummary);
  }

  return {
    ok: true,
    runRequest: isolation.request,
    effectiveLimits,
    nativeCwd,
    isolationEvidenceSummary,
    readiness,
    recipe,
  };
}
