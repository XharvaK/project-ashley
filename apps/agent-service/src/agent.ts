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
import {
  openCognitiveSidecarDb,
} from "./core/cognitive-v021/sidecar/db.js";
import {
  runLiveCognitiveTurn,
} from "./core/cognitive-v021/dispatch/live.js";
import { runShadowCognitiveTurn } from "./core/cognitive-v021/shadow/runner.js";
import { reconcileProjectedDelivery } from "./core/cognitive-v021/delivery/outbox-projector.js";
import { readCognitiveSidecarMeta } from "./core/cognitive-v021/sidecar/db.js";
import { appendInboxEvent, claimInboxEvent } from "./core/cognitive-v021/cycle/inbox.js";
import { consumeInboxEvent } from "./core/cognitive-v021/cycle/inbox-consumer.js";
import {
  tickIdleOpportunity,
  type IdleTickResult,
} from "./core/cognitive-v021/initiative/idle.js";
import { resolveActiveThread } from "./core/memory/threads.js";
import type {
  InboxEvent,
  KernelDeps,
  KernelRunResult,
  OutboxDeliveryProjector,
} from "./core/cognitive-v021/types.js";
import { replicateLegacyDeliveredAshley } from "./core/cognitive-v021/shadow/replicator.js";

export type CognitiveDispatchResult = KernelRunResult | null;

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
  private cognitiveSidecar: DatabaseSync | null = null;
  private cognitiveDeps: KernelDeps | null = null;
  private cognitiveProjector: OutboxDeliveryProjector | undefined;
  private cognitiveShadowDispatch: ((event: InboxEvent) => Promise<KernelRunResult>) | null = null;
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

  getCognitiveKernel(): "legacy" | "shadow" | "v021" {
    return env.cognitiveKernel;
  }

  /** Open the sidecar only for the explicitly selected non-legacy mode. */
  openCognitiveSidecar(): DatabaseSync | null {
    if (env.cognitiveKernel === "legacy") return null;
    if (this.cognitiveSidecar) return this.cognitiveSidecar;
    this.cognitiveSidecar = openCognitiveSidecarDb(
      new DatabaseSync(this.dataPlane.cognitiveSidecarDbPath),
      { dataPlane: this.dataPlane },
    );
    return this.cognitiveSidecar;
  }

  getCognitiveSidecar(): DatabaseSync | null {
    return this.cognitiveSidecar;
  }

  /** Bind the live/shadow worker dependencies after the service has opened its stores. */
  configureCognitiveDispatch(input: {
    deps: KernelDeps;
    projector?: OutboxDeliveryProjector;
    shadowDispatch?: (event: InboxEvent) => Promise<KernelRunResult>;
  }): void {
    this.cognitiveDeps = input.deps;
    this.cognitiveProjector = input.projector;
    this.cognitiveShadowDispatch = input.shadowDispatch ?? (async (event) => {
      const sidecar = this.openCognitiveSidecar();
      if (!sidecar) throw new AppError("agent_not_ready", "Cognitive sidecar unavailable", 503);
      return runShadowCognitiveTurn({
        sidecar,
        nuclear: this.core.getDatabase(),
        event,
        deps: input.deps,
      });
    });
  }

  /** Flag-gated event dispatch. Legacy returns null and keeps `/chat/text` authoritative. */
  async dispatchCognitiveEvent(event: InboxEvent): Promise<CognitiveDispatchResult> {
    if (env.cognitiveKernel === "legacy") return null;
    const sidecar = this.openCognitiveSidecar();
    const deps = this.cognitiveDeps;
    if (!sidecar || !deps) throw new AppError("agent_not_ready", "Cognitive dispatcher unavailable", 503);
    if (env.cognitiveKernel === "v021") {
      return runLiveCognitiveTurn({
        sidecar,
        nuclear: this.core.getDatabase(),
        event,
        deps,
        projector: this.cognitiveProjector,
      });
    }
    if (!this.cognitiveShadowDispatch) throw new AppError("agent_not_ready", "Shadow dispatcher unavailable", 503);
    return this.cognitiveShadowDispatch(event);
  }

  /** Run one private idle opportunity through the same durable inbox/kernel path. */
  async tickCognitiveIdle(ownerId: string): Promise<IdleTickResult> {
    if (env.cognitiveKernel === "legacy") {
      return {
        conversationId: null,
        eligible: false,
        reason: "empty_house",
        thoughtModelAttempts: 0,
        acceptedSettlements: 0,
        thoughtCalls: 0,
        cycleId: null,
        observations: [],
        firedTriggers: [],
        suppressedTriggers: [],
        dormant: false,
      };
    }
    const sidecar = this.openCognitiveSidecar();
    if (!sidecar || !this.cognitiveDeps) {
      throw new AppError("agent_not_ready", "Cognitive dispatcher unavailable", 503);
    }
    const nuclear = this.core.getDatabase();
    const conversationId = resolveActiveThread(nuclear, ownerId, "discord");
    const authorityEpoch = readCognitiveSidecarMeta(sidecar).authority_epoch;
    return tickIdleOpportunity(sidecar, {
      conversationId,
      occupantId: ownerId,
      authorityEpoch,
      runThought: async (input) => {
        const event = appendInboxEvent(sidecar, {
          id: `idle:${input.cycle.cycleId}`,
          conversationId: input.cycle.conversationId,
          kind: input.trigger.kind,
          payload: {
            ownerId,
            channel: "discord",
            threadId: input.cycle.conversationId,
            triggerRef: input.trigger.ref,
            cycleId: input.cycle.cycleId,
            generation: input.cycle.generation,
            occupantId: ownerId,
            observations: input.observations,
            dueTriggers: input.dueTriggers.map((trigger) => trigger.triggerId),
          },
          createdAtMs: Date.now(),
        });
        const claimed = claimInboxEvent(sidecar, {
          eventId: event.id,
          workerId: `idle:${process.pid}:${ownerId}`,
          nowMs: Date.now(),
          leaseMs: 120_000,
        });
        if (!claimed) throw new Error("idle_inbox_claim_failed");
        let result: CognitiveDispatchResult = null;
        await consumeInboxEvent(sidecar, claimed, async () => {
          result = await this.dispatchCognitiveEvent(claimed);
        });
        const dispatched = result as CognitiveDispatchResult;
        return {
          ...(dispatched ?? {}),
          speechMode: dispatched === null || dispatched.outboxId == null ? "none" as const : "draft" as const,
        };
      },
    });
  }

  /** Trusted host state used by guarded C1 currentness activation. */
  isPaused(): boolean {
    return this.state === "paused";
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

  finalizeDeliveryReservation(
    ownerId: string,
    reservationId: number,
    cause: "complete" | "cancel" | "send_failure" | "first_bubble_deadline" | "delivery_lease" = "complete",
    onArchivalAssistant?: (text: string) => void,
  ) {
    const before = env.cognitiveKernel === "shadow"
      ? this.core.getDeliveryStatus(ownerId, reservationId)
      : null;
    const result = this.core.finalizeDeliveryReservation(ownerId, reservationId, cause, onArchivalAssistant);
    if (env.cognitiveKernel === "v021") {
      const sidecar = this.openCognitiveSidecar();
      if (sidecar) {
        try {
          reconcileProjectedDelivery(sidecar, this.core.getDatabase(), reservationId);
        } catch (error) {
          console.error("[cognitive-v021] delivery reconciliation failed", error);
        }
      }
    }
    if (env.cognitiveKernel === "shadow" && before?.reservation && result.receiptCount > 0 && result.deliveredText) {
      const sidecar = this.openCognitiveSidecar();
      if (sidecar) {
        replicateLegacyDeliveredAshley(sidecar, {
          ownerId,
          conversationId: before.reservation.threadId,
          threadId: before.reservation.threadId,
          reservationId,
          text: result.deliveredText,
          discordMessageIds: before.bubbles
            .filter((bubble) => bubble.discordMessageId)
            .map((bubble) => bubble.discordMessageId!),
        });
      }
    }
    return result;
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
