/**
 * Shared concurrency gate for all Mistral traffic. Interactive (live chat)
 * always prefers a free slot over background work so curiosity ticks
 * cannot starve a reply.
 */

export type Lane = "interactive" | "background";

type Waiter = {
  lane: Lane;
  resolve: () => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

const MAX_CONCURRENCY = 2;
const INTERACTIVE_RESERVED = 1;

let inFlight = 0;
let interactiveInFlight = 0;
const queue: Waiter[] = [];

function canStart(lane: Lane): boolean {
  if (inFlight >= MAX_CONCURRENCY) return false;
  if (lane === "interactive") return true;
  // Keep one slot free for interactive when possible.
  const backgroundSlots = MAX_CONCURRENCY - INTERACTIVE_RESERVED;
  const backgroundInFlight = inFlight - interactiveInFlight;
  return backgroundInFlight < backgroundSlots;
}

function pump(): void {
  while (queue.length > 0) {
    const nextInteractive = queue.findIndex((w) => w.lane === "interactive");
    const idx =
      nextInteractive >= 0 && canStart("interactive")
        ? nextInteractive
        : canStart(queue[0]!.lane)
          ? 0
          : -1;
    if (idx < 0) return;
    const [waiter] = queue.splice(idx, 1);
    if (!waiter) return;
    if (waiter.signal?.aborted) {
      waiter.reject(new Error("AbortError"));
      continue;
    }
    inFlight += 1;
    if (waiter.lane === "interactive") interactiveInFlight += 1;
    if (waiter.onAbort && waiter.signal) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
    waiter.resolve();
  }
}

export async function acquireLane(
  lane: Lane,
  signal?: AbortSignal,
): Promise<() => void> {
  if (signal?.aborted) {
    const err = new Error("Aborted");
    err.name = "AbortError";
    throw err;
  }

  if (canStart(lane)) {
    inFlight += 1;
    if (lane === "interactive") interactiveInFlight += 1;
  } else {
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { lane, resolve, reject, signal };
      const onAbort = () => {
        const i = queue.indexOf(waiter);
        if (i >= 0) queue.splice(i, 1);
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };
      waiter.onAbort = onAbort;
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      queue.push(waiter);
    });
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight = Math.max(0, inFlight - 1);
    if (lane === "interactive") {
      interactiveInFlight = Math.max(0, interactiveInFlight - 1);
    }
    pump();
  };
}

/** Test helpers */
export function limiterStats(): {
  inFlight: number;
  interactiveInFlight: number;
  queued: number;
} {
  return { inFlight, interactiveInFlight, queued: queue.length };
}

export function resetLimiterForTests(): void {
  inFlight = 0;
  interactiveInFlight = 0;
  queue.length = 0;
}
