import type { DatabaseSync } from "node:sqlite";
import { persistAuthorityAudit, auditFromEvaluation } from "./audit.js";
import { decideCommunicationCommit } from "./commit.js";
import { evaluateAuthority } from "./kernel.js";
import type {
  AuthorityEvaluation,
  AuthorityRefusal,
  EffectIntent,
  PreparedEffect,
} from "./types.js";

export function evaluateAndAuditAuthority(
  db: DatabaseSync,
  intent: EffectIntent,
  nowMs?: number,
): AuthorityEvaluation {
  const evaluation = evaluateAuthority({ intent, nowMs });
  persistAuthorityAudit(db, auditFromEvaluation(evaluation));
  return evaluation;
}

export function prepareCommitAndAudit(input: {
  db: DatabaseSync;
  evaluation: AuthorityEvaluation;
  payloadText: string;
  previousPrepared?: PreparedEffect;
  nowMs?: number;
}):
  | { outcome: "commit"; evaluation: AuthorityEvaluation; prepared: PreparedEffect }
  | AuthorityRefusal {
  if (input.evaluation.outcome !== "granted") {
    persistAuthorityAudit(input.db, auditFromEvaluation(input.evaluation));
    return input.evaluation;
  }
  const decision = decideCommunicationCommit({
    evaluation: input.evaluation,
    payloadText: input.payloadText,
    previousPrepared: input.previousPrepared,
    nowMs: input.nowMs,
  });
  if (decision.outcome !== "commit") {
    persistAuthorityAudit(input.db, auditFromEvaluation(decision));
    return decision;
  }
  const granted: AuthorityEvaluation = {
    outcome: "granted",
    intent: input.evaluation.intent,
    authorization: decision.authorization,
  };
  persistAuthorityAudit(
    input.db,
    auditFromEvaluation(granted, decision.prepared),
  );
  return {
    outcome: "commit",
    evaluation: granted,
    prepared: decision.prepared,
  };
}
