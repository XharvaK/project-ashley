import { createHash } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { SyntheticAshleyAuthority } from "../../mastra/src/authority.mjs";

const GraphState = Annotation.Root({
  job: Annotation(),
  analysis: Annotation(),
  outcomeId: Annotation(),
  reconciled: Annotation(),
});

const fixedAnalysis = {
  summary: "Doc is preparing a deterministic P-01 proof and Ashley will follow up.",
};

const retryPolicy = {
  maxAttempts: 5,
  initialInterval: 1,
  backoffFactor: 1,
  maxInterval: 1,
  jitter: false,
  retryOn: () => true,
  logWarning: false,
};

function candidateRunId(sourceKey) {
  return `langgraph-${createHash("sha256").update(sourceKey).digest("hex").slice(0, 24)}`;
}

export async function createLangGraphRuntime({
  authorityPath,
  storePath,
  interruptBeforeCallback = false,
}) {
  const authority = new SyntheticAshleyAuthority(authorityPath);
  const checkpointer = SqliteSaver.fromConnString(storePath);
  await checkpointer.setup();

  const graph = new StateGraph(GraphState)
    .addNode("callback", async (state) => {
      authority.beginAttempt(state.job.sourceKey);
      if (state.job.failurePoint === "before_callback_result") {
        throw new Error("before_callback_result");
      }
      authority.trace(state.job.sourceKey, "callback_result");
      if (state.job.failurePoint === "after_callback_result") {
        throw new Error("after_callback_result");
      }
      return { analysis: { ...fixedAnalysis } };
    }, { retryPolicy })
    .addNode("materialize", async (state) => {
      const runId = candidateRunId(state.job.sourceKey);
      authority.trace(state.job.sourceKey, "materializer_invoked");
      const existed = Boolean(authority.outcome(state.job.sourceKey));
      const outcome = authority.materialize(
        state.job,
        state.analysis,
        runId,
        state.job.failurePoint,
      );
      if (state.job.failurePoint === "after_ashley_commit") {
        throw new Error("after_ashley_commit");
      }
      return { outcomeId: Number(outcome.id), reconciled: existed };
    }, { retryPolicy })
    .addEdge(START, "callback")
    .addEdge("callback", "materialize")
    .addEdge("materialize", END)
    .compile({
      checkpointer,
      interruptBefore: interruptBeforeCallback ? ["callback"] : [],
    });

  async function execute(job) {
    const persisted = authority.enqueue(job);
    const existing = authority.outcome(job.sourceKey);
    if (existing) {
      authority.trace(job.sourceKey, "adapter_reconciled_completed", {
        outcomeId: existing.id,
      });
      return {
        status: "success",
        result: { outcomeId: Number(existing.id), reconciled: true },
        ashleyJobId: Number(persisted.id),
      };
    }
    const runId = candidateRunId(job.sourceKey);
    const config = { configurable: { thread_id: runId } };
    try {
      const result = await graph.invoke({ job }, config);
      return { status: "success", result, runId, ashleyJobId: Number(persisted.id) };
    } catch (error) {
      const message = error?.message ?? String(error);
      const authoritative = authority.outcome(job.sourceKey);
      if (authoritative) {
        authority.trace(job.sourceKey, "candidate_completion_failed", {
          error: message,
          outcomeId: authoritative.id,
        });
        return {
          status: "failed",
          error: message,
          runId,
          ashleyJobId: Number(persisted.id),
          authoritativeOutcomeId: Number(authoritative.id),
        };
      }
      authority.markFailure(job.sourceKey, runId, message);
      return {
        status: "failed",
        error: message,
        runId,
        ashleyJobId: Number(persisted.id),
      };
    }
  }

  async function startInterrupted(job) {
    const persisted = authority.enqueue(job);
    const runId = candidateRunId(job.sourceKey);
    const config = { configurable: { thread_id: runId } };
    await graph.invoke({ job }, config);
    const technical = await graph.getState(config);
    return {
      runId,
      ashleyJobId: Number(persisted.id),
      technical,
    };
  }

  async function resume(runId) {
    const config = { configurable: { thread_id: runId } };
    const result = await graph.invoke(null, config);
    const technical = await graph.getState(config);
    return { result, technical };
  }

  function close() {
    checkpointer.db.close();
    authority.close();
  }

  return {
    authority,
    checkpointer,
    graph,
    execute,
    startInterrupted,
    resume,
    close,
  };
}

export const fixtureJob = Object.freeze({
  ownerId: "p01-owner",
  entityUuid: "20000000-0000-4000-8000-000000000001",
  threadId: "p01-thread",
  sourceKey: "p01:p01-owner:p01-thread:2",
  sourceMessageIds: [1, 2],
  capabilityContract: "ashley-capability-v3",
  modelEpoch: 1,
  provenance: "live",
  contractMismatch: false,
  epochMismatch: false,
  failurePoint: "none",
});
