import type { DatabaseSync } from "node:sqlite";
import { AppError } from "./errors.js";
import { env } from "./env.js";
import { buildChatMessages } from "./chat-messages.js";
import { streamChat } from "./mistral-client.js";
import {
  classifyReasoningEffort,
  selectTemperature,
} from "./reasoning-effort.js";
import { sanitizeTypography } from "./typography.js";
import { recordReaction } from "./signals.js";
import {
  buildVoiceBlock,
  looksLikeParrot,
  selectVoiceExamples,
  type VoiceExample,
} from "./voice-bank.js";
import {
  appendMemoryBlock,
  buildDiscordPresenceNote,
  loadSystemPrompt,
} from "./prompts.js";
import {
  PREMISE_GUARD,
  acceptedUncheckedPremise,
  checkPremiseLLM,
  isPremiseCheck,
  premiseGuardWithCorrection,
} from "./premise-guard.js";
import { NO_ECHO_GUARD, isEchoOfUser } from "./echo-guard.js";
import {
  assembleCuriosity,
  commitCuriosity,
  type CuriosityInjection,
} from "./curiosity/inject.js";
import {
  detectConversationState,
  recordConversationState,
} from "./memory/conversation-state.js";
import { maybeCaptureExample } from "./voice-bank-capture.js";
import {
  activityAskKind,
  asksInterests,
  isActivityAsk,
  isPresenceAsk,
} from "./curiosity/activity-ask.js";
import {
  buildCapabilityBlock,
  isBrowsePermission,
} from "./curiosity/browse-permission.js";
import {
  CAPABILITY_GUARD,
  LINK_FAILED_CAPABILITY_GUARD,
  NO_ACTIVITY_GUARD,
  applyCapabilityHardFloor,
  claimsOwnActivity,
  deniesOwnCapability,
  isBrowseCapabilityChallenge,
} from "./curiosity/claim-gate.js";
import {
  extractImmediateHttpsUrl,
  linkReadPreflight,
  maybeReadLink,
} from "./curiosity/link-read.js";
import { NO_LOOKUP_GUARD, shouldLookupAsideUrl } from "./curiosity/lookup.js";
import { buildSearchContext, canSpendTavily, searchWeb } from "./curiosity/search.js";
import { hasReadActivity } from "./curiosity/store.js";
import {
  commitSharpArmed,
  decideSharpMode,
  readSharpLastAt,
  sharpLicenseNote,
} from "./sharp-mode.js";
import { MemoryAssembler } from "./memory/assembler.js";
import { classifyQuery } from "./memory/recall.js";
import { ConsolidationWorker } from "./memory/consolidator.js";
import { getMemoryDb, getMemoryHealth } from "./memory/db.js";
import { applyAutoRemember } from "./memory/auto-remember.js";
import {
  extractCorrectedFact,
  handleForgetRequest,
  syncDenylistFromThread,
} from "./memory/correction-denylist.js";
import { forgetByTopic, getActiveSummary, listActiveFacts, pinFact } from "./memory/facts.js";
import { archiveAndNewThread, insertMessage, resolveActiveThread } from "./memory/threads.js";
import { stripMediaMarkers } from "./memory/strip-markers.js";
import { estimateTokens } from "./memory/tokens.js";
import { NO_REPEAT_GUARD, looksLikeRepeat, collapseWithinTurnRepeat } from "./repetition-guard.js";
import { setTurnBusy } from "./turn-gate.js";
import { detectMoodFromText, recordMood } from "./memory/mood.js";
import { evaluateInitiative, type EvaluateResult } from "./initiative/evaluator.js";
import type { CandidateKind } from "./initiative/queue.js";
import {
  closeMismatchedOpenThreads,
  closeThreadsTouchedBy,
  lastAssistantText,
  noteOpenThreads,
  noteUnansweredQuestion,
} from "./initiative/open-threads.js";
import {
  draftInitiativeMessage,
  commitInitiativeMessage,
  releaseReservation,
  reserveInitiative,
  type InitiativeDraft,
} from "./initiative/generator.js";
import {
  getInitiativeStatus,
} from "./initiative/cooldown.js";
import {
  isProactivePausedDb,
  releaseInitiativeLease,
  setProactivePausedDb,
  tryAcquireInitiativeLease,
} from "./initiative/lease.js";
import { noteUserSleepState } from "./initiative/sleep.js";
import type { ChatChannel } from "./memory/types.js";

export type DiscordPresence = {
  status: "online" | "idle";
  label: string;
};

export type ChatRequest = {
  message: string;
  channel: ChatChannel;
  ownerId: string;
  threadId?: string;
  auditSessionId?: string | null;
  imageUrls?: string[];
  /** Discord bot's last applied custom status; omitted on telegram/voice. */
  discordPresence?: DiscordPresence;
};

const NUDGE_KINDS = new Set<CandidateKind>([
  "she_owes",
  "he_never_answered",
]);

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      text: string;
      model: string;
      threadId: string;
    }
  | { type: "error"; code: string; message: string };

export class ChatService {
  private readonly db: DatabaseSync;
  private readonly assembler: MemoryAssembler;
  readonly consolidator: ConsolidationWorker;
  private activeOwner: string | null = null;
  private abortController: AbortController | null = null;

  constructor(db?: DatabaseSync) {
    this.db = getMemoryDb(db);
    this.assembler = new MemoryAssembler(this.db);
    this.consolidator = new ConsolidationWorker(this.db);
    this.consolidator.start();
  }

  isBusy(ownerId: string): boolean {
    return this.activeOwner === ownerId;
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.activeOwner = null;
    setTurnBusy(false);
  }

  /**
   * The bot asks this before the turn so it can say "hang on, looking" while the
   * search / page read and the generation are still running. Pure predicates
   * plus budget counts, no network.
   */
  lookupPreflight(message: string): boolean {
    const queryMode = classifyQuery(message);
    if (linkReadPreflight(message, queryMode)) return true;
    const decision = extractImmediateHttpsUrl(message);
    const stripUrl =
      decision.kind === "immediate" || decision.kind === "mention"
        ? decision.url
        : null;
    return this.lookupAllowed(message, queryMode, stripUrl);
  }

  private lookupAllowed(
    message: string,
    queryMode: string,
    stripUrl: string | null = null,
  ): boolean {
    if (!env.curiosityLookupEnabled || !env.tavilyApiKey) return false;
    if (queryMode !== "normal") return false;
    if (!shouldLookupAsideUrl(message, stripUrl)) return false;
    return canSpendTavily(this.db);
  }

  /**
   * A search credit is only spent when he asked her to look or the question is
   * about something current. Recall turns never search: those are about him.
   * A supplied URL is stripped so we never spend a credit searching the link.
   */
  private async maybeLookUp(
    message: string,
    queryMode: string,
    stripUrl: string | null = null,
  ): Promise<string | null> {
    if (!this.lookupAllowed(message, queryMode, stripUrl)) return null;
    const query = shouldLookupAsideUrl(message, stripUrl);
    if (!query) return null;
    const hits = await searchWeb(this.db, query);
    return buildSearchContext(query, hits);
  }

  async *stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    if (!env.mistralApiKey) {
      yield {
        type: "error",
        code: "agent_not_ready",
        message: "Mistral API key not configured",
      };
      return;
    }

    if (this.activeOwner === request.ownerId) {
      yield {
        type: "error",
        code: "chat_in_progress",
        message: "Chat already in progress",
      };
      return;
    }

    this.activeOwner = request.ownerId;
    this.abortController = new AbortController();
    setTurnBusy(true);

    try {
      const threadId =
        request.threadId ??
        resolveActiveThread(this.db, request.ownerId, request.channel);

      const herLast = lastAssistantText(this.db, request.ownerId);

      const userMsgId = insertMessage(this.db, {
        threadId,
        ownerId: request.ownerId,
        role: "user",
        text: request.message,
        channel: request.channel,
        tokenEstimate: estimateTokens(request.message),
        auditSessionId: request.auditSessionId,
      });

      // Anything he comes back to stops being unfinished; what he anchors to a
      // time, or leaves hanging, becomes material for a follow-up later.
      noteUserSleepState(this.db, request.ownerId, request.message);
      closeThreadsTouchedBy(this.db, request.ownerId, request.message);
      closeMismatchedOpenThreads(this.db, request.ownerId, request.message);
      noteUnansweredQuestion(this.db, request.ownerId, herLast, request.message);
      noteOpenThreads(this.db, request.ownerId, {
        role: "user",
        text: request.message,
        messageId: userMsgId,
      });

      handleForgetRequest(this.db, request.ownerId, request.message);
      syncDenylistFromThread(this.db, request.ownerId, threadId);
      void extractCorrectedFact(
        this.db,
        request.ownerId,
        request.message,
        threadId,
      ).catch((err) =>
        console.warn("[memory] correction extract failed:", err),
      );

      applyAutoRemember(
        this.db,
        request.ownerId,
        threadId,
        userMsgId,
        request.message,
        this.consolidator,
      );

      this.consolidator.afterMessage(
        request.ownerId,
        threadId,
        userMsgId,
        "user",
      );

      const assembled = await this.assembler.build(
        request.ownerId,
        request.channel,
        request.message,
        threadId,
        userMsgId,
      );

      // Positive laugh/reaction to her prior line → capture that exchange.
      try {
        const priorAshley = [...assembled.hotMessages]
          .reverse()
          .find((m) => m.role === "assistant")?.content;
        if (priorAshley) {
          maybeCaptureExample(this.db, request.message, priorAshley, {
            sourceMessageId: userMsgId,
          });
        }
      } catch (err) {
        console.warn("[chat] voice capture failed:", err);
      }

      const promptParts = loadSystemPrompt(request.channel);

      const askKind = activityAskKind(request.message);
      const activityAsk = askKind !== null;
      const presenceAsk = isPresenceAsk(request.message);
      const curiosityMode = activityAsk ? "solicited" : "organic";
      // Voice skips unsolicited reading texture (TTS budget). Direct asks still
      // get a license so she cannot invent under hasReadActivity.
      const curiosity =
        request.channel === "voice" && curiosityMode === "organic"
          ? null
          : await assembleCuriosity(this.db, request.message, {
              mode: curiosityMode,
              askKind: askKind ?? undefined,
              alsoInterests: asksInterests(request.message),
              messageEmbedding: assembled.queryEmbedding,
            });

      const capabilityNote =
        request.channel !== "voice" && isBrowsePermission(request.message)
          ? buildCapabilityBlock(env.curiosityEnabled)
          : null;

      // Text only for v1: voice latency / TTS budget stays unchanged.
      const linkDecision = extractImmediateHttpsUrl(request.message);

      // Sharp: decide once before voice select; regen must reuse this arm.
      const sharpBlocked =
        activityAsk ||
        linkDecision.kind === "immediate" ||
        isBrowsePermission(request.message);
      const sharpDecision = decideSharpMode({
        channel: request.channel,
        queryMode: assembled.queryMode,
        message: request.message,
        lastAt: readSharpLastAt(this.db, request.ownerId),
        blocked: sharpBlocked,
      });
      const sharpArmed = sharpDecision.armed;
      const sharpNote = sharpArmed ? sharpLicenseNote() : null;

      const examples =
        env.personaFewshotEnabled && assembled.queryMode !== "recall"
          ? selectVoiceExamples({
              message: request.message,
              seed: assembled.threadId,
              max: env.personaFewshotCount,
              allowSharp: sharpArmed,
              db: this.db,
              extraTags:
                assembled.queryMode === "soft_recall"
                  ? ["fabrication_bait", "recall_empty"]
                  : [],
            })
          : [];
      const linkUrl =
        linkDecision.kind === "immediate" || linkDecision.kind === "mention"
          ? linkDecision.url
          : null;
      const linkResult =
        request.channel === "voice"
          ? { pageContext: null as string | null, guard: null as string | null, success: false }
          : await maybeReadLink(this.db, request.message, assembled.queryMode);
      const pageContext = linkResult.pageContext;
      const linkFailed = Boolean(linkResult.guard) && !linkResult.success;

      const searchContext = await this.maybeLookUp(
        request.message,
        assembled.queryMode,
        linkDecision.kind === "immediate" ? linkUrl : null,
      );

      // Wanted a lookup, did not get one: she has to say so instead of guessing.
      // Activity asks are not lookups; skip the offline-lookup guard for them.
      const wantedLookup = Boolean(
        shouldLookupAsideUrl(
          request.message,
          linkDecision.kind === "immediate" ? linkUrl : null,
        ),
      );
      const lookupGuard =
        !activityAsk && !searchContext && wantedLookup ? NO_LOOKUP_GUARD : null;
      const linkGuard = linkResult.guard;
      const capabilityChallengeGuard =
        env.curiosityEnabled && isBrowseCapabilityChallenge(request.message)
          ? CAPABILITY_GUARD.text
          : null;
      let premiseGuard: string | null = isPremiseCheck(request.message)
        ? PREMISE_GUARD
        : null;
      if (premiseGuard && request.message.trim().length > 20) {
        try {
          const llm = await checkPremiseLLM(request.message);
          if (llm.hasFalsePremise) {
            premiseGuard = premiseGuardWithCorrection(llm.correction);
          }
        } catch (err) {
          console.warn("[chat] premise LLM check failed:", err);
        }
      }
      const guardParts = [
        premiseGuard,
        capabilityChallengeGuard,
        lookupGuard,
        linkGuard,
      ].filter(Boolean);
      const guard = guardParts.length > 0 ? guardParts.join("\n\n") : null;

      // Status string is glanceable state — inject only when he points at it.
      // Every-turn injection primed hollow count echoes.
      const presenceNote =
        request.channel === "discord" && presenceAsk
          ? buildDiscordPresenceNote(request.discordPresence, {
              readingAsk: askKind === "reading",
            })
          : null;

      const buildMessages = (
        withExamples: VoiceExample[],
        withCuriosity: CuriosityInjection = curiosity,
      ) =>
        buildChatMessages({
          system: appendMemoryBlock(promptParts, assembled.memoryBlock, {
            presence: presenceNote,
            capability: capabilityNote,
            curiosity: withCuriosity?.text,
            sharp: sharpNote,
            voice: buildVoiceBlock(withExamples),
            guard,
          }),
          hot: assembled.hotMessages,
          message: request.message,
          imageUrls: request.imageUrls,
          searchContext,
          pageContext,
        });

      const messages = buildMessages(examples);

      let full = "";
      // soft_recall stays on the conversational budget: it is a question about a
      // past exchange, not a memory audit, and clamping it to 120 is what makes
      // her sound like she is reading off an index card.
      const maxTokens =
        assembled.queryMode === "recall"
          ? 120
          : request.channel === "voice"
            ? 512
            : 2048;

      // Text chat only: recall wants stable phrasing and voice is short enough
      // that penalising repeats mostly costs coherence.
      const presencePenalty =
        assembled.queryMode !== "recall" && request.channel !== "voice"
          ? env.mistralChatPresencePenalty
          : undefined;

      const reasoningEffort = classifyReasoningEffort({
        queryMode: assembled.queryMode,
        message: request.message,
        activityAsk,
      });
      const temp = selectTemperature({
        queryMode: assembled.queryMode,
        channel: request.channel,
        reasoningEffort,
        recallTemperature: env.mistralRecallTemperature,
        voiceTemperature: env.mistralVoiceTemperature,
        chatTemperature: env.mistralChatTemperature,
      });

      const sampling = {
        maxTokens,
        temperature: temp,
        presencePenalty,
        reasoningEffort,
        signal: this.abortController.signal,
        lane: "interactive" as const,
      };

      // Text channels hold the deltas back so a copied sample or a fabricated
      // "I read" can be regenerated before Doc sees it. Voice keeps streaming,
      // because there the latency is audible.
      const buffered = request.channel !== "voice";

      for await (const delta of streamChat(messages, sampling)) {
        full += delta;
        if (!buffered) yield { type: "delta", text: delta };
      }

      // At most one regeneration per turn — stacked rewrites become compliance prose.
      if (buffered && full) {
        const recentAssistant = assembled.hotMessages
          .filter((m) => m.role === "assistant")
          .map((m) => m.content)
          .slice(-6);

        type Regen = { reason: string; messages: ReturnType<typeof buildMessages> };
        let regen: Regen | null = null;

        if (examples.length > 0 && looksLikeParrot(full, examples)) {
          regen = { reason: "parrot", messages: buildMessages([]) };
        } else if (isEchoOfUser(full, request.message)) {
          regen = {
            reason: "echo",
            messages: buildMessages(examples, {
              text: NO_ECHO_GUARD,
              takeIds: [],
              provenance: "mention",
            }),
          };
        } else if (
          isPremiseCheck(request.message) &&
          acceptedUncheckedPremise(full)
        ) {
          regen = {
            reason: "premise",
            messages: buildMessages(examples, {
              text: PREMISE_GUARD,
              takeIds: [],
              provenance: "mention",
            }),
          };
        } else if (env.curiosityEnabled && deniesOwnCapability(full)) {
          regen = {
            reason: "capability",
            messages: buildMessages(
              examples,
              linkFailed ? LINK_FAILED_CAPABILITY_GUARD : CAPABILITY_GUARD,
            ),
          };
        } else if (
          claimsOwnActivity(full) &&
          !searchContext &&
          !pageContext &&
          (linkFailed ||
            (!hasReadActivity(this.db, 24) &&
              !(curiosity && curiosity.takeIds.length > 0)))
        ) {
          // Empty solicited honesty still counts as no content license.
          // A failed link-read must not be masked by an unrelated idle read.
          regen = {
            reason: "activity",
            messages: buildMessages(examples, NO_ACTIVITY_GUARD),
          };
        } else if (looksLikeRepeat(full, recentAssistant)) {
          regen = {
            reason: "repeat",
            messages: buildMessages(examples, {
              text: NO_REPEAT_GUARD,
              takeIds: [],
              provenance: "mention",
            }),
          };
        }

        if (regen) {
          console.warn(`[chat] ${regen.reason}, regenerating once`);
          // A repeat retried at the same temperature converges on the same
          // sentence, which is how a verbatim double reaches Doc.
          const regenSampling =
            regen.reason === "repeat"
              ? {
                  ...sampling,
                  temperature: Math.min(0.95, temp + 0.25),
                  reasoningEffort: "low" as const,
                }
              : sampling;
          full = "";
          for await (const delta of streamChat(regen.messages, regenSampling)) {
            full += delta;
          }

          // Her own last line sent again is unshippable, so this one case gets
          // a final attempt with no samples and a hotter draw.
          if (
            regen.reason === "repeat" &&
            full &&
            looksLikeRepeat(full, recentAssistant.slice(-1))
          ) {
            console.warn("[chat] still repeating after regen, last attempt");
            full = "";
            const lastMessages = buildMessages([], {
              text: NO_REPEAT_GUARD,
              takeIds: [],
              provenance: "mention",
            });
            for await (const delta of streamChat(lastMessages, {
              ...sampling,
              temperature: 0.9,
              reasoningEffort: "low" as const,
            })) {
              full += delta;
            }
          }
          if (regen.reason === "capability") {
            const floored = applyCapabilityHardFloor(full);
            if (floored !== full) {
              console.warn("[chat] capability hard floor after regen");
              full = floored;
            }
          }
        }

        // After any regen rewrite: drop within-turn restating bubbles so Doc
        // never sees the double (and memory matches what he saw).
        if (full) {
          const collapsed = collapseWithinTurnRepeat(full);
          if (collapsed !== full) {
            console.warn("[chat] within-turn restatement collapsed");
            full = collapsed;
          }
        }
      }

      full = sanitizeTypography(full);

      if (buffered && full) {
        yield { type: "delta", text: full };
      }

      const persisted = stripMediaMarkers(full);
      // Marker-only / empty drafts must not land in hot history — Mistral 400s
      // on empty assistant content and every later turn glitches.
      if (!persisted.trim()) {
        console.warn("[chat] skipping empty assistant persist");
        yield {
          type: "done",
          text: full,
          model: env.mistralModel,
          threadId: assembled.threadId,
        };
        return;
      }

      // Only after a real reply persists does the surfacing count, so a
      // regenerated or empty turn does not burn the daily cap.
      if (curiosity) commitCuriosity(this.db, curiosity);

      const assistantId = insertMessage(this.db, {
        threadId,
        ownerId: request.ownerId,
        role: "assistant",
        text: persisted,
        channel: request.channel,
        tokenEstimate: estimateTokens(persisted),
        auditSessionId: request.auditSessionId,
      });

      if (sharpArmed && full) {
        commitSharpArmed(this.db, request.ownerId);
      }

      noteOpenThreads(this.db, request.ownerId, {
        role: "assistant",
        text: persisted,
        messageId: assistantId,
      });

      const detected = detectConversationState(persisted, request.message);
      if (detected) {
        recordConversationState(
          this.db,
          request.ownerId,
          assembled.threadId,
          detected,
        );
      }

      const mood = detectMoodFromText(persisted);
      if (mood) {
        recordMood(this.db, request.ownerId, mood, {
          sourceMessageId: assistantId,
        });
      }

      this.consolidator.afterMessage(
        request.ownerId,
        threadId,
        assistantId,
        "assistant",
      );

      yield {
        type: "done",
        text: full,
        model: env.mistralModel,
        threadId: assembled.threadId,
      };
    } catch (err) {
      if (err instanceof AppError) {
        yield { type: "error", code: err.code, message: err.message };
      } else if (err instanceof Error && err.name === "AbortError") {
        yield { type: "error", code: "internal_error", message: "Cancelled" };
      } else {
        yield {
          type: "error",
          code: "internal_error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    } finally {
      this.activeOwner = null;
      this.abortController = null;
      setTurnBusy(false);
    }
  }

  async complete(request: ChatRequest): Promise<{
    text: string;
    threadId: string;
    model: string;
  }> {
    let text = "";
    let threadId = request.threadId ?? "";
    let model = env.mistralModel;

    for await (const event of this.stream(request)) {
      if (event.type === "delta") text += event.text;
      if (event.type === "done") {
        text = event.text;
        model = event.model;
        threadId = event.threadId;
      }
      if (event.type === "error") {
        throw new AppError(
          event.code as AppError["code"],
          event.message,
          event.code === "chat_in_progress" ? 409 : 503,
        );
      }
    }

    const tid =
      threadId ||
      resolveActiveThread(this.db, request.ownerId, request.channel);
    return { text, threadId: tid, model };
  }

  pinMemory(
    ownerId: string,
    text: string,
    sensitivity: "none" | "private" = "none",
  ) {
    const fact = pinFact(this.db, ownerId, text, sensitivity);
    if (!fact) {
      throw new AppError("forbidden", "Topic is blocked by correction denylist", 403);
    }
    return fact;
  }

  getMemorySummary(ownerId: string, includePrivate = false) {
    const threadId = resolveActiveThread(this.db, ownerId, "discord");
    return {
      facts: listActiveFacts(this.db, ownerId, 40, includePrivate),
      narrative: getActiveSummary(this.db, threadId),
      lastUpdated: new Date().toISOString(),
    };
  }

  newThread(ownerId: string) {
    return archiveAndNewThread(this.db, ownerId, "discord");
  }

  forget(ownerId: string, topic: string, confirmed: boolean) {
    return forgetByTopic(this.db, ownerId, topic, confirmed);
  }

  getDebugContext(
    ownerId: string,
    userMessage?: string,
    channel: ChatChannel = "discord",
  ) {
    return this.assembler.getDebugContext(ownerId, userMessage, channel);
  }

  getMemoryHealth() {
    return getMemoryHealth(this.db);
  }

  recordReaction(ownerId: string, input: { messageId: string; emoji: string }) {
    return recordReaction(this.db, ownerId, input);
  }

  /** For the curiosity loop, which owns its own tables in the same file. */
  get database(): DatabaseSync {
    return this.db;
  }

  getDb() {
    return this.db;
  }

  getAssembler() {
    return this.assembler;
  }

  async evaluateInitiative(ownerId: string): Promise<EvaluateResult> {
    if (isProactivePausedDb(this.db, ownerId)) {
      return {
        shouldReachOut: false,
        reason: "proactive_paused",
        cooldownRemainingSec: 0,
      };
    }
    const cold = evaluateInitiative(this.db, ownerId, {
      busy: this.isBusy(ownerId),
      enabled: env.proactiveEnabled,
    });
    if (cold.shouldReachOut || cold.reason !== "user_active_recently") {
      return cold;
    }
    // He is around and she dropped something inside this session. That is a
    // nudge, not cold outreach, and it costs the same daily budget.
    if (!this.nudgeReady(ownerId)) return cold;
    const nudge = evaluateInitiative(this.db, ownerId, {
      busy: this.isBusy(ownerId),
      enabled: env.proactiveEnabled,
      nudge: true,
    });
    return nudge.candidate && NUDGE_KINDS.has(nudge.candidate.kind)
      ? nudge
      : cold;
  }

  /** Her own last word has to be stale, or a nudge is just interrupting. */
  private nudgeReady(ownerId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT ts FROM mem_messages
         WHERE owner_id = ? AND role = 'assistant'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(ownerId) as { ts: string } | undefined;
    if (!row) return false;
    const ageMin =
      (Date.now() - new Date(row.ts).getTime()) / 60_000;
    return ageMin >= env.proactiveNudgeIdleMinutes;
  }

  async tickInitiative(ownerId: string): Promise<
    | { shouldSend: false; reason: string; cooldownRemainingSec?: number }
    | ({ shouldSend: true } & InitiativeDraft)
  > {
    const evalResult = await this.evaluateInitiative(ownerId);
    if (!evalResult.shouldReachOut) {
      return {
        shouldSend: false,
        reason: evalResult.reason,
        cooldownRemainingSec: evalResult.cooldownRemainingSec,
      };
    }

    if (!tryAcquireInitiativeLease(this.db, ownerId)) {
      return { shouldSend: false, reason: "tick_in_progress" };
    }

    if (this.isBusy(ownerId)) {
      releaseInitiativeLease(this.db, ownerId);
      return { shouldSend: false, reason: "chat_in_progress" };
    }

    this.activeOwner = ownerId;
    try {
      const draft = await draftInitiativeMessage(
        this.assembler,
        ownerId,
        evalResult.angle ?? "check_in",
        evalResult.reason,
        evalResult.candidate,
        this.db,
      );
      draft.reservationId = reserveInitiative(this.db, ownerId, draft);
      return { shouldSend: true, ...draft };
    } catch (err) {
      releaseInitiativeLease(this.db, ownerId);
      throw err;
    } finally {
      this.activeOwner = null;
    }
  }

  /** The send failed, so the claimed material goes back on the queue. */
  abortInitiative(ownerId: string, reservationId: number): void {
    releaseReservation(this.db, reservationId);
    releaseInitiativeLease(this.db, ownerId);
  }

  commitInitiative(
    ownerId: string,
    draft: InitiativeDraft,
    discordMessageId: string,
  ): void {
    commitInitiativeMessage(
      this.db,
      this.consolidator,
      ownerId,
      draft,
      discordMessageId,
    );
    releaseInitiativeLease(this.db, ownerId);
  }

  async generateInitiativeMessage(
    ownerId: string,
    angle: import("./initiative/queue.js").Angle,
    reason: string,
  ) {
    if (this.isBusy(ownerId)) {
      throw new AppError("chat_in_progress", "Chat in progress", 409);
    }
    this.activeOwner = ownerId;
    try {
      return await draftInitiativeMessage(
        this.assembler,
        ownerId,
        angle,
        reason,
        undefined,
        this.db,
      );
    } finally {
      this.activeOwner = null;
    }
  }

  getInitiativeStatus(ownerId: string) {
    return getInitiativeStatus(
      this.db,
      ownerId,
      env.proactiveEnabled,
    );
  }

  setProactivePaused(ownerId: string, paused: boolean): void {
    setProactivePausedDb(this.db, ownerId, paused);
  }

  isProactivePaused(ownerId: string): boolean {
    return isProactivePausedDb(this.db, ownerId);
  }

  shutdown(): void {
    this.consolidator.stop();
  }
}
