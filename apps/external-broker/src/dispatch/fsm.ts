export type DispatchState =
  | "drafted"
  | "policy_checked"
  | "policy_denied"
  | "reserved"
  | "dispatching"
  | "receipt_received"
  | "committed"
  | "partially_delivered"
  | "aborted"
  | "reconciliation_required"
  | "reconciliation_expired"
  | "outcome_unknown"
  | "cancelled"
  | "expired";

const TERMINAL_STATES = new Set<DispatchState>([
  "committed",
  "partially_delivered",
  "aborted",
  "cancelled",
  "expired",
  "policy_denied",
  "reconciliation_expired",
  "outcome_unknown",
]);

export function isTerminalState(state: DispatchState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransition(from: DispatchState, to: DispatchState): boolean {
  if (from === to) {
    return true;
  }
  switch (from) {
    case "drafted":
      return to === "policy_checked" || to === "policy_denied" || to === "expired";
    case "policy_checked":
      return (
        to === "reserved" ||
        to === "policy_denied" ||
        to === "expired" ||
        to === "dispatching"
      );
    case "reserved":
      return (
        to === "dispatching" ||
        to === "cancelled" ||
        to === "expired"
      );
    case "dispatching":
      return (
        to === "receipt_received" ||
        to === "aborted" ||
        to === "reconciliation_required"
      );
    case "receipt_received":
      return to === "committed" || to === "partially_delivered";
    case "reconciliation_required":
      return (
        to === "committed" ||
        to === "partially_delivered" ||
        to === "aborted" ||
        to === "reconciliation_expired" ||
        to === "outcome_unknown"
      );
    case "policy_denied":
    case "committed":
    case "partially_delivered":
    case "aborted":
    case "cancelled":
    case "expired":
    case "reconciliation_expired":
    case "outcome_unknown":
      return false;
    default: {
      const _exhaustive: never = from;
      return _exhaustive;
    }
  }
}

export function assertTransition(
  from: DispatchState,
  to: DispatchState,
): { ok: true } | { ok: false; reason: string } {
  if (!canTransition(from, to)) {
    return { ok: false, reason: `invalid_transition:${from}->${to}` };
  }
  return { ok: true };
}

export function transitionState(
  current: DispatchState,
  next: DispatchState,
): DispatchState {
  const check = assertTransition(current, next);
  if (!check.ok) {
    throw new Error(check.reason);
  }
  return next;
}
