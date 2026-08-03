import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { NUCLEAR_DB_PATH } from "../paths.js";
import { decide, attachAuthorizedClaims } from "./agency/decide.js";
import { collectMotivations } from "./agency/motivations.js";
import { logDecision, setDecisionOutcome } from "./agency/log.js";
import { composeTurnContext } from "./context-composer.js";
import { expressSpeak } from "./conversation/expression.js";
import { seedIdentity } from "./identity/seed.js";
import { forgetByTopic, listActiveFacts, upsertFact } from "./memory/facts.js";
import {
  archiveActiveThread,
  insertMessage,
  resolveActiveThread,
} from "./memory/threads.js";
import { getState, patchState, setLastDecision } from "./state/store.js";
import {
  writeFromAssistantTurn,
  writeFromUserTurn,
} from "./writers.js";
import { listRecentTakes, listSources } from "./curiosity/feed.js";
import { runNuclearCuriosityTick } from "./curiosity/tick.js";
import { openNuclearDb } from "./db.js";
import type { DecisionKind } from "./types.js";

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
  private readonly activeOwners = new Set<string>();

  constructor(db?: DatabaseSync) {
    this.db = openNuclearDb(db);
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
    try {
      const threadId = resolveActiveThread(
        this.db,
        input.ownerId,
        input.channel,
      );
      insertMessage(this.db, {
        threadId,
        ownerId: input.ownerId,
        role: "user",
        text: message,
        channel: input.channel,
      });
      const written = writeFromUserTurn(this.db, input.ownerId, message);
      if (written.forgotTopic) {
        forgetByTopic(this.db, input.ownerId, written.forgotTopic);
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
      );
      let decision = decide(motivations, "reactive");
      const recentTakes = listRecentTakes(this.db, 6);
      decision = attachAuthorizedClaims(decision, recentTakes);
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
        insertMessage(this.db, {
          threadId: turn.threadId,
          ownerId: input.ownerId,
          role: "assistant",
          text,
          channel: input.channel,
        });
        writeFromAssistantTurn(this.db, input.ownerId, text);
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
    if (getState(this.db, ownerId).availability !== "available") {
      return { shouldSend: false, reason: "unavailable" };
    }
    const motivations = collectMotivations(
      this.db,
      ownerId,
      "proactive",
    );
    let decision = decide(motivations, "proactive");
    const recentTakes = listRecentTakes(this.db, 6);
    decision = attachAuthorizedClaims(decision, recentTakes);
    if (!decision.cognitiveAllocation.shouldSpeak || decision.score < 25) {
      return { shouldSend: false, reason: decision.reason };
    }

    const decisionId = logDecision(this.db, {
      ownerId,
      channel: "proactive",
      trigger: "proactive",
      decision,
    });
    decision.id = decisionId;
    setLastDecision(this.db, ownerId, decisionId);

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
    const motivations = collectMotivations(this.db, ownerId, "proactive");
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
      insertMessage(this.db, {
        threadId,
        ownerId,
        role: "assistant",
        text,
        channel: "discord",
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
         WHERE owner_id = ? AND role = 'user'
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
  ): { preview: string[]; deleted: number } {
    const facts = listActiveFacts(this.db, ownerId, 100).filter((fact) => {
      const hay = `${fact.key} ${fact.value} ${fact.category}`.toLowerCase();
      return hay.includes(topic.trim().toLowerCase());
    });
    const preview = facts.map((fact) => `${fact.key}: ${fact.value}`);
    if (!confirmed) return { preview, deleted: 0 };
    return { preview, deleted: forgetByTopic(this.db, ownerId, topic) };
  }

  recordReaction(
    ownerId: string,
    input: { messageId: string; emoji: string },
  ): { feedback: "positive" | "negative" | "neutral"; matchedInitiative: boolean } {
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
    const matched = this.db
      .prepare(
        `UPDATE initiative_reservations
         SET reason = reason
         WHERE owner_id = ? AND discord_message_id = ?`,
      )
      .run(ownerId, input.messageId);
    return { feedback, matchedInitiative: Number(matched.changes) > 0 };
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
        depth: "excerpt";
        createdAt: string;
        ageMin: number;
      } | null;
    };
  } {
    const sources = listSources(this.db, 100).filter((s) => s.enabled);
    const takes = listRecentTakes(this.db, 12);
    const today = new Date().toISOString().slice(0, 10);
    const takesToday = takes.filter((t) => t.createdAt.startsWith(today)).length;
    const last = takes[0] ?? null;
    const ageMin = last
      ? Math.max(0, (Date.now() - Date.parse(last.createdAt)) / 60_000)
      : 0;
    const state = getState(this.db, ownerId);
    return {
      enabled: env.curiosityEnabled,
      sources: sources.length,
      sourcesEnabled: sources.length,
      itemsToday: takesToday,
      readToday: takesToday,
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
              depth: "excerpt",
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
        ok: version >= 1,
        nuclearEnabled: true,
        dbPath: NUCLEAR_DB_PATH,
        schemaVersion: version,
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
        identityEntries: 0,
        decisions: 0,
      };
    }
  }
}
