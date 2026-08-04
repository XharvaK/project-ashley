import { randomUUID } from "node:crypto";
import type { ActionKind } from "../crypto/types.js";
import type { DispatchState } from "../dispatch/fsm.js";

export interface FakeAdapterRequest {
  actionId: string;
  actionKind: ActionKind;
  destinationId: string;
  simulate?: FakeSimulation;
  idempotencyKey: string;
}

export type FakeSimulation =
  | "simulate_lost_receipt"
  | "simulate_duplicate_retry"
  | "simulate_reconcile"
  | "simulate_failure";

export interface FakeAdapterResult {
  state: DispatchState;
  providerReceiptId?: string;
  providerAttemptId: string;
  deliveredCount?: number;
  plannedCount?: number;
  terminalReason?: string;
  duplicateOfActionId?: string;
}

const priorAttempts = new Map<string, FakeAdapterResult>();

export function resetFakeAdapterState(): void {
  priorAttempts.clear();
}

export function runFakeLocalAdapter(request: FakeAdapterRequest): FakeAdapterResult {
  if (request.simulate === "simulate_duplicate_retry") {
    const prior = priorAttempts.get(request.idempotencyKey);
    if (prior) {
      return {
        ...prior,
        duplicateOfActionId: request.actionId,
        state: prior.state,
        providerAttemptId: prior.providerAttemptId,
      };
    }
  }

  const providerAttemptId = randomUUID();

  if (request.simulate === "simulate_failure") {
    const result: FakeAdapterResult = {
      state: "aborted",
      providerAttemptId,
      terminalReason: "provider_unreachable",
    };
    priorAttempts.set(request.idempotencyKey, result);
    return result;
  }

  if (request.simulate === "simulate_lost_receipt") {
    const result: FakeAdapterResult = {
      state: "reconciliation_required",
      providerAttemptId,
      terminalReason: "lost_receipt",
    };
    priorAttempts.set(request.idempotencyKey, result);
    return result;
  }

  if (request.simulate === "simulate_reconcile") {
    const result: FakeAdapterResult = {
      state: "committed",
      providerReceiptId: randomUUID(),
      providerAttemptId,
      deliveredCount: 1,
      plannedCount: 1,
      terminalReason: "reconciled",
    };
    priorAttempts.set(request.idempotencyKey, result);
    return result;
  }

  let result: FakeAdapterResult;
  switch (request.actionKind) {
    case "observe":
    case "read":
      result = {
        state: "committed",
        providerReceiptId: randomUUID(),
        providerAttemptId,
        deliveredCount: 0,
        plannedCount: 0,
        terminalReason: "observe_complete",
      };
      break;
    case "draft":
    case "prepare":
      result = {
        state: "committed",
        providerReceiptId: randomUUID(),
        providerAttemptId,
        deliveredCount: 0,
        plannedCount: 1,
        terminalReason: "draft_saved",
      };
      break;
    case "send_private":
    case "send_public":
      result = {
        state: "committed",
        providerReceiptId: randomUUID(),
        providerAttemptId,
        deliveredCount: 1,
        plannedCount: 1,
        terminalReason: "sent",
      };
      break;
    default: {
      const _exhaustive: never = request.actionKind;
      result = {
        state: "aborted",
        providerAttemptId,
        terminalReason: `unsupported_action:${String(_exhaustive)}`,
      };
    }
  }

  priorAttempts.set(request.idempotencyKey, result);
  return result;
}
