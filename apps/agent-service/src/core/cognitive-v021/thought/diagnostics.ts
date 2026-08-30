import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AllocationReceipt } from "./projection-allocator/receipt.js";
import type { RetrievalQuery } from "../retrieval/query.js";
import type { RetrievalInfrastructureState } from "../types.js";

export function defaultObservabilityDbPath(): string {
  return join(homedir(), ".composer-assistant", "cognitive-v021-observability.db");
}

export function initObservabilitySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS thought_allocation_receipts (
      request_id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      policy_id TEXT NOT NULL,
      policy_version INTEGER NOT NULL,
      quota_bucket TEXT NOT NULL,
      hard_tpm INTEGER NOT NULL,
      max_output_tokens INTEGER NOT NULL,
      estimated_input_tokens INTEGER NOT NULL,
      estimated_output_tokens INTEGER NOT NULL,
      total_demand_tokens INTEGER NOT NULL,
      headroom_tokens INTEGER NOT NULL,
      compression INTEGER NOT NULL,
      required_overflow INTEGER NOT NULL,
      included_wire_bytes INTEGER NOT NULL,
      decision_json TEXT NOT NULL,
      semantic_projection_hash TEXT NOT NULL,
      dispatch_messages_hash TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thought_query_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      trigger_terms_json TEXT NOT NULL,
      trigger_fts_query TEXT,
      concern_terms_json TEXT NOT NULL,
      concern_fts_query TEXT,
      exact_keys_json TEXT NOT NULL,
      empty_reason TEXT,
      derived_state TEXT NOT NULL,
      hits_count INTEGER NOT NULL,
      miss INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alloc_receipts_cycle
      ON thought_allocation_receipts (cycle_id, generation);

    CREATE INDEX IF NOT EXISTS idx_query_diag_cycle
      ON thought_query_diagnostics (cycle_id, generation);
  `);
}

export class ObservabilityStore {
  readonly db: DatabaseSync;
  private readonly dbPath: string;

  constructor(dbOrPath?: string | DatabaseSync) {
    if (typeof dbOrPath === "object" && dbOrPath !== null) {
      this.db = dbOrPath;
      this.dbPath = ":memory:";
    } else {
      this.dbPath = dbOrPath ?? defaultObservabilityDbPath();
      if (this.dbPath !== ":memory:") {
        const parent = dirname(this.dbPath);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      }
      this.db = new DatabaseSync(this.dbPath);
    }
    initObservabilitySchema(this.db);
  }

  recordReceipt(receipt: AllocationReceipt, nowMs = Date.now()): void {
    const stmt = this.db.prepare(`
      INSERT INTO thought_allocation_receipts (
        request_id, cycle_id, generation, policy_id, policy_version,
        quota_bucket, hard_tpm, max_output_tokens, estimated_input_tokens,
        estimated_output_tokens, total_demand_tokens, headroom_tokens,
        compression, required_overflow, included_wire_bytes, decision_json,
        semantic_projection_hash, dispatch_messages_hash, created_at_ms
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(request_id) DO UPDATE SET
        estimated_input_tokens = excluded.estimated_input_tokens,
        total_demand_tokens = excluded.total_demand_tokens,
        headroom_tokens = excluded.headroom_tokens,
        decision_json = excluded.decision_json,
        dispatch_messages_hash = excluded.dispatch_messages_hash
    `);

    stmt.run(
      receipt.requestId,
      receipt.cycleId,
      receipt.generation,
      receipt.policyId,
      receipt.policyVersion,
      receipt.quotaBucket,
      receipt.hardTpm,
      receipt.maxOutputTokens,
      receipt.estimatedInputTokens,
      receipt.estimatedOutputTokens,
      receipt.totalDemandTokens,
      receipt.headroomTokens,
      receipt.compression ? 1 : 0,
      receipt.requiredOverflow ? 1 : 0,
      receipt.decision.includedWireBytes,
      JSON.stringify(receipt.decision),
      receipt.semanticProjectionHash,
      receipt.dispatchMessagesHash,
      nowMs,
    );
  }

  recordQueryDiagnostic(input: {
    requestId: string;
    cycleId: string;
    generation: number;
    query: RetrievalQuery;
    derivedState: RetrievalInfrastructureState;
    hitsCount: number;
    miss: boolean;
    nowMs?: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO thought_query_diagnostics (
        request_id, cycle_id, generation, trigger_terms_json,
        trigger_fts_query, concern_terms_json, concern_fts_query,
        exact_keys_json, empty_reason, derived_state, hits_count,
        miss, created_at_ms
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      input.requestId,
      input.cycleId,
      input.generation,
      JSON.stringify(input.query.rawTriggerTerms),
      input.query.rawTriggerFtsQuery,
      JSON.stringify(input.query.concernTerms),
      input.query.concernFtsQuery,
      JSON.stringify(input.query.exactKeys),
      input.query.emptyReason ?? null,
      input.derivedState,
      input.hitsCount,
      input.miss ? 1 : 0,
      input.nowMs ?? Date.now(),
    );
  }

  listReceipts(limit = 100): AllocationReceipt[] {
    const rows = this.db.prepare(`
      SELECT * FROM thought_allocation_receipts
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(limit) as Array<{
      request_id: string;
      cycle_id: string;
      generation: number;
      policy_id: string;
      policy_version: number;
      quota_bucket: string;
      hard_tpm: number;
      max_output_tokens: number;
      estimated_input_tokens: number;
      estimated_output_tokens: number;
      total_demand_tokens: number;
      headroom_tokens: number;
      compression: number;
      required_overflow: number;
      included_wire_bytes: number;
      decision_json: string;
      semantic_projection_hash: string;
      dispatch_messages_hash: string;
    }>;

    return rows.map((r) => ({
      requestId: r.request_id,
      cycleId: r.cycle_id,
      generation: r.generation,
      policyId: r.policy_id,
      policyVersion: r.policy_version,
      quotaBucket: r.quota_bucket,
      hardTpm: r.hard_tpm,
      maxOutputTokens: r.max_output_tokens,
      estimatedInputTokens: r.estimated_input_tokens,
      estimatedOutputTokens: r.estimated_output_tokens,
      totalDemandTokens: r.total_demand_tokens,
      headroomTokens: r.headroom_tokens,
      compression: Boolean(r.compression),
      requiredOverflow: Boolean(r.required_overflow),
      decision: JSON.parse(r.decision_json),
      semanticProjectionHash: r.semantic_projection_hash,
      dispatchMessagesHash: r.dispatch_messages_hash,
    }));
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // Ignore close error
    }
  }
}

export function openObservabilityStore(dbOrPath?: string | DatabaseSync): ObservabilityStore {
  return new ObservabilityStore(dbOrPath);
}
