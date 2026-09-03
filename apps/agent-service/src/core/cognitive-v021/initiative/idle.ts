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
};

/** Scheduler-only overlap guard. It is not a budget counter or capacity source. */
const activePrivateCalls = new Set<string>();

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function groundedOccupancy(db: DatabaseSync, conversationId: string): MindOccupancy[] {
  return listOccupancy(db, conversationId).filter((item) => GROUNDED_STATUSES.has(item.status));
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
  db.prepare(
    "SELECT DISTINCT conversation_id FROM mind_occupancy WHERE status IN ('active', 'investigating', 'waiting_for_evidence')",
  ).all().forEach((row) => {
    if (typeof row === "object" && row !== null && typeof (row as { conversation_id?: unknown }).conversation_id === "string") ids.add((row as { conversation_id: string }).conversation_id);
  });
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
    reason,
    thoughtModelAttempts: 0,
    acceptedSettlements: 0,
    thoughtCalls: 0,
    cycleId: null,
    observations: [],
    firedTriggers,
    suppressedTriggers,
    dormant: false,
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
    return emptyResult(conversationId, "empty_house", [], [...suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId), ...dueTriggers]);
  }

  const occupancy = groundedOccupancy(db, conversationId);
  const matched = collectSubscriptionObservations(db, conversationId, items, { nowMs: options.nowMs });
  if (occupancy.length === 0 && dueTriggers.length === 0 && matched.length === 0) {
    return emptyResult(conversationId, "empty_house", [], suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId));
  }

  const thought = runner(options);
  if (!thought) {
    return {
      ...emptyResult(conversationId, "thought_runner_missing", dueTriggers, suppressedTriggers.filter((trigger) => trigger.conversationId === conversationId)),
      eligible: true,
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
  const dueWake = dueTriggers[0]?.wakeId ? getWake(db, dueTriggers[0].wakeId) : null;
  const admission = dueWake
    ? { kind: "existing" as const, wake: dueWake }
    : admitWake(db, {
      occurrenceId: occurrenceIdFor({
        sourceKind: triggerKind === "future_trigger_due" ? "future_trigger" : triggerKind === "subscription_item" ? "subscription" : "idle",
        triggerRef,
        conversationId,
      }),
      triggerRef,
      sourceKind: triggerKind === "future_trigger_due" ? "future_trigger" : triggerKind === "subscription_item" ? "subscription" : "idle",
      conversationId,
      triggerKind,
      occupantId: options.occupantId ?? "private",
      authorityEpoch: options.authorityEpoch ?? 1,
      capturedAuthorityRevision: 0,
      nowMs,
    });
  if (admission.kind === "cancelled" || admission.kind === "stale") return emptyResult(conversationId, "empty_house", dueTriggers, suppressedTriggers);
  const cycle = getCycle(db, admission.wake.cycleId);
  if (!cycle) throw new Error("idle_cycle_missing");
  const wakeId = cycle.wakeId;
  const event = dueEvents.find((candidate) => candidate.wakeId === wakeId) ?? null;
  const observations = matched.map((observation) => remapObservation(observation, cycle));
  const budget = reservePrivateThought(db, {
    admissionId: `private-thought:${wakeId}`,
    wakeId,
    conversationId,
    policyId: options.privateBudgetPolicyId ?? PRIVATE_THOUGHT_POLICY_ID,
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
  const due = await fireDueTriggers(db, { conversationId: options.conversationId, nowMs });
  const items = inputItems(options);
  const conversations = conversationCandidates(db, options, due.fired, items);
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
  };
}
