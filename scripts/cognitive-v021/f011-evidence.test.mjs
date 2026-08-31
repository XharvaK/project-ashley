import assert from "node:assert/strict";
import test from "node:test";
import {
  F011_STAGE_A_THRESHOLDS,
  assembleF011QualificationResult,
  buildDatasetManifest,
  decideFuseGate,
  evaluateStageA,
  validateF011QualificationResult,
} from "./f011-evidence.mjs";

const items = [
  {
    assertionKey: "item:relevant",
    statement: "The relevant current statement",
    dimensions: { time: "current" },
    dataClassification: "never_public",
  },
  {
    assertionKey: "item:historical",
    statement: "The historical statement",
    dimensions: { time: "historical" },
    dataClassification: "never_public",
  },
  {
    assertionKey: "item:other",
    statement: "The other statement",
    dimensions: { time: "historical" },
    dataClassification: "never_public",
  },
];

const labels = {
  "item:relevant": "relevant",
  "item:historical": "irrelevant",
  "item:other": "irrelevant",
};

test("buildDatasetManifest binds exact item and label digests", () => {
  const manifest = buildDatasetManifest({
    datasetId: "fixture-test",
    sourceSchemaIdentity: "sidecar_memory_assertions.v1",
    generatorIdentity: "test-generator.v1",
    labelPolicy: "one declared relevant class",
    items,
    labels,
    queries: [{ queryId: "q1", terms: ["relevant"], k: 2 }],
  });

  assert.equal(manifest.schema, "ashley.f011.dataset.v1");
  assert.equal(manifest.itemCount, 3);
  assert.equal(manifest.queryCount, 1);
  assert.match(manifest.labelsDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(manifest.corpusDigest, /^sha256:[0-9a-f]{64}$/);
});

test("manifest refuses missing labels and secret fixture content", () => {
  assert.throws(
    () => buildDatasetManifest({ items, labels: { ...labels, "item:missing": "irrelevant" } }),
    /label_key_missing|label_key_set_mismatch/,
  );
  assert.throws(
    () => buildDatasetManifest({
      items: [...items, { ...items[0], assertionKey: "secret:item", dataClassification: "secret" }],
      labels: { ...labels, "secret:item": "irrelevant" },
    }),
    /private_data_in_fixture/,
  );
});

test("Stage A computes per-query metrics and does not count irrelevant output as recall", () => {
  const stageA = evaluateStageA({
    items,
    labels,
    queries: [{ queryId: "q1", terms: ["relevant"], k: 2 }],
    rankings: [{ queryId: "q1", rankedKeys: ["item:relevant", "item:historical"] }],
    thresholds: F011_STAGE_A_THRESHOLDS,
  });

  assert.equal(stageA.observed.precisionAtK, 0.5);
  assert.equal(stageA.observed.recallAtK, 1);
  assert.equal(stageA.observed.mrr, 1);
  assert.equal(stageA.observed.requiredQueryCoverage, 1);
  assert.equal(stageA.observed.falseCurrentEvidenceCount, 0);
  assert.equal(stageA.pass, true);
  assert.equal(stageA.perQuery[0].relevantRetrieved, 1);
});

test("Stage A fails closed when the frozen dataset has no relevant labels", () => {
  const stageA = evaluateStageA({
    items,
    labels: Object.fromEntries(Object.keys(labels).map((key) => [key, "irrelevant"])),
    queries: [{ queryId: "q1", terms: ["relevant"], k: 2 }],
    rankings: [{ queryId: "q1", rankedKeys: ["item:historical", "item:other"] }],
    thresholds: F011_STAGE_A_THRESHOLDS,
  });

  assert.equal(stageA.pass, false);
  assert.ok(stageA.failureCodes.includes("no_relevant_labels"));
  assert.equal(stageA.observed.recallAtK, null);
});

test("Fuse decision stays evidence-derived and does not invent a package", () => {
  const passGate = decideFuseGate({ stageAPass: true, falseCurrentEvidenceCount: 0 });
  assert.deepEqual(passGate, {
    needed: false,
    package: null,
    version: null,
    license: null,
    decision: "NOT_NEEDED",
  });

  const unresolvedGate = decideFuseGate({ stageAPass: false, falseCurrentEvidenceCount: 0 });
  assert.equal(unresolvedGate.decision, "OWNER_DECISION_REQUIRED");
  assert.equal(unresolvedGate.needed, true);
});

test("qualification result validator rejects an unsubstantiated Stage H pass", () => {
  const result = {
    schema: "ashley.f011.qualification.v1",
    capabilityFingerprint: "sha256:" + "a".repeat(64),
    dataset: {
      schema: "ashley.f011.dataset.v1",
      datasetId: "fixture-test",
      sourceSchemaIdentity: "sidecar_memory_assertions.v1",
      generatorIdentity: "test-generator.v1",
      itemCount: 3,
      queryCount: 1,
      labelPolicy: "one declared relevant class",
      labelsDigest: "sha256:" + "b".repeat(64),
      corpusDigest: "sha256:" + "c".repeat(64),
    },
    stageA: {
      thresholds: F011_STAGE_A_THRESHOLDS,
      observed: { precisionAtK: 1, recallAtK: 1, mrr: 1, requiredQueryCoverage: 1, falseCurrentEvidenceCount: 0 },
      pass: true,
      perQuery: [],
      failureCodes: [],
    },
    fuseGate: { needed: false, package: null, version: null, license: null, decision: "NOT_NEEDED" },
    stageH: { environment: "linux", checks: [], pass: true },
    verdict: "PASS",
  };

  assert.throws(() => validateF011QualificationResult(result), /stage_h_checks_missing/);
});

test("aggregate assembly links Stage A and Stage H without converting a failed stage", () => {
  const manifest = buildDatasetManifest({
    datasetId: "fixture-test",
    sourceSchemaIdentity: "sidecar_memory_assertions.v1",
    generatorIdentity: "test-generator.v1",
    labelPolicy: "one declared relevant class",
    items,
    labels,
    queries: [{ queryId: "q1", terms: ["relevant"], k: 2 }],
  });
  const stageA = evaluateStageA({
    items,
    labels,
    queries: [{ queryId: "q1", terms: ["relevant"], k: 2 }],
    rankings: [{ queryId: "q1", rankedKeys: ["item:relevant", "item:historical"] }],
  });
  const stageH = {
    schema: "ashley.f011.stage-h.v1",
    candidateSha: "a".repeat(40),
    environment: "linux",
    checks: [{ id: "fts5", pass: true }],
    raw: {},
    pass: true,
  };
  const result = assembleF011QualificationResult({
    capabilityFingerprint: "sha256:" + "d".repeat(64),
    candidate: { buildIdentity: "a".repeat(40) },
    manifest,
    queries: [{ queryId: "q1", terms: ["relevant"], k: 2 }],
    stageA,
    fuseGate: decideFuseGate({ stageAPass: stageA.pass, falseCurrentEvidenceCount: 0 }),
    stageH,
  });

  assert.equal(result.verdict, "PASS");
  assert.equal(result.stageH.pass, true);
  assert.equal(result.stageH.checks[0].id, "fts5");
  assert.throws(
    () => assembleF011QualificationResult({
      capabilityFingerprint: "sha256:" + "d".repeat(64),
      candidate: { buildIdentity: "b".repeat(40) },
      manifest,
      queries: [{ queryId: "q1", terms: ["relevant"], k: 2 }],
      stageA,
      fuseGate: decideFuseGate({ stageAPass: stageA.pass, falseCurrentEvidenceCount: 0 }),
      stageH,
    }),
    /stage_h_candidate_mismatch/,
  );
});
