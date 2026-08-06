/**
 * Operator adapter boundary (Sandbox Wave 4, Commit 10).
 *
 * The loop talks to the model operator exclusively through this interface.
 * Only the injected fake adapter exists in this commit: it is a fixture
 * adapter (kind "fixture") and can never reach a real provider. The
 * interface carries a bounded turn input — never identity documents,
 * conversation history, memory, keys, signatures, tokens, raw paths or raw
 * tool output — and returns exactly one structured action.
 */

import type {
  SandboxOperatorAction,
} from "./operator-actions.js";
import type { SandboxTask } from "./task.js";
import type { SandboxBrokerSessionSnapshot } from "./broker-client.js";

export type SandboxReceiptSummary = {
  recipeId: string;
  outcome: "succeeded" | "failed" | "refused";
  stage: string | null;
  errorCode: string | null;
  exitCode: number | null;
  truncated: boolean;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  wallMs: number | null;
};

export type SandboxOperatorTurnInput = {
  task: SandboxTask;
  context: string;
  session: SandboxBrokerSessionSnapshot | null;
  workspace: { workspaceId: string } | null;
  previousAction: SandboxOperatorAction | null;
  previousActionInvalidReason: string | null;
  lastReceipt: SandboxReceiptSummary | null;
  remainingModelCalls: number;
  remainingToolExecutions: number;
  deadlineAtMs: number;
  nowMs: number;
};

export type SandboxOperatorTurnOutput =
  | { ok: true; action: SandboxOperatorAction }
  | { ok: false; transient: boolean; reason: string };

export interface SandboxOperatorAdapter {
  /** "fixture" adapters are injected test fakes; "production" is not yet wired. */
  readonly kind: "fixture" | "production";
  proposeNextAction(
    input: SandboxOperatorTurnInput,
    signal?: AbortSignal,
  ): Promise<SandboxOperatorTurnOutput>;
}

export type FakeSandboxOperatorStep =
  | { action: SandboxOperatorAction }
  | { rawAction: unknown }
  | { failure: { transient: boolean; reason: string } };

/**
 * Scripted fixture adapter. Each turn consumes the next step in order; the
 * final step repeats once exhausted. Raw steps emit unvalidated values so
 * the loop's strict validation can be exercised. All received turn inputs
 * are recorded for assertions.
 */
export class FakeSandboxOperatorAdapter implements SandboxOperatorAdapter {
  readonly kind = "fixture" as const;
  readonly turns: SandboxOperatorTurnInput[] = [];
  readonly outputs: SandboxOperatorTurnOutput[] = [];
  private readonly steps: readonly FakeSandboxOperatorStep[];
  private readonly fallback: SandboxOperatorAction;
  private cursor = 0;

  constructor(
    steps: readonly FakeSandboxOperatorStep[] = [],
    fallback: SandboxOperatorAction = { type: "complete", summary: "fixture done" },
  ) {
    this.steps = steps;
    this.fallback = fallback;
  }

  get turnCount(): number {
    return this.turns.length;
  }

  async proposeNextAction(
    input: SandboxOperatorTurnInput,
    _signal?: AbortSignal,
  ): Promise<SandboxOperatorTurnOutput> {
    this.turns.push(input);
    const step =
      this.steps.length === 0
        ? null
        : this.steps[Math.min(this.cursor, this.steps.length - 1)];
    this.cursor += 1;
    let output: SandboxOperatorTurnOutput;
    if (step === null) {
      output = { ok: true, action: this.fallback };
    } else if ("failure" in step) {
      output = { ok: false, transient: step.failure.transient, reason: step.failure.reason };
    } else if ("rawAction" in step) {
      output = { ok: true, action: step.rawAction as SandboxOperatorAction };
    } else {
      output = { ok: true, action: step.action };
    }
    this.outputs.push(output);
    return output;
  }
}
