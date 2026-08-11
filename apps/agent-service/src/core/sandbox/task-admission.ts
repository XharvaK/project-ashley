/**
 * Deterministic sandbox task admission (observe-only).
 *
 * Derives an `AgencyEffectIntent` from an Agency decision's open-cognitive
 * item evidence, revalidating every ref against the nuclear database at
 * admission time (current + qualified), then records the admission intent in
 * the durable `sandbox_task_admissions` ledger.
 *
 * Zero authority: a recorded admission never schedules or executes anything.
 * The task materialized here is a bounded, delegated-safe, `maxModelCalls=0`
 * *intent shape* whose recipe allowlist is the exact spec-compliant fixed
 * recipe — it is only ever a durable record of what a future execution
 * coordinator could be allowed to do after separate, independent gates.
 *
 * Single supported profile: verify-build-health (`verify:agent-tsc` →
 * `fixed_lint_verification_recipe`). Any purpose without a spec-compliant
 * profile is refused and recorded as `refused`.
 */

import type { DatabaseSync } from "node:sqlite";
import { capabilitySpec } from "@composer-assistant/sandbox-policy";
import { env } from "../../env.js";
import { currentModelEpoch } from "../attention/continuity.js";
import { currentBuildIdentity } from "../rollout/capabilities.js";
import {
  deriveEffectIntent,
  type EffectGrounding,
} from "../agency/effect-intent.js";
import { getOpenCognitiveItem, openCognitiveItemSourceCurrent } from "../cognition/open-items.js";
import type {
  AgencyEffectIntent,
  AgencyEffectPurpose,
  Decision,
  EvidenceRef,
} from "../types.js";
import {
  capabilityForRecipeExecution,
  createSandboxTask,
  type SandboxTask,
} from "./task.js";

export const SANDBOX_EFFECT_ROLE = "sandbox_operator_light" as const;
export const SANDBOX_EFFECT_TASK_DURATION_MS = 30 * 60 * 1000;

export type SandboxEffectProfile = {
  profileKey: string;
  recipeIds: readonly string[];
  capabilities: readonly string[];
  objective: string;
};

/**
 * The single supported effect profile: bounded fixed verification of the
 * codebase, exact recipe `verify:agent-tsc`, delegated-safe
 * `fixed_lint_verification_recipe`, observe-only. All other purposes are
 * intentionally refused (no composition, no expansion).
 */
export const SANDBOX_EFFECT_PROFILES: Readonly<
  Record<string, SandboxEffectProfile>
> = {
  sandbox_verify_build_health: {
    profileKey: "verify-build-health",
    recipeIds: ["verify:agent-tsc"],
    capabilities: ["fixed_lint_verification_recipe"],
    objective:
      "Verify the codebase type-checks and passes bounded verification (fixed recipe only).",
  },
};

export type SandboxAdmissionStatus = "recorded" | "refused";

export type SandboxAdmissionRefusalCode =
  | "no_grounded_evidence"
  | "no_effect_purpose"
  | "unsupported_effect_profile"
  | "ambiguous_effect_profiles"
  | "effect_profile_not_verified"
  | "task_creation_failed";

export type SandboxTaskAdmissionResult =
  | {
      ok: true;
      status: "recorded";
      admissionId: number;
      replayed: boolean;
      task: SandboxTask;
      intent: AgencyEffectIntent;
      decisionId: number;
    }
  | {
      ok: true;
      status: "refused";
      admissionId: number;
      replayed: boolean;
      refusalCode: SandboxAdmissionRefusalCode;
      refusalReason: string;
      intent: AgencyEffectIntent;
      decisionId: number;
    };

export type AdmitSandboxTaskIntentInput = {
  db: DatabaseSync;
  ownerId: string;
  decision: Decision;
  derivedFrom: "reactive" | "proactive";
  nowIso?: string;
};

/**
 * Trusted classifications for OCI grounding: anything except `secret`.
 * `never_public` is the normal classification for owner-bound evidence
 * (e.g. message-derived questions) and is not an authority problem;
 * `secret` data must never ground any external-effect intent.
 */
const QUALIFIED_DATA_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  "ordinary",
  "sensitive",
  "never_public",
]);

/**
 * Qualification gate for OCI grounding: the item must be current
 * (revalidated against its source row, live provenance, current build and
 * contract) and trusted (bound to a real source revision, never secret
 * data). This is the codebase's realization of the epistemic-level /
 * trusted-source vocabulary: a live, source-current, revision-bound record
 * produced by a governing capability is the only evidence that may ground a
 * sandbox effect intent.
 */
export function openCognitiveItemQualifiedForGrounding(
  item: Parameters<typeof openCognitiveItemSourceCurrent>[1],
  sourceCurrent: boolean,
): boolean {
  if (!sourceCurrent) return false;
  if (item.redactedAt !== null) return false;
  if (item.sourceRevision === "") return false;
  if (!QUALIFIED_DATA_CLASSIFICATIONS.has(item.dataClassification)) return false;
  return true;
}

/** Static verification of a spec-compliant effect profile. */
export function verifyEffectProfile(profile: SandboxEffectProfile): boolean {
  if (!Array.isArray(profile.recipeIds) || profile.recipeIds.length === 0) {
    return false;
  }
  for (const recipeId of profile.recipeIds) {
    if (typeof recipeId !== "string" || recipeId.length === 0) return false;
    if (capabilityForRecipeExecution(recipeId) === null) return false;
  }
  if (!Array.isArray(profile.capabilities) || profile.capabilities.length === 0) {
    return false;
  }
  for (const capability of profile.capabilities) {
    const spec = capabilitySpec(capability);
    if (spec === undefined || spec.class !== "delegated_safe") return false;
  }
  if (typeof profile.profileKey !== "string" || profile.profileKey.length === 0) {
    return false;
  }
  if (typeof profile.objective !== "string" || profile.objective.length === 0) {
    return false;
  }
  return true;
}

export function purposeProfile(
  purpose: AgencyEffectPurpose,
): SandboxEffectProfile | null {
  return SANDBOX_EFFECT_PROFILES[purpose] ?? null;
}

/**
 * Deterministic admission pipeline. Never throws for policy outcomes;
 * throws only on programming errors (unexpected sqlite failures).
 */
export function admitSandboxTaskIntent(
  input: AdmitSandboxTaskIntentInput,
): SandboxTaskAdmissionResult {
  const { db, ownerId, decision, derivedFrom } = input;
  const decisionId = decision.id;
  if (decisionId === undefined || !Number.isInteger(decisionId)) {
    throw new Error("admission_requires_decision_id");
  }

  const ociRefs = decision.evidenceRefs.filter(
    (ref): ref is EvidenceRef & { type: "open_cognitive_item"; id: string } =>
      ref.type === "open_cognitive_item" && typeof ref.id === "string" && ref.id.length > 0,
  );

  const grounds: EffectGrounding[] = [];
  for (const ref of ociRefs) {
    const item = getOpenCognitiveItem(db, ownerId, ref.id);
    if (item === null) continue;
    const sourceCurrent = openCognitiveItemSourceCurrent(db, item);
    if (!openCognitiveItemQualifiedForGrounding(item, sourceCurrent)) continue;
    grounds.push({
      entityUuid: item.entityUuid,
      kind: item.kind,
      epistemicLevel: sourceCurrent ? "known" : "unknown",
      sourceTrust: "trusted",
    });
  }

  const intent = deriveEffectIntent(decision, grounds);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const buildIdentity = currentBuildIdentity();
  const modelEpoch = currentModelEpoch(db, env.mistralModel);

  const refuse = (
    refusalCode: SandboxAdmissionRefusalCode,
    refusalReason: string,
  ): SandboxTaskAdmissionResult => {
    const admissionId = recordAdmission(db, {
      ownerId,
      intent,
      status: "refused",
      derivedFrom,
      decisionId,
      refusalCode,
      refusalReason,
      buildIdentity,
      modelEpoch,
      recordedAt: nowIso,
    });
    return {
      ok: true,
      status: "refused",
      admissionId,
      replayed: false,
      refusalCode,
      refusalReason,
      intent,
      decisionId,
    };
  };

  if (grounds.length === 0) {
    return refuse("no_grounded_evidence", "no_current_qualified_oci_evidence");
  }
  if (intent.purposes.length === 0) {
    return refuse("no_effect_purpose", "no_supported_effect_purpose_derived");
  }
  const profiles = intent.purposes
    .map((purpose) => purposeProfile(purpose))
    .filter((profile): profile is SandboxEffectProfile => profile !== null);
  if (profiles.length === 0) {
    return refuse(
      "unsupported_effect_profile",
      `unsupported_purposes:${intent.purposes.join(",")}`,
    );
  }
  const profileKeys = new Set(profiles.map((profile) => profile.profileKey));
  if (profileKeys.size > 1) {
    return refuse(
      "ambiguous_effect_profiles",
      `profiles:${[...profileKeys].join(",")}`,
    );
  }
  const profile = profiles[0];
  if (!verifyEffectProfile(profile)) {
    return refuse(
      "effect_profile_not_verified",
      `profile_failed_verification:${profile.profileKey}`,
    );
  }

  const nowMs = Date.parse(nowIso);
  const created = createSandboxTask({
    taskId: `effect-${decisionId}-${intent.intentId}`,
    ownerId,
    objective: profile.objective,
    role: SANDBOX_EFFECT_ROLE,
    allowedCapabilities: profile.capabilities,
    allowedRecipeIds: profile.recipeIds,
    maxModelCalls: 0,
    maxToolExecutions: 1,
    deadlineAtMs: nowMs + SANDBOX_EFFECT_TASK_DURATION_MS,
    nowMs,
  });
  if (!created.ok) {
    return refuse("task_creation_failed", `task_creation_failed:${created.error}`);
  }

  const admissionId = recordAdmission(db, {
    ownerId,
    intent,
    status: "recorded",
    derivedFrom,
    decisionId,
    profile,
    buildIdentity,
    modelEpoch,
    recordedAt: nowIso,
  });
  return {
    ok: true,
    status: "recorded",
    admissionId,
    replayed: false,
    task: created.task,
    intent,
    decisionId,
  };
}

type RecordAdmissionInput = {
  ownerId: string;
  intent: AgencyEffectIntent;
  status: SandboxAdmissionStatus;
  derivedFrom: "reactive" | "proactive";
  decisionId: number;
  profile?: SandboxEffectProfile;
  refusalCode?: SandboxAdmissionRefusalCode;
  refusalReason?: string;
  buildIdentity: string;
  modelEpoch: number;
  recordedAt: string;
};

function recordAdmission(db: DatabaseSync, input: RecordAdmissionInput): number {
  const existing = db
    .prepare(
      `SELECT id FROM sandbox_task_admissions WHERE owner_id = ? AND intent_id = ?`,
    )
    .get(input.ownerId, input.intent.intentId) as { id?: number } | undefined;
  if (existing && typeof existing.id === "number") {
    return existing.id;
  }
  const result = db
    .prepare(
      `INSERT INTO sandbox_task_admissions (
         owner_id, intent_id, status, derived_from, decision_id,
         purposes_json, profile_key, profile_recipe_ids_json,
         evidence_refs_json, refusal_code, refusal_reason,
         build_identity, model_epoch, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.ownerId,
      input.intent.intentId,
      input.status,
      input.derivedFrom,
      input.decisionId,
      JSON.stringify(input.intent.purposes),
      input.profile?.profileKey ?? "",
      JSON.stringify(input.profile?.recipeIds ?? []),
      JSON.stringify(
        input.intent.groundedRefs.map((ref) => ref.id),
      ),
      input.refusalCode ?? null,
      input.refusalReason ?? null,
      input.buildIdentity,
      input.modelEpoch,
      input.recordedAt,
    );
  return Number(result.lastInsertRowid);
}

export type SandboxAdmissionLedgerRow = {
  id: number;
  ownerId: string;
  intentId: string;
  status: SandboxAdmissionStatus;
  derivedFrom: "reactive" | "proactive";
  decisionId: number;
  purposes: AgencyEffectPurpose[];
  profileKey: string;
  profileRecipeIds: string[];
  evidenceRefs: string[];
  refusalCode: string | null;
  refusalReason: string | null;
  buildIdentity: string;
  modelEpoch: number;
  recordedAt: string;
};

export function listSandboxTaskAdmissions(
  db: DatabaseSync,
  ownerId: string,
): SandboxAdmissionLedgerRow[] {
  const rows = db
    .prepare(
      `SELECT id, owner_id, intent_id, status, derived_from, decision_id,
              purposes_json, profile_key, profile_recipe_ids_json,
              evidence_refs_json, refusal_code, refusal_reason,
              build_identity, model_epoch, recorded_at
       FROM sandbox_task_admissions
       WHERE owner_id = ?
       ORDER BY id ASC`,
    )
    .all(ownerId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row.id),
    ownerId: String(row.owner_id),
    intentId: String(row.intent_id),
    status: String(row.status) as SandboxAdmissionStatus,
    derivedFrom: String(row.derived_from) as "reactive" | "proactive",
    decisionId: Number(row.decision_id),
    purposes: JSON.parse(String(row.purposes_json)) as AgencyEffectPurpose[],
    profileKey: String(row.profile_key),
    profileRecipeIds: JSON.parse(String(row.profile_recipe_ids_json)) as string[],
    evidenceRefs: JSON.parse(String(row.evidence_refs_json)) as string[],
    refusalCode: row.refusal_code == null ? null : String(row.refusal_code),
    refusalReason: row.refusal_reason == null ? null : String(row.refusal_reason),
    buildIdentity: String(row.build_identity),
    modelEpoch: Number(row.model_epoch),
    recordedAt: String(row.recorded_at),
  }));
}

/**
 * Observe-only runtime hook: admits (records) a sandbox task intent derived
 * from a logged Agency decision. Swallows all failures — admission is
 * zero-authority bookkeeping and must never break the exchange.
 */
export function observeSandboxEffectIntentAdmission(
  db: DatabaseSync,
  ownerId: string,
  decision: Decision,
  derivedFrom: "reactive" | "proactive",
): void {
  try {
    admitSandboxTaskIntent({ db, ownerId, decision, derivedFrom });
  } catch {
    // bookkeeping only; never propagate into the exchange
  }
}
