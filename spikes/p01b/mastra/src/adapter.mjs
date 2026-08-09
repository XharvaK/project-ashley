import { createHash } from "node:crypto";
import { Mastra } from "@mastra/core/mastra";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { LibSQLStore } from "@mastra/libsql";
import { z } from "zod";
import { SyntheticAshleyAuthority } from "./authority.mjs";

const jobSchema = z.object({
  ownerId: z.string(),
  entityUuid: z.string(),
  threadId: z.string(),
  sourceKey: z.string(),
  sourceMessageIds: z.array(z.number().int().positive()),
  capabilityContract: z.string(),
  modelEpoch: z.number().int().nonnegative(),
  provenance: z.enum(["shadow", "live"]),
  contractMismatch: z.boolean().default(false),
  epochMismatch: z.boolean().default(false),
  suspendBeforeCallback: z.boolean().default(false),
  failurePoint: z.enum([
    "none",
    "before_callback_result",
    "after_callback_result",
    "inside_ashley_transaction",
    "after_ashley_commit",
  ]).default("none"),
});

const analysisSchema = z.object({ summary: z.string() });
const callbackOutputSchema = z.object({ job: jobSchema, analysis: analysisSchema });
const workflowOutputSchema = z.object({
  sourceKey: z.string(),
  outcomeId: z.number(),
  reconciled: z.boolean(),
});

const fixedAnalysis = {
  summary: "Doc is preparing a deterministic P-01 proof and Ashley will follow up.",
};

function candidateRunId(sourceKey) {
  return `mastra-${createHash("sha256").update(sourceKey).digest("hex").slice(0, 24)}`;
}

function resultError(result) {
  if (result?.status !== "failed") return null;
  return result.error?.message ?? String(result.error ?? "workflow_failed");
}

export async function createMastraRuntime({ authorityPath, storePath }) {
  const authority = new SyntheticAshleyAuthority(authorityPath);
  const storage = new LibSQLStore({
    id: "p01b-mastra-storage",
    url: `file:${storePath.replaceAll("\\", "/")}`,
  });

  const restartGate = createStep({
    id: "restart-gate",
    inputSchema: jobSchema,
    resumeSchema: z.object({ continue: z.boolean() }),
    suspendSchema: z.object({
      ashleyJobId: z.number(),
      sourceKey: z.string(),
      ownerId: z.string(),
      entityUuid: z.string(),
      threadId: z.string(),
      capabilityContract: z.string(),
      modelEpoch: z.number(),
      provenance: z.enum(["shadow", "live"]),
    }),
    outputSchema: jobSchema,
    execute: async ({ inputData, resumeData, suspend }) => {
      if (inputData.suspendBeforeCallback && !resumeData?.continue) {
        const persisted = authority.job(inputData.sourceKey);
        authority.trace(inputData.sourceKey, "candidate_suspended");
        return suspend({
          ashleyJobId: Number(persisted.id),
          sourceKey: inputData.sourceKey,
          ownerId: inputData.ownerId,
          entityUuid: inputData.entityUuid,
          threadId: inputData.threadId,
          capabilityContract: inputData.capabilityContract,
          modelEpoch: inputData.modelEpoch,
          provenance: inputData.provenance,
        });
      }
      authority.trace(inputData.sourceKey, "candidate_resumed_or_started");
      return inputData;
    },
  });

  const callbackStep = createStep({
    id: "fixed-callback",
    inputSchema: jobSchema,
    outputSchema: callbackOutputSchema,
    retries: 4,
    execute: async ({ inputData }) => {
      const attempt = authority.beginAttempt(inputData.sourceKey);
      if (attempt > 5) throw new Error("terminal_attempt_exhausted");
      if (inputData.failurePoint === "before_callback_result") {
        throw new Error("before_callback_result");
      }
      const analysis = { ...fixedAnalysis };
      authority.trace(inputData.sourceKey, "callback_result", { attempt });
      if (inputData.failurePoint === "after_callback_result") {
        throw new Error("after_callback_result");
      }
      return { job: inputData, analysis };
    },
  });

  const materializeStep = createStep({
    id: "ashley-materializer",
    inputSchema: callbackOutputSchema,
    outputSchema: workflowOutputSchema,
    retries: 4,
    execute: async ({ inputData }) => {
      const runId = candidateRunId(inputData.job.sourceKey);
      authority.trace(inputData.job.sourceKey, "materializer_invoked");
      const existed = Boolean(authority.outcome(inputData.job.sourceKey));
      const outcome = authority.materialize(
        inputData.job,
        inputData.analysis,
        runId,
        inputData.job.failurePoint,
      );
      if (inputData.job.failurePoint === "after_ashley_commit") {
        throw new Error("after_ashley_commit");
      }
      return {
        sourceKey: inputData.job.sourceKey,
        outcomeId: Number(outcome.id),
        reconciled: existed,
      };
    },
  });

  const workflow = createWorkflow({
    id: "p01b-consolidate-thread",
    inputSchema: jobSchema,
    outputSchema: workflowOutputSchema,
  }).then(restartGate).then(callbackStep).then(materializeStep).commit();

  const mastra = new Mastra({
    storage,
    workflows: { p01bWorkflow: workflow },
  });
  await storage.init();
  const registered = mastra.getWorkflow("p01bWorkflow");

  async function execute(job) {
    const persisted = authority.enqueue(job);
    const existing = authority.outcome(job.sourceKey);
    if (existing) {
      authority.trace(job.sourceKey, "adapter_reconciled_completed", { outcomeId: existing.id });
      return { status: "success", result: { outcomeId: Number(existing.id), reconciled: true } };
    }
    const runId = candidateRunId(job.sourceKey);
    const run = await registered.createRun({ runId, resourceId: job.ownerId });
    const result = await run.start({ inputData: job });
    const error = resultError(result);
    if (error) authority.markFailure(job.sourceKey, runId, error);
    return { ...result, runId, ashleyJobId: Number(persisted.id) };
  }

  async function startSuspended(job) {
    const suspendedJob = { ...job, suspendBeforeCallback: true };
    const persisted = authority.enqueue(suspendedJob);
    const runId = candidateRunId(job.sourceKey);
    const run = await registered.createRun({ runId, resourceId: job.ownerId });
    const result = await run.start({ inputData: suspendedJob });
    return { result, runId, ashleyJobId: Number(persisted.id) };
  }

  async function resume(runId) {
    const run = await registered.createRun({ runId });
    return run.resume({
      step: "restart-gate",
      resumeData: { continue: true },
    });
  }

  async function close() {
    await storage.close();
    authority.close();
  }

  return { authority, storage, workflow: registered, execute, startSuspended, resume, close };
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
  suspendBeforeCallback: false,
  failurePoint: "none",
});
