import type { DispatchTruth, ModelFailure } from "../../model-fabric/types.js";

export type ThoughtQualificationCaseId =
  | "settlement"
  | "observation_intent"
  | "effect_intent"
  | "abstain"
  | "structural_correction"
  | "stale_before_publish"
  | "authority_revision";

export type ThoughtQualificationEnvironment = "fixture" | "isolated_live";
export type QualificationGateStatus = "pass" | "fail";

export type QualificationFirstFailureBoundary =
  | "PRE_DISPATCH_LOCAL_FAILURE"
  | "REQUEST_DISPATCHED_NO_RESPONSE"
  | "PROVIDER_ERROR_RESPONSE"
  | "PROVIDER_CONTENT_RECEIVED"
  | "LOCAL_SCHEMA_REJECTION"
  | "STRICT_PARSER_REJECTION"
  | "NOT_REACHED";

export type QualificationReachability = "PASS" | "FAIL" | "NOT_REACHED";

export type QualificationDiagnostics = Readonly<{
  firstFailureBoundary: QualificationFirstFailureBoundary;
  closedSchemaFailureKeyword: string | null;
  closedSchemaFailureInstancePath: string | null;
  closedSchemaFailureSchemaPath: string | null;
  closedSchemaFailureBranch: string | null;
  errorCode: string | null;
  dispatchTruth: DispatchTruth | null;
  dispatchStage: ModelFailure["stage"] | null;
  providerRequestStarted: boolean;
  providerResponseReceived: boolean;
  attemptId: string | null;
  reachability: Readonly<{
    kernelBinding: QualificationReachability;
    fencing: QualificationReachability;
    authorityReachability: QualificationReachability;
    semanticValidity: QualificationReachability;
  }>;
}>;

export type ThoughtQualificationCaseResult = Readonly<{
  caseId: ThoughtQualificationCaseId;
  invocationIds: readonly string[];
  providerAttemptIds: readonly string[];
  transport: "success" | "failure";
  rawContentBytes: number;
  rawContentDigest: `sha256:${string}`;
  closedSchemaConformance: "pass" | "fail";
  jsonSyntax: "pass" | "fail";
  strictParser: "pass" | "fail";
  kernelBinding: QualificationGateStatus;
  fencing: QualificationGateStatus;
  authorityReachability: QualificationGateStatus;
  semanticValidity: QualificationGateStatus;
  resourcePolicy: QualificationGateStatus;
  elapsedMs: number;
  outputTokens: number | null;
  wireMode: string | null;
  wireBindingId: string | null;
  providerDeclaredEnforcement: string | null;
  capabilityFingerprint: string | null;
  diagnostics: QualificationDiagnostics;
  failureCodes: readonly string[];
  verdict: "PASS" | "NOT_QUALIFIED";
}>;

export type ThoughtQualificationNegativeWitness = ThoughtQualificationCaseResult & Readonly<{
  witness: string;
}>;

export type ThoughtRouteQualification = Readonly<{
  schema: "ashley.thought.route_qualification.v1";
  candidate: {
    provider: "mistral";
    model: "mistral-small-2603";
    occupantId: string;
  };
  capabilityFingerprint: string;
  runId: string;
  environment: ThoughtQualificationEnvironment;
  cases: readonly ThoughtQualificationCaseResult[];
  negativeWitnesses?: readonly ThoughtQualificationNegativeWitness[];
  preflight?: Readonly<Record<string, unknown>>;
  outputDirectory?: string | null;
  qualificationResultPath?: string | null;
  verdict: "PASS" | "NOT_QUALIFIED" | "NOT_RUN" | "OUTCOME_UNKNOWN";
}>;
