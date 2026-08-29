import type { AuthorityCode } from "../types.js";

export const AUTHORITY_CODES = [
  "CURRENTNESS_UNVERIFIED",
  "RECEIPT_REQUIRED",
  "RECEIPT_CONTRADICTS_CLAIM",
  "IN_FLIGHT_UNKNOWN",
  "CAPABILITY_UNAVAILABLE",
  "EFFECT_NOT_AUTHORIZED",
  "RELATIONAL_BOUNDARY",
  "RELATIONAL_WITHDRAWAL",
  "SOURCE_CLASS_INSUFFICIENT",
  "STALE_STATE",
  "IDENTITY_MUTATION_FORBIDDEN",
  "SECRET_OR_CREDENTIAL",
  "REVISION_BUDGET_EXHAUSTED",
  "DISPATCH_EPOCH_CHANGED",
  "STALE_GENERATION",
  "DRAFT_COMMITMENT_CONFLICT",
  "EMPTY_COMMITMENTS_WITH_DRAFT",
] as const satisfies readonly AuthorityCode[];

export function describeAuthorityCode(code: AuthorityCode): string {
  switch (code) {
    case "CURRENTNESS_UNVERIFIED": return "currentness requires an observation";
    case "RECEIPT_REQUIRED": return "an effect claim requires a receipt";
    case "RECEIPT_CONTRADICTS_CLAIM": return "the receipt contradicts the claim";
    case "IN_FLIGHT_UNKNOWN": return "the effect outcome is unknown";
    case "CAPABILITY_UNAVAILABLE": return "the capability is unavailable";
    case "EFFECT_NOT_AUTHORIZED": return "the effect is not authorized";
    case "RELATIONAL_BOUNDARY": return "a relational boundary blocks this action";
    case "RELATIONAL_WITHDRAWAL": return "relational withdrawal blocks externalization";
    case "SOURCE_CLASS_INSUFFICIENT": return "the source class is insufficient";
    case "STALE_STATE": return "the state is stale";
    case "IDENTITY_MUTATION_FORBIDDEN": return "identity mutation is forbidden";
    case "SECRET_OR_CREDENTIAL": return "secret or credential material is forbidden";
    case "REVISION_BUDGET_EXHAUSTED": return "the Authority revision budget is exhausted";
    case "DISPATCH_EPOCH_CHANGED": return "the Authority epoch changed before dispatch";
    case "STALE_GENERATION": return "the cycle generation is stale";
    case "DRAFT_COMMITMENT_CONFLICT": return "the draft conflicts with its commitments";
    case "EMPTY_COMMITMENTS_WITH_DRAFT": return "draft speech has no commitments";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}
