# C4 Cognitive Graduation implementation plan

## Goal

Implement the frozen C4 integration contract on top of C1/C3 without adding
a Metacognition store or changing Ashley Identity. The slice will provide
selected prediction records, append-only operational observations,
host-validated semantic adjudications, C1 working-view links,
receipt-backed lived-experience links, future-only bounded Thought
calibration, and independent Evaluation-plane artifact references.

## Scope decisions

- Add nuclear schema v38 and a `c4` contract-state marker at contract version
  1. All C4 influence remains fixture-only `dark_apply`; the capability row
  stays `observe`.
- Use exact typed APIs named by the contract: `selectConsequentialPrediction`,
  `recordCognitiveOutcomeObservation`, and
  `recordCognitiveOutcomeAdjudication`.
- Require explicit selection input. Never infer consequential status from a
  decision's uncertainty, `initiative_learning`, or historical `decision_log`.
- Keep operational receipt evidence and semantic outcome adjudication in
  separate append-only tables. A receipt alone cannot produce
  `confirmed`/`contradicted`.
- Store short judgment metadata and stable references only. Reject likely
  chain-of-thought-sized text and missing expected horizon or route receipt.
- Revalidate C1 evidence currentness and barriers before working-view links,
  calibration admission, and lived-experience influence.
- Calibration is a bounded future-Thought row linked to a prediction, latest
  admitted adjudication, and admitting Reflection/Thought decision. It never
  mutates an existing Decision.
- Evaluation artifacts are immutable id/hash references with separate
  epistemic and lived-experience dimensions. Runtime does not copy pass/fail
  into cognitive state.

## Slices

1. Characterize the current gap with green tests.
2. Add and validate v38 additive schema.
3. Add explicit prediction selection and C1/C3 evidence binding.
4. Add operational observation binding and semantic adjudication validation.
5. Add receipt-backed lived-experience links and future-only Reflection
   calibration.
6. Add C1 working-view link and contradiction/currentness behavior.
7. Add EvaluationDefinition/QualificationResult artifact references and
   initiative/refusal/silence evidence samples.
8. Add restart/rollback/adversarial settlement witnesses and diagnostics.

## Verification

Use only the exact C4 focused files named by the frozen test strategy,
affected C1/C3 regressions, the agent-service build, and `git diff --check`.
Do not run the full corpus, provider smoke, qualification, activation,
promotion, deployment, or Mint checks.
