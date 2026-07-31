import type { ChatMessage } from "./mistral-client.js";
import type { HotTurn } from "./memory/hot-filter.js";

/**
 * Assemble the wire messages for one turn.
 *
 * The current turn is persisted before hot history is read, so it can arrive
 * here twice. Two identical user turns with no assistant between them push the
 * model toward over-acknowledgment and stiff completeness, so the duplicate is
 * dropped structurally rather than relying on every caller to exclude the row.
 */
export function buildChatMessages(params: {
  system: string;
  hot: HotTurn[];
  message: string;
  imageUrls?: string[];
  /** Fetched web text. Never in the system role: it is data, not instructions. */
  searchContext?: string | null;
}): ChatMessage[] {
  const hot = [...params.hot];
  const last = hot[hot.length - 1];
  if (last?.role === "user" && last.content.trim() === params.message.trim()) {
    hot.pop();
  }

  // Images ride on the current turn only. Discord CDN links expire, so replaying
  // them from history would eventually fail the whole request.
  const current: ChatMessage = { role: "user", content: params.message };
  if (params.imageUrls?.length) current.imageUrls = params.imageUrls;

  return [
    { role: "system", content: params.system },
    ...hot.map((m) => ({ role: m.role, content: m.content })),
    ...(params.searchContext
      ? [{ role: "user" as const, content: params.searchContext }]
      : []),
    current,
  ];
}
