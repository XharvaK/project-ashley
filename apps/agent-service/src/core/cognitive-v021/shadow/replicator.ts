import type { DatabaseSync } from "node:sqlite";
import {
  appendAshleyEvidence,
  listConversationEvidence,
} from "../evidence/conversation-log.js";
import type { ConversationEvidenceRecord } from "../types.js";

export type LegacyDeliveredAshleyInput = {
  ownerId: string;
  conversationId: string;
  threadId?: string;
  reservationId: number;
  text: string;
  discordMessageIds: string[];
  nowMs?: number;
};

function existingMirror(db: DatabaseSync, input: LegacyDeliveredAshleyInput): ConversationEvidenceRecord | null {
  const rows = listConversationEvidence(db, input.conversationId, { limit: 1000 });
  return rows.find((row) =>
    row.role === "ashley" &&
    row.reservationId === input.reservationId,
  ) ?? rows.find((row) =>
    row.role === "ashley" &&
    row.discordMessageIds.some((id) => input.discordMessageIds.includes(id)),
  ) ?? null;
}

function ownerIdCollision(db: DatabaseSync, input: LegacyDeliveredAshleyInput): boolean {
  const rows = listConversationEvidence(db, input.conversationId, { limit: 1000 });
  return rows.some((row) =>
    row.role === "owner" &&
    row.discordMessageIds.some((id) => input.discordMessageIds.includes(id)),
  );
}

/** Mirror only receipt-backed legacy Ashley output into the sidecar evidence log. */
export function replicateLegacyDeliveredAshley(
  db: DatabaseSync,
  input: LegacyDeliveredAshleyInput,
): ConversationEvidenceRecord | null {
  if (!input.ownerId.trim() || !input.conversationId.trim() || !input.text.trim()) return null;
  const ids = [...new Set(input.discordMessageIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return null;
  const existing = existingMirror(db, input);
  if (existing) return existing;
  if (ownerIdCollision(db, input)) return null;
  return appendAshleyEvidence(db, {
    conversationId: input.conversationId,
    text: input.text,
    discordMessageIds: ids,
    nowMs: input.nowMs,
    architectureEpoch: "legacy",
    sourceStatus: "legacy_delivered",
    reservationId: input.reservationId,
    delivered: true,
  });
}

export const mirrorLegacyDeliveredAshley = replicateLegacyDeliveredAshley;
export const replicateLegacyDelivery = replicateLegacyDeliveredAshley;
