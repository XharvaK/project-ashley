import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { embedTexts } from "../mistral-client.js";
import {
  getActiveSummary,
  listActiveFacts,
  touchFactAccess,
} from "./facts.js";
import { buildReflectionBlock } from "./reflection.js";
import { buildEmotionalArcBlock } from "./emotional-arc.js";
import { buildCorrectionGuard } from "./correction-guard.js";
import { getOwnerDenylist } from "./memory-veto.js";
import {
  filterFactsByDenylist,
  filterTextByDenylist,
} from "./memory-veto.js";
import {
  filterHotForRecall,
  truncateHotForStrictRecall,
} from "./hot-filter.js";
import {
  classifyQuery,
  isBroadDomainAsk,
  isRecallQuery,
  type QueryMode,
} from "./recall.js";
import { isActivityAsk } from "../curiosity/activity-ask.js";
import { reentryLine } from "./reentry.js";
import { takeReactionLine } from "../signals.js";
import { paraphraseSnippet, retrieveChunks } from "./retrieval.js";
import {
  buildStanceBlock,
  listStances,
  selectRelevantStances,
  selectRelevantStancesEmbedding,
} from "./stances.js";
import { buildMoodBlock } from "./mood.js";
import { buildInterruptedNote } from "./conversation-state.js";
import { buildTasteLedgerBlock } from "./taste-drift.js";
import {
  buildTimeSignal,
  detectTempo,
  tempoInstructions,
} from "./tempo.js";
import {
  getHotMessages,
  getThreadMeta,
  resolveActiveThread,
} from "./threads.js";
import type { AssembledContext, ChatChannel } from "./types.js";
import { trimToTokenBudget } from "./tokens.js";
import type { HotTurn } from "./hot-filter.js";

const PHARMA_KEYWORDS =
  /pharma|psychedel|5-ht|dose|harm reduction|substance|mdma|lsd|psilocybin|ketamin/i;

function shouldInjectSensitivity(
  sensitivity: string,
  userMessage: string,
  queryMode: QueryMode,
): boolean {
  if (queryMode === "recall") {
    return sensitivity !== "private";
  }
  if (sensitivity === "none") return true;
  if (sensitivity === "private") return false;
  if (sensitivity === "pharma" || sensitivity === "health") {
    return PHARMA_KEYWORDS.test(userMessage);
  }
  return false;
}

/**
 * Delivery caps for memory questions. These used to sit in the channel prompt
 * files, where they applied on every turn and answered "lol" under memory-exam
 * pressure. They belong here, on the turns that actually asked.
 */
function buildRecallDelivery(
  queryMode: QueryMode,
  storeIsEmpty: boolean,
  repeatRecall: boolean,
): string | null {
  if (queryMode === "soft_recall") {
    return "Doc is asking about something you two already talked about. Answer him normally, from what is above and from this thread. If it is not there, say that plainly instead of reconstructing something plausible.";
  }
  if (queryMode !== "recall") return null;

  const lines = [
    "Doc is asking what you have stored. Two sentences at most, no lists, no roleplay, no persona tour.",
    storeIsEmpty
      ? "Nothing is stored long term. Say so plainly and word it differently than last time."
      : "You may name what is stored, briefly, and nothing beyond it.",
    "At most one topic from recent messages, as a short phrase rather than a list.",
  ];
  if (repeatRecall) {
    lines.push(
      "You already answered this in this thread. Same honest meaning, different words.",
    );
  }
  return lines.join("\n");
}

function countPriorRecallAsks(
  db: DatabaseSync,
  threadId: string,
): number {
  const rows = db
    .prepare(
      `SELECT text FROM mem_messages
       WHERE thread_id = ? AND role = 'user'
       ORDER BY id ASC`,
    )
    .all(threadId) as Array<{ text: string }>;
  return rows.filter((r) => isRecallQuery(r.text)).length;
}

function buildMemoryBlock(
  facts: ReturnType<typeof listActiveFacts>,
  narrative: string | null,
  snippets: {text: string, role?: string | null}[],
  channelHint: string | null,
  userMessage: string,
  queryMode: QueryMode,
  correctionGuard: string | null,
  repeatRecall: boolean,
  stanceBlock: string | null,
  liveSignals: string[] = [],
  moodBlock: string | null = null,
  reflectionBlock: string | null = null,
  emotionalArcBlock: string | null = null,
  tasteLedger: string | null = null,
): string {
  const factLines = facts
    .filter((f) =>
      shouldInjectSensitivity(f.sensitivity, userMessage, queryMode),
    )
    .map((f) => `- [${f.category}/${f.key}] ${f.value}`)
    .slice(0, 40);

  const narrativeParts: string[] = [];
  if (channelHint) narrativeParts.push(channelHint);
  if (narrative?.trim()) narrativeParts.push(narrative.trim());

  // Keep section labels; leave empty tiers blank so she is not handed a
  // quotable "nothing stored" sentence to parrot.
  const parts: string[] = ["What you actually have on Doc:", "", "## Standing facts"];
  if (factLines.length > 0) parts.push(...factLines);

  parts.push("", "## Where things left off");
  if (narrativeParts.length > 0) parts.push(narrativeParts.join(" "));

  parts.push("", "## May be relevant now");
  if (snippets.length > 0 && queryMode === "normal") {
    parts.push(
      "(possible echoes — only if clearly relevant to what he just said)",
      ...snippets.map((s) => paraphraseSnippet(s.text, s.role)),
    );
  } else if (queryMode !== "normal") {
    parts.push("(suppressed for a memory question)");
  }

  if (reflectionBlock) {
    parts.push("", reflectionBlock);
  }

  if (emotionalArcBlock) {
    parts.push("", emotionalArcBlock);
  }

  parts.push(
    "",
    "Trust order: standing facts, reflection notes, then where things left off, then this thread's messages. Echoes are hints, never facts. A blank section means you have nothing there, not that you should reconstruct it.",
  );

  const storeIsEmpty = factLines.length === 0 && narrativeParts.length === 0;
  const recallDelivery = buildRecallDelivery(
    queryMode,
    storeIsEmpty,
    repeatRecall,
  );
  if (recallDelivery) {
    parts.push("", recallDelivery);
  }

  if (queryMode === "normal" && isBroadDomainAsk(userMessage)) {
    parts.push(
      "",
      "He asked an open question about a topic, not for a briefing. Two short paragraphs at most, the two or three things that actually matter, no headed sections and no appendix of numbers. Do not close with an offer to explain more; if there is more, one clause is enough.",
    );
  }

  if (liveSignals.length > 0) {
    parts.push("", "## Right now", ...liveSignals);
  }

  if (stanceBlock) {
    parts.push("", stanceBlock);
  }

  if (tasteLedger) {
    parts.push("", tasteLedger);
  }

  if (moodBlock) {
    parts.push("", moodBlock);
  }

  if (correctionGuard) {
    parts.push("", correctionGuard);
  }

  return parts.join("\n");
}

function applyHotTokenBudget(hot: HotTurn[], maxTokens: number): HotTurn[] {
  if (hot.length === 0) return hot;
  const texts = hot.map((m) => m.content);
  const trimmed = trimToTokenBudget(texts, maxTokens);
  const drop = hot.length - trimmed.length;
  return hot.slice(drop);
}

function assembledSeed(ownerId: string, threadId: string): string {
  return `${ownerId}:${threadId}:${new Date().toISOString().slice(0, 13)}`;
}

export class MemoryAssembler {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * `excludeMessageId` is the row the caller just inserted for `userMessage`.
   * Hot history is read after that insert, so without this the model sees the
   * current turn twice: once in history and once as the trailing user message.
   */
  async build(
    ownerId: string,
    channel: ChatChannel,
    userMessage: string,
    threadId?: string,
    excludeMessageId?: number | null,
  ): Promise<AssembledContext> {
    const queryMode: QueryMode = classifyQuery(userMessage);
    const tid = threadId ?? resolveActiveThread(this.db, ownerId, channel);
    const meta = getThreadMeta(this.db, tid);
    const hotLimit =
      channel === "voice"
        ? env.memoryVoiceHotMessages
        : env.memoryHotMaxMessages;

    const denylist = getOwnerDenylist(this.db, ownerId);
    const facts = filterFactsByDenylist(
      listActiveFacts(this.db, ownerId),
      denylist,
    );
    const narrative = filterTextByDenylist(
      getActiveSummary(this.db, tid),
      denylist,
    );

    let snippets: {text: string, role?: string | null}[] = [];
    let queryEmbedding: Float32Array | undefined;
    if (queryMode === "normal") {
      try {
        const [queryEmb] = await embedTexts([
          userMessage.slice(0, 2000),
        ]);
        if (queryEmb) {
          queryEmbedding = queryEmb;
          const chunks = retrieveChunks(
            this.db,
            ownerId,
            queryEmb,
            channel,
            env.memoryRetrievalTopK,
            env.memoryRetrievalMinScore,
            denylist,
          );
          snippets = chunks.map((c) => ({ text: c.text, role: c.role }));
        }
      } catch (err) {
        console.warn("[memory] retrieval embed failed:", err);
      }
    }

    let channelHint: string | null = null;
    if (
      meta?.last_active_channel &&
      meta.last_active_channel !== channel &&
      meta.last_active_at
    ) {
      const mins =
        (Date.now() - new Date(meta.last_active_at).getTime()) / 60000;
      if (mins < 30) {
        channelHint = `Doc was just chatting on ${meta.last_active_channel}, so continue rather than restart.`;
      }
    }

    const visibleFacts = facts.filter((f) =>
      shouldInjectSensitivity(f.sensitivity, userMessage, queryMode),
    );
    const strictEmptyRecall =
      queryMode === "recall" &&
      visibleFacts.length === 0 &&
      !narrative?.trim();
    const repeatRecall =
      queryMode === "recall" && countPriorRecallAsks(this.db, tid) >= 1;

    const correctionGuard = buildCorrectionGuard(this.db, tid);

    // Not in a recall answer: a memory audit is about what he told her, and her
    // own opinions have no business in that list.
    let stanceBlock: string | null = null;
    if (env.stanceLedgerEnabled && queryMode !== "recall") {
      const allStances = listStances(this.db, ownerId);
      const relevant = queryEmbedding
        ? await selectRelevantStancesEmbedding(
            this.db,
            allStances,
            queryEmbedding,
            userMessage,
          )
        : selectRelevantStances(allStances, userMessage);
      stanceBlock = buildStanceBlock(relevant, this.db, ownerId);
    }

    const moodBlock =
      queryMode !== "recall" ? buildMoodBlock(this.db, ownerId) : null;

    const reflectionBlock =
      queryMode !== "recall"
        ? buildReflectionBlock(this.db, ownerId)
        : null;

    const emotionalArcBlock =
      queryMode !== "recall"
        ? buildEmotionalArcBlock(this.db, ownerId)
        : null;

    const tasteLedger =
      queryMode !== "recall" ? buildTasteLedgerBlock(this.db) : null;

    const liveSignals: string[] = [];
    const gapLine = reentryLine(this.db, ownerId, excludeMessageId, {
      allowActivityRecap: isActivityAsk(userMessage),
    });
    if (gapLine) liveSignals.push(gapLine);
    const reactionLine = takeReactionLine(this.db);
    if (reactionLine) liveSignals.push(reactionLine);
    if (queryMode !== "recall") {
      const interrupted = buildInterruptedNote(this.db, ownerId);
      if (interrupted) liveSignals.push(interrupted);
      const tempo = detectTempo(this.db, ownerId);
      const tempoNote = tempoInstructions(tempo, assembledSeed(ownerId, tid));
      if (tempoNote) liveSignals.push(tempoNote);
      // Clock only where it can matter. Every-turn injection is what primed
      // hollow status echoes the last time a block was always on.
      if (gapLine || tempo === "returning") {
        liveSignals.push(buildTimeSignal());
      }
    }

    touchFactAccess(
      this.db,
      visibleFacts.map((f) => f.id),
    );

    const memoryBlock = buildMemoryBlock(
      facts,
      narrative,
      snippets,
      channelHint,
      userMessage,
      queryMode,
      correctionGuard,
      repeatRecall,
      stanceBlock,
      liveSignals,
      moodBlock,
      reflectionBlock,
      emotionalArcBlock,
      tasteLedger,
    );

    const hot = getHotMessages(
      this.db,
      tid,
      hotLimit,
      meta?.hot_cutoff_message_id ?? null,
      excludeMessageId,
    );

    let hotMessages = hot.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.text,
    }));
    if (queryMode === "recall") {
      hotMessages = filterHotForRecall(hotMessages);
      if (strictEmptyRecall) {
        hotMessages = [];
      } else {
        hotMessages = truncateHotForStrictRecall(hotMessages);
      }
    }
    hotMessages = applyHotTokenBudget(hotMessages, env.memoryHotMaxTokens);

    return {
      memoryBlock,
      hotMessages,
      threadId: tid,
      queryMode,
      repeatRecall,
      queryEmbedding,
    };
  }

  async buildForInitiative(
    ownerId: string,
    channel: ChatChannel = "discord",
    threadId?: string,
  ): Promise<AssembledContext> {
    const tid = threadId ?? resolveActiveThread(this.db, ownerId, channel);
    const meta = getThreadMeta(this.db, tid);
    const denylist = getOwnerDenylist(this.db, ownerId);
    const facts = filterFactsByDenylist(
      listActiveFacts(this.db, ownerId),
      denylist,
    );
    const narrative = filterTextByDenylist(
      getActiveSummary(this.db, tid),
      denylist,
    );
    const correctionGuard = buildCorrectionGuard(this.db, tid);

    const memoryBlock = buildMemoryBlock(
      facts,
      narrative,
      [],
      null,
      "proactive outreach",
      "normal",
      correctionGuard,
      false,
      env.stanceLedgerEnabled
        ? buildStanceBlock(listStances(this.db, ownerId, 3), this.db, ownerId)
        : null,
      [],
      buildMoodBlock(this.db, ownerId),
      buildReflectionBlock(this.db, ownerId),
      buildEmotionalArcBlock(this.db, ownerId),
      buildTasteLedgerBlock(this.db),
    );

    const hot = getHotMessages(
      this.db,
      tid,
      env.memoryHotMaxMessages,
      meta?.hot_cutoff_message_id ?? null,
    );

    return {
      memoryBlock,
      hotMessages: applyHotTokenBudget(
        hot.map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
        env.memoryHotMaxTokens,
      ),
      threadId: tid,
      queryMode: "normal",
      repeatRecall: false,
    };
  }

  async getDebugContext(
    ownerId: string,
    userMessage?: string,
    channel: ChatChannel = "discord",
  ): Promise<object> {
    const facts = listActiveFacts(this.db, ownerId, 100, true);
    if (!userMessage?.trim()) {
      return { facts, ownerId };
    }
    const assembled = await this.build(ownerId, channel, userMessage);
    return {
      facts,
      ownerId,
      queryMode: assembled.queryMode,
      memoryBlockPreview: assembled.memoryBlock.slice(0, 2000),
      hotMessageCount: assembled.hotMessages.length,
    };
  }
}
