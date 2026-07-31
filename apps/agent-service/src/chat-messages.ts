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
  /** Doc-supplied page body. Same non-system rule as searchContext. */
  pageContext?: string | null;
}): ChatMessage[] {
  // Empty assistant/user rows poison Mistral (400 invalid_request_assistant_message).
  const hot = params.hot.filter((m) => m.content.trim().length > 0);
  const last = hot[hot.length - 1];
  if (last?.role === "user" && last.content.trim() === params.message.trim()) {
    hot.pop();
  }

  // Images ride on the current turn only. Discord CDN links expire, so replaying
  // them from history would eventually fail the whole request.
  const current: ChatMessage = { role: "user", content: params.message };
  if (params.imageUrls?.length) current.imageUrls = params.imageUrls;

  const external: ChatMessage[] = [];
  if (params.pageContext) {
    external.push({ role: "user", content: params.pageContext });
  }
  if (params.searchContext) {
    external.push({ role: "user", content: params.searchContext });
  }

  return [
    { role: "system", content: params.system },
    ...hot.map((m) => ({ role: m.role, content: m.content })),
    ...external,
    current,
  ];
}
