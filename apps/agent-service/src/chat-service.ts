import type { DatabaseSync } from "node:sqlite";
import { AppError } from "./errors.js";
import { env } from "./env.js";
import { streamChat, type ChatMessage } from "./mistral-client.js";
import { appendMemoryBlock, loadSystemPrompt } from "./prompts.js";
import { MemoryAssembler } from "./memory/assembler.js";
import { ConsolidationWorker } from "./memory/consolidator.js";
import { getMemoryDb, getMemoryHealth } from "./memory/db.js";
import { applyAutoRemember } from "./memory/auto-remember.js";
import { buildMemoryDigestItems, type MemoryDigestItem } from "./memory/memory-digest.js";
import {
  handleForgetRequest,
  syncDenylistFromThread,
} from "./memory/correction-denylist.js";
import { forgetByTopic, getActiveSummary, listActiveFacts, pinFact } from "./memory/facts.js";
import { archiveAndNewThread, insertMessage, resolveActiveThread } from "./memory/threads.js";
import { estimateTokens } from "./memory/tokens.js";
import { evaluateInitiative } from "./initiative/evaluator.js";
import {
  draftInitiativeMessage,
  commitInitiativeMessage,
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
import type { ChatChannel } from "./memory/types.js";

export type ChatRequest = {
  message: string;
  channel: ChatChannel;
  ownerId: string;
  threadId?: string;
  auditSessionId?: string | null;
};

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      text: string;
      model: string;
      threadId: string;
      memoryDigest?: MemoryDigestItem[];
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

    try {
      const threadId =
        request.threadId ??
        resolveActiveThread(this.db, request.ownerId, request.channel);

      const userMsgId = insertMessage(this.db, {
        threadId,
        ownerId: request.ownerId,
        role: "user",
        text: request.message,
        channel: request.channel,
        tokenEstimate: estimateTokens(request.message),
        auditSessionId: request.auditSessionId,
      });

      handleForgetRequest(this.db, request.ownerId, request.message);
      syncDenylistFromThread(this.db, request.ownerId, threadId);

      const autoResult = applyAutoRemember(
        this.db,
        request.ownerId,
        threadId,
        userMsgId,
        request.message,
        this.consolidator,
      );
      const digestPromise =
        autoResult?.facts.length ?
          buildMemoryDigestItems(
            autoResult.facts,
            request.message,
            request.channel,
            this.abortController.signal,
          )
        : Promise.resolve([] as MemoryDigestItem[]);

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
      );

      const system = appendMemoryBlock(
        loadSystemPrompt(request.channel),
        assembled.memoryBlock,
      );

      const messages: ChatMessage[] = [
        { role: "system", content: system },
        ...assembled.hotMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: request.message },
      ];

      let full = "";
      const temp =
        assembled.queryMode === "recall"
          ? env.mistralRecallTemperature
          : request.channel === "voice"
            ? env.mistralVoiceTemperature
            : env.mistralChatTemperature;
      const maxTokens =
        assembled.queryMode === "recall"
          ? 120
          : request.channel === "voice"
            ? 512
            : 2048;

      for await (const delta of streamChat(messages, {
        maxTokens,
        temperature: temp,
        reasoningEffort: "none",
        signal: this.abortController.signal,
      })) {
        full += delta;
        yield { type: "delta", text: delta };
      }

      const assistantId = insertMessage(this.db, {
        threadId,
        ownerId: request.ownerId,
        role: "assistant",
        text: full,
        channel: request.channel,
        tokenEstimate: estimateTokens(full),
        auditSessionId: request.auditSessionId,
      });

      this.consolidator.afterMessage(
        request.ownerId,
        threadId,
        assistantId,
        "assistant",
      );

      const memoryDigest = await digestPromise;

      yield {
        type: "done",
        text: full,
        model: env.mistralModel,
        threadId: assembled.threadId,
        memoryDigest: memoryDigest.length ? memoryDigest : undefined,
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
    }
  }

  async complete(request: ChatRequest): Promise<{
    text: string;
    threadId: string;
    model: string;
    memoryDigest?: MemoryDigestItem[];
  }> {
    let text = "";
    let threadId = request.threadId ?? "";
    let model = env.mistralModel;
    let memoryDigest: MemoryDigestItem[] | undefined;

    for await (const event of this.stream(request)) {
      if (event.type === "delta") text += event.text;
      if (event.type === "done") {
        text = event.text;
        model = event.model;
        threadId = event.threadId;
        memoryDigest = event.memoryDigest;
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
    return { text, threadId: tid, model, memoryDigest };
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

  getDb() {
    return this.db;
  }

  async evaluateInitiative(ownerId: string) {
    if (isProactivePausedDb(this.db, ownerId)) {
      return {
        shouldReachOut: false,
        reason: "proactive_paused",
        cooldownRemainingSec: 0,
      };
    }
    return evaluateInitiative(this.db, ownerId, {
      busy: this.isBusy(ownerId),
      enabled: env.proactiveEnabled,
    });
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
      );
      return { shouldSend: true, ...draft };
    } catch (err) {
      releaseInitiativeLease(this.db, ownerId);
      throw err;
    } finally {
      this.activeOwner = null;
    }
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
    angle: "question" | "opinion" | "check_in",
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
