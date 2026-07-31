import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { recentTakes } from "../curiosity/store.js";
import { listActiveFacts } from "../memory/facts.js";
import { listStances } from "../memory/stances.js";
import { kindFeedbackMultiplier } from "../signals.js";
import { listOpenThreads } from "./open-threads.js";

export type CandidateKind =
  | "she_owes"
  | "he_never_answered"
  | "time_anchored"
  | "watch_fired"
  | "curiosity_take"
  | "callback"
  | "stance"
  | "check_in"
  | "ambient";

export type Angle = "question" | "opinion" | "check_in";

export type Candidate = {
  kind: CandidateKind;
  angle: Angle;
  /** Identity of the material, so the same thing never goes out twice. */
  materialKey: string;
  /** What she actually has to say. The generator may not go beyond this. */
  material: string;
  strength: number;
  ageHours: number;
  score: number;
};

type Spec = {
  base: number;
  halfLifeHours: number;
  ripeAfterHours: number;
  angle: Angle;
};

/**
 * Ranked by how much the material earns an interruption. Ambient exists so the
 * bottom of the ladder is visible, not so it gets used: at base 8 it only ever
 * clears the floor when the floor is lowered on purpose.
 */
const SPECS: Record<CandidateKind, Spec> = {
  she_owes: { base: 95, halfLifeHours: 30, ripeAfterHours: 1, angle: "question" },
  he_never_answered: {
    base: 82,
    halfLifeHours: 14,
    ripeAfterHours: 2,
    angle: "question",
  },
  time_anchored: {
    base: 88,
    halfLifeHours: 20,
    ripeAfterHours: 3,
    angle: "question",
  },
  watch_fired: { base: 78, halfLifeHours: 10, ripeAfterHours: 0, angle: "opinion" },
  curiosity_take: {
    base: 68,
    halfLifeHours: 12,
    ripeAfterHours: 0,
    angle: "opinion",
  },
  callback: { base: 48, halfLifeHours: 96, ripeAfterHours: 12, angle: "question" },
  stance: { base: 58, halfLifeHours: 120, ripeAfterHours: 24, angle: "opinion" },
  check_in: { base: 38, halfLifeHours: 48, ripeAfterHours: 0, angle: "check_in" },
  ambient: { base: 8, halfLifeHours: 6, ripeAfterHours: 0, angle: "check_in" },
};

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  const ts = new Date(iso.includes("T") ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(ts)) return Infinity;
  return Math.max(0, (Date.now() - ts) / 3_600_000);
}

export function decayedScore(
  kind: CandidateKind,
  ageHours: number,
): number {
  const spec = SPECS[kind];
  if (ageHours < spec.ripeAfterHours) return 0;
  if (!Number.isFinite(ageHours)) return 0;
  return spec.base * Math.pow(0.5, ageHours / spec.halfLifeHours);
}

function make(
  kind: CandidateKind,
  materialKey: string,
  material: string,
  ageHours: number,
  feedbackMultiplier = 1,
): Candidate | null {
  const score = decayedScore(kind, ageHours) * feedbackMultiplier;
  if (score <= 0) return null;
  return {
    kind,
    angle: SPECS[kind].angle,
    materialKey: materialKey.slice(0, 120),
    material: material.replace(/\s+/g, " ").trim().slice(0, 400),
    strength: SPECS[kind].base,
    ageHours,
    score,
  };
}

function alreadySent(db: DatabaseSync, ownerId: string, key: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM mem_initiative_log
       WHERE owner_id = ? AND material_key = ? LIMIT 1`,
    )
    .get(ownerId, key.slice(0, 120));
  return row !== undefined;
}

/**
 * The whole point of this file: candidates come from things that happened, so an
 * empty return means silence by construction. There is no filler branch.
 */
export function collectCandidates(
  db: DatabaseSync,
  ownerId: string,
  context: { idleHours: number },
): Candidate[] {
  const out: Candidate[] = [];
  const cachedMultipliers = new Map<CandidateKind, number>();
  const mult = (kind: CandidateKind): number => {
    const cached = cachedMultipliers.get(kind);
    if (cached !== undefined) return cached;
    const value = kindFeedbackMultiplier(db, ownerId, kind);
    cachedMultipliers.set(kind, value);
    return value;
  };

  for (const thread of listOpenThreads(db, ownerId, 20)) {
    // Time anchors stay silent until due_at; undated threads are fair game.
    if (thread.due_at) {
      const raw = thread.due_at.includes("T")
        ? thread.due_at
        : `${thread.due_at}Z`;
      const due = Date.parse(raw);
      if (Number.isFinite(due) && due > Date.now()) continue;
    }
    const kind: CandidateKind =
      thread.kind === "she_owes"
        ? "she_owes"
        : thread.kind === "he_never_answered"
          ? "he_never_answered"
          : "time_anchored";
    const c = make(
      kind,
      `open:${thread.id}`,
      thread.detail,
      hoursSince(thread.created_at),
      mult(kind),
    );
    if (c) out.push(c);
  }

  for (const take of recentTakes(db, 48, 12)) {
    // A watch take is about his world, which outranks anything she read for
    // herself, so the two are separate candidate kinds.
    const kind: CandidateKind =
      take.source_slug === "doc-world-watch" ? "watch_fired" : "curiosity_take";
    const c = make(
      kind,
      `take:${take.id}`,
      `${take.take} (from: ${take.title})`,
      hoursSince(take.created_at),
      mult(kind),
    );
    if (c) out.push(c);
  }

  for (const stance of listStances(db, ownerId).slice(0, 6)) {
    const c = make(
      "stance",
      `stance:${stance.id}`,
      `${stance.topic}: ${stance.stance}`,
      hoursSince(stance.last_defended_at ?? stance.created_at),
      mult("stance"),
    );
    if (c) out.push(c);
  }

  for (const fact of listActiveFacts(db, ownerId, 12)) {
    if (fact.category !== "project" && fact.category !== "ongoing") continue;
    const c = make(
      "callback",
      `callback:${fact.id}`,
      fact.value,
      hoursSince(fact.last_confirmed_at),
      mult("callback"),
    );
    if (c) out.push(c);
  }

  // A check-in is material only when the silence itself is the material.
  if (context.idleHours >= env.proactiveCheckInIdleHours) {
    const days = Math.floor(context.idleHours / 24);
    const c = make(
      "check_in",
      `checkin:${new Date().toISOString().slice(0, 10)}`,
      days >= 1
        ? `He has been quiet for about ${days} day${days === 1 ? "" : "s"}.`
        : `He has been quiet for about ${Math.round(context.idleHours)} hours.`,
      0,
      mult("check_in"),
    );
    if (c) out.push(c);
  }

  // Low-stakes presence when silence is long and nothing sharper exists. A friend
  // who only texts with an agenda is itself a tell. Base score sits under the
  // floor; lift it so it can clear the gate once check-in idle is met.
  if (context.idleHours >= env.proactiveCheckInIdleHours) {
    const ambient = make(
      "ambient",
      `ambient:${new Date().toISOString().slice(0, 10)}`,
      "No agenda - a small human presence ping, one short line.",
      0,
      mult("ambient"),
    );
    if (ambient) {
      ambient.score = Math.max(ambient.score, env.proactiveMinScore + 1);
      out.push(ambient);
    }
  }

  return out
    .filter((c) => !alreadySent(db, ownerId, c.materialKey))
    .sort((a, b) => b.score - a.score);
}

export function pickCandidate(
  db: DatabaseSync,
  ownerId: string,
  context: { idleHours: number },
): Candidate | null {
  const ripe = collectCandidates(db, ownerId, context).filter(
    (c) => c.score >= env.proactiveMinScore,
  );
  return ripe[0] ?? null;
}
