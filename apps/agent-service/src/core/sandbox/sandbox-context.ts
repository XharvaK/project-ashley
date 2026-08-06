/**
 * Bounded sandbox operator context (Sandbox Wave 4, Commit 10).
 *
 * Builds the ONLY textual context the operator adapter ever sees. The
 * context is derived from bounded task fields, the broker session snapshot,
 * the bound workspace id, and compact summaries of prior actions and
 * receipts. Everything else is excluded: identity documents, conversation
 * history, long-term memory, keys, signatures, capability tokens, raw
 * broker configuration, the environment, raw command output, raw paths,
 * SQLite rows and stack traces.
 *
 * The final string is length-bounded; history is compacted to the newest
 * entries first.
 */

import type { SandboxReceiptSummary } from "./operator-adapter.js";
import {
  summarizeSandboxOperatorAction,
  type SandboxOperatorAction,
} from "./operator-actions.js";
import type { SandboxTask } from "./task.js";
import type { SandboxBrokerSessionSnapshot } from "./broker-client.js";

export const MAX_SANDBOX_CONTEXT_CHARS = 32_000;
export const MAX_OBJECTIVE_PREVIEW_CHARS = 2000;
export const MAX_HISTORY_ENTRIES = 3;
export const MAX_SUMMARY_PREVIEW_CHARS = 300;
export const MAX_RECEIPT_REASON_CHARS = 200;

function clampPreview(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function receiptLine(receipt: SandboxReceiptSummary): string {
  const base = `${receipt.recipeId} outcome=${receipt.outcome}`;
  if (receipt.outcome === "refused") {
    return `${base} stage=${receipt.stage ?? "unknown"} code=${receipt.errorCode ?? "unknown"}`;
  }
  return `${base} exit=${receipt.exitCode ?? "unknown"} truncated=${receipt.truncated} stdoutBytes=${receipt.stdoutBytes ?? 0} stderrBytes=${receipt.stderrBytes ?? 0} wallMs=${receipt.wallMs ?? 0}`;
}

export type BuildBoundedSandboxContextInput = {
  task: SandboxTask;
  session: SandboxBrokerSessionSnapshot | null;
  workspace: { workspaceId: string } | null;
  previousAction: SandboxOperatorAction | null;
  previousActionInvalidReason: string | null;
  lastReceipt: SandboxReceiptSummary | null;
  history: readonly SandboxOperatorAction[];
  remainingModelCalls: number;
  remainingToolExecutions: number;
  deadlineAtMs: number;
  nowMs: number;
};

/**
 * Builds the bounded context string. Never throws; on any malformed input
 * it degrades to the constraints section only.
 */
export function buildBoundedSandboxContext(
  input: BuildBoundedSandboxContextInput,
): string {
  const lines: string[] = [];
  lines.push("SANDBOX OPERATOR TASK");
  lines.push(`taskId: ${clampPreview(input.task.taskId, 128)}`);
  lines.push(`role: ${input.task.role}`);
  lines.push(
    `objective: ${clampPreview(input.task.objective, MAX_OBJECTIVE_PREVIEW_CHARS)}`,
  );
  lines.push(
    `allowedCapabilities: ${input.task.allowedCapabilities.join(",")}`,
  );
  lines.push(
    `budget: modelCalls ${input.remainingModelCalls}/${input.task.maxModelCalls}, toolExecutions ${input.remainingToolExecutions}/${input.task.maxToolExecutions}`,
  );
  lines.push(`deadlineAtMs: ${input.deadlineAtMs}`);

  const session = input.session;
  if (session === null) {
    lines.push("session: none");
  } else {
    lines.push(`session: ${session.state} ${clampPreview(session.sessionUuid, 64)}`);
    lines.push(
      `sessionUsage: toolExecutions ${session.toolExecutionsUsed}/${session.maxToolExecutions}`,
    );
  }
  lines.push(
    input.workspace === null
      ? "workspace: none"
      : `workspace: ${clampPreview(input.workspace.workspaceId, 64)}`,
  );

  if (input.previousAction === null) {
    lines.push("previousAction: none");
  } else {
    lines.push(
      `previousAction: ${summarizeSandboxOperatorAction(input.previousAction)}`,
    );
  }
  if (input.previousActionInvalidReason !== null) {
    lines.push(`previousActionInvalid: ${clampPreview(input.previousActionInvalidReason, 200)}`);
  }

  lines.push(
    input.lastReceipt === null
      ? "lastReceipt: none"
      : `lastReceipt: ${clampPreview(receiptLine(input.lastReceipt), MAX_SUMMARY_PREVIEW_CHARS)}`,
  );

  lines.push("history:");
  const recent = input.history.slice(-MAX_HISTORY_ENTRIES);
  if (recent.length === 0) {
    lines.push("  (none)");
  } else {
    for (const action of recent) {
      lines.push(`  - ${summarizeSandboxOperatorAction(action)}`);
    }
  }

  lines.push("constraints:");
  lines.push(
    "  - you may only use the exact fixed recipes already listed in your allowed capabilities",
  );
  lines.push(
    "  - never emit credentials, secrets, environment values, keys, signatures or tokens",
  );
  lines.push("  - never propose raw commands, argv, env, or arbitrary file paths");
  lines.push("  - emit exactly one structured action per turn");
  lines.push(
    "  - request_owner_approval only when a needed action exceeds delegated safety",
  );
  lines.push("  - complete when the objective is satisfied; abort when it cannot continue");

  let context = lines.join("\n");
  if (context.length > MAX_SANDBOX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_SANDBOX_CONTEXT_CHARS);
  }
  return context;
}
