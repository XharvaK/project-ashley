import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

import { randomBytes } from "node:crypto";

import { ConversationLogger } from "./conversation-logger.js";

import { OrpheusStreamer } from "./orpheus-tts.js";

import { STATE_PATH, DATA_DIR } from "./paths.js";

import { ChatService } from "./chat-service.js";

import { env, validateBoot } from "./env.js";

import { getMemoryDb } from "./memory/db.js";

import { AppError } from "./errors.js";



export type AgentState = "booting" | "ready" | "paused" | "busy" | "offline";



export type SseClient = {

  write: (data: object) => void;

};



type PersistedState = {

  activeSessionId?: string | null;

};



export class AgentManager {

  private state: AgentState = "booting";

  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  readonly logger = new ConversationLogger();

  readonly chat: ChatService;

  private sseClients = new Set<SseClient>();

  private readonly bootedAt = Date.now();



  constructor() {

    mkdirSync(DATA_DIR, { recursive: true });

    const db = this.logger.getDb();

    getMemoryDb(db);

    this.chat = new ChatService(db);

  }



  getState(): AgentState {

    return this.state;

  }



  getAgentId(): string | null {

    return null;

  }



  getUptimeSec(): number {

    return Math.floor((Date.now() - this.bootedAt) / 1000);

  }



  isMistralConfigured(): boolean {

    return Boolean(env.mistralApiKey);

  }



  addSseClient(client: SseClient): void {

    this.sseClients.add(client);

  }



  removeSseClient(client: SseClient): void {

    this.sseClients.delete(client);

  }



  broadcast(event: object): void {

    for (const c of this.sseClients) {

      try {

        c.write(event);

      } catch {

        this.sseClients.delete(c);

      }

    }

  }



  private loadState(): PersistedState {

    if (!existsSync(STATE_PATH)) return {};

    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as PersistedState;

  }



  private saveState(patch: Partial<PersistedState>): void {

    const prev = this.loadState();

    writeFileSync(STATE_PATH, JSON.stringify({ ...prev, ...patch }, null, 2));

  }



  async init(): Promise<void> {

    const { warnings } = validateBoot();

    for (const w of warnings) console.warn(`[agent-service] ${w}`);



    if (!env.mistralApiKey) {

      this.state = "offline";

      this.broadcast({ type: "offline", reason: "missing_api_key" });

      return;

    }



    this.state = "ready";

    this.broadcast({ type: "status", status: "ready" });

  }



  async pause(): Promise<void> {

    this.chat.cancel();

    this.state = "paused";

    this.logger.checkpoint();

    this.broadcast({ type: "vram_guard", status: "paused" });

  }



  async resume(): Promise<void> {

    if (this.state === "offline") {

      await this.init();

      return;

    }

    this.state = "ready";

    this.broadcast({ type: "vram_guard", status: "resumed" });

  }



  async shutdown(): Promise<void> {

    this.chat.cancel();

    this.chat.shutdown();

    this.logger.close();

  }



  newSessionId(): string {

    const d = new Date();

    const stamp = d.toISOString().slice(0, 10);

    const time = d.toTimeString().slice(0, 8).replace(/:/g, "");

    const rand = randomBytes(3).toString("hex");

    return `${stamp}_${time}_${rand}`;

  }



  startSession(): string {

    const sessionId = this.newSessionId();

    this.logger.createSession(sessionId, null);

    this.saveState({ activeSessionId: sessionId });

    this.resetIdleTimer(sessionId);

    return sessionId;

  }



  private resetIdleTimer(sessionId: string): void {

    if (this.idleTimer) clearTimeout(this.idleTimer);

    this.idleTimer = setTimeout(

      () => {

        this.logger.endSession(sessionId);

        this.saveState({ activeSessionId: null });

      },

      30 * 60 * 1000,

    );

  }



  async cancelActiveRun(): Promise<void> {

    this.chat.cancel();

  }



  resolveOwnerId(discordUserId?: string): string {

    if (discordUserId) return discordUserId;

    if (env.memoryOwnerId) return env.memoryOwnerId;

    throw new AppError(

      "agent_not_ready",

      "MEMORY_OWNER_ID or DISCORD_OWNER_ID required",

      503,

    );

  }



  async handleTextChat(

    message: string,

    userId: string,

    threadId?: string,

    auditSessionId?: string,

    imageUrls?: string[],

    channel: "discord" | "telegram" = "discord",

  ): Promise<{
    text: string;
    threadId: string;
    model: string;
  }> {

    if (this.state === "paused" || this.state === "booting") {

      throw new AppError("agent_not_ready", "Agent not ready", 503);

    }

    if (this.state === "offline" || !env.mistralApiKey) {

      throw new AppError("agent_not_ready", "Mistral not configured", 503);

    }



    if (env.discordOwnerId && userId !== env.discordOwnerId) {

      throw new AppError("forbidden", "Forbidden", 403);

    }



    this.state = "busy";

    this.broadcast({ type: "status", status: "thinking" });



    try {

      const result = await this.chat.complete({

        message,

        channel,

        ownerId: userId,

        threadId,

        auditSessionId,

        imageUrls,

      });



      if (auditSessionId) {
        this.logger.append({
          ts: new Date().toISOString(),
          role: "user",
          text: message,
          source: channel,
          session_id: auditSessionId,
        });
        this.logger.append({
          ts: new Date().toISOString(),
          role: "assistant",
          text: result.text,
          source: "mistral",
          session_id: auditSessionId,
          model: result.model,
        });
      }



      return result;

    } finally {

      this.state = env.mistralApiKey ? "ready" : "offline";

      this.broadcast({ type: "status", status: "ready" });

    }

  }



  async handleChat(

    transcript: string,

    sessionId: string,

    onAudio: (pcm: Uint8Array, sampleRate?: number) => Promise<void>,

  ): Promise<void> {

    if (this.state === "paused" || this.state === "booting") {

      throw new Error("agent_not_ready");

    }



    this.resetIdleTimer(sessionId);

    this.logger.append({

      ts: new Date().toISOString(),

      role: "user",

      text: transcript,

      source: "stt",

      session_id: sessionId,

    });



    if (this.state === "offline" || !env.mistralApiKey) {

      this.broadcast({ type: "offline", reason: "no_network_or_key" });

      await this.speakText("I'm offline. I need internet.", sessionId, onAudio);

      return;

    }



    this.state = "busy";

    this.broadcast({ type: "status", status: "thinking" });



    const tts = new OrpheusStreamer();

    let assistantText = "";

    const ownerId = this.resolveOwnerId();



    try {

      for await (const event of this.chat.stream({

        message: transcript,

        channel: "voice",

        ownerId,

        auditSessionId: sessionId,

      })) {

        if (event.type === "delta") {

          assistantText += event.text;

          this.broadcast({ type: "assistant", text: event.text });

          tts.feed(event.text, onAudio);

        }

        if (event.type === "error") {

          throw new Error(event.message);

        }

      }



      await tts.flush(onAudio);

      if (assistantText) {

        this.logger.append({

          ts: new Date().toISOString(),

          role: "assistant",

          text: assistantText,

          source: "mistral",

          session_id: sessionId,

          model: env.mistralModel,

        });

      }



      this.broadcast({ type: "status", status: "ready" });

    } catch (err) {

      const msg = err instanceof Error ? err.message : String(err);

      console.error("[agent] chat failed:", msg);

      this.broadcast({ type: "error", message: msg });

      await this.speakText("Sorry, something went wrong.", sessionId, onAudio);

    } finally {

      this.state = env.mistralApiKey ? "ready" : "offline";

      this.broadcast({ type: "status", status: "ready" });

    }

  }



  private async speakText(

    text: string,

    sessionId: string,

    onAudio: (pcm: Uint8Array, sampleRate?: number) => Promise<void>,

  ): Promise<void> {

    const tts = new OrpheusStreamer();

    tts.feed(text, onAudio);

    await tts.flush(onAudio);

    this.logger.append({

      ts: new Date().toISOString(),

      role: "assistant",

      text,

      source: "offline_tts",

      session_id: sessionId,

    });

  }

}


