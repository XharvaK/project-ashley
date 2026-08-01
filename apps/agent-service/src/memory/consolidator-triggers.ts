import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";

export const FACT_MIN_CONFIDENCE = 0.6;

export type ConversationTempo = "rapid" | "normal" | "slow";

export function estimateConversationTempo(
  db: DatabaseSync,
  ownerId: string,
): ConversationTempo {
  const recent = db
    .prepare(
      `SELECT ts FROM mem_messages
       WHERE owner_id = ? ORDER BY id DESC LIMIT 6`,
    )
    .all(ownerId) as Array<{ ts: string }>;

  if (recent.length < 3) return "normal";

  const gaps: number[] = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const gap =
      new Date(recent[i]!.ts).getTime() - new Date(recent[i + 1]!.ts).getTime();
    gaps.push(gap);
  }
  const avgGapMin =
    gaps.reduce((a, b) => a + b, 0) / gaps.length / 60_000;

  // Sub-second average usually means bulk insert / clock collision, not rapid chat.
  if (avgGapMin < 0.05) return "normal";
  if (avgGapMin < 1) return "rapid";
  if (avgGapMin > 10) return "slow";
  return "normal";
}

export function shouldEnqueueFacts(
  assistantCount: number,
  everyN: number,
  role: "user" | "assistant",
  db?: DatabaseSync,
  ownerId?: string,
): boolean {
  if (role !== "assistant" || assistantCount <= 0) return false;

  let interval = everyN > 0 ? everyN : env.memoryFactEveryN;
  if (db && ownerId) {
    const tempo = estimateConversationTempo(db, ownerId);
    interval = tempo === "rapid" ? 8 : tempo === "slow" ? 2 : interval;
  }

  return interval > 0 && assistantCount % interval === 0;
}

export function shouldEnqueueSummary(
  count: number,
  tokenSum: number,
  maxMessages: number,
  maxTokens: number,
): boolean {
  return count >= maxMessages || tokenSum >= maxTokens;
}

/**
 * How many of the oldest hot messages a summary may consume.
 * A token-triggered summary over a few long messages would otherwise swallow the
 * whole window and take her recent rhythm with it, so the newest `residualFloor`
 * messages are never eligible.
 */
export function summaryBatchSize(
  totalSinceCutoff: number,
  batch: number,
  residualFloor: number,
): number {
  return Math.min(batch, totalSinceCutoff - residualFloor);
}
