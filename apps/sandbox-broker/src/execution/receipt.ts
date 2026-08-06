/**
 * Broker execution receipts (Sandbox Wave 4, Commit 9).
 *
 * A receipt is the durable, bounded evidence of one fixed-recipe run: it
 * carries the reservation id, the recipe identity, the typed terminal
 * state, output hashes and byte counts (never raw output), effective
 * limits, and a deterministic `receiptHash` over the receipt's own
 * canonical fields. No environment values or secrets ever enter a receipt.
 */

import { canonicalJson } from "../crypto/canonical-json.js";
import { sha256Hex } from "../crypto/types.js";
import type {
  BrokerExecutionReceipt,
  EffectiveExecutionLimits,
  ExecutionTerminalState,
  RecipeReadiness,
} from "./execution-types.js";
import type { FixedRecipeCategory } from "../policy/recipe-registry.js";

export type BuildReceiptInput = {
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
};

/**
 * Computes the deterministic receipt hash over the receipt's canonical
 * fields. The hash must never depend on secrets, environment, or raw
 * output — only on the fields that make the receipt itself.
 */
export function receiptHashOf(receipt: Omit<BrokerExecutionReceipt, "receiptHash">): string {
  const payload = {
    receiptId: receipt.receiptId,
    sessionUuid: receipt.sessionUuid,
    capabilityUseId: receipt.capabilityUseId,
    proposalId: receipt.proposalId,
    ownerId: receipt.ownerId,
    recipeId: receipt.recipeId,
    readiness: receipt.readiness,
    category: receipt.category,
    terminalState: receipt.terminalState,
    stdoutHash: receipt.stdoutHash,
    stderrHash: receipt.stderrHash,
    stdoutBytes: receipt.stdoutBytes,
    stderrBytes: receipt.stderrBytes,
    truncated: receipt.truncated,
    wallMs: receipt.wallMs,
    startedAtIso: receipt.startedAtIso,
    completedAtIso: receipt.completedAtIso,
    effectiveLimits: {
      wallMs: receipt.effectiveLimits.wallMs,
      maxProcesses: receipt.effectiveLimits.maxProcesses,
      maxOutputBytes: receipt.effectiveLimits.maxOutputBytes,
    },
    networkIsolation: receipt.networkIsolation,
  };
  return sha256Hex(canonicalJson(payload));
}

export function buildExecutionReceipt(input: BuildReceiptInput): BrokerExecutionReceipt {
  const withoutHash: Omit<BrokerExecutionReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    sessionUuid: input.sessionUuid,
    capabilityUseId: input.capabilityUseId,
    proposalId: input.proposalId,
    ownerId: input.ownerId,
    recipeId: input.recipeId,
    readiness: input.readiness,
    category: input.category,
    terminalState: input.terminalState,
    stdoutHash: input.stdoutHash,
    stderrHash: input.stderrHash,
    stdoutBytes: input.stdoutBytes,
    stderrBytes: input.stderrBytes,
    truncated: input.truncated,
    wallMs: input.wallMs,
    startedAtIso: input.startedAtIso,
    completedAtIso: input.completedAtIso,
    effectiveLimits: input.effectiveLimits,
    networkIsolation: input.networkIsolation,
  };
  return { ...withoutHash, receiptHash: receiptHashOf(withoutHash) };
}
