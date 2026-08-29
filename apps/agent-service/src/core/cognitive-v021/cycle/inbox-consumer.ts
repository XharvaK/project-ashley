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

export type InboxConsumerHandler = (event: InboxEvent) => void | Promise<void>;

export type InboxConsumerOptions = {
  workerId: string;
  handler: InboxConsumerHandler;
  conversationId?: string;
  nowMs?: () => number;
  leaseMs?: number;
  pollMs?: number;
  onError?: (error: unknown, event: InboxEvent | null) => void;
};

export type InboxConsumerTick = {
  outcome: "idle" | "consumed" | "failed";
  eventId?: string;
  error?: string;
};

/** Claim one pending, retryable, or expired event and settle its lease. */
export async function consumeNextInboxEvent(
  db: DatabaseSync,
  options: InboxConsumerOptions,
): Promise<InboxConsumerTick> {
  const event = claimNextInboxEvent(db, {
    workerId: options.workerId,
    conversationId: options.conversationId,
    nowMs: options.nowMs?.(),
    leaseMs: options.leaseMs,
  });
  if (!event) return { outcome: "idle" };
  try {
    await consumeInboxEvent(db, event, options.handler);
    return { outcome: "consumed", eventId: event.id };
  } catch (error) {
    options.onError?.(error, event);
    return {
      outcome: "failed",
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type InboxConsumerHandle = {
  stop: () => void;
  done: Promise<void>;
};

/** Start a bounded polling loop. Startup recovery is provided by claimNextInboxEvent's lease query. */
export function startInboxConsumer(
  db: DatabaseSync,
  options: InboxConsumerOptions,
): InboxConsumerHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let wake: (() => void) | null = null;
  const delay = Math.max(1, Math.min(60_000, options.pollMs ?? 250));
  const done = (async () => {
    while (!stopped) {
      const tick = await consumeNextInboxEvent(db, options);
      if (stopped) break;
      if (tick.outcome !== "consumed") {
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(() => {
            timer = null;
            wake = null;
            resolve();
          }, delay);
        });
      }
    }
  })();
  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      wake?.();
      wake = null;
    },
    done,
  };
}
