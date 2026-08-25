/**
 * Trusted reactive operational admission.
 *
 * MODEL-CLAIMED BASIS ID != VALIDATED ADMISSION
 *
 * Thought validation and runtime execution both call evaluateReactiveOperationalAdmission.
 * The model may name operationalBasisMotivationId; that claim is provenance only.
 * Runtime will not execute a reactive operationalRequest unless a trusted
 * admission already exists on the Decision and this evaluator still admits
 * the same frozen inputs.
 */

import { detectReactiveSandboxRoundtripRequest } from "./reactive-admission.js";
import type {
  CognitionOperationalRequest,
  Decision,
  Motivation,
  ReactiveOperationalAdmission,
  ReactiveOperationalRequestIdentity,
} from "../types.js";

export type ReactiveOperationalAdmissionDenial = {
  admitted: false;
  reason: string;
};

export type ReactiveOperationalAdmissionResult =
  | ReactiveOperationalAdmission
  | ReactiveOperationalAdmissionDenial;

export type EvaluateReactiveOperationalAdmissionInput = {
  userMessage: string;
  motivations: Motivation[];
  selectedMotivationIds: number[];
  claimedBasisMotivationId?: number | null;
  operationalRequest: CognitionOperationalRequest;
  currentMessageEntityUuid?: string | null;
};

const FILE_TOKEN_RE = /(?:^|[^a-z0-9])((?:[\w.-]+\/)*[\w.-]+\.[a-z][a-z0-9]{0,9})(?![a-z0-9])/gi;

const INSPECTION_VERBS =
  /\b(?:inspect|read|look\s+at|show(?:\s+me)?|check|search|list|open|cat|find|grep)\b/i;
const RESUMPTION_CUES =
  /\b(?:finish|resume|continue|go\s+ahead|from\s+earlier|that\s+(?:thing|task|one)|the\s+(?:thing|task)\s+from)\b/i;
const VERIFY_CUES = /\b(?:verify|verification|recipe)\b/i;
const VERIFY_OBJECT = /\b(?:candidate|workspace|snapshot|project)\b/i;
const WORKSPACE_VERBS =
  /\b(?:write|create|edit|replace|delete|workspace|sandbox)\b/i;
const AUTHORSHIP_CUES =
  /\b(?:changeset|change-set|change\s+set|author|seal)\b/i;
const BOUNDED_CUES = /\bbounded\s+operation\b/i;
const EXPORT_CUES = /\bexport\b/i;
const EXPORT_OBJECT = /\b(?:patch|changeset|change-set|change\s+set)\b/i;

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

export function extractFileTokens(text: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(FILE_TOKEN_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const token = match[1]?.toLowerCase();
    if (token) found.add(token);
  }
  return [...found];
}

function userNamesPath(userMessage: string, path: string): boolean {
  const lower = userMessage.toLowerCase();
  const full = path.toLowerCase().replace(/\\/g, "/");
  const base = basename(full);
  if (base.length < 3) return false;
  return lower.includes(full) || lower.includes(base);
}

export function operationalRequestIdentity(
  request: CognitionOperationalRequest,
): ReactiveOperationalRequestIdentity {
  switch (request.kind) {
    case "project_inspection":
      return {
        kind: request.kind,
        operation: request.request.operation,
        projectId: request.request.projectId,
        targetPath: "path" in request.request ? request.request.path ?? null : null,
      };
    case "candidate_workspace_experiment":
      return {
        kind: request.kind,
        operation: request.request.operation,
        projectId: request.request.projectId,
        targetPath: "path" in request.request ? request.request.path ?? null : null,
        workspaceId:
          "workspaceId" in request.request
            ? request.request.workspaceId ?? null
            : null,
      };
    case "candidate_verification":
      return {
        kind: request.kind,
        operation: request.request.operation,
        projectId: request.request.projectId,
        workspaceId: request.request.workspaceId ?? null,
      };
    case "candidate_authorship":
      return {
        kind: request.kind,
        operation: request.request.operation,
        projectId: request.request.projectId,
        workspaceId: request.request.workspaceId ?? null,
        targetPath: request.request.intendedPaths?.[0] ?? null,
      };
    case "bounded_operation":
      return {
        kind: request.kind,
        operation: request.request.operation,
        projectId: request.request.projectId,
        workspaceId: request.request.workspaceId ?? null,
        targetPath: firstBoundedPath(request),
      };
    case "patch_export":
      return {
        kind: request.kind,
        operation: request.request.operation,
        projectId: request.request.projectId,
      };
    default: {
      const _never: never = request;
      return _never;
    }
  }
}

function firstBoundedPath(
  request: Extract<CognitionOperationalRequest, { kind: "bounded_operation" }>,
): string | null {
  for (const step of request.request.steps) {
    if (step.kind === "candidate_workspace_experiment" && "path" in step.request) {
      return step.request.path ?? null;
    }
  }
  return null;
}

function requestPaths(request: CognitionOperationalRequest): string[] {
  const identity = operationalRequestIdentity(request);
  const paths: string[] = [];
  if (identity.targetPath) paths.push(identity.targetPath);
  if (request.kind === "bounded_operation") {
    for (const step of request.request.steps) {
      if (step.kind === "candidate_workspace_experiment" && "path" in step.request) {
        const path = step.request.path;
        if (path) paths.push(path);
      }
    }
  }
  if (request.kind === "candidate_authorship") {
    for (const path of request.request.intendedPaths ?? []) {
      if (path) paths.push(path);
    }
  }
  return [...new Set(paths)];
}

function searchPattern(
  request: CognitionOperationalRequest,
): string | null {
  if (request.kind !== "project_inspection") return null;
  if (request.request.operation !== "project.search_text") return null;
  return "pattern" in request.request ? request.request.pattern : null;
}

function pathContradictsUser(
  userMessage: string,
  request: CognitionOperationalRequest,
): boolean {
  const paths = requestPaths(request);
  if (paths.length === 0) return false;
  const named = extractFileTokens(userMessage);
  if (named.length === 0) return false;
  const matchesRequest = named.some((token) =>
    paths.some((path) => {
      const base = basename(path).toLowerCase();
      return token === base || token.endsWith(`/${base}`) || basename(token) === base;
    }),
  );
  return !matchesRequest;
}

function currentOwnerAdmits(
  userMessage: string,
  request: CognitionOperationalRequest,
): boolean {
  const msg = userMessage.trim();
  if (!msg) return false;
  if (pathContradictsUser(msg, request)) return false;

  const paths = requestPaths(request);

  switch (request.kind) {
    case "project_inspection": {
      const pattern = searchPattern(request);
      if (pattern && msg.toLowerCase().includes(pattern.toLowerCase())) {
        return (
          INSPECTION_VERBS.test(msg) ||
          /\b(?:present|anywhere|repo|repository)\b/i.test(msg)
        );
      }
      if (paths.length === 0) return false;
      const namesTarget = paths.some((path) => userNamesPath(msg, path));
      if (!namesTarget) return false;
      return (
        INSPECTION_VERBS.test(msg) ||
        (/\bversion\b/i.test(msg) && namesTarget)
      );
    }
    case "candidate_workspace_experiment": {
      if (detectReactiveSandboxRoundtripRequest(msg)) return true;
      if (paths.length > 0 && !paths.some((path) => userNamesPath(msg, path))) {
        return false;
      }
      return WORKSPACE_VERBS.test(msg);
    }
    case "candidate_verification":
      return VERIFY_CUES.test(msg) && VERIFY_OBJECT.test(msg);
    case "candidate_authorship":
      return AUTHORSHIP_CUES.test(msg);
    case "bounded_operation":
      if (BOUNDED_CUES.test(msg) || detectReactiveSandboxRoundtripRequest(msg)) {
        if (pathContradictsUser(msg, request)) return false;
        return true;
      }
      return false;
    case "patch_export":
      return EXPORT_CUES.test(msg) && EXPORT_OBJECT.test(msg);
    default: {
      const _never: never = request;
      return _never;
    }
  }
}

function motivationMatchesRequest(
  summary: string,
  request: CognitionOperationalRequest,
): boolean {
  const lower = summary.toLowerCase();
  const paths = requestPaths(request);
  if (paths.length > 0) {
    return paths.some((path) => lower.includes(basename(path).toLowerCase()));
  }
  switch (request.kind) {
    case "candidate_verification":
      return /verif|candidate|workspace|snapshot/.test(lower);
    case "candidate_authorship":
      return /changeset|change-set|author|seal/.test(lower);
    case "bounded_operation":
      return /bounded|operate|roundtrip/.test(lower);
    case "patch_export":
      return /export|patch/.test(lower);
    case "project_inspection":
    case "candidate_workspace_experiment":
      return false;
    default: {
      const _never: never = request;
      return _never;
    }
  }
}

function backgroundMatches(
  motivations: Motivation[],
  selected: Set<number>,
  request: CognitionOperationalRequest,
): Motivation[] {
  return motivations.filter((item) => {
    if (item.id === undefined || !selected.has(item.id)) return false;
    if (item.kind === "user_message" || item.kind === "silence_signal") return false;
    return motivationMatchesRequest(item.summary, request);
  });
}

function explicitResumptionAdmits(
  userMessage: string,
  basis: Motivation,
  motivations: Motivation[],
  selected: Set<number>,
  request: CognitionOperationalRequest,
): boolean {
  if (!motivationMatchesRequest(basis.summary, request)) return false;
  if (pathContradictsUser(userMessage, request)) return false;

  const namedTarget = requestPaths(request).some((path) =>
    userNamesPath(userMessage, path),
  );
  const matches = backgroundMatches(motivations, selected, request);

  if (namedTarget) {
    if (matches.length > 1 && !matches.some((item) => item.id === basis.id)) {
      return false;
    }
    return (
      INSPECTION_VERBS.test(userMessage) ||
      RESUMPTION_CUES.test(userMessage) ||
      /\bversion\b/i.test(userMessage)
    );
  }

  if (!RESUMPTION_CUES.test(userMessage)) return false;
  if (matches.length !== 1) return false;
  return matches[0]?.id === basis.id;
}

function resolveBasis(
  input: EvaluateReactiveOperationalAdmissionInput,
): { ok: true; basis: Motivation; claimedId: number | null } | { ok: false; reason: string } {
  const selected = new Set(input.selectedMotivationIds);
  const byId = new Map<number, Motivation>();
  for (const item of input.motivations) {
    if (item.id !== undefined) byId.set(item.id, item);
  }

  const claimed = input.claimedBasisMotivationId;
  if (claimed === undefined || claimed === null) {
    const user = input.motivations.find(
      (item) =>
        (item.kind === "user_message" || item.kind === "silence_signal") &&
        item.id !== undefined,
    );
    if (!user || user.id === undefined) {
      return { ok: false, reason: "missing_basis" };
    }
    return { ok: true, basis: user, claimedId: null };
  }

  if (!Number.isFinite(claimed) || !Number.isInteger(claimed)) {
    return { ok: false, reason: "basis_not_in_input" };
  }
  const basis = byId.get(claimed);
  if (!basis) return { ok: false, reason: "basis_not_in_input" };
  const isCurrentTurn =
    basis.kind === "user_message" || basis.kind === "silence_signal";
  if (!isCurrentTurn && !selected.has(claimed)) {
    return { ok: false, reason: "basis_not_selected" };
  }
  return { ok: true, basis, claimedId: claimed };
}

export function evaluateReactiveOperationalAdmission(
  input: EvaluateReactiveOperationalAdmissionInput,
): ReactiveOperationalAdmissionResult {
  const resolved = resolveBasis(input);
  if (!resolved.ok) {
    return { admitted: false, reason: resolved.reason };
  }
  const { basis, claimedId } = resolved;
  const userText = input.userMessage.trim();
  const request = input.operationalRequest;
  const selected = new Set(input.selectedMotivationIds);
  const identity = operationalRequestIdentity(request);

  const ownerAdmits = currentOwnerAdmits(userText, request);
  const isCurrentTurn =
    basis.kind === "user_message" || basis.kind === "silence_signal";

  if (isCurrentTurn) {
    if (!ownerAdmits) {
      return { admitted: false, reason: "unauthorized_task_continuation" };
    }
    return admit({
      admissionClass: "current_owner_request",
      claimedId,
      basis,
      request,
      identity,
      currentMessageEntityUuid: input.currentMessageEntityUuid ?? null,
    });
  }

  if (ownerAdmits && motivationMatchesRequest(basis.summary, request)) {
    return admit({
      admissionClass: "current_owner_request",
      claimedId,
      basis,
      request,
      identity,
      currentMessageEntityUuid: input.currentMessageEntityUuid ?? null,
    });
  }

  if (ownerAdmits && !motivationMatchesRequest(basis.summary, request)) {
    return { admitted: false, reason: "basis_does_not_license_request" };
  }

  if (
    !explicitResumptionAdmits(
      userText,
      basis,
      input.motivations,
      selected,
      request,
    )
  ) {
    const matches = backgroundMatches(input.motivations, selected, request);
    if (RESUMPTION_CUES.test(userText) && matches.length !== 1) {
      return { admitted: false, reason: "ambiguous_resumption" };
    }
    return { admitted: false, reason: "unauthorized_task_continuation" };
  }

  return admit({
    admissionClass: "explicit_resumption",
    claimedId,
    basis,
    request,
    identity,
    currentMessageEntityUuid: input.currentMessageEntityUuid ?? null,
  });
}

function admit(input: {
  admissionClass: ReactiveOperationalAdmission["admissionClass"];
  claimedId: number | null;
  basis: Motivation;
  request: CognitionOperationalRequest;
  identity: ReactiveOperationalRequestIdentity;
  currentMessageEntityUuid: string | null;
}): ReactiveOperationalAdmission {
  const basisId = input.basis.id;
  if (basisId === undefined) {
    return {
      admitted: true,
      admissionClass: input.admissionClass,
      claimedBasisMotivationId: input.claimedId,
      validatedBasisMotivationId: input.claimedId ?? 0,
      basisKind: input.basis.kind,
      operationalKind: input.request.kind,
      requestIdentity: input.identity,
      currentMessageEntityUuid: input.currentMessageEntityUuid,
    };
  }
  return {
    admitted: true,
    admissionClass: input.admissionClass,
    claimedBasisMotivationId: input.claimedId,
    validatedBasisMotivationId: basisId,
    basisKind: input.basis.kind,
    operationalKind: input.request.kind,
    requestIdentity: input.identity,
    currentMessageEntityUuid: input.currentMessageEntityUuid,
  };
}

export type AuthorizeReactiveOperationalExecutionInput = {
  decision: Decision;
  userMessage: string;
  motivations: Motivation[];
  currentMessageEntityUuid: string | null;
};

export function authorizeReactiveOperationalExecution(
  input: AuthorizeReactiveOperationalExecutionInput,
):
  | { permitted: true; admission: ReactiveOperationalAdmission }
  | { permitted: false; reason: string } {
  const request = input.decision.operationalRequest;
  if (!request) {
    return { permitted: false, reason: "no_operational_request" };
  }
  const carried = input.decision.reactiveOperationalAdmission;
  if (!carried || carried.admitted !== true) {
    return { permitted: false, reason: "trusted_admission_absent" };
  }
  const currentUuid = input.currentMessageEntityUuid ?? "";
  const carriedUuid = carried.currentMessageEntityUuid ?? "";
  if (carriedUuid && currentUuid && carriedUuid !== currentUuid) {
    return { permitted: false, reason: "admission_turn_mismatch" };
  }
  const evaluated = evaluateReactiveOperationalAdmission({
    userMessage: input.userMessage,
    motivations: input.motivations,
    selectedMotivationIds: input.decision.motivationIds,
    claimedBasisMotivationId: input.decision.operationalBasisMotivationId,
    operationalRequest: request,
    currentMessageEntityUuid: input.currentMessageEntityUuid,
  });
  if (!evaluated.admitted) {
    return { permitted: false, reason: evaluated.reason };
  }
  if (evaluated.operationalKind !== request.kind) {
    return { permitted: false, reason: "request_identity_mismatch" };
  }
  return { permitted: true, admission: evaluated };
}

export function parseClaimedOperationalBasisId(
  raw: unknown,
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return Number.NaN;
  return value;
}
