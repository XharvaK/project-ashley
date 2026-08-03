import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ConversationLogger } from "./conversation-logger.js";
import { STATE_PATH, DATA_DIR } from "./paths.js";
import { AshleyCore } from "./core/index.js";
import { env, validateBoot } from "./env.js";
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
  readonly logger = new ConversationLogger();
  readonly core: AshleyCore;
  private sseClients = new Set<SseClient>();
  private readonly bootedAt = Date.now();

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    this.core = new AshleyCore();
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
    this.state = "paused";
    this.broadcast({ type: "status", status: "paused" });
  }

  async resume(): Promise<void> {
    this.state = env.mistralApiKey ? "ready" : "offline";
    this.broadcast({ type: "status", status: this.state });
  }

  async shutdown(): Promise<void> {
    this.state = "offline";
    this.broadcast({ type: "status", status: "offline" });
  }

  cancel(): void {
    /* nuclear path has no mid-stream cancel yet */
  }

  startSession(): string {
    const id = randomBytes(8).toString("hex");
    this.saveState({ activeSessionId: id });
    return id;
  }

  async handleTextChat(
    message: string,
    userId: string,
    channel: string,
    threadId?: string,
    auditSessionId?: string,
    _imageUrls?: string[],
    _discordPresence?: string,
  ): Promise<{
    text: string;
    threadId: string;
    model: string;
    usage: { promptTokens: number; completionTokens: number } | null;
    silenced?: boolean;
    decisionKind?: string;
    decisionId?: number;
  }> {
    void threadId;
    if (this.state === "paused" || this.state === "booting") {
      throw new AppError("agent_not_ready", "Agent not ready", 503);
    }
    if (this.state === "offline" || !env.mistralApiKey) {
      throw new AppError("agent_not_ready", "Mistral not configured", 503);
    }
    if (env.discordOwnerId && userId !== env.discordOwnerId) {
      throw new AppError("forbidden", "Forbidden", 403);
    }
    if (channel !== "discord") {
      throw new AppError(
        "channel_retired",
        "Only Discord is supported",
        410,
      );
    }

    this.state = "busy";
    this.broadcast({ type: "status", status: "thinking" });
    try {
      const result = await this.core.handleReactiveChat({
        message,
        ownerId: userId,
        channel: "discord",
      });
      if (auditSessionId) {
        this.logger.append({
          ts: new Date().toISOString(),
          role: "user",
          text: message,
          source: channel,
          session_id: auditSessionId,
        });
        if (result.text) {
          this.logger.append({
            ts: new Date().toISOString(),
            role: "assistant",
            text: result.text,
            source: "nuclear",
            session_id: auditSessionId,
            model: result.model,
          });
        }
      }
      return {
        text: result.text,
        threadId: result.threadId,
        model: result.model,
        usage: null,
        silenced: result.silenced === true || result.decisionKind === "silence",
        decisionKind: result.decisionKind,
        decisionId: result.decisionId,
      };
    } finally {
      this.state = env.mistralApiKey ? "ready" : "offline";
      this.broadcast({ type: "status", status: this.state });
    }
  }
}
