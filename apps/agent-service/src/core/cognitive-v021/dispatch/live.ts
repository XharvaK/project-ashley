import type { DatabaseSync } from "node:sqlite";
import {
  type CycleRecord,
  type InboxEvent,
  type KernelDeps,
  type KernelRunResult,
  type OutboxDeliveryProjector,
  type PrivateBudgetReservation,
  type WakeRecord,
} from "../types.js";
import { runCognitiveCycle } from "../thought/run.js";
import { createOutboxProjector } from "../delivery/outbox-projector.js";
import { getCycle } from "../cycle/inbox.js";
import { getWake } from "../wake/ledger.js";
import {
  getPrivateReservation,
  getPrivateReservationForWake,
} from "../private-budget/ledger.js";
import { getDeferredFrontier } from "../frontier/ledger.js";

export type LiveCognitiveTurnInput = {
  sidecar: DatabaseSync;
  nuclear: DatabaseSync;
  event: InboxEvent;
  deps: KernelDeps;
  projector?: OutboxDeliveryProjector;
};

/**
 * Sol R2.1 Amendment C (exact-lineage): Authorize continuation provider dispatch for deferred reactive frontiers.
 * Execution requires ALL of:
 * 1. event kind is frontier_wake
 * 2. payload.frontierId and payload.cycleId are present
 * 3. deferred frontier exists in state 'running' (state 'waiting' does NOT authorize execution)
 * 4. frontier.claimToken is non-empty and matches event.claimToken exactly
 * 5. frontier.leaseExpiresAtMs is non-null and matches event.leaseExpiresAtMs exactly
 * 6. lease has not expired (leaseExpiresAtMs > current authorization time)
 * 7. EXACT LINEAGE:
 *    wake.wakeId === event.wakeId
 *    reservation.wakeId === wake.wakeId
 *    cycle.wakeId === wake.wakeId
 *    wake.cycleId === cycle.cycleId
 *    payload.cycleId === cycle.cycleId
 *    frontier.cycleId === cycle.cycleId
 *    frontier.generation === cycle.generation
 *    frontier.conversationId === event.conversationId
 *    cycle.conversationId === event.conversationId
 *    reservation.conversationId === event.conversationId
 */
export function isAuthorizedDeferredFrontierContinuation(
  sidecar: DatabaseSync,
  event: InboxEvent,
  wake: WakeRecord,
  reservation: PrivateBudgetReservation,
  cycle: CycleRecord,
): boolean {
  if (event.kind !== "frontier_wake") return false;
  const payload = typeof event.payload === "object" && event.payload !== null && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
  const frontierId = typeof payload.frontierId === "string" ? payload.frontierId : null;
  if (!frontierId) return false;
  const payloadCycleId = typeof payload.cycleId === "string" ? payload.cycleId : null;
  if (!payloadCycleId) return false;
  const frontier = getDeferredFrontier(sidecar, frontierId);
  if (!frontier) return false;
  if (frontier.state !== "running") return false;
  if (!frontier.claimToken || event.claimToken == null || event.claimToken !== frontier.claimToken) return false;
  if (frontier.leaseExpiresAtMs == null || event.leaseExpiresAtMs == null || event.leaseExpiresAtMs !== frontier.leaseExpiresAtMs) return false;
  if (frontier.leaseExpiresAtMs <= Date.now()) return false;
  // Exact lineage: wake chain
  if (wake.wakeId !== event.wakeId) return false;
  if (reservation.wakeId !== wake.wakeId) return false;
  if (cycle.wakeId !== wake.wakeId) return false;
  // wake -> cycle binding
  if (wake.cycleId !== cycle.cycleId) return false;
  // payload cycleId must match cycle
  if (payloadCycleId !== cycle.cycleId) return false;
  // frontier must belong to the exact cycle
  if (frontier.cycleId !== cycle.cycleId) return false;
  if (frontier.generation !== cycle.generation) return false;
  // conversation identity across all four objects
  if (frontier.conversationId !== event.conversationId) return false;
  if (cycle.conversationId !== event.conversationId) return false;
  if (reservation.conversationId !== event.conversationId) return false;
  return true;
}

function withProjector(
  deps: KernelDeps,
  projector: OutboxDeliveryProjector | undefined,
): KernelDeps {
  if (!projector) return { ...deps, origin: "live" };
  return {
    ...deps,
    origin: "live",
    projectOutbox: (outboxId) => projector.project(outboxId),
    projectSystemNotice: (noticeId) => projector.projectSystem(noticeId),
  };
}

/**
 * Run one admitted inbox event through the v0.2.1 kernel and then through the
 * nuclear delivery projector. This function has no legacy `/chat/text` path.
 */
export async function runLiveCognitiveTurn(
  input: LiveCognitiveTurnInput,
): Promise<KernelRunResult>;
export async function runLiveCognitiveTurn(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  event: InboxEvent,
  deps: KernelDeps,
): Promise<KernelRunResult>;
export async function runLiveCognitiveTurn(
  inputOrSidecar: LiveCognitiveTurnInput | DatabaseSync,
  nuclear?: DatabaseSync,
  event?: InboxEvent,
  deps?: KernelDeps,
): Promise<KernelRunResult> {
  const input: LiveCognitiveTurnInput = inputOrSidecar instanceof Object &&
    "sidecar" in inputOrSidecar
    ? inputOrSidecar as LiveCognitiveTurnInput
    : {
        sidecar: inputOrSidecar as DatabaseSync,
        nuclear: nuclear!,
        event: event!,
        deps: deps!,
      };
  if (!input.sidecar || !input.nuclear || !input.event || !input.deps) {
    throw new Error("live_cognitive_turn_input_required");
  }
  if (!input.event.wakeId) throw new Error("wake_required");
  const wake = getWake(input.sidecar, input.event.wakeId);
  if (!wake) throw new Error("wake_missing");
  const payload = typeof input.event.payload === "object" && input.event.payload !== null && !Array.isArray(input.event.payload)
    ? input.event.payload as Record<string, unknown>
    : {};
  const cycleId = typeof payload.cycleId === "string" ? payload.cycleId : wake.cycleId;
  const cycle = getCycle(input.sidecar, cycleId);
  if (!cycle || cycle.wakeId !== wake.wakeId) throw new Error("wake_cycle_conflict");
  if (wake.state === "terminal" || wake.state === "reconciling") throw new Error("wake_not_dispatchable");

  const explicitReservationId = typeof payload.privateBudgetReservationId === "string"
    ? payload.privateBudgetReservationId
    : null;
  const reservation = explicitReservationId
    ? getPrivateReservation(input.sidecar, explicitReservationId)
    : getPrivateReservationForWake(input.sidecar, wake.wakeId);

  const isPrivateTrigger = cycle.triggerKind === "idle_opportunity" ||
    cycle.triggerKind === "subscription_item" ||
    cycle.triggerKind === "future_trigger_due";

  if (!reservation) {
    if (explicitReservationId || isPrivateTrigger) {
      throw new Error("private_budget_reservation_missing");
    }
  }

  const privateBudgetBinding = reservation
    ? (() => {
        if (reservation.wakeId !== wake.wakeId || reservation.conversationId !== input.event.conversationId) {
          throw new Error("private_budget_reservation_identity_conflict");
        }
        if (reservation.state === "committed") {
          if (!isAuthorizedDeferredFrontierContinuation(input.sidecar, input.event, wake, reservation, cycle)) {
            throw new Error("private_budget_reservation_not_dispatchable");
          }
        } else if (reservation.state !== "held") {
          throw new Error("private_budget_reservation_not_dispatchable");
        }
        return {
          sidecar: input.sidecar,
          reservationId: reservation.reservationId,
          wakeId: wake.wakeId,
          conversationId: input.event.conversationId,
        };
      })()
    : undefined;
  const projector = input.projector ?? createOutboxProjector(input.sidecar, input.nuclear);
  return runCognitiveCycle(
    input.sidecar,
    input.nuclear,
    input.event,
    withProjector(input.deps, projector),
    { privateBudgetBinding },
  );
}

/** Factory form used by the durable inbox worker. */
export function createLiveCognitiveDispatcher(input: {
  sidecar: DatabaseSync;
  nuclear: DatabaseSync;
  deps: KernelDeps;
  projector?: OutboxDeliveryProjector;
}): (event: InboxEvent) => Promise<KernelRunResult> {
  return (event) => runLiveCognitiveTurn({ ...input, event });
}
