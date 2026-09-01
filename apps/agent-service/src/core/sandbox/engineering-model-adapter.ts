/**
 * Production thinking-model adapter for the engineering operator. Wraps
 * Ashley's existing Mistral chat pipeline (`completeChat`) so the operator's
 * structured-action reasoning uses the same model-routing/attention stack as
 * the rest of the agent. The model only returns a structured action object; it
 * never sees a raw shell, host paths, or signing material. The operator
 * re-validates and authorizes every returned action via the broker.
 */

import type { DatabaseSync } from "node:sqlite";
import { completeChat } from "../../mistral-client.js";
import { env } from "../../env.js";
import type { EngineeringOperatorContext, ThinkingModel } from "./engineering-types.js";

const SYSTEM_PROMPT = [
  "You are Ashley's engineering reasoning subagent (Autonomous Engineering Workstation).",
  "You drive a CLOSED action vocabulary only. Given the task objective, available",
  "diagnostics, and prior tool results, propose the single next bounded structured",
  "action. Respond with ONE JSON object shaped exactly as an EngineeringAction",
  "({ type, capability, fields }). Valid capabilities include: engineering_project_read,",
  "candidate_repository_git_write, candidate_workspace_create,",
  "candidate_workspace_read_write_delete, candidate_patch_generate,",
  "candidate_report_artifact_generate, fixed_test_recipe, fixed_build_recipe,",
  "fixed_lint_verification_recipe, bounded_diagnostic_execution,",
  "local_health_status_inspection,",
  "request_owner_approval, complete, abort. When the objective is met, emit",
  '{ "type": "complete", "capability": "complete", "fields": { "summary": "..." } }.',
  "Never emit shell commands, absolute host paths, or signing material.",
].join(" ");

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1]! : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("engineering_model_output_not_json");
  }
}

export function createEngineeringThinkingModel(attentionDb: DatabaseSync): ThinkingModel {
  return {
    route: "thinking",
    async proposeNextAction(ctx: EngineeringOperatorContext): Promise<unknown> {
      const user = JSON.stringify({
        taskId: ctx.taskId,
        objective: ctx.objective,
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        availableDiagnostics: ctx.availableDiagnostics,
        lastResults: ctx.lastResults,
        modelCallsUsed: ctx.modelCallsUsed,
        toolCallsUsed: ctx.toolCallsUsed,
        nowMs: ctx.nowMs,
      });
      const res = await completeChat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        {
          temperature: env.mistralChatTemperature,
          logicalRole: "engineering",
          specialistRequirement: { seat: "complex_orchestration" },
          attentionDb,
        },
      );
      return extractJsonObject(res.text ?? "");
    },
  };
}
