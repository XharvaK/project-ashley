import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStageHResult,
  isSafeIsolatedRoot,
  percentile,
  stageHChecksPass,
} from "./f011-stage-h.mjs";

test("percentile uses a deterministic nearest-rank distribution", () => {
  assert.equal(percentile([30, 10, 20], 0.5), 20);
  assert.equal(percentile([30, 10, 20], 0.95), 30);
  assert.equal(percentile([], 0.95), null);
});

test("Stage H passes only when every independent check passes", () => {
  const checks = [
    { id: "fts5", pass: true },
    { id: "rebuild", pass: true },
  ];
  assert.equal(stageHChecksPass(checks), true);
  assert.equal(stageHChecksPass([...checks, { id: "source_scan", pass: false }]), false);
  assert.equal(stageHChecksPass([]), false);
});

test("Stage H refuses production roots and validates a complete result", () => {
  assert.equal(isSafeIsolatedRoot("C:/Users/Xharv/Projects/isolated-f011"), true);
  assert.equal(isSafeIsolatedRoot("C:/Users/Xharv/.composer-assistant/f011"), false);

  const result = buildStageHResult({
    candidateSha: "a".repeat(40),
    environment: "linux",
    checks: [{ id: "fts5", pass: true }],
    raw: { cpu: "x86_64" },
  });
  assert.equal(result.schema, "ashley.f011.stage-h.v1");
  assert.equal(result.pass, true);
  assert.throws(
    () => buildStageHResult({ candidateSha: "a".repeat(40), environment: "linux", checks: [], raw: {} }),
    /stage_h_checks_missing/,
  );
});
