/**
 * Gaps between her bubbles only. Nothing is added before the first one, because
 * Mistral already spends 1 to 5 seconds there and a human would have been typing
 * through it.
 */
const FAST_MS = 20_000;
const SLOW_MS = 120_000;

export const PACE_BUDGET_MS = 2500;

type Band = { min: number; max: number };

const FAST_BAND: Band = { min: 250, max: 650 };
const MEDIUM_BAND: Band = { min: 600, max: 1100 };
const SLOW_BAND: Band = { min: 1000, max: 1600 };

function band(tempoGapMs: number | null): Band {
  if (tempoGapMs === null) return MEDIUM_BAND;
  if (tempoGapMs <= FAST_MS) return FAST_BAND;
  if (tempoGapMs <= SLOW_MS) return MEDIUM_BAND;
  return SLOW_BAND;
}

/**
 * `tempoGapMs` is how long Doc took to send this message after his previous one.
 * Rapid-fire from him means rapid-fire back; a message after an hour gets the
 * pace of someone who was doing something else.
 */
export function bubbleDelayMs(params: {
  tempoGapMs: number | null;
  chars: number;
  remainingBudgetMs: number;
  rand?: () => number;
}): number {
  if (params.remainingBudgetMs <= 0) return 0;
  const rand = params.rand ?? Math.random;
  const { min, max } = band(params.tempoGapMs);
  const jittered = min + rand() * (max - min);
  // A longer bubble would have taken longer to type.
  const typing = Math.min(params.chars * 4, 500);
  return Math.round(Math.min(jittered + typing, params.remainingBudgetMs));
}

export function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

/** Per-channel record of how fast Doc is going. */
export class TempoTracker {
  private readonly last = new Map<string, number>();

  /** Gap since his previous message, then remembers this one. */
  mark(channelId: string, now = Date.now()): number | null {
    const prev = this.last.get(channelId) ?? null;
    this.last.set(channelId, now);
    return prev === null ? null : now - prev;
  }
}

export const tempoTracker = new TempoTracker();
