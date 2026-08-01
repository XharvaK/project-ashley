import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "../memory/kv.js";

export type ReadingAssignment = {
  id: string;
  topic: string;
  requestedAt: string;
  status: "pending" | "completed";
  summary?: string;
};

const ASSIGNMENT_PATTERNS = [
  /\b(?:read|browse|research|look into|check out)\s+(?:about\s+|on\s+)?(.+?)(?:\s+when|\s+if|\s+when you|\s+later|\s+when you're|\s+in your|\s+on your|\s*\.|\s*$)/i,
  /\b(.+?)\s+(?:hakkında|üzerine)\s+(?:oku|bak|araştır)/i,
];

export function detectReadingAssignment(text: string): string | null {
  for (const pattern of ASSIGNMENT_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const topic = match[1].trim().replace(/^about\s+/i, "");
      if (topic.length >= 3 && topic.length <= 100) {
        return topic;
      }
    }
  }
  return null;
}

export function queueReadingAssignment(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
): void {
  const key = `reading_assignments:${ownerId}`;
  const existingJson = getKv(db, key);
  const assignments: ReadingAssignment[] = existingJson
    ? (JSON.parse(existingJson) as ReadingAssignment[])
    : [];

  const newAssignment: ReadingAssignment = {
    id: `assign_${Date.now()}`,
    topic,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };

  assignments.unshift(newAssignment);
  // Keep max 10
  setKv(db, key, JSON.stringify(assignments.slice(0, 10)));
}

export function listPendingAssignments(
  db: DatabaseSync,
  ownerId: string,
): ReadingAssignment[] {
  const key = `reading_assignments:${ownerId}`;
  const existingJson = getKv(db, key);
  if (!existingJson) return [];
  const assignments: ReadingAssignment[] = JSON.parse(existingJson);
  return assignments.filter((a) => a.status === "pending");
}

export function markAssignmentCompleted(
  db: DatabaseSync,
  ownerId: string,
  id: string,
  summary: string,
): void {
  const key = `reading_assignments:${ownerId}`;
  const existingJson = getKv(db, key);
  if (!existingJson) return;
  const assignments: ReadingAssignment[] = JSON.parse(existingJson);
  const target = assignments.find((a) => a.id === id);
  if (target) {
    target.status = "completed";
    target.summary = summary;
  }
  setKv(db, key, JSON.stringify(assignments));
}
