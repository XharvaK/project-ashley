import type { DatabaseSync } from "node:sqlite";
import { admitCycle } from "../cycle/inbox.js";
import { listOccupancy } from "../concerns/occupancy.js";
import { fireDueTriggers } from "./future-triggers.js";
import { collectSubscriptionObservations, listObservationSubscriptions, type SubscriptionItem } from "../observation/subscriptions.js";
import {
  PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR,
  PRIVATE_THOUGHT_MAX_CONCURRENT,
  type CycleRecord,
  type FutureTrigger,
  type KernelRunResult,
  type LearnedSelfSlice,
  type MindOccupancy,
  type Observation,
} from "../types.js";

const GROUNDED_STATUSES = new Set(["active", "investigating", "waiting_for_evidence"]);
const HOUR_MS = 60 * 60 * 1000;
const IDLE_NOOP_BEFORE_DORMANT = 3;

type IdleRunnerResult = Partial<KernelRunResult> & {
  speechMode?: "none" | "draft";
  settlement?: { speech?: { mode?: "none" | "draft" } };
};

export type IdleThoughtContext = {
  sidecar: DatabaseSync;
  cycle: CycleRecord;
  trigger: { kind: "idle_opportunity" | "subscription_item" | "future_trigger_due"; ref: string };
  occupancy: MindOccupancy[];
  observations: Observation[];
  dueTriggers: FutureTrigger[];
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
  privateBudgetRemaining?: number;
  maxPrivateCallsPerHour?: number;
};

export type IdleTickReason =
  | "empty_house"
  | "private_compute_budget"
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

const privateCallHistory = new Map<string, number[]>();
const activePrivateCalls = new Set<string>();
const idleNoopState = new Map<string, { fingerprint: string; count: number }>();

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function groundedOccupancy(db: DatabaseSync, conversationId: string): MindOccupancy[] {
  return listOccupancy(db, conversationId).filter((item) => GROUNDED_STATUSES.has(item.status));
}

function occupancyFingerprint(items: MindOccupancy[]): string {
  return JSON.stringify(items.map((item) => [item.concernId, item.status, item.priority, item.updatedGeneration]));
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

function isPrivateNoop(result: IdleRunnerResult): boolean {
  if (result.speechMode === "none") return true;
  if (result.speechMode === "draft") return false;
  if (result.settlement?.speech?.mode === "none") return true;
  if (result.settlement?.speech?.mode === "draft") return false;
  return result.published === true && (result.outboxId == null);
}

function markDormantIfUnchanged(
  db: DatabaseSync,
  conversationId: string,
  cycle: CycleRecord,
  before: string,
  result: IdleRunnerResult,
): boolean {
  const afterItems = groundedOccupancy(db, conversationId);
  const after = occupancyFingerprint(afterItems);
  if (!isPrivateNoop(result) || before !== after) {
    idleNoopState.set(conversationId, { fingerprint: after, count: 0 });
    return false;
  }
  const previous = idleNoopState.get(conversationId);
  const count = previous && previous.fingerprint === before ? previous.count + 1 : 1;
  idleNoopState.set(conversationId, { fingerprint: after, count });
  if (count < IDLE_NOOP_BEFORE_DORMANT) return false;
  db.prepare(
    `UPDATE mind_occupancy
        SET status = 'dormant_but_revisitable', updated_cycle = ?, updated_generation = ?
      WHERE conversation_id = ? AND status IN ('active', 'investigating', 'waiting_for_evidence')`,
  ).run(cycle.cycleId, cycle.generation, conversationId);
  db.prepare(
    `UPDATE concerns SET status = 'dormant_but_revisitable', updated_cycle = ?
      WHERE conversation_id = ? AND status IN ('active', 'investigating', 'waiting_for_evidence')`,
  ).run(cycle.cycleId, conversationId);
  return true;
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

async function tickConversation(
  db: DatabaseSync,
  conversationId: string,
  options: IdleTickOptions,
  firedTriggers: FutureTrigger[],
  suppressedTriggers: FutureTrigger[],
  items: Array<SubscriptionItem | string>,
): Promise<IdleTickResult> {
  const occupancy = groundedOccupancy(db, conversationId);
  const dueTriggers = firedTriggers.filter((trigger) => trigger.conversationId === conversationId);
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
  const previousCalls = (privateCallHistory.get(conversationId) ?? []).filter((at) => at <= nowMs && nowMs - at < HOUR_MS);
  privateCallHistory.set(conversationId, previousCalls);
  const maxCalls = Math.max(0, Math.floor(options.maxPrivateCallsPerHour ?? PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR));
  if (options.privateBudgetRemaining != null && options.privateBudgetRemaining <= 0) {
    return emptyResult(conversationId, "private_compute_budget", dueTriggers, []);
  }
  if (previousCalls.length >= maxCalls) return emptyResult(conversationId, "private_compute_budget", dueTriggers, []);

  const triggerKind = dueTriggers.length > 0
    ? "future_trigger_due" as const
    : matched.length > 0
      ? "subscription_item" as const
      : "idle_opportunity" as const;
  const triggerRef = dueTriggers.length > 0
    ? dueTriggers.map((trigger) => trigger.triggerId).join(",")
    : matched.length > 0
      ? matched.map((observation) => observation.observationId).join(",")
      : occupancy.map((item) => item.concernId).join(",");
  const cycle = admitCycle(db, {
    conversationId,
    triggerKind,
    triggerRef,
    occupantId: options.occupantId ?? "private",
    authorityEpoch: options.authorityEpoch ?? 1,
    nowMs,
  });
  const observations = matched.map((observation) => remapObservation(observation, cycle));
  const before = occupancyFingerprint(occupancy);
  activePrivateCalls.add(conversationId);
  privateCallHistory.set(conversationId, [...previousCalls, nowMs]);
  try {
    const result = await thought({
      sidecar: db,
      cycle,
      trigger: { kind: triggerKind, ref: triggerRef },
      occupancy,
      observations,
      dueTriggers,
    });
    const thoughtModelAttempts = number(result.thoughtModelAttempts, 1);
    const acceptedSettlements = number(result.acceptedSettlements, result.published === true ? 1 : 0);
    const dormant = markDormantIfUnchanged(db, conversationId, cycle, before, result);
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
    results.push(await tickConversation(db, conversationId, { ...options, nowMs }, due.fired, due.suppressedStale, items));
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
