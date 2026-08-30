import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  completeChat,
} from "../../../mistral-client.js";
import type { ChatMessage } from "../../model-routing/types.js";
import {
  ORDINARY_THOUGHT_BUDGET_MS,
  MAX_AUTHORITY_REVISIONS,
  MAX_EFFECT_ROUNDS,
  MAX_OBSERVATION_ROUNDS,
  MAX_THOUGHT_PASSES,
  MAX_THOUGHT_MODEL_ATTEMPTS,
  type CycleTriggerKind,
  type InboxEvent,
  type KernelDeps,
  type KernelRunResult,
  type PublishedCognitiveSettlement,
  type ThoughtCompleteOptions,
  type ThoughtInput,
  type ThoughtParserFailureCode,
  type ThoughtStepOutput,
  type ThoughtSettlementDraft,
  type Observation,
  type DeliveryIntent,
  type RememberDirective,
  type AuthorityCode,
} from "../types.js";
import { getCycle, getCurrentCycle, admitCycle, appendCycleLogIds, updateCycleState } from "../cycle/inbox.js";
import { getConversationEvidence, listConversationEvidence } from "../evidence/conversation-log.js";
import { listInFlight } from "../effect/in-flight.js";
import { dispatchEffect } from "../effect/proposal.js";
import { registerActiveThought } from "../cycle/active.js";
import { adaptPerception } from "../perception/adapter.js";
import { buildThoughtInput } from "./input.js";
import { parseThoughtStepOutput } from "./parse.js";
import {
  thoughtOutputCompatibilityInstruction,
  thoughtOutputStructuredRequest,
} from "./output-contract.js";
import {
  ProjectionCache,
  semanticPassKey,
  hashAuthorityObjections,
} from "./projection-allocator/cache.js";
import {
  allocateThoughtProjection,
  RequiredOverflowError,
  thoughtMessagesForProjection,
  type AllocatedThoughtProjection,
} from "./projection-allocator/allocator.js";
import {
  type ProjectedThoughtInput,
  computeSemanticProjectionHash,
  computeDispatchMessagesHash,
} from "./projection.js";
import { validateThoughtSettlementDraft } from "../settlement/validate.js";
import { getPublishedSettlementIdentity, publishSemanticTransaction } from "../settlement/publish.js";
import { admitOwnerSuppliedClaim } from "../memory/admission.js";
import { recordDiagnostic } from "./diagnostics.js";
import { metadataFromError } from "../../model-fabric/receipts.js";
import { fidelityCheck } from "../speech/fidelity.js";
import { emitInfrastructureNotice } from "../speech/infrastructure-notice.js";
import { renderForTransport } from "../../conversation/rendering.js";
import {
  getThoughtAttemptCounters,
  incrementThoughtAttemptCounter,
  type ThoughtAttemptCounters,
} from "./counters.js";

export type ThoughtInvocation = {
  output: ThoughtStepOutput;
  attempts: number;
  requestId: string;
  malformed?: boolean;
  unavailable?: boolean;
  cancelled?: boolean;
};

export type ThoughtCompleteInvoker = (
  messages: ChatMessage[],
  options: ThoughtCompleteOptions,
) => ReturnType<typeof completeChat>;

/**
 * Caller-owned structural retry narrowing. The Model Fabric policy remains
 * authoritative at 4096 for the primary Thought request; this bound only
 * keeps a corrective retry admissible under the shared rolling TPM contract.
 */
export const STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS = 2_048;

/** The single adapter boundary for Thought dispatch. attentionDb is mandatory. */
export async function invokeThoughtComplete(
  messages: ChatMessage[],
  options: ThoughtCompleteOptions,
  invoker: ThoughtCompleteInvoker = completeChat,
): ReturnType<typeof completeChat> {
  if (!options.attentionDb) throw new Error("dispatch_data_plane_missing");
  return invoker(messages, options);
}

const STRUCTURAL_FEEDBACK: Readonly<Record<ThoughtParserFailureCode, string>> = {
  invalid_json: "Return exactly one JSON object.",
  root_not_object: "Return a JSON object at the root.",
  wrong_kind: "Use one permitted ThoughtStepOutput kind.",
  identity_missing: "Include every required Thought identity field.",
  identity_mismatch: "Preserve the active Thought identity fields.",
  missing_settlement_fields: "Include all required settlement sections.",
  speech_contract_failure: "Emit the required speech object shape.",
  commitment_contract_failure: "Emit the required commitments object shape.",
  operations_contract_failure: "Emit the required operations object shape.",
  authority_contract_failure: "Emit the required authority object shape.",
  observation_contract_failure: "Emit the required observation request shape.",
  effect_contract_failure: "Emit the required effect proposal shape.",
  forbidden_fields: "Omit publication and delivery fields.",
  schema_version_mismatch: "Use the active Thought schema version.",
  other: "Match the ThoughtStepOutput contract exactly.",
};

function thoughtMessages(
  input: ThoughtInput,
  structuralFeedback?: ThoughtParserFailureCode,
): ChatMessage[] {
  const feedback = structuralFeedback
    ? `The previous response failed bounded structural validation (${structuralFeedback}). ${STRUCTURAL_FEEDBACK[structuralFeedback]} Do not change the semantic answer or invent authority.`
    : null;
  return [
    {
      role: "system",
      content: [
        "You are Ashley's Thought layer.",
        "Return exactly one JSON ThoughtStepOutput or a flat ThoughtSettlementDraft.",
        thoughtOutputCompatibilityInstruction(),
        "Code validates identity, authority, speech licensing, and publication.",
        "Do not return finalLicensedText, settlementId, delivery, outbox, reservation, or workspace state.",
        ...(feedback ? [feedback] : []),
      ].join(" "),
    },
    { role: "user", content: JSON.stringify(input) },
  ];
}

export async function runThoughtModel(
  input: ThoughtInput | ProjectedThoughtInput,
  deps: KernelDeps,
  options: {
    pass?: number;
    requestId?: string;
    signal?: AbortSignal;
    deadlineAtMs: number;
    structuralFeedback?: ThoughtParserFailureCode;
    /** Optional caller narrowing; it may never widen the Model Fabric policy. */
    maxTokens?: number;
  },
): Promise<ThoughtInvocation> {
  const pass = options.pass ?? 1;
  const requestId = options.requestId ?? randomUUID();
  const dispatchOptions: ThoughtCompleteOptions = {
    attentionDb: deps.attentionDb,
    route: "thought",
    responseFormat: "json_schema",
    structuredOutput: thoughtOutputStructuredRequest(),
    purpose: "thought",
    lane: "urgent_grounded",
    ownerId: input.occupantId,
    deadlineAtMs: options.deadlineAtMs,
    maxTokens: options.maxTokens,
    temperature: 0.15,
    signal: options.signal,
  };
  let messages: ChatMessage[] | undefined;
  let semanticProjectionHash: string | undefined;
  let dispatchMessagesHash: string | undefined;

  try {
    if ("rawConversation" in input && input.retrieval && Array.isArray(input.retrieval.hits)) {
      const firstHit = input.retrieval.hits[0];
      if (!firstHit || !("supportRefs" in (firstHit as object))) {
        messages = thoughtMessagesForProjection(input as ProjectedThoughtInput, options.structuralFeedback);
        semanticProjectionHash = computeSemanticProjectionHash(input as ProjectedThoughtInput);
        dispatchMessagesHash = computeDispatchMessagesHash(messages);
      } else {
        const allocated = allocateThoughtProjection({
          thoughtInput: input as ThoughtInput,
          requestId,
          structuralFeedback: options.structuralFeedback,
        });
        messages = allocated.messages;
        semanticProjectionHash = allocated.hashes.semanticProjectionHash;
        dispatchMessagesHash = allocated.hashes.dispatchMessagesHash;
      }
    } else {
      messages = thoughtMessages(input as ThoughtInput, options.structuralFeedback);
      dispatchMessagesHash = computeDispatchMessagesHash(messages);
    }

    if (semanticProjectionHash && dispatchMessagesHash) {
      dispatchOptions.projectionIdentity = {
        semanticProjectionHash,
        dispatchMessagesHash,
      };
    }

    const completion = await invokeThoughtComplete(
      messages,
      dispatchOptions,
      deps.completeChat,
    );
    if (options.signal?.aborted) {
      return {
        output: {
          kind: "failure",
          cycleId: input.cycleId,
          generation: input.generation,
          pass,
          requestId,
          occupantId: input.occupantId,
          reason: "cancelled",
        },
        attempts: 1,
        requestId,
        cancelled: true,
      };
    }
    const output = parseThoughtStepOutput(completion.text, {
      cycleId: input.cycleId,
      generation: input.generation,
      pass,
      requestId,
      occupantId: input.occupantId,
      authorityEpoch: input.authorityEpoch,
      consumedEffectIds: input.inFlight.filter((item) => item.status === "receipted").map((item) => item.effectId),
    });
    return {
      output,
      attempts: 1,
      requestId,
      malformed: output.kind === "failure" && output.reason === "malformed",
    };
  } catch (error) {
    const cancelled = options.signal?.aborted === true
      || (error instanceof Error && error.name === "AbortError");
    if (!cancelled && deps.observabilityDb) {
      try {
        const mfMeta = metadataFromError(error);
        if (mfMeta && mfMeta.failoverSuppressed === "transport_failover_unavailable_for_projection") {
          const receipt = mfMeta.receipt;
          const resolvedReceipt = receipt && receipt.receiptStage === "resolved" ? receipt : null;
          const primaryAttempt = resolvedReceipt && resolvedReceipt.attempts.length > 0 ? resolvedReceipt.attempts[0] : null;
          const primaryAttemptId =
            resolvedReceipt?.finalAttemptId ??
            (primaryAttempt as any)?.attemptId ??
            (receipt as any)?.attemptId ??
            null;
          const primaryProvider =
            mfMeta.resolvedRoute?.provider ??
            (primaryAttempt && "facts" in primaryAttempt ? (primaryAttempt as any).facts?.provider : null) ??
            (receipt as any)?.provider ??
            null;
          recordDiagnostic(deps.observabilityDb, {
            cycleId: input.cycleId,
            generation: input.generation,
            requestId,
            pass,
            code: "transport_failover_unavailable_for_projection",
            stage: "provider_dispatch",
            dispatchTruth: "not_sent",
            quotaBucket: mfMeta.suppressedBucket ?? (mfMeta.resolvedRoute ? mfMeta.resolvedRoute.quotaClass : null),
            semanticProjectionHash: mfMeta.semanticProjectionHash ?? semanticProjectionHash,
            dispatchMessagesHash: mfMeta.dispatchMessagesHash ?? dispatchMessagesHash,
            primaryProvider,
            primaryAttemptId,
            primaryDispatchTruth: "sent",
            suppressedProvider: mfMeta.suppressedProvider ?? "groq",
            fallbackAttemptOrdinal: 2,
            fallbackFromAttemptId: primaryAttemptId,
            secondaryDispatchTruth: "not_sent",
            createdAtMs: deps.nowMs(),
          });
        } else if ((error as { code?: string })?.code === "request_exceeds_tpm_budget") {
          recordDiagnostic(deps.observabilityDb, {
            cycleId: input.cycleId,
            generation: input.generation,
            requestId,
            pass,
            code: "request_exceeds_tpm_budget",
            stage: "attention_admission",
            dispatchTruth: "not_sent",
            semanticProjectionHash,
            dispatchMessagesHash,
            createdAtMs: deps.nowMs(),
          });
        }
      } catch {
        // Observability DB persistence failures must not block thought execution
      }
    }
    return {
      output: {
        kind: "failure",
        cycleId: input.cycleId,
        generation: input.generation,
        pass,
        requestId,
        occupantId: input.occupantId,
        reason: cancelled ? "cancelled" : "unavailable",
      },
      attempts: 1,
      requestId,
      unavailable: !cancelled,
      cancelled,
    };
  }
}

function payloadRecord(event: InboxEvent): Record<string, unknown> {
  return typeof event.payload === "object" && event.payload !== null && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
}

function rememberDirective(payload: Record<string, unknown>): RememberDirective | null {
  if (
    payload.rememberRequested !== true ||
    typeof payload.evidenceLineageId !== "string" ||
    typeof payload.evidenceRowId !== "string"
  ) return null;
  const classification = payload.dataClassification;
  if (
    classification !== "ordinary" &&
    classification !== "sensitive" &&
    classification !== "never_public" &&
    classification !== "secret"
  ) return null;
  return {
    rememberRequested: true,
    evidenceLineageId: payload.evidenceLineageId,
    evidenceRowId: payload.evidenceRowId,
    dataClassification: classification,
  };
}

function suppliedObservations(
  payload: Record<string, unknown>,
  cycle: { cycleId: string; generation: number },
): Observation[] {
  if (!Array.isArray(payload.observations)) return [];
  const modalities = new Set<Observation["modality"]>([
    "text", "image", "page", "tool", "subscription", "receipt",
  ]);
  return payload.observations.flatMap((value): Observation[] => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const observationId = typeof item.observationId === "string" ? item.observationId : "";
    const provenance = typeof item.provenance === "string" ? item.provenance : "";
    const modality = item.modality;
    if (!observationId || !provenance || !modalities.has(modality as Observation["modality"])) return [];
    const classification = item.dataClassification;
    if (
      classification !== "ordinary" &&
      classification !== "sensitive" &&
      classification !== "never_public" &&
      classification !== "secret"
    ) return [];
    return [{
      observationId,
      cycleId: cycle.cycleId,
      generation: cycle.generation,
      derived: item.derived === true,
      replaySafe: item.replaySafe === true,
      modality: modality as Observation["modality"],
      payload: item.payload,
      provenance,
      ...(typeof item.rawOutranksDerivedOf === "string"
        ? { rawOutranksDerivedOf: item.rawOutranksDerivedOf }
        : {}),
      dataClassification: classification,
      secretOmitted: item.secretOmitted === true,
    }];
  });
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

function deliveryIntentFor(
  cycle: { conversationId: string; triggerKind: CycleTriggerKind },
  payload: Record<string, unknown>,
  purpose: DeliveryIntent["purpose"],
): DeliveryIntent {
  const trigger: DeliveryIntent["trigger"] =
    cycle.triggerKind === "idle_opportunity" ? "idle" :
      cycle.triggerKind === "subscription_item" ? "subscription" :
        cycle.triggerKind === "future_trigger_due" ? "future_trigger" :
          cycle.triggerKind === "recovery" ? "recovery" :
            cycle.triggerKind === "observation_or_receipt" ? "operation_completion" :
              "owner_message_reactive";
  const ownerId = typeof payload.ownerId === "string" && payload.ownerId.trim()
    ? payload.ownerId
    : cycle.conversationId;
  const channel = typeof payload.channel === "string" && payload.channel.trim()
    ? payload.channel
    : "discord";
  const threadId = typeof payload.threadId === "string" && payload.threadId.trim()
    ? payload.threadId
    : cycle.conversationId;
  return {
    ownerId,
    channel,
    threadId,
    conversationId: cycle.conversationId,
    trigger,
    deliveryLane: trigger === "owner_message_reactive" ? "reactive" : "proactive",
    purpose,
  };
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

function persistedMalformedRetries(
  db: DatabaseSync,
  cycleId: string,
  generation: number,
  pass: number,
): number {
  let count = 0;
  for (const row of db.prepare(
    `SELECT payload_json
       FROM thought_steps
      WHERE cycle_id = ? AND generation = ? AND pass = ? AND kind = 'failure'`,
  ).all(cycleId, generation, pass) as Array<Record<string, unknown>>) {
    try {
      const payload = JSON.parse(String(row.payload_json ?? "")) as { reason?: unknown };
      if (payload.reason === "malformed") count += 1;
    } catch {
      /* A malformed failure row is not evidence of a structural retry. */
    }
  }
  return count;
}

function publishedSettlement(
  draft: ThoughtSettlementDraft,
  settlementId: string,
  finalLicensedText: string | null,
): PublishedCognitiveSettlement {
  const speech = draft.speech;
  return {
    ...draft,
    settlementId,
    speech: {
      ...speech,
      finalLicensedText,
    },
  } as PublishedCognitiveSettlement;
}

function resultWithCounters(
  cycleId: string,
  generation: number,
  notice: string | null,
  counters: ThoughtAttemptCounters,
): KernelRunResult {
  return {
    cycleId,
    generation,
    published: false,
    outboxId: null,
    infrastructureNotice: notice,
    thoughtModelAttempts: counters.thoughtModelAttempts,
    acceptedThoughtPasses: counters.acceptedThoughtPasses,
    composeCancelledAttempts: counters.composeCancelledAttempts,
    acceptedSettlements: 0,
  };
}

function currentGenerationIs(
  db: DatabaseSync,
  cycle: { cycleId: string; conversationId: string; generation: number },
): boolean {
  const current = getCurrentCycle(db, cycle.conversationId, { includeIdle: true });
  return current?.cycleId === cycle.cycleId && current.generation === cycle.generation;
}

const REVISABLE_AUTHORITY_CODES = new Set<AuthorityCode>([
  "CURRENTNESS_UNVERIFIED",
  "RECEIPT_REQUIRED",
  "RECEIPT_CONTRADICTS_CLAIM",
  "IN_FLIGHT_UNKNOWN",
  "STALE_STATE",
  "DRAFT_COMMITMENT_CONFLICT",
  "EMPTY_COMMITMENTS_WITH_DRAFT",
]);

function revisable(codes: readonly string[]): boolean {
  return codes.length > 0 && codes.every((code) => REVISABLE_AUTHORITY_CODES.has(code as AuthorityCode));
}

function uniqueAuthorityCodes(codes: readonly string[]): AuthorityCode[] {
  return [...new Set(codes)].filter((code): code is AuthorityCode =>
    REVISABLE_AUTHORITY_CODES.has(code as AuthorityCode),
  );
}

/** Phase 02 kernel slice: assemble, perceive, run one Thought pass, validate, publish. */
export async function runCognitiveCycle(
  sidecar: DatabaseSync,
  _nuclear: DatabaseSync,
  event: InboxEvent,
  deps: KernelDeps,
): Promise<KernelRunResult> {
  const payload = payloadRecord(event);
  const directive = rememberDirective(payload);
  const requestedCycleId = typeof payload.cycleId === "string" ? payload.cycleId : null;
  const existingCycle = requestedCycleId ? getCycle(sidecar, requestedCycleId) : getCurrentCycle(sidecar, event.conversationId);
  let cycle = existingCycle ?? admitCycle(sidecar, {
      conversationId: event.conversationId,
      triggerKind: triggerKind(event.kind),
      triggerRef: typeof payload.triggerRef === "string" ? payload.triggerRef : event.id,
      occupantId: typeof payload.occupantId === "string" ? payload.occupantId : null,
      authorityEpoch: typeof payload.authorityEpoch === "number" ? payload.authorityEpoch : 1,
      nowMs: deps.nowMs(),
    });
  let triggerEvidence = typeof payload.evidenceRowId === "string"
    ? getConversationEvidence(sidecar, payload.evidenceRowId)
    : null;
  if (triggerEvidence) cycle = appendCycleLogIds(sidecar, cycle.cycleId, [triggerEvidence.rowId], deps.nowMs());
  cycle = updateCycleState(sidecar, cycle.cycleId, "assembling", deps.nowMs());
  const admittedCycle = cycle;
  const existingPublication = getPublishedSettlementIdentity(
    sidecar,
    admittedCycle.cycleId,
    admittedCycle.generation,
  );
  if (existingPublication) {
    const counters = getThoughtAttemptCounters(sidecar, admittedCycle.cycleId, admittedCycle.generation);
    return {
      cycleId: admittedCycle.cycleId,
      generation: admittedCycle.generation,
      published: true,
      outboxId: existingPublication.outboxId,
      infrastructureNotice: null,
      thoughtModelAttempts: counters.thoughtModelAttempts,
      acceptedThoughtPasses: counters.acceptedThoughtPasses,
      composeCancelledAttempts: counters.composeCancelledAttempts,
      acceptedSettlements: 0,
    };
  }
  const emitFailure = async (reason: string): Promise<KernelRunResult> => {
    const counters = getThoughtAttemptCounters(sidecar, admittedCycle.cycleId, admittedCycle.generation);
    if (!currentGenerationIs(sidecar, admittedCycle)) return resultWithCounters(admittedCycle.cycleId, admittedCycle.generation, null, counters);
    const notice = emitInfrastructureNotice(sidecar, {
      ownerId: typeof payload.ownerId === "string" ? payload.ownerId : admittedCycle.occupantId,
      channel: typeof payload.channel === "string" ? payload.channel : "discord",
      threadId: typeof payload.threadId === "string" ? payload.threadId : admittedCycle.conversationId,
      conversationId: admittedCycle.conversationId,
      cycleId: admittedCycle.cycleId,
      generation: admittedCycle.generation,
      reason,
      origin: deps.origin,
      trigger: deliveryIntentFor(admittedCycle, payload, "system_notice").trigger,
      deliveryLane: deliveryIntentFor(admittedCycle, payload, "system_notice").deliveryLane,
    });
    if (deps.projectSystemNotice) await deps.projectSystemNotice(notice.noticeId);
    updateCycleState(sidecar, admittedCycle.cycleId, "silent", deps.nowMs());
    return resultWithCounters(admittedCycle.cycleId, admittedCycle.generation, notice.noticeText, counters);
  };

  let ownerMessage = typeof payload.ownerMessage === "string"
    ? payload.ownerMessage
    : triggerEvidence?.text ?? listConversationEvidence(sidecar, cycle.conversationId, { limit: 1 }).at(-1)?.text ?? "";
  const perceive = async (): Promise<Observation[]> => {
    try {
      const perceived = await adaptPerception({
        cycleId: cycle.cycleId,
        generation: cycle.generation,
        ownerMessage,
        runPerception: deps.runPerception,
      });
      return [...suppliedObservations(payload, cycle), ...perceived];
    } catch {
      return suppliedObservations(payload, cycle);
    }
  };
  let observationsForThought = await perceive();
  let inFlight = listInFlight(sidecar, cycle.cycleId);
  let counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
  let pass = counters.acceptedThoughtPasses + 1;
  let structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
  let authorityObjections: AuthorityCode[] = [];
  const thoughtDeadlineAtMs = deps.nowMs() + ORDINARY_THOUGHT_BUDGET_MS;
  let structuralFeedback: ThoughtParserFailureCode | null = null;
  const projectionCache = new ProjectionCache<AllocatedThoughtProjection>();

  for (;;) {
    counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
    structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
    if (!currentGenerationIs(sidecar, cycle)) return resultWithCounters(cycle.cycleId, cycle.generation, null, counters);
    if (deps.nowMs() >= thoughtDeadlineAtMs) return emitFailure("thought_deadline");
    if (counters.acceptedThoughtPasses >= MAX_THOUGHT_PASSES || counters.thoughtModelAttempts >= MAX_THOUGHT_MODEL_ATTEMPTS) {
      return emitFailure("pass_exhausted");
    }
    const rawConversationIds = listConversationEvidence(sidecar, cycle.conversationId, { limit: 12 }).map((r) => r.rowId);
    const passKey = semanticPassKey({
      cycleId: cycle.cycleId,
      generation: cycle.generation,
      pass,
      observationsCount: observationsForThought.length,
      inFlightCount: inFlight.length,
      authorityObjectionsHash: hashAuthorityObjections(authorityObjections),
      composeLogIds: rawConversationIds,
      rememberDirectivePresent: Boolean(directive),
    });

    let allocated: AllocatedThoughtProjection;
    try {
      if (structuralFeedback && projectionCache.has(passKey)) {
        const cached = projectionCache.get(passKey)!;
        const messages = thoughtMessagesForProjection(cached.projected, structuralFeedback);
        allocated = {
          ...cached,
          messages,
        };
      } else {
        const input = buildThoughtInput({
          sidecar,
          cycle,
          triggerText: ownerMessage,
          triggerEvidence,
          constitution: deps.constitution,
          capabilityReality: deps.capabilityReality,
          observations: observationsForThought,
          inFlight,
          runtimeCondition: { thoughtUnavailable: false },
          rememberDirective: directive,
          authorityObjections,
          derivedStore: deps.derivedStore,
        });
        storeObservations(sidecar, input, deps.nowMs());
        allocated = allocateThoughtProjection({
          sidecar,
          thoughtInput: input,
          requestId: randomUUID(),
          structuralFeedback: structuralFeedback ?? undefined,
          observabilityDb: deps.observabilityDb,
        });
        projectionCache.set(passKey, allocated);
      }
    } catch (err) {
      if (err instanceof RequiredOverflowError) {
        if (deps.observabilityDb) {
          try {
            recordDiagnostic(deps.observabilityDb, {
              cycleId: cycle.cycleId,
              generation: cycle.generation,
              requestId: randomUUID(),
              pass,
              code: "context_allocation_required_overflow",
              stage: "allocation",
              dispatchTruth: "not_sent",
              createdAtMs: deps.nowMs(),
            });
          } catch {
            // ignore
          }
        }
        return emitFailure("context_allocation_required_overflow");
      }
      throw err;
    }

    cycle = updateCycleState(sidecar, cycle.cycleId, "thinking", deps.nowMs());
    if (counters.thoughtModelAttempts >= MAX_THOUGHT_MODEL_ATTEMPTS) return emitFailure("pass_exhausted");
    const controller = new AbortController();
    const activeThought = registerActiveThought(cycle.conversationId, cycle.cycleId, cycle.generation, controller);
    incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "thoughtModelAttempts");
    const invocation = await runThoughtModel(allocated.projected, deps, {
      pass,
      signal: activeThought.signal,
      deadlineAtMs: thoughtDeadlineAtMs,
      structuralFeedback: structuralFeedback ?? undefined,
      maxTokens: structuralFeedback
        ? STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS
        : undefined,
    });
    const cancellationReason = activeThought.cancellationReason;
    activeThought.unregister();
    storeThoughtStep(sidecar, invocation.output, deps.nowMs());

    if (cancellationReason || invocation.cancelled) {
      if (cancellationReason === "compose" && currentGenerationIs(sidecar, cycle)) {
        incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "composeCancelledAttempts");
        cycle = getCycle(sidecar, cycle.cycleId) ?? cycle;
        const latest = listConversationEvidence(sidecar, cycle.conversationId, { limit: 1000 }).at(-1);
        triggerEvidence = latest ?? triggerEvidence;
        ownerMessage = latest?.text ?? ownerMessage;
        observationsForThought = await perceive();
        inFlight = listInFlight(sidecar, cycle.cycleId);
        authorityObjections = [];
        structuralFeedback = null;
        counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
        pass = counters.acceptedThoughtPasses + 1;
        structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
        continue;
      }
      counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
      return resultWithCounters(cycle.cycleId, cycle.generation, null, counters);
    }

    if (invocation.malformed) {
      structuralFeedback = invocation.output.kind === "failure"
        ? invocation.output.diagnosticCode ?? "other"
        : "other";
      if (deps.observabilityDb) {
        try {
          recordDiagnostic(deps.observabilityDb, {
            cycleId: cycle.cycleId,
            generation: cycle.generation,
            requestId: allocated.receipt.requestId ?? randomUUID(),
            pass,
            code: "parser_malformed",
            stage: "parser",
            dispatchTruth: "not_sent",
            semanticProjectionHash: allocated.hashes.semanticProjectionHash,
            dispatchMessagesHash: allocated.hashes.dispatchMessagesHash,
            createdAtMs: deps.nowMs(),
          });
        } catch {
          // ignore
        }
      }
      if (structuralRetriesForPass < 2 && counters.thoughtModelAttempts < MAX_THOUGHT_MODEL_ATTEMPTS) {
        structuralRetriesForPass += 1;
        incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "structuralRetries");
        continue;
      }
      return emitFailure("malformed");
    }
    if (invocation.unavailable) return emitFailure("unavailable");

    structuralFeedback = null;

    incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "acceptedThoughtPasses");
    counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);

    if (invocation.output.kind === "observation_request") {
      const packs = deps.loadAuthorityPacks();
      const verdict = deps.checkAuthority("proposal", {
        proposal: invocation.output.observationRequest,
        packs,
        authorityEpoch: cycle.authorityEpoch,
      });
      if (!verdict.ok) {
        if (revisable(verdict.codes)) {
          if (counters.authorityRevisions >= MAX_AUTHORITY_REVISIONS) return emitFailure("revision_exhausted");
          authorityObjections = uniqueAuthorityCodes(verdict.codes);
          incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "authorityRevisions");
          pass += 1;
          structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
          continue;
        }
        return emitFailure(verdict.codes.join(",") || "authority_rejected");
      }
      if (counters.observationRounds >= MAX_OBSERVATION_ROUNDS) return emitFailure("pass_exhausted");
      incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "observationRounds");
      updateCycleState(sidecar, cycle.cycleId, "awaiting_operation", deps.nowMs());
      try {
        const observed = await deps.executeObservation(invocation.output.observationRequest);
        const normalized: Observation = {
          ...observed,
          cycleId: cycle.cycleId,
          generation: cycle.generation,
          derived: observed.derived === true,
          replaySafe: observed.replaySafe === true,
          dataClassification: observed.dataClassification ?? "never_public",
          secretOmitted: observed.secretOmitted === true,
        };
        observationsForThought = [...observationsForThought, normalized];
        storeObservations(sidecar, { observations: [normalized] } as any, deps.nowMs());
      } catch {
        return emitFailure("observation_unavailable");
      }
      pass += 1;
      structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
      continue;
    }

    if (invocation.output.kind === "effect_proposal") {
      const packs = deps.loadAuthorityPacks();
      const verdict = deps.checkAuthority("proposal", {
        proposal: invocation.output.effectProposal,
        packs,
        authorityEpoch: cycle.authorityEpoch,
      });
      if (!verdict.ok) {
        if (revisable(verdict.codes)) {
          if (counters.authorityRevisions >= MAX_AUTHORITY_REVISIONS) return emitFailure("revision_exhausted");
          authorityObjections = uniqueAuthorityCodes(verdict.codes);
          incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "authorityRevisions");
          pass += 1;
          structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
          continue;
        }
        return emitFailure(verdict.codes.join(",") || "effect_not_authorized");
      }
      if (counters.effectRounds >= MAX_EFFECT_ROUNDS) return emitFailure("pass_exhausted");
      incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "effectRounds");
      updateCycleState(sidecar, cycle.cycleId, "awaiting_operation", deps.nowMs());
      const proposal = invocation.output.effectProposal;
      const reloadDispatchState = () => {
        const currentPacks = deps.loadAuthorityPacks();
        const current = getCurrentCycle(sidecar, cycle.conversationId, { includeIdle: true });
        return {
          authorityEpoch: currentPacks.stateEpoch.authorityEpoch,
          generation: current?.generation,
          packs: currentPacks,
        };
      };
      const dispatch = await dispatchEffect(
        sidecar,
        proposal,
        { ...reloadDispatchState(), reload: reloadDispatchState },
        deps.executeEffect,
      );
      if (!dispatch.dispatched) {
        if (dispatch.codes.includes("STALE_GENERATION")) {
          counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
          return resultWithCounters(cycle.cycleId, cycle.generation, null, counters);
        }
        return emitFailure(dispatch.codes.join(",") || "effect_unavailable");
      }
      inFlight = listInFlight(sidecar, cycle.cycleId);
      pass += 1;
      structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
      continue;
    }

    if (invocation.output.kind !== "settlement") {
      return emitFailure(invocation.output.reason);
    }
    const validation = validateThoughtSettlementDraft(invocation.output.settlement, {
      cycleId: cycle.cycleId,
      generation: cycle.generation,
      occupantId: cycle.occupantId,
      authorityEpoch: cycle.authorityEpoch,
      consumedEffectIds: inFlight.filter((item) => item.status === "receipted").map((item) => item.effectId),
    });
    if (!validation.ok) {
      if (validation.kind === "stale") {
        counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
        return resultWithCounters(cycle.cycleId, cycle.generation, null, counters);
      }
      if (validation.kind === "conflict" && revisable(validation.codes)) {
        if (counters.authorityRevisions >= MAX_AUTHORITY_REVISIONS) return emitFailure("revision_exhausted");
        authorityObjections = uniqueAuthorityCodes(validation.codes);
        incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "authorityRevisions");
        pass += 1;
        structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
        continue;
      }
      return emitFailure("malformed");
    }
    const packs = deps.loadAuthorityPacks();
    const authority = deps.checkAuthority("settlement", {
      settlement: validation.draft,
      packs: {
        ...packs,
        currentness: {
          ...packs.currentness,
          observedObservationIds: observationsForThought.map((item) => item.observationId),
        },
      },
      authorityEpoch: cycle.authorityEpoch,
    });
    if (!authority.ok) {
      if (revisable(authority.codes)) {
        if (counters.authorityRevisions >= MAX_AUTHORITY_REVISIONS) return emitFailure("revision_exhausted");
        authorityObjections = uniqueAuthorityCodes(authority.codes);
        incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "authorityRevisions");
        pass += 1;
        structuralRetriesForPass = persistedMalformedRetries(sidecar, cycle.cycleId, cycle.generation, pass);
        continue;
      }
      return emitFailure(authority.codes.join(",") || "authority_rejected");
    }

    let speechText = validation.draft.speech.surfaceDraft;
    if (
      deps.expressionEnabled &&
      deps.adaptExpression &&
      validation.draft.speech.mode === "draft" &&
      speechText !== null
    ) {
      try {
        speechText = await deps.adaptExpression({
          draft: speechText,
          commitments: validation.draft.commitments,
          stance: validation.draft.commitments.stance,
          directives: validation.draft.speech.presentationDirectives,
          profile: "default",
          medium: "discord",
        });
      } catch {
        speechText = validation.draft.speech.surfaceDraft;
      }
    }
    const fidelity = fidelityCheck({
      mode: validation.draft.speech.mode,
      draft: speechText,
      mustSay: validation.draft.speech.mustSay,
      mustNot: validation.draft.speech.mustNot,
      acceptableRealizations: validation.draft.speech.acceptableRealizations,
      commitments: validation.draft.commitments,
      observations: observationsForThought,
    });
    if (!fidelity.ok) {
      if (REVISABLE_AUTHORITY_CODES.has(fidelity.code as AuthorityCode)) {
        if (counters.authorityRevisions >= MAX_AUTHORITY_REVISIONS) return emitFailure("revision_exhausted");
        authorityObjections = uniqueAuthorityCodes([fidelity.code]);
        incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "authorityRevisions");
        pass += 1;
        continue;
      }
      return emitFailure(fidelity.code);
    }
    if (!currentGenerationIs(sidecar, cycle)) {
      counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
      return resultWithCounters(cycle.cycleId, cycle.generation, null, counters);
    }
    const finalText = validation.draft.speech.mode === "draft"
      ? renderForTransport(speechText ?? "")
      : null;
    const settlement = publishedSettlement({
      ...validation.draft,
      speech: { ...validation.draft.speech, surfaceDraft: speechText },
    }, randomUUID(), finalText);
    const publication = publishSemanticTransaction(sidecar, settlement, {
      nowMs: deps.nowMs(),
      triggerKind: cycle.triggerKind,
      fidelity: validation.draft.speech.mode === "draft" ? "passed" : "skipped",
      origin: deps.origin,
      deliveryIntent: deliveryIntentFor(cycle, payload, "licensed_speech"),
    });
    if (!publication.published) {
      counters = getThoughtAttemptCounters(sidecar, cycle.cycleId, cycle.generation);
      return resultWithCounters(cycle.cycleId, cycle.generation, null, counters);
    }
    if (publication.outboxId !== null) await deps.projectOutbox(publication.outboxId);
    if (directive && deps.origin !== "shadow") {
      const evidence = getConversationEvidence(sidecar, directive.evidenceRowId);
      if (evidence && evidence.lineageId === directive.evidenceLineageId) {
        for (const nomination of settlement.durableNominations) {
          admitOwnerSuppliedClaim(sidecar, {
            settlementId: settlement.settlementId,
            nominationId: nomination.nominationId,
            evidence,
            evidenceRowId: directive.evidenceRowId,
            nowMs: deps.nowMs(),
          });
        }
      }
    }
    return {
      cycleId: cycle.cycleId,
      generation: cycle.generation,
      published: true,
      outboxId: publication.outboxId,
      infrastructureNotice: null,
      thoughtModelAttempts: counters.thoughtModelAttempts,
      acceptedThoughtPasses: counters.acceptedThoughtPasses,
      composeCancelledAttempts: counters.composeCancelledAttempts,
      acceptedSettlements: publication.replayed ? 0 : 1,
    };
  }
}
