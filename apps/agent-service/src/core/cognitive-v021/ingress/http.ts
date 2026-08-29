import type express from "express";
import type { DatabaseSync } from "node:sqlite";
import { resolveActiveThread } from "../../memory/threads.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { appendInboxEvent } from "../cycle/inbox.js";
import { composeOrPreempt } from "../cycle/fence.js";

export type CognitiveIngressBody = {
  userId: string;
  message: string;
  channel?: string;
  discordMessageIds?: string[];
  inboundDiscordMessageIds?: string[];
  finalFragmentReceivedAtMs?: number;
};

export type CognitiveIngressResult = {
  accepted: true;
  evidenceRowId: string;
  inboxEventId: string;
  conversationId: string;
  cycleId: string;
  generation: number;
  action: "compose" | "preempt";
};

export function admitCognitiveIngress(
  sidecar: DatabaseSync,
  nuclearDb: DatabaseSync,
  input: CognitiveIngressBody,
  options: { nowMs?: number; occupantId?: string | null; authorityEpoch?: number } = {},
): CognitiveIngressResult {
  const channel = input.channel ?? "discord";
  if (channel !== "discord") throw new Error("channel_retired");
  const text = input.message.trim();
  if (!text) throw new Error("message_required");
  const conversationId = resolveActiveThread(nuclearDb, input.userId, channel);
  const discordMessageIds = input.discordMessageIds ?? input.inboundDiscordMessageIds ?? [];
  const evidence = appendOwnerUtterance(sidecar, {
    conversationId,
    text,
    discordMessageIds,
    nowMs: options.nowMs ?? input.finalFragmentReceivedAtMs,
  });
  const inbox = appendInboxEvent(sidecar, {
    conversationId,
    kind: "owner_utterance",
    payload: { evidenceRowId: evidence.rowId, discordMessageIds: evidence.discordMessageIds },
    createdAtMs: options.nowMs ?? input.finalFragmentReceivedAtMs,
  });
  const fence = composeOrPreempt(sidecar, {
    conversationId,
    evidenceRowIds: [evidence.rowId],
    triggerKind: "owner_message",
    triggerRef: evidence.rowId,
    occupantId: options.occupantId ?? input.userId,
    authorityEpoch: options.authorityEpoch ?? 1,
    nowMs: options.nowMs ?? input.finalFragmentReceivedAtMs,
  });
  return {
    accepted: true,
    evidenceRowId: evidence.rowId,
    inboxEventId: inbox.id,
    conversationId,
    cycleId: fence.cycleId,
    generation: fence.generation,
    action: fence.action,
  };
}

export function createCognitiveIngressHandler(options: {
  sidecar: DatabaseSync;
  nuclearDb: DatabaseSync;
  authorizeOwner: (userId: string) => void;
  maxMessageLength?: number;
}): express.RequestHandler {
  return (req, res) => {
    try {
      const body = (req.body ?? {}) as Partial<CognitiveIngressBody>;
      if (typeof body.userId !== "string") throw new Error("owner_required");
      options.authorizeOwner(body.userId);
      if (typeof body.message !== "string") throw new Error("message_required");
      if (body.message.length > (options.maxMessageLength ?? 4000)) throw new Error("message_too_long");
      const result = admitCognitiveIngress(options.sidecar, options.nuclearDb, {
        userId: body.userId,
        message: body.message,
        channel: body.channel,
        discordMessageIds: body.discordMessageIds,
        inboundDiscordMessageIds: body.inboundDiscordMessageIds,
        finalFragmentReceivedAtMs: body.finalFragmentReceivedAtMs,
      });
      res.status(202).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "owner_required" ? 403 : message === "message_too_long" ? 400 : 400;
      res.status(status).json({ error: message });
    }
  };
}
