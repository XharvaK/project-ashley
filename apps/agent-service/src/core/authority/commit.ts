import { payloadHash } from "./hash.js";
import {
  authorizationMatchesPrepared as authorizationMatchesPrepared,
  consumeAuthorization,
  prepareEffect,
  revalidatePreparedEffect,
} from "./prepared-effect.js";
import type {
  AuthorityEvaluation,
  AuthorityRefusal,
  EffectAuthorization,
  PreparedEffect,
} from "./types.js";

export type CommitDecision =
  | {
      outcome: "commit";
      authorization: EffectAuthorization;
      prepared: PreparedEffect;
    }
  | AuthorityRefusal;

/**
 * Fail-closed COMMIT gate. A PreparedEffect is never permission.
 */
export function decideCommunicationCommit(input: {
  evaluation: AuthorityEvaluation;
  payloadText: string;
  previousPrepared?: PreparedEffect;
  nowMs?: number;
}): CommitDecision {
  if (input.evaluation.outcome !== "granted") {
    return input.evaluation;
  }
  const authorization = input.evaluation.authorization;
  const preparedResult = input.previousPrepared
    ? revalidatePreparedEffect({
        authorization,
        previous: input.previousPrepared,
        nextPayloadText: input.payloadText,
        nowMs: input.nowMs,
      })
    : prepareEffect({
        authorization,
        payloadText: input.payloadText,
        nowMs: input.nowMs,
      });
  if (preparedResult.outcome !== "prepared") {
    return preparedResult;
  }
  if (!authorizationMatchesPrepared(authorization, preparedResult.prepared)) {
    return {
      outcome: "refused",
      intent: input.evaluation.intent,
      code: "authorization_not_current",
      detail: "prepared_effect_does_not_match_authorization",
    };
  }
  if (preparedResult.prepared.payloadHash !== payloadHash(input.payloadText)) {
    return {
      outcome: "refused",
      intent: input.evaluation.intent,
      code: "payload_changed",
      detail: "commit_payload_does_not_match_prepared_effect",
    };
  }
  return {
    outcome: "commit",
    authorization: consumeAuthorization(authorization),
    prepared: preparedResult.prepared,
  };
}
