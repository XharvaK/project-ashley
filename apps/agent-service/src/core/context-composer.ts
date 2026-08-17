import type { DatabaseSync } from "node:sqlite";
import { buildQuestionsBlock } from "./state/questions.js";
import {
  loadNuclearSystemPrompt,
  type NuclearPromptChannel,
} from "./conversation/prompts.js";
import {
  listIdentity,
} from "./identity/store.js";
import {
  assembleMemoryBlock,
} from "./memory/assemble.js";
import { getState } from "./state/store.js";
import { getAffectiveState } from "./state/affect.js";
import { listActiveMindStateItems } from "./state/mind-items.js";
import {
  ensureEngineeringTables,
  loadCoordinatorTasks,
} from "./sandbox/engineering-runs.js";
import {
  isVerifiedRoundtripEffectEvidence,
  type OperationalClaimLicense,
} from "./sandbox/engineering-types.js";
import { deriveOperationalTruth } from "./sandbox/operational-truth.js";
import type {
  Decision,
  EvidenceRef,
  ProjectInspectionObservation,
} from "./types.js";
import { capabilityCanInfluence } from "./rollout/capabilities.js";

/** Product: composed turn context Expression consumes. */
export type TurnContext = {
  threadId: string;
  hotMessages: ReturnType<typeof assembleMemoryBlock>["hotMessages"];
  facts: ReturnType<typeof assembleMemoryBlock>["facts"];
  /** Memory-only block (no identity/state). */
  memoryBlock: string;
  /** Full system prompt: static nuclear prompts + peer blocks. */
  systemPrompt: string;
  /** Bounded structured Decision metadata for Expression (untrusted). */
  decisionPrompt: string;
};

export type ComposeTurnContextInput = {
  channel: NuclearPromptChannel;
  userMessage?: string;
  decision?: Decision;
  /** Current user message id — excluded from hot window / evidence text. */
  excludeMessageId?: number | null;
  /** Current user message entity uuid for correlation. */
  messageEntityUuid?: string | null;
  /** Extra Thought-selected refs beyond Decision.evidenceRefs. */
  evidenceRefs?: EvidenceRef[];
};

export function stableIdentityBlock(db: DatabaseSync, ownerId: string): string {
  const entries = listIdentity(db, ownerId, { layer: "stable", limit: 40 })
    .filter((entry) =>
      entry.kind === "value" ||
      entry.kind === "principle" ||
      entry.kind === "constitution" ||
      entry.kind.startsWith("value.") ||
      entry.kind.startsWith("principle."),
    );
  // Applicable stable boundaries arrive via Thought-selected evidence, not here.
  if (entries.length === 0) return "";
  const lines = entries.map((entry) => `- ${entry.kind}: ${entry.text}`);
  return [
    "## Ashley's stable identity",
    ...lines,
    "These are stable constitutional identity constraints.",
  ].join("\n");
}

function mindStateBlock(db: DatabaseSync, ownerId: string): string {
  const state = getState(db, ownerId);
  const affect = getAffectiveState(db, ownerId);
  const mindStateActive = capabilityCanInfluence(db, "mind_state");
  const affectActive = capabilityCanInfluence(db, "affect");
  const items = mindStateActive
    ? listActiveMindStateItems(db, ownerId, 12)
    : [];
  const lines = [
    state.focus ? `Focus: ${state.focus}` : "",
    state.mood ? `Mood: ${state.mood}` : "",
    state.availability ? `Availability: ${state.availability}` : "",
    state.unfinished.length > 0
      ? `Unfinished: ${state.unfinished.join("; ")}`
      : "",
    ...items.map(
      (item) =>
        `${item.kind}: ${item.text} (activation ${item.activation.toFixed(2)}, urgency ${item.urgency.toFixed(2)}, source ${item.sourceType}:${item.sourceId})`,
    ),
    affectActive
      ? `Affect: valence ${affect.valence.toFixed(2)}, activation ${affect.activation.toFixed(2)}, openness ${affect.openness.toFixed(2)}, tension ${affect.tension.toFixed(2)}. Cause: ${affect.reason}.`
      : "",
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return ["## Mind state", ...lines].join("\n");
}

/** Minimal mind-state headline (for the visible-fallback minimal profile). */
export function mindStateHeadline(
  db: DatabaseSync,
  ownerId: string,
): string {
  const state = getState(db, ownerId);
  const parts = [
    state.focus ? `Focus: ${state.focus}` : "",
    state.mood ? `Mood: ${state.mood}` : "",
    state.availability ? `Availability: ${state.availability}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : "";
}

function structuredDecisionPrompt(decision: Decision): string {
  return [
    "## Decision metadata (intent only; do not echo)",
    JSON.stringify({
      kind: decision.kind,
      shouldSpeak: decision.cognitiveAllocation.shouldSpeak,
      effort: decision.cognitiveAllocation.effort,
      completion: decision.cognitiveAllocation.completion,
      objective: decision.objective ?? null,
      reason: decision.reason,
      inspectionCognitiveResult: decision.inspectionCognitiveResult ?? null,
      uncertainty: decision.uncertainty,
      urgency: decision.urgency,
    }),
  ].join("\n");
}

export function operationalWorkBlock(
  db: DatabaseSync,
  ownerId: string,
  options?: {
    operationalLicense?: OperationalClaimLicense | null;
    inspectionObservation?: ProjectInspectionObservation | null;
  },
): string {
  const license = options?.operationalLicense;
  if (!license) return "";

  const truth = deriveOperationalTruth(license);

  ensureEngineeringTables(db);
  const tasks = loadCoordinatorTasks(db);
  const task = license.taskId
    ? tasks.find((t) => t.owner === ownerId && t.taskId === license.taskId)
    : undefined;

  if (task) {
    const lines = [
      `Status: ${task.status}`,
      `Profile: ${task.profile}`,
      `Task ID: ${task.taskId}`,
      task.startedAtMs ? `Started: ${new Date(task.startedAtMs).toISOString()}` : "",
      task.completedAtMs ? `Completed: ${new Date(task.completedAtMs).toISOString()}` : "",
      task.error ? `Error: ${task.error}` : "",
      task.refusal ? `Refusal: ${task.refusal}` : "",
    ].filter(Boolean);

    if (task.profile === "sandbox_workspace_file_roundtrip" && task.status === "completed") {
      if (isVerifiedRoundtripEffectEvidence(task.effectEvidence)) {
        lines.push(
          "Effect evidence: roundtrip verified (temporary file created, exact bytes verified on read, file deleted, verified absent).",
          "Current operational truth: verified_success (authoritative current-turn result; overrides generic capability self-model).",
        );
      } else {
        lines.push(
          "Effect evidence: unverified (task record is completed; verified effect evidence is unavailable).",
        );
      }
    }

    return [
      "## Operational work state (cognitive attention only)",
      ...lines,
    ].join("\n");
  }

  // Handle project_investigation (M2 project inspection operational metadata)
  if (license.profile === "project_investigation") {
    const lines = [
      `Status: ${truth.state === "verified_success" ? "succeeded" : truth.state !== "none" ? truth.state : license.state}`,
      `Profile: ${license.profile}`,
      license.taskId ? `Task ID: ${license.taskId}` : "",
      license.error ? `Error: ${license.error}` : "",
      license.refusalReason ? `Refusal: ${license.refusalReason}` : "",
    ].filter(Boolean);

    const obs = options?.inspectionObservation;
    if (truth.state === "verified_success" && obs) {
      lines.push(
        `Project ID: ${obs.projectId}`,
        `Operation: ${obs.operation}`,
        `Path: ${obs.path}`,
      );
      if (obs.operation === "project.search_text") {
        lines.push(`Pattern: ${obs.pattern}`);
      }
      if (obs.operation === "project.read_file") {
        lines.push(
          `Inspection evidence: verified read (${obs.bytes} bytes, SHA256: ${obs.sha256.substring(0, 12)}...).`,
        );
      } else if (obs.operation === "project.list_directory") {
        lines.push(
          `Inspection evidence: verified directory listing (${obs.entries.length} entries).`,
        );
      } else if (obs.operation === "project.search_text") {
        lines.push(
          `Inspection evidence: verified search (${obs.matches.length} matches across ${obs.filesScanned} files).`,
        );
      }
      if (obs.truncated) {
        lines.push(
          "Truncated: true (output was truncated at kernel bounds; zero matches or partial listings are not proof of absence across the entire project).",
        );
      }
      lines.push(
        "Current operational truth: verified_success (authoritative current-turn result; overrides generic capability self-model).",
      );
    } else if (license.state === "failed") {
      lines.push(
        `Inspection status: failed (${license.error ?? "unknown"}). No successful observation licensed.`,
      );
    }

    if (lines.length === 0) return "";
    return [
      "## Operational work state (cognitive attention only)",
      ...lines,
    ].join("\n");
  }

  // Direct license projection scoped specifically to sandbox_workspace_file_roundtrip
  if (license.profile !== "sandbox_workspace_file_roundtrip") {
    return "";
  }

  if (
    truth.state === "none" &&
    !truth.locked &&
    !license.taskId &&
    !license.error &&
    !license.refusalReason &&
    !license.effectEvidence
  ) {
    return "";
  }

  const lines = [
    `Status: ${truth.state === "verified_success" ? "succeeded" : truth.state !== "none" ? truth.state : license.state}`,
    `Profile: ${license.profile}`,
    license.taskId ? `Task ID: ${license.taskId}` : "",
    license.error ? `Error: ${license.error}` : "",
    license.refusalReason ? `Refusal: ${license.refusalReason}` : "",
  ].filter(Boolean);

  if (truth.state === "verified_success") {
    lines.push(
      "Effect evidence: roundtrip verified (temporary file created, exact bytes verified on read, file deleted, verified absent).",
      "Current operational truth: verified_success (authoritative current-turn result; overrides generic capability self-model).",
    );
  } else if (license.state === "succeeded") {
    lines.push(
      "Effect evidence: unverified (state is succeeded; verified effect evidence is unavailable; no completion licensed).",
    );
  }

  if (lines.length === 0) return "";

  return [
    "## Operational work state (cognitive attention only)",
    ...lines,
  ].join("\n");
}

/**
 * ContextComposer — sole owner of turn context assembly.
 * Assembles existing peer outputs; does not reinterpret, score, or rewrite them.
 * Omitting an empty peer section is assembly, not filtering.
 */
export function composeTurnContext(
  db: DatabaseSync,
  ownerId: string,
  input: ComposeTurnContextInput,
): TurnContext {
  const decision = input.decision;
  const evidenceRefs = [
    ...(decision?.evidenceRefs ?? []),
    ...(input.evidenceRefs ?? []),
  ];
  const memory = assembleMemoryBlock(db, ownerId, {
    userMessage: input.userMessage,
    excludeMessageId: input.excludeMessageId ?? null,
    evidenceRefs,
  });
  const identity = stableIdentityBlock(db, ownerId);
  const mindState = mindStateBlock(db, ownerId);
  const operational = operationalWorkBlock(db, ownerId, {
    operationalLicense: decision?.operationalLicense,
    inspectionObservation: decision?.inspectionObservation,
  });
  // Questions only when Thought selected question evidence or none selected yet
  // would dump — skip global question dump; selected questions arrive via evidence.
  const questions = "";
  void buildQuestionsBlock;
  const staticPrompt = loadNuclearSystemPrompt(input.channel);

  const peerSections = [
    identity,
    memory.memoryBlock
      ? `## Memory context\n${memory.memoryBlock}`
      : "",
    mindState,
    operational,
    questions,
  ].filter(Boolean);

  const systemPrompt = [staticPrompt, ...peerSections].join("\n\n");
  const decisionPrompt = decision ? structuredDecisionPrompt(decision) : "";

  return {
    threadId: memory.threadId,
    hotMessages: memory.hotMessages,
    facts: memory.facts,
    memoryBlock: memory.memoryBlock,
    systemPrompt,
    decisionPrompt,
  };
}
