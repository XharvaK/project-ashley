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
