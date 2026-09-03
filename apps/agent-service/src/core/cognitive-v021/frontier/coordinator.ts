import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { KernelDeps, OutboxDeliveryProjector } from "../types.js";
import { getCycle } from "../cycle/inbox.js";
import { runLiveCognitiveTurn } from "../dispatch/live.js";
import type { InboxEvent } from "../types.js";
import {
  claimDueDeferredFrontier,
  exhaustDeferredFrontier,
  getNextDueFrontierDelayMs,
  listDueDeferredFrontiers,
  resolveDeferredFrontier,
} from "./ledger.js";

export type FrontierCoordinatorOptions = {
  workerId?: string;
  pollMs?: number;
  projector?: OutboxDeliveryProjector;
  nowMs?: () => number;
};

export type FrontierCoordinatorHandle = {
  stop: () => void;
  pollNow: () => Promise<number>;
};

export function startFrontierCoordinator(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  deps: KernelDeps,
  options: FrontierCoordinatorOptions = {},
): FrontierCoordinatorHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pollMs = Math.max(50, Math.min(60_000, options.pollMs ?? 500));
  const workerId = options.workerId ?? `frontier-coordinator:${randomUUID()}`;
  const getNowMs = options.nowMs ?? (() => Date.now());

  async function processDueFrontiers(): Promise<number> {
    const nowMs = getNowMs();
    const dueList = listDueDeferredFrontiers(sidecar, nowMs);
    let processed = 0;

    for (const due of dueList) {
      if (stopped) break;
      const claim = claimDueDeferredFrontier(sidecar, due.frontierId, workerId, 30_000, nowMs);
      if (!claim.claimed) continue;
      processed += 1;

      const cycle = getCycle(sidecar, due.cycleId);
      if (!cycle || cycle.state === "silent" || cycle.state === "idle" || cycle.state === "sending") {
        exhaustDeferredFrontier(sidecar, due.frontierId, nowMs);
        continue;
      }

      const event: InboxEvent = {
        id: `frontier-wake:${due.frontierId}:${due.attemptCount + 1}`,
        conversationId: due.conversationId,
        wakeId: cycle.wakeId,
        kind: "frontier_wake",
        payload: {
          cycleId: due.cycleId,
          evidenceRowId: due.latestEvidenceRowId,
          frontierId: due.frontierId,
        },
        createdAtMs: due.createdAtMs,
        status: "claimed",
        claimToken: due.claimToken ?? `claim:${due.frontierId}`,
        workerId,
        leaseExpiresAtMs: due.leaseExpiresAtMs ?? (nowMs + 30_000),
        attemptCount: due.attemptCount + 1,
        claimedAtMs: nowMs,
        consumedAtMs: null,
        lastError: null,
      };

      try {
        const result = await runLiveCognitiveTurn({
          sidecar,
          nuclear,
          deps,
          projector: options.projector,
          event,
        });
        if (result.published) {
          resolveDeferredFrontier(sidecar, due.frontierId, getNowMs());
        } else if (!result.deferred) {
          exhaustDeferredFrontier(sidecar, due.frontierId, getNowMs());
        }
      } catch {
        exhaustDeferredFrontier(sidecar, due.frontierId, getNowMs());
      }
    }
    return processed;
  }

  function scheduleNext() {
    if (stopped) return;
    const nowMs = getNowMs();
    const nextDelay = getNextDueFrontierDelayMs(sidecar, nowMs);
    const delay = nextDelay != null ? Math.min(nextDelay, pollMs) : pollMs;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await processDueFrontiers();
      } finally {
        scheduleNext();
      }
    }, Math.max(25, delay));
  }

  scheduleNext();

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    pollNow: processDueFrontiers,
  };
}
