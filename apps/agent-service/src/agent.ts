import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ConversationLogger } from "./conversation-logger.js";
import { AshleyCore } from "./core/index.js";
import type { DataPlaneContext } from "./core/data-plane.js";
import { openNuclearDb } from "./core/db.js";
import { env, validateBoot } from "./env.js";
import { AppError } from "./errors.js";
import { isAuthorizedOwnerId } from "./owner-auth.js";
import { DatabaseSync } from "node:sqlite";

export class BootValidationError extends Error {
  readonly code = "boot_validation_failed";
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Boot configuration invalid: ${errors.join("; ")}`);
    this.name = "BootValidationError";
    this.errors = errors;
  }
}

export type AgentState = "booting" | "ready" | "paused" | "busy" | "offline";

export type ProviderState = "configured" | "degraded" | "unavailable";

export type SseClient = {
  write: (data: object) => void;
};

type PersistedState = {
  activeSessionId?: string | null;
};

export class AgentManager {
  private state: AgentState = "booting";
  readonly logger: ConversationLogger;
  readonly core: AshleyCore;
  readonly dataPlane: DataPlaneContext;
  private sseClients = new Set<SseClient>();
  private readonly bootedAt = Date.now();

  constructor(dataPlane: DataPlaneContext, existingNuclear?: DatabaseSync) {
    this.dataPlane = dataPlane;
    mkdirSync(dataPlane.dataDir, { recursive: true });
    mkdirSync(dataPlane.conversationsDir, { recursive: true });
    this.logger = new ConversationLogger(dataPlane);
    const db =
      existingNuclear ??
      openNuclearDb(new DatabaseSync(dataPlane.nuclearDbPath), {
        dataPlane,
        migrate: true,
      });
    this.core = new AshleyCore(db, { dataPlane });
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

  getProviderState(): ProviderState {
    if (!this.isMistralConfigured() || this.state === "offline") {
      return "unavailable";
    }
    if (this.state === "ready" || this.state === "busy") {
      return "configured";
    }
    return "degraded";
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
    if (!existsSync(this.dataPlane.statePath)) return {};
    return JSON.parse(readFileSync(this.dataPlane.statePath, "utf-8")) as PersistedState;
  }

  private saveState(patch: Partial<PersistedState>): void {
    const prev = this.loadState();
    writeFileSync(this.dataPlane.statePath, JSON.stringify({ ...prev, ...patch }, null, 2));
  }

  async init(): Promise<void> {
    const { ok, errors, warnings } = validateBoot();
    for (const w of warnings) console.warn(`[agent-service] ${w}`);
    if (!ok) {
      for (const e of errors) console.error(`[agent-service] FATAL ${e}`);
      this.state = "offline";
      this.broadcast({ type: "offline", reason: "invalid_configuration" });
      throw new BootValidationError(errors);
    }
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

  cancel(reservationId?: number, ownerId?: string): {
    ok: boolean;
    state?: string;
    finalizationReason?: string;
  } {
    if (reservationId == null || !ownerId) {
      return { ok: false };
    }
    if (!isAuthorizedOwnerId(ownerId)) {
      return { ok: false };
    }
    return this.core.cancelDelivery(ownerId, reservationId, (text) => {
      const session = this.loadState().activeSessionId;
      if (!session) return;
      this.logger.append({
        ts: new Date().toISOString(),
        role: "assistant",
        text,
        source: "nuclear",
        session_id: session,
        model: "partial",
      });
    });
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
    delivery?: {
      inboundDiscordMessageIds: string[];
      finalFragmentReceivedAtMs: number;
      externalTransportHardDeadlineAtMs?: number;
    },
    attachments?: Array<{
      discordAttachmentId: string;
      declaredMime: string;
      fileName: string;
      declaredByteSize?: number;
      sourceUrl: string;
    }>,
  ): Promise<{
    text: string;
    threadId: string;
    model: string;
    usage: { promptTokens: number; completionTokens: number } | null;
    silenced?: boolean;
    decisionKind?: string;
    decisionId?: number;
    reservationId?: number;
    deliveryState?: string;
    plannedBubbles?: Array<{ ordinal: number; text: string }>;
    media?: { react: string | null; gifQuery: string | null };
    firstBubbleDeadlineAt?: string | null;
    finalDeliveryDeadlineAt?: string | null;
    statusUrl?: string;
    duplicate?: boolean;
  }> {
    void threadId;
    if (this.state === "paused" || this.state === "booting") {
      throw new AppError("agent_not_ready", "Agent not ready", 503);
    }
    if (this.state === "offline" || !env.mistralApiKey) {
      throw new AppError("agent_not_ready", "Mistral not configured", 503);
    }
    if (!isAuthorizedOwnerId(userId)) {
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
      const hasInbound =
        Boolean(delivery?.inboundDiscordMessageIds?.length) &&
        delivery!.finalFragmentReceivedAtMs != null;
      const result = await this.core.handleReactiveChat({
        message,
        ownerId: userId,
        channel: "discord",
        inboundDiscordMessageIds: delivery?.inboundDiscordMessageIds,
        finalFragmentReceivedAtMs: delivery?.finalFragmentReceivedAtMs,
        externalTransportHardDeadlineAtMs:
          delivery?.externalTransportHardDeadlineAtMs,
        simulateDelivery: !hasInbound,
        attachments,
      });
      if (auditSessionId) {
        this.logger.append({
          ts: new Date().toISOString(),
          role: "user",
          text: message,
          source: channel,
          session_id: auditSessionId,
        });
        // Assistant archival only after receipt-backed finalize (ledger path).
        if (result.text && !hasInbound) {
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
        reservationId: result.reservationId,
        deliveryState: result.deliveryState,
        plannedBubbles: result.plannedBubbles,
        media: result.media,
        firstBubbleDeadlineAt: result.firstBubbleDeadlineAt,
        finalDeliveryDeadlineAt: result.finalDeliveryDeadlineAt,
        statusUrl: result.statusUrl,
        duplicate: result.duplicate,
      };
    } finally {
      this.state = env.mistralApiKey ? "ready" : "offline";
      this.broadcast({ type: "status", status: this.state });
    }
  }
}
