/**
 * Slice-2 durable-cognition eligibility.
 *
 * Conservative explicit opt-in bridge only. This is NOT the final semantic
 * durable-work router. No second model call. No generic operational-language
 * detector. Ordinary chat stays synchronous Thought.
 */
export const DURABLE_COGNITION_ACK_TEXT =
  "I'll work on that in my own time. No sandbox operation is admitted yet.";

const EXPLICIT_BOUNDED_OPERATION_INVOCATION =
  /\busing the bounded operation capability\b/i;
const EXPLICIT_DURABLE_BOUNDED_OPERATION = /\bdurable bounded operation\b/i;
const EXPLICIT_DURABLE_WORK_MARKER = /^\s*\[durable-work\](?:\s|$)/i;

export function isExplicitDurableCognitionRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    EXPLICIT_BOUNDED_OPERATION_INVOCATION.test(trimmed) ||
    EXPLICIT_DURABLE_BOUNDED_OPERATION.test(trimmed) ||
    EXPLICIT_DURABLE_WORK_MARKER.test(trimmed)
  );
}
