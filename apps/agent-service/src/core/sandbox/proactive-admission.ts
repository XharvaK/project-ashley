/**
 * Proactive engineering admission (Autonomous Engineering Workstation wave).
 *
 * Ashley may START safe candidate-workspace investigations herself from
 * grounded sources (curiosity, proactive cognition, open cognitive items,
 * runtime health anomalies, build/test regressions, prior findings). Admission
 * must remain grounded and preserve provenance; it is NOT arbitrary model whim
 * becoming executable authority.
 */

export type EngineeringAdmissionSource =
  | { kind: "curiosity"; ref: string }
  | { kind: "proactive_cognition"; ref: string }
  | { kind: "open_cognitive_item"; ref: string }
  | { kind: "health_anomaly"; ref: string; detail: string }
  | { kind: "build_regression"; ref: string }
  | { kind: "test_regression"; ref: string }
  | { kind: "prior_finding"; ref: string };

export type AdmissionDecision =
  | { admit: true; cause: "proactive" | "health_anomaly"; groundingRef: string; rationale: string }
  | { admit: false; reason: string };

const GROUNDED_KINDS = new Set<EngineeringAdmissionSource["kind"]>([
  "curiosity",
  "proactive_cognition",
  "open_cognitive_item",
  "health_anomaly",
  "build_regression",
  "test_regression",
  "prior_finding",
]);

export function evaluateProactiveAdmission(
  source: EngineeringAdmissionSource,
  ctx: { autonomyEnabled: boolean; activeTaskCount: number; maxConcurrent: number },
): AdmissionDecision {
  if (!ctx.autonomyEnabled) {
    return { admit: false, reason: "autonomy_disabled" };
  }
  if (!GROUNDED_KINDS.has(source.kind)) {
    return { admit: false, reason: "ungrounded_source" };
  }
  if (ctx.activeTaskCount >= ctx.maxConcurrent) {
    return { admit: false, reason: "concurrency_limit" };
  }
  const groundingRef = source.ref;
  const rationale =
    source.kind === "health_anomaly"
      ? `grounded health anomaly: ${source.detail}`
      : `grounded ${source.kind} item ${source.ref}`;
  return {
    admit: true,
    cause: source.kind === "health_anomaly" ? "health_anomaly" : "proactive",
    groundingRef,
    rationale,
  };
}
