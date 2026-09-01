import type { ThoughtParserFailureCode } from "../types.js";
import { buildReferenceAllowlist } from "./reference-allowlist.js";

export type ThoughtStructuralFeedback = Readonly<{
  code: ThoughtParserFailureCode;
  field: string | null;
  allowlistedReferences: readonly string[];
}>;

export type StructuralFeedbackInput = ThoughtStructuralFeedback | ThoughtParserFailureCode;

const STRUCTURAL_FEEDBACK: Readonly<Record<ThoughtParserFailureCode, string>> = {
  invalid_json: "Return exactly one JSON object.",
  root_not_object: "Return a JSON object at the root.",
  wrong_kind: "Use one permitted semantic Thought kind.",
  unknown_field: "Remove fields not defined by the active semantic Thought contract.",
  required_field_missing: "Include every required semantic Thought field.",
  wrong_type: "Use the required semantic field types without coercion.",
  invalid_enum: "Use one permitted value for the reported enum field.",
  reference_not_allowlisted: "Use only host allowlisted reference IDs for the reported reference field; do not invent, transform, or namespace references.",
  alias_invalid: "Use a valid output-local alias shape.",
  operation_not_registered: "Use one registered operation kind.",
  identity_missing: "Include every required Thought identity field.",
  identity_mismatch: "Preserve the active Thought identity fields.",
  missing_settlement_fields: "Include all required settlement sections.",
  speech_contract_failure: "Emit the required speech object shape.",
  commitment_contract_failure: "Emit the required commitments object shape.",
  operations_contract_failure: "Use the semantic evidenceUse object shape.",
  authority_contract_failure: "Do not emit kernel-owned authority fields.",
  observation_contract_failure: "Emit the required observation request shape.",
  effect_contract_failure: "Emit the required effect proposal shape.",
  forbidden_fields: "Omit publication and delivery fields.",
  schema_version_mismatch: "Use the active Thought schema version.",
  other: "Match the semantic Thought contract exactly.",
};

export function createThoughtStructuralFeedback(input: {
  code: ThoughtParserFailureCode;
  field?: string;
  allowlistedReferences?: readonly string[];
}): ThoughtStructuralFeedback {
  const allowlistedReferences = input.code === "reference_not_allowlisted"
    ? Object.freeze([
        ...buildReferenceAllowlist(input.allowlistedReferences ?? []).existing,
      ].sort())
    : Object.freeze([]);
  return Object.freeze({
    code: input.code,
    field: input.field ?? null,
    allowlistedReferences,
  });
}

function normalizeFeedback(input: StructuralFeedbackInput): ThoughtStructuralFeedback {
  return typeof input === "string"
    ? createThoughtStructuralFeedback({ code: input })
    : input;
}

export function formatThoughtStructuralFeedback(
  input: StructuralFeedbackInput | undefined,
): string | null {
  if (!input) return null;
  const feedback = normalizeFeedback(input);
  const field = feedback.field
    ? ` Failing field/path: ${feedback.field}.`
    : "";
  const allowlist = feedback.code === "reference_not_allowlisted"
    ? ` Host allowlisted reference IDs: ${JSON.stringify(feedback.allowlistedReferences)}.`
    : "";
  return `The previous response failed bounded structural validation (${feedback.code}).${field} ${STRUCTURAL_FEEDBACK[feedback.code]}${allowlist} Do not change the semantic answer or invent authority.`;
}
