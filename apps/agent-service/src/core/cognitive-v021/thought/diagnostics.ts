import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AllocationDiagnostics,
  AllocationReceipt,
  AllocationTokenBreakdown,
} from "./projection-allocator/receipt.js";
import { DEFAULT_SEMANTIC_PROJECTION_ENVELOPE, type SemanticProjectionEnvelope } from "./projection-allocator/budget.js";
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

export type ThoughtCycleTokenMetrics = {
  first_pass_total_input_tokens: number;
  total_cycle_input_tokens_including_retries: number;
  retry_amplification_ratio: number;
  request_count: number;
};

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
  requiredOverflowSection?: string | null;
  semanticBudgetTokens?: number | null;
  overflowTokens?: number | null;
  cycleMetrics?: ThoughtCycleTokenMetrics | null;
  createdAtMs?: number;
};

function emptyTokenBreakdown(): AllocationTokenBreakdown {
  return {
    static_contract_tokens: 0,
    conversation_tokens: 0,
    working_context_tokens: 0,
    identity_kernel_tokens: 0,
    domain_pointer_tokens: 0,
    learned_self_tokens: 0,
    retrieval_tokens: 0,
    observations_tokens: 0,
    in_flight_effect_tokens: 0,
    authority_revision_feedback_tokens: 0,
    omitted_for_budget_tokens: 0,
    omitted_for_budget_count: 0,
    required_overflow_count: 0,
  };
}

function receiptDecisionEnvelope(receipt: AllocationReceipt): Record<string, unknown> {
  return {
    ...receipt.decision,
    __semanticProjectionEnvelope: receipt.semanticProjectionEnvelope,
    __tokenBreakdown: receipt.tokenBreakdown,
    ...(receipt.diagnostics ? { __allocationDiagnostics: receipt.diagnostics } : {}),
  };
}

function parseCycleMetrics(value: unknown): ThoughtCycleTokenMetrics | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ThoughtCycleTokenMetrics>;
    if (
      typeof parsed.first_pass_total_input_tokens !== "number" ||
      typeof parsed.total_cycle_input_tokens_including_retries !== "number" ||
      typeof parsed.retry_amplification_ratio !== "number" ||
      typeof parsed.request_count !== "number"
    ) return null;
    return {
      first_pass_total_input_tokens: parsed.first_pass_total_input_tokens,
      total_cycle_input_tokens_including_retries: parsed.total_cycle_input_tokens_including_retries,
      retry_amplification_ratio: parsed.retry_amplification_ratio,
      request_count: parsed.request_count,
    };
  } catch {
    return null;
  }
}

type RequiredOverflowDiagnosticDetails = {
  requiredOverflowSection: string | null;
  semanticBudgetTokens: number | null;
  overflowTokens: number | null;
};

function requiredOverflowPayload(diag: ThoughtDispatchDiagnostic): Record<string, unknown> | null {
  const hasDetails = diag.requiredOverflowSection !== undefined
    || diag.semanticBudgetTokens !== undefined
    || diag.overflowTokens !== undefined;
  if (!hasDetails) return null;
  return {
    required_overflow_section: diag.requiredOverflowSection ?? null,
    estimated_input_tokens: diag.estimatedInputTokens ?? null,
    semantic_budget_tokens: diag.semanticBudgetTokens ?? null,
    overflow_tokens: diag.overflowTokens ?? null,
  };
}

function parseRequiredOverflowDetails(value: unknown): RequiredOverflowDiagnosticDetails | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const hasDetails = typeof parsed.required_overflow_section === "string"
      || typeof parsed.semantic_budget_tokens === "number"
      || typeof parsed.overflow_tokens === "number";
    if (!hasDetails) return null;
    return {
      requiredOverflowSection: typeof parsed.required_overflow_section === "string"
        ? parsed.required_overflow_section
        : null,
      semanticBudgetTokens: typeof parsed.semantic_budget_tokens === "number"
        ? parsed.semantic_budget_tokens
        : null,
      overflowTokens: typeof parsed.overflow_tokens === "number"
        ? parsed.overflow_tokens
        : null,
    };
  } catch {
    return null;
  }
}

function diagnosticPayload(diag: ThoughtDispatchDiagnostic): string | null {
  const overflowPayload = requiredOverflowPayload(diag);
  if (overflowPayload) return JSON.stringify(overflowPayload);
  return diag.cycleMetrics ? JSON.stringify(diag.cycleMetrics) : null;
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

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
      cycle_metrics_json TEXT,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alloc_receipts_cycle
      ON allocation_receipts (cycle_id, generation);

    CREATE INDEX IF NOT EXISTS idx_tdd_cycle
      ON thought_dispatch_diagnostics (cycle_id, generation);

    CREATE INDEX IF NOT EXISTS idx_tdd_code
      ON thought_dispatch_diagnostics (code, stage);
  `);
  // This is an additive column on the dedicated diagnostic sidecar. It does
  // not alter nuclear.db or any production schema migration contract.
  ensureColumn(db, "thought_dispatch_diagnostics", "cycle_metrics_json", "TEXT");
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
      JSON.stringify(receiptDecisionEnvelope(receipt)),
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
        secondary_dispatch_truth, cycle_metrics_json, created_at_ms
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
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
      diagnosticPayload(diag),
      diag.createdAtMs ?? nowMs,
    );
  }

  /** Record one cycle aggregate without adding a second telemetry store. */
  recordCycleMetrics(input: {
    cycleId: string;
    generation: number;
    requestId: string;
    pass: number;
    metrics: ThoughtCycleTokenMetrics;
    dispatchTruth?: "sent" | "unknown";
    nowMs?: number;
  }): void {
    if (input.metrics.request_count < 1) return;
    const existing = this.db.prepare(
      `SELECT id FROM thought_dispatch_diagnostics
        WHERE cycle_id = ? AND generation = ?
        ORDER BY id DESC LIMIT 1`,
    ).get(input.cycleId, input.generation) as { id?: number } | undefined;
    if (existing?.id !== undefined) {
      this.db.prepare(
        `UPDATE thought_dispatch_diagnostics
            SET cycle_metrics_json = ?,
                estimated_input_tokens = ?,
                total_demand_tokens = ?
          WHERE id = ?`,
      ).run(
        JSON.stringify(input.metrics),
        input.metrics.first_pass_total_input_tokens,
        input.metrics.total_cycle_input_tokens_including_retries,
        existing.id,
      );
      return;
    }
    this.recordDiagnostic({
      cycleId: input.cycleId,
      generation: input.generation,
      requestId: input.requestId,
      pass: input.pass,
      code: "provider_returned",
      stage: "provider_dispatch",
      dispatchTruth: input.dispatchTruth ?? "sent",
      estimatedInputTokens: input.metrics.first_pass_total_input_tokens,
      totalDemandTokens: input.metrics.total_cycle_input_tokens_including_retries,
      cycleMetrics: input.metrics,
      createdAtMs: input.nowMs,
    }, input.nowMs);
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

    return rows.map((r) => {
      const storedDecision = JSON.parse(r.decision_json) as Record<string, unknown>;
      const semanticProjectionEnvelope = storedDecision.__semanticProjectionEnvelope;
      const tokenBreakdown = storedDecision.__tokenBreakdown;
      const diagnostics = storedDecision.__allocationDiagnostics;
      delete storedDecision.__semanticProjectionEnvelope;
      delete storedDecision.__tokenBreakdown;
      delete storedDecision.__allocationDiagnostics;
      return {
        requestId: r.request_id,
        cycleId: r.cycle_id,
        generation: r.generation,
        policyId: r.policy_id,
        policyVersion: r.policy_version,
        semanticProjectionEnvelope:
          semanticProjectionEnvelope && typeof semanticProjectionEnvelope === "object"
            ? semanticProjectionEnvelope as SemanticProjectionEnvelope
            : DEFAULT_SEMANTIC_PROJECTION_ENVELOPE,
        tokenBreakdown:
          tokenBreakdown && typeof tokenBreakdown === "object"
            ? tokenBreakdown as AllocationTokenBreakdown
            : emptyTokenBreakdown(),
        ...(diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)
          ? { diagnostics: diagnostics as AllocationDiagnostics }
          : {}),
        quotaBucket: r.quota_bucket,
        hardTpm: r.hard_tpm,
        maxOutputTokens: r.max_output_tokens,
        estimatedInputTokens: r.estimated_input_tokens,
        estimatedOutputTokens: r.estimated_output_tokens,
        totalDemandTokens: r.total_demand_tokens,
        headroomTokens: r.headroom_tokens,
        compression: Boolean(r.compression),
        requiredOverflow: Boolean(r.required_overflow),
        decision: storedDecision as AllocationReceipt["decision"],
        semanticProjectionHash: r.semantic_projection_hash,
        dispatchMessagesHash: r.dispatch_messages_hash,
      };
    });
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
      cycle_metrics_json: string | null;
      created_at_ms: number;
    }>;

    return rows.map((r) => {
      const overflowDetails = parseRequiredOverflowDetails(r.cycle_metrics_json);
      return {
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
        ...(overflowDetails ?? {}),
        cycleMetrics: parseCycleMetrics(r.cycle_metrics_json),
        createdAtMs: r.created_at_ms,
      };
    });
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

export function recordThoughtCycleMetrics(
  db: DatabaseSync,
  input: {
    cycleId: string;
    generation: number;
    requestId: string;
    pass: number;
    metrics: ThoughtCycleTokenMetrics;
    dispatchTruth?: "sent" | "unknown";
    nowMs?: number;
  },
): void {
  const store = new ObservabilityStore(db);
  store.recordCycleMetrics(input);
}

/** Authoritative W7 budget diagnostic. This is a read-only sidecar projection. */
export function getPrivateBudgetDiagnostics(
  sidecar: DatabaseSync,
  input: { conversationId: string; policyId: string; wallClockNowMs?: number },
): PrivateBudgetProjection {
  return getPrivateBudgetProjection(sidecar, input);
}
