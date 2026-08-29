import type { DatabaseSync } from "node:sqlite";
import {
  claimInboxEvent,
  markInboxConsumed,
  markInboxFailed,
} from "./inbox.js";
import type { InboxEvent } from "../types.js";

export function claimNextInboxEvent(
  db: DatabaseSync,
  input: { workerId: string; conversationId?: string; nowMs?: number; leaseMs?: number } ,
): InboxEvent | null {
  return claimInboxEvent(db, input);
}

export function consumeInboxEvent(
  db: DatabaseSync,
  event: InboxEvent,
  handler: (event: InboxEvent) => void | Promise<void>,
): void | Promise<void> {
  const result = handler(event);
  if (result && typeof (result as Promise<void>).then === "function") {
    return (async () => {
      try {
        await result;
        if (!markInboxConsumed(db, event.id, event.claimToken ?? undefined)) {
          throw new Error("inbox_consume_claim_lost");
        }
      } catch (error) {
        markInboxFailed(db, event.id, error instanceof Error ? error.message : String(error), {
          retryable: true,
          claimToken: event.claimToken ?? undefined,
        });
        throw error;
      }
    })();
  }
  if (!markInboxConsumed(db, event.id, event.claimToken ?? undefined)) throw new Error("inbox_consume_claim_lost");
}
