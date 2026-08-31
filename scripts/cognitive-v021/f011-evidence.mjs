#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const F011_DATASET_SCHEMA = "ashley.f011.dataset.v1";
export const F011_QUALIFICATION_SCHEMA = "ashley.f011.qualification.v1";
export const F011_STAGE_A_THRESHOLDS = Object.freeze({
  precisionAtK: 0.5,
  recallAtK: 0.5,
  mrr: 0.5,
  requiredQueryCoverage: 1,
  falseCurrentEvidenceCount: 0,
});

export const F011_STAGE_H_THRESHOLDS = Object.freeze({
  maxRebuildMs: 2_000,
  maxQueryP95Ms: 250,
  maxProjectionMs: 100,
  maxRssBytes: 1_610_612_736,
  maxValidReadSourceScans: 0,
});

export const F011_QUERY_SET = Object.freeze([
  Object.freeze({
    queryId: "incident-c-primary",
    terms: Object.freeze(["sleep", "soon", "tomorrow"]),
    k: 16,
    relevanceLabel: "relevant",
  }),
]);

// The W1 result is the model/route identity that this F011 candidate must
// remain linked to. It is evidence linkage, not a new qualification authority.
export const W1_THOUGHT_CAPABILITY_FINGERPRINT =
  "sha256:16de55bc39463045e34d0952ed4b165e0a9b9c57858cf85ecc0dcededcdc0cf5";

const ALLOWED_LABELS = new Set(["relevant", "irrelevant"]);
const ALLOWED_CLASSIFICATIONS = new Set(["ordinary", "sensitive", "never_public"]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
    }
    return result;
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function digestJson(value) {
  return `sha256:${sha256Text(stableJson(value))}`;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertItemsAndLabels(items, labels) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("dataset_empty");
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
    throw new Error("labels_object_required");
  }

  const itemKeys = items.map((item) => item?.assertionKey);
  if (itemKeys.some((key) => typeof key !== "string" || key.trim() === "")) {
    throw new Error("assertion_key_missing");
  }
  if (new Set(itemKeys).size !== itemKeys.length) throw new Error("assertion_key_duplicate");

  for (const item of items) {
    if (item.dataClassification === "secret") throw new Error("private_data_in_fixture");
    if (!ALLOWED_CLASSIFICATIONS.has(item.dataClassification)) {
      throw new Error("dataset_classification_invalid");
    }
  }

  const itemKeySet = new Set(itemKeys);
  const labelKeys = Object.keys(labels);
  if (labelKeys.some((key) => !itemKeySet.has(key)) || labelKeys.length !== itemKeys.length) {
    throw new Error("label_key_set_mismatch");
  }
  for (const key of itemKeys) {
    if (!Object.hasOwn(labels, key)) throw new Error("label_key_missing");
    if (!ALLOWED_LABELS.has(labels[key])) throw new Error("label_value_invalid");
  }
}

function assertQueries(queries) {
  if (!Array.isArray(queries) || queries.length === 0) throw new Error("query_set_missing");
  const ids = new Set();
  for (const query of queries) {
    if (!query || typeof query.queryId !== "string" || !query.queryId.trim()) {
      throw new Error("query_id_missing");
    }
    if (ids.has(query.queryId)) throw new Error("query_id_duplicate");
    ids.add(query.queryId);
    if (!Array.isArray(query.terms) || query.terms.length === 0) throw new Error("query_terms_missing");
    if (!Number.isInteger(query.k) || query.k < 1) throw new Error("query_k_invalid");
  }
}

export function buildDatasetManifest({
  datasetId = "incident-c-synthetic",
  sourceSchemaIdentity = "sidecar_memory_assertions.v1",
  generatorIdentity = "scripts/snapshot-incident-c.mjs.v2",
  labelPolicy = "frozen adjudicated relevant or irrelevant labels; no post-result tuning",
  items,
  labels,
  queries,
}) {
  assertItemsAndLabels(items, labels);
  assertQueries(queries);
  return Object.freeze({
    schema: F011_DATASET_SCHEMA,
    datasetId,
    sourceSchemaIdentity,
    generatorIdentity,
    itemCount: items.length,
    queryCount: queries.length,
    labelPolicy,
    labelsDigest: digestJson(labels),
    corpusDigest: digestJson(items),
  });
}

export function validateDatasetManifest(manifest, { items, labels, queries }) {
  const expected = buildDatasetManifest({
    datasetId: manifest?.datasetId,
    sourceSchemaIdentity: manifest?.sourceSchemaIdentity,
    generatorIdentity: manifest?.generatorIdentity,
    labelPolicy: manifest?.labelPolicy,
    items,
    labels,
    queries,
  });
  if (stableJson(expected) !== stableJson(manifest)) throw new Error("dataset_manifest_mismatch");
  return true;
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateStageA({
  items,
  labels,
  queries,
  rankings,
  thresholds = F011_STAGE_A_THRESHOLDS,
  extraFailureCodes = [],
}) {
  assertItemsAndLabels(items, labels);
  assertQueries(queries);

  const itemByKey = new Map(items.map((item) => [item.assertionKey, item]));
  const relevantKeys = new Set(
    Object.entries(labels)
      .filter(([, label]) => label === "relevant")
      .map(([key]) => key),
  );
  const rankingByQuery = new Map((rankings ?? []).map((row) => [row.queryId, row]));
  const failureCodes = new Set(extraFailureCodes);
  const perQuery = [];
  const precisionValues = [];
  const recallValues = [];
  const mrrValues = [];
  let covered = 0;
  let falseCurrentEvidenceCount = 0;

  if (relevantKeys.size === 0) failureCodes.add("no_relevant_labels");

  for (const query of queries) {
    const ranking = rankingByQuery.get(query.queryId);
    const rankedKeys = Array.isArray(ranking?.rankedKeys) ? ranking.rankedKeys : [];
    if (!ranking) failureCodes.add("ranking_missing");
    if (ranking?.state && ranking.state !== "ready") failureCodes.add("retrieval_unavailable");

    const unknownKeys = rankedKeys.filter((key) => !itemByKey.has(key));
    if (unknownKeys.length > 0) failureCodes.add("ranking_key_missing");

    const expectedKeys = new Set(
      Array.isArray(query.relevantKeys) && query.relevantKeys.length > 0
        ? query.relevantKeys
        : [...relevantKeys],
    );
    if (expectedKeys.size === 0) failureCodes.add("query_relevance_set_empty");

    const topKeys = rankedKeys.slice(0, query.k);
    const relevantRetrieved = topKeys.filter((key) => expectedKeys.has(key)).length;
    const precisionAtK = relevantRetrieved / query.k;
    const recallAtK = expectedKeys.size > 0 ? relevantRetrieved / expectedKeys.size : null;
    const firstRelevantIndex = rankedKeys.findIndex((key) => expectedKeys.has(key));
    const mrr = firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);
    const currentFalseKeys = topKeys.filter((key) =>
      labels[key] === "irrelevant" && itemByKey.get(key)?.dimensions?.time === "current",
    );
    const requiredQuerySatisfied = expectedKeys.size > 0 && relevantRetrieved > 0;

    precisionValues.push(precisionAtK);
    if (recallAtK !== null) recallValues.push(recallAtK);
    if (expectedKeys.size > 0) mrrValues.push(mrr);
    if (requiredQuerySatisfied) covered += 1;
    falseCurrentEvidenceCount += currentFalseKeys.length;

    perQuery.push(Object.freeze({
      queryId: query.queryId,
      terms: [...query.terms],
      k: query.k,
      rankedKeys: [...rankedKeys],
      relevantKeys: [...expectedKeys],
      relevantRetrieved,
      precisionAtK,
      recallAtK,
      mrr,
      requiredQuerySatisfied,
      falseCurrentEvidenceCount: currentFalseKeys.length,
      unknownRankedKeys: unknownKeys,
    }));
  }

  const observed = Object.freeze({
    precisionAtK: average(precisionValues),
    recallAtK: average(recallValues),
    mrr: average(mrrValues),
    requiredQueryCoverage: queries.length === 0 ? null : covered / queries.length,
    falseCurrentEvidenceCount,
  });

  if (observed.precisionAtK === null || observed.precisionAtK < thresholds.precisionAtK) {
    failureCodes.add("threshold_precision_at_k");
  }
  if (observed.recallAtK === null || observed.recallAtK < thresholds.recallAtK) {
    failureCodes.add("threshold_recall_at_k");
  }
  if (observed.mrr === null || observed.mrr < thresholds.mrr) failureCodes.add("threshold_mrr");
  if (
    observed.requiredQueryCoverage === null ||
    observed.requiredQueryCoverage < thresholds.requiredQueryCoverage
  ) {
    failureCodes.add("threshold_required_query_coverage");
  }
  if (observed.falseCurrentEvidenceCount > thresholds.falseCurrentEvidenceCount) {
    failureCodes.add("threshold_false_current_evidence");
  }

  return Object.freeze({
    thresholds: Object.freeze({ ...thresholds }),
    observed,
    pass: failureCodes.size === 0,
    perQuery: Object.freeze(perQuery),
    failureCodes: Object.freeze([...failureCodes]),
  });
}

export function decideFuseGate({ stageAPass, falseCurrentEvidenceCount }) {
  if (stageAPass && falseCurrentEvidenceCount === 0) {
    return Object.freeze({
      needed: false,
      package: null,
      version: null,
      license: null,
      decision: "NOT_NEEDED",
    });
  }
  return Object.freeze({
    needed: true,
    package: null,
    version: null,
    license: null,
    decision: "OWNER_DECISION_REQUIRED",
  });
}

function isSha256(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function requireMetric(value, name) {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${name}_invalid`);
  }
}

export function validateF011QualificationResult(result) {
  if (!result || result.schema !== F011_QUALIFICATION_SCHEMA) throw new Error("f011_result_schema_invalid");
  if (!isSha256(result.capabilityFingerprint)) throw new Error("f011_capability_fingerprint_invalid");
  const dataset = result.dataset;
  if (!dataset || dataset.schema !== F011_DATASET_SCHEMA) throw new Error("f011_dataset_manifest_missing");
  for (const field of ["datasetId", "sourceSchemaIdentity", "generatorIdentity", "labelPolicy"]) {
    if (typeof dataset[field] !== "string" || !dataset[field]) throw new Error(`f011_dataset_${field}_invalid`);
  }
  for (const field of ["itemCount", "queryCount"]) {
    if (!Number.isInteger(dataset[field]) || dataset[field] < 1) throw new Error(`f011_dataset_${field}_invalid`);
  }
  if (!isSha256(dataset.labelsDigest) || !isSha256(dataset.corpusDigest)) {
    throw new Error("f011_dataset_digest_invalid");
  }

  const stageA = result.stageA;
  if (!stageA || !stageA.thresholds || !stageA.observed || !Array.isArray(stageA.perQuery)) {
    throw new Error("stage_a_evidence_missing");
  }
  for (const field of ["precisionAtK", "recallAtK", "mrr", "requiredQueryCoverage", "falseCurrentEvidenceCount"]) {
    requireMetric(stageA.observed[field], `stage_a_${field}`);
  }

  const fuse = result.fuseGate;
  if (!fuse || !["NOT_NEEDED", "ACCEPTED", "REJECTED", "OWNER_DECISION_REQUIRED"].includes(fuse.decision)) {
    throw new Error("fuse_gate_invalid");
  }

  const stageH = result.stageH;
  if (!stageH || typeof stageH.environment !== "string" || !Array.isArray(stageH.checks)) {
    throw new Error("stage_h_evidence_missing");
  }
  if (stageH.pass && stageH.checks.length === 0) throw new Error("stage_h_checks_missing");
  if (stageH.pass && stageH.checks.some((check) => check?.pass !== true)) {
    throw new Error("stage_h_pass_with_failed_check");
  }
  if (!["PASS", "FAIL", "NOT_RUN", "BLOCKED"].includes(result.verdict)) {
    throw new Error("f011_verdict_invalid");
  }
  if (result.verdict === "PASS" && (!stageA.pass || !stageH.pass)) {
    throw new Error("f011_pass_without_all_stages");
  }
  return true;
}

function validateStageHLink(stageH, candidate) {
  if (!stageH || stageH.schema !== "ashley.f011.stage-h.v1") throw new Error("stage_h_result_schema_invalid");
  if (typeof stageH.candidateSha !== "string" || stageH.candidateSha !== candidate?.buildIdentity) {
    throw new Error("stage_h_candidate_mismatch");
  }
  if (!Array.isArray(stageH.checks) || stageH.checks.length === 0) throw new Error("stage_h_checks_missing");
  return true;
}

export function assembleF011QualificationResult({
  capabilityFingerprint,
  candidate,
  manifest,
  queries,
  stageA,
  fuseGate,
  stageH = null,
}) {
  if (stageH) validateStageHLink(stageH, candidate);
  const stageHSummary = stageH ?? {
    schema: "ashley.f011.stage-h.v1",
    runId: null,
    candidateSha: candidate?.buildIdentity ?? null,
    environment: "not_run",
    thresholds: null,
    checks: [],
    raw: {},
    pass: false,
    state: "AUTHORIZATION_REQUIRED",
  };
  const verdict = !stageA.pass
    ? "FAIL"
    : fuseGate.decision === "OWNER_DECISION_REQUIRED"
      ? "BLOCKED"
      : stageHSummary.pass
        ? "PASS"
        : "NOT_RUN";
  const result = Object.freeze({
    schema: F011_QUALIFICATION_SCHEMA,
    capabilityFingerprint,
    candidate: Object.freeze({ ...candidate }),
    dataset: manifest,
    querySet: Object.freeze((queries ?? []).map((query) => Object.freeze({ ...query, terms: [...query.terms] }))),
    stageA,
    fuseGate,
    stageH: Object.freeze(stageHSummary),
    verdict,
  });
  validateF011QualificationResult(result);
  return result;
}

function writeImmutableJson(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  const bytes = JSON.stringify(value, null, 2) + "\n";
  if (existsSync(absolute)) {
    const existing = readFileSync(absolute, "utf8");
    if (existing !== bytes) throw new Error(`immutable_artifact_collision:${absolute}`);
    return absolute;
  }
  const temporary = `${absolute}.tmp-${process.pid}`;
  writeFileSync(temporary, bytes, "utf8");
  renameSync(temporary, absolute);
  return absolute;
}

export function writeF011EvidenceBundle(outputDir, { manifest, stageA, result }) {
  validateF011QualificationResult(result);
  const output = resolve(outputDir);
  return Object.freeze({
    manifestPath: writeImmutableJson(join(output, "f011-dataset-manifest.json"), manifest),
    stageAPath: writeImmutableJson(join(output, "f011-stage-a.json"), {
      schema: "ashley.f011.stage-a.v1",
      dataset: manifest,
      stageA,
    }),
    resultPath: writeImmutableJson(join(output, "f011-qualification.json"), result),
  });
}

function repoRootFromModule() {
  return resolve(fileURLToPath(new URL("../..", import.meta.url)));
}

function currentGitHead(repoRoot) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
}

function ensureNonProductionOutput(outputDir) {
  const output = resolve(outputDir);
  const productionRoot = resolve(join(homedir(), ".composer-assistant"));
  const relation = relative(productionRoot, output);
  if (
    relation === "" ||
    (!relation.startsWith(".." + "\\") && !relation.startsWith(".." + "/") && !isAbsolute(relation))
  ) {
    throw new Error("reserved_production_output_path");
  }
  return output;
}

async function currentRetrieverRankings(repoRoot, items, queries) {
  const module = (path) => import(pathToFileURL(join(repoRoot, "apps", "agent-service", "dist", ...path)).href);
  const [{ openCognitiveSidecarDb }, { openDerivedStore }, { upsertMemoryAssertion }, { retrieveCandidates }] =
    await Promise.all([
      module(["core", "cognitive-v021", "sidecar", "db.js"]),
      module(["core", "cognitive-v021", "retrieval", "derived-store.js"]),
      module(["core", "cognitive-v021", "memory", "assertions.js"]),
      module(["core", "cognitive-v021", "retrieval", "discover.js"]),
    ]);

  const sidecar = openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
  const derived = openDerivedStore(":memory:");
  const dimensions = {
    source: "owner_utterance",
    status: "asserted",
    time: "historical",
    reliability: "owner_supplied",
  };
  try {
    for (const item of items) {
      upsertMemoryAssertion(sidecar, {
        assertionKey: item.assertionKey,
        statement: item.statement,
        memoryKind: item.memoryKind ?? "owner_world_claim",
        dimensions: item.dimensions ?? dimensions,
        dataClassification: item.dataClassification,
        lineageParentKey: item.lineageParentKey ?? null,
        admittedGeneration: item.admittedGeneration ?? 1,
        live: Boolean(item.live),
      });
    }
    if (!derived.reconcileAtStartup(sidecar)) throw new Error("derived_reconcile_failed");
    return queries.map((query) => {
      const retrieval = retrieveCandidates(
        sidecar,
        {
          conversationId: "f011-stage-a",
          request: {
            triggerTerms: query.terms,
            workingContextTopics: [],
            assertionKeys: [],
            includeLogSearch: false,
          },
        },
        derived,
      );
      return {
        queryId: query.queryId,
        state: retrieval.state,
        miss: retrieval.miss,
        rankedKeys: retrieval.hits.map((hit) => hit.ref),
      };
    });
  } finally {
    derived.close();
    sidecar.close();
  }
}

export async function runF011StageA({
  repoRoot = repoRootFromModule(),
  datasetPath = join(repoRoot, "apps", "agent-service", "src", "core", "cognitive-v021", "retrieval", "fixtures", "incident-c-synthetic.json"),
  labelsPath = join(repoRoot, "apps", "agent-service", "src", "core", "cognitive-v021", "retrieval", "fixtures", "incident-c-labels.json"),
  outputDir = join(repoRoot, "work", "phase5-w3-stage-a-20260831"),
  candidateSha = currentGitHead(repoRoot),
  queries = F011_QUERY_SET,
  stageHResult = null,
} = {}) {
  const actualHead = currentGitHead(repoRoot);
  if (candidateSha !== actualHead) throw new Error("candidate_release_identity_mismatch");
  const output = ensureNonProductionOutput(outputDir);
  const items = readJson(datasetPath);
  const labels = readJson(labelsPath);
  const manifest = buildDatasetManifest({ items, labels, queries });

  let rankings = [];
  const retrievalFailures = [];
  try {
    rankings = await currentRetrieverRankings(repoRoot, items, queries);
  } catch (error) {
    retrievalFailures.push(error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160));
  }

  const stageA = evaluateStageA({
    items,
    labels,
    queries,
    rankings,
    thresholds: F011_STAGE_A_THRESHOLDS,
    extraFailureCodes: retrievalFailures.length > 0 ? ["retrieval_execution_failed"] : [],
  });
  const fuseGate = decideFuseGate({
    stageAPass: stageA.pass,
    falseCurrentEvidenceCount: stageA.observed.falseCurrentEvidenceCount ?? 0,
  });
  const candidate = Object.freeze({
      buildIdentity: actualHead,
      w1ThoughtCapabilityFingerprint: W1_THOUGHT_CAPABILITY_FINGERPRINT,
      retrievalContract: "ashley.f011.derived-retrieval.v1",
      harnessIdentity: "scripts/cognitive-v021/f011-evidence.mjs.v1",
  });
  const stageAEvidence = Object.freeze({
      ...stageA,
      runtime: Object.freeze({ rankings, retrievalFailures }),
  });
  const result = assembleF011QualificationResult({
    capabilityFingerprint: W1_THOUGHT_CAPABILITY_FINGERPRINT,
    candidate,
    manifest,
    queries,
    stageA: stageAEvidence,
    fuseGate,
    stageH: stageHResult,
  });
  const paths = writeF011EvidenceBundle(output, { manifest, stageA: stageAEvidence, result });
  return Object.freeze({ result, paths });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) throw new Error(`unexpected_argument:${value}`);
    const key = value.slice(2);
    if (key === "help") return { help: true };
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new Error(`argument_value_missing:${key}`);
    args[key] = next;
    i += 1;
  }
  return args;
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log("usage: node scripts/cognitive-v021/f011-evidence.mjs [--dataset path] [--labels path] [--output dir] [--candidate-sha sha]");
    } else {
      const root = repoRootFromModule();
      const execution = await runF011StageA({
        repoRoot: root,
        datasetPath: args.dataset ? resolve(args.dataset) : undefined,
        labelsPath: args.labels ? resolve(args.labels) : undefined,
        outputDir: args.output ? resolve(args.output) : undefined,
        candidateSha: args["candidate-sha"] ?? undefined,
        stageHResult: args["stage-h"] ? readJson(resolve(args["stage-h"])) : null,
      });
      console.log(JSON.stringify(execution.result, null, 2));
      if (execution.result.verdict === "FAIL") process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
