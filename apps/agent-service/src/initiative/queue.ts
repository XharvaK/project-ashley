import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { words } from "../curiosity/inject.js";
import { HYPE } from "../curiosity/scoring.js";
import { recentTakes, type TakeRow } from "../curiosity/store.js";
import { localParts } from "../local-time.js";
import { listActiveFacts } from "../memory/facts.js";
import { listStances } from "../memory/stances.js";
import { kindFeedbackMultiplier } from "../signals.js";
import {
  ageOutOpenThreads,
  listOpenThreads,
} from "./open-threads.js";
import { unansweredCount } from "./schedule.js";

export type CandidateKind =
  | "she_owes"
  | "he_never_answered"
  | "time_anchored"
  | "watch_fired"
  | "curiosity_take"
  | "callback"
  | "stance"
  | "check_in";

export type CuriosityLane = "A" | "B" | "C";

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
  lane?: CuriosityLane;
  title?: string;
};

type Spec = {
  base: number;
  halfLifeHours: number;
  ripeAfterHours: number;
  angle: Angle;
};

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
  extra?: { lane?: CuriosityLane; title?: string; scoreScale?: number },
): Candidate | null {
  let score = decayedScore(kind, ageHours) * feedbackMultiplier;
  if (extra?.scoreScale !== undefined) score *= extra.scoreScale;
  if (score <= 0) return null;
  return {
    kind,
    angle: SPECS[kind].angle,
    materialKey: materialKey.slice(0, 120),
    material: material.replace(/\s+/g, " ").trim().slice(0, 400),
    strength: SPECS[kind].base,
    ageHours,
    score,
    lane: extra?.lane,
    title: extra?.title,
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

function asDate(ts: string): Date {
  return new Date(ts.includes("T") ? ts : `${ts}Z`);
}

export function countOrphansLocalToday(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): number {
  const today = localParts(now).dateKey;
  const rows = db
    .prepare(
      `SELECT sent_at, material_key FROM mem_initiative_log
       WHERE owner_id = ?
         AND material_key LIKE 'orphan:take:%'
         AND sent_at >= datetime('now', '-36 hours')`,
    )
    .all(ownerId) as Array<{ sent_at: string; material_key: string }>;
  return rows.filter((r) => localParts(asDate(r.sent_at)).dateKey === today)
    .length;
}

/** Shared content tokens between a take and Doc's durable facts. */
export function docAffinity(
  db: DatabaseSync,
  ownerId: string,
  title: string,
  take: string,
): number {
  const takeTokens = new Set(words(`${title} ${take}`));
  if (takeTokens.size === 0) return 0;
  const facts = listActiveFacts(db, ownerId, 40).filter(
    (f) =>
      f.category === "project" ||
      f.category === "ongoing" ||
      f.category === "preference",
  );
  const factTokens = new Set(
    facts.flatMap((f) => words(`${f.key} ${f.value}`)),
  );
  let n = 0;
  for (const w of takeTokens) {
    if (factTokens.has(w)) n++;
  }
  return n;
}

function coherentOrphan(take: TakeRow): boolean {
  if (!take.take.trim()) return false;
  if (words(take.title).length < 3) return false;
  if (HYPE.test(`${take.title} ${take.take}`)) return false;
  return true;
}

function packTakeMaterial(take: TakeRow): string {
  return `Piece: ${take.title}\nTake: ${take.take}`;
}

function presenceMaterial(
  db: DatabaseSync,
  idleHours: number,
): { material: string; materialKey: string } {
  const dateKey = localParts().dateKey;
  const days = Math.floor(idleHours / 24);
  const silence =
    days >= 1
      ? `Quiet ~${days} day${days === 1 ? "" : "s"}.`
      : `Quiet ~${Math.round(idleHours)}h.`;
  if (Math.random() < 0.5) {
    return {
      materialKey: `checkin:${dateKey}`,
      material: `${silence} One still-here line. No question. No agenda. Do not invent Doc's day or projects.`,
    };
  }
  const beat = recentTakes(db, 72, 8).find((t) => t.take.trim().length > 0);
  if (!beat) {
    return {
      materialKey: `checkin:${dateKey}`,
      material: `${silence} One still-here line. No question. No agenda. Do not invent Doc's day or projects.`,
    };
  }
  return {
    materialKey: `checkin:${dateKey}`,
    material: `${silence} Her beat only — title "${beat.title}", one tiny aside from her reading. Do not invent Doc topics. No question.`,
  };
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
  ageOutOpenThreads(db, ownerId);

  const out: Candidate[] = [];
  const unanswered = unansweredCount(db, ownerId);
  const orphanToday = countOrphansLocalToday(db, ownerId);
  const cachedMultipliers = new Map<CandidateKind, number>();
  const mult = (kind: CandidateKind): number => {
    const cached = cachedMultipliers.get(kind);
    if (cached !== undefined) return cached;
    const value = kindFeedbackMultiplier(db, ownerId, kind);
    cachedMultipliers.set(kind, value);
    return value;
  };

  for (const thread of listOpenThreads(db, ownerId, 20)) {
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
    if (take.source_slug === "doc-world-watch") {
      const c = make(
        "watch_fired",
        `take:${take.id}`,
        packTakeMaterial(take),
        hoursSince(take.created_at),
        mult("watch_fired"),
        { lane: "A", title: take.title },
      );
      if (c) out.push(c);
      continue;
    }

    const affinity = docAffinity(db, ownerId, take.title, take.take);
    if (affinity >= env.proactiveAffinityMinTokens) {
      const c = make(
        "curiosity_take",
        `take:${take.id}`,
        packTakeMaterial(take),
        hoursSince(take.created_at),
        mult("curiosity_take"),
        { lane: "B", title: take.title },
      );
      if (c) out.push(c);
      continue;
    }

    if (!coherentOrphan(take)) continue;
    if (unanswered >= 1) continue;
    if (orphanToday >= env.proactiveOrphanMaxPerDay) continue;
    const c = make(
      "curiosity_take",
      `orphan:take:${take.id}`,
      packTakeMaterial(take),
      hoursSince(take.created_at),
      mult("curiosity_take"),
      { lane: "C", title: take.title, scoreScale: 0.55 },
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

  // Presence lives in check_in: silence material only, no score cheat, ≤1/day.
  // Counts toward unanswered once sent; never dig the ignore hole further.
  if (
    context.idleHours >= env.proactiveCheckInIdleHours &&
    unanswered === 0
  ) {
    const presence = presenceMaterial(db, context.idleHours);
    const c = make(
      "check_in",
      presence.materialKey,
      presence.material,
      0,
      mult("check_in"),
    );
    if (c) out.push(c);
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
  if (ripe.length === 0) return null;

  const hasAgenda = ripe.some(
    (c) =>
      c.kind !== "check_in" &&
      (c.lane === "A" ||
        c.lane === "B" ||
        c.kind === "she_owes" ||
        c.kind === "he_never_answered" ||
        c.kind === "time_anchored" ||
        c.kind === "callback" ||
        c.kind === "stance" ||
        (c.kind === "curiosity_take" && c.lane !== "C") ||
        c.kind === "watch_fired"),
  );

  // Presence only when nothing sharper is ripe.
  let pool = ripe;
  if (hasAgenda) {
    pool = ripe.filter((c) => c.kind !== "check_in");
  }

  const hasAB = pool.some((c) => c.lane === "A" || c.lane === "B");
  if (hasAB) {
    pool = pool.filter((c) => c.lane !== "C");
  }

  // A > B > C among curiosity; otherwise best score.
  const laneRank = (c: Candidate): number => {
    if (c.lane === "A") return 3;
    if (c.lane === "B") return 2;
    if (c.lane === "C") return 1;
    return 0;
  };
  pool.sort(
    (a, b) => laneRank(b) - laneRank(a) || b.score - a.score,
  );
  return pool[0] ?? null;
}
