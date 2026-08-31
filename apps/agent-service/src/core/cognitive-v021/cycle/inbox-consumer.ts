import type { DatabaseSync } from "node:sqlite";
import {
  claimInboxEvent,
  getInboxEvent,
} from "./inbox.js";
import {
  getOpenDurableAttempt,
  settleDurableAttempt,
  type DurableSettlementOutcome,
} from "../retry/ledger.js";
import type { HandlerResult, InboxEvent } from "../types.js";

export type InboxConsumerHandler = (event: InboxEvent) => void | HandlerResult | Promise<void | HandlerResult>;

export function claimNextInboxEvent(
  db: DatabaseSync,
  input: { workerId: string; conversationId?: string; nowMs?: number; leaseMs?: number },
): InboxEvent | null {
  return claimInboxEvent(db, input);
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function settledOutcomeOrThrow(
  db: DatabaseSync,
  event: InboxEvent,
  result: HandlerResult,
  nowMs: number,
): DurableSettlementOutcome {
  const attempt = event.durableAttemptId
    ? getOpenDurableAttempt(db, event.id)
    : getOpenDurableAttempt(db, event.id);
  if (!attempt || (event.durableAttemptId && attempt.attemptId !== event.durableAttemptId)) {
    throw new Error("inbox_durable_attempt_missing");
  }
  return settleDurableAttempt(db, {
    eventId: event.id,
    attemptId: attempt.attemptId,
    claimToken: event.claimToken ?? attempt.claimToken,
    result,
    nowMs,
  });
}

/** Run a handler and settle the durable attempt. Exceptions are outcome-unknown. */
export async function consumeInboxEvent(
  db: DatabaseSync,
  event: InboxEvent,
  handler: InboxConsumerHandler,
  nowMs = Date.now(),
): Promise<DurableSettlementOutcome> {
  const attempt = getOpenDurableAttempt(db, event.id);
  if (!attempt || (event.durableAttemptId && attempt.attemptId !== event.durableAttemptId)) {
    throw new Error("inbox_durable_attempt_missing");
  }
  try {
    const result = await handler(event);
    return settledOutcomeOrThrow(db, event, result ?? { kind: "completed" }, nowMs);
  } catch (error) {
    const currentAttempt = getOpenDurableAttempt(db, event.id);
    if (currentAttempt) {
      settleDurableAttempt(db, {
        eventId: event.id,
        attemptId: currentAttempt.attemptId,
        claimToken: event.claimToken ?? currentAttempt.claimToken,
        result: {
          kind: "outcome_unknown",
          operationId: event.id,
          errorCode: errorCode(error),
        },
        nowMs,
      });
    }
    throw error;
  }
}

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

/** Claim one fair eligible event and settle its durable attempt. */
export async function consumeNextInboxEvent(
  db: DatabaseSync,
  options: InboxConsumerOptions,
): Promise<InboxConsumerTick> {
  const nowMs = options.nowMs?.() ?? Date.now();
  const event = claimNextInboxEvent(db, {
    workerId: options.workerId,
    conversationId: options.conversationId,
    nowMs,
    leaseMs: options.leaseMs,
  });
  if (!event) return { outcome: "idle" };
  try {
    const settled = await consumeInboxEvent(db, event, options.handler, nowMs);
    if (settled.kind === "completed") return { outcome: "consumed", eventId: event.id };
    return { outcome: "failed", eventId: event.id, error: settled.kind === "terminal" ? settled.reason : settled.kind };
  } catch (error) {
    options.onError?.(error, getInboxEvent(db, event.id) ?? event);
    return {
      outcome: "failed",
      eventId: event.id,
      error: errorCode(error),
    };
  }
}

export type InboxConsumerHandle = {
  stop: () => void;
  done: Promise<void>;
};

/** Start a bounded polling loop. Retry timing remains in the durable ledger. */
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
