import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AllocationReceipt } from "./projection-allocator/receipt.js";
import type { RetrievalQuery } from "../retrieval/query.js";
import type { RetrievalInfrastructureState } from "../types.js";
import { getPrivateBudgetProjection, type PrivateBudgetProjection } from "../private-budget/ledger.js";

export type ThoughtDispatchDiagnosticCode =
  | "request_exceeds_tpm_budget"
  | "context_allocation_required_overflow"
  | "context_allocation_optional_degradation"
  | "transport_failover_unavailable_for_projection"
  | "provider_not_sent"
  | "provider_sent"
  | "provider_returned"
  | "parser_malformed"
  | "attention_deadline"
  | "cancelled"
  | "provider_unavailable"
  | "agent_not_ready";

export type ThoughtDispatchDiagnostic = {
  cycleId: string;
  generation: number;
  requestId: string;
  pass: number;
  code: ThoughtDispatchDiagnosticCode;
  stage: "allocation" | "attention_admission" | "provider_dispatch" | "parser";
  dispatchTruth: "not_sent" | "sent" | "unknown";
  quotaBucket?: string | null;
  estimatedInputTokens?: number | null;
  totalDemandTokens?: number | null;
  semanticProjectionHash?: string | null;
  dispatchMessagesHash?: string | null;
  primaryProvider?: string | null;
  primaryAttemptId?: string | null;
  primaryDispatchTruth?: "sent" | "not_sent" | "unknown" | null;
  suppressedProvider?: string | null;
  fallbackAttemptOrdinal?: number | null;
  fallbackFromAttemptId?: string | null;
  secondaryDispatchTruth?: "not_sent" | null;
  createdAtMs?: number;
};

export function defaultObservabilityDbPath(): string {
  return join(homedir(), ".composer-assistant", "cognitive-v021-observability.db");
}

export function initObservabilitySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS allocation_receipts (
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

    CREATE TABLE IF NOT EXISTS thought_dispatch_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      request_id TEXT NOT NULL,
      pass INTEGER NOT NULL,
      code TEXT NOT NULL CHECK(code IN (
        'request_exceeds_tpm_budget',
        'context_allocation_required_overflow',
        'context_allocation_optional_degradation',
        'transport_failover_unavailable_for_projection',
        'provider_not_sent',
        'provider_sent',
        'provider_returned',
        'parser_malformed',
        'attention_deadline',
        'cancelled',
        'provider_unavailable',
        'agent_not_ready'
      )),
      stage TEXT NOT NULL CHECK(stage IN ('allocation', 'attention_admission', 'provider_dispatch', 'parser')),
      dispatch_truth TEXT NOT NULL CHECK(dispatch_truth IN ('not_sent', 'sent', 'unknown')),
      quota_bucket TEXT,
      estimated_input_tokens INTEGER,
      total_demand_tokens INTEGER,
      semantic_projection_hash TEXT,
      dispatch_messages_hash TEXT,
      primary_provider TEXT,
      primary_attempt_id TEXT,
      primary_dispatch_truth TEXT CHECK(primary_dispatch_truth IS NULL OR primary_dispatch_truth IN ('sent', 'not_sent', 'unknown')),
      suppressed_provider TEXT,
      fallback_attempt_ordinal INTEGER,
      fallback_from_attempt_id TEXT,
      secondary_dispatch_truth TEXT CHECK(secondary_dispatch_truth IS NULL OR secondary_dispatch_truth IN ('not_sent')),
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alloc_receipts_cycle
      ON allocation_receipts (cycle_id, generation);

    CREATE INDEX IF NOT EXISTS idx_tdd_cycle
      ON thought_dispatch_diagnostics (cycle_id, generation);

    CREATE INDEX IF NOT EXISTS idx_tdd_code
      ON thought_dispatch_diagnostics (code, stage);
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
      INSERT INTO allocation_receipts (
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

  recordDiagnostic(diag: ThoughtDispatchDiagnostic, nowMs = Date.now()): void {
    const stmt = this.db.prepare(`
      INSERT INTO thought_dispatch_diagnostics (
        cycle_id, generation, request_id, pass, code, stage,
        dispatch_truth, quota_bucket, estimated_input_tokens,
        total_demand_tokens, semantic_projection_hash, dispatch_messages_hash,
        primary_provider, primary_attempt_id, primary_dispatch_truth,
        suppressed_provider, fallback_attempt_ordinal, fallback_from_attempt_id,
        secondary_dispatch_truth, created_at_ms
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      diag.cycleId,
      diag.generation,
      diag.requestId,
      diag.pass,
      diag.code,
      diag.stage,
      diag.dispatchTruth,
      diag.quotaBucket ?? null,
      diag.estimatedInputTokens ?? null,
      diag.totalDemandTokens ?? null,
      diag.semanticProjectionHash ?? null,
      diag.dispatchMessagesHash ?? null,
      diag.primaryProvider ?? null,
      diag.primaryAttemptId ?? null,
      diag.primaryDispatchTruth ?? null,
      diag.suppressedProvider ?? null,
      diag.fallbackAttemptOrdinal ?? null,
      diag.fallbackFromAttemptId ?? null,
      diag.secondaryDispatchTruth ?? null,
      diag.createdAtMs ?? nowMs,
    );
  }

  listReceipts(limit = 100): AllocationReceipt[] {
    const rows = this.db.prepare(`
      SELECT * FROM allocation_receipts
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

  listDiagnostics(limit = 100): ThoughtDispatchDiagnostic[] {
    const rows = this.db.prepare(`
      SELECT * FROM thought_dispatch_diagnostics
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(limit) as Array<{
      cycle_id: string;
      generation: number;
      request_id: string;
      pass: number;
      code: ThoughtDispatchDiagnosticCode;
      stage: "allocation" | "attention_admission" | "provider_dispatch" | "parser";
      dispatch_truth: "not_sent" | "sent" | "unknown";
      quota_bucket: string | null;
      estimated_input_tokens: number | null;
      total_demand_tokens: number | null;
      semantic_projection_hash: string | null;
      dispatch_messages_hash: string | null;
      primary_provider: string | null;
      primary_attempt_id: string | null;
      primary_dispatch_truth: "sent" | "not_sent" | "unknown" | null;
      suppressed_provider: string | null;
      fallback_attempt_ordinal: number | null;
      fallback_from_attempt_id: string | null;
      secondary_dispatch_truth: "not_sent" | null;
      created_at_ms: number;
    }>;

    return rows.map((r) => ({
      cycleId: r.cycle_id,
      generation: r.generation,
      requestId: r.request_id,
      pass: r.pass,
      code: r.code,
      stage: r.stage,
      dispatchTruth: r.dispatch_truth,
      quotaBucket: r.quota_bucket,
      estimatedInputTokens: r.estimated_input_tokens,
      totalDemandTokens: r.total_demand_tokens,
      semanticProjectionHash: r.semantic_projection_hash,
      dispatchMessagesHash: r.dispatch_messages_hash,
      primaryProvider: r.primary_provider,
      primaryAttemptId: r.primary_attempt_id,
      primaryDispatchTruth: r.primary_dispatch_truth,
      suppressedProvider: r.suppressed_provider,
      fallbackAttemptOrdinal: r.fallback_attempt_ordinal,
      fallbackFromAttemptId: r.fallback_from_attempt_id,
      secondaryDispatchTruth: r.secondary_dispatch_truth,
      createdAtMs: r.created_at_ms,
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

export function recordAllocationReceipt(db: DatabaseSync, receipt: AllocationReceipt, nowMs = Date.now()): void {
  const store = new ObservabilityStore(db);
  store.recordReceipt(receipt, nowMs);
}

export function recordDiagnostic(db: DatabaseSync, diag: ThoughtDispatchDiagnostic, nowMs = Date.now()): void {
  const store = new ObservabilityStore(db);
  store.recordDiagnostic(diag, nowMs);
}

/** Authoritative W7 budget diagnostic. This is a read-only sidecar projection. */
export function getPrivateBudgetDiagnostics(
  sidecar: DatabaseSync,
  input: { conversationId: string; policyId: string; wallClockNowMs?: number },
): PrivateBudgetProjection {
  return getPrivateBudgetProjection(sidecar, input);
}
