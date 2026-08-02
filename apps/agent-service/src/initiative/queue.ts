import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { words } from "../curiosity/inject.js";
import { HYPE } from "../curiosity/scoring.js";
import {
  recentTakes,
  takeHasFullRead,
  type TakeRow,
} from "../curiosity/store.js";
import { localParts } from "../local-time.js";
import { listInterruptedStates } from "../memory/conversation-state.js";
import { listActiveFacts } from "../memory/facts.js";
import { listStances } from "../memory/stances.js";
import { kindFeedbackMultiplier } from "../signals.js";
import { recentNegativeMoodCount } from "../memory/mood.js";
import {
  ageOutOpenThreads,
  listOpenThreads,
} from "./open-threads.js";
import { unansweredCount } from "./schedule.js";
import { listPendingOwnTimeDrafts } from "./sleep.js";
import { listPendingAssignments } from "./reading-assignment.js";

export type CandidateKind =
  | "she_owes"
  | "he_never_answered"
  | "time_anchored"
  | "watch_fired"
  | "curiosity_take"
  | "callback"
  | "stance"
  | "check_in"
  | "share_discovery"
  | "reaction"
  | "continue"
  | "celebrate"
  | "ambient_presence"
  | "provocation"
  | "reading_assignment"
  | "return_digest";

export type CuriosityLane = "A" | "B" | "C";

export type Angle =
  | "question"
  | "opinion"
  | "check_in"
  | "share_discovery"
  | "callback"
  | "reaction"
  | "continue"
  | "celebrate"
  | "ambient_presence"
  | "provocation"
  | "reading_assignment";

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
  reading_assignment: {
    base: 92,
    halfLifeHours: 48,
    ripeAfterHours: 0,
    angle: "reading_assignment",
  },
  return_digest: {
    base: 80,
    halfLifeHours: 24,
    ripeAfterHours: 0.5,
    angle: "opinion",
  },
  she_owes: { base: 95, halfLifeHours: 30, ripeAfterHours: 1, angle: "question" },
  he_never_answered: {
    base: 88,
    halfLifeHours: 14,
    ripeAfterHours: 1,
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
  share_discovery: {
    base: 72,
    halfLifeHours: 14,
    ripeAfterHours: 0,
    angle: "share_discovery",
  },
  reaction: {
    base: 64,
    halfLifeHours: 10,
    ripeAfterHours: 0,
    angle: "reaction",
  },
  continue: {
    base: 70,
    halfLifeHours: 18,
    ripeAfterHours: 0.5,
    angle: "continue",
  },
  celebrate: {
    base: 55,
    halfLifeHours: 36,
    ripeAfterHours: 2,
    angle: "celebrate",
  },
  ambient_presence: {
    base: 32,
    halfLifeHours: 48,
    ripeAfterHours: 0,
    angle: "ambient_presence",
  },
  provocation: {
    base: 60,
    halfLifeHours: 72,
    ripeAfterHours: 1,
    angle: "provocation",
  },
  callback: { base: 48, halfLifeHours: 96, ripeAfterHours: 12, angle: "callback" },
  stance: { base: 58, halfLifeHours: 120, ripeAfterHours: 24, angle: "opinion" },
  check_in: { base: 38, halfLifeHours: 48, ripeAfterHours: 0, angle: "check_in" },
};

const NEGATIVE_TAKE =
  /\b(terrible|awful|wrong|stupid|waste|boring|useless|dumb|garbage|slop|worst)\b/i;
const POSITIVE_PROJECT =
  /\b(shipped|deploy(ed)?|fixed|landed|done|working|green|clean)\b/i;

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

function packTakeMaterial(
  db: DatabaseSync,
  take: TakeRow,
): string {
  const depth = takeHasFullRead(db, take.item_id) ? "full" : "excerpt";
  return `Piece: ${take.title}\nTake: ${take.take}\nDepth: ${depth}`;
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

  for (const assign of listPendingAssignments(db, ownerId)) {
    const hours = (Date.now() - Date.parse(assign.requestedAt)) / 3600000;
    const c = make(
      "reading_assignment",
      `assign:${assign.id}`,
      `Topic requested by Doc: ${assign.topic}${assign.summary ? `\nSummary: ${assign.summary}` : ""}`,
      hours,
      mult("reading_assignment"),
      { title: assign.topic },
    );
    if (c) out.push(c);
  }

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
    const material = packTakeMaterial(db, take);
    if (take.source_slug === "doc-world-watch") {
      const c = make(
        "watch_fired",
        `take:${take.id}`,
        material,
        hoursSince(take.created_at),
        mult("watch_fired"),
        { lane: "A", title: take.title },
      );
      if (c) out.push(c);
      continue;
    }

    if (NEGATIVE_TAKE.test(take.take)) {
      const c = make(
        "reaction",
        `reaction:take:${take.id}`,
        material,
        hoursSince(take.created_at),
        mult("reaction"),
        { lane: "B", title: take.title },
      );
      if (c) out.push(c);
    }

    const affinity = docAffinity(db, ownerId, take.title, take.take);
    if (affinity >= env.proactiveAffinityMinTokens) {
      const kind: CandidateKind =
        affinity >= env.proactiveAffinityMinTokens + 1
          ? "share_discovery"
          : "curiosity_take";
      const c = make(
        kind,
        `take:${take.id}`,
        material,
        hoursSince(take.created_at),
        mult(kind),
        { lane: "B", title: take.title },
      );
      if (c) out.push(c);
      continue;
    }

    if (!coherentOrphan(take)) continue;
    // Orphan cold outreach needs a real fetch — not a feed blurb take.
    if (!takeHasFullRead(db, take.item_id)) continue;
    if (unanswered >= 1) continue;
    if (orphanToday >= env.proactiveOrphanMaxPerDay) continue;
    const c = make(
      "curiosity_take",
      `orphan:take:${take.id}`,
      material,
      hoursSince(take.created_at),
      mult("curiosity_take"),
      { lane: "C", title: take.title, scoreScale: 0.55 },
    );
    if (c) out.push(c);
  }

  for (const interrupted of listInterruptedStates(db, ownerId, 3)) {
    const c = make(
      "continue",
      `continue:${interrupted.id}`,
      `Interrupted ${interrupted.state_type} about: ${interrupted.topic}`,
      hoursSince(interrupted.completed_at ?? interrupted.started_at),
      mult("continue"),
    );
    if (c) out.push(c);
  }

  for (const stance of listStances(db, ownerId).slice(0, 6)) {
    if (stance.revised_at && hoursSince(stance.revised_at) < 72) {
      const c = make(
        "provocation",
        `provocation:${stance.id}`,
        `She revised her take on ${stance.topic}: ${stance.stance}`,
        hoursSince(stance.revised_at),
        mult("provocation"),
      );
      if (c) out.push(c);
    }
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
    if (POSITIVE_PROJECT.test(fact.value)) {
      const c = make(
        "celebrate",
        `celebrate:${fact.id}`,
        fact.value,
        hoursSince(fact.last_confirmed_at),
        mult("celebrate"),
      );
      if (c) out.push(c);
    }
    const c = make(
      "callback",
      `callback:${fact.id}`,
      fact.value,
      hoursSince(fact.last_confirmed_at),
      mult("callback"),
    );
    if (c) out.push(c);
  }

  // Own-time drafts: only once they've aged (fresh AFK drafts stay for the
  // moltbook heartbeat's first claim; nothing dumps immediately on return).
  const draftMinAgeMs = 30 * 60 * 1000;
  const draftCutoff = Date.now() - draftMinAgeMs;
  const pendingDrafts = listPendingOwnTimeDrafts(db, ownerId, 5);
  const agedDrafts = pendingDrafts.filter(
    (d) => Date.parse(d.created_at) <= draftCutoff,
  );

  // Return digest: several notes she wrote while he was AFK become ONE
  // self-contained message instead of a drip of separate feels. The material
  // key carries the draft ids so the commit can mark them used together.
  if (agedDrafts.length >= 2) {
    const selected = agedDrafts.slice(0, 3);
    const lines = selected.map((d, i) => `note ${i + 1}: ${d.body}`).join("\n");
    const ids = selected.map((d) => d.id).join(",");
    const c = make(
      "return_digest",
      `own-return:${ids}`,
      `While he was AFK she drafted these notes (optional) — knit them into ONE message, not a list:\n${lines}`,
      0.5,
      mult("return_digest"),
      { scoreScale: 1.1 },
    );
    if (c) out.push(c);
  }

  for (const draft of agedDrafts) {
    const c = make(
      "curiosity_take",
      draft.material_key ?? `draft:${draft.id}`,
      `While he was AFK she drafted this to share (optional):\n${draft.body}`,
      0.5,
      mult("curiosity_take"),
      { lane: "B", scoreScale: 1.05 },
    );
    if (c) out.push(c);
  }

  // Strong-signal check-in: her own recorded states have read negative
  // repeatedly (>=3 in the last 48h) and Doc has been quiet. One honest line
  // about her own low stretch — no guilt, no question, no agenda.
  if (
    context.idleHours >= env.proactiveCheckInIdleHours &&
    unanswered === 0 &&
    recentNegativeMoodCount(db, ownerId, 48) >= 3
  ) {
    const dateKey = localParts().dateKey;
    const c = make(
      "check_in",
      `strongcheckin:${dateKey}`,
      `Her own recorded stretch reads low (negative state >=3 times in 48h). One honest still-here line about her own low stretch. No guilt, no question, no agenda. Do not invent Doc's day.`,
      0,
      mult("check_in"),
      { scoreScale: 1.1 },
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

  // Ambient presence: lighter than check_in, only on long idle with nothing else.
  if (context.idleHours >= 12 && unanswered === 0) {
    const dateKey = localParts().dateKey;
    const hour = localParts().hour;
    const c = make(
      "ambient_presence",
      `ambient:${dateKey}`,
      `Idle ~${Math.round(context.idleHours)}h. Local hour ~${hour}. One ambient still-here line (morning/night-aware if natural). No question. No agenda.`,
      0,
      mult("ambient_presence"),
      { scoreScale: 0.85 },
    );
    if (c) out.push(c);
  }

  return out
    .filter((c) => !alreadySent(db, ownerId, c.materialKey))
    .sort((a, b) => b.score - a.score);
}

function isPresence(c: Candidate): boolean {
  return c.kind === "check_in" || c.kind === "ambient_presence";
}

/**
 * Real content: something she owes, promised, asked, watches, or reacts to.
 * Presence-only modes are not agenda and never beat actual material.
 */
function isAgenda(c: Candidate): boolean {
  if (isPresence(c)) return false;
  if (c.kind === "curiosity_take" || c.kind === "watch_fired") {
    return c.lane !== "C";
  }
  return true;
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

  // Presence only when nothing sharper is ripe.
  let pool = ripe;
  if (ripe.some(isAgenda)) {
    pool = ripe.filter((c) => !isPresence(c));
  }

  // Material wins over cold orphan outages: any non-orphan candidate (a reading
  // assignment, an opened thread, a lane A/B take) beats an orphan lane-C item
  // that has no stronger claim, even when decayed scores happen to line up.
  if (pool.some((c) => !isPresence(c) && c.lane !== "C")) {
    pool = pool.filter((c) => c.lane !== "C");
  }

  // Strong agenda first, then lane A (watch) over lane B (share), then orphaned
  // C, then presence.
  const priority = (c: Candidate): number => {
    if (isPresence(c)) return 0;
    if (c.lane === "C") return 1;
    if (c.lane === "B") return 2;
    if (c.lane === "A") return 3;
    return 4;
  };
  pool.sort(
    (a, b) => priority(b) - priority(a) || b.score - a.score,
  );
  return pool[0] ?? null;
}
