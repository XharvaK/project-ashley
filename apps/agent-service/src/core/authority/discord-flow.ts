import type { DatabaseSync } from "node:sqlite";
import { persistAuthorityAudit, auditFromEvaluation } from "./audit.js";
import { decideCommunicationCommit } from "./commit.js";
import { evaluateAuthority } from "./kernel.js";
import { prepareEffect } from "./prepared-effect.js";
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
  preHonestyText?: string;
  honestyMutated?: boolean;
  nowMs?: number;
}):
  | { outcome: "commit"; evaluation: AuthorityEvaluation; prepared: PreparedEffect }
  | AuthorityRefusal {
  if (input.evaluation.outcome !== "granted") {
    persistAuthorityAudit(input.db, auditFromEvaluation(input.evaluation));
    return input.evaluation;
  }
  let previousPrepared = input.previousPrepared;
  if (
    previousPrepared === undefined &&
    input.honestyMutated === true &&
    input.preHonestyText !== undefined
  ) {
    const prior = prepareEffect({
      authorization: input.evaluation.authorization,
      payloadText: input.preHonestyText,
      nowMs: input.nowMs,
    });
    if (prior.outcome !== "prepared") {
      persistAuthorityAudit(input.db, auditFromEvaluation(prior));
      return prior;
    }
    previousPrepared = prior.prepared;
  }
  const decision = decideCommunicationCommit({
    evaluation: input.evaluation,
    payloadText: input.payloadText,
    previousPrepared,
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
