# 82 — W3 F011 Qualification Closure Plan

## A. WAVE IDENTITY

```text
WAVE_ID=W3
NAME=F011 Qualification Closure
PHASE4_ARCHITECTURE_SOURCE=63_F011_POST_LIVE_RECONCILIATION.md; 69_R6_METABOLISM_MEASUREMENT_AND_PRESERVATION_CONTRACT.md; 70_DERIVED_RETRACTION_AND_RECONCILIATION_DESIGN.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md
ROOTS/FINDINGS=F011; R6 measurement dependency; derived-store qualification
PREDECESSORS=SOURCE:none; EVIDENCE:W1 release-linked evidence substrate
PLAN_STATUS=MECHANICALLY_READY_QUALIFICATION_ONLY
```

## B. PURPOSE

Close the remaining F011 qualification gates without rebuilding the Thought Context allocator. Preserve `SOURCE_CLOSED`, `OFFLINE_BOUNDEDNESS=PROVEN`, and `LIVE_EXACT_RUNTIME_BOUNDEDNESS=OBSERVED`. Produce Stage A, fuse-license, Stage H, Mint resource/rebuild, and later production-acceptance evidence.

## C. FROZEN CONTRACT

- The source fanout defect is closed. W3 does not reopen or redesign allocator ranking, budgets, or projection assembly.
- Stage A establishes relevance from a fixed, reproducible labeled dataset and declared thresholds.
- Fuse use is governed by evidence and license acceptance, not convenience.
- Stage H qualifies the exact executable/runtime path, derived rebuild/startup reconciliation, and physical Mint resources.
- Every result links to W1 candidate/release identity. Offline tests and live observation remain separate evidence classes.
- Production acceptance requires its own deployed exact-candidate witness.

## D. PRECONDITIONS

1. Exact Phase 3/4 F011 evidence is retained and hashed.
2. W1 evidence schema can bind the allocator/retrieval candidate, build, configuration, dataset, and harness identities.
3. `incident-c-labels.json`, `incident-c-synthetic.json`, and the source snapshot method are reviewed for completeness and private-data handling.
4. Stage H and Mint runs require separate physical-run/deployment authority. This plan grants neither.

## E. SOURCE OWNERSHIP MAP

| FILE | CURRENT ROLE | PLANNED CHANGE | WHY REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/cognitive-v021/retrieval/fixtures/incident-c-labels.json` | Incident C relevance labels | Version metadata, label policy, query set, adjudication provenance, and immutable digest; do not tune after seeing candidate results | Stage A reproducibility |
| `apps/agent-service/src/core/cognitive-v021/retrieval/fixtures/incident-c-synthetic.json` | Privacy-safe surrogate corpus | Freeze generator/source digest and deterministic item IDs | Repeatable evaluation |
| `scripts/snapshot-incident-c.mjs` | Extracts snapshot and creates synthetic fixture | Add deterministic manifest output and refusal on schema/source mismatch | Traceable dataset |
| `apps/agent-service/src/core/cognitive-v021/acceptance/thought-context-optimization.qualification.test.ts` | Current coherent-candidate and scale qualification | Split deterministic Stage A metrics from Stage H physical thresholds; emit machine evidence | Avoid conflated PASS |
| `apps/agent-service/src/core/cognitive-v021/retrieval/derived-store.ts` | FTS store, hash, rebuild, startup reconciliation | No W3 semantic redesign; expose measurement hooks only if missing | Exact rebuild evidence |
| `apps/agent-service/src/core/cognitive-v021/retrieval/__tests__/derived-store.test.ts` | Rebuild, sync, zero-scan, crash-gap tests | Extend qualification evidence assertions, not behavior unless a falsified defect exists | Stage H prerequisite |
| `apps/agent-service/src/core/cognitive-v021/thought/projection-allocator/*` | Current allocator | Read and measure only | Explicit no reimplementation |
| `scripts/stabilization/audit-resources.mjs` | Generic process resource audit | Do not reuse as F011 proof; add a dedicated F011 runner | Existing audit lacks allocator/rebuild attribution |
| `scripts/cognitive-v021/f011-stage-h.mjs` | NEW | Exact-runtime isolated Stage H harness | Machine physical evidence |
| `scripts/cognitive-v021/f011-evidence.mjs` | NEW | Validate manifests/results and assemble W1-linked packet | Deterministic acceptance boundary |
| `package.json`, `apps/agent-service/package.json`, and `apps/agent-service/package-lock.json` | Dependency identity; no Fuse dependency is present at the reference SHA | If the evidence gate selects Fuse, record exact package/version/license and owner decision in the candidate evidence packet before any dependency edit | Fuse gate |

## F. MUST-NOT-TOUCH MAP

Do not change allocator scoring, category budgets, token estimation, model routes, W0 contract, production data, service state, or FTS semantics to make thresholds pass. Do not add Fuse unless the evidence gate selects it and license review accepts the exact package/version. Do not treat Windows timing as Mint evidence.

## G. EXISTING SYMBOL INVENTORY

- Derived store: `DERIVED_INDEX_SCHEMA_VERSION`, `defaultDerivedIndexDbPath()`, `computeMemorySourceHash()`, `computeConversationSourceHash()`, `DerivedStore`, `reconcile()`, `reconcileAtStartup()`, `reconcileIfNeeded()`, `rebuild()`, `syncAfterCommit()`, `registerDerivedStoreForSidecar()`, `notifySidecarPostCommit()`, `openDerivedStore()`.
- Allocator surfaces: `deriveThoughtBudget()`, projection allocator assembly/estimate/select functions under `thought/projection-allocator/`.
- Qualification: `thought-context-optimization.qualification.test.ts`; current Incident C coherent-candidate case and 200/500/1000 scale case.
- Dataset: `extractIncidentCSnapshot()`, `generateSyntheticIncidentC()`.
- Physical support: `verifyFts5Capability()` and `runResourceAudit()`; neither alone closes Stage H.
- Tests: derived-store suite includes fingerprint mutation, incremental sync, invalid recovery, zero full-source scans, orphan refusal, and startup crash-gap rebuild.

## H. NEW/CHANGED TYPES

```ts
type F011DatasetManifest = Readonly<{
  schema: "ashley.f011.dataset.v1";
  datasetId: string;
  sourceSchemaIdentity: string;
  generatorIdentity: string;
  itemCount: number;
  queryCount: number;
  labelPolicy: string;
  labelsDigest: `sha256:${string}`;
  corpusDigest: `sha256:${string}`;
}>;

type StageAMetrics = Readonly<{
  precisionAtK: number; recallAtK: number; mrr: number;
  requiredQueryCoverage: number; falseCurrentEvidenceCount: number;
}>;

type F011QualificationResult = Readonly<{
  schema: "ashley.f011.qualification.v1";
  capabilityFingerprint: string;
  dataset: F011DatasetManifest;
  stageA: { thresholds: StageAMetrics; observed: StageAMetrics; pass: boolean };
  fuseGate: { needed: boolean; package: string | null; version: string | null; license: string | null; decision: "NOT_NEEDED" | "ACCEPTED" | "REJECTED" | "OWNER_DECISION_REQUIRED" };
  stageH: { environment: string; checks: readonly F011CheckResult[]; pass: boolean };
  verdict: "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED";
}>;
```

## I. DATABASE / SCHEMA PLAN

No production schema migration is planned. Stage A uses checked-in fixtures. Stage H creates isolated copies at the exact supported nuclear/sidecar/derived schema and rejects newer content. Derived indexes are disposable. The harness records schema identifiers and tests startup reconciliation against a copied authoritative sidecar. Any discovered need for a production migration is a stop condition and new source wave, not an improvised W3 change.

## J. FUNCTION-LEVEL CHANGE PLAN

### `extractIncidentCSnapshot()` / `generateSyntheticIncidentC()`

```text
CURRENT=Extract and synthesize Incident C fixtures.
TARGET=Produce deterministic corpus plus F011DatasetManifest; refuse unsupported schema or missing label keys.
INPUT=Explicit read-only source DB path and fixed seed/policy.
OUTPUT=Privacy-safe fixture and manifest.
SIDE_EFFECT=Writes only explicit output directory.
TRANSACTION=Read transaction on snapshot source; atomic output files.
ERRORS=snapshot_schema_unsupported; label_key_missing; nondeterministic_output.
CALLERS=Owner-authorized dataset refresh only.
TESTS=snapshot-incident-c.test.mjs.
```

### Stage A evaluator — extracted from qualification test

```text
CURRENT=Assertions embedded in one Vitest case.
TARGET=Pure evaluator over frozen queries/labels; thresholds declared before run; per-query rows and aggregate metrics emitted.
INPUT=Dataset manifest, exact allocator/retriever, thresholds.
OUTPUT=StageAMetrics and failures.
SIDE_EFFECT=None.
TRANSACTION=None.
ERRORS=dataset_digest_mismatch; coverage_incomplete; threshold_failed.
CALLERS=Vitest and evidence CLI.
TESTS=thought-context-optimization.qualification.test.ts.
```

### `runStageH()` — new

```text
CURRENT=No single exact-runtime physical F011 runner.
TARGET=On Mint, verify FTS5, exact build, startup reconciliation, crash-gap recovery, rebuild time/resources, valid-read zero scans, query latency/work, and bounded projection on declared scales.
INPUT=Exact candidate, isolated DB copies, manifest, thresholds, repetitions/warmup.
OUTPUT=Machine checks with raw distributions and environment fingerprint.
SIDE_EFFECT=Isolated files/process only; no provider or service mutation.
TRANSACTION=Harness-controlled crash boundaries; authoritative copies never modified.
ERRORS=environment_mismatch; fts5_missing; rebuild_failed; resource_threshold_failed; source_scan_detected.
CALLERS=Separately authorized Mint qualification.
TESTS=Local fixture self-test plus physical run.
```

### `DerivedStore.reconcileAtStartup()` / `rebuild()`

```text
CURRENT=Hash/count comparison and transactional derived rebuild.
TARGET=Behavior unchanged unless qualification falsifies it; emit timings/counts/hash-before/hash-after through a test/measurement callback.
INPUT=Authoritative sidecar.
OUTPUT=Reconciled boolean plus measurement evidence outside production API.
SIDE_EFFECT=Derived store only.
TRANSACTION=Existing rebuild transaction remains atomic.
ERRORS=derived unavailable on failure; never weaken fail-closed search.
CALLERS=Startup and Stage H.
TESTS=derived-store.test.ts; Stage H fixture tests.
```

## K. STATE MACHINE

```text
SOURCE_CLOSED/OFFLINE_PROVEN/LIVE_OBSERVED
 -> DATASET_FROZEN -> STAGE_A_PASS | STAGE_A_FAIL
STAGE_A_PASS -> FUSE_NOT_NEEDED | FUSE_OWNER_DECISION_REQUIRED
FUSE_OWNER_DECISION_REQUIRED -> FUSE_ACCEPTED | FUSE_REJECTED
eligible path -> STAGE_H_AUTHORIZATION_REQUIRED -> STAGE_H_PASS | STAGE_H_FAIL | STAGE_H_UNKNOWN
STAGE_H_PASS + W1_LINK -> CANDIDATE_ACCEPTED
CANDIDATE_ACCEPTED -> DEPLOYMENT_AUTHORIZATION_REQUIRED -> DEPLOYED_UNPROVEN -> PRODUCTION_ACCEPTED
```

## L. TRANSACTION BOUNDARIES

Fixture and manifest publication is atomic and content-hashed. Each Stage H run writes a new immutable directory, with result manifest last. Derived rebuild operates in its own transaction on isolated derived storage. No qualification result transaction includes production state.

## M. CONCURRENCY CONTRACT

One writer per run directory. Dataset IDs are digest-bound. Multiple evaluators may read the same immutable fixtures. Stage H uses unique isolated DB paths and process identities. Rebuild qualification prevents a second writer to the same derived file. Measurement repetitions are serial unless the case explicitly measures contention.

## N. RESTART / CRASH CONTRACT

Partial dataset/result directories lack final manifests and are ineligible. Stage H injects crash after authoritative change before derived sync, restarts the exact build, requires startup detection/rebuild, and verifies no stale current result. Crash during rebuild leaves store invalid/unavailable until a complete reconciliation. Ambiguous physical run is `NOT_RUN` or `BLOCKED`, never PASS.

## O. FAILURE TAXONOMY

Dataset: provenance, digest, label, coverage. Relevance: metric threshold, per-query critical miss, currentness violation. Fuse: evidence insufficient, license unknown/rejected. Stage H: wrong host/build/schema, FTS missing, rebuild/startup failure, stale retrieval, source scan, resource/latency threshold, evidence incomplete. Lifecycle: release-link missing, deployment unauthorized, production witness missing.

## P. IDEMPOTENCY / RECONCILIATION

Same manifest/candidate yields same Stage A ranking and metrics. Physical timing is distributional and retains every repetition. Re-running creates a new run ID; it does not overwrite. Crash-gap reconciliation is part of each Stage H run. Failed runs remain evidence and cannot be converted to PASS.

## Q. OBSERVABILITY

Authoritative acceptance evidence is the immutable manifest, exact candidate identity, raw per-case results, signed/hashed Stage A/H summaries, license decision, and later production witness. Test console text, one latency sample, existing Phase 3 claims, or generic resource audit output are supporting only. Record CPU, memory, OS/kernel, Node/SQLite/FTS versions, dataset size, warmup, repetitions, and clocks.

## R. LEGACY INERTNESS

The pre-fix source fanout path remains unreachable. Do not restore full authoritative-table scans on valid derived search. Historical synthetic results cannot close new candidate gates. Fuse cannot be added through transitive dependency inference. `runResourceAudit()` and `verifyFts5Capability()` cannot alone declare Stage H PASS.

## S. TEST PLAN

- Unit: deterministic manifest, label completeness, threshold evaluator, Fuse decision function, evidence validator.
- Integration: current qualification test plus derived-store rebuild/startup/zero-scan suites.
- Concurrency: reader during rebuild sees unavailable/exact-only behavior, not partial index; two rebuild writers refused/serialized.
- Restart/crash: authoritative commit-to-derived gap, crash during rebuild, corrupt metadata, orphan row.
- Adversarial: post-result label tuning, missing hard query, stale current result, same row count/different statement, forged environment/candidate, mean-only resource report hiding outlier.
- Regression: allocator unit suites and build; no ranking change unless separately authorized by failed Stage A and new architecture decision.

## T. FAILURE-INJECTION MATRIX

| Injection | Required outcome |
|---|---|
| Change fixture byte | Digest failure |
| Remove one required label | Stage A invalid, not zero-scored |
| Mutate source with same count | Startup hash detects and rebuilds |
| Crash after source commit | Rebuild before current lexical eligibility |
| Kill rebuild mid-transaction | Store unavailable/invalid; no partial reads |
| Force source scan on valid read | Stage H FAIL |
| Run on Windows for Mint gate | `NOT_RUN_WRONG_ENVIRONMENT` |
| Missing license evidence | Fuse gate blocked |

## U. QUALIFICATION COMMANDS

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/acceptance/thought-context-optimization.qualification.test.ts src/core/cognitive-v021/retrieval/__tests__/derived-store.test.ts src/core/cognitive-v021/thought/projection-allocator/__tests__/allocator.test.ts src/core/cognitive-v021/thought/projection-allocator/__tests__/estimate-shared.test.ts
npm run build:agent
node scripts/snapshot-incident-c.mjs --help
```

Planned Mint command, separately authorized only:

```bash
node scripts/cognitive-v021/f011-stage-h.mjs --candidate-sha <sha> --dataset-manifest <path> --isolated-root <path> --output <path>
```

## V. ACCEPTANCE EVIDENCE

Stage A packet contains frozen thresholds, full label/query manifest, digests, source/generator identity, per-query rankings, aggregate metrics, and reproducibility run. Fuse packet contains need analysis and exact package/license decision. Stage H packet contains exact release link, Mint environment, all commands/raw distributions, startup/crash/rebuild traces, zero-scan proof, artifacts, and verifier. Each gate has an independent verdict.

## W. PRODUCTION WITNESS

After separately authorized deployment, observe the exact W1-matched release using the accepted F011 candidate. Prove startup/rebuild state, valid retrieval currentness, bounded hot-path work/resources, and absence of source fanout under real load. Production observation does not retroactively alter Stage A/H evidence.

## X. STOP CONDITIONS

Stop if the dataset cannot be reproduced; thresholds were not predeclared; evidence requires private production mutation; Fuse licensing is unresolved; allocator redesign appears necessary; physical Mint authority is absent; candidate/release identity differs; any derived read can return stale current evidence; or a migration is discovered. Report the failed gate and smallest owner decision needed.

## Y. IMPLEMENTATION CHECKLIST

1. Hash and reconcile existing F011 evidence.
2. Freeze dataset, label policy, queries, thresholds, and manifest.
3. Extract pure Stage A evaluator and prove reproducibility.
4. Decide Fuse need from results; complete exact license gate if needed.
5. Build Stage H isolated harness and local self-tests.
6. Link harness/result to W1 capability identity.
7. Stop for physical Mint authorization.
8. Run Stage H once under its run contract; preserve raw evidence.
9. Assemble candidate packet; stop before deployment.
10. Require a separate exact-release production witness for final acceptance.
