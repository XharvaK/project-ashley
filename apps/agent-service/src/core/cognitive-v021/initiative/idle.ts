import type { DatabaseSync } from "node:sqlite";
import { getCycle } from "../cycle/inbox.js";
import { listOccupancy } from "../concerns/occupancy.js";
import { fireDueTriggers } from "./future-triggers.js";
import { collectSubscriptionObservations, listObservationSubscriptions, type SubscriptionItem } from "../observation/subscriptions.js";
import { getActiveDeferredFrontier } from "../frontier/ledger.js";
import {
  type CycleRecord,
  type FutureTrigger,
  type InboxEvent,
  type KernelRunResult,
  type LearnedSelfSlice,
  type MindOccupancy,
  type Observation,
} from "../types.js";
import { admitWake, getWake } from "../wake/ledger.js";
import { occurrenceIdFor } from "../wake/identity.js";
import {
  PRIVATE_THOUGHT_POLICY_ID,
  getPrivateReservation,
  getPrivateBudgetProjection,
  markPrivateReservationUnknown,
  reservePrivateThought,
} from "../private-budget/ledger.js";

const GROUNDED_STATUSES = new Set(["active", "investigating", "waiting_for_evidence"]);
type IdleRunnerResult = Partial<KernelRunResult> & {
  speechMode?: "none" | "draft";
  settlement?: { speech?: { mode?: "none" | "draft" } };
  dormant?: boolean;
};

export type IdleThoughtContext = {
  sidecar: DatabaseSync;
  cycle: CycleRecord;
  wakeId: string;
  event: InboxEvent | null;
  trigger: { kind: "idle_opportunity" | "subscription_item" | "future_trigger_due"; ref: string };
  occupancy: MindOccupancy[];
  observations: Observation[];
  dueTriggers: FutureTrigger[];
  privateBudgetReservation: import("../types.js").PrivateBudgetReservation;
};

export type IdleThoughtRunner = (input: IdleThoughtContext) => Promise<IdleRunnerResult> | IdleRunnerResult;

export type IdleTickOptions = {
  conversationId?: string;
  occupantId?: string;
  authorityEpoch?: number;
  nowMs?: number;
  learnedSelfSlice?: LearnedSelfSlice;
  subscriptionItems?: Array<SubscriptionItem | string>;
  curiosityItems?: Array<SubscriptionItem | string>;
  items?: Array<SubscriptionItem | string>;
  runThought?: IdleThoughtRunner;
  thought?: IdleThoughtRunner;
  thoughtRunner?: IdleThoughtRunner;
  /** Policy identity is configuration; capacity remains ledger-owned. */
  privateBudgetPolicyId?: string;
};

export type IdleTickReason =
  | "empty_house"
  | "active_frontier"
  | "occupancy_unreachable"
  | "wake_cancelled"
  | "wake_stale"
  | "private_compute_budget"
  | "private_compute_clock_reconciliation"
  | "private_compute_concurrent"
  | "thought_runner_missing"
  | "thought_failed";

export type IdleTickResult = {
  conversationId: string | null;
  eligible: boolean;
  reason: IdleTickReason | null;
  thoughtModelAttempts: number;
  acceptedSettlements: number;
  thoughtCalls: number;
  cycleId: string | null;
  observations: Observation[];
  firedTriggers: FutureTrigger[];
  suppressedTriggers: FutureTrigger[];
  dormant: boolean;
  /** Compatibility additions for the W9 idle truth boundary. */
  idleEligible?: boolean;
  semanticAbsenceClaim?: "yes" | "no";
};

/** Scheduler-only overlap guard. It is not a budget counter or capacity source. */
const activePrivateCalls = new Set<string>();

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function groundedOccupancy(db: DatabaseSync, conversationId: string): MindOccupancy[] {
  try {
    return listOccupancy(db, conversationId).filter((item) => GROUNDED_STATUSES.has(item.status));
  } catch (error) {
    throw occupancyUnreachable(error);
  }
}

function occupancyUnreachable(cause: unknown): Error {
  const error = new Error("idle_occupancy_unreachable");
  Object.defineProperty(error, "cause", { value: cause, enumerable: false });
  return error;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.toLocaleLowerCase() : String(error).toLocaleLowerCase();
}

function isOccupancyUnreachable(error: unknown): boolean {
  const message = errorText(error);
  return message === "idle_occupancy_unreachable"
    || message.includes("mind_occupancy")
    || message.includes("database is locked")
    || message.includes("database table is locked")
    || message.includes("sqlite_busy");
}

function logOccupancyUnreachable(conversationId: string | null, error: unknown): void {
  console.warn("[cognitive-v021] idle_occupancy_unreachable", {
    conversationId,
    disposition: "UNREACHABLE",
    canonicalStore: "cognitive-v021.db:mind_occupancy",
    error: errorText(error),
  });
}

function runner(options: IdleTickOptions): IdleThoughtRunner | undefined {
  return options.runThought ?? options.thought ?? options.thoughtRunner;
}

function inputItems(options: IdleTickOptions): Array<SubscriptionItem | string> {
  return [...(options.subscriptionItems ?? []), ...(options.curiosityItems ?? []), ...(options.items ?? [])];
}

function conversationCandidates(
  db: DatabaseSync,
  options: IdleTickOptions,
  firedTriggers: FutureTrigger[],
  items: Array<SubscriptionItem | string>,
): string[] {
  if (options.conversationId) return [options.conversationId];
  const ids = new Set<string>(firedTriggers.map((trigger) => trigger.conversationId));
  try {
    db.prepare(
      "SELECT DISTINCT conversation_id FROM mind_occupancy WHERE status IN ('active', 'investigating', 'waiting_for_evidence')",
    ).all().forEach((row) => {
      if (typeof row === "object" && row !== null && typeof (row as { conversation_id?: unknown }).conversation_id === "string") ids.add((row as { conversation_id: string }).conversation_id);
    });
  } catch (error) {
    throw occupancyUnreachable(error);
  }
  if (items.length > 0) {
    for (const subscription of listObservationSubscriptions(db)) ids.add(subscription.conversationId);
  }
  return [...ids].sort();
}

function remapObservation(observation: Observation, cycle: CycleRecord): Observation {
  return { ...observation, cycleId: cycle.cycleId, generation: cycle.generation };
}

function emptyResult(
  conversationId: string | null,
  reason: IdleTickReason,
  firedTriggers: FutureTrigger[],
  suppressedTriggers: FutureTrigger[],
): IdleTickResult {
  return {
    conversationId,
    eligible: false,
    idleEligible: false,
    reason,
    thoughtModelAttempts: 0,
    acceptedSettlements: 0,
    thoughtCalls: 0,
    cycleId: null,
    observations: [],
    firedTriggers,
    suppressedTriggers,
    dormant: false,
    semanticAbsenceClaim: reason === "empty_house" ? "yes" : "no",
  };
}

function settleUnsettledPrivateReservation(db: DatabaseSync, reservationId: string, nowMs: number): void {
  const current = getPrivateReservation(db, reservationId);
  if (current?.state === "held") markPrivateReservationUnknown(db, reservationId, { nowMs });
}

async function tickConversation(
  db: DatabaseSync,
  conversationId: string,
  options: IdleTickOptions,
  firedTriggers: FutureTrigger[],
  suppressedTriggers: FutureTrigger[],
  items: Array<SubscriptionItem | string>,
  dueEvents: InboxEvent[],
): Promise<IdleTickResult> {
  const activeFrontier = getActiveDeferredFrontier(db, conversationId);
  const dueTriggers = firedTriggers.filter((trigger) => trigger.conversationId === conversationId);
  if (activeFrontier) {
    return emptyResult(conversationId, "active_frontier", [], [...suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId), ...dueTriggers]);
  }

  let occupancy: MindOccupancy[];
  try {
    occupancy = groundedOccupancy(db, conversationId);
  } catch (error) {
    if (!isOccupancyUnreachable(error)) throw error;
    logOccupancyUnreachable(conversationId, error);
    return emptyResult(conversationId, "occupancy_unreachable", [], suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId));
  }
  const matched = collectSubscriptionObservations(db, conversationId, items, { nowMs: options.nowMs });
  if (occupancy.length === 0 && dueTriggers.length === 0 && matched.length === 0) {
    return emptyResult(conversationId, "empty_house", [], suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId));
  }

  const thought = runner(options);
  if (!thought) {
    return {
      ...emptyResult(conversationId, "thought_runner_missing", dueTriggers, suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId)),
      eligible: true,
      idleEligible: true,
      semanticAbsenceClaim: "no",
      observations: matched,
    };
  }
  if (activePrivateCalls.has(conversationId)) return emptyResult(conversationId, "private_compute_concurrent", dueTriggers, []);

  const nowMs = options.nowMs ?? Date.now();

  const triggerKind = dueTriggers.length > 0
    ? "future_trigger_due" as const
    : matched.length > 0
      ? "subscription_item" as const
      : "idle_opportunity" as const;
  const triggerRef = dueTriggers.length > 0
    ? dueTriggers.map((trigger) => trigger.triggerId).join(",")
    : matched.length > 0
      ? matched.map((observation) => observation.observationId).join(",")
      : `${occupancy.map((item) => item.concernId).join(",")}:tick:${nowMs}`;
  const policyId = options.privateBudgetPolicyId ?? PRIVATE_THOUGHT_POLICY_ID;
  const budgetProjection = getPrivateBudgetProjection(db, {
    conversationId,
    policyId,
    wallClockNowMs: nowMs,
  });
  const dueWake = dueTriggers[0]?.wakeId ? getWake(db, dueTriggers[0].wakeId) : null;
  const sourceKind = triggerKind === "future_trigger_due"
    ? "future_trigger" as const
    : triggerKind === "subscription_item"
      ? "subscription" as const
      : "idle" as const;
  const occurrenceId = occurrenceIdFor({ sourceKind, triggerRef, conversationId });
  const existingWakeRow = db.prepare("SELECT wake_id FROM wakes WHERE occurrence_id = ?").get(occurrenceId) as { wake_id?: unknown } | undefined;
  const existingWake = dueWake ?? (typeof existingWakeRow?.wake_id === "string" ? getWake(db, existingWakeRow.wake_id) : null);
  const admissionInput = {
    occurrenceId,
    triggerRef,
    sourceKind,
    conversationId,
    triggerKind,
    occupantId: options.occupantId ?? "private",
    authorityEpoch: options.authorityEpoch ?? 1,
    capturedAuthorityRevision: 0,
    nowMs,
  };
  const admission = dueWake
    ? { kind: "existing" as const, wake: dueWake }
    : existingWake
      ? admitWake(db, admissionInput)
      : budgetProjection.clockState !== "stable"
        ? { kind: "clock_reconciliation" as const }
        : budgetProjection.remaining <= 0
          ? { kind: "budget_exhausted" as const }
          : admitWake(db, admissionInput);
  if (admission.kind === "clock_reconciliation") return emptyResult(conversationId, "private_compute_clock_reconciliation", dueTriggers, []);
  if (admission.kind === "budget_exhausted") return emptyResult(conversationId, "private_compute_budget", dueTriggers, []);
  if (admission.kind === "cancelled") return emptyResult(conversationId, "wake_cancelled", dueTriggers, suppressedTriggers);
  if (admission.kind === "stale") return emptyResult(conversationId, "wake_stale", dueTriggers, suppressedTriggers);
  const cycle = getCycle(db, admission.wake.cycleId);
  if (!cycle) throw new Error("idle_cycle_missing");
  const wakeId = cycle.wakeId;
  const event = dueEvents.find((candidate) => candidate.wakeId === wakeId) ?? null;
  const observations = matched.map((observation) => remapObservation(observation, cycle));
  const budget = reservePrivateThought(db, {
    admissionId: `private-thought:${wakeId}`,
    wakeId,
    conversationId,
    policyId,
    wallClockNowMs: nowMs,
  });
  if (budget.kind === "refused") {
    return emptyResult(
      conversationId,
      budget.reason === "clock_reconciliation" ? "private_compute_clock_reconciliation" : "private_compute_budget",
      dueTriggers,
      [],
    );
  }
  if (budget.reservation.state !== "held") return emptyResult(conversationId, "private_compute_budget", dueTriggers, []);
  activePrivateCalls.add(conversationId);
  try {
    const result = await thought({
      sidecar: db,
      cycle,
      wakeId,
      event,
      trigger: { kind: triggerKind, ref: triggerRef },
      occupancy,
      observations,
      dueTriggers,
      privateBudgetReservation: budget.reservation,
    });
    settleUnsettledPrivateReservation(db, budget.reservation.reservationId, nowMs);
    const thoughtModelAttempts = number(result.thoughtModelAttempts, 1);
    const acceptedSettlements = number(result.acceptedSettlements, result.published === true ? 1 : 0);
    // Dormancy is semantic state. Only the Thought settlement may publish it;
    // the idle scheduler reports an explicit result without writing state.
    const dormant = result.dormant === true;
    return {
      conversationId,
      eligible: true,
      reason: null,
      thoughtModelAttempts,
      acceptedSettlements,
      thoughtCalls: 1,
      cycleId: cycle.cycleId,
      observations,
      firedTriggers: dueTriggers,
      suppressedTriggers: suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId),
      dormant,
      idleEligible: true,
      semanticAbsenceClaim: "no",
    };
  } catch {
    try { settleUnsettledPrivateReservation(db, budget.reservation.reservationId, nowMs); } catch { /* preserve the idle failure result */ }
    return {
      conversationId,
      eligible: true,
      reason: "thought_failed",
      thoughtModelAttempts: 1,
      acceptedSettlements: 0,
      thoughtCalls: 1,
      cycleId: cycle.cycleId,
      observations,
      firedTriggers: dueTriggers,
      suppressedTriggers: suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId),
      dormant: false,
      idleEligible: true,
      semanticAbsenceClaim: "no",
    };
  } finally {
    activePrivateCalls.delete(conversationId);
  }
}

export async function tickIdleOpportunity(
  db: DatabaseSync,
  options: IdleTickOptions = {},
): Promise<IdleTickResult> {
  void options.learnedSelfSlice;
  const nowMs = options.nowMs ?? Date.now();
  if (options.conversationId && getActiveDeferredFrontier(db, options.conversationId)) {
    return emptyResult(options.conversationId, "active_frontier", [], []);
  }

  let due;
  try {
    due = await fireDueTriggers(db, { conversationId: options.conversationId, nowMs });
  } catch (error) {
    if (!isOccupancyUnreachable(error)) throw error;
    logOccupancyUnreachable(options.conversationId ?? null, error);
    return emptyResult(options.conversationId ?? null, "occupancy_unreachable", [], []);
  }
  const items = inputItems(options);
  let conversations: string[];
  try {
    conversations = conversationCandidates(db, options, due.fired, items);
  } catch (error) {
    if (!isOccupancyUnreachable(error)) throw error;
    logOccupancyUnreachable(options.conversationId ?? null, error);
    return emptyResult(options.conversationId ?? null, "occupancy_unreachable", due.fired, due.suppressedStale);
  }
  if (conversations.length === 0) return emptyResult(options.conversationId ?? null, "empty_house", due.fired, due.suppressedStale);
  const results: IdleTickResult[] = [];
  for (const conversationId of conversations) {
    results.push(await tickConversation(db, conversationId, { ...options, nowMs }, due.fired, due.suppressedStale, items, due.events));
  }
  return {
    conversationId: options.conversationId ?? (results.length === 1 ? results[0]!.conversationId : null),
    eligible: results.some((result) => result.eligible),
    reason: results.every((result) => result.reason === "empty_house") ? "empty_house" : results.find((result) => result.reason !== null)?.reason ?? null,
    thoughtModelAttempts: results.reduce((total, result) => total + result.thoughtModelAttempts, 0),
    acceptedSettlements: results.reduce((total, result) => total + result.acceptedSettlements, 0),
    thoughtCalls: results.reduce((total, result) => total + result.thoughtCalls, 0),
    cycleId: results.length === 1 ? results[0]!.cycleId : null,
    observations: results.flatMap((result) => result.observations),
    firedTriggers: due.fired,
    suppressedTriggers: due.suppressedStale,
    dormant: results.some((result) => result.dormant),
    idleEligible: results.some((result) => result.idleEligible === true),
    semanticAbsenceClaim: results.some((result) => result.semanticAbsenceClaim === "no") ? "no" : "yes",
  };
}
