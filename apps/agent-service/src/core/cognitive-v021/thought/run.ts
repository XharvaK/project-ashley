import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  completeChat,
} from "../../../mistral-client.js";
import type { ChatMessage } from "../../model-routing/types.js";
import {
  ORDINARY_THOUGHT_BUDGET_MS,
  THOUGHT_UNAVAILABLE_NOTICE,
  type CycleTriggerKind,
  type InboxEvent,
  type KernelDeps,
  type KernelRunResult,
  type PublishedCognitiveSettlement,
  type ThoughtCompleteOptions,
  type ThoughtInput,
  type ThoughtStepOutput,
  type ThoughtSettlementDraft,
  type Observation,
} from "../types.js";
import { getCycle, getCurrentCycle, admitCycle, appendCycleLogIds, updateCycleState } from "../cycle/inbox.js";
import { getConversationEvidence, listConversationEvidence } from "../evidence/conversation-log.js";
import { adaptPerception } from "../perception/adapter.js";
import { buildThoughtInput } from "./input.js";
import { parseThoughtStepOutput } from "./parse.js";
import { validateThoughtSettlementDraft } from "../settlement/validate.js";
import { publishSemanticTransaction } from "../settlement/publish.js";

export type ThoughtInvocation = {
  output: ThoughtStepOutput;
  attempts: number;
  requestId: string;
};

export type ThoughtCompleteInvoker = (
  messages: ChatMessage[],
  options: ThoughtCompleteOptions,
) => ReturnType<typeof completeChat>;

/** The single adapter boundary for Thought dispatch. attentionDb is mandatory. */
export async function invokeThoughtComplete(
  messages: ChatMessage[],
  options: ThoughtCompleteOptions,
  invoker: ThoughtCompleteInvoker = completeChat,
): ReturnType<typeof completeChat> {
  if (!options.attentionDb) throw new Error("dispatch_data_plane_missing");
  return invoker(messages, options);
}

function thoughtMessages(input: ThoughtInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Ashley's Thought layer.",
        "Return exactly one JSON ThoughtStepOutput or a flat ThoughtSettlementDraft.",
        "Code validates identity, authority, speech licensing, and publication.",
        "Do not return finalLicensedText, settlementId, delivery, outbox, reservation, or workspace state.",
      ].join(" "),
    },
    { role: "user", content: JSON.stringify(input) },
  ];
}

export async function runThoughtModel(
  input: ThoughtInput,
  deps: KernelDeps,
  options: { pass?: number; requestId?: string } = {},
): Promise<ThoughtInvocation> {
  const pass = options.pass ?? 1;
  const requestId = options.requestId ?? randomUUID();
  const dispatchOptions: ThoughtCompleteOptions = {
    attentionDb: deps.attentionDb,
    route: "thought",
    responseFormat: "json_object",
    purpose: "thought",
    lane: "urgent_grounded",
    ownerId: input.occupantId,
    deadlineAtMs: deps.nowMs() + ORDINARY_THOUGHT_BUDGET_MS,
    maxTokens: 6000,
    temperature: 0,
  };
  try {
    const completion = await invokeThoughtComplete(
      thoughtMessages(input),
      dispatchOptions,
      deps.completeChat,
    );
    const output = parseThoughtStepOutput(completion.text, {
      cycleId: input.cycleId,
      generation: input.generation,
      pass,
      requestId,
      occupantId: input.occupantId,
      authorityEpoch: input.authorityEpoch,
      consumedEffectIds: input.inFlight.filter((item) => item.status === "receipted").map((item) => item.effectId),
    });
    return { output, attempts: 1, requestId };
  } catch {
    return {
      output: {
        kind: "failure",
        cycleId: input.cycleId,
        generation: input.generation,
        pass,
        requestId,
        occupantId: input.occupantId,
        reason: "unavailable",
      },
      attempts: 1,
      requestId,
    };
  }
}

function payloadRecord(event: InboxEvent): Record<string, unknown> {
  return typeof event.payload === "object" && event.payload !== null && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
}

function triggerKind(value: unknown): CycleTriggerKind {
  switch (value) {
    case "owner_message":
    case "idle_opportunity":
    case "subscription_item":
    case "future_trigger_due":
    case "observation_or_receipt":
    case "recovery":
      return value;
    default:
      return "owner_message";
  }
}

function storeObservations(db: DatabaseSync, input: ThoughtInput, nowMs: number): void {
  const statement = db.prepare(
    `INSERT OR IGNORE INTO observations
       (observation_id, cycle_id, generation, derived, replay_safe, modality,
        payload_json, provenance, raw_outranks_derived_of, data_classification,
        secret_omitted, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const observation of input.observations) {
    statement.run(
      observation.observationId,
      input.cycleId,
      input.generation,
      observation.derived ? 1 : 0,
      observation.replaySafe ? 1 : 0,
      observation.modality,
      JSON.stringify(observation.payload ?? null),
      observation.provenance,
      observation.rawOutranksDerivedOf ?? null,
      observation.dataClassification,
      observation.secretOmitted ? 1 : 0,
      nowMs,
    );
  }
}

function storeThoughtStep(
  db: DatabaseSync,
  output: ThoughtStepOutput,
  nowMs: number,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO thought_steps
       (request_id, cycle_id, generation, pass, kind, payload_json, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    output.requestId,
    output.cycleId,
    output.generation,
    output.pass,
    output.kind,
    JSON.stringify(output),
    nowMs,
  );
}

function publishedSettlement(
  draft: ThoughtSettlementDraft,
  settlementId: string,
): PublishedCognitiveSettlement {
  const speech = draft.speech;
  return {
    ...draft,
    settlementId,
    speech: {
      ...speech,
      finalLicensedText: speech.mode === "draft" ? speech.surfaceDraft?.trim() ?? "" : null,
    },
  } as PublishedCognitiveSettlement;
}

function emptyResult(cycleId: string, generation: number, notice: string | null, attempts = 0): KernelRunResult {
  return {
    cycleId,
    generation,
    published: false,
    outboxId: null,
    infrastructureNotice: notice,
    thoughtModelAttempts: attempts,
    acceptedThoughtPasses: 0,
    composeCancelledAttempts: 0,
    acceptedSettlements: 0,
  };
}

/** Phase 02 kernel slice: assemble, perceive, run one Thought pass, validate, publish. */
export async function runCognitiveCycle(
  sidecar: DatabaseSync,
  _nuclear: DatabaseSync,
  event: InboxEvent,
  deps: KernelDeps,
): Promise<KernelRunResult> {
  const payload = payloadRecord(event);
  const requestedCycleId = typeof payload.cycleId === "string" ? payload.cycleId : null;
  let cycle = requestedCycleId ? getCycle(sidecar, requestedCycleId) : getCurrentCycle(sidecar, event.conversationId);
  if (!cycle) {
    cycle = admitCycle(sidecar, {
      conversationId: event.conversationId,
      triggerKind: triggerKind(event.kind),
      triggerRef: typeof payload.triggerRef === "string" ? payload.triggerRef : event.id,
      occupantId: typeof payload.occupantId === "string" ? payload.occupantId : null,
      authorityEpoch: typeof payload.authorityEpoch === "number" ? payload.authorityEpoch : 1,
      nowMs: deps.nowMs(),
    });
  }
  const triggerEvidence = typeof payload.evidenceRowId === "string"
    ? getConversationEvidence(sidecar, payload.evidenceRowId)
    : null;
  if (triggerEvidence) cycle = appendCycleLogIds(sidecar, cycle.cycleId, [triggerEvidence.rowId], deps.nowMs());
  cycle = updateCycleState(sidecar, cycle.cycleId, "assembling", deps.nowMs());

  const ownerMessage = typeof payload.ownerMessage === "string"
    ? payload.ownerMessage
    : triggerEvidence?.text ?? listConversationEvidence(sidecar, cycle.conversationId, { limit: 1 }).at(-1)?.text ?? "";
  let observations: Observation[];
  try {
    observations = await adaptPerception({
      cycleId: cycle.cycleId,
      generation: cycle.generation,
      ownerMessage,
      runPerception: deps.runPerception,
    });
  } catch {
    observations = [];
  }
  const input = buildThoughtInput({
    sidecar,
    cycle,
    triggerText: ownerMessage,
    triggerEvidence,
    constitution: deps.constitution,
    capabilityReality: deps.capabilityReality,
    observations,
    inFlight: [],
    runtimeCondition: { thoughtUnavailable: false },
  });
  storeObservations(sidecar, input, deps.nowMs());
  cycle = updateCycleState(sidecar, cycle.cycleId, "thinking", deps.nowMs());

  const invocation = await runThoughtModel(input, deps);
  storeThoughtStep(sidecar, invocation.output, deps.nowMs());
  if (invocation.output.kind !== "settlement") {
    updateCycleState(sidecar, cycle.cycleId, "silent", deps.nowMs());
    return emptyResult(cycle.cycleId, cycle.generation, THOUGHT_UNAVAILABLE_NOTICE, invocation.attempts);
  }
  const validation = validateThoughtSettlementDraft(invocation.output.settlement, {
    cycleId: cycle.cycleId,
    generation: cycle.generation,
    occupantId: cycle.occupantId,
    authorityEpoch: cycle.authorityEpoch,
  });
  if (!validation.ok) {
    updateCycleState(sidecar, cycle.cycleId, "silent", deps.nowMs());
    return emptyResult(cycle.cycleId, cycle.generation, THOUGHT_UNAVAILABLE_NOTICE, invocation.attempts);
  }
  const packs = deps.loadAuthorityPacks();
  const authority = deps.checkAuthority("settlement", {
    settlement: validation.draft,
    packs,
    authorityEpoch: cycle.authorityEpoch,
  });
  if (!authority.ok) {
    updateCycleState(sidecar, cycle.cycleId, "silent", deps.nowMs());
    return emptyResult(cycle.cycleId, cycle.generation, THOUGHT_UNAVAILABLE_NOTICE, invocation.attempts);
  }
  const settlement = publishedSettlement(validation.draft, randomUUID());
  const publication = publishSemanticTransaction(sidecar, settlement, { nowMs: deps.nowMs() });
  if (!publication.published) {
    return { ...emptyResult(cycle.cycleId, cycle.generation, null, invocation.attempts), acceptedThoughtPasses: 1 };
  }
  if (publication.outboxId !== null) await deps.projectOutbox(publication.outboxId);
  return {
    cycleId: cycle.cycleId,
    generation: cycle.generation,
    published: true,
    outboxId: publication.outboxId,
    infrastructureNotice: null,
    thoughtModelAttempts: invocation.attempts,
    acceptedThoughtPasses: 1,
    composeCancelledAttempts: 0,
    acceptedSettlements: publication.replayed ? 0 : 1,
  };
}
