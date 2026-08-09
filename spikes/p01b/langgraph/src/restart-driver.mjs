import { createLangGraphRuntime, fixtureJob } from "./adapter.mjs";

const [mode, authorityPath, storePath, runId] = process.argv.slice(2);
if (!mode || !authorityPath || !storePath) {
  throw new Error("usage: restart-driver.mjs <start|resume> <authority> <store> [run-id]");
}

const runtime = await createLangGraphRuntime({
  authorityPath,
  storePath,
  interruptBeforeCallback: mode === "start",
});
try {
  if (mode === "start") {
    const started = await runtime.startInterrupted(fixtureJob);
    console.log(JSON.stringify({
      phase: "interrupted",
      runId: started.runId,
      checkpointConfig: started.technical.config,
      technical: {
        next: started.technical.next,
        values: started.technical.values,
      },
      snapshot: runtime.authority.snapshot(fixtureJob.sourceKey),
    }));
  } else if (mode === "resume") {
    if (!runId) throw new Error("run-id required for resume");
    const resumed = await runtime.resume(runId);
    console.log(JSON.stringify({
      phase: "completed",
      technical: {
        next: resumed.technical.next,
        values: resumed.technical.values,
      },
      snapshot: runtime.authority.snapshot(fixtureJob.sourceKey),
    }));
  } else {
    throw new Error(`unknown mode: ${mode}`);
  }
} finally {
  runtime.close();
}
