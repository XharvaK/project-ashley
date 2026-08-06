/**
 * Fixed-recipe execution types (Sandbox Wave 4, Commit 9).
 *
 * Commit 9 completes the execution half of the sandbox chain: a signed
 * delegated request that the broker authorized as autonomous-safe, under an
 * active broker session with a broker-issued short-lived capability, is
 * executed as one of the broker's fixed recipes — never as caller-supplied
 * commands. This module owns the request/result vocabulary for that
 * execution surface.
 *
 * Outcome philosophy: a completed run that exits non-zero, times out, or
 * overflows its output budget is a documented typed outcome, not a security
 * failure. Refusals (authorization, session, capability, recipe, limits,
 * network isolation, reservation) never spawn a process and never consume a
 * reservation. The moment a reservation is accepted, the run is finalized
 * as succeeded or failed and the budget is never refunded.
 */

import type { TaskLimits } from "../crypto/types.js";
import type { DelegatedApprovalEnvelope } from "../crypto/delegated-approval.js";
import type { SandboxOwnerApprovalEnvelope } from "../crypto/owner-approval.js";
import type { SignedSandboxSessionCapability } from "../sessions/session-capability.js";
import type { FixedRecipeCategory } from "../policy/recipe-registry.js";

/** Execution readiness of a fixed recipe from the broker-owned registry. */
export type RecipeReadiness = "execution_ready" | "planning_only" | "disabled";

/**
 * Classifies a fixed recipe's readiness.
 *
 * - `execution_ready`: the recipe is in the registry and marked supported.
 * - `planning_only`: the recipe is in the registry but marked unsupported
 *   (e.g. `verify:repo-tsc`); it may be planned but never executed.
 * - `disabled`: the recipe id is not in the broker-owned registry at all.
 */
export function classifyRecipeReadiness(
  recipeId: string,
  registry: ReadonlyMap<string, { supported: boolean }>,
): RecipeReadiness {
  const recipe = registry.get(recipeId);
  if (recipe === undefined) return "disabled";
  return recipe.supported ? "execution_ready" : "planning_only";
}

/** Effective execution ceilings with strictest-of provenance. */
export type EffectiveExecutionLimits = {
  wallMs: number;
  maxProcesses: number;
  maxOutputBytes: number;
  sources: { field: keyof TaskLimits; label: string }[];
};

/**
 * A request to execute exactly one fixed recipe. The envelope is the signed
 * delegated request (full signature included); the capability is the
 * broker-issued signed session capability token; `capabilityUseId` is the
 * caller-chosen single-use reservation id (bounded, idempotent across
 * duplicates); `limits` may only tighten the effective ceilings.
 */
/**
 * An execution-bound delegated envelope: the service requires the optional
 * fields that other surfaces may omit — session binding, the fixed recipe
 * to execute, and the signature.
 */
export type FixedRecipeExecutionEnvelope = DelegatedApprovalEnvelope & {
  sessionUuid: string;
  recipeId: string;
  signature: string;
};

export type FixedRecipeExecutionRequest = {
  envelope: FixedRecipeExecutionEnvelope;
  sessionUuid: string;
  capability: SignedSandboxSessionCapability;
  capabilityUseId: string;
  expectedSessionRevision: number;
  limits?: Partial<TaskLimits>;
  /**
   * Owner-signed sandbox approval (Commit 11). Required when the shared
   * policy demands `owner_approval_required`; the broker verifies it and
   * binds it to the request before executing.
   */
  ownerApproval?: SandboxOwnerApprovalEnvelope;
  nowMs: number;
};

/** Typed terminal state of a run that consumed its reservation. */
export type ExecutionTerminalState =
  | { state: "succeeded"; exitCode: 0 }
  | { state: "failed"; exitCode: number; terminalReason: string };

/**
 * Broker-owned execution receipt. Bounded, deterministic, and free of raw
 * output, environment values, and secrets: only hashes and byte counts of
 * the captured output survive. `receiptHash` is a deterministic digest over
 * the receipt's own canonical fields.
 */
export type BrokerExecutionReceipt = {
  receiptId: string;
  sessionUuid: string;
  capabilityUseId: string;
  proposalId: string;
  ownerId: string;
  recipeId: string;
  readiness: RecipeReadiness;
  category: FixedRecipeCategory;
  terminalState: ExecutionTerminalState;
  stdoutHash: string;
  stderrHash: string;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
  wallMs: number;
  startedAtIso: string;
  completedAtIso: string;
  effectiveLimits: EffectiveExecutionLimits;
  networkIsolation: "enforced" | "unavailable_refused";
  receiptHash: string;
};

/** Bounded audit record for one fixed-recipe execution attempt. */
export type BrokerExecutionAudit = {
  kind: "broker_fixed_recipe_execution";
  outcome: "completed" | "refused";
  errorCode: string | null;
  stage: string;
  proposalId: string;
  ownerId: string;
  sessionUuid: string;
  capabilityUseId: string | null;
  recipeId: string;
  readiness: RecipeReadiness;
  category: FixedRecipeCategory | null;
  exitCode: number | null;
  terminalReason: string | null;
  stdoutHash: string | null;
  stderrHash: string | null;
  truncated: boolean;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  wallMs: number | null;
  networkIsolation: "enforced" | "unavailable_refused" | "not_attempted";
  receiptHash: string | null;
  nonceHash: string;
  createdAtIso: string;
};

export type FixedRecipeExecutionResult =
  | {
      ok: true;
      outcome: "succeeded" | "failed";
      receipt: BrokerExecutionReceipt;
      audit: BrokerExecutionAudit;
    }
  | {
      ok: false;
      errorCode: string;
      reason: string;
      stage: string;
      audit: BrokerExecutionAudit;
      receipt: BrokerExecutionReceipt | null;
    };
