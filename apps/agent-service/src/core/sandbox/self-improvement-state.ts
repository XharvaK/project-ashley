/**
 * Durable persistence for the self-improvement clone state (Autonomous
 * Engineering Workstation wave). The clone metadata is host/operator
 * configuration; this store simply makes the durable review interval survive
 * restarts so `isReviewDue`/`buildWeeklyReview` have a stable anchor.
 */

import type { DatabaseSync } from "node:sqlite";
import type { SelfImprovementCloneState } from "./self-improvement.js";

const DDL = `
CREATE TABLE IF NOT EXISTS self_improvement_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state_json TEXT NOT NULL
);`;

export function saveCloneState(db: DatabaseSync, state: SelfImprovementCloneState): void {
  db.exec(DDL);
  db.prepare(
    `INSERT OR REPLACE INTO self_improvement_state (id, state_json) VALUES (1, ?)`,
  ).run(JSON.stringify(state));
}

export function loadCloneState(db: DatabaseSync): SelfImprovementCloneState | null {
  try {
    const row = db
      .prepare(`SELECT state_json FROM self_improvement_state WHERE id = 1`)
      .get() as { state_json: string } | undefined;
    return row ? (JSON.parse(row.state_json) as SelfImprovementCloneState) : null;
  } catch {
    return null;
  }
}
