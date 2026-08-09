import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createMastraRuntime, fixtureJob } from "../src/adapter.mjs";
import { SyntheticAshleyAuthority } from "../src/authority.mjs";

const spikeRoot = join(fileURLToPath(new URL("..", import.meta.url)));

function tempPaths() {
  const directory = mkdtempSync(join(tmpdir(), "ashley-p01b-mastra-"));
  return {
    directory,
    authorityPath: join(directory, "ashley.db"),
    storePath: join(directory, "mastra.db"),
  };
}

async function withRuntime(fn) {
  const paths = tempPaths();
  const runtime = await createMastraRuntime(paths);
  try {
    return await fn(runtime, paths);
  } finally {
    await runtime.close();
  }
}

function events(snapshot, event) {
  return snapshot.trace.filter((entry) => entry.event === event);
}

test("duplicate submission maps to one Ashley job and one semantic outcome", async () => {
  await withRuntime(async (runtime) => {
    const first = await runtime.execute({ ...fixtureJob });
    const second = await runtime.execute({ ...fixtureJob });
    assert.equal(first.status, "success");
    assert.equal(second.status, "success");
    const snapshot = runtime.authority.snapshot(fixtureJob.sourceKey);
    assert.equal(snapshot.job.status, "completed");
    assert.equal(snapshot.job.attempts, 1);
    assert.equal(snapshot.runs.length, 1);
    assert.ok(snapshot.outcome);
    assert.equal(events(snapshot, "callback_start").length, 1);
    assert.equal(events(snapshot, "adapter_reconciled_completed").length, 1);
  });
});

test("real process restart resumes a persisted snapshot before callback", () => {
  const paths = tempPaths();
  try {
    const driver = join(spikeRoot, "src", "restart-driver.mjs");
    const startOutput = execFileSync(
      process.execPath,
      [driver, "start", paths.authorityPath, paths.storePath],
      { cwd: spikeRoot, encoding: "utf8" },
    ).trim().split(/\r?\n/).at(-1);
    const started = JSON.parse(startOutput);
    assert.equal(started.status, "suspended");
    assert.equal(events(started.snapshot, "callback_start").length, 0);

    const resumeOutput = execFileSync(
      process.execPath,
      [driver, "resume", paths.authorityPath, paths.storePath, started.runId],
      { cwd: spikeRoot, encoding: "utf8" },
    ).trim().split(/\r?\n/).at(-1);
    const resumed = JSON.parse(resumeOutput);
    assert.equal(resumed.status, "success");
    assert.equal(resumed.snapshot.job.status, "completed");
    assert.equal(events(resumed.snapshot, "callback_start").length, 1);
    assert.equal(resumed.snapshot.effects.length, 5);
  } finally {
    rmSync(paths.directory, { recursive: true, force: true });
  }
});

test("failure before callback result is bounded and produces no Ashley outcome", async () => {
  await withRuntime(async (runtime) => {
    const result = await runtime.execute({
      ...fixtureJob,
      sourceKey: `${fixtureJob.sourceKey}:before`,
      failurePoint: "before_callback_result",
    });
    assert.equal(result.status, "failed");
    const snapshot = runtime.authority.snapshot(`${fixtureJob.sourceKey}:before`);
    assert.equal(snapshot.job.status, "failed");
    assert.equal(snapshot.job.attempts, 5);
    assert.equal(snapshot.outcome, null);
    assert.equal(snapshot.effects.length, 0);
    assert.equal(events(snapshot, "callback_start").length, 5);
  });
});

test("failure after callback result but before Ashley transaction produces no outcome", async () => {
  await withRuntime(async (runtime) => {
    const sourceKey = `${fixtureJob.sourceKey}:after-callback`;
    const result = await runtime.execute({
      ...fixtureJob,
      sourceKey,
      failurePoint: "after_callback_result",
    });
    assert.equal(result.status, "failed");
    const snapshot = runtime.authority.snapshot(sourceKey);
    assert.equal(snapshot.job.attempts, 5);
    assert.equal(snapshot.outcome, null);
    assert.equal(snapshot.effects.length, 0);
    assert.equal(events(snapshot, "callback_result").length, 5);
    assert.equal(events(snapshot, "materialization_begin").length, 0);
  });
});

test("candidate state can fail while Ashley transaction rolls back completely", async () => {
  await withRuntime(async (runtime) => {
    const sourceKey = `${fixtureJob.sourceKey}:rollback`;
    const result = await runtime.execute({
      ...fixtureJob,
      sourceKey,
      failurePoint: "inside_ashley_transaction",
    });
    assert.equal(result.status, "failed");
    const snapshot = runtime.authority.snapshot(sourceKey);
    assert.equal(snapshot.outcome, null);
    assert.equal(snapshot.effects.length, 0);
    assert.equal(events(snapshot, "callback_start").length, 1);
    assert.equal(events(snapshot, "materialization_rollback").length, 5);
    const technical = await runtime.workflow.getWorkflowRunById(result.runId);
    assert.equal(technical.status, "failed");
  });
});

test("Ashley commit remains authoritative when candidate completion repeatedly fails", async () => {
  await withRuntime(async (runtime) => {
    const sourceKey = `${fixtureJob.sourceKey}:post-commit`;
    const job = { ...fixtureJob, sourceKey, failurePoint: "after_ashley_commit" };
    const first = await runtime.execute(job);
    assert.equal(first.status, "failed");
    const afterFailure = runtime.authority.snapshot(sourceKey);
    assert.ok(afterFailure.outcome);
    assert.equal(afterFailure.effects.length, 5);
    assert.equal(events(afterFailure, "callback_start").length, 1);
    assert.equal(events(afterFailure, "materializer_invoked").length, 5);

    const reconciled = await runtime.execute(job);
    assert.equal(reconciled.status, "success");
    const afterRecovery = runtime.authority.snapshot(sourceKey);
    assert.equal(afterRecovery.effects.length, 5);
    assert.equal(events(afterRecovery, "callback_start").length, 1);
    assert.equal(events(afterRecovery, "adapter_reconciled_completed").length, 1);
  });
});

test("contract and model epoch mismatches fail influence closed", async () => {
  await withRuntime(async (runtime) => {
    for (const mismatch of ["contractMismatch", "epochMismatch"]) {
      const sourceKey = `${fixtureJob.sourceKey}:${mismatch}`;
      const result = await runtime.execute({
        ...fixtureJob,
        sourceKey,
        [mismatch]: true,
      });
      assert.equal(result.status, "failed");
      const snapshot = runtime.authority.snapshot(sourceKey);
      assert.equal(snapshot.outcome, null);
      assert.equal(snapshot.effects.length, 0);
    }
  });
});

test("shadow output stays shadow and creates no influencing effects", async () => {
  await withRuntime(async (runtime) => {
    const sourceKey = `${fixtureJob.sourceKey}:shadow`;
    const result = await runtime.execute({
      ...fixtureJob,
      sourceKey,
      provenance: "shadow",
    });
    assert.equal(result.status, "success");
    const snapshot = runtime.authority.snapshot(sourceKey);
    assert.equal(snapshot.outcome.provenance, "shadow");
    assert.deepEqual(
      snapshot.effects.map((effect) => [effect.effect_type, effect.provenance]),
      [["episode", "shadow"], ["revision", "shadow"]],
    );
  });
});

test("exact Ashley provenance mapping survives the candidate store", async () => {
  await withRuntime(async (runtime) => {
    const result = await runtime.execute({ ...fixtureJob });
    assert.equal(result.status, "success");
    const snapshot = runtime.authority.snapshot(fixtureJob.sourceKey);
    assert.equal(snapshot.outcome.owner_id, fixtureJob.ownerId);
    assert.equal(snapshot.outcome.entity_uuid, fixtureJob.entityUuid);
    assert.equal(snapshot.outcome.thread_id, fixtureJob.threadId);
    assert.equal(snapshot.outcome.source_message_ids, JSON.stringify([1, 2]));
    assert.equal(snapshot.outcome.capability_contract, fixtureJob.capabilityContract);
    assert.equal(snapshot.outcome.model_epoch, fixtureJob.modelEpoch);
    assert.equal(snapshot.effects.some((effect) => effect.source_type === "candidate_run"), false);
  });
});

test("loss of the disposable candidate store fails closed", async () => {
  const paths = tempPaths();
  const sourceKey = `${fixtureJob.sourceKey}:store-loss`;
  const driver = join(spikeRoot, "src", "restart-driver.mjs");
  const startOutput = execFileSync(
    process.execPath,
    [driver, "start", paths.authorityPath, paths.storePath],
    { cwd: spikeRoot, encoding: "utf8" },
  ).trim().split(/\r?\n/).at(-1);
  const started = JSON.parse(startOutput);
  assert.equal(started.status, "suspended");

  rmSync(paths.storePath, { force: true });
  rmSync(`${paths.storePath}-shm`, { force: true });
  rmSync(`${paths.storePath}-wal`, { force: true });

  assert.throws(() => execFileSync(
    process.execPath,
    [driver, "resume", paths.authorityPath, paths.storePath, started.runId],
    { cwd: spikeRoot, encoding: "utf8", stdio: "pipe" },
  ));

  const authority = new SyntheticAshleyAuthority(paths.authorityPath);
  try {
    const snapshot = authority.snapshot(fixtureJob.sourceKey);
    assert.equal(snapshot.outcome, null);
    assert.equal(snapshot.effects.length, 0);
    assert.equal(events(snapshot, "callback_start").length, 0);
  } finally {
    authority.close();
    rmSync(paths.directory, { recursive: true, force: true });
  }
});
