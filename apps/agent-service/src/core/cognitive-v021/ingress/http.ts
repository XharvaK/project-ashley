import { randomUUID } from "node:crypto";
import type express from "express";
import type { DatabaseSync } from "node:sqlite";
import { resolveActiveThread } from "../../memory/threads.js";
import { appendOwnerUtteranceWithStatus } from "../evidence/conversation-log.js";
import { appendCycleLogIds, appendInboxEvent, appendInboxEventInTransaction, getCycle, getInboxEvent } from "../cycle/inbox.js";
import { composeOrPreempt } from "../cycle/fence.js";
import {
  advanceDeferredFrontierEvidence,
  getActiveDeferredFrontier,
} from "../frontier/ledger.js";

export type CognitiveIngressBody = {
  userId: string;
  message: string;
  channel?: string;
  threadId?: string;
  discordMessageIds?: string[];
  inboundDiscordMessageIds?: string[];
  finalFragmentReceivedAtMs?: number;
  attachments?: Array<{
    discordAttachmentId: string;
    declaredMime: string;
    fileName: string;
    declaredByteSize?: number;
    sourceUrl: string;
  }>;
  discordPresence?: { status: "online" | "idle"; label: string };
};

export type CognitiveIngressResult = {
  accepted: true;
  evidenceRowId: string;
  inboxEventId: string;
  conversationId: string;
  cycleId: string;
  generation: number;
  action: "compose" | "preempt";
  duplicate?: boolean;
  evidenceRecordId: string;
  admittedAtMs: number;
};

function existingInboxForEvidence(sidecar: DatabaseSync, conversationId: string, evidenceRowId: string) {
  const rows = sidecar.prepare("SELECT id FROM inbox_events WHERE conversation_id = ? ORDER BY created_at_ms ASC").all(conversationId);
  for (const row of rows) {
    if (typeof row !== "object" || row === null || typeof (row as { id?: unknown }).id !== "string") continue;
    const event = getInboxEvent(sidecar, (row as { id: string }).id);
    if (event && typeof event.payload === "object" && event.payload !== null && !Array.isArray(event.payload) && (event.payload as Record<string, unknown>).evidenceRowId === evidenceRowId) return event;
  }
  return null;
}

function existingCycleForEvidence(sidecar: DatabaseSync, conversationId: string, evidenceRowId: string) {
  const row = sidecar.prepare(
    "SELECT cycle_id FROM cycle_records WHERE conversation_id = ? AND trigger_ref = ? ORDER BY generation ASC LIMIT 1",
  ).get(conversationId, evidenceRowId) as { cycle_id?: unknown } | undefined;
  return typeof row?.cycle_id === "string" ? getCycle(sidecar, row.cycle_id) : null;
}

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
  const admittedAtMs = options.nowMs ?? input.finalFragmentReceivedAtMs ?? Date.now();
  const { evidence, duplicate } = appendOwnerUtteranceWithStatus(sidecar, {
    conversationId,
    text,
    discordMessageIds,
    nowMs: admittedAtMs,
  });
  if (duplicate) {
    const existingInbox = existingInboxForEvidence(sidecar, conversationId, evidence.rowId);
    const existingCycle = existingCycleForEvidence(sidecar, conversationId, evidence.rowId);
    if (existingInbox && existingCycle) {
      return {
        accepted: true,
        evidenceRowId: evidence.rowId,
        evidenceRecordId: evidence.rowId,
        inboxEventId: existingInbox.id,
        conversationId,
        cycleId: existingCycle.cycleId,
        generation: existingCycle.generation,
        action: "compose",
        duplicate: true,
        admittedAtMs: evidence.createdAtMs,
      };
    }
  }
  const activeFrontier = getActiveDeferredFrontier(sidecar, conversationId);
  if (activeFrontier) {
    sidecar.exec("BEGIN IMMEDIATE");
    try {
      advanceDeferredFrontierEvidence(sidecar, activeFrontier.frontierId, evidence.rowId, admittedAtMs);
      appendCycleLogIds(sidecar, activeFrontier.cycleId, [evidence.rowId], admittedAtMs);
      const inbox = appendInboxEventInTransaction(
        sidecar,
        {
          conversationId,
          kind: "owner_utterance",
          payload: {
            cycleId: activeFrontier.cycleId,
            evidenceRowId: evidence.rowId,
            discordMessageIds: evidence.discordMessageIds,
            ownerId: input.userId,
            channel,
            threadId: input.threadId ?? conversationId,
            attachments: input.attachments ?? [],
            discordPresence: input.discordPresence ?? null,
            subsumedByFrontierId: activeFrontier.frontierId,
          },
          createdAtMs: admittedAtMs,
          initialTerminalReason: "subsumed_by_frontier",
        },
        randomUUID(),
      );
      sidecar.exec("COMMIT");

      return {
        accepted: true,
        evidenceRowId: evidence.rowId,
        inboxEventId: inbox.id,
        conversationId,
        cycleId: activeFrontier.cycleId,
        generation: activeFrontier.generation,
        action: "compose",
        evidenceRecordId: evidence.rowId,
        admittedAtMs: evidence.createdAtMs,
      };
    } catch (error) {
      try { sidecar.exec("ROLLBACK"); } catch { /* ignore rollback error */ }
      throw error;
    }
  }
  const fence = composeOrPreempt(sidecar, {
    conversationId,
    evidenceRowIds: [evidence.rowId],
    triggerKind: "owner_message",
    triggerRef: evidence.rowId,
    occupantId: options.occupantId ?? input.userId,
    authorityEpoch: options.authorityEpoch ?? 1,
    nowMs: admittedAtMs,
  });
  const inbox = appendInboxEvent(sidecar, {
    conversationId,
    wakeId: fence.cycle.wakeId,
    kind: "owner_utterance",
    payload: {
      cycleId: fence.cycleId,
      evidenceRowId: evidence.rowId,
      discordMessageIds: evidence.discordMessageIds,
      ownerId: input.userId,
      channel,
      threadId: input.threadId ?? conversationId,
      attachments: input.attachments ?? [],
      discordPresence: input.discordPresence ?? null,
    },
    createdAtMs: admittedAtMs,
  });
  return {
    accepted: true,
    evidenceRowId: evidence.rowId,
    inboxEventId: inbox.id,
    conversationId,
    cycleId: fence.cycleId,
    generation: fence.generation,
    action: fence.action,
    evidenceRecordId: evidence.rowId,
    admittedAtMs: evidence.createdAtMs,
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
        threadId: body.threadId,
        discordMessageIds: body.discordMessageIds,
        inboundDiscordMessageIds: body.inboundDiscordMessageIds,
        finalFragmentReceivedAtMs: body.finalFragmentReceivedAtMs,
        attachments: body.attachments,
        discordPresence: body.discordPresence,
      });
      res.status(202).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "owner_required" ? 403 : message === "message_too_long" ? 400 : 400;
      res.status(status).json({ error: message });
    }
  };
}
