export const FACT_MIN_CONFIDENCE = 0.6;

export function shouldEnqueueFacts(
  assistantCount: number,
  everyN: number,
  role: "user" | "assistant",
): boolean {
  return (
    role === "assistant" &&
    assistantCount > 0 &&
    everyN > 0 &&
    assistantCount % everyN === 0
  );
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
