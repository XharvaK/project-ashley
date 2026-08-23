import { preserveCommunicationClass } from "./class-preservation.js";
import { payloadHash } from "./hash.js";
import type {
  AuthorityRefusal,
  EffectAuthorization,
  EffectIntent,
  PreparedEffect,
} from "./types.js";

export type PrepareResult =
  | { outcome: "prepared"; prepared: PreparedEffect }
  | AuthorityRefusal;

function stubIntent(authorization: EffectAuthorization): EffectIntent {
  return {
    kind: "effect_intent",
    intentId: authorization.intentId,
    intentHash: authorization.intentHash,
    domain: "communication",
    direction: "present",
    mechanism: authorization.mechanism,
    class: authorization.class,
    trigger: authorization.trigger,
    audience: authorization.audience,
    agencyDecisionId: null,
    agencyKind: "prepared",
    agencyAdmitted: true,
    producer: "agency_runtime",
    evidenceRefs: authorization.evidenceRefs,
    payloadPredicate: authorization.payloadPredicate,
    createdAtMs: authorization.issuedAtMs,
  };
}

function refuse(
  authorization: EffectAuthorization,
  code: AuthorityRefusal["code"],
  detail: string,
): AuthorityRefusal {
  return {
    outcome: "refused",
    intent: stubIntent(authorization),
    code,
    detail,
  };
}

export function prepareEffect(input: {
  authorization: EffectAuthorization;
  payloadText: string;
  nowMs?: number;
}): PrepareResult {
  const authorization = input.authorization;
  if (authorization.consumed) {
    return refuse(authorization, "grant_consumed", "authorization_already_consumed");
  }
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs > authorization.expiresAtMs) {
    return refuse(authorization, "grant_expired", "authorization_expired");
  }
  const preservation = preserveCommunicationClass({
    communicationClass: authorization.class,
    text: input.payloadText,
  });
  if (!preservation.ok) {
    return refuse(authorization, preservation.code, preservation.detail);
  }
  return {
    outcome: "prepared",
    prepared: {
      kind: "prepared_effect",
      authorizationId: authorization.authorizationId,
      intentHash: authorization.intentHash,
      class: authorization.class,
      payloadText: input.payloadText,
      payloadHash: payloadHash(input.payloadText),
      preparedAtMs: nowMs,
    },
  };
}

export function revalidatePreparedEffect(input: {
  authorization: EffectAuthorization;
  previous: PreparedEffect;
  nextPayloadText: string;
  nowMs?: number;
}): PrepareResult {
  if (payloadHash(input.nextPayloadText) === input.previous.payloadHash) {
    return { outcome: "prepared", prepared: input.previous };
  }
  if (input.authorization.authorizationId !== input.previous.authorizationId) {
    return refuse(
      input.authorization,
      "non_transferable",
      "prepared_effect_authorization_mismatch",
    );
  }
  const prepared = prepareEffect({
    authorization: input.authorization,
    payloadText: input.nextPayloadText,
    nowMs: input.nowMs,
  });
  if (prepared.outcome === "refused") {
    return {
      ...prepared,
      code: "honesty_mutation_invalidated",
      detail: `honesty_mutation:${prepared.detail}`,
    };
  }
  return prepared;
}

export function consumeAuthorization(
  authorization: EffectAuthorization,
): EffectAuthorization {
  return { ...authorization, consumed: true };
}

export function authorizationMatchesPrepared(
  authorization: EffectAuthorization,
  prepared: PreparedEffect,
): boolean {
  return (
    authorization.kind === "effect_authorization" &&
    prepared.kind === "prepared_effect" &&
    authorization.authorizationId === prepared.authorizationId &&
    authorization.intentHash === prepared.intentHash &&
    authorization.class === prepared.class &&
    authorization.mechanism === "discord" &&
    !authorization.consumed
  );
}
