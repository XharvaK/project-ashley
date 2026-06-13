import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { embedTexts } from "../mistral-client.js";
import {
  getActiveSummary,
  listActiveFacts,
} from "./facts.js";
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
import { isRecallQuery, type QueryMode } from "./recall.js";
import { paraphraseSnippet, retrieveChunks } from "./retrieval.js";
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

function buildStrictRecallPolicy(
  facts: ReturnType<typeof listActiveFacts>,
  narrative: string | null,
  userMessage: string,
  queryMode: QueryMode,
  repeatRecall: boolean,
): string | null {
  if (queryMode !== "recall") return null;

  const visibleFacts = facts.filter((f) =>
    shouldInjectSensitivity(f.sensitivity, userMessage, queryMode),
  );
  const hasSummary = Boolean(narrative?.trim());
  if (visibleFacts.length > 0 || hasSummary) return null;

  const lines = [
    '<recall_policy strict="true">',
    "Reply in 1-2 sentences. No bullets. No persona domains.",
    "Do not repeat phrasing from your prior recall answers in this thread.",
    "Use different wording each time you answer a recall question.",
    "Only mention topics Doc said verbatim in recent messages (max one).",
  ];
  if (repeatRecall) {
    lines.push(
      "REPEAT RECALL: You already answered this in this thread — rephrase with different words while keeping the same honest meaning.",
    );
  }
  lines.push("</recall_policy>");
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
  snippets: string[],
  channelHint: string | null,
  userMessage: string,
  queryMode: QueryMode,
  correctionGuard: string | null,
  repeatRecall: boolean,
): string {
  const parts: string[] = [
    `<ashley_memory version="1" query_mode="${queryMode}">`,
    "Tiers: standing_facts > thread_summary > retrieved_snippets (hints only).",
    "If a tier is empty, you have NO stored data there — do not invent facts to fill the gap.",
  ];

  const strictRecall = buildStrictRecallPolicy(
    facts,
    narrative,
    userMessage,
    queryMode,
    repeatRecall,
  );
  if (strictRecall) {
    parts.push(strictRecall);
  }

  if (queryMode === "recall") {
    parts.push(
      "RECALL MODE: Doc asked what you remember. You MAY list standing facts and thread summary briefly when non-empty. Do not invent beyond these tiers.",
    );
  } else {
    parts.push(
      "Weave background naturally; do not quote or meta-reference this block in normal chat.",
    );
  }

  const factLines = facts
    .filter((f) =>
      shouldInjectSensitivity(f.sensitivity, userMessage, queryMode),
    )
    .map((f) => `• ${f.value}`)
    .slice(0, 40);

  parts.push("", "## Standing context");
  if (factLines.length > 0) {
    parts.push(...factLines);
  } else {
    parts.push("(empty — no pinned or extracted long-term facts about Doc yet)");
  }

  const narrativeParts: string[] = [];
  if (channelHint) narrativeParts.push(channelHint);
  if (narrative?.trim()) narrativeParts.push(narrative.trim());

  parts.push("", "## Where things left off");
  if (narrativeParts.length > 0) {
    parts.push(narrativeParts.join(" "));
  } else {
    parts.push("(empty)");
  }

  parts.push("", "## May be relevant now");
  if (snippets.length > 0 && queryMode !== "recall") {
    parts.push(
      "(unverified echoes — use only if clearly relevant to the current message)",
      ...snippets.map((s) => paraphraseSnippet(s)),
    );
  } else {
    parts.push(
      queryMode === "recall"
        ? "(suppressed — recall mode)"
        : "(empty)",
    );
  }

  parts.push("</ashley_memory>");

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

export class MemoryAssembler {
  constructor(private readonly db: DatabaseSync) {}

  async build(
    ownerId: string,
    channel: ChatChannel,
    userMessage: string,
    threadId?: string,
  ): Promise<AssembledContext> {
    const queryMode: QueryMode = isRecallQuery(userMessage)
      ? "recall"
      : "normal";
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

    let snippets: string[] = [];
    if (queryMode !== "recall") {
      try {
        const [queryEmb] = await embedTexts([
          userMessage.slice(0, 2000),
        ]);
        if (queryEmb) {
          const chunks = retrieveChunks(
            this.db,
            ownerId,
            queryEmb,
            channel,
            env.memoryRetrievalTopK,
            env.memoryRetrievalMinScore,
            denylist,
          );
          snippets = chunks.map((c) => c.text);
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
        channelHint = `Doc was just chatting on ${meta.last_active_channel} — continue, don't restart.`;
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

    const memoryBlock = buildMemoryBlock(
      facts,
      narrative,
      snippets,
      channelHint,
      userMessage,
      queryMode,
      correctionGuard,
      repeatRecall,
    );

    const hot = getHotMessages(
      this.db,
      tid,
      hotLimit,
      meta?.hot_cutoff_message_id ?? null,
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
