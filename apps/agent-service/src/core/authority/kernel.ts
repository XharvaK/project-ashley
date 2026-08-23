import { newAuthorityId } from "./hash.js";
import { evaluateCommunicationPolicy } from "./communication-policy.js";
import type {
  AuthorityEvaluation,
  EffectAuthorization,
  EffectIntent,
} from "./types.js";

const GRANT_TTL_MS = 10 * 60 * 1000;

function issueAuthorization(intent: EffectIntent, nowMs: number): EffectAuthorization {
  return {
    kind: "effect_authorization",
    authorizationId: newAuthorityId("authz"),
    intentId: intent.intentId,
    intentHash: intent.intentHash,
    class: intent.class,
    trigger: intent.trigger,
    audience: { ...intent.audience },
    mechanism: intent.mechanism,
    payloadPredicate: intent.payloadPredicate,
    evidenceRefs: [...intent.evidenceRefs],
    nonce: newAuthorityId("nonce"),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + GRANT_TTL_MS,
    replayLimit: 1,
    consumed: false,
    constraints: [
      "non_transferable",
      "single_replay",
      "payload_bound",
      "audience_bound",
      "mechanism_bound",
      "honesty_mutation_requires_revalidation",
    ],
  };
}

/**
 * Authority Kernel evaluator. Returns a bounded grant or a typed refusal.
 * Never returns a generic allowed boolean.
 */
export function evaluateAuthority(input: {
  intent: EffectIntent;
  nowMs?: number;
}): AuthorityEvaluation {
  const nowMs = input.nowMs ?? Date.now();
  const intent = input.intent;
  const policy = evaluateCommunicationPolicy(intent);
  if (!policy.ok) {
    return {
      outcome: "refused",
      intent,
      code: policy.code,
      detail: policy.detail,
    };
  }
  return {
    outcome: "granted",
    intent,
    authorization: issueAuthorization(intent, nowMs),
  };
}
