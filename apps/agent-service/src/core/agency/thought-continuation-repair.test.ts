import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import {
  currentReleaseId,
  currentContractId,
  currentBuildIdentity,
  capabilityNames,
} from "../rollout/capabilities.js";
import {
  deliberateThoughtContinuation,
  runThoughtModel,
  THOUGHT_MAX_OUTPUT_TOKENS,
  type Complete,
} from "./thought.js";
import type {
  Decision,
  Motivation,
  ProjectInspectionObservation,
  ThoughtValidationEnvelope,
  WorkspaceExperimentObservation,
} from "../types.js";

const originalMode = env.cognitionMode;
const originalGroqKey = env.groqApiKey;
const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
const originalRegistryPath = env.sandboxProjectRegistryPath;

let tmpDir: string;
let registryPath: string;

function activateProjectInspection(db: DatabaseSync) {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

const motivation: Motivation = {
  id: 1,
  kind: "user_message",
  score: 100,
  summary: "What version is in package.json?",
  refType: "message",
  refId: 1,
};

function baseDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 40,
    reason: "respond",
    evidenceRefs: [],
    uncertainty: 0.2,
    urgency: 0.5,
    thoughtSource: "deterministic",
    thoughtError: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0.5,
      openness: 0.5,
      tension: 0,
      reason: "test",
    },
    cognitiveAllocation: { shouldSpeak: true, effort: "medium", completion: "complete" },
    authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
    ...overrides,
  };
}

const m2Intermediate = baseDecision({
  objective: "inspect package.json",
  evidenceDisposition: "acquire_project_evidence",
  operationalRequest: {
    kind: "project_inspection",
    request: {
      operation: "project.read_file",
      projectId: "project-ashley",
      path: "package.json",
    },
  },
  thoughtSource: "model",
  thoughtError: null,
});

const readFileObservation: ProjectInspectionObservation = {
  projectId: "project-ashley",
  operation: "project.read_file",
  path: "package.json",
  verified: true,
  truncated: false,
  executedAtMs: 1000,
  contentUtf8: '{"name":"project-ashley","version":"0.2.0"}',
  bytes: 45,
  sha256: "abc",
};

const listDirObservation: ProjectInspectionObservation = {
  projectId: "project-ashley",
  operation: "project.list_directory",
  path: "src",
  verified: true,
  truncated: false,
  executedAtMs: 1000,
  entries: [],
};

const searchTextObservation: ProjectInspectionObservation = {
  projectId: "project-ashley",
  operation: "project.search_text",
  path: ".",
  pattern: "version",
  verified: true,
  truncated: false,
  executedAtMs: 1000,
  matches: [],
  filesScanned: 1,
};

const workspaceObservation: WorkspaceExperimentObservation = {
  kind: "workspace_experiment_observation",
  projectId: "project-ashley",
  workspaceId: "ws-1",
  operation: "workspace.write_file",
  verified: true,
  executedAtMs: 1000,
  bytesWritten: 11,
};

function continuationText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: "speak",
    delayClass: null,
    shouldSpeak: true,
    effort: "medium",
    completion: "complete",
    uncertainty: 0.1,
    urgency: 0.4,
    objective: "report the version from the evidence",
    reason: "verified observation",
    motivationIds: [1],
    inspectionCognitiveResult: "package.json reports version 0.2.0",
    ...overrides,
  });
}

function run(
  intermediate: Decision,
  observation: ProjectInspectionObservation | WorkspaceExperimentObservation | null,
  executionError: string | null,
  complete: Complete,
  options: Parameters<typeof deliberateThoughtContinuation>[8] = {},
) {
  const db = openNuclearDb(new DatabaseSync(":memory:"));
  return deliberateThoughtContinuation(
    db,
    intermediate,
    observation,
    executionError,
    [motivation],
    "reactive",
    complete,
    () => true,
    options,
  ).finally(() => db.close());
}

beforeEach(() => {
  env.cognitionMode = "apply";
  env.groqApiKey = "test-key";
  env.sandboxEngineeringLifecycleEnabled = true;
  process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";
  tmpDir = mkdtempSync(join(tmpdir(), "m4-repair-"));
  registryPath = join(tmpDir, "registry.json");
  writeFileSync(
    registryPath,
    JSON.stringify([
      {
        projectId: "project-ashley",
        canonicalRoot: "/srv/projects/project-ashley",
        displayName: "Ashley",
        enabled: true,
        readAllowed: true,
        candidateWorkspaceAllowed: true,
        engineeringAllowed: false,
      },
    ]),
  );
  env.sandboxProjectRegistryPath = registryPath;
  mkdirSync(join(tmpDir, "live-repo"), { recursive: true });
});

afterEach(() => {
  env.cognitionMode = originalMode;
  env.groqApiKey = originalGroqKey;
  env.sandboxEngineeringLifecycleEnabled = originalLifecycle;
  env.sandboxProjectRegistryPath = originalRegistryPath;
  delete process.env.SANDBOX_V2_FORCE_AVAILABLE;
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe("M4 post-operation cognition repair: continuation reliability", () => {
  it("verified M2 success without cognitiveResult structurally regenerates once, then delivers the interpretation", async () => {
    const calls: { attempt: number; system: string }[] = [];
    let attempt = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async (messages) => {
        attempt += 1;
        const system = messages.find((m) => m.role === "system")?.content ?? "";
        calls.push({ attempt, system });
        return {
          text:
            attempt === 1
              ? continuationText({ inspectionCognitiveResult: undefined })
              : continuationText(),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      },
    );

    expect(attempt).toBe(2);
    expect(result.thoughtSource).toBe("model");
    expect(result.thoughtError).toBeNull();
    expect(result.inspectionCognitiveResult).toBe("package.json reports version 0.2.0");
    expect(result.operationalCognitiveResult).toBe("package.json reports version 0.2.0");
    expect(result.inspectionObservation).toEqual(readFileObservation);

    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope).not.toBeNull();
    expect(envelope.attempts).toHaveLength(2);
    expect(envelope.attempts.map((a) => a.phase)).toEqual(["continuation", "continuation"]);
    expect(envelope.attempts.map((a) => a.attempt)).toEqual([1, 2]);
    expect(envelope.attempts.map((a) => a.validationOk)).toEqual([false, true]);
    expect(envelope.attempts.map((a) => a.errorCode)).toEqual(["missing_required_field", null]);
    expect(envelope.attempts[0].field).toBe("inspectionCognitiveResult");
    expect(envelope.finalErrorCode).toBeNull();

    // The regeneration carries the fixed bounded feedback, not raw text.
    expect(calls[1].system).toContain("MUST emit inspectionCognitiveResult");
    expect(calls[1].system).not.toContain(readFileObservation.contentUtf8);
  });

  it("verified M2 success that never produces an interpretation fails closed with merged telemetry", async () => {
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => ({
        text: continuationText({ inspectionCognitiveResult: undefined }),
        model: "mistral-large",
      }),
    );

    expect(result.thoughtSource).toBe("fallback");
    expect(result.thoughtError).toBe("missing_required_field");
    expect(result.inspectionCognitiveResult).toBeUndefined();
    expect(result.operationalCognitiveResult).toBeUndefined();
    expect(result.inspectionObservation).toEqual(readFileObservation);
    expect(result.kind).toBe("speak");

    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope.attempts).toHaveLength(2);
    expect(envelope.finalErrorCode).toBe("missing_required_field");
  });

  it("rejects continuation attempts that originate new operational authority (unsupported_operation), then regenerates to acceptance", async () => {
    let attempt = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => {
        attempt += 1;
        if (attempt === 1) {
          return {
            text: continuationText({
              inspectionCognitiveResult: undefined,
              operationalRequest: {
                kind: "project_inspection",
                request: {
                  operation: "project.read_file",
                  projectId: "project-ashley",
                  path: "another.json",
                },
              },
            }),
            model: "mistral-large",
          };
        }
        return { text: continuationText(), model: "mistral-large" };
      },
    );

    expect(attempt).toBe(2);
    expect(result.thoughtSource).toBe("model");
    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope.attempts[0].errorCode).toBe("unsupported_operation");
    expect(envelope.attempts[0].field).toBe("operationalRequest");
    // Invariant 1: no new execution authority ever enters the final decision.
    expect(result.operationalRequest).toEqual(m2Intermediate.operationalRequest);
  });

  it("fails closed when continuation stubbornly emits new operational authority on both attempts", async () => {
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => ({
        text: continuationText({
          inspectionCognitiveResult: undefined,
          inspectionRequest: {
            operation: "project.read_file",
            projectId: "project-ashley",
            path: "another.json",
          },
        }),
        model: "mistral-large",
      }),
    );

    expect(result.thoughtSource).toBe("fallback");
    expect(result.thoughtError).toBe("unsupported_operation");
    expect(result.operationalRequest).toEqual(m2Intermediate.operationalRequest);
  });

  it("provider failure is never structurally retried: single emission, sanitized code, no regeneration", async () => {
    let calls = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => {
        calls += 1;
        throw Object.assign(new Error("limited"), { code: "rate_limited" });
      },
    );

    expect(calls).toBe(1);
    expect(result.thoughtSource).toBe("fallback");
    expect(result.thoughtError).toBe("rate_limited");
    expect(result.inspectionCognitiveResult).toBeUndefined();
    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope.attempts).toHaveLength(1);
    expect(envelope.attempts[0].providerOutcome).toBe("error");
    expect(envelope.attempts[0].phase).toBe("continuation");
    expect(envelope.finalErrorCode).toBeNull();
  });

  it("workspace (M3) continuations never require cognitiveResult and still carry it when provided", async () => {
    const result = await run(
      baseDecision({
        objective: "write candidate file",
        operationalRequest: {
          kind: "candidate_workspace_experiment",
          request: {
            version: 2,
            operation: "workspace.write_file",
            projectId: "project-ashley",
            workspaceId: "ws-1",
            path: "unpoisoned.txt",
            content: "reactive-ok",
            mustNotExist: true,
          },
        },
        thoughtSource: "model",
        thoughtError: null,
      }),
      workspaceObservation,
      null,
      async () => ({
        text: continuationText({
          inspectionCognitiveResult: undefined,
          cognitiveResult: "candidate workspace write succeeded",
        }),
        model: "mistral-large",
      }),
    );

    expect(result.thoughtSource).toBe("model");
    expect(result.thoughtError).toBeNull();
    expect(result.operationalCognitiveResult).toBe("candidate workspace write succeeded");
    expect(result.inspectionCognitiveResult).toBe("candidate workspace write succeeded");
    expect(result.workspaceObservation).toEqual(workspaceObservation);
    expect(result.inspectionObservation).toBeNull();
  });

  it("failed M2 execution never requires cognitiveResult (no verified success to interpret)", async () => {
    const result = await run(
      m2Intermediate,
      null,
      "execution_error",
      async () => ({
        text: continuationText({ inspectionCognitiveResult: undefined }),
        model: "mistral-large",
      }),
    );

    expect(result.thoughtSource).toBe("model");
    expect(result.thoughtError).toBeNull();
    expect(result.inspectionCognitiveResult).toBeNull();
    expect(result.operationalObservation).toBeNull();
  });

  it("list_directory and search_text verified successes also require cognitiveResult", async () => {
    for (const observation of [listDirObservation, searchTextObservation]) {
      let attempt = 0;
      const result = await run(
        m2Intermediate,
        observation,
        null,
        async () => {
          attempt += 1;
          return {
            text: continuationText({ inspectionCognitiveResult: undefined }),
            model: "mistral-large",
          };
        },
      );
      expect(attempt).toBe(2);
      expect(result.thoughtSource).toBe("fallback");
      expect(result.thoughtError).toBe("missing_required_field");
    }
  });

  it("truncated-but-valid recovery is accepted at the token limit with truncation telemetry", async () => {
    let attempt = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => {
        attempt += 1;
        return {
          text:
            attempt === 1
              ? continuationText({ inspectionCognitiveResult: undefined })
              : continuationText(),
          model: "mistral-large",
          usage: { promptTokens: 500, completionTokens: THOUGHT_MAX_OUTPUT_TOKENS },
          maxTokens: THOUGHT_MAX_OUTPUT_TOKENS,
        };
      },
    );

    expect(attempt).toBe(2);
    expect(result.thoughtSource).toBe("model");
    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope.attempts).toHaveLength(2);
    expect(envelope.attempts[0].truncated).toBe(true);
    expect(envelope.attempts[0].validationOk).toBe(false);
    expect(envelope.attempts[1].truncated).toBe(true);
    expect(envelope.attempts[1].validationOk).toBe(true);
    expect(envelope.attempts[1].parseOk).toBe(true);
  });

  it("invalid JSON regenerates exactly once with fixed feedback and never persists raw text", async () => {
    const systems: string[] = [];
    let attempt = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async (messages) => {
        attempt += 1;
        const system = messages.find((m) => m.role === "system")?.content ?? "";
        systems.push(system);
        return {
          text: attempt === 1 ? "definitely not json {{" : continuationText(),
          model: "mistral-large",
        };
      },
    );

    expect(attempt).toBe(2);
    expect(result.thoughtSource).toBe("model");
    expect(systems[1]).toContain("Emit strict JSON only.");

    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope.attempts[0].errorCode).toBe("invalid_json");
    expect(envelope.attempts[0].parseOk).toBe(false);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("definitely not json");
    expect(serialized).not.toContain(readFileObservation.contentUtf8);
    expect(envelope.attempts[0].sha256.length).toBe(64);
  });

  it("raw project evidence never enters telemetry or Expression-facing interpretation", async () => {
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => ({ text: continuationText(), model: "mistral-large" }),
    );

    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("0.2.0");
    expect(serialized).not.toContain("contentUtf8");
    // The interpretation is a bounded summary, not a raw dump.
    expect(result.inspectionCognitiveResult).toBe("package.json reports version 0.2.0");
    expect(result.inspectionCognitiveResult!.length).toBeLessThanOrEqual(1000);
  });

  it("clean single-emission continuation attaches no new failure telemetry (envelope stays null)", async () => {
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => ({ text: continuationText(), model: "mistral-large" }),
    );

    expect(result.thoughtSource).toBe("model");
    expect(result.thoughtValidation ?? null).toBeNull();
  });

  it("merges Pass 1 and Pass 2 envelopes phase-first when the continuation recovers", async () => {
    const pass1Envelope: ThoughtValidationEnvelope = {
      attempts: [
        {
          phase: "initial",
          attempt: 1,
          providerOutcome: "completed",
          outputTokens: 100,
          maxTokens: 1000,
          truncated: false,
          parseOk: false,
          validationOk: false,
          errorCode: "invalid_json",
          field: null,
          opKind: null,
          bytes: 12,
          sha256: "a".repeat(64),
        },
        {
          phase: "initial",
          attempt: 2,
          providerOutcome: "completed",
          outputTokens: 100,
          maxTokens: 1000,
          truncated: false,
          parseOk: true,
          validationOk: true,
          errorCode: null,
          field: null,
          opKind: "project_inspection",
          bytes: 12,
          sha256: "b".repeat(64),
        },
      ],
      finalErrorCode: null,
    };
    const intermediate = { ...m2Intermediate, thoughtValidation: pass1Envelope };
    let attempt = 0;
    const result = await run(
      intermediate,
      readFileObservation,
      null,
      async () => {
        attempt += 1;
        return {
          text:
            attempt === 1
              ? continuationText({ inspectionCognitiveResult: undefined })
              : continuationText(),
          model: "mistral-large",
        };
      },
    );

    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope.attempts).toHaveLength(4);
    expect(envelope.attempts.map((a) => a.phase)).toEqual([
      "initial",
      "initial",
      "continuation",
      "continuation",
    ]);
    expect(envelope.finalErrorCode).toBeNull();
  });

  it("terminal continuation failure dominates the merged finalErrorCode", async () => {
    const pass1Envelope: ThoughtValidationEnvelope = {
      attempts: [
        {
          phase: "initial",
          attempt: 1,
          providerOutcome: "completed",
          outputTokens: 100,
          maxTokens: 1000,
          truncated: false,
          parseOk: true,
          validationOk: true,
          errorCode: null,
          field: null,
          opKind: "project_inspection",
          bytes: 12,
          sha256: "c".repeat(64),
        },
      ],
      finalErrorCode: null,
    };
    const result = await run(
      { ...m2Intermediate, thoughtValidation: pass1Envelope },
      readFileObservation,
      null,
      async () => ({
        text: continuationText({ inspectionCognitiveResult: undefined }),
        model: "mistral-large",
      }),
    );

    const envelope = result.thoughtValidation as ThoughtValidationEnvelope;
    expect(envelope.attempts).toHaveLength(3);
    expect(envelope.finalErrorCode).toBe("missing_required_field");
    expect(envelope.attempts[0].phase).toBe("initial");
  });

  it("routing: both cognitive phases invoke the canonical thought route with no provider hardcoding", async () => {
    const routes: (string | undefined)[] = [];
    let calls = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async (messages, options) => {
        calls += 1;
        routes.push(options?.route);
        return { text: continuationText(), model: "mistral-large" };
      },
    );
    expect(result.thoughtSource).toBe("model");
    expect(calls).toBe(1);
    expect(routes).toEqual(["thought"]);
  });

  it("route unavailability (no bound provider key) skips continuation entirely", async () => {
    env.groqApiKey = "";
    let calls = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => {
        calls += 1;
        return { text: continuationText(), model: "mistral-large" };
      },
    );
    expect(calls).toBe(0);
    expect(result.thoughtSource).toBe("model");
    expect(result.thoughtError).toBeNull();
    expect(result.inspectionObservation).toEqual(readFileObservation);
    expect(result.operationalRequest).toEqual(m2Intermediate.operationalRequest);
  });

  it("silence and non-acquiring delay continuations never invoke the model", async () => {
    for (const intermediate of [
      baseDecision({ kind: "silence", thoughtSource: "deterministic" }),
      baseDecision({
        kind: "delay",
        delayClass: "brief",
        thoughtSource: "deterministic",
        cognitiveAllocation: { shouldSpeak: false, effort: "low", completion: "hold" },
      }),
    ]) {
      let calls = 0;
      const result = await run(
        intermediate,
        readFileObservation,
        null,
        async () => {
          calls += 1;
          return { text: continuationText(), model: "mistral-large" };
        },
      );
      expect(calls).toBe(0);
      expect(result.kind).toBe(intermediate.kind);
    }
  });

  it("execution evidence is immutable across continuation (invariant 2)", async () => {
    const operationalLicense = {
      discriminator: "ASHLEY_SANDBOX_V2_LICENSE" as const,
      state: "succeeded" as const,
      taskId: "task-1",
      profile: "project_investigation" as const,
    };
    const intermediate = { ...m2Intermediate, operationalLicense };
    const result = await run(
      intermediate,
      readFileObservation,
      null,
      async () => ({ text: continuationText(), model: "mistral-large" }),
    );

    expect(result.operationalRequest).toEqual(intermediate.operationalRequest);
    expect(result.operationalLicense).toEqual(operationalLicense);
    expect(result.operationalObservation).toEqual(readFileObservation);
  });

  it("expired deadline skips continuation without invoking the model", async () => {
    let calls = 0;
    const result = await run(
      m2Intermediate,
      readFileObservation,
      null,
      async () => {
        calls += 1;
        return { text: continuationText(), model: "mistral-large" };
      },
      { thoughtDeadlineAtMs: Date.now() - 1000 },
    );
    expect(calls).toBe(0);
    expect(result.inspectionObservation).toEqual(readFileObservation);
  });
});

describe("M4 repair: Pass 1 shared substrate smoke", () => {
  it("runThoughtModel still normalizes legacy inspectionRequest through the shared substrate", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateProjectInspection(db);
    try {
      let sawRoute: string | undefined;
      const result = await runThoughtModel(
        db,
        baseDecision(),
        [motivation],
        "reactive",
        async (messages, options) => {
          sawRoute = options?.route;
          return {
            text: JSON.stringify({
              kind: "speak",
              delayClass: null,
              shouldSpeak: true,
              effort: "medium",
              completion: "complete",
              uncertainty: 0.1,
              urgency: 0.4,
              objective: "inspect",
              reason: "need evidence",
              motivationIds: [1],
              evidenceDisposition: "acquire_project_evidence",
              inspectionRequest: {
                operation: "project.read_file",
                projectId: "project-ashley",
                path: "package.json",
              },
            }),
            model: "mistral-large",
          };
        },
      );
      expect(sawRoute).toBe("thought");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.proposal.operationalRequest?.kind).toBe("project_inspection");
        expect(result.proposal.inspectionRequest?.path).toBe("package.json");
      }
    } finally {
      db.close();
    }
  });

  it("Pass 1 structural failure regenerates exactly once through the shared substrate", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      let attempt = 0;
      const result = await runThoughtModel(
        db,
        baseDecision(),
        [motivation],
        "reactive",
        async () => {
          attempt += 1;
          return {
            text:
              attempt === 1
                ? "not json"
                : JSON.stringify({
                    kind: "speak",
                    delayClass: null,
                    shouldSpeak: true,
                    effort: "medium",
                    completion: "complete",
                    uncertainty: 0.1,
                    urgency: 0.4,
                    objective: "inspect",
                    reason: "need evidence",
                    motivationIds: [1],
                    evidenceDisposition: "sufficient",
                  }),
            model: "mistral-large",
          };
        },
      );
      expect(attempt).toBe(2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.envelope?.attempts).toHaveLength(2);
        expect(result.envelope?.attempts[0].errorCode).toBe("invalid_json");
        expect(result.envelope?.attempts[0].phase).toBe("initial");
      }
    } finally {
      db.close();
    }
  });

  it("provider failure in Pass 1 never regenerates", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      let attempt = 0;
      const result = await runThoughtModel(
        db,
        baseDecision(),
        [motivation],
        "reactive",
        async () => {
          attempt += 1;
          throw Object.assign(new Error("unavailable"), { code: "mistral_unavailable" });
        },
      );
      expect(attempt).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("mistral_unavailable");
        expect(result.envelope?.attempts).toHaveLength(1);
        expect(result.envelope?.attempts[0].providerOutcome).toBe("error");
      }
    } finally {
      db.close();
    }
  });

  it("continuation proposal accepts non-delay decision with delayClass present and normalizes it to null", async () => {
    const operationalLicense = {
      discriminator: "ASHLEY_SANDBOX_V2_LICENSE" as const,
      state: "succeeded" as const,
      taskId: "task-m3-exp",
      profile: "project_experimentation" as const,
      workspaceEffect: {
        projectId: "project-ashley",
        workspaceId: "w-fresh",
        operation: "workspace.write_file" as const,
        logicalRelativePath: "smoke.txt",
        sourceSnapshotId: "snap-1",
      },
    };
    const m3Intermediate = baseDecision({
      objective: "write smoke file",
      operationalRequest: {
        kind: "candidate_workspace_experiment",
        request: {
          version: 2,
          operation: "workspace.write_file",
          projectId: "project-ashley",
          path: "smoke.txt",
          content: "test",
          mustNotExist: true,
        },
      },
      operationalLicense,
      thoughtSource: "model",
      thoughtError: null,
    });

    const result = await run(
      m3Intermediate,
      null,
      null,
      async () => ({
        text: JSON.stringify({
          kind: "speak",
          delayClass: "standard", // emitted on speak decision by model following schema
          shouldSpeak: true,
          effort: "medium",
          completion: "complete",
          uncertainty: 0.1,
          urgency: 0.2,
          objective: "wrote smoke file",
          reason: "file created in workspace",
          motivationIds: [1],
        }),
        model: "openai/gpt-oss-20b",
      }),
    );

    expect(result.thoughtSource).toBe("model");
    expect(result.kind).toBe("speak");
    expect(result.delayClass).toBeFalsy();
    expect(result.operationalLicense).toEqual(operationalLicense);
  });

  it("retains verified OperationalClaimLicense when continuation fails with structural error", async () => {
    const operationalLicense = {
      discriminator: "ASHLEY_SANDBOX_V2_LICENSE" as const,
      state: "succeeded" as const,
      taskId: "task-m3-exp-fail",
      profile: "project_experimentation" as const,
      workspaceEffect: {
        projectId: "project-ashley",
        workspaceId: "w-fresh",
        operation: "workspace.write_file" as const,
        logicalRelativePath: "smoke.txt",
        sourceSnapshotId: "snap-1",
      },
    };
    const m3Intermediate = baseDecision({
      objective: "write smoke file",
      operationalRequest: {
        kind: "candidate_workspace_experiment",
        request: {
          version: 2,
          operation: "workspace.write_file",
          projectId: "project-ashley",
          path: "smoke.txt",
          content: "test",
          mustNotExist: true,
        },
      },
      operationalLicense,
      thoughtSource: "model",
      thoughtError: null,
    });

    const result = await run(
      m3Intermediate,
      null,
      null,
      async () => ({
        text: "completely invalid json output from continuation",
        model: "openai/gpt-oss-20b",
      }),
    );

    expect(result.thoughtSource).toBe("fallback");
    expect(result.operationalLicense).toEqual(operationalLicense);
  });
});
