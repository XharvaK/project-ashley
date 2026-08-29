import { describe, expect, it } from "vitest";
import { appendOwnerUtterance, listConversationEvidence } from "../evidence/conversation-log.js";
import { openTestSidecar } from "../test-support.js";
import { replicateLegacyDeliveredAshley } from "./replicator.js";

describe("v0.2.1 legacy delivery replicator", () => {
  it("mirrors delivered Ashley output idempotently", () => {
    const sidecar = openTestSidecar();
    const first = replicateLegacyDeliveredAshley(sidecar, {
      ownerId: "doc", conversationId: "thread-legacy", threadId: "thread-legacy",
      reservationId: 42, text: "delivered legacy reply", discordMessageIds: ["ashley-42"], nowMs: 10,
    });
    const second = replicateLegacyDeliveredAshley(sidecar, {
      ownerId: "doc", conversationId: "thread-legacy", threadId: "thread-legacy",
      reservationId: 42, text: "delivered legacy reply", discordMessageIds: ["ashley-42"], nowMs: 11,
    });
    expect(first?.role).toBe("ashley");
    expect(second?.rowId).toBe(first?.rowId);
    expect(listConversationEvidence(sidecar, "thread-legacy")).toHaveLength(1);
    sidecar.close();
  });

  it("does not turn owner ingress into an Ashley mirror", () => {
    const sidecar = openTestSidecar();
    appendOwnerUtterance(sidecar, {
      conversationId: "thread-legacy", text: "owner ingress", discordMessageIds: ["same-discord-id"], nowMs: 1,
    });
    const result = replicateLegacyDeliveredAshley(sidecar, {
      ownerId: "doc", conversationId: "thread-legacy", threadId: "thread-legacy",
      reservationId: 43, text: "should not duplicate owner ingress", discordMessageIds: ["same-discord-id"], nowMs: 2,
    });
    expect(result).toBeNull();
    expect(listConversationEvidence(sidecar, "thread-legacy")).toHaveLength(1);
    sidecar.close();
  });
});
