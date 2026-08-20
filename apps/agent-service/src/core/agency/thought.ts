import { env } from "../../env.js";
import { completeChat } from "../../mistral-client.js";
import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { probeDecisionCoercion } from "../relationship/coercion-gate.js";
import type {
  CognitionInspectionRequest,
  CognitionWorkspaceRequest,
  CognitionOperationalRequest,
  Decision,
  DecisionDelayClass,
  DecisionKind,
  EvidenceDisposition,
  Motivation,
  ProjectInspectionObservation,
  ThoughtValidationAttempt,
  ThoughtValidationEnvelope,
  ThoughtValidationErrorCode,
  WorkspaceExperimentObservation,
  Trigger,
} from "../types.js";
import type { TokenUsage } from "../model-routing/types.js";
import {
  listApprovedReadProjectIds,
  canOfferProjectInspection,
  canOfferCandidateWorkspace,
} from "../sandbox/project-registry.js";

/* ------------------------------------------------------------------ */
/*  ThoughtModelResult — carries usage for truncation detection       */
/* ------------------------------------------------------------------ */

export type ThoughtModelResult = {
  text: string;
  model?: string;
  modelAlias?: string;
  resolvedModelId?: string | null;
  usage?: TokenUsage;
  maxTokens?: number;
};

export type Complete = (
  messages: Parameters<typeof completeChat>[0],
  options?: Parameters<typeof completeChat>[1],
) => Promise<ThoughtModelResult>;

export type CapabilityGate = (db: DatabaseSync) => boolean;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_THOUGHT_ATTEMPTS = 2;

const kinds = new Set<DecisionKind>([
  "speak",
  "silence",
  "delay",
  "ask",
  "revisit",
  "share",
  "challenge",
  "refuse",
]);

const evidenceDispositions = new Set<EvidenceDisposition>([
  "sufficient",
  "acquire_project_evidence",
  "capability_unavailable",
  "defer",
]);

/**
 * Structural validation error codes — every structural Thought rejection
 * maps to exactly one of these.  Provider/infrastructure failures
 * (AbortError, rate_limited, mistral_unavailable, ...) are kept separate
 * and never trigger structural regeneration.
 */
const STRUCTURAL_RETRYABLE_CODES = new Set<ThoughtValidationErrorCode>([
  "invalid_json",
  "truncation",
  "unsupported_operation",
  "missing_required_field",
  "multiple_operational_intents",
  "invalid_evidence_disposition_pairing",
  "invalid_project",
  "payload_invalid",
  "contradictory_decision_fields",
]);

/**
 * Fixed feedback templates keyed by validation code.  No raw model text,
 * no provider error strings, no user-controlled content, no host paths.
 */
function retryFeedback(code: ThoughtValidationErrorCode): string {
  const messages: Record<ThoughtValidationErrorCode, string> = {
    invalid_json:
      "Previous output was not valid JSON. Emit strict JSON only.",
    truncation:
      "Previous output was truncated. Emit a complete, compact JSON object.",
    unsupported_operation:
      "Previous output contained an unsupported operation. Use only the operations listed in the contract.",
    missing_required_field:
      "Previous output was missing a required field. Emit all required fields.",
    multiple_operational_intents:
      "Previous output contained multiple operational intents. Emit at most one operationalRequest.",
    invalid_evidence_disposition_pairing:
      "Previous output had an evidenceDisposition that contradicted the operationalRequest. Follow the disposition contract exactly.",
    invalid_project:
      "Previous output referenced an unapproved project. Use only the listed approved project IDs.",
    payload_invalid:
      "Previous output payload was invalid. Follow the canonical schema exactly.",
    contradictory_decision_fields:
      "Previous output contained contradictory fields. Ensure kind, shouldSpeak, and completion are consistent.",
    capability_unavailable:
      "Previous output assumed a capability that is unavailable. Check the project context prompt.",
  };
  return messages[code] ?? "Previous output was structurally invalid. Emit strict JSON only.";
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function hasGroundedReactiveRefusal(
  db: DatabaseSync,
  motivations: Motivation[],
  motivationIds: number[],
  trigger: Trigger,
): boolean {
  if (trigger !== "reactive") return false;
  const selected = motivations.filter(
    (item) => item.id !== undefined && motivationIds.includes(item.id),
  );
  const message = selected.find(
    (item) => item.kind === "user_message" && item.refType === "message" && item.refId != null,
  );
  const boundaries = selected.filter(
    (item) => item.kind === "boundary" && item.refType === "identity" && item.refId != null,
  );
  if (!message || boundaries.length === 0) return false;
  const current = db.prepare(
    `SELECT id FROM mem_messages
     WHERE owner_id = ? AND role = 'user' AND redacted_at IS NULL
     ORDER BY id DESC LIMIT 1`,
  ).get(message.ownerId ?? "") as { id?: number } | undefined;
  if (current?.id !== Number(message.refId)) return false;
  return boundaries.some((boundary) => {
    const row = db.prepare(
      `SELECT 1 AS grounded FROM identity_entries
       WHERE id = ? AND owner_id = ? AND layer = 'stable' AND kind = 'boundary'
       LIMIT 1`,
    ).get(Number(boundary.refId), boundary.ownerId ?? "");
    return row !== undefined;
  });
}

function parseObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function sanitizedErrorCode(error: unknown): string {
  const value = error as { code?: unknown; name?: unknown };
  const candidate = typeof value?.code === "string"
    ? value.code
    : typeof value?.name === "string"
      ? value.name
      : "thought_error";
  const allowed = new Set([
    "AbortError",
    "agent_not_ready",
    "attention_deadline",
    "internal_error",
    "mistral_unavailable",
    "rate_limited",
    "request_exceeds_tpm_budget",
    "thought_error",
  ]);
  return allowed.has(candidate) ? candidate : "thought_error";
}

/** Classify provider error codes that must NOT trigger structural regeneration. */
function isProviderFailure(errorCode: string): boolean {
  const providerCodes = new Set([
    "AbortError",
    "agent_not_ready",
    "attention_deadline",
    "internal_error",
    "mistral_unavailable",
    "rate_limited",
    "request_exceeds_tpm_budget",
    "thought_error",
  ]);
  return providerCodes.has(errorCode);
}

function isDecisionDelayClass(value: unknown): value is DecisionDelayClass {
  return (
    value === "brief" ||
    value === "standard" ||
    value === "long" ||
    value === "reflection_review"
  );
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Detect likely truncation: output tokens at or above configured max. */
function detectTruncation(usage: TokenUsage | undefined, maxTokens: number | undefined): boolean {
  if (!usage || !maxTokens) return false;
  return usage.completionTokens >= maxTokens;
}

/* ------------------------------------------------------------------ */
/*  Legacy normalization adapter                                       */
/*                                                                    */
/*  Accepts legacy sibling fields (inspectionRequest, workspaceRequest,*/
/*  operationalRequest) and normalizes to a single                    */
/*  CognitionOperationalRequest | null.  Canonical + conflicting       */
/*  legacy intent fails closed.                                        */
/* ------------------------------------------------------------------ */

export type LegacyNormalizedRequest = {
  operationalRequest: CognitionOperationalRequest | null;
  legacyFieldUsed: "none" | "inspectionRequest" | "workspaceRequest" | "operationalRequest";
  conflict: boolean;
};

export function parseInspectionRequest(
  value: unknown,
): CognitionInspectionRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const operation = String(obj.operation);
  const projectId =
    typeof obj.projectId === "string" ? obj.projectId.trim() : "";
  const path = typeof obj.path === "string" ? obj.path.trim() : undefined;
  const pattern =
    typeof obj.pattern === "string" ? obj.pattern.trim() : undefined;
  const maxMatches =
    typeof obj.maxMatches === "number" && Number.isInteger(obj.maxMatches)
      ? obj.maxMatches
      : undefined;

  if (!projectId) return null;

  if (operation === "project.read_file") {
    if (!path) return null;
    return { operation, projectId, path };
  }
  if (operation === "project.list_directory") {
    if (path === undefined) return null;
    return { operation, projectId, path };
  }
  if (operation === "project.search_text") {
    if (!pattern) return null;
    return { operation, projectId, path, pattern, maxMatches };
  }
  return null;
}

export function parseWorkspaceRequest(
  value: unknown,
): CognitionWorkspaceRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const operation = String(obj.operation);
  const projectId =
    typeof obj.projectId === "string" ? obj.projectId.trim() : "";
  const workspaceId =
    typeof obj.workspaceId === "string" ? obj.workspaceId.trim() : "";
  const path = typeof obj.path === "string" ? obj.path.trim() : undefined;
  const pattern =
    typeof obj.pattern === "string" ? obj.pattern.trim() : undefined;
  const maxMatches =
    typeof obj.maxMatches === "number" && Number.isInteger(obj.maxMatches)
      ? obj.maxMatches
      : undefined;
  const content = typeof obj.content === "string" ? obj.content : undefined;
  const expectedSha256 =
    typeof obj.expectedSha256 === "string" ? obj.expectedSha256.trim() : undefined;
  const oldText = typeof obj.oldText === "string" ? obj.oldText : undefined;
  const newText = typeof obj.newText === "string" ? obj.newText : undefined;

  if (!projectId) return null;

  if (operation === "workspace.read_file") {
    if (!path) return null;
    return { version: 2, operation, projectId, workspaceId, path };
  }
  if (operation === "workspace.list_directory") {
    if (path === undefined) return null;
    return { version: 2, operation, projectId, workspaceId, path };
  }
  if (operation === "workspace.search_text") {
    if (!pattern || pattern.length < 1 || pattern.length > 256) return null;
    return {
      version: 2,
      operation,
      projectId,
      workspaceId,
      path: path ?? ".",
      pattern,
      maxMatches,
    };
  }
  if (operation === "workspace.write_file") {
    if (!path || content === undefined) return null;
    return {
      version: 2,
      operation,
      projectId,
      workspaceId,
      path,
      content,
      mustNotExist: true,
    };
  }
  if (operation === "workspace.replace_file") {
    if (!path || content === undefined || !expectedSha256) return null;
    return {
      version: 2,
      operation,
      projectId,
      workspaceId,
      path,
      content,
      expectedSha256,
    };
  }
  if (operation === "workspace.edit_text") {
    if (!path || oldText === undefined || newText === undefined || !expectedSha256) return null;
    return {
      version: 2,
      operation,
      projectId,
      workspaceId,
      path,
      oldText,
      newText,
      expectedSha256,
    };
  }
  if (operation === "workspace.delete_file") {
    if (!path) return null;
    return {
      version: 2,
      operation,
      projectId,
      workspaceId,
      path,
      ...(expectedSha256 ? { expectedSha256 } : {}),
    };
  }
  if (operation === "workspace.create_directory") {
    if (!path) return null;
    return { version: 2, operation, projectId, workspaceId, path };
  }
  return null;
}

/** Legacy aliases — backward compat. */
export const parseInspectionRequestLegacy = parseInspectionRequest;
export const parseWorkspaceRequestLegacy = parseWorkspaceRequest;

/**
 * Normalize legacy sibling fields to a single canonical CognitionOperationalRequest.
 *
 * Priority:
 * 1. Canonical operationalRequest field (if present and valid)
 * 2. Legacy inspectionRequest → project_inspection
 * 3. Legacy workspaceRequest → candidate_workspace_experiment
 *
 * Fail-closed rules:
 * - Canonical + conflicting legacy → error
 * - Multiple legacy intents → error
 */
function normalizeOperationalRequest(
  proposal: Record<string, unknown>,
  canOffer: boolean,
  canOfferWorkspace: boolean,
): LegacyNormalizedRequest {
  const canonicalRaw = proposal.operationalRequest;
  const legacyInspectionRaw = proposal.inspectionRequest;
  const legacyWorkspaceRaw = proposal.workspaceRequest;

  // Parse canonical form
  let canonical: CognitionOperationalRequest | null = null;
  if (canonicalRaw && typeof canonicalRaw === "object" && !Array.isArray(canonicalRaw)) {
    const cObj = canonicalRaw as Record<string, unknown>;
    const cKind = String(cObj.kind);
    if (cKind === "project_inspection" && canOffer) {
      const parsed = parseInspectionRequest(cObj.request);
      if (parsed) canonical = { kind: "project_inspection", request: parsed };
    } else if (cKind === "candidate_workspace_experiment" && canOfferWorkspace) {
      const parsed = parseWorkspaceRequest(cObj.request);
      if (parsed) canonical = { kind: "candidate_workspace_experiment", request: parsed };
    }
  }

  // Parse legacy forms
  let legacyInspection: CognitionInspectionRequest | null = null;
  let legacyWorkspace: CognitionWorkspaceRequest | null = null;
  let legacyFieldUsed: LegacyNormalizedRequest["legacyFieldUsed"] = "none";

  if (canOffer && legacyInspectionRaw !== undefined) {
    legacyInspection = parseInspectionRequest(legacyInspectionRaw);
    if (legacyInspection) legacyFieldUsed = "inspectionRequest";
  }
  if (canOfferWorkspace && legacyWorkspaceRaw !== undefined) {
    legacyWorkspace = parseWorkspaceRequest(legacyWorkspaceRaw);
    if (legacyWorkspace) {
      if (legacyFieldUsed !== "none") {
        // Multiple legacy intents → fail closed
        return { operationalRequest: null, legacyFieldUsed: "none", conflict: true };
      }
      legacyFieldUsed = "workspaceRequest";
    }
  }

  // Build legacy operational request
  let legacy: CognitionOperationalRequest | null = null;
  if (legacyInspection) {
    legacy = { kind: "project_inspection", request: legacyInspection };
  } else if (legacyWorkspace) {
    legacy = { kind: "candidate_workspace_experiment", request: legacyWorkspace };
  }

  // Canonical present
  if (canonical) {
    if (legacy) {
      // Canonical + conflicting legacy → fail closed
      if (canonical.kind !== legacy.kind) {
        return { operationalRequest: null, legacyFieldUsed: "none", conflict: true };
      }
      // Same kind from both — canonical wins
      return { operationalRequest: canonical, legacyFieldUsed, conflict: false };
    }
    return { operationalRequest: canonical, legacyFieldUsed, conflict: false };
  }

  // Legacy only
  return { operationalRequest: legacy, legacyFieldUsed, conflict: false };
}

/* ------------------------------------------------------------------ */
/*  ThoughtProposal — canonical contract                                */
/*                                                                    */
/*  The model is instructed to emit operationalRequest (canonical).    */
/*  inspectionRequest / workspaceRequest are NOT part of the model     */
/*  contract and are only accepted via the legacy normalization        */
/*  adapter for backward compatibility.                                */
/* ------------------------------------------------------------------ */

export type ThoughtProposal = {
  kind: DecisionKind;
  delayClass: DecisionDelayClass | null;
  shouldSpeak: boolean;
  effort: string;
  completion: string;
  motivationIds: number[];
  objective: string;
  reason: string;
  uncertainty: number;
  urgency: number;
  modelAlias: string;
  resolvedModelId: string | null;
  evidenceDisposition: EvidenceDisposition | null;
  operationalRequest?: CognitionOperationalRequest | null;
  /** Derived backward-compat: populated from operationalRequest.kind === "project_inspection". */
  inspectionRequest?: CognitionInspectionRequest | null;
};

/* ------------------------------------------------------------------ */
/*  Telemetry attempt tracking                                         */
/* ------------------------------------------------------------------ */

export type ThoughtAttemptResult = {
  ok: boolean;
  proposal?: ThoughtProposal;
  error?: string;
  errorCode?: ThoughtValidationErrorCode | null;
  attempt: number;
  providerOutcome: "completed" | "error";
  usage?: TokenUsage;
  maxTokens?: number;
  rawText: string;
};

/* ------------------------------------------------------------------ */
/*  runThoughtModel — single attempt                                    */
/* ------------------------------------------------------------------ */

export type ThoughtResult =
  | { ok: true; proposal: ThoughtProposal }
  | { ok: false; error: string };

/**
 * Execute a single Thought model attempt.  Returns the raw result plus
 * telemetry metadata.  Does NOT perform retry logic.
 */
async function runThoughtModelAttempt(
  db: DatabaseSync,
  base: Decision,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete,
  options: ThoughtModelOptions,
  attemptNumber: number,
  retryContext?: string,
): Promise<ThoughtAttemptResult> {
  const thoughtDeadline =
    options.thoughtDeadlineAtMs ??
    (options.firstBubbleDeadlineAtMs != null
      ? options.firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
      : null);
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return {
      ok: false,
      error: "AbortError",
      errorCode: null,
      attempt: attemptNumber,
      providerOutcome: "error",
      rawText: "",
    };
  }
  const candidates = motivations.slice(0, 12).map((motivation) => ({
    id: motivation.id,
    kind: motivation.kind,
    score: motivation.score,
    summary: motivation.summary,
    refType: motivation.refType,
    refId: motivation.refId,
  }));

  const canOffer = canOfferProjectInspection(db);
  const canOfferWorkspace = trigger === "reactive" ? canOfferCandidateWorkspace(db) : false;
  const approvedProjectIds = (canOffer || canOfferWorkspace) ? listApprovedReadProjectIds() : [];

  /* ---------- Build the model-facing prompt ---------- */

  let projectContextPrompt = "No approved projects are currently configured or licensed for inspection; do not emit an operationalRequest.";
  if (approvedProjectIds.length > 0) {
    const projectList = approvedProjectIds.join(", ");
    const quotedProjectIds = approvedProjectIds.join('"|"');
    const parts: string[] = [];

    if (canOffer) {
      parts.push(
        `When repository evidence is required to resolve a question or motivation, set evidenceDisposition to "acquire_project_evidence" and include operationalRequest: {kind: "project_inspection", request: {operation: "project.read_file"|"project.list_directory"|"project.search_text", projectId: "${quotedProjectIds}", path: string, pattern?: string, maxMatches?: number}}.`,
      );
    }
    if (canOfferWorkspace) {
      parts.push(
        `When a candidate workspace experiment is required, include operationalRequest: {kind: "candidate_workspace_experiment", request: {operation: "workspace.read_file"|"workspace.list_directory"|"workspace.search_text"|"workspace.write_file"|"workspace.replace_file"|"workspace.edit_text"|"workspace.delete_file"|"workspace.create_directory", projectId: "${quotedProjectIds}", workspaceId?: string, path: string, ...}}.`,
        "A candidate workspace is a private bounded working copy for an approved project.",
        "Workspace mutation does NOT modify the live repository; it is for candidate experimentation only.",
        "Workspace availability is controlled by runtime authority.",
        "It grants no Git/commit/push/deploy authority and no external-account authority.",
        "workspace.write_file with content creates a new file (mustNotExist semantics).",
        "Use workspace.edit_text for surgical in-place edits on existing files.",
      );
    }

    projectContextPrompt = `Approved project IDs: ${projectList}. ${parts.join(" ")}`;
  }

  const dispositionContract =
    'evidenceDisposition: "sufficient" = supplied context already holds everything needed; "acquire_project_evidence" = this turn requires repository evidence that inspection can provide now (REQUIRES a project_inspection operationalRequest; invalid when no approved projects are licensed); "capability_unavailable" = inspection not currently available (valid ONLY when no approved projects are configured); "defer" = intentional postponement to a later turn. defer does not acquire evidence and must not stand in for evidence an available inspection can acquire now. acquire_project_evidence is an action, not a postponement: pair it with a speak-class kind (speak, ask, share, challenge) and completion complete. For candidate_workspace_experiment: the request represents an effectful operational intention, not an evidence request. evidenceDisposition governs epistemic acquisition; the operationalRequest governs operational intent. They are orthogonal dimensions.';

  const systemParts = [
    "You are Ashley's Thought layer, not her Expression layer.",
    "Choose whether and how to act from the supplied grounded motivations.",
    "Return strict JSON only.",
    "Schema: {kind, delayClass, shouldSpeak, effort, completion, uncertainty, urgency, objective, reason, motivationIds, evidenceDisposition, operationalRequest?}.",
    "kind is speak|silence|delay|ask|revisit|share|challenge|refuse; delayClass is brief|standard|long|reflection_review only when kind is delay and otherwise null; effort is low|medium|high; completion is complete|hold.",
    "Never return a timestamp or duration. The host maps delayClass to a fixed duration.",
    "A refusal is reactive only and must select both the current user_message motivation and a supplied stable boundary motivation.",
    "Use only supplied motivation IDs. Silence is valid. Do not write the message Doc will see.",
    "objective and reason are short intent metadata, not prose to echo and not a copy of the user message.",
    `operationalRequest is optional. When present, it must be exactly: {kind: "project_inspection", request: CognitionInspectionRequest} or {kind: "candidate_workspace_experiment", request: CognitionWorkspaceRequest}. Emit at most one operationalRequest.`,
    projectContextPrompt,
    dispositionContract,
  ];

  if (retryContext) {
    systemParts.push(retryContext);
  }

  let response: ThoughtModelResult;
  try {
    response = await complete(
      [
        { role: "system", content: systemParts.join(" ") },
        { role: "user", content: JSON.stringify({ trigger, base, candidates }) },
      ],
      {
        maxTokens: 1000,
        temperature: 0.15,
        reasoningEffort: "medium",
        lane: (options.lane as any) ?? "interactive",
        purpose: (options.purpose as any) ?? "thought",
        route: "thought",
        deadlineAtMs: thoughtDeadline,
        decisionId: options.decisionId,
        deliveryReservationId: options.deliveryReservationId,
        ownerId: options.ownerId,
        attentionDb: options.attentionDb,
      },
    );
  } catch (error) {
    const errorCode = sanitizedErrorCode(error);
    return {
      ok: false,
      error: errorCode,
      errorCode: null,
      attempt: attemptNumber,
      providerOutcome: "error",
      rawText: "",
    };
  }
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return {
      ok: false,
      error: "AbortError",
      errorCode: null,
      attempt: attemptNumber,
      providerOutcome: "completed",
      rawText: response.text ?? "",
    };
  }

  const rawText = response.text ?? "";
  const usage = response.usage;
  const maxTokens = response.maxTokens;

  // ---- Structural validation ----

  const proposal = parseObject(rawText);
  if (!proposal) {
    return {
      ok: false,
      error: "invalid_json",
      errorCode: "invalid_json",
      attempt: attemptNumber,
      providerOutcome: "completed",
      usage,
      maxTokens,
      rawText,
    };
  }

  const kind = String(proposal.kind) as DecisionKind;
  const delayClass = isDecisionDelayClass(proposal.delayClass)
    ? proposal.delayClass
    : null;
  const effort = String(proposal.effort);
  const completion = String(proposal.completion);
  const allowedIds = new Set(
    motivations.map((item) => item.id).filter((id): id is number => id !== undefined),
  );
  const motivationIds = Array.isArray(proposal.motivationIds)
    ? proposal.motivationIds.map(Number).filter((id) => allowedIds.has(id))
    : base.motivationIds;

  if (
    !kinds.has(kind) ||
    motivationIds.length === 0 ||
    (kind === "delay" && delayClass === null) ||
    (kind !== "delay" && proposal.delayClass != null)
  ) {
    return {
      ok: false,
      error: "payload_invalid",
      errorCode: "payload_invalid",
      attempt: attemptNumber,
      providerOutcome: "completed",
      usage,
      maxTokens,
      rawText,
    };
  }

  const shouldSpeak = proposal.shouldSpeak === true;
  const holding = completion === "hold";
  if (shouldSpeak !== (kind !== "silence" && kind !== "delay" && !holding)) {
    return {
      ok: false,
      error: "contradictory_decision_fields",
      errorCode: "contradictory_decision_fields",
      attempt: attemptNumber,
      providerOutcome: "completed",
      usage,
      maxTokens,
      rawText,
    };
  }

  const disposition = String(proposal.evidenceDisposition ?? "");
  if (!evidenceDispositions.has(disposition as EvidenceDisposition)) {
    return {
      ok: false,
      error: "invalid_evidence_disposition_pairing",
      errorCode: "invalid_evidence_disposition_pairing",
      attempt: attemptNumber,
      providerOutcome: "completed",
      usage,
      maxTokens,
      rawText,
    };
  }

  // ---- Normalize operational request (canonical + legacy adapter) ----

  const { operationalRequest: normalizedRequest, conflict } = normalizeOperationalRequest(
    proposal,
    canOffer,
    canOfferWorkspace,
  );

  // Fail-closed: if normalization detected a canonical+legacy conflict
  if (conflict) {
    return {
      ok: false,
      error: "multiple_operational_intents",
      errorCode: "multiple_operational_intents",
      attempt: attemptNumber,
      providerOutcome: "completed",
      usage,
      maxTokens,
      rawText,
    };
  }

  // ---- Disposition × request cross-field validation ----

  if (disposition === "acquire_project_evidence") {
    if (!canOffer) {
      return {
        ok: false,
        error: "capability_unavailable",
        errorCode: "capability_unavailable",
        attempt: attemptNumber,
        providerOutcome: "completed",
        usage,
        maxTokens,
        rawText,
      };
    }
    if (!normalizedRequest || normalizedRequest.kind !== "project_inspection") {
      return {
        ok: false,
        error: "missing_required_field",
        errorCode: "missing_required_field",
        attempt: attemptNumber,
        providerOutcome: "completed",
        usage,
        maxTokens,
        rawText,
      };
    }
    if (!approvedProjectIds.includes(normalizedRequest.request.projectId)) {
      return {
        ok: false,
        error: "invalid_project",
        errorCode: "invalid_project",
        attempt: attemptNumber,
        providerOutcome: "completed",
        usage,
        maxTokens,
        rawText,
      };
    }
  } else if (disposition === "capability_unavailable") {
    if (canOffer) {
      return {
        ok: false,
        error: "invalid_evidence_disposition_pairing",
        errorCode: "invalid_evidence_disposition_pairing",
        attempt: attemptNumber,
        providerOutcome: "completed",
        usage,
        maxTokens,
        rawText,
      };
    }
  } else if (normalizedRequest?.kind === "project_inspection") {
    // sufficient and defer never acquire evidence: a project_inspection alongside
    // either is structurally contradictory.
    return {
      ok: false,
      error: "invalid_evidence_disposition_pairing",
      errorCode: "invalid_evidence_disposition_pairing",
      attempt: attemptNumber,
      providerOutcome: "completed",
      usage,
      maxTokens,
      rawText,
    };
  }

  // ---- Truncation detection ----
  const truncated = detectTruncation(usage, maxTokens);

  return {
    ok: true,
    proposal: {
      kind,
      delayClass,
      shouldSpeak,
      effort,
      completion,
      motivationIds,
      objective: String(proposal.objective ?? base.objective ?? "").trim().slice(0, 500),
      reason: String(proposal.reason ?? base.reason).trim().slice(0, 1000),
      uncertainty: Math.max(0, Math.min(1, Number(proposal.uncertainty) || 0)),
      urgency: Math.max(0, Math.min(1, Number(proposal.urgency) || 0)),
      modelAlias: response.modelAlias ?? response.model ?? "",
      resolvedModelId: response.resolvedModelId ?? null,
      evidenceDisposition: disposition as EvidenceDisposition,
      operationalRequest: normalizedRequest,
      // Derived backward-compat: extract inspectionRequest from operationalRequest
      inspectionRequest: normalizedRequest?.kind === "project_inspection"
        ? normalizedRequest.request
        : null,
    },
    attempt: attemptNumber,
    providerOutcome: "completed",
    usage,
    maxTokens,
    rawText,
  };
}

/* ------------------------------------------------------------------ */
/*  runThoughtModel — bounded regeneration wrapper                      */
/*                                                                    */
/*  Max 2 attempts.  Retry only on structural validation errors.       */
/*  Provider failures never trigger regeneration.                      */
/* ------------------------------------------------------------------ */

export type ThoughtModelOptions = {
  firstBubbleDeadlineAtMs?: number | null;
  thoughtDeadlineAtMs?: number | null;
  decisionId?: number | null;
  deliveryReservationId?: number | null;
  ownerId?: string | null;
  attentionDb?: DatabaseSync;
  purpose?: string;
  lane?: string;
};

export async function runThoughtModel(
  db: DatabaseSync,
  base: Decision,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete = completeChat,
  options: ThoughtModelOptions = {},
): Promise<ThoughtResult & { envelope?: ThoughtValidationEnvelope }> {
  const attempts: ThoughtValidationAttempt[] = [];
  let lastResult: ThoughtAttemptResult | null = null;

  for (let attempt = 1; attempt <= MAX_THOUGHT_ATTEMPTS; attempt++) {
    const isFirst = attempt === 1;
    const retryContext = isFirst ? undefined : retryFeedback(lastResult?.errorCode ?? "payload_invalid");

    const result = await runThoughtModelAttempt(
      db, base, motivations, trigger, complete, options, attempt, retryContext,
    );

    // Build attempt telemetry
    const attemptTelemetry: ThoughtValidationAttempt = {
      attempt: result.attempt,
      providerOutcome: result.providerOutcome,
      outputTokens: result.usage?.completionTokens ?? null,
      maxTokens: result.maxTokens ?? null,
      truncated: detectTruncation(result.usage, result.maxTokens),
      parseOk: result.ok || (result.errorCode !== "invalid_json"),
      validationOk: result.ok,
      errorCode: result.errorCode ?? null,
      field: null,
      opKind: result.proposal?.operationalRequest?.kind ?? null,
      bytes: Buffer.byteLength(result.rawText, "utf8"),
      sha256: result.rawText ? sha256(result.rawText) : "",
    };
    attempts.push(attemptTelemetry);

    // Provider failure → no structural retry, safe fallback
    if (result.providerOutcome === "error" || isProviderFailure(result.error ?? "")) {
      return {
        ok: false,
        error: result.error ?? "thought_error",
        envelope: { attempts, finalErrorCode: result.errorCode ?? null },
      };
    }

    // Structural success → return
    if (result.ok) {
      // Also attach the attempt telemetry for successful recovery cases
      return {
        ok: true,
        proposal: result.proposal!,
        envelope: attempts.length > 1
          ? { attempts, finalErrorCode: null }
          : undefined,
      };
    }

    // Structural failure → potentially retry
    lastResult = result;

    // If not retryable or last attempt → stop
    const retryable = result.errorCode
      ? STRUCTURAL_RETRYABLE_CODES.has(result.errorCode)
      : false;
    if (!retryable || attempt >= MAX_THOUGHT_ATTEMPTS) {
      return {
        ok: false,
        error: result.error ?? "thought_error",
        envelope: { attempts, finalErrorCode: result.errorCode ?? null },
      };
    }
  }

  // Should not reach here, but safety fallback
  return {
    ok: false,
    error: lastResult?.error ?? "internal_error",
    envelope: { attempts, finalErrorCode: lastResult?.errorCode ?? null },
  };
}

/* ------------------------------------------------------------------ */
/*  deliberateDecision — with bounded regeneration + telemetry          */
/* ------------------------------------------------------------------ */

export type DeliberateOptions = ThoughtModelOptions & {
  /** When false, never call the model (easy/terminal/observe/unavailable). */
  allowModelThought?: boolean;
};

/**
 * Model-assisted Thought with bounded structural regeneration and
 * production telemetry wiring.
 *
 * Max 2 model attempts.  Provider failures and deadline cancellations
 * never trigger structural retry.  Every attempt's bounded metadata
 * is captured in a ThoughtValidationEnvelope attached to the final Decision.
 */
export async function deliberateDecision(
  db: DatabaseSync,
  base: Decision,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete = completeChat,
  canInfluence: CapabilityGate = (database) =>
    capabilityCanInfluence(database, "thought"),
  canRefuse: CapabilityGate = (database) =>
    capabilityCanInfluence(database, "refusal"),
  options: DeliberateOptions = {},
): Promise<Decision> {
  const allowModelThought = options.allowModelThought !== false;
  if (
    !allowModelThought ||
    !canInfluence(db) ||
    !env.groqApiKey ||
    base.kind === "silence" ||
    base.kind === "delay" ||
    base.cognitiveAllocation.completion === "hold" ||
    !base.cognitiveAllocation.shouldSpeak
  ) {
    return base;
  }

  const preDeadline =
    options.thoughtDeadlineAtMs ??
    (options.firstBubbleDeadlineAtMs != null
      ? options.firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
      : null);
  if (preDeadline != null && Date.now() >= preDeadline) {
    return base;
  }

  const result = await runThoughtModel(
    db, base, motivations, trigger, complete, options,
  );

  // Attach envelope to decision if present
  const envelope = result.envelope ?? null;

  if (!result.ok) {
    return {
      ...base,
      thoughtSource: "fallback",
      thoughtError: result.error,
      thoughtValidation: envelope,
    };
  }

  const { proposal } = result;
  const { kind, shouldSpeak, motivationIds, objective, reason } = proposal;
  if (
    kind === "refuse" &&
    (!canRefuse(db) ||
      !hasGroundedReactiveRefusal(db, motivations, proposal.motivationIds, trigger))
  ) {
    return {
      ...base,
      thoughtSource: "fallback",
      thoughtError: "contradictory_decision_fields",
      thoughtValidation: envelope,
    };
  }
  const evidenceTypes = new Set([
    "message",
    "episode",
    "fact",
    "question",
    "opinion",
    "take",
    "identity",
    "mind_state",
    "doc_reminder",
    "ashley_self_commitment",
    "mutual_commitment",
    "relational_tension",
    "open_cognitive_item",
  ]);
  const evidenceRefs = motivations
    .filter(
      (item) =>
        item.id !== undefined &&
        proposal.motivationIds.includes(item.id) &&
        item.refType !== null &&
        item.refType !== undefined &&
        evidenceTypes.has(item.refType) &&
        item.refId != null,
    )
    .map((item) => ({
      type: item.refType as
        | "message"
        | "episode"
        | "fact"
        | "question"
        | "opinion"
        | "take"
        | "identity"
        | "mind_state"
        | "doc_reminder"
        | "ashley_self_commitment"
        | "mutual_commitment"
        | "relational_tension"
        | "open_cognitive_item",
      id: item.refId!,
    }));
  const selectedScore = Math.max(
    0,
    ...motivations
      .filter((item) => item.id !== undefined && proposal.motivationIds.includes(item.id))
      .map((item) => item.score),
  );
  const coercion = probeDecisionCoercion({ objective, reason });
  if (coercion.blocked) {
    return {
      ...base,
      kind: "refuse",
      reason: "Coercion gate blocked instrumental pressure.",
      objective: "refuse instrumental leverage",
      silenceReasonCode: "coercion_blocked",
      thoughtSource: "deterministic",
      thoughtError: "coercion_blocked",
      cognitiveAllocation: {
        shouldSpeak: false,
        effort: "low",
        completion: "complete",
      },
      thoughtValidation: envelope,
    };
  }
  return resolveAcquisitionContradiction({
    ...base,
    kind,
    delayClass: proposal.delayClass ?? undefined,
    motivationIds,
    score: selectedScore,
    evidenceRefs,
    objective,
    reason,
    uncertainty: proposal.uncertainty,
    urgency: proposal.urgency,
    thoughtSource: "model",
    thoughtError: null,
    cognitiveAllocation: {
      shouldSpeak,
      effort: proposal.effort === "high" || proposal.effort === "medium" ? proposal.effort : "low",
      completion: proposal.completion === "hold" ? "hold" : "complete",
    },
    evidenceDisposition: proposal.evidenceDisposition,
    operationalRequest: proposal.operationalRequest ?? null,
    // Backward compat: derive inspectionRequest from operationalRequest for legacy consumers
    inspectionRequest: proposal.operationalRequest?.kind === "project_inspection"
      ? proposal.operationalRequest.request
      : null,
    thoughtValidation: envelope,
  });
}

function resolveAcquisitionContradiction(decision: Decision): Decision {
  if (
    decision.evidenceDisposition !== "acquire_project_evidence" ||
    (decision.kind !== "delay" && decision.kind !== "silence")
  ) {
    return decision;
  }
  return {
    ...decision,
    kind: "speak",
    delayClass: undefined,
    silenceReasonCode: undefined,
    holdReasonCode: undefined,
    cognitiveAllocation: {
      shouldSpeak: true,
      effort: decision.cognitiveAllocation.effort,
      completion: "complete",
    },
  };
}

/* ------------------------------------------------------------------ */
/*  deliberateThoughtContinuation — pass 2 (no new execution)          */
/* ------------------------------------------------------------------ */

export type DeliberateThoughtContinuationOptions = ThoughtModelOptions & {
  allowModelThought?: boolean;
};

/**
 * Second Cognitive Pass (Thought Continuation).
 *
 * Re-enters Thought after sandbox inspection or workspace experiment execution.
 *
 * Invariants (fail-closed):
 *  1. Exactly one operational execution round per turn: pass 2 cannot initiate another execution;
 *  2. Execution evidence (operationalRequest, observation, license, error) is immutable across continuation;
 *  3. On sandbox failure or unavailability, cognition does not infer file absence or zero matches.
 */
export async function deliberateThoughtContinuation(
  db: DatabaseSync,
  intermediateDecision: Decision,
  observation: ProjectInspectionObservation | WorkspaceExperimentObservation | null,
  executionError: string | null,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete = completeChat,
  canInfluence: CapabilityGate = (database) =>
    capabilityCanInfluence(database, "thought"),
  options: DeliberateThoughtContinuationOptions = {},
): Promise<Decision> {
  const allowModelThought = options.allowModelThought !== false;
  const acquiring =
    intermediateDecision.evidenceDisposition === "acquire_project_evidence" ||
    intermediateDecision.operationalRequest !== undefined;
  if (
    !allowModelThought ||
    !canInfluence(db) ||
    !env.groqApiKey ||
    intermediateDecision.kind === "silence" ||
    (intermediateDecision.kind === "delay" && !acquiring)
  ) {
    const isM2 = intermediateDecision.operationalRequest
      ? intermediateDecision.operationalRequest.kind === "project_inspection"
      : false;
    return {
      ...intermediateDecision,
      operationalObservation: observation,
      inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
      workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    };
  }

  const thoughtDeadline =
    options.thoughtDeadlineAtMs ??
    (options.firstBubbleDeadlineAtMs != null
      ? options.firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
      : null);
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    const isM2 = intermediateDecision.operationalRequest
      ? intermediateDecision.operationalRequest.kind === "project_inspection"
      : false;
    return {
      ...intermediateDecision,
      operationalObservation: observation,
      inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
      workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    };
  }

  let response: ThoughtModelResult;
  const continuationMessages: Parameters<typeof completeChat>[0] = [
    {
      role: "system",
      content: [
        "You are Ashley's Thought layer continuing deliberation after receiving sandbox execution results.",
        "Interpret the structured observation or execution error truthfully to produce your final Decision.",
        "Return strict JSON only: {kind,delayClass,shouldSpeak,effort,completion,uncertainty,urgency,objective,reason,motivationIds,cognitiveResult?}.",
        "kind is speak|silence|delay|ask|revisit|share|challenge|refuse; effort is low|medium|high; completion is complete|hold.",
        "Do NOT emit another operationalRequest. Exactly one sandbox execution per turn.",
        "If the sandbox failed or is unavailable, reason about the failure truthfully without inferring absence of files or zero matches.",
        "objective and reason must reflect your cognitive interpretation of the evidence.",
        "cognitiveResult is an optional concise factual summary of what was learned from execution to guide Expression without raw code dumps.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        trigger,
        intermediateObjective: intermediateDecision.objective,
        intermediateReason: intermediateDecision.reason,
        operationalRequest: intermediateDecision.operationalRequest ?? null,
        observation: observation ?? null,
        executionError: executionError ?? null,
      }),
    },
  ];
  try {
    response = await complete(
      continuationMessages,
      {
        maxTokens: 1000,
        temperature: 0.15,
        reasoningEffort: "medium",
        lane: (options.lane as any) ?? "interactive",
        purpose: (options.purpose as any) ?? "thought",
        route: "thought",
        deadlineAtMs: thoughtDeadline,
        decisionId: options.decisionId,
        deliveryReservationId: options.deliveryReservationId,
        ownerId: options.ownerId,
        attentionDb: options.attentionDb,
      },
    );
  } catch (error) {
    const errorCode = sanitizedErrorCode(error);
    if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
      const isM2 = intermediateDecision.operationalRequest
      ? intermediateDecision.operationalRequest.kind === "project_inspection"
      : false;
      return {
        ...intermediateDecision,
        operationalObservation: observation,
        inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
        workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
        thoughtSource: "fallback",
        thoughtError: errorCode,
      };
    }
    try {
      response = await complete(
        continuationMessages,
        {
          maxTokens: 1000,
          temperature: 0.15,
          reasoningEffort: "medium",
          lane: (options.lane as any) ?? "interactive",
          purpose: (options.purpose as any) ?? "thought",
          route: "thought",
          deadlineAtMs: thoughtDeadline,
          decisionId: options.decisionId,
          deliveryReservationId: options.deliveryReservationId,
          ownerId: options.ownerId,
          attentionDb: options.attentionDb,
        },
      );
    } catch (error2) {
      const isM2 = intermediateDecision.operationalRequest
      ? intermediateDecision.operationalRequest.kind === "project_inspection"
      : false;
      return {
        ...intermediateDecision,
        operationalObservation: observation,
        inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
        workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
        thoughtSource: "fallback",
        thoughtError: sanitizedErrorCode(error2),
      };
    }
  }

  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    const isM2 = intermediateDecision.operationalRequest
      ? intermediateDecision.operationalRequest.kind === "project_inspection"
      : false;
    return {
      ...intermediateDecision,
      operationalObservation: observation,
      inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
      workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    };
  }

  const proposal = parseObject(response.text);
  const isM2 = intermediateDecision.operationalRequest
    ? intermediateDecision.operationalRequest.kind === "project_inspection"
    : false;
  if (!proposal) {
    return {
      ...intermediateDecision,
      operationalObservation: observation,
      inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
      workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    };
  }

  // Pass 2 must NOT initiate any new sandbox execution (invariant 1)
  if (
    proposal.operationalRequest !== undefined ||
    proposal.inspectionRequest !== undefined ||
    proposal.workspaceRequest !== undefined
  ) {
    // Structural rejection of re-execution attempts in pass 2
  }

  const kind = String(proposal.kind) as DecisionKind;
  const delayClass = isDecisionDelayClass(proposal.delayClass)
    ? proposal.delayClass
    : null;
  const effort = String(proposal.effort);
  const completion = String(proposal.completion);
  const allowedIds = new Set(
    motivations.map((item) => item.id).filter((id): id is number => id !== undefined),
  );
  const proposedIds = Array.isArray(proposal.motivationIds)
    ? proposal.motivationIds.map(Number).filter((id) => allowedIds.has(id))
    : [];
  const motivationIds =
    proposedIds.length > 0 ? proposedIds : intermediateDecision.motivationIds;

  if (
    !kinds.has(kind) ||
    motivationIds.length === 0 ||
    (kind === "delay" && delayClass === null) ||
    (kind !== "delay" && proposal.delayClass != null)
  ) {
    return {
      ...intermediateDecision,
      operationalObservation: observation,
      inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
      workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    };
  }

  const shouldSpeak = proposal.shouldSpeak === true;
  const holding = completion === "hold";
  if (shouldSpeak !== (kind !== "silence" && kind !== "delay" && !holding)) {
    return {
      ...intermediateDecision,
      operationalObservation: observation,
      inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
      workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    };
  }

  const objective = String(
    proposal.objective ?? intermediateDecision.objective ?? "",
  ).trim().slice(0, 500);
  const reason = String(
    proposal.reason ?? intermediateDecision.reason,
  ).trim().slice(0, 1000);
  const cognitiveResult =
    typeof proposal.inspectionCognitiveResult === "string"
      ? proposal.inspectionCognitiveResult.trim().slice(0, 1000)
      : typeof proposal.cognitiveResult === "string"
      ? proposal.cognitiveResult.trim().slice(0, 1000)
      : null;

  const coercion = probeDecisionCoercion({ objective, reason });
  if (coercion.blocked) {
    return {
      ...intermediateDecision,
      kind: "refuse",
      reason: "Coercion gate blocked instrumental pressure.",
      objective: "refuse instrumental leverage",
      silenceReasonCode: "coercion_blocked",
      thoughtSource: "deterministic",
      thoughtError: "coercion_blocked",
      cognitiveAllocation: {
        shouldSpeak: false,
        effort: "low",
        completion: "complete",
      },
      operationalObservation: observation,
      inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
      workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    };
  }

  return resolveAcquisitionContradiction({
    ...intermediateDecision,
    kind,
    delayClass: delayClass ?? undefined,
    motivationIds,
    objective,
    reason,
    operationalCognitiveResult: cognitiveResult,
    inspectionCognitiveResult: cognitiveResult,
    uncertainty: Math.max(0, Math.min(1, Number(proposal.uncertainty) || 0)),
    urgency: Math.max(0, Math.min(1, Number(proposal.urgency) || 0)),
    thoughtSource: "model",
    thoughtError: null,
    cognitiveAllocation: {
      shouldSpeak,
      effort: proposal.effort === "high" || proposal.effort === "medium" ? proposal.effort : "low",
      completion: proposal.completion === "hold" ? "hold" : "complete",
    },
    // Invariant 2: Execution evidence is immutable across Thought continuation
    operationalRequest: intermediateDecision.operationalRequest,
    operationalObservation: observation,
    inspectionObservation: isM2 ? (observation as ProjectInspectionObservation | null) : null,
    workspaceObservation: !isM2 ? (observation as WorkspaceExperimentObservation | null) : null,
    operationalLicense: intermediateDecision.operationalLicense,
  });
}
