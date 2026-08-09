import { createMastraRuntime, fixtureJob } from "./adapter.mjs";

const [mode, authorityPath, storePath, runId] = process.argv.slice(2);
if (!mode || !authorityPath || !storePath) {
  throw new Error("usage: restart-driver.mjs <start|resume> <authority> <store> [run-id]");
}

const runtime = await createMastraRuntime({ authorityPath, storePath });
try {
  if (mode === "start") {
    const started = await runtime.startSuspended(fixtureJob);
    console.log(JSON.stringify({
      status: started.result.status,
      runId: started.runId,
      snapshot: runtime.authority.snapshot(fixtureJob.sourceKey),
    }));
  } else if (mode === "resume") {
    if (!runId) throw new Error("run-id required for resume");
    const result = await runtime.resume(runId);
    console.log(JSON.stringify({
      status: result.status,
      snapshot: runtime.authority.snapshot(fixtureJob.sourceKey),
    }));
  } else {
    throw new Error(`unknown mode: ${mode}`);
  }
} finally {
  await runtime.close();
}
