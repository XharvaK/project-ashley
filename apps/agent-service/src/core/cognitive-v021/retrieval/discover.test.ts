import { describe, expect, it } from "vitest";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { openTestSidecar } from "../test-support.js";
import { retrieveCandidates, tokenizeForDiscovery } from "./discover.js";

describe("v0.2.1 lexical discovery fallback", () => {
  it("keeps short trigger terms used by continuity corrections", () => {
    expect(tokenizeForDiscovery("Have you heard about HY3?")).toContain("hy3");
    expect(tokenizeForDiscovery("it's an LLM")).toContain("llm");
    expect(tokenizeForDiscovery("Qwen")).toContain("qwen");
  });

  it("searches the conversation log when assertion keys miss", () => {
    const db = openTestSidecar();
    try {
      appendOwnerUtterance(db, { conversationId: "thread-1", text: "I meant HY3", discordMessageIds: ["d1"], nowMs: 1 });
      const result = retrieveCandidates(db, {
        conversationId: "thread-1",
        request: {
          triggerTerms: ["meant", "hy3"],
          workingContextTopics: [],
          assertionKeys: ["hy4"],
          includeLogSearch: true,
        },
      });
      expect(result.request.includeLogSearch).toBe(true);
      expect(result.hits.some((hit) => hit.kind === "lexical" || hit.kind === "log")).toBe(true);
      expect(result.hits.every((hit) => ["conversation_log", "live_memory", "quarantined_memory"].includes(hit.sourceStore))).toBe(true);
    } finally {
      db.close();
    }
  });
});
