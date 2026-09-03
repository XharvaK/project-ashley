import type { DatabaseSync } from "node:sqlite";
import type {
  AuthorityAuditRecord,
  AuthorityEvaluation,
  PreparedEffect,
} from "./types.js";

export function auditFromEvaluation(
  evaluation: AuthorityEvaluation,
  prepared?: PreparedEffect,
): AuthorityAuditRecord {
  if (evaluation.outcome === "granted") {
    return {
      intentId: evaluation.intent.intentId,
      intentHash: evaluation.intent.intentHash,
      authorizationId: evaluation.authorization.authorizationId,
      outcome: "granted",
      code: "granted",
      class: evaluation.intent.class,
      producer: evaluation.intent.producer,
      decisionId: evaluation.intent.agencyDecisionId,
      payloadHash: prepared?.payloadHash ?? null,
      atMs: evaluation.authorization.issuedAtMs,
    };
  }
  return {
    intentId: evaluation.intent.intentId,
    intentHash: evaluation.intent.intentHash,
    authorizationId: null,
    outcome: "refused",
    code: evaluation.code,
    class: evaluation.intent.class,
    producer: evaluation.intent.producer,
    decisionId: evaluation.intent.agencyDecisionId,
    payloadHash: prepared?.payloadHash ?? null,
    atMs: evaluation.intent.createdAtMs,
  };
}

export function persistAuthorityAudit(
  db: DatabaseSync,
  record: AuthorityAuditRecord,
): void {
  const key =
    record.decisionId != null
      ? `authority:eval:decision:${record.decisionId}`
      : `authority:eval:intent:${record.intentId}`;
  db.prepare(
    `INSERT INTO kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, JSON.stringify(record));
}

export function readAuthorityAudit(
  db: DatabaseSync,
  decisionId: number,
): AuthorityAuditRecord | null {
  const row = db
    .prepare(`SELECT value FROM kv WHERE key = ?`)
    .get(`authority:eval:decision:${decisionId}`) as { value?: string } | undefined;
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as AuthorityAuditRecord;
  } catch {
    return null;
  }
}
