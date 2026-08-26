# C4 Local Settlement — Cognitive Graduation

Date: 2026-08-27

## Result

`C4 LOCAL_SETTLED: YES`

C4 is implemented on the committed C3 baseline
`cb6b454a01988afea7678393f3c328bfeb9d2b3f`.

The `cognitive_graduation` capability remains `observe`. `dark_apply` is a
fixture-only local path. No C4 record grants live Thought authority,
qualification, activation, promotion, or external action authority.

## Implementation scope

- Added additive nuclear schema v38 for selected consequential predictions,
  operational outcome observations, semantic outcome adjudications, C1
  working-view links, receipt-backed lived-experience links, and bounded
  future-Thought calibration adjustments.
- Added fail-closed C4 contract compatibility, v37-reader rejection of v38
  objects, append-only observation/adjudication triggers, and an observe-only
  C4 contract-state marker.
- Added explicit Thought-owned prediction selection. Selection requires two
  distinct current owner-bound C1-live assertion references, a bounded
  expected outcome and horizon, and a route receipt. Existing `decision_log`
  outcome text is not reinterpreted as a prediction result.
- Added operational observation recording that keeps receipt evidence separate
  from semantic adjudication. Receipt-backed observations require a typed
  actual or exact evidence/content binding. `missing` and `outcome_unknown`
  remain unresolved rather than failed retries.
- Added host-validated, append-only semantic adjudication. Deterministic
  comparison is limited to typed comparable values. Thought/Reflection and
  owner-confirmed interpretations require an owner-bound Decision. Owner-model
  I2/I3 working views require owner confirmation.
- Added C1 working-view reconciliation. C4 reports currentness or an owner
  revision signal; C4 cannot write replacement C1 truth.
- Added lived-experience links only for durable owner-bound operational
  evidence. Link invalidation preserves historical rows and does not fabricate
  experience from drafts, pending work, unsupported references, or own-time
  reports.
- Added bounded future-Thought calibration linked to the latest admitted
  adjudication and an admitting Decision. Calibration does not mutate an
  in-flight Decision, Identity, Agency authority, or current-turn behavior;
  repeated admission is deduplicated and shadow state cannot time-shift into
  live influence.
- Added immutable independent EvaluationDefinition and QualificationResult
  references for epistemic and lived-experience dimensions. Results are
  conjunctive and never averaged into a confidence score.
- Added owner-scoped C4 diagnostics without raw judgment text, prompt bodies,
  chain-of-thought, or secret material. All C4 durable tables are classified
  outside the live behavioral projection.

## Schema and migration

- Nuclear schema progression: v35 (C1) → v36 (C2) → v37 (C3) → v38 (C4).
- C4 contract version is `1`. Its durable marker defaults to `observe` with
  `live_authority_existed = 0`.
- The C2 and C3 schema characterization fixtures now assert the current v38
  database while retaining their historical contract-specific checks.
- No historical `decision_log` rows were backfilled into C4 predictions.
- No C5 tables or shared-culture state were added.

## Exact implementation files

### New

- `apps/agent-service/src/core/cognitive-graduation/adjudications.ts`
- `apps/agent-service/src/core/cognitive-graduation/calibration.ts`
- `apps/agent-service/src/core/cognitive-graduation/contract-state.ts`
- `apps/agent-service/src/core/cognitive-graduation/diagnostics.ts`
- `apps/agent-service/src/core/cognitive-graduation/experience-links.ts`
- `apps/agent-service/src/core/cognitive-graduation/experience-link.test.ts`
- `apps/agent-service/src/core/cognitive-graduation/index.ts`
- `apps/agent-service/src/core/cognitive-graduation/internal.ts`
- `apps/agent-service/src/core/cognitive-graduation/migration-38.ts`
- `apps/agent-service/src/core/cognitive-graduation/observations.ts`
- `apps/agent-service/src/core/cognitive-graduation/outcome.test.ts`
- `apps/agent-service/src/core/cognitive-graduation/prediction-gap.test.ts`
- `apps/agent-service/src/core/cognitive-graduation/predictions.ts`
- `apps/agent-service/src/core/cognitive-graduation/schema.test.ts`
- `apps/agent-service/src/core/cognitive-graduation/select.test.ts`
- `apps/agent-service/src/core/cognitive-graduation/settlement.test.ts`
- `apps/agent-service/src/core/cognitive-graduation/test-fixtures.ts`
- `apps/agent-service/src/core/cognitive-graduation/types.ts`
- `apps/agent-service/src/core/cognitive-graduation/view-links.ts`
- `apps/agent-service/src/core/cognitive-graduation/view-revision.test.ts`
- `apps/agent-service/src/core/cognitive-graduation/view-revision.ts`
- `apps/agent-service/src/core/qualification/c4-evaluation-artifacts.test.ts`
- `apps/agent-service/src/core/qualification/c4-evaluation-artifacts.ts`
- `apps/agent-service/src/core/reflection/c4-future-only.test.ts`
- `docs/handoffs/C4_IMPLEMENTATION_HEAD_AUDIT.md`
- `docs/superpowers/plans/2026-08-26-c4-cognitive-graduation-implementation.md`

### Modified

- `apps/agent-service/src/core/cognition/schema-contract.ts`
- `apps/agent-service/src/core/context-budget/schema.test.ts`
- `apps/agent-service/src/core/db.ts`
- `apps/agent-service/src/core/learned-autonomy/schema.test.ts`
- `apps/agent-service/src/core/qualification/state-inventory.ts`
- `apps/agent-service/src/server.ts`

## Acceptance witnesses

- A selected prediction is explicitly recorded from two distinct current C1
  assertion references. Stale, barrier-covered, shadow, insufficient, secret,
  and owner-mismatched evidence is rejected.
- Prediction selection stores bounded judgment metadata, an expected outcome,
  an expected horizon, a route receipt, and a C1 working-view link. It does not
  infer prediction status from ordinary decisions, initiative learning, or
  model output.
- Operational observation is append-only and separate from semantic
  adjudication. A receipt alone cannot produce `confirmed`, `contradicted`, or
  `partial_support`.
- Typed comparable outcomes use deterministic comparison. Exact evidence plus
  content binding can support a later host-validated semantic interpretation
  without copying an unbound value. Missing and `OUTCOME_UNKNOWN` outcomes
  cannot be semantically declared successful or failed.
- Working-view reconciliation consumes C1 currentness and returns an owner
  revision signal after contradiction or partial support. It reports
  `c4MutatedCurrentTruth: false`.
- Reflection admission writes only bounded future-Thought calibration. It
  cannot mutate the admitting Decision or use current-turn, Agency, Identity,
  or relationship authority. Duplicate admission does not amplify the effect.
- A durable lived-experience link requires a resolvable owner-bound delivery,
  operational job, cognition job, or verification receipt. Invalidated links
  remain inspectable history.
- C4 does not create a global confidence field, hidden reasoning trace,
  personhood proof, Metacognition store, Identity mutation, or external effect.
- Evaluation artifacts bind exact source cleanliness, environment, evidence
  references and hashes, immutable artifact hashes, and independent epistemic
  and lived-experience dimensions. A passed artifact cannot hide a failed
  invariant or threshold, and one failed dimension cannot be averaged away.
- Persisted C4 contract versions newer or older than the supported version fail
  closed. C4 durable tables are classified as `SHADOW_ARTIFACT`, and
  diagnostics report observed records without reporting live authority.
- Rollback marks calibration influence as rolled back while preserving
  historical predictions, observations, adjudications, links, and calibration
  records. No experience or authority is fabricated by rollback.

## Focused verification

C4 focused command:

```text
npm test --prefix apps/agent-service -- src/core/cognitive-graduation/prediction-gap.test.ts src/core/cognitive-graduation/schema.test.ts src/core/cognitive-graduation/select.test.ts src/core/cognitive-graduation/outcome.test.ts src/core/cognitive-graduation/experience-link.test.ts src/core/reflection/c4-future-only.test.ts src/core/cognitive-graduation/view-revision.test.ts src/core/qualification/c4-evaluation-artifacts.test.ts src/core/cognitive-graduation/settlement.test.ts
```

Result: `9` test files passed, `27` tests passed.

Affected compatibility command:

```text
npm test --prefix apps/agent-service -- src/core/context-budget/schema.test.ts src/core/learned-autonomy/schema.test.ts src/core/memory/schema.test.ts src/core/memory/eligibility.test.ts src/core/memory/correction-revival.test.ts src/core/learned-autonomy/eligibility.test.ts src/core/learned-autonomy/adversarial.test.ts
```

Result: `7` test files passed, `17` tests passed.

Additional verification:

- `npm run build --prefix apps/agent-service` — passed.
- `git diff --check` — passed; Git emitted only expected line-ending
  conversion warnings.

## Explicit exclusions and remaining debt

- No provider calls or live provider smoke were run.
- No full repository corpus, `phase0:offline`, or full evaluation campaign was
  run.
- No Mint access, Linux or Bubblewrap qualification, deployment, production
  mutation, activation, promotion, or push was performed.
- C4 remains an observe/unpromoted implementation. `dark_apply` is fixture
  only, and no production route consumes C4 calibration.
- C4 does not implement C5 relational graduation, shared culture, interaction
  contract drift, disagreement, withdrawal, repair, or relational privacy
  projections.
- Independent review and physical qualification remain required before any
  capability promotion or production routing decision.

## Forbidden-scope confirmation

No push, deployment, Mint access, production mutation, Model Fabric
activation, qualification, promotion, external effect, or provider call was
performed.
