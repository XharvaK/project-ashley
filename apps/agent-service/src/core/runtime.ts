import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { NUCLEAR_DB_PATH } from "../paths.js";
import { decide, attachAuthorizedClaims } from "./agency/decide.js";
import { buildOwnTimeReportConstraint } from "./agency/own-time-report.js";
import { collectMotivations, mindStateItemToMotivation } from "./agency/motivations.js";
import { deliberateDecision } from "./agency/thought.js";
import {
  motivationCurrentlyEligible,
  selectMotivationCandidates,
} from "./agency/candidate-selection.js";
import { enqueueThoughtObservation, type ShadowCognitionContext } from "./agency/thought-observation.js";
import {
  classifyTurnComplexity,
  isTerminalDecision,
} from "./agency/turn-complexity.js";
import { relevantBoundaryIdSet } from "./agency/boundary-relevance.js";
import { logDecision, setDecisionOutcome } from "./agency/log.js";
import { observeSandboxEffectIntentAdmission } from "./sandbox/task-admission.js";
import { composeTurnContext } from "./context-composer.js";
import { expressSpeak } from "./conversation/expression.js";
import { seedIdentity } from "./identity/seed.js";
import { routingStatus } from "./model-routing/status.js";
import type { RoutingRouteStatus } from "./model-routing/status.js";
import {
  listActiveFacts,
  upsertFact,
} from "./memory/facts.js";
import {
  archiveActiveThread,
  insertMessage,
  resolveActiveThread,
} from "./memory/threads.js";
import { getState, patchState, setLastDecision } from "./state/store.js";
import {
  writeFromUserTurn,
} from "./writers.js";
import {
  applyOwnTimeTransitionForReactiveTurn,
  hasOpenOwnTimeSession,
} from "./state/own-time.js";
import {
  classifyInitiativeClass,
  evaluateProactiveEligibility,
} from "./agency/proactive-eligibility.js";
import {
  listRecentTakes,
  listSources,
  readingProvenanceFailure,
} from "./curiosity/feed.js";
import { runNuclearCuriosityTick } from "./curiosity/tick.js";
import { recordPendingEngineeringAdmission } from "./sandbox/engineering-runs.js";
import { listRecentReads } from "./curiosity/reads.js";
import { openNuclearDb } from "./db.js";
import { getContinuityFor } from "./continuity/registry.js";
import {
  bindForgetPreviewDiscordMessage,
  resolvePreviewByDiscordMessage,
} from "./continuity/forget-preview.js";
import { getAuthoritativeLineageId } from "./continuity/db.js";
import {
  cleanShutdownSession,
  heartbeatSession,
  startRuntimeSession,
} from "./continuity/sessions.js";
import {
  forgetOwnerTopic,
  forgetOwnerTopicImmediate,
  replayPendingTombstones,
  type ForgetResult,
} from "./memory/forget.js";
import { recoverStaleRequests } from "./attention/ledger.js";
import { attentionObservability } from "./attention/governor.js";
import {
  applyInitiativeLearning,
  attachLearningSnapshot,
  getReflectionOverview,
  processPendingOpenCognitiveReviewsAsync,
  processPendingReflectionEvents,
  recordInitiativeReaction,
} from "./reflection/initiative.js";
import type { OpenCognitiveReviewAdjudicator } from "./reflection/initiative.js";
import type { Decision, DecisionKind, Motivation, ReflectionMode } from "./types.js";
import { attachAffectLicense, getAffectiveState } from "./state/affect.js";
import { enqueueCognitiveJob, getLatestShadowAnalysis } from "./cognition/jobs.js";
import { recordOpenCognitiveDecision } from "./cognition/reconsideration.js";
import {
  countOpenCognitiveItemReviewDue,
  getOpenCognitiveContinuityStatus,
} from "./cognition/open-items.js";
import {
  claimUrgentMindState,
  consumeUrgentWake,
  listActiveMindStateItems,
  retryUrgentWake,
} from "./state/mind-items.js";
import {
  applyEligibleRevisions,
  listIdentityReviews,
  listRevisions,
  recordAshleyReviewPosition,
  recordDocReviewDecision,
  revertRevision,
} from "./learning/revisions.js";
import { classifyIdentityChange, requiresOwnerApproval } from "./identity/classification.js";
import {
  createChangeProposal,
  getChangeProposalByEntityUuid,
  listChangeProposalEvents,
  listChangeProposals,
  updateProposalState,
} from "./change-proposal/store.js";
import {
  proposeChange,
  recordAshleyPosition,
  recordDocDecision,
  recordExternalOutcome,
} from "./change-proposal/lifecycle.js";
import {
  cancelAction,
  reconcileAction,
} from "./external-agency/lifecycle.js";
import {
  getEmergencyStop,
  setEmergencyStop,
} from "./external-agency/emergency-stop.js";
import {
  getExternalActionByEntityUuid,
  listExternalActionEvents,
  listExternalActions,
  listVaultCredentials,
  revokeVaultCredential,
} from "./external-agency/store.js";
import {
  capabilityCanInfluence,
  capabilityNames,
  listCapabilityStatuses,
  operatorRollbackCapability as operatorRollbackCapabilityRelease,
  promoteCapability as promoteCapabilityRelease,
  recordCriticalFailure,
  recordIsolatedEvaluation,
  type CapabilityName,
} from "./rollout/capabilities.js";
import { recordRecallLiveCutover } from "./memory/cutover.js";
import {
  getCurrentRecallQualificationEpoch,
  listRecallQualificationEpochs,
  startRecallQualificationEpoch as startRecallQualificationEpochRelease,
} from "./rollout/recall-qualification-epoch.js";
import { listRelationshipSummary } from "./relationship/store.js";
import { observeReactiveRelationshipSignals } from "./relationship/authority.js";
import { assignNewEntityUuid } from "./continuity/nuclear-targetable.js";
import {
  consumeActiveTurnWithdrawal,
} from "./relationship/repair.js";
import { markMissedDueReminders } from "./relationship/delivery-outcomes.js";
import { planContentBubbles } from "./delivery/bubble-plan.js";
import { extractMediaMarkers } from "./delivery/media.js";
import {
  attachDraftAndBubbles,
  claimProactiveDeliveryInTransaction,
  claimReactiveDelivery,
  getDeliveryReservation,
  listDeliveryBubbles,
  recordAuxiliaryMessage,
  recordBubbleReceipt,
} from "./delivery/store.js";
import {
  expireStaleDraftedReservations,
  finalizeDelivery,
} from "./delivery/finalize.js";
import {
  cancelDeliveryReservation,
  clearDeliveryAbort,
  registerDeliveryAbort,
} from "./delivery/abort-registry.js";
import { DELIVERY_LEASE_MS } from "./delivery/types.js";
import {
  listPendingWeeklyReviewDeliveries,
} from "./sandbox/weekly-review-delivery.js";
import {
  engineeringStatusSnapshot,
} from "./sandbox/engineering-runs.js";
import type { AttachmentIntakeRef } from "./perception/types.js";
import { runPerceptionTurn } from "./perception/index.js";
import { thoughtDeadlineAtMs } from "./perception/turn-budget.js";
import { randomUUID } from "node:crypto";
import {
  createConfiguredUnixBrokerTransport,
} from "./change-proposal/unix-broker-transport.js";
import type { BrokerClientTransport } from "./change-proposal/broker-client.js";
import {
  probeSandboxBrokerReachability,
  refreshSandboxQualificationBaseline,
  sandboxAvailabilitySnapshot,
} from "./sandbox/availability.js";

export type ReactiveChatInput = {
  message: string;
  ownerId: string;
  channel: "discord";
  /** Ordered Discord fragment message IDs for the closed turn. */
  inboundDiscordMessageIds?: string[];
  /** Epoch ms when the final TurnBuffer fragment arrived. */
  finalFragmentReceivedAtMs?: number;
  /**
   * When true (default if inbound IDs omitted), receipt every planned bubble
   * locally and finalize — used by unit tests without Discord.
   * Discord bot always passes inbound IDs and leaves this false.
   */
  simulateDelivery?: boolean;
  abortSignal?: AbortSignal;
  attachments?: AttachmentIntakeRef[];
};

export type ReactiveChatResult = {
  text: string;
  threadId: string;
  model: string;
  decisionId: number;
  decisionKind: DecisionKind;
  silenced?: boolean;
  reservationId?: number;
  deliveryState?: string;
  plannedBubbles?: Array<{ ordinal: number; text: string }>;
  media?: { react: string | null; gifQuery: string | null };
  firstBubbleDeadlineAt?: string | null;
  statusUrl?: string;
  duplicate?: boolean;
  secretOmitted?: boolean;
};

export type ProactiveSkip = {
  shouldSend: false;
  reason: string;
  cooldownRemainingSec?: number;
};

export type ProactiveDraft = {
  shouldSend: true;
  text: string;
  threadId: string;
  angle: "question" | "opinion" | "check_in";
  reason: string;
  candidateKind?: string;
  materialKey?: string;
  reservationId?: number;
  deliveryReservationId?: number;
  plannedBubbles?: Array<{ ordinal: number; text: string }>;
};

export type ProactiveResult = ProactiveSkip | ProactiveDraft;

export type ProactiveDiagnosticStage =
  | "eligibility"
  | "thought"
  | "agency"
  | "expression"
  | "reservation"
  | "delivery";

export type ProactiveDiagnostic = {
  at: string;
  stage: ProactiveDiagnosticStage;
  code: string;
};

export type CoreProviderState = "configured" | "degraded" | "unavailable";

export type HealthSnapshotInput = {
  ready: boolean;
  providerState: CoreProviderState;
};

export type ProactiveCommitInput = {
  reservationId?: number;
  deliveryReservationId?: number;
  text: string;
  threadId: string;
  angle: string;
  reason: string;
  discordMessageId: string;
  /** Ordered receipts for multi-bubble proactive delivery. */
  bubbleReceipts?: Array<{ ordinal: number; discordMessageId: string }>;
  partial?: boolean;
  candidateKind?: string;
  materialKey?: string;
};

type DbRow = Record<string, unknown>;

function isRow(value: unknown): value is DbRow {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : value == null ? null : Number(value);
}

function decisionAngle(kind: DecisionKind): ProactiveDraft["angle"] {
  switch (kind) {
    case "ask":
    case "revisit":
      return "question";
    case "share":
    case "challenge":
    case "refuse":
      return "opinion";
    case "speak":
    case "silence":
    case "delay":
      return "check_in";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function logProactiveDecision(
  db: DatabaseSync,
  ownerId: string,
  decision: Decision,
  urgentItemId: number | null,
  outcomeText?: string,
  afterLogged?: (decisionId: number) => void,
): number {
  db.exec("BEGIN IMMEDIATE");
  try {
    const decisionId = logDecision(db, {
      ownerId,
      channel: "proactive",
      trigger: "proactive",
      decision,
      ...(outcomeText !== undefined ? { outcomeText } : {}),
    });
    afterLogged?.(decisionId);
    // Wave 01: do not record Thought live-shadow for deterministic Decisions.
    if (urgentItemId !== null) consumeUrgentWake(db, urgentItemId);
    setLastDecision(db, ownerId, decisionId);
    db.exec("COMMIT");
    return decisionId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function kvKey(ownerId: string): string {
  return `nuclear.proactive.paused.${ownerId}`;
}

function proactiveDiagnosticKey(ownerId: string): string {
  return `nuclear.proactive.diagnostic.${ownerId}`;
}

function getKv(db: DatabaseSync, key: string): string | null {
  const row: unknown = db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
  return isRow(row) && typeof row.value === "string" ? row.value : null;
}

function setKv(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function recordProactiveDiagnostic(
  db: DatabaseSync,
  ownerId: string,
  stage: ProactiveDiagnosticStage,
  code: string,
): void {
  setKv(
    db,
    proactiveDiagnosticKey(ownerId),
    JSON.stringify({ at: new Date().toISOString(), stage, code }),
  );
}

function readProactiveDiagnostic(
  db: DatabaseSync,
  ownerId: string,
): ProactiveDiagnostic | null {
  const raw = getKv(db, proactiveDiagnosticKey(ownerId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRow(parsed)) return null;
    const stage = parsed.stage;
    if (
      stage !== "eligibility" &&
      stage !== "thought" &&
      stage !== "agency" &&
      stage !== "expression" &&
      stage !== "reservation" &&
      stage !== "delivery"
    ) {
      return null;
    }
    if (
      typeof parsed.at !== "string" ||
      !Number.isFinite(Date.parse(parsed.at)) ||
      typeof parsed.code !== "string" ||
      parsed.code.length === 0 ||
      parsed.code.length > 128
    ) {
      return null;
    }
    return { at: parsed.at, stage, code: parsed.code };
  } catch {
    return null;
  }
}

export class AshleyCore {
  private readonly db: DatabaseSync;
  private readonly continuity: DatabaseSync | null;
  private readonly reflectionMode: ReflectionMode;
  private readonly activeOwners = new Set<string>();
  private readonly sessionId: string | null;
  private readonly sandboxBrokerTransport: BrokerClientTransport | null;
  private readonly reflectionReviewAdjudicator: OpenCognitiveReviewAdjudicator | undefined;

  constructor(
    db?: DatabaseSync,
    options?: {
      reflectionMode?: ReflectionMode;
      sandboxBrokerTransport?: BrokerClientTransport | null;
      reflectionReviewAdjudicator?: OpenCognitiveReviewAdjudicator;
    },
  ) {
    const priorContinuity = db ? getContinuityFor(db) : undefined;
    this.db = openNuclearDb(
      db,
      priorContinuity
        ? { continuity: priorContinuity }
        : db
          ? {}
          : {},
    );
    this.continuity = getContinuityFor(this.db) ?? priorContinuity ?? null;
    this.reflectionMode = options?.reflectionMode ?? env.reflectionMode;
    this.reflectionReviewAdjudicator = options?.reflectionReviewAdjudicator;
    this.sandboxBrokerTransport =
      options && "sandboxBrokerTransport" in options
        ? options.sandboxBrokerTransport ?? null
        : createConfiguredUnixBrokerTransport();
    refreshSandboxQualificationBaseline();
    if (this.sandboxBrokerTransport && env.memoryOwnerId) {
      void probeSandboxBrokerReachability(
        env.memoryOwnerId,
        this.sandboxBrokerTransport,
      );
    }
    if (this.continuity) {
      try {
        const lineageId = getAuthoritativeLineageId(this.continuity);
        this.sessionId = startRuntimeSession(this.continuity, {
          lineageId,
          buildIdentity: null,
          nuclearSchemaVersion: 15,
        });
        replayPendingTombstones(this.continuity, this.db);
      } catch {
        this.sessionId = null;
      }
    } else {
      this.sessionId = null;
    }
    recoverStaleRequests(this.db);
    processPendingReflectionEvents(this.db);
  }

  /** The source-proposal layer can use this only when the operator enables it. */
  getSandboxBrokerTransport(): BrokerClientTransport | null {
    return this.sandboxBrokerTransport;
  }

  getSandboxAvailability() {
    return sandboxAvailabilitySnapshot();
  }

  async refreshSandboxAvailability(): Promise<ReturnType<typeof sandboxAvailabilitySnapshot>> {
    if (!this.sandboxBrokerTransport || !env.memoryOwnerId) {
      refreshSandboxQualificationBaseline();
      return sandboxAvailabilitySnapshot();
    }
    return probeSandboxBrokerReachability(
      env.memoryOwnerId,
      this.sandboxBrokerTransport,
    );
  }

  private auditReadingProvenance(): boolean {
    const failure = readingProvenanceFailure(this.db);
    if (!failure) return true;
    recordCriticalFailure(
      this.db,
      "reading",
      failure,
      "provenance",
      "A reading-derived claim has missing or invalid read-record provenance.",
    );
    return false;
  }

  private capabilityStatuses(): ReturnType<typeof listCapabilityStatuses> {
    this.auditReadingProvenance();
    return listCapabilityStatuses(this.db);
  }

  async handleReactiveChat(
    input: ReactiveChatInput,
  ): Promise<ReactiveChatResult> {
    const message = input.message.trim();
    if (!message) throw new Error("message_required");
    if (this.activeOwners.has(input.ownerId)) {
      throw new Error("chat_in_progress");
    }
    this.activeOwners.add(input.ownerId);
    seedIdentity(this.db, input.ownerId);
    this.auditReadingProvenance();
    expireStaleDraftedReservations(this.db);

    const inboundIds =
      input.inboundDiscordMessageIds &&
      input.inboundDiscordMessageIds.length > 0
        ? input.inboundDiscordMessageIds
        : [`local:${randomUUID()}`];
    const simulateDelivery =
      input.simulateDelivery ??
      !(
        input.inboundDiscordMessageIds &&
        input.inboundDiscordMessageIds.length > 0
      );
    const finalFragmentReceivedAtMs =
      input.finalFragmentReceivedAtMs ?? Date.now();

    let reservationId: number | null = null;
    try {
      const claim = claimReactiveDelivery(this.db, {
        ownerId: input.ownerId,
        channel: input.channel,
        mergedUserText: message,
        inboundDiscordMessageIds: inboundIds,
        finalFragmentReceivedAtMs,
      });

      if (claim.kind === "duplicate") {
        const bubbles = listDeliveryBubbles(this.db, claim.reservation.id);
        return {
          text: claim.reservation.draftText ?? "",
          threadId: claim.reservation.threadId,
          model: "none",
          decisionId: claim.reservation.decisionId ?? 0,
          decisionKind: "speak",
          reservationId: claim.reservation.id,
          deliveryState: claim.reservation.state,
          plannedBubbles: bubbles.map((b) => ({
            ordinal: b.ordinal,
            text: b.text,
          })),
          firstBubbleDeadlineAt: claim.reservation.firstBubbleDeadlineAt,
          statusUrl: `/delivery/${claim.reservation.id}`,
          duplicate: true,
        };
      }

      if (claim.secretOmitted) {
        const notice =
          "I did not store or send that credential-shaped value to the model. " +
          "The original Discord message remains under Discord's retention and control.";
        const bubbles = [{ ordinal: 0, text: notice }];
        const reserved = attachDraftAndBubbles(
          this.db,
          claim.reservation.id,
          notice,
          bubbles,
          {
            deliveryLeaseExpiresAt: new Date(
              Date.now() + DELIVERY_LEASE_MS,
            ).toISOString(),
          },
        );
        if (simulateDelivery) {
          for (const bubble of bubbles) {
            recordBubbleReceipt(
              this.db,
              claim.reservation.id,
              bubble.ordinal,
              `sim:${claim.reservation.id}:${bubble.ordinal}`,
            );
          }
          const finalized = finalizeDelivery(this.db, {
            reservationId: claim.reservation.id,
            ownerId: input.ownerId,
            cause: "complete",
          });
          clearDeliveryAbort(claim.reservation.id);
          return {
            text: finalized.deliveredText || notice,
            threadId: claim.reservation.threadId,
            model: "none",
            decisionId: 0,
            decisionKind: "speak",
            reservationId: claim.reservation.id,
            deliveryState: finalized.state,
            plannedBubbles: bubbles,
            firstBubbleDeadlineAt: reserved.firstBubbleDeadlineAt,
            secretOmitted: true,
          };
        }
        clearDeliveryAbort(claim.reservation.id);
        return {
          text: notice,
          threadId: claim.reservation.threadId,
          model: "none",
          decisionId: 0,
          decisionKind: "speak",
          reservationId: claim.reservation.id,
          deliveryState: reserved.state,
          plannedBubbles: bubbles,
          firstBubbleDeadlineAt: reserved.firstBubbleDeadlineAt,
          statusUrl: `/delivery/${claim.reservation.id}`,
          secretOmitted: true,
        };
      }

      const reservation = claim.reservation;
      reservationId = reservation.id;
      const userMessageId = reservation.userMessageId;
      if (userMessageId == null) throw new Error("delivery_user_message_missing");

      const messageUuidRow = this.db
        .prepare(`SELECT entity_uuid FROM mem_messages WHERE id = ?`)
        .get(userMessageId) as { entity_uuid?: string } | undefined;
      let messageEntityUuid = messageUuidRow?.entity_uuid ?? null;
      if (!messageEntityUuid) {
        messageEntityUuid = assignNewEntityUuid();
        this.db
          .prepare(`UPDATE mem_messages SET entity_uuid = ? WHERE id = ?`)
          .run(messageEntityUuid, userMessageId);
      }
      observeReactiveRelationshipSignals(this.db, {
        ownerId: input.ownerId,
        message,
        messageEntityUuid,
      });

      const signal =
        input.abortSignal ??
        registerDeliveryAbort(reservation.id, input.ownerId);
      if (signal.aborted) {
        const finalized = finalizeDelivery(this.db, {
          reservationId: reservation.id,
          ownerId: input.ownerId,
          cause: "cancel",
        });
        return {
          text: "",
          threadId: reservation.threadId,
          model: "none",
          decisionId: 0,
          decisionKind: "silence",
          silenced: true,
          reservationId: reservation.id,
          deliveryState: finalized.state,
        };
      }

      const written = writeFromUserTurn(this.db, input.ownerId, message);
      if (written.forgotTopic) {
        if (this.continuity) {
          forgetOwnerTopicImmediate(
            this.db,
            input.ownerId,
            written.forgotTopic,
            this.continuity,
          );
        }
      }
      applyOwnTimeTransitionForReactiveTurn(this.db, input.ownerId, {
        departureSignal: written.departureSignal,
        userMessageId,
      });
      const ownTimeOpen = hasOpenOwnTimeSession(this.db, input.ownerId);
      // Reactive turns retain the direct-message and refusal selection path.
      // Model Thought already receives its bounded 12-item candidate view.
      const motivations = collectMotivations(
        this.db,
        input.ownerId,
        "reactive",
        message,
        userMessageId,
      );
      const ownTimeConstraint = buildOwnTimeReportConstraint(this.db, {
        ownerId: input.ownerId,
        userMessage: message,
        userMessageId,
      });
      let decision = decide(motivations, "reactive", {
        ownTime: ownTimeConstraint,
        userMessage: message,
        db: this.db,
        ownerId: input.ownerId,
      });
      if (decision.silenceReasonCode === "withdrawal_turn") {
        consumeActiveTurnWithdrawal(this.db, input.ownerId);
      }
      const relevantBoundaries = relevantBoundaryIdSet(message, motivations);
      const complexity = classifyTurnComplexity({
        decision,
        motivations,
        trigger: "reactive",
        userMessage: message,
        ownTimeReportActive: ownTimeConstraint?.canInfluence === true,
        relevantBoundaryIds: relevantBoundaries,
      });
      if (complexity.mode === "hard") {
        if (signal.aborted) {
          const finalized = finalizeDelivery(this.db, {
            reservationId: reservation.id,
            ownerId: input.ownerId,
            cause: "cancel",
            ownTimeOpen,
          });
          return {
            text: "",
            threadId: reservation.threadId,
            model: "none",
            decisionId: reservation.decisionId ?? 0,
            decisionKind: "silence",
            silenced: true,
            reservationId: reservation.id,
            deliveryState: finalized.state,
          };
        }
        const firstBubbleDeadlineAtMs = reservation.firstBubbleDeadlineAt
          ? Date.parse(reservation.firstBubbleDeadlineAt)
          : null;
        const thoughtDeadlineAtMs =
          firstBubbleDeadlineAtMs != null
            ? firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
            : null;
        const thoughtCanInfluence = capabilityCanInfluence(this.db, "thought");
        decision = await deliberateDecision(
          this.db,
          decision,
          motivations,
          "reactive",
          undefined,
          undefined,
          undefined,
          {
            allowModelThought: thoughtCanInfluence,
            firstBubbleDeadlineAtMs,
            thoughtDeadlineAtMs,
            deliveryReservationId: reservation.id,
            ownerId: input.ownerId,
          },
        );
      }
      if (capabilityCanInfluence(this.db, "affect")) {
        decision = attachAffectLicense(
          decision,
          getAffectiveState(this.db, input.ownerId),
        );
      }
      const recentTakes = listRecentTakes(this.db, 6);
      if (capabilityCanInfluence(this.db, "reading")) {
        decision = attachAuthorizedClaims(decision, recentTakes);
      }

      this.db.exec("BEGIN IMMEDIATE");
      let decisionId: number;
      try {
        decisionId = logDecision(this.db, {
          ownerId: input.ownerId,
          channel: input.channel,
          trigger: "reactive",
          decision,
        });
        this.db
          .prepare(
            `UPDATE delivery_reservations SET decision_id = ? WHERE id = ? AND decision_id IS NULL`,
          )
          .run(decisionId, reservation.id);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      decision.id = decisionId;
      setLastDecision(this.db, input.ownerId, decisionId);
      // Observe-only: record a deterministic sandbox effect admission intent
      // if the decision's OCI evidence grounds one. Zero authority — nothing
      // is scheduled or executed from an admission.
      observeSandboxEffectIntentAdmission(
        this.db,
        input.ownerId,
        decision,
        "reactive",
      );

      const reservationUuidRow = this.db
        .prepare(`SELECT entity_uuid FROM delivery_reservations WHERE id = ?`)
        .get(reservation.id) as { entity_uuid?: string } | undefined;
      let deliveryReservationEntityUuid =
        reservationUuidRow?.entity_uuid ?? null;
      if (!deliveryReservationEntityUuid) {
        deliveryReservationEntityUuid = assignNewEntityUuid();
        this.db
          .prepare(
            `UPDATE delivery_reservations SET entity_uuid = ? WHERE id = ?`,
          )
          .run(deliveryReservationEntityUuid, reservation.id);
      }

      const firstBubbleDeadlineAtMs = reservation.firstBubbleDeadlineAt
        ? Date.parse(reservation.firstBubbleDeadlineAt)
        : Date.now() + 10_000;
      const thoughtDeadline =
        thoughtDeadlineAtMs(firstBubbleDeadlineAtMs);

      const perception = await runPerceptionTurn(this.db, {
        ownerId: input.ownerId,
        message,
        attachments: input.attachments ?? [],
        sourceMessageEntityUuid: messageEntityUuid,
        deliveryReservationEntityUuid,
        deliveryReservationId: reservation.id,
        thoughtDeadlineAtMs: thoughtDeadline,
        firstBubbleDeadlineAtMs,
        decision,
      });
      decision.perceptionLicenses = perception.licenses;

      const turn = composeTurnContext(this.db, input.ownerId, {
        channel: "discord",
        userMessage: message,
        decision,
        excludeMessageId: userMessageId,
      });

      if (isTerminalDecision(decision) || complexity.mode === "terminal") {
        if (!ownTimeOpen) {
          patchState(this.db, input.ownerId, {
            availability: decision.kind === "silence" ? "quiet" : "available",
          });
        }
        const finalized = finalizeDelivery(this.db, {
          reservationId: reservation.id,
          ownerId: input.ownerId,
          cause: "empty_draft",
          ownTimeOpen,
        });
        clearDeliveryAbort(reservation.id);
        return {
          text: "",
          threadId: turn.threadId,
          model: "none",
          decisionId,
          decisionKind: decision.kind,
          ...(decision.kind === "silence" ? { silenced: true } : {}),
          reservationId: reservation.id,
          deliveryState: finalized.state,
        };
      }

      if (signal.aborted) {
        const finalized = finalizeDelivery(this.db, {
          reservationId: reservation.id,
          ownerId: input.ownerId,
          cause: "cancel",
          ownTimeOpen,
        });
        clearDeliveryAbort(reservation.id);
        return {
          text: "",
          threadId: turn.threadId,
          model: "none",
          decisionId,
          decisionKind: decision.kind,
          silenced: true,
          reservationId: reservation.id,
          deliveryState: finalized.state,
        };
      }

      const deadlineIso = reservation.firstBubbleDeadlineAt;
      if (deadlineIso && deadlineIso <= new Date().toISOString()) {
        const finalized = finalizeDelivery(this.db, {
          reservationId: reservation.id,
          ownerId: input.ownerId,
          cause: "first_bubble_deadline",
          ownTimeOpen,
        });
        clearDeliveryAbort(reservation.id);
        return {
          text: "",
          threadId: turn.threadId,
          model: "none",
          decisionId,
          decisionKind: decision.kind,
          reservationId: reservation.id,
          deliveryState: finalized.state,
        };
      }

      let rendered;
      try {
        const firstBubbleDeadlineAtMs = reservation.firstBubbleDeadlineAt
          ? Date.parse(reservation.firstBubbleDeadlineAt)
          : null;
        rendered = await expressSpeak(turn, decision, message, "discord", {
          deadlineAtMs: firstBubbleDeadlineAtMs,
          decisionId,
          deliveryReservationId: reservation.id,
          ownerId: input.ownerId,
          perceptionExpressionParts: perception.expressionParts,
          perceptionThoughtParts: perception.thoughtParts,
          attentionDb: this.db,
        });
        if (
          complexity.mode === "hard" &&
          !capabilityCanInfluence(this.db, "thought")
        ) {
          const shadowAnalysis = getLatestShadowAnalysis(
            this.db,
            input.ownerId,
            reservation.threadId,
            userMessageId,
          );
          let shadowContext: ShadowCognitionContext | undefined;
          let shadowMotivations: Motivation[] = [];
          if (shadowAnalysis) {
            const hasStateItems = shadowAnalysis.stateItems.length > 0;
            const hasAffect = [
              shadowAnalysis.affect.valenceDelta,
              shadowAnalysis.affect.activationDelta,
              shadowAnalysis.affect.opennessDelta,
              shadowAnalysis.affect.tensionDelta,
            ].some((value) => Math.abs(value) >= 0.01);
            if (hasStateItems || hasAffect) {
              shadowContext = {
                recall: {
                  episodeId: shadowAnalysis.episodeId,
                  summary: shadowAnalysis.summary,
                  entities: shadowAnalysis.entities,
                  salience: shadowAnalysis.salience,
                },
                mindState: {
                  hasStateItems,
                  hasAffect,
                  stateItemCount: shadowAnalysis.stateItems.length,
                  affectReason: shadowAnalysis.affect.reason,
                },
              };
              if (hasStateItems) {
                shadowMotivations = shadowAnalysis.stateItems.map((item, idx) =>
                  mindStateItemToMotivation({
                    kind: item.kind,
                    text: item.text,
                    activation: item.activation,
                    urgency: item.urgency,
                    id: -(idx + 1), // negative ephemeral IDs for shadow
                  }),
                );
              }
            }
          }
          if (shadowContext) {
            enqueueThoughtObservation({
              db: this.db,
              decision,
              motivations: [...motivations, ...shadowMotivations],
              trigger: "reactive",
              decisionId,
              shadowContext,
            });
          }
        }
      } catch (error) {
        const finalized = finalizeDelivery(this.db, {
          reservationId: reservation.id,
          ownerId: input.ownerId,
          cause: signal.aborted ? "cancel" : "generation_error",
          ownTimeOpen,
          errorCategory: error instanceof Error ? error.message : "express_error",
        });
        clearDeliveryAbort(reservation.id);
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          deliveryState: finalized.state,
          reservationId: reservation.id,
        });
      }

      const media = extractMediaMarkers(rendered.text);
      const bubbles = planContentBubbles(media.text);
      if (bubbles.length === 0) {
        const finalized = finalizeDelivery(this.db, {
          reservationId: reservation.id,
          ownerId: input.ownerId,
          cause: "empty_draft",
          ownTimeOpen,
        });
        clearDeliveryAbort(reservation.id);
        return {
          text: "",
          threadId: turn.threadId,
          model: rendered.model,
          decisionId,
          decisionKind: decision.kind,
          reservationId: reservation.id,
          deliveryState: finalized.state,
          media: { react: media.react, gifQuery: media.gifQuery },
        };
      }

      const reserved = attachDraftAndBubbles(
        this.db,
        reservation.id,
        media.text,
        bubbles,
        {
          deliveryLeaseExpiresAt: new Date(
            Date.now() + DELIVERY_LEASE_MS,
          ).toISOString(),
        },
      );

      if (!ownTimeOpen) {
        patchState(this.db, input.ownerId, { availability: "available" });
      }

      if (simulateDelivery) {
        for (const bubble of bubbles) {
          recordBubbleReceipt(
            this.db,
            reservation.id,
            bubble.ordinal,
            `sim:${reservation.id}:${bubble.ordinal}`,
          );
        }
        const finalized = finalizeDelivery(this.db, {
          reservationId: reservation.id,
          ownerId: input.ownerId,
          cause: "complete",
          ownTimeOpen,
        });
        clearDeliveryAbort(reservation.id);
        return {
          text: finalized.deliveredText,
          threadId: turn.threadId,
          model: rendered.model,
          decisionId,
          decisionKind: decision.kind,
          reservationId: reservation.id,
          deliveryState: finalized.state,
          plannedBubbles: bubbles,
          media: { react: media.react, gifQuery: media.gifQuery },
          firstBubbleDeadlineAt: reserved.firstBubbleDeadlineAt,
        };
      }

      clearDeliveryAbort(reservation.id);
      return {
        text: media.text,
        threadId: turn.threadId,
        model: rendered.model,
        decisionId,
        decisionKind: decision.kind,
        reservationId: reservation.id,
        deliveryState: reserved.state,
        plannedBubbles: bubbles,
        media: { react: media.react, gifQuery: media.gifQuery },
        firstBubbleDeadlineAt: reserved.firstBubbleDeadlineAt,
        statusUrl: `/delivery/${reservation.id}`,
      };
    } catch (error) {
      if (reservationId != null) {
        try {
          finalizeDelivery(this.db, {
            reservationId,
            ownerId: input.ownerId,
            cause: "generation_error",
            errorCategory:
              error instanceof Error ? error.message : "unknown_error",
          });
        } catch {
          /* best effort */
        }
        clearDeliveryAbort(reservationId);
      }
      throw error;
    } finally {
      this.activeOwners.delete(input.ownerId);
    }
  }

  getDeliveryStatus(ownerId: string, reservationId: number) {
    expireStaleDraftedReservations(this.db);
    const reservation = getDeliveryReservation(this.db, reservationId);
    if (!reservation || reservation.ownerId !== ownerId) return null;
    const bubbles = listDeliveryBubbles(this.db, reservationId);
    return {
      reservation,
      bubbles,
      statusUrl: `/delivery/${reservationId}`,
    };
  }

  getPendingWeeklyReviewDeliveries(ownerId: string) {
    return listPendingWeeklyReviewDeliveries(this.db, ownerId);
  }

  getEngineeringStatus(ownerId: string) {
    return engineeringStatusSnapshot(this.db, ownerId);
  }

  receiptDeliveryBubble(
    ownerId: string,
    reservationId: number,
    ordinal: number,
    discordMessageId: string,
  ): void {
    const reservation = getDeliveryReservation(this.db, reservationId);
    if (!reservation || reservation.ownerId !== ownerId) {
      throw new Error("delivery_reservation_missing");
    }
    recordBubbleReceipt(this.db, reservationId, ordinal, discordMessageId);
  }

  receiptDeliveryAuxiliary(
    ownerId: string,
    reservationId: number,
    input: {
      kind: "progress" | "delivery_error";
      text: string;
      discordMessageId: string;
    },
  ): void {
    const reservation = getDeliveryReservation(this.db, reservationId);
    if (!reservation || reservation.ownerId !== ownerId) {
      throw new Error("delivery_reservation_missing");
    }
    recordAuxiliaryMessage(this.db, {
      reservationId,
      kind: input.kind,
      text: input.text,
      discordMessageId: input.discordMessageId,
    });
  }

  finalizeDeliveryReservation(
    ownerId: string,
    reservationId: number,
    cause:
      | "complete"
      | "cancel"
      | "send_failure"
      | "first_bubble_deadline"
      | "delivery_lease" = "complete",
    onArchivalAssistant?: (text: string) => void,
  ) {
    return finalizeDelivery(this.db, {
      reservationId,
      ownerId,
      cause,
      ownTimeOpen: hasOpenOwnTimeSession(this.db, ownerId),
      onArchivalAssistant,
    });
  }

  cancelDelivery(
    ownerId: string,
    reservationId: number,
    onArchivalAssistant?: (text: string) => void,
  ) {
    return cancelDeliveryReservation(this.db, {
      reservationId,
      ownerId,
      onArchivalAssistant,
    });
  }

  async tickProactive(ownerId: string): Promise<ProactiveResult> {
    markMissedDueReminders(
      this.db,
      ownerId,
      new Date().toISOString(),
      env.reminderMissedGraceHours,
    );
    // Classify with read-only hasUrgentMindState — never claim before eligibility.
    const initiativeClass = classifyInitiativeClass(this.db, ownerId);
    const status = this.getProactiveOperationalStatus(ownerId);
    const eligibilityInput = {
      ownerId,
      chatInProgress: this.activeOwners.has(ownerId),
      paused: this.isProactivePaused(ownerId),
      enabled: env.proactiveEnabled,
      sentToday: status.sentToday,
      maxPerDay: status.maxPerDay,
      lastUserMessageAt: status.lastUserMessageAt,
      minIdleHours: status.minIdleHours,
      hasUrgent: initiativeClass === "urgent_grounded",
    };
    let eligibility = evaluateProactiveEligibility(this.db, eligibilityInput);
    if (!eligibility.ok) {
      recordProactiveDiagnostic(
        this.db,
        ownerId,
        "eligibility",
        eligibility.reason,
      );
      return {
        shouldSend: false,
        reason: eligibility.reason,
        ...(eligibility.cooldownRemainingSec !== undefined
          ? { cooldownRemainingSec: eligibility.cooldownRemainingSec }
          : {}),
      };
    }

    // Side-effectful setup only after shared gates pass.
    seedIdentity(this.db, ownerId);
    this.auditReadingProvenance();

    // Claim only after eligibility passes, and only for urgent_grounded.
    let urgentItem =
      eligibility.initiativeClass === "urgent_grounded"
        ? claimUrgentMindState(this.db, ownerId)
        : null;
    if (eligibility.initiativeClass === "urgent_grounded" && !urgentItem) {
      // Claim race: do not keep urgent idle bypass. Re-check as ordinary.
      eligibility = evaluateProactiveEligibility(this.db, {
        ...eligibilityInput,
        hasUrgent: false,
      });
      if (!eligibility.ok) {
        recordProactiveDiagnostic(
          this.db,
          ownerId,
          "eligibility",
          eligibility.reason,
        );
        return {
          shouldSend: false,
          reason: eligibility.reason,
          ...(eligibility.cooldownRemainingSec !== undefined
            ? { cooldownRemainingSec: eligibility.cooldownRemainingSec }
            : {}),
        };
      }
    }

    // Engineering autonomy anchor: a grounded, urgent mind-state item is a
    // legitimate grounded source for a SAFE candidate-workspace investigation.
    // This only records a pending admission; execution still requires the owner
    // to have enabled the lifecycle AND recorded the activation cutover, and the
    // policy/precheck to pass. A model merely "thinking about coding" never
    // reaches here.
    if (urgentItem && env.sandboxEngineeringLifecycleEnabled) {
      recordPendingEngineeringAdmission(this.db, {
        ownerId,
        objective: `Investigate urgent grounded mind-state item ${urgentItem.id}`,
        projectId: null,
        profile: "project_investigation",
        groundingRefs: [`mind-state:${urgentItem.id}`],
        source: { kind: "open_cognitive_item", ref: String(urgentItem.id) },
        autonomous: true,
      });
    }

    await processPendingOpenCognitiveReviewsAsync(
      this.db,
      ownerId,
      this.reflectionReviewAdjudicator,
    );
    const reviewDueCount = countOpenCognitiveItemReviewDue(this.db, ownerId);
    if (reviewDueCount > 0) {
      recordProactiveDiagnostic(
        this.db,
        ownerId,
        "agency",
        "reflection_review_due",
      );
    }

    let decisionLogged = false;
    try {
      const motivations = selectMotivationCandidates(
        this.db,
        ownerId,
        "proactive",
        applyInitiativeLearning(
          this.db,
          ownerId,
          collectMotivations(this.db, ownerId, "proactive"),
          this.reflectionMode,
        ),
      );
      const hasMaterialCandidate = motivations.some(
        (motivation) => motivation.kind !== "silence_ok",
      );
      if (!hasMaterialCandidate) {
        // Rich OCI enumeration belongs to explicit owner status. Ordinary wake
        // only records a bounded operational outcome.
        recordProactiveDiagnostic(this.db, ownerId, "agency", "no_open_material");
      }
      let decision = decide(motivations, "proactive");
      const complexity = classifyTurnComplexity({
        decision,
        motivations,
        trigger: "proactive",
      });
      if (complexity.mode === "hard") {
        decision = await deliberateDecision(
          this.db,
          decision,
          motivations,
          "proactive",
          undefined,
          undefined,
          undefined,
          { allowModelThought: true },
        );
      }
      if (capabilityCanInfluence(this.db, "affect")) {
        decision = attachAffectLicense(
          decision,
          getAffectiveState(this.db, ownerId),
        );
      }
      decision = attachLearningSnapshot(decision, motivations);
      const recentTakes = listRecentTakes(this.db, 6);
      if (capabilityCanInfluence(this.db, "reading")) {
        decision = attachAuthorizedClaims(decision, recentTakes);
      }
      if (
        isTerminalDecision(decision) ||
        complexity.mode === "terminal" ||
        decision.score < 25
      ) {
        const thoughtCode =
          decision.kind === "delay"
            ? "thought_delay"
            : decision.kind === "refuse"
              ? "agency_refusal"
              : decision.kind === "silence" ||
                  !decision.cognitiveAllocation.shouldSpeak
                ? "thought_silence"
                : "thought_hold";
        recordProactiveDiagnostic(
          this.db,
          ownerId,
          "thought",
          thoughtCode,
        );
        const decisionId = logProactiveDecision(
          this.db,
          ownerId,
          decision,
          urgentItem?.id ?? null,
          "",
          () => {
            recordOpenCognitiveDecision(this.db, {
              ownerId,
              decision,
              inTransaction: true,
            });
          },
        );
        decisionLogged = true;
        decision.id = decisionId;
        observeSandboxEffectIntentAdmission(this.db, ownerId, decision, "proactive");
        return { shouldSend: false, reason: decision.reason };
      }

      const decisionId = logProactiveDecision(
        this.db,
        ownerId,
        decision,
        urgentItem?.id ?? null,
        undefined,
        () => {
          recordOpenCognitiveDecision(this.db, {
            ownerId,
            decision,
            inTransaction: true,
          });
        },
      );
      decisionLogged = true;
      decision.id = decisionId;
      observeSandboxEffectIntentAdmission(this.db, ownerId, decision, "proactive");

      const candidate =
        motivations.find((motivation) =>
          decision.motivationIds.includes(motivation.id ?? -1),
        ) ?? motivations[0];
      if (!candidate) {
        recordProactiveDiagnostic(this.db, ownerId, "agency", "no_open_material");
        setDecisionOutcome(this.db, decisionId, "");
        return { shouldSend: false, reason: "no_material" };
      }
      recordProactiveDiagnostic(
        this.db,
        ownerId,
        "agency",
        "candidate_selected",
      );
      const materialKey = `${candidate.kind}:${candidate.refId ?? candidate.id ?? Date.now()}`;
      const priorReservation: unknown = this.db
        .prepare(
          `SELECT id
           FROM initiative_reservations
           WHERE owner_id = ? AND material_key = ?
           LIMIT 1`,
        )
        .get(ownerId, materialKey);
      if (isRow(priorReservation)) {
        recordProactiveDiagnostic(
          this.db,
          ownerId,
          "reservation",
          "reservation_material_already_reserved",
        );
        setDecisionOutcome(this.db, decisionId, "");
        return { shouldSend: false, reason: "material_already_reserved" };
      }
      const userMessage = `Proactive material:\n${candidate.summary}`;
      const turn = composeTurnContext(this.db, ownerId, {
        channel: "proactive",
        userMessage,
        decision,
      });
      this.activeOwners.add(ownerId);
      try {
        let rendered: Awaited<ReturnType<typeof expressSpeak>>;
        try {
          rendered = await expressSpeak(
            turn,
            decision,
            userMessage,
            "proactive",
            {
              lane:
                initiativeClass === "urgent_grounded"
                  ? "urgent_grounded"
                  : "interactive",
            },
          );
        } catch (error) {
          recordProactiveDiagnostic(this.db, ownerId, "expression", "expression_failed");
          throw error;
        }
        if (rendered.model === "offline") {
          recordProactiveDiagnostic(
            this.db,
            ownerId,
            "expression",
            "expression_mistral_unavailable",
          );
          setDecisionOutcome(this.db, decisionId, "");
          return { shouldSend: false, reason: "mistral_unavailable" };
        }
        if (!rendered.text.trim()) {
          recordProactiveDiagnostic(
            this.db,
            ownerId,
            "expression",
            "expression_empty_draft",
          );
          setDecisionOutcome(this.db, decisionId, "");
          return { shouldSend: false, reason: "empty_draft" };
        }
        const media = extractMediaMarkers(rendered.text);
        const bubbles = planContentBubbles(media.text);
        if (bubbles.length === 0) {
          recordProactiveDiagnostic(
            this.db,
            ownerId,
            "expression",
            "expression_empty_draft",
          );
          setDecisionOutcome(this.db, decisionId, "");
          return { shouldSend: false, reason: "empty_draft" };
        }
        const angle = decisionAngle(decision.kind);
        this.db.exec("BEGIN IMMEDIATE");
        let reservationId: number;
        let delivery: ReturnType<typeof claimProactiveDeliveryInTransaction>;
        try {
          if (!motivationCurrentlyEligible(this.db, ownerId, candidate)) {
            this.db.exec("ROLLBACK");
            recordProactiveDiagnostic(
              this.db,
              ownerId,
              "delivery",
              "source_unavailable_before_delivery",
            );
            setDecisionOutcome(this.db, decisionId, "");
            return { shouldSend: false, reason: "source_unavailable" };
          }
          const result = this.db
            .prepare(
              `INSERT INTO initiative_reservations
                 (owner_id, decision_id, text, thread_id, angle, reason,
                  material_key, discord_message_id, created_at, committed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
            )
            .run(
              ownerId,
              decisionId,
              media.text,
              turn.threadId,
              angle,
              decision.reason,
              materialKey,
              new Date().toISOString(),
            );
          reservationId = Number(result.lastInsertRowid);
          delivery = claimProactiveDeliveryInTransaction(this.db, {
            ownerId,
            channel: "discord",
            threadId: turn.threadId,
            initiativeReservationId: reservationId,
            decisionId,
            draftText: media.text,
            bubbles,
          });
          this.db.exec("COMMIT");
        } catch (error) {
          this.db.exec("ROLLBACK");
          recordProactiveDiagnostic(
            this.db,
            ownerId,
            "delivery",
            "delivery_claim_failed",
          );
          throw error;
        }
        recordProactiveDiagnostic(this.db, ownerId, "delivery", "delivery_reserved");
        return {
          shouldSend: true,
          text: media.text,
          threadId: turn.threadId,
          angle,
          reason: decision.reason,
          candidateKind: candidate.kind,
          materialKey,
          reservationId,
          deliveryReservationId: delivery.id,
          plannedBubbles: bubbles,
        };
      } finally {
        this.activeOwners.delete(ownerId);
      }
    } catch (error) {
      if (urgentItem && !decisionLogged) {
        retryUrgentWake(this.db, urgentItem.id);
      }
      throw error;
    }
  }

  /** Decide without drafting — used by /initiative/evaluate. Never claims urgent wakes. */
  evaluateProactive(ownerId: string): {
    shouldReachOut: boolean;
    reason: string;
    angle?: ProactiveDraft["angle"];
    cooldownRemainingSec: number;
    initiativeClass?: "ordinary" | "urgent_grounded";
  } {
    const initiativeClass = classifyInitiativeClass(this.db, ownerId);
    const status = this.getProactiveStatus(ownerId);
    const eligibility = evaluateProactiveEligibility(this.db, {
      ownerId,
      chatInProgress: this.activeOwners.has(ownerId),
      paused: this.isProactivePaused(ownerId),
      enabled: env.proactiveEnabled,
      sentToday: status.sentToday,
      maxPerDay: status.maxPerDay,
      lastUserMessageAt: status.lastUserMessageAt,
      minIdleHours: status.minIdleHours,
      hasUrgent: initiativeClass === "urgent_grounded",
    });
    if (!eligibility.ok) {
      return {
        shouldReachOut: false,
        reason: eligibility.reason,
        cooldownRemainingSec: eligibility.cooldownRemainingSec ?? 0,
        initiativeClass: eligibility.initiativeClass,
      };
    }

    seedIdentity(this.db, ownerId);

    const motivations = selectMotivationCandidates(
      this.db,
      ownerId,
      "proactive",
      applyInitiativeLearning(
        this.db,
        ownerId,
        collectMotivations(this.db, ownerId, "proactive"),
        this.reflectionMode,
      ),
    );
    const decision = decide(motivations, "proactive");
    if (!decision.cognitiveAllocation.shouldSpeak || decision.score < 25) {
      return {
        shouldReachOut: false,
        reason: decision.reason,
        cooldownRemainingSec: 0,
        initiativeClass: eligibility.initiativeClass,
      };
    }
    return {
      shouldReachOut: true,
      reason: decision.reason,
      angle: decisionAngle(decision.kind),
      cooldownRemainingSec: 0,
      initiativeClass: eligibility.initiativeClass,
    };
  }

  commitProactive(
    ownerId: string,
    input: ProactiveCommitInput,
  ): void;
  commitProactive(
    ownerId: string,
    reservationId: number,
    discordMessageId: string,
  ): void;
  commitProactive(
    ownerId: string,
    inputOrReservation: ProactiveCommitInput | number,
    discordMessageId?: string,
  ): void {
    const input =
      typeof inputOrReservation === "number"
        ? null
        : inputOrReservation;
    const reservationId =
      typeof inputOrReservation === "number"
        ? inputOrReservation
        : input?.reservationId;
    const deliveryReservationId = input?.deliveryReservationId;

    if (deliveryReservationId != null) {
      const receipts =
        input?.bubbleReceipts && input.bubbleReceipts.length > 0
          ? input.bubbleReceipts
          : input?.discordMessageId || discordMessageId
            ? [
                {
                  ordinal: 0,
                  discordMessageId:
                    input?.discordMessageId ?? discordMessageId ?? "",
                },
              ]
            : [];
      for (const receipt of receipts) {
        if (!receipt.discordMessageId) continue;
        recordBubbleReceipt(
          this.db,
          deliveryReservationId,
          receipt.ordinal,
          receipt.discordMessageId,
        );
      }
      finalizeDelivery(this.db, {
        reservationId: deliveryReservationId,
        ownerId,
        cause: input?.partial ? "send_failure" : "complete",
      });
      recordProactiveDiagnostic(
        this.db,
        ownerId,
        "delivery",
        input?.partial ? "delivery_partial" : "delivery_committed",
      );
      return;
    }

    if (reservationId !== undefined) {
      const row: unknown = this.db
        .prepare(
          `SELECT id, owner_id, decision_id, text, thread_id, committed_at
           FROM initiative_reservations
           WHERE id = ? AND owner_id = ?`,
        )
        .get(reservationId, ownerId);
      if (!isRow(row)) return;
      if (row.committed_at !== null && row.committed_at !== undefined) return;
      const text = stringValue(row.text, input?.text ?? "");
      const threadId = stringValue(row.thread_id, input?.threadId ?? "");
      const messageId = input?.discordMessageId ?? discordMessageId ?? "";
      if (!text || !threadId || !messageId) return;

      const linkedDelivery = this.db
        .prepare(
          `SELECT id FROM delivery_reservations
           WHERE initiative_reservation_id = ? AND owner_id = ?
           ORDER BY id DESC LIMIT 1`,
        )
        .get(reservationId, ownerId);
      if (isRow(linkedDelivery)) {
        recordBubbleReceipt(
          this.db,
          Number(linkedDelivery.id),
          0,
          messageId,
        );
        finalizeDelivery(this.db, {
          reservationId: Number(linkedDelivery.id),
          ownerId,
          cause: "complete",
        });
        recordProactiveDiagnostic(this.db, ownerId, "delivery", "delivery_committed");
        return;
      }

      const assistantMessageId = insertMessage(this.db, {
        threadId,
        ownerId,
        role: "assistant",
        text,
        channel: "discord",
      });
      enqueueCognitiveJob(this.db, {
        ownerId,
        kind: "consolidate_thread",
        sourceKey: `thread:${threadId}:message:${assistantMessageId}`,
        payload: { threadId, throughMessageId: assistantMessageId },
        availableAt: new Date(
          Date.now() + env.cognitionIdleConsolidationMin * 60_000,
        ).toISOString(),
      });
      this.db.prepare(
        `UPDATE initiative_reservations
         SET discord_message_id = ?, committed_at = ?
         WHERE id = ? AND owner_id = ? AND committed_at IS NULL`,
      ).run(messageId, new Date().toISOString(), reservationId, ownerId);
      const decisionId = numberValue(row.decision_id);
      if (decisionId !== null) setDecisionOutcome(this.db, decisionId, text);
      patchState(this.db, ownerId, {
        availability: "available",
      });
      return;
    }

    if (!input) return;
    insertMessage(this.db, {
      threadId: input.threadId,
      ownerId,
      role: "assistant",
      text: input.text,
      channel: "discord",
    });
  }

  abortProactive(reservationId: number): void;
  abortProactive(ownerId: string, reservationId: number): void;
  abortProactive(first: number | string, second?: number): void {
    const ownerId = typeof first === "string" ? first : null;
    const reservationId = typeof first === "number" ? first : second;
    if (reservationId === undefined) return;
    const ownerClause = ownerId === null ? "" : " AND owner_id = ?";
    const params: Array<number | string> =
      ownerId === null ? [reservationId] : [reservationId, ownerId];
    const delivery = this.db
      .prepare(
        `SELECT id, owner_id FROM delivery_reservations
         WHERE initiative_reservation_id = ?${ownerId === null ? "" : " AND owner_id = ?"}
         ORDER BY id DESC LIMIT 1`,
      )
      .get(...params);
    if (isRow(delivery)) {
      finalizeDelivery(this.db, {
        reservationId: Number(delivery.id),
        ownerId: String(delivery.owner_id),
        cause: "send_failure",
      });
      if (ownerId !== null) {
        recordProactiveDiagnostic(this.db, ownerId, "delivery", "delivery_aborted");
      }
      return;
    }
    this.db
      .prepare(
        `DELETE FROM initiative_reservations
         WHERE id = ? AND committed_at IS NULL${ownerClause}`,
      )
      .run(...params);
    if (ownerId !== null) {
      recordProactiveDiagnostic(this.db, ownerId, "delivery", "delivery_aborted");
    }
  }

  pauseProactive(ownerId: string): void {
    setKv(this.db, kvKey(ownerId), "true");
  }

  resumeProactive(ownerId: string): void {
    setKv(this.db, kvKey(ownerId), "false");
  }

  isProactivePaused(ownerId: string): boolean {
    return getKv(this.db, kvKey(ownerId)) === "true";
  }

  getProactiveOperationalStatus(ownerId: string): {
    enabled: boolean;
    paused: boolean;
    sentToday: number;
    maxPerDay: number;
    lastSentAt: string | null;
    lastUserMessageAt: string | null;
    minIdleHours: number;
    lastDiagnostic: ProactiveDiagnostic | null;
  } {
    const today = new Date().toISOString().slice(0, 10);
    const sentRows = this.db
      .prepare(
        `SELECT committed_at
         FROM initiative_reservations
         WHERE owner_id = ? AND committed_at IS NOT NULL`,
      )
      .all(ownerId);
    const sentToday = sentRows.filter(
      (row) =>
        isRow(row) &&
        typeof row.committed_at === "string" &&
        row.committed_at.startsWith(today),
    ).length;
    const lastSent: unknown = this.db
      .prepare(
        `SELECT committed_at
         FROM initiative_reservations
         WHERE owner_id = ? AND committed_at IS NOT NULL
         ORDER BY committed_at DESC
         LIMIT 1`,
      )
      .get(ownerId);
    const lastUser: unknown = this.db
      .prepare(
        `SELECT created_at
         FROM mem_messages
         WHERE owner_id = ? AND role = 'user' AND redacted_at IS NULL
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(ownerId);
    return {
      enabled: env.proactiveEnabled,
      paused: this.isProactivePaused(ownerId),
      sentToday,
      maxPerDay: env.proactiveMaxPerDay,
      lastSentAt:
        isRow(lastSent) && typeof lastSent.committed_at === "string"
          ? lastSent.committed_at
          : null,
      lastUserMessageAt:
        isRow(lastUser) && typeof lastUser.created_at === "string"
          ? lastUser.created_at
          : null,
      minIdleHours: env.proactiveMinIdleHours,
      lastDiagnostic: readProactiveDiagnostic(this.db, ownerId),
    };
  }

  getProactiveStatus(ownerId: string): {
    enabled: boolean;
    paused: boolean;
    sentToday: number;
    maxPerDay: number;
    lastSentAt: string | null;
    lastUserMessageAt: string | null;
    minIdleHours: number;
    lastDiagnostic: ProactiveDiagnostic | null;
    cognitiveContinuity: ReturnType<typeof getOpenCognitiveContinuityStatus> & {
      lastClosedStageCode: string | null;
    };
  } {
    const operational = this.getProactiveOperationalStatus(ownerId);
    const cognitiveContinuity = getOpenCognitiveContinuityStatus(
      this.db,
      ownerId,
    );
    return {
      ...operational,
      cognitiveContinuity: {
        ...cognitiveContinuity,
        lastClosedStageCode: operational.lastDiagnostic?.code ?? null,
      },
    };
  }

  pause(ownerId: string): void {
    this.pauseProactive(ownerId);
  }

  resume(ownerId: string): void {
    this.resumeProactive(ownerId);
  }

  status(ownerId: string): ReturnType<AshleyCore["getProactiveStatus"]> {
    return this.getProactiveStatus(ownerId);
  }

  pinMemory(
    ownerId: string,
    text: string,
    _sensitivity: "none" | "private" = "none",
  ): { id: number; key: string; value: string; category: string } {
    const value = text.trim();
    const key = value.slice(0, 80).toLowerCase().replace(/\s+/g, "_");
    const id = upsertFact(this.db, {
      ownerId,
      category: "pinned",
      key,
      value,
      confidence: 1,
      importance: 95,
      origin: "manual",
    });
    return { id, key, value, category: "pinned" };
  }

  getMemorySummary(ownerId: string, _includePrivate = false): {
    facts: Array<{ category: string; key: string; value: string }>;
    threadId: string;
  } {
    const threadId = resolveActiveThread(this.db, ownerId, "discord");
    const facts = listActiveFacts(this.db, ownerId, 40).map((fact) => ({
      category: fact.category,
      key: fact.key,
      value: fact.value,
    }));
    return { facts, threadId };
  }

  newThread(ownerId: string): string {
    archiveActiveThread(this.db, ownerId);
    return resolveActiveThread(this.db, ownerId, "discord");
  }

  forget(
    ownerId: string,
    topic: string,
    confirmed: boolean,
    options: {
      previewId?: string | null;
      confirmationDiscordMessageId?: string | null;
      cancel?: boolean;
    } = {},
  ): ForgetResult {
    if (confirmed && !options.previewId?.trim() && !options.cancel) {
      throw new Error("forget_preview_id_required");
    }
    if (!confirmed && !options.cancel) {
      return forgetOwnerTopic(this.db, ownerId, topic, false, {
        continuity: this.continuity,
        confirmationDiscordMessageId: options.confirmationDiscordMessageId,
        previewId: options.previewId,
      });
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = forgetOwnerTopic(this.db, ownerId, topic, confirmed, {
        continuity: this.continuity,
        previewId: options.previewId,
        cancel: options.cancel,
      });
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof Error && error.message.startsWith("forget_integrity_failed:")) {
        recordCriticalFailure(
          this.db,
          "recall",
          `forget:${ownerId}:${Date.now()}`,
          "deletion_integrity",
          error.message,
        );
      }
      throw error;
    }
  }

  bindForgetConfirmation(
    ownerId: string,
    previewId: string,
    confirmationDiscordMessageId: string,
  ): void {
    if (!this.continuity) throw new Error("continuity_unavailable");
    bindForgetPreviewDiscordMessage(this.continuity, {
      previewId,
      ownerId,
      confirmationDiscordMessageId,
    });
  }

  resolveForgetPreviewByDiscordMessage(
    ownerId: string,
    confirmationDiscordMessageId: string,
  ): string | null {
    if (!this.continuity) return null;
    return resolvePreviewByDiscordMessage(
      this.continuity,
      ownerId,
      confirmationDiscordMessageId,
    );
  }

  continuitySnapshot(): {
    available: boolean;
    lineageId: string | null;
    recentEvents: Array<{ kind: string; occurredAt: string; detail: unknown }>;
  } {
    if (!this.continuity) {
      return { available: false, lineageId: null, recentEvents: [] };
    }
    const lineageId = getAuthoritativeLineageId(this.continuity);
    const rows = this.continuity
      .prepare(
        `SELECT kind, occurred_at, detail_json FROM continuity_events
         WHERE lineage_id = ?
         ORDER BY id DESC LIMIT 40`,
      )
      .all(lineageId) as Array<{
      kind: string;
      occurred_at: string;
      detail_json: string;
    }>;
    return {
      available: true,
      lineageId,
      recentEvents: rows.map((row) => ({
        kind: row.kind,
        occurredAt: row.occurred_at,
        detail: JSON.parse(row.detail_json) as unknown,
      })),
    };
  }

  relationshipSummary(
    ownerId: string,
    limit = 25,
    offset = 0,
  ): ReturnType<typeof listRelationshipSummary> {
    return listRelationshipSummary(this.db, ownerId, limit, offset);
  }

  nuclearStatusSnapshot(ownerId: string): {
    health: ReturnType<AshleyCore["getHealth"]>;
    initiative: ReturnType<AshleyCore["getProactiveStatus"]>;
    continuity: ReturnType<AshleyCore["continuitySnapshot"]>;
    relationshipState: ReturnType<typeof listCapabilityStatuses>[number] | undefined;
    sandbox: ReturnType<AshleyCore["getSandboxAvailability"]>;
  } {
    return {
      health: this.getHealth(),
      initiative: this.getProactiveStatus(ownerId),
      continuity: this.continuitySnapshot(),
      relationshipState: listCapabilityStatuses(this.db, env.cognitionMode).find(
        (row) => row.capability === "relationship_state",
      ),
      sandbox: this.getSandboxAvailability(),
    };
  }

  heartbeatContinuity(): void {
    if (this.continuity && this.sessionId) {
      heartbeatSession(this.continuity, this.sessionId);
    }
  }

  shutdownContinuityClean(): void {
    if (this.continuity && this.sessionId) {
      cleanShutdownSession(this.continuity, {
        sessionId: this.sessionId,
        lineageId: getAuthoritativeLineageId(this.continuity),
      });
    }
  }

  recordReaction(
    ownerId: string,
    input: { messageId: string; emoji: string },
  ): {
    feedback: "positive" | "negative" | "neutral";
    matchedInitiative: boolean;
    reflectionEventId: number | null;
    reflectionStatus: "applied" | "ignored" | null;
  } {
    const bare = input.emoji.replace(/\uFE0F/g, "");
    const positive = new Set(["😂", "🤣", "😭", "❤️", "🔥", "💯", "👍", "😍", "🙌", "😅"]);
    const negative = new Set(["👎", "🙄", "😐", "💀", "🤨", "😬"]);
    const feedback: "positive" | "negative" | "neutral" =
      positive.has(input.emoji) || positive.has(bare)
        ? "positive"
        : negative.has(input.emoji) || negative.has(bare)
          ? "negative"
          : "neutral";
    setKv(
      this.db,
      `signal:reaction:${ownerId}`,
      JSON.stringify({
        emoji: input.emoji,
        feedback,
        messageId: input.messageId,
        at: new Date().toISOString(),
      }),
    );
    const reflection = recordInitiativeReaction(this.db, ownerId, input);
    return {
      feedback,
      matchedInitiative: reflection.matchedInitiative,
      reflectionEventId: reflection.event?.id ?? null,
      reflectionStatus:
        reflection.event?.status === "applied" ||
        reflection.event?.status === "ignored"
          ? reflection.event.status
          : null,
    };
  }

  getReflections(ownerId: string, limit = 20) {
    return getReflectionOverview(
      this.db,
      ownerId,
      this.reflectionMode,
      limit,
    );
  }

  hasUrgentCognition(ownerId: string): boolean {
    const initiativeClass = classifyInitiativeClass(this.db, ownerId);
    if (initiativeClass !== "urgent_grounded") return false;
    const status = this.getProactiveStatus(ownerId);
    const eligibility = evaluateProactiveEligibility(this.db, {
      ownerId,
      chatInProgress: this.activeOwners.has(ownerId),
      paused: this.isProactivePaused(ownerId),
      enabled: env.proactiveEnabled,
      sentToday: status.sentToday,
      maxPerDay: status.maxPerDay,
      lastUserMessageAt: status.lastUserMessageAt,
      minIdleHours: status.minIdleHours,
      hasUrgent: true,
    });
    return eligibility.ok;
  }

  getCognitionOverview(ownerId: string) {
    return {
      mode: env.cognitionMode,
      capabilities: this.capabilityStatuses(),
      affect: getAffectiveState(this.db, ownerId),
      mindState: listActiveMindStateItems(this.db, ownerId),
      urgent: this.hasUrgentCognition(ownerId),
      jobs: this.db.prepare(
        `SELECT id, kind, source_key, status, attempts, available_at,
                last_error, created_at, updated_at
         FROM cognitive_jobs WHERE owner_id = ? ORDER BY id DESC LIMIT 30`,
      ).all(ownerId),
      runs: this.db.prepare(
          `SELECT id, job_id, kind, model, status, error, episode_id, created_at
         FROM cognitive_runs WHERE owner_id = ? ORDER BY id DESC LIMIT 30`,
      ).all(ownerId),
    };
  }

  getRevisions(ownerId: string, limit = 50) {
    return {
      mode: env.cognitionMode,
      capabilities: this.capabilityStatuses(),
      revisions: listRevisions(this.db, ownerId, limit),
    };
  }

  getIdentityReviews(ownerId: string, limit = 50) {
    return {
      mode: env.cognitionMode,
      reviews: listIdentityReviews(this.db, ownerId, limit),
    };
  }

  /**
   * Exact-item shadow authorization: the owner just acted on one review, so
   * only that review's revision may cross the shadow -> behavioral boundary,
   * and only if the joint review state (Ashley affirm + Doc approve) is
   * complete. No other shadow revision is ever eligible.
   */
  private applyReviewedRevisionIfComplete(ownerId: string, reviewId: number): void {
    const row = this.db.prepare(
      `SELECT revision_id FROM identity_reviews WHERE id = ? AND owner_id = ?`,
    ).get(reviewId, ownerId) as { revision_id?: number } | undefined;
    if (!row?.revision_id) return;
    applyEligibleRevisions(this.db, ownerId, env.cognitionMode, {
      allowShadow: true,
      revisionIds: [Number(row.revision_id)],
    });
  }

  recordAshleyIdentityPosition(input: {
    ownerId: string;
    reviewId: number;
    position: "affirm" | "object" | "defer";
    rationale: string;
    evidenceType: string;
    evidenceId: string | number;
  }) {
    const recorded = recordAshleyReviewPosition(this.db, input);
    if (recorded) this.applyReviewedRevisionIfComplete(input.ownerId, input.reviewId);
    return { recorded, reviews: listIdentityReviews(this.db, input.ownerId) };
  }

  recordDocIdentityDecision(input: {
    ownerId: string;
    reviewId: number;
    decision: "approve" | "reject" | "defer";
    rationale?: string;
  }) {
    const recorded = recordDocReviewDecision(this.db, input);
    if (recorded) this.applyReviewedRevisionIfComplete(input.ownerId, input.reviewId);
    return { recorded, reviews: listIdentityReviews(this.db, input.ownerId) };
  }

  // Identity proposals (foundational change approval flow)
  getIdentityProposals(ownerId: string, limit = 50) {
    return {
      proposals: listChangeProposals(this.db, ownerId, limit)
        .filter((p) => p.targetCategory === "foundational_identity" || p.targetCategory === "ordinary_identity"),
    };
  }

  getIdentityProposal(ownerId: string, entityUuid: string) {
    const proposal = getChangeProposalByEntityUuid(this.db, ownerId, entityUuid);
    if (!proposal) return null;
    if (proposal.targetCategory !== "foundational_identity" && proposal.targetCategory !== "ordinary_identity") {
      return null;
    }
    return {
      proposal,
      events: listChangeProposalEvents(this.db, ownerId, entityUuid),
    };
  }

  createIdentityProposal(input: {
    ownerId: string;
    layer: "stable" | "dynamic";
    kind: string;
    currentText: string | null;
    proposedText: string;
    rationale: string;
    evidenceRefs: string[];
  }) {
    const classification = classifyIdentityChange({
      layer: input.layer,
      kind: input.kind,
      currentText: input.currentText,
      proposedText: input.proposedText,
      isNewEntry: input.currentText === null,
    });

    const targetCategory = classification.class === "foundational" ? "foundational_identity" : "ordinary_identity";
    const riskClass = classification.class === "foundational" ? "consultation" : "low";
    const consultationRequired = classification.class === "foundational";

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    const proposal = createChangeProposal(this.db, {
      ownerId: input.ownerId,
      proposer: "ashley",
      targetCategory,
      objective: `Update ${input.layer} identity ${input.kind}: ${input.kind}`,
      rationale: input.rationale,
      riskClass,
      expiresAt,
      consultationRequired,
    });

    // Record classification in event
    const { appendChangeProposalEvent } = require("./change-proposal/store.js");
    appendChangeProposalEvent(this.db, {
      ownerId: input.ownerId,
      proposalEntityUuid: proposal.entityUuid,
      eventType: "identity_classification",
      actor: "ashley",
      payload: {
        classification: classification.class,
        reason: classification.reason,
        targetKind: classification.targetKind,
        layer: input.layer,
        kind: input.kind,
      },
    });

    return { proposal, classification };
  }

  approveIdentityProposal(ownerId: string, entityUuid: string) {
    const proposal = getChangeProposalByEntityUuid(this.db, ownerId, entityUuid);
    if (!proposal) throw new Error("proposal not found");
    if (proposal.targetCategory !== "foundational_identity" && proposal.targetCategory !== "ordinary_identity") {
      throw new Error("not an identity proposal");
    }
    if (proposal.state !== "awaiting_doc_decision" && proposal.state !== "proposed") {
      throw new Error(`cannot approve proposal in state ${proposal.state}`);
    }

    // For foundational_identity, the change-proposal lifecycle requires:
    // proposed -> awaiting_ashley_position -> awaiting_doc_decision -> approved
    // For ordinary_identity: proposed -> approved (via routeToRevisions)
    // We simulate the owner approval as the Doc decision
    const { transitionProposal } = require("./change-proposal/lifecycle.js");
    
    let result;
    if (proposal.targetCategory === "foundational_identity") {
      // Move through the required states
      if (proposal.state === "proposed") {
        result = transitionProposal(this.db, ownerId, entityUuid, "awaiting_ashley_position", "doc");
        if (!result.ok) throw new Error(result.errorCode);
      }
      // Re-fetch proposal after state change
      const afterAshley = getChangeProposalByEntityUuid(this.db, ownerId, entityUuid);
      if (afterAshley?.state === "awaiting_ashley_position") {
        result = transitionProposal(this.db, ownerId, entityUuid, "awaiting_doc_decision", "doc");
        if (!result.ok) throw new Error(result.errorCode);
      }
      result = transitionProposal(this.db, ownerId, entityUuid, "approved", "doc");
      if (!result.ok) throw new Error(result.errorCode);
    } else {
      // ordinary_identity goes straight to approved
      result = transitionProposal(this.db, ownerId, entityUuid, "approved", "doc");
      if (!result.ok) throw new Error(result.errorCode);
    }

    // Apply the revision if this was linked to one
    if (proposal.linkedRevisionEntityUuid) {
      // The revision will be applied via applyEligibleRevisions when mode=apply
      // For now, we return success
    }

    return { approved: true, proposal: getChangeProposalByEntityUuid(this.db, ownerId, entityUuid) };
  }

  rejectIdentityProposal(ownerId: string, entityUuid: string, rationale: string) {
    const proposal = getChangeProposalByEntityUuid(this.db, ownerId, entityUuid);
    if (!proposal) throw new Error("proposal not found");
    if (proposal.targetCategory !== "foundational_identity" && proposal.targetCategory !== "ordinary_identity") {
      throw new Error("not an identity proposal");
    }
    if (proposal.state === "approved" || proposal.state === "rejected") {
      throw new Error(`cannot reject proposal in state ${proposal.state}`);
    }

    const { transitionProposal } = require("./change-proposal/lifecycle.js");
    const result = transitionProposal(this.db, ownerId, entityUuid, "rejected", "doc", { rationale });
    if (!result.ok) throw new Error(result.errorCode);

    return { rejected: true, proposal: getChangeProposalByEntityUuid(this.db, ownerId, entityUuid) };
  }

  withdrawIdentityProposal(ownerId: string, entityUuid: string) {
    const proposal = getChangeProposalByEntityUuid(this.db, ownerId, entityUuid);
    if (!proposal) throw new Error("proposal not found");
    if (proposal.targetCategory !== "foundational_identity" && proposal.targetCategory !== "ordinary_identity") {
      throw new Error("not an identity proposal");
    }
    if (proposal.state === "approved" || proposal.state === "rejected" || proposal.state === "superseded") {
      throw new Error(`cannot withdraw proposal in state ${proposal.state}`);
    }

    const { transitionProposal } = require("./change-proposal/lifecycle.js");
    const result = transitionProposal(this.db, ownerId, entityUuid, "superseded", "ashley");
    if (!result.ok) throw new Error(result.errorCode);

    return { withdrawn: true, proposal: getChangeProposalByEntityUuid(this.db, ownerId, entityUuid) };
  }

  getChangeProposals(ownerId: string, limit = 50) {
    return {
      proposals: listChangeProposals(this.db, ownerId, limit),
    };
  }

  getChangeProposal(ownerId: string, entityUuid: string) {
    const proposal = getChangeProposalByEntityUuid(this.db, ownerId, entityUuid);
    if (!proposal) return null;
    return {
      proposal,
      events: listChangeProposalEvents(this.db, ownerId, entityUuid),
    };
  }

  createChangeProposalRecord(input: {
    ownerId: string;
    proposer: "ashley" | "operator";
    targetCategory: Parameters<typeof createChangeProposal>[1]["targetCategory"];
    objective: string;
    rationale: string;
    riskClass: "low" | "medium" | "high" | "consultation";
    expiresAt: string;
    baseCommit?: string;
    baseTreeHash?: string;
    linkedRevisionEntityUuid?: string;
    linkedIdentityReviewEntityUuid?: string;
    consultationRequired?: boolean;
  }) {
    return createChangeProposal(this.db, input);
  }

  submitChangeProposal(ownerId: string, entityUuid: string) {
    return proposeChange(this.db, ownerId, entityUuid, "ashley");
  }

  recordChangeProposalAshleyPosition(input: {
    ownerId: string;
    entityUuid: string;
    position: "affirm" | "object" | "defer";
  }) {
    return recordAshleyPosition(
      this.db,
      input.ownerId,
      input.entityUuid,
      input.position,
      "ashley",
    );
  }

  recordChangeProposalDocDecision(input: {
    ownerId: string;
    entityUuid: string;
    decision: "approve" | "reject" | "defer";
  }) {
    return recordDocDecision(
      this.db,
      input.ownerId,
      input.entityUuid,
      input.decision,
      "doc",
    );
  }

  recordChangeProposalExternalOutcome(input: {
    ownerId: string;
    entityUuid: string;
    outcome: "committed" | "deployed" | "abandoned";
    note?: string;
  }) {
    return recordExternalOutcome(
      this.db,
      input.ownerId,
      input.entityUuid,
      input.outcome,
      "doc",
      input.note,
    );
  }

  getExternalActions(ownerId: string, limit = 50) {
    return {
      actions: listExternalActions(this.db, ownerId, limit),
      emergencyStop: getEmergencyStop(this.db, ownerId),
    };
  }

  getExternalAction(ownerId: string, entityUuid: string) {
    const action = getExternalActionByEntityUuid(this.db, ownerId, entityUuid);
    if (!action) return null;
    return {
      action,
      events: listExternalActionEvents(this.db, ownerId, entityUuid),
    };
  }

  getExternalAccounts(ownerId: string) {
    return {
      accounts: listVaultCredentials(this.db, ownerId).map((row) => ({
        credentialRef: row.credentialRef,
        entityUuid: row.entityUuid,
        destinationId: row.destinationId,
        state: row.state,
        credentialLineageRef: row.credentialLineageRef,
      })),
    };
  }

  cancelExternalAction(ownerId: string, entityUuid: string) {
    return cancelAction(this.db, ownerId, entityUuid, "doc");
  }

  reconcileExternalAction(
    ownerId: string,
    entityUuid: string,
    outcome: "committed" | "partially_delivered" | "aborted" | "outcome_unknown",
  ) {
    return reconcileAction(this.db, ownerId, entityUuid, "doc", outcome);
  }

  revokeExternalCredential(ownerId: string, credentialRef: string) {
    return revokeVaultCredential(this.db, ownerId, credentialRef);
  }

  setExternalEmergencyStop(ownerId: string, active: boolean) {
    return setEmergencyStop(this.db, ownerId, active);
  }

  getCapabilities() {
    return {
      masterMode: env.cognitionMode,
      capabilities: this.capabilityStatuses(),
      infrastructure: {
        sandbox: this.getSandboxAvailability(),
      },
    };
  }

  getRoutingStatus(): RoutingRouteStatus[] {
    return routingStatus(this.db);
  }

  getAttentionObservability() {
    return attentionObservability(this.db);
  }

  recordCapabilityEvaluation(input: {
    capability: string;
    seeds: number;
    passed: boolean;
    sourceKey: string;
  }) {
    if (!capabilityNames.includes(input.capability as CapabilityName)) {
      throw new Error("invalid_capability");
    }
    recordIsolatedEvaluation(
      this.db,
      input.capability as CapabilityName,
      {
        seeds: input.seeds,
        passed: input.passed,
        sourceKey: input.sourceKey,
      },
    );
    return this.getCapabilities();
  }

  promoteCapability(input: { capability: string; authorizedBy: string }) {
    if (!capabilityNames.includes(input.capability as CapabilityName)) {
      throw new Error("invalid_capability");
    }
    const result = promoteCapabilityRelease(
      this.db,
      input.capability as CapabilityName,
      { authorizedBy: input.authorizedBy },
    );
    return { ...result, capabilities: this.getCapabilities() };
  }

  operatorRollbackCapability(input: { capability: string; authorizedBy: string }) {
    if (!capabilityNames.includes(input.capability as CapabilityName)) {
      throw new Error("invalid_capability");
    }
    const result = operatorRollbackCapabilityRelease(
      this.db,
      input.capability as CapabilityName,
      { authorizedBy: input.authorizedBy },
    );
    return { ...result, capabilities: this.getCapabilities() };
  }

  recordRecallCutover(ownerId: string, input: { authorizedBy: string }) {
    const result = recordRecallLiveCutover(this.db, ownerId, { authorizedBy: input.authorizedBy });
    return result;
  }

  startRecallQualificationEpoch(input: {
    authorizedBy: string;
    startRequestKey: string;
    expectedCurrentEpochId: string | null;
  }) {
    const result = startRecallQualificationEpochRelease(this.db, input);
    return {
      ...result,
      qualificationEpochs: listRecallQualificationEpochs(this.db),
      currentQualificationEpoch: getCurrentRecallQualificationEpoch(this.db),
    };
  }

  listRecallQualificationEpochs() {
    return {
      current: getCurrentRecallQualificationEpoch(this.db),
      epochs: listRecallQualificationEpochs(this.db),
    };
  }

  revertRevision(ownerId: string, revisionId: number): boolean {
    return revertRevision(this.db, ownerId, revisionId);
  }

  recordGifFeedback(
    ownerId: string,
    input: { query: string; success: boolean },
  ): void {
    setKv(
      this.db,
      `signal:gif:${ownerId}:${Date.now()}`,
      JSON.stringify({ ...input, at: new Date().toISOString() }),
    );
  }

  listSuccessfulGifQueries(ownerId: string): string[] {
    const rows = this.db
      .prepare(`SELECT key, value FROM kv WHERE key LIKE ? ORDER BY key DESC LIMIT 40`)
      .all(`signal:gif:${ownerId}:%`);
    const out: string[] = [];
    for (const row of rows) {
      if (!isRow(row) || typeof row.value !== "string") continue;
      try {
        const parsed = JSON.parse(row.value) as { query?: string; success?: boolean };
        if (parsed.success && parsed.query) out.push(parsed.query);
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  recordEmojiWeight(
    _ownerId: string,
    emoji: string,
    context: string,
    positive: boolean,
  ): number {
    const key = `signal:emoji:${emoji}:${context}`;
    const prevRaw = getKv(this.db, key);
    let weight = positive ? 1 : -1;
    if (prevRaw) {
      const n = Number(prevRaw);
      if (Number.isFinite(n)) weight = n + (positive ? 1 : -1);
    }
    setKv(this.db, key, String(weight));
    return weight;
  }

  lookupPreflight(_message: string): boolean {
    return false;
  }

  getCuriosityStatus(ownerId: string): {
    enabled: boolean;
    sources: number;
    sourcesEnabled: number;
    itemsToday: number;
    readToday: number;
    takesToday: number;
    takesRecent: number;
    lastTakeAt: string | null;
    presence: {
      ownTime: boolean;
      proactivePaused: boolean;
      curiosityEnabled: boolean;
      owing: null;
      lastTake: {
        title: string;
        depth: "full" | "excerpt";
        createdAt: string;
        ageMin: number;
      } | null;
    };
  } {
    const sources = listSources(this.db, 100).filter((s) => s.enabled);
    const takes = listRecentTakes(this.db, 12);
    const reads = listRecentReads(this.db, 100);
    const today = new Date().toISOString().slice(0, 10);
    const takesToday = takes.filter((t) => t.createdAt.startsWith(today)).length;
    const readsToday = reads.filter((read) => read.retrievedAt.startsWith(today)).length;
    const itemsTodayRow = this.db.prepare(
      "SELECT COUNT(*) AS count FROM cur_items WHERE seen_at >= ?",
    ).get(`${today}T00:00:00.000Z`) as { count?: number } | undefined;
    const last = takes[0] ?? null;
    const ageMin = last
      ? Math.max(0, (Date.now() - Date.parse(last.createdAt)) / 60_000)
      : 0;
    return {
      enabled: env.curiosityEnabled,
      sources: sources.length,
      sourcesEnabled: sources.length,
      itemsToday: Number(itemsTodayRow?.count ?? 0),
      readToday: readsToday,
      takesToday,
      takesRecent: takes.length,
      lastTakeAt: last?.createdAt ?? null,
      presence: {
        ownTime: hasOpenOwnTimeSession(this.db, ownerId),
        proactivePaused: this.isProactivePaused(ownerId),
        curiosityEnabled: env.curiosityEnabled,
        owing: null,
        lastTake: last
          ? {
              title: last.title,
              depth: last.evidenceKind === "read_record" ? "full" : "excerpt",
              createdAt: last.createdAt,
              ageMin,
            }
          : null,
      },
    };
  }

  async runCuriosityTick(ownerId: string): Promise<{
    sourcesScanned: number;
    itemsInserted: number;
    takesCreated: number;
    readsCreated: number;
    sourcesActivated: number;
    errors: string[];
  }> {
    return runNuclearCuriosityTick(this.db, ownerId);
  }

  async generateProactive(ownerId: string): Promise<ProactiveResult> {
    return this.tickProactive(ownerId);
  }

  debugMemoryContext(ownerId: string, message: string): {
    memoryBlockPreview: string;
    hotMessageCount: number;
    threadId: string;
  } {
    const turn = composeTurnContext(this.db, ownerId, {
      channel: "discord",
      userMessage: message,
    });
    return {
      memoryBlockPreview: turn.systemPrompt.slice(0, 2000),
      hotMessageCount: turn.hotMessages.length,
      threadId: turn.threadId,
    };
  }

  getDatabase(): DatabaseSync {
    return this.db;
  }

  getHealth(): {
    ok: boolean;
    nuclearEnabled: boolean;
    dbPath: string;
    schemaVersion: number;
    reflectionMode: ReflectionMode;
    cognitionMode: "observe" | "apply";
    capabilities: ReturnType<typeof listCapabilityStatuses>;
    identityEntries: number;
    decisions: number;
  } {
    try {
      this.db.prepare("SELECT 1").get();
      const versionRow: unknown = this.db
        .prepare("PRAGMA user_version")
        .get();
      const version =
        isRow(versionRow) && typeof versionRow.user_version === "number"
          ? versionRow.user_version
          : 0;
      const identityRow: unknown = this.db
        .prepare("SELECT COUNT(*) AS count FROM identity_entries")
        .get();
      const decisionsRow: unknown = this.db
        .prepare("SELECT COUNT(*) AS count FROM decision_log")
        .get();
      return {
        ok: version >= 10,
        nuclearEnabled: true,
        dbPath: NUCLEAR_DB_PATH,
        schemaVersion: version,
        reflectionMode: this.reflectionMode,
        cognitionMode: env.cognitionMode,
        capabilities: this.capabilityStatuses(),
        identityEntries:
          isRow(identityRow) && typeof identityRow.count === "number"
            ? identityRow.count
            : 0,
        decisions:
          isRow(decisionsRow) && typeof decisionsRow.count === "number"
            ? decisionsRow.count
            : 0,
      };
    } catch {
      return {
        ok: false,
        nuclearEnabled: true,
        dbPath: NUCLEAR_DB_PATH,
        schemaVersion: 0,
        reflectionMode: this.reflectionMode,
        cognitionMode: env.cognitionMode,
        capabilities: [],
        identityEntries: 0,
        decisions: 0,
      };
    }
  }

  getHealthSnapshot(input: HealthSnapshotInput): {
    liveness: boolean;
    ready: boolean;
    provider: CoreProviderState;
    db: {
      schemaVersion: number;
      integrity: "ok" | "failed";
      foreignKeys: "enabled" | "disabled" | "unknown";
      continuity: {
        available: boolean;
        schemaVersion: number | null;
        lineagePresent: boolean;
      };
    };
    deliveryPressure: {
      byState: Array<{ state: string; count: number }>;
      activeReservations: number;
      inboundMessages: number;
    };
    backgroundStarvation: {
      attentionQueued: number;
      attentionOldestAgeSec: number | null;
      cognitivePending: number;
      cognitiveOldestAgeSec: number | null;
    };
    backup: {
      available: boolean;
      lastVerifiedAt: string | null;
      lastCreatedAt: string | null;
      ageSec: number | null;
      lineageId: string | null;
    };
    capabilities: {
      masterMode: "observe" | "apply";
      effectiveCount: number;
      byState: Record<string, number>;
      contractMismatch: boolean;
    };
    identity: {
      buildIdentity: string;
      contractId: string;
      modelEpoch: number;
      resolvedModels: Array<{ alias: string; resolvedModelId: string | null; epoch: number }>;
    };
  } {
    const now = Date.now();
    const coreHealth = this.getHealth();
    const attention = this.getAttentionObservability();
    const rowNumber = (value: unknown): number =>
      typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
    const ageSec = (value: unknown): number | null => {
      if (typeof value !== "string") return null;
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp)
        ? Math.max(0, Math.floor((now - timestamp) / 1000))
        : null;
    };

    let integrity: "ok" | "failed" = "failed";
    let foreignKeys: "enabled" | "disabled" | "unknown" = "unknown";
    try {
      const quick = this.db.prepare("PRAGMA quick_check(1)").get() as Record<string, unknown> | undefined;
      integrity = quick?.quick_check === "ok" ? "ok" : "failed";
      const fk = this.db.prepare("PRAGMA foreign_keys").get() as Record<string, unknown> | undefined;
      foreignKeys = rowNumber(fk?.foreign_keys) === 1 ? "enabled" : "disabled";
    } catch {
      integrity = "failed";
    }

    const deliveryRows = this.db.prepare(
      `SELECT state, COUNT(*) AS count
       FROM delivery_reservations
       GROUP BY state ORDER BY state`,
    ).all() as Array<Record<string, unknown>>;
    const inboundRow = this.db.prepare(
      "SELECT COUNT(*) AS count FROM delivery_inbound_messages",
    ).get() as Record<string, unknown> | undefined;
    const activeRow = this.db.prepare(
      `SELECT COUNT(*) AS count FROM delivery_reservations
       WHERE state IN ('drafted', 'reserved', 'sending')`,
    ).get() as Record<string, unknown> | undefined;

    const queuedAttention = (attention.queuedByLane as Array<Record<string, unknown>>)
      .reduce((sum, row) => sum + rowNumber(row.c), 0);
    const oldestAttention = (attention.queuedByLane as Array<Record<string, unknown>>)
      .map((row) => ageSec(row.oldest))
      .filter((value): value is number => value != null)
      .sort((a, b) => b - a)[0] ?? null;
    const cognitiveRows = this.db.prepare(
      `SELECT COUNT(*) AS count, MIN(available_at) AS oldest
       FROM cognitive_jobs WHERE status IN ('pending', 'running')`,
    ).get() as Record<string, unknown> | undefined;

    let continuityAvailable = false;
    let continuitySchemaVersion: number | null = null;
    let lineagePresent = false;
    let backup: {
      available: boolean;
      lastVerifiedAt: string | null;
      lastCreatedAt: string | null;
      ageSec: number | null;
      lineageId: string | null;
    } = {
      available: false,
      lastVerifiedAt: null,
      lastCreatedAt: null,
      ageSec: null,
      lineageId: null,
    };
    if (this.continuity) {
      continuityAvailable = true;
      try {
        const version = this.continuity.prepare("PRAGMA user_version").get() as Record<string, unknown> | undefined;
        continuitySchemaVersion = rowNumber(version?.user_version);
        const lineage = getAuthoritativeLineageId(this.continuity);
        lineagePresent = Boolean(lineage);
        const last = this.continuity.prepare(
          `SELECT occurred_at, lineage_id FROM backup_watermarks
           WHERE kind = 'backup' ORDER BY id DESC LIMIT 1`,
        ).get() as Record<string, unknown> | undefined;
        if (typeof last?.occurred_at === "string" && typeof last.lineage_id === "string") {
          backup = {
            available: true,
            // A watermark proves package creation, not a later restore verify.
            lastVerifiedAt: null,
            lastCreatedAt: last.occurred_at,
            ageSec: ageSec(last.occurred_at),
            lineageId: last.lineage_id,
          };
        }
      } catch {
        continuityAvailable = false;
      }
    }

    const capabilityStatuses = coreHealth.capabilities;
    const byState: Record<string, number> = {};
    for (const status of capabilityStatuses) {
      byState[status.state] = (byState[status.state] ?? 0) + 1;
    }
    const resolvedModels = (attention.continuity as Array<Record<string, unknown>>).map((row) => ({
      alias: String(row.alias ?? ""),
      resolvedModelId: typeof row.resolved_model_id === "string" ? row.resolved_model_id : null,
      epoch: rowNumber(row.model_epoch),
    }));

    return {
      liveness: true,
      ready: input.ready,
      provider: input.providerState,
      db: {
        schemaVersion: coreHealth.schemaVersion,
        integrity,
        foreignKeys,
        continuity: {
          available: continuityAvailable,
          schemaVersion: continuitySchemaVersion,
          lineagePresent,
        },
      },
      deliveryPressure: {
        byState: deliveryRows.map((row) => ({
          state: String(row.state ?? ""),
          count: rowNumber(row.count),
        })),
        activeReservations: rowNumber(activeRow?.count),
        inboundMessages: rowNumber(inboundRow?.count),
      },
      backgroundStarvation: {
        attentionQueued: queuedAttention,
        attentionOldestAgeSec: oldestAttention,
        cognitivePending: rowNumber(cognitiveRows?.count),
        cognitiveOldestAgeSec: ageSec(cognitiveRows?.oldest),
      },
      backup,
      capabilities: {
        masterMode: env.cognitionMode,
        effectiveCount: capabilityStatuses.filter((status) => status.effective).length,
        byState,
        contractMismatch: capabilityStatuses.some((status) => status.contractMismatch),
      },
      identity: {
        buildIdentity: attention.buildIdentity,
        contractId: attention.contractId,
        modelEpoch: attention.modelEpoch,
        resolvedModels,
      },
    };
  }
}
