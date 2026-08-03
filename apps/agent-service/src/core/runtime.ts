import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { NUCLEAR_DB_PATH } from "../paths.js";
import { decide, attachAuthorizedClaims } from "./agency/decide.js";
import { collectMotivations } from "./agency/motivations.js";
import { deliberateDecision } from "./agency/thought.js";
import { logDecision, setDecisionOutcome } from "./agency/log.js";
import { composeTurnContext } from "./context-composer.js";
import { expressSpeak } from "./conversation/expression.js";
import { seedIdentity } from "./identity/seed.js";
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
  listRecentTakes,
  listSources,
  readingProvenanceFailure,
} from "./curiosity/feed.js";
import { runNuclearCuriosityTick } from "./curiosity/tick.js";
import { listRecentReads } from "./curiosity/reads.js";
import { openNuclearDb } from "./db.js";
import {
  applyInitiativeLearning,
  attachLearningSnapshot,
  getReflectionOverview,
  processPendingReflectionEvents,
  recordInitiativeReaction,
} from "./reflection/initiative.js";
import type { Decision, DecisionKind, ReflectionMode } from "./types.js";
import { attachAffectLicense, getAffectiveState } from "./state/affect.js";
import { enqueueCognitiveJob } from "./cognition/jobs.js";
import {
  claimUrgentMindState,
  consumeUrgentWake,
  hasUrgentMindState,
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
import { forgetOwnerTopic, type ForgetResult } from "./memory/forget.js";
import {
  capabilityCanInfluence,
  capabilityNames,
  listCapabilityStatuses,
  recordCriticalFailure,
  recordIsolatedEvaluation,
  recordLiveShadowEvent,
  type CapabilityName,
} from "./rollout/capabilities.js";

export type ReactiveChatInput = {
  message: string;
  ownerId: string;
  channel: "discord";
};

export type ReactiveChatResult = {
  text: string;
  threadId: string;
  model: string;
  decisionId: number;
  decisionKind: DecisionKind;
  silenced?: boolean;
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
};

export type ProactiveResult = ProactiveSkip | ProactiveDraft;

export type ProactiveCommitInput = {
  reservationId?: number;
  text: string;
  threadId: string;
  angle: string;
  reason: string;
  discordMessageId: string;
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
    recordLiveShadowEvent(db, "thought", `decision:${decisionId}`);
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

export class AshleyCore {
  private readonly db: DatabaseSync;
  private readonly reflectionMode: ReflectionMode;
  private readonly activeOwners = new Set<string>();

  constructor(
    db?: DatabaseSync,
    options?: { reflectionMode?: ReflectionMode },
  ) {
    this.db = openNuclearDb(db);
    this.reflectionMode = options?.reflectionMode ?? env.reflectionMode;
    processPendingReflectionEvents(this.db);
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
    try {
      const threadId = resolveActiveThread(
        this.db,
        input.ownerId,
        input.channel,
      );
      const userMessageId = insertMessage(this.db, {
        threadId,
        ownerId: input.ownerId,
        role: "user",
        text: message,
        channel: input.channel,
      });
      const written = writeFromUserTurn(this.db, input.ownerId, message);
      if (written.forgotTopic) {
        this.forget(input.ownerId, written.forgotTopic, true);
      }
      if (written.sleepSignal) {
        patchState(this.db, input.ownerId, {
          availability: "quiet",
          focus: "own_time",
        });
      }
      const motivations = collectMotivations(
        this.db,
        input.ownerId,
        "reactive",
        message,
        userMessageId,
      );
      let decision = decide(motivations, "reactive");
      decision = await deliberateDecision(this.db, decision, motivations, "reactive");
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
      const decisionId = logDecision(this.db, {
        ownerId: input.ownerId,
        channel: input.channel,
        trigger: "reactive",
        decision,
      });
      decision.id = decisionId;
      setLastDecision(this.db, input.ownerId, decisionId);

      const turn = composeTurnContext(this.db, input.ownerId, {
        channel: "discord",
        userMessage: message,
        decision,
      });

      if (!decision.cognitiveAllocation.shouldSpeak) {
        patchState(this.db, input.ownerId, {
          availability: decision.kind === "silence" ? "quiet" : "available",
        });
        setDecisionOutcome(this.db, decisionId, "");
        return {
          text: "",
          threadId: turn.threadId,
          model: "none",
          decisionId,
          decisionKind: decision.kind,
          ...(decision.kind === "silence" ? { silenced: true } : {}),
        };
      }

      const rendered = await expressSpeak(turn, decision, message, "discord");
      const text = rendered.text.trim();
      if (text) {
        const assistantMessageId = insertMessage(this.db, {
          threadId: turn.threadId,
          ownerId: input.ownerId,
          role: "assistant",
          text,
          channel: input.channel,
        });
        enqueueCognitiveJob(this.db, {
          ownerId: input.ownerId,
          kind: "consolidate_thread",
          sourceKey: `thread:${turn.threadId}:message:${assistantMessageId}`,
          payload: {
            threadId: turn.threadId,
            throughMessageId: assistantMessageId,
          },
          availableAt: new Date(
            Date.now() + env.cognitionIdleConsolidationMin * 60_000,
          ).toISOString(),
        });
      }
      patchState(this.db, input.ownerId, {
        availability: "available",
      });
      setDecisionOutcome(this.db, decisionId, text);
      return {
        text,
        threadId: turn.threadId,
        model: rendered.model,
        decisionId,
        decisionKind: decision.kind,
      };
    } finally {
      this.activeOwners.delete(input.ownerId);
    }
  }

  async tickProactive(ownerId: string): Promise<ProactiveResult> {
    if (!env.proactiveEnabled) {
      return { shouldSend: false, reason: "proactive_disabled" };
    }
    if (this.isProactivePaused(ownerId)) {
      return { shouldSend: false, reason: "proactive_paused" };
    }
    const proactiveStatus = this.getProactiveStatus(ownerId);
    if (proactiveStatus.sentToday >= proactiveStatus.maxPerDay) {
      return { shouldSend: false, reason: "daily_cap" };
    }
    if (this.activeOwners.has(ownerId)) {
      return { shouldSend: false, reason: "chat_in_progress" };
    }

    seedIdentity(this.db, ownerId);
    this.auditReadingProvenance();
    if (getState(this.db, ownerId).availability !== "available") {
      return { shouldSend: false, reason: "unavailable" };
    }
    const urgentItem = capabilityCanInfluence(this.db, "relational_initiative")
      ? claimUrgentMindState(this.db, ownerId)
      : null;
    let decisionLogged = false;
    try {
      const motivations = applyInitiativeLearning(
        this.db,
        ownerId,
        collectMotivations(this.db, ownerId, "proactive"),
        this.reflectionMode,
      );
      let decision = decide(motivations, "proactive");
      decision = await deliberateDecision(this.db, decision, motivations, "proactive");
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
      if (!decision.cognitiveAllocation.shouldSpeak || decision.score < 25) {
        const decisionId = logProactiveDecision(
          this.db,
          ownerId,
          decision,
          urgentItem?.id ?? null,
          "",
        );
        decisionLogged = true;
        return { shouldSend: false, reason: decision.reason };
      }

      const decisionId = logProactiveDecision(
        this.db,
        ownerId,
        decision,
        urgentItem?.id ?? null,
      );
      decisionLogged = true;
      decision.id = decisionId;

      const candidate =
        motivations.find((motivation) =>
          decision.motivationIds.includes(motivation.id ?? -1),
        ) ?? motivations[0];
      if (!candidate) {
        setDecisionOutcome(this.db, decisionId, "");
        return { shouldSend: false, reason: "no_material" };
      }
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
        setDecisionOutcome(this.db, decisionId, "");
        return { shouldSend: false, reason: "material_already_reserved" };
      }
      const userMessage = `Proactive material:\n${candidate.summary}`;
      const turn = composeTurnContext(this.db, ownerId, {
        channel: "proactive",
        userMessage,
        decision,
      });
      recordLiveShadowEvent(this.db, "thought", `decision:${decisionId}`);
      this.activeOwners.add(ownerId);
      try {
        const rendered = await expressSpeak(
          turn,
          decision,
          userMessage,
          "proactive",
        );
        if (rendered.model === "offline" || !rendered.text.trim()) {
          setDecisionOutcome(this.db, decisionId, "");
          return { shouldSend: false, reason: "mistral_unavailable" };
        }
        const angle = decisionAngle(decision.kind);
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
            rendered.text.trim(),
            turn.threadId,
            angle,
            decision.reason,
            materialKey,
            new Date().toISOString(),
          );
        const reservationId = Number(result.lastInsertRowid);
        return {
          shouldSend: true,
          text: rendered.text.trim(),
          threadId: turn.threadId,
          angle,
          reason: decision.reason,
          candidateKind: candidate.kind,
          materialKey,
          reservationId,
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

  /** Decide without drafting — used by /initiative/evaluate. */
  evaluateProactive(ownerId: string): {
    shouldReachOut: boolean;
    reason: string;
    angle?: ProactiveDraft["angle"];
    cooldownRemainingSec: number;
  } {
    if (!env.proactiveEnabled) {
      return {
        shouldReachOut: false,
        reason: "proactive_disabled",
        cooldownRemainingSec: 0,
      };
    }
    if (this.isProactivePaused(ownerId)) {
      return {
        shouldReachOut: false,
        reason: "proactive_paused",
        cooldownRemainingSec: 0,
      };
    }
    seedIdentity(this.db, ownerId);
    const motivations = applyInitiativeLearning(
      this.db,
      ownerId,
      collectMotivations(this.db, ownerId, "proactive"),
      this.reflectionMode,
    );
    const decision = decide(motivations, "proactive");
    if (!decision.cognitiveAllocation.shouldSpeak || decision.score < 25) {
      return {
        shouldReachOut: false,
        reason: decision.reason,
        cooldownRemainingSec: 0,
      };
    }
    return {
      shouldReachOut: true,
      reason: decision.reason,
      angle: decisionAngle(decision.kind),
      cooldownRemainingSec: 0,
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
    this.db
      .prepare(
        `DELETE FROM initiative_reservations
         WHERE id = ? AND committed_at IS NULL${ownerClause}`,
      )
      .run(...params);
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

  getProactiveStatus(ownerId: string): {
    enabled: boolean;
    paused: boolean;
    sentToday: number;
    maxPerDay: number;
    lastSentAt: string | null;
    lastUserMessageAt: string | null;
    minIdleHours: number;
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
  ): ForgetResult {
    if (!confirmed) return forgetOwnerTopic(this.db, ownerId, topic, false);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = forgetOwnerTopic(this.db, ownerId, topic, true);
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
    if (
      !capabilityCanInfluence(this.db, "relational_initiative") ||
      !env.proactiveEnabled ||
      this.isProactivePaused(ownerId) ||
      this.activeOwners.has(ownerId) ||
      getState(this.db, ownerId).availability !== "available"
    ) {
      return false;
    }
    const status = this.getProactiveStatus(ownerId);
    return status.sentToday < status.maxPerDay &&
      hasUrgentMindState(this.db, ownerId);
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

  recordAshleyIdentityPosition(input: {
    ownerId: string;
    reviewId: number;
    position: "affirm" | "object" | "defer";
    rationale: string;
    evidenceType: string;
    evidenceId: string | number;
  }) {
    const recorded = recordAshleyReviewPosition(this.db, input);
    if (recorded) applyEligibleRevisions(this.db, input.ownerId, env.cognitionMode);
    return { recorded, reviews: listIdentityReviews(this.db, input.ownerId) };
  }

  recordDocIdentityDecision(input: {
    ownerId: string;
    reviewId: number;
    decision: "approve" | "reject" | "defer";
    rationale?: string;
  }) {
    const recorded = recordDocReviewDecision(this.db, input);
    if (recorded) applyEligibleRevisions(this.db, input.ownerId, env.cognitionMode);
    return { recorded, reviews: listIdentityReviews(this.db, input.ownerId) };
  }

  getCapabilities() {
    return {
      masterMode: env.cognitionMode,
      capabilities: this.capabilityStatuses(),
    };
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
    const state = getState(this.db, ownerId);
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
        ownTime: state.availability === "quiet",
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
        ok: version >= 9,
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
}
