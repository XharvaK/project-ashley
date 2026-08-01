import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { completeChat, embedTexts } from "../mistral-client.js";
import { isTurnBusy } from "../turn-gate.js";
import { chunkText, float32ToBuffer } from "./embeddings.js";
import {
  FACT_MIN_CONFIDENCE,
  shouldEnqueueFacts,
  shouldEnqueueSummary,
  summaryBatchSize,
} from "./consolidator-triggers.js";
import { SummaryBatchTooSmallError } from "./consolidator-errors.js";
import { getDenylist } from "./correction-denylist.js";
import { parseJsonObject } from "./extract-json.js";
import { filterHotForRecall } from "./hot-filter.js";
import { getActiveSummary, listActiveFacts, mergeFacts } from "./facts.js";
import { getKv, setKv } from "./kv.js";
import { maybeEnqueueMicroReflection } from "./reflection.js";
import { listStances, upsertStance } from "./stances.js";
import { incrementMemoryMetric, pruneOldDoneJobs } from "./db.js";
import type { FactInput } from "./types.js";
import {
  countAssistantSinceCutoff,
  countMessagesSinceCutoff,
  getHotMessages,
  getMessagesForFacts,
  getThreadMeta,
  setFactsCutoff,
  sumTokensSinceCutoff,
} from "./threads.js";
import { estimateTokens } from "./tokens.js";

type JobType = "summary" | "facts" | "embed" | "stances";

type CoalescePayload = {
  threadId: string;
  triggerMessageId: number;
  priority?: boolean;
  afterSummary?: boolean;
  deferredTriggerMessageId?: number;
};

const CONSOLIDATION_TIMEOUT_MS = 4 * 60 * 1000;
/** Lease must outlive the job timeout so a queued limiter wait cannot double-run. */
const LEASE_MINUTES = 6;
const MAX_JOBS_PER_TICK = 5;
const FACTS_WINDOW_MAX_MESSAGES = 30;
const STANCE_WINDOW_MAX_MESSAGES = 12;

function apiSignal(): AbortSignal {
  return AbortSignal.timeout(CONSOLIDATION_TIMEOUT_MS);
}

function mergePayload(
  existing: CoalescePayload,
  triggerMessageId: number,
  extra: Record<string, unknown>,
): CoalescePayload {
  const nextTrigger = Math.max(
    existing.triggerMessageId ?? 0,
    existing.deferredTriggerMessageId ?? 0,
    triggerMessageId,
  );
  return {
    ...existing,
    ...extra,
    threadId: existing.threadId,
    triggerMessageId: nextTrigger,
    priority: Boolean(existing.priority || extra.priority),
    deferredTriggerMessageId: undefined,
  };
}

export class ConsolidationWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private ticks = 0;

  constructor(private readonly db: DatabaseSync) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 2000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  enqueue(
    ownerId: string,
    jobType: JobType,
    triggerMessageId: number,
    payload: Record<string, unknown> = {},
  ): void {
    const key = `${ownerId}:${jobType}:${triggerMessageId}`;
    const now = new Date().toISOString();
    const failed = this.db
      .prepare(
        `SELECT id FROM mem_jobs WHERE idempotency_key = ? AND status = 'failed'`,
      )
      .get(key) as { id: number } | undefined;
    if (failed) {
      this.db
        .prepare(
          `UPDATE mem_jobs SET status = 'pending', attempts = 0, last_error = NULL,
           lease_until = NULL, payload_json = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(payload), now, failed.id);
      return;
    }
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO mem_jobs (idempotency_key, owner_id, job_type, payload_json, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .run(key, ownerId, jobType, JSON.stringify(payload), now, now);
    } catch {
      /* duplicate */
    }
  }

  enqueueCoalesced(
    ownerId: string,
    jobType: "facts" | "summary" | "stances",
    threadId: string,
    triggerMessageId: number,
    extra: Record<string, unknown> = {},
  ): void {
    const key = `${ownerId}:${jobType}:${threadId}`;
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `SELECT id, status, payload_json FROM mem_jobs WHERE idempotency_key = ?`,
      )
      .get(key) as
      | { id: number; status: string; payload_json: string }
      | undefined;

    const basePayload: CoalescePayload = {
      threadId,
      triggerMessageId,
      ...extra,
    } as CoalescePayload;

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO mem_jobs (idempotency_key, owner_id, job_type, payload_json, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .run(key, ownerId, jobType, JSON.stringify(basePayload), now, now);
      return;
    }

    const current = JSON.parse(existing.payload_json) as CoalescePayload;
    const merged = mergePayload(current, triggerMessageId, extra);
    const payloadJson = JSON.stringify(merged);

    if (existing.status === "pending") {
      this.db
        .prepare(
          `UPDATE mem_jobs SET payload_json = ?, updated_at = ? WHERE id = ?`,
        )
        .run(payloadJson, now, existing.id);
      return;
    }

    if (existing.status === "running") {
      const deferred = Math.max(
        current.deferredTriggerMessageId ?? 0,
        current.triggerMessageId ?? 0,
        triggerMessageId,
      );
      const deferredPayload: CoalescePayload = {
        ...current,
        deferredTriggerMessageId: deferred,
        priority: Boolean(current.priority || extra.priority),
      };
      this.db
        .prepare(
          `UPDATE mem_jobs SET payload_json = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(deferredPayload), now, existing.id);
      return;
    }

    this.db
      .prepare(
        `UPDATE mem_jobs
         SET status = 'pending', payload_json = ?, attempts = 0, last_error = NULL,
             lease_until = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(payloadJson, now, existing.id);
  }

  enqueuePriorityFacts(
    ownerId: string,
    threadId: string,
    triggerMessageId: number,
  ): void {
    this.enqueueCoalesced(ownerId, "facts", threadId, triggerMessageId, {
      priority: true,
    });
  }

  afterMessage(
    ownerId: string,
    threadId: string,
    messageId: number,
    role: "user" | "assistant",
  ): void {
    this.enqueue(ownerId, "embed", messageId, { threadId, messageId });

    if (role !== "assistant" || !env.autoRememberEnabled) return;

    const meta = getThreadMeta(this.db, threadId);
    const cutoff = meta?.hot_cutoff_message_id ?? null;
    const assistantCount = countAssistantSinceCutoff(
      this.db,
      threadId,
      cutoff,
    );
    const count = countMessagesSinceCutoff(this.db, threadId, cutoff);
    const tokenSum = sumTokensSinceCutoff(this.db, threadId, cutoff);

    if (shouldEnqueueFacts(
      assistantCount,
      env.memoryFactEveryN,
      role,
      this.db,
      ownerId,
    )) {
      this.enqueueCoalesced(ownerId, "facts", threadId, messageId);
    }

    if (
      env.stanceLedgerEnabled &&
      assistantCount > 0 &&
      assistantCount % env.stanceEveryN === 0
    ) {
      this.enqueueCoalesced(ownerId, "stances", threadId, messageId);
    }

    // Activity-based micro reflections (~every 20 assistant turns).
    if (assistantCount > 0 && assistantCount % 20 === 0) {
      maybeEnqueueMicroReflection(this.db, ownerId, assistantCount);
    }

    if (
      shouldEnqueueSummary(
        count,
        tokenSum,
        env.memoryHotMaxMessages,
        env.memoryHotMaxTokens,
      )
    ) {
      this.enqueueCoalesced(ownerId, "summary", threadId, messageId);
    }
  }

  private recoverExpiredLeases(): number {
    const result = this.db
      .prepare(
        `UPDATE mem_jobs
         SET status = 'pending', attempts = attempts + 1, lease_until = NULL, updated_at = datetime('now')
         WHERE status = 'running'
           AND lease_until IS NOT NULL
           AND lease_until < datetime('now')`,
      )
      .run();
    return Number(result.changes);
  }

  private pickNextJob():
    | {
        id: number;
        owner_id: string;
        job_type: JobType;
        payload_json: string;
        attempts: number;
      }
    | undefined {
    return this.db
      .prepare(
        `SELECT id, owner_id, job_type, payload_json, attempts FROM mem_jobs
         WHERE status = 'pending'
         ORDER BY
           CASE job_type WHEN 'summary' THEN 0 WHEN 'facts' THEN 1 ELSE 2 END,
           CASE WHEN json_extract(payload_json, '$.priority') = 1 THEN 0 ELSE 1 END,
           created_at
         LIMIT 1`,
      )
      .get() as
      | {
          id: number;
          owner_id: string;
          job_type: JobType;
          payload_json: string;
          attempts: number;
        }
      | undefined;
  }

  private maybeReenqueueDeferred(
    ownerId: string,
    jobType: JobType,
    payload: CoalescePayload,
  ): void {
    if (
      !payload.deferredTriggerMessageId ||
      payload.deferredTriggerMessageId <= payload.triggerMessageId
    ) {
      return;
    }
    this.enqueueCoalesced(
      ownerId,
      jobType as "facts" | "summary",
      payload.threadId,
      payload.deferredTriggerMessageId,
      { priority: payload.priority },
    );
  }

  private async runJob(job: {
    id: number;
    owner_id: string;
    job_type: JobType;
    payload_json: string;
  }): Promise<CoalescePayload | null> {
    const payload = JSON.parse(job.payload_json) as CoalescePayload & {
      messageId?: number;
    };

    if (job.job_type === "embed" && payload.messageId && payload.threadId) {
      await this.runEmbed(job.owner_id, payload.threadId, payload.messageId);
      return null;
    }
    if (job.job_type === "facts" && payload.threadId) {
      await this.runFacts(
        job.owner_id,
        payload.threadId,
        payload.triggerMessageId,
      );
      return payload;
    }
    if (job.job_type === "summary" && payload.threadId) {
      await this.runSummary(
        job.owner_id,
        payload.threadId,
        payload.triggerMessageId,
      );
      return payload;
    }
    if (job.job_type === "stances" && payload.threadId) {
      await this.runStances(job.owner_id, payload.threadId);
      return null;
    }
    return null;
  }

  private async tick(): Promise<void> {
    const recovered = this.recoverExpiredLeases();
    if (recovered > 0) {
      console.warn(
        `[memory] recovered ${recovered} expired consolidation job(s)`,
      );
    }

    // Don't claim leases while a live chat turn needs the interactive lane.
    if (isTurnBusy()) return;

    if (this.running) return;
    this.running = true;

    try {
      this.ticks += 1;
      if (this.ticks % 30 === 0) {
        pruneOldDoneJobs(this.db);
      }

      for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
        const job = this.pickNextJob();
        if (!job) break;

        const now = new Date().toISOString();
        const claimed = this.db
          .prepare(
            `UPDATE mem_jobs SET status = 'running', lease_until = datetime('now', '+${LEASE_MINUTES} minutes'), updated_at = ?
             WHERE id = ? AND status = 'pending'`,
          )
          .run(now, job.id);
        if (claimed.changes === 0) continue;

        try {
          const payload = await this.runJob(job);
          this.db
            .prepare(
              `UPDATE mem_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?`,
            )
            .run(job.id);
          if (
            payload &&
            (job.job_type === "facts" || job.job_type === "summary")
          ) {
            this.maybeReenqueueDeferred(job.owner_id, job.job_type, payload);
          }
        } catch (err) {
          if (err instanceof SummaryBatchTooSmallError) {
            this.db
              .prepare(
                `UPDATE mem_jobs SET status = 'pending', lease_until = NULL, updated_at = ? WHERE id = ?`,
              )
              .run(now, job.id);
            continue;
          }
          const msg = err instanceof Error ? err.message : String(err);
          const attempts = job.attempts + 1;
          const status = attempts >= 3 ? "failed" : "pending";
          this.db
            .prepare(
              `UPDATE mem_jobs SET status = ?, attempts = ?, last_error = ?, lease_until = NULL, updated_at = ? WHERE id = ?`,
            )
            .run(status, attempts, msg, now, job.id);
          console.warn(`[memory] job ${job.job_type} failed: ${msg}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async runEmbed(
    ownerId: string,
    threadId: string,
    messageId: number,
  ): Promise<void> {
    const row = this.db
      .prepare(
        `SELECT text, channel, owner_id FROM mem_messages WHERE id = ? AND thread_id = ?`,
      )
      .get(messageId, threadId) as
      | { text: string; channel: string; owner_id: string }
      | undefined;
    if (!row || row.owner_id !== ownerId) return;

    const pieces = chunkText(row.text);
    const embeddings = await embedTexts(pieces, { signal: apiSignal() });
    const now = new Date().toISOString();

    pieces.forEach((text, i) => {
      const emb = embeddings[i];
      if (!emb) return;
      this.db
        .prepare(
          `INSERT OR IGNORE INTO mem_chunks (owner_id, thread_id, message_id, chunk_index, text, channel, embedding, created_at, token_estimate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          threadId,
          messageId,
          i,
          text,
          row.channel,
          float32ToBuffer(emb),
          now,
          estimateTokens(text),
        );
    });
  }

  private async runFacts(
    ownerId: string,
    threadId: string,
    triggerMessageId?: number,
  ): Promise<void> {
    const meta = getThreadMeta(this.db, threadId);
    const factsCutoff = meta?.facts_cutoff_message_id ?? null;

    const triggerId =
      triggerMessageId ??
      (
        this.db
          .prepare(
            `SELECT MAX(id) as id FROM mem_messages WHERE thread_id = ?`,
          )
          .get(threadId) as { id: number | null }
      ).id;

    if (!triggerId) return;

    const messages = getMessagesForFacts(
      this.db,
      threadId,
      factsCutoff,
      triggerId,
    ).slice(-FACTS_WINDOW_MAX_MESSAGES);

    if (messages.length === 0) {
      setFactsCutoff(this.db, threadId, triggerId);
      return;
    }

    const userOnly = messages.filter((m) => m.role === "user");
    const hotTurns = filterHotForRecall(
      userOnly.map((m) => ({ role: m.role, content: m.text })),
    );
    if (hotTurns.length === 0) {
      return;
    }

    const transcript = hotTurns
      .map((m) => `user: ${m.content}`)
      .join("\n");

    const existingFacts = listActiveFacts(this.db, ownerId, 20, false);
    const existingBlock = existingFacts.length
      ? existingFacts.map((f) => `- ${f.category}/${f.key}: ${f.value}`).join("\n")
      : "(none)";

    const denylist = getDenylist(this.db, ownerId);
    const denyBlock =
      denylist.length > 0
        ? `Never extract facts about: ${denylist.join(", ")}.`
        : "";

    const { text } = await completeChat(
      [
        {
          role: "system",
          content: `Extract durable personal facts about Doc from USER messages. Output JSON only.
Schema: { "facts": [{ "category": "project|preference|person|ongoing|identity|event|pattern", "key": "snake_case", "value": "short phrase", "confidence": 0-1, "sensitivity": "none|pharma|health|private", "valid_until": null|string, "supersedes_key": null|string }], "no_change": false }
Rules:
- USER statements only; never infer from assistant text
- Extract WHO HE IS, WHAT HE LIKES, WHAT HE DOES, WHO HE KNOWS — not what he asked or denied in conversation
- BAD examples (never extract these): "user_asked_about_feelings", "user_denied_having_said_that", "user_requested_elaboration", "user_asked_if_can_read_now"
- GOOD examples: "drinks_mineral_water" -> "prefers mineral water over plain", "plays_fortnite_zero_build" -> "plays Fortnite in zero-building mode", "lives_in_izmir" -> "lives in Izmir, Turkey"
- A fact is something you could tell a new person about Doc. "He asked me a question" is not a fact about him.
- Do not use category "pinned" (reserved for manual pin)
- Categories: identity (who he is), preference, project (with status when clear), person, event (dated happenings), pattern (behavioral), ongoing (temporary state)
- max 5 facts; mood → ongoing with valid_until
- Prefer supersedes_key / same key over near-duplicate new keys
- confidence >= ${FACT_MIN_CONFIDENCE} for durable facts
- if nothing new return { "facts": [], "no_change": true }
${denyBlock}
EXISTING_FACTS:
${existingBlock}`,
        },
        { role: "user", content: transcript },
      ],
      {
        maxTokens: 800,
        temperature: 0.1,
        reasoningEffort: "medium",
        signal: apiSignal(),
      },
    );

    let parsed: { facts?: FactInput[]; no_change?: boolean };
    try {
      parsed = parseJsonObject(text);
    } catch {
      incrementMemoryMetric(this.db, "facts_parse_errors");
      throw new Error(`fact extraction JSON parse failed: ${text.slice(0, 120)}`);
    }

    let merged = 0;
    if (!parsed.no_change && parsed.facts?.length) {
      const durable = parsed.facts.filter(
        (f) =>
          f.category !== "pinned" &&
          (f.confidence ?? 0) >= FACT_MIN_CONFIDENCE,
      );
      merged = mergeFacts(this.db, ownerId, durable, triggerId);
      incrementMemoryMetric(this.db, "facts_extracted", parsed.facts.length);
      incrementMemoryMetric(this.db, "facts_merged", merged);
      console.info(
        `[memory] facts job: extracted=${parsed.facts.length} merged=${merged} no_change=${Boolean(parsed.no_change)}`,
      );
    } else {
      incrementMemoryMetric(this.db, "facts_no_change");
      console.info(`[memory] facts job: no_change=${Boolean(parsed.no_change)}`);
    }

    if (parsed.no_change || merged > 0) {
      setFactsCutoff(this.db, threadId, triggerId);
    }
  }

  /**
   * Harvest the positions she actually took, from her own messages only.
   * Doc's opinions are not her stances, and inferring them would give her
   * something to "defend" that she never said.
   */
  private async runStances(ownerId: string, threadId: string): Promise<void> {
    const cutoffKey = `stance_cutoff:${threadId}`;
    const cutoff = Number(getKv(this.db, cutoffKey) ?? 0);
    const rows = this.db
      .prepare(
        `SELECT id, text FROM mem_messages
         WHERE thread_id = ? AND role = 'assistant' AND id > ?
         ORDER BY id ASC LIMIT ?`,
      )
      .all(threadId, cutoff, STANCE_WINDOW_MAX_MESSAGES) as Array<{
      id: number;
      text: string;
    }>;

    if (rows.length === 0) return;

    const lastId = rows[rows.length - 1]!.id;
    const transcript = rows.map((r) => `- ${r.text}`).join("\n");
    const existing = listStances(this.db, ownerId, 20);
    const existingBlock = existing.length
      ? existing.map((s) => `- ${s.topic}: ${s.stance}`).join("\n")
      : "(none)";

    const { text } = await completeChat(
      [
        {
          role: "system",
          content: `Extract opinions ASHLEY (the assistant) asserted as her own in these messages. Output JSON only.
Schema: { "stances": [{ "topic": "short slug", "stance": "one clause, first person, max 18 words", "confidence": 0-1 }] }
Rules:
- only positions ASHLEY took — not Doc's views, not facts about the world, not paraphrases of what Doc said
- the stance must be something ASHLEY would defend if challenged
- BAD: "I use a keyboard" (Ashley doesn't use a keyboard), "I run on Linux" (too literal about infrastructure)
- GOOD: "I think SSDs fail more dangerously than HDDs because they're silent", "ORMs are inertia, not a real argument"
- topic is a lowercase noun phrase, 1-3 words, stable across rephrasings
- skip hedged or throwaway remarks; a stance is something worth defending later
- max 4 stances; if none, return { "stances": [] }
EXISTING_STANCES (reuse the same topic slug when it is the same subject):
${existingBlock}`,
        },
        { role: "user", content: transcript },
      ],
      {
        maxTokens: 500,
        temperature: 0.1,
        reasoningEffort: "medium",
        signal: apiSignal(),
      },
    );

    let parsed: { stances?: Array<{ topic?: string; stance?: string; confidence?: number }> };
    try {
      parsed = parseJsonObject(text);
    } catch {
      incrementMemoryMetric(this.db, "stances_parse_errors");
      setKv(this.db, cutoffKey, String(lastId));
      return;
    }

    let stored = 0;
    for (const s of parsed.stances ?? []) {
      if (!s.topic?.trim() || !s.stance?.trim()) continue;
      upsertStance(
        this.db,
        ownerId,
        { topic: s.topic, stance: s.stance, confidence: s.confidence },
        lastId,
      );
      stored += 1;
    }
    incrementMemoryMetric(this.db, "stances_stored", stored);
    setKv(this.db, cutoffKey, String(lastId));
  }

  private async runSummary(
    ownerId: string,
    threadId: string,
    _triggerMessageId?: number,
  ): Promise<void> {
    const meta = getThreadMeta(this.db, threadId);
    const cutoff = meta?.hot_cutoff_message_id ?? 0;
    const batchSize = summaryBatchSize(
      countMessagesSinceCutoff(this.db, threadId, cutoff),
      env.memorySummaryBatch,
      env.memorySummaryResidualFloor,
    );

    if (batchSize < 5) {
      throw new SummaryBatchTooSmallError();
    }

    const fullBatch = getHotMessages(
      this.db,
      threadId,
      batchSize + 100,
      cutoff,
    ).slice(0, batchSize);

    if (fullBatch.length < 5) {
      throw new SummaryBatchTooSmallError();
    }

    const userBatch = fullBatch.filter((m) => m.role === "user");
    if (userBatch.length === 0) {
      throw new SummaryBatchTooSmallError();
    }

    const denylist = getDenylist(this.db, ownerId);
    const denyNote =
      denylist.length > 0
        ? `Do not mention: ${denylist.join(", ")}.`
        : "";

    const current = getActiveSummary(this.db, threadId) ?? "";
    const toMerge = userBatch.map((m) => `[user]: ${m.text}`).join("\n");

    const { text } = await completeChat(
      [
        {
          role: "system",
          content: `Merge CURRENT_SUMMARY and USER_MESSAGES into ONE paragraph (max 120 words), present-oriented, third person about Doc. USER messages only — no assistant claims. No invented events. Plain text only. ${denyNote}`,
        },
        {
          role: "user",
          content: `CURRENT_SUMMARY:\n${current}\n\nUSER_MESSAGES:\n${toMerge}`,
        },
      ],
      {
        maxTokens: 300,
        temperature: 0.1,
        reasoningEffort: "low",
        signal: apiSignal(),
      },
    );

    const lastId = fullBatch[fullBatch.length - 1]!.id;
    const now = new Date().toISOString();

    this.db
      .prepare(`UPDATE mem_summaries SET is_active = 0 WHERE thread_id = ?`)
      .run(threadId);
    this.db
      .prepare(
        `INSERT INTO mem_summaries (thread_id, text, covers_until_message_id, is_active, created_at)
         VALUES (?, ?, ?, 1, ?)`,
      )
      .run(threadId, text.trim(), lastId, now);
    this.db
      .prepare(`UPDATE mem_threads SET hot_cutoff_message_id = ? WHERE id = ?`)
      .run(lastId, threadId);

    this.enqueueCoalesced(ownerId, "facts", threadId, lastId, {
      priority: true,
      afterSummary: true,
    });
  }
}
