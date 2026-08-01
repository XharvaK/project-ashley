import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "../memory/kv.js";

export type ResearchThreadKey =
  | "psychopharmacology_psychonautics"
  | "tech_ai"
  | "dynamic_wandering";

export type ResearchThread = {
  key: ResearchThreadKey;
  title: string;
  query: string;
  notes: string[];
  lastResearchedAt: string | null;
};

const DEFAULT_THREADS: ResearchThread[] = [
  {
    key: "psychopharmacology_psychonautics",
    title: "Psychopharmacology & Psychonautics & Human Psychology",
    query: "receptor kinetics binding affinity neuroplasticity psychonautics states of consciousness",
    notes: [],
    lastResearchedAt: null,
  },
  {
    key: "tech_ai",
    title: "Technology & Artificial Intelligence",
    query: "open weights LLM architecture systems performance database internals distributed systems",
    notes: [],
    lastResearchedAt: null,
  },
  {
    key: "dynamic_wandering",
    title: "Dynamic Wandering Interest",
    query: "synthesis cognitive models immersive systems sound design",
    notes: [],
    lastResearchedAt: null,
  },
];

export function getInterestNotebook(
  db: DatabaseSync,
  ownerId: string,
): ResearchThread[] {
  const key = `interest_notebook:${ownerId}`;
  const existingJson = getKv(db, key);
  if (!existingJson) return DEFAULT_THREADS;
  try {
    return JSON.parse(existingJson);
  } catch {
    return DEFAULT_THREADS;
  }
}

export function saveInterestNotebook(
  db: DatabaseSync,
  ownerId: string,
  threads: ResearchThread[],
): void {
  const key = `interest_notebook:${ownerId}`;
  setKv(db, key, JSON.stringify(threads));
}

export function recordThreadNote(
  db: DatabaseSync,
  ownerId: string,
  threadKey: ResearchThreadKey,
  note: string,
): void {
  const threads = getInterestNotebook(db, ownerId);
  const target = threads.find((t) => t.key === threadKey);
  if (target) {
    target.notes.unshift(note);
    if (target.notes.length > 10) target.notes.pop();
    target.lastResearchedAt = new Date().toISOString();
  }
  saveInterestNotebook(db, ownerId, threads);
}

export function updateDynamicTopic(
  db: DatabaseSync,
  ownerId: string,
  newTitle: string,
  newQuery: string,
): void {
  const threads = getInterestNotebook(db, ownerId);
  const target = threads.find((t) => t.key === "dynamic_wandering");
  if (target) {
    target.title = newTitle;
    target.query = newQuery;
  }
  saveInterestNotebook(db, ownerId, threads);
}

export function getActiveResearchTopic(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const threads = getInterestNotebook(db, ownerId);
  const active = threads
    .filter((t) => t.lastResearchedAt)
    .sort(
      (a, b) =>
        Date.parse(b.lastResearchedAt!) - Date.parse(a.lastResearchedAt!),
    )[0];
  return active ? active.title : null;
}
