import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import type { CognitiveDispatchOptions } from "../../mistral-client.js";
import {
  composeInitialThoughtMessages,
  deliberateThoughtContinuation,
  runThoughtModel,
  type ThoughtModelResult,
} from "./thought.js";
import type { Decision, Motivation, ProjectInspectionObservation } from "../types.js";
import { env } from "../../env.js";

const OWNER_ID = "c2-thought-owner";

function baseDecision(): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 100,
    reason: "context budget test",
    objective: "answer",
    evidenceRefs: [],
    uncertainty: 0,
    urgency: 0,
    thoughtSource: "deterministic",
    thoughtError: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0,
      openness: 0,
      tension: 0,
      reason: "test",
    },
    cognitiveAllocation: { shouldSpeak: true, effort: "low", completion: "complete" },
    authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
  };
}

function motivations(): Motivation[] {
  return [1, 2, 3].map((id) => ({
    id,
    ownerId: OWNER_ID,
    kind: "user_message" as const,
    score: 100 - id,
    refType: "message",
    refId: id,
    summary: `candidate ${id}`,
  }));
}

function validThought(): ThoughtModelResult {
  return {
    text: JSON.stringify({
      kind: "speak",
      shouldSpeak: true,
      effort: "low",
      completion: "complete",
      motivationIds: [1],
      objective: "answer",
      reason: "grounded",
      uncertainty: 0,
      urgency: 0,
      evidenceDisposition: "sufficient",
    }),
  };
}

function validContinuation(): ThoughtModelResult {
  return {
    text: JSON.stringify({
      kind: "speak",
      delayClass: null,
      shouldSpeak: true,
      effort: "low",
      completion: "complete",
      motivationIds: [1],
      objective: "report the inspected result",
      reason: "verified repository observation",
      uncertainty: 0,
      urgency: 0,
      inspectionCognitiveResult: "package.json contains the requested version",
    }),
  };
}

describe("C2 Thought enrollment", () => {
  it("passes a C2-built projection with evidence refs to the completion seam in dark apply", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const calls: Array<{ messages: unknown[]; options: CognitiveDispatchOptions }> = [];
      const complete = async (
        messages: Parameters<typeof import("../../mistral-client.js").completeChat>[0],
        options: Parameters<typeof import("../../mistral-client.js").completeChat>[1],
      ): Promise<ThoughtModelResult> => {
        calls.push({ messages, options });
        return validThought();
      };
      const result = await runThoughtModel(
        db,
        baseDecision(),
        motivations(),
        "reactive",
        complete,
        {
          ownerId: OWNER_ID,
          contextBudgetMode: "dark_apply",
          contextBudgetMaxUtf8Bytes: 12_000,
        },
      );
      expect(result.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.options.contextProjection?.evidenceRefs.length).toBeGreaterThan(0);
      expect(calls[0]?.options.contextProjection?.projectionId).toBeTruthy();
      expect(db.prepare(
        "SELECT COUNT(*) AS count FROM context_allocation_receipts WHERE purpose = 'thought'",
      ).get()).toEqual({ count: 1 });
      expect(calls[0]?.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: "system" })]),
      );
    } finally {
      db.close();
    }
  });

  it("keeps observe-mode Thought compatibility unbudgeted and does not emit a C2 receipt", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const raw = composeInitialThoughtMessages({
        base: baseDecision(),
        motivations: motivations(),
        trigger: "reactive",
        canOffer: false,
        canOfferWorkspace: false,
        canOfferVerification: false,
        canOfferAuthorship: false,
        canOfferOperation: false,
        canOfferExport: false,
        approvedProjectIds: [],
      });
      let received: Parameters<typeof import("../../mistral-client.js").completeChat>[0] | undefined;
      const complete = async (
        messages: Parameters<typeof import("../../mistral-client.js").completeChat>[0],
      ): Promise<ThoughtModelResult> => {
        received = messages;
        return validThought();
      };
      await runThoughtModel(db, baseDecision(), motivations(), "reactive", complete, {
        ownerId: OWNER_ID,
        contextBudgetMode: "observe",
      });
      expect(received?.[0]).toEqual(raw[0]);
      expect(received?.[1]).toEqual(raw[1]);
      expect(db.prepare("SELECT COUNT(*) AS count FROM context_allocation_receipts").get())
        .toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("enrolls Thought continuation in the same bounded projection seam", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const originalGroqKey = env.groqApiKey;
    env.groqApiKey = "fixture";
    try {
      const observation: ProjectInspectionObservation = {
        projectId: "project-ashley",
        operation: "project.read_file",
        path: "package.json",
        verified: true,
        truncated: false,
        executedAtMs: 1,
        contentUtf8: '{"version":"1.0.0"}',
        bytes: 19,
        sha256: "fixture",
      };
      const intermediate = {
        ...baseDecision(),
        objective: "inspect package.json",
        evidenceDisposition: "acquire_project_evidence" as const,
        operationalRequest: {
          kind: "project_inspection" as const,
          request: {
            operation: "project.read_file" as const,
            projectId: "project-ashley",
            path: "package.json",
          },
        },
      };
      const calls: Array<{ messages: unknown[]; options: CognitiveDispatchOptions }> = [];
      const complete = async (
        messages: Parameters<typeof import("../../mistral-client.js").completeChat>[0],
        options: Parameters<typeof import("../../mistral-client.js").completeChat>[1],
      ): Promise<ThoughtModelResult> => {
        calls.push({ messages, options });
        return validContinuation();
      };

      const result = await deliberateThoughtContinuation(
        db,
        intermediate,
        observation,
        null,
        motivations(),
        "reactive",
        complete,
        () => true,
        {
          ownerId: OWNER_ID,
          contextBudgetMode: "dark_apply",
          contextBudgetMaxUtf8Bytes: 12_000,
        },
      );

      expect(result.inspectionCognitiveResult).toBe("package.json contains the requested version");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.options.contextProjection?.evidenceRefs.length).toBeGreaterThan(0);
      expect(calls[0]?.options.contextProjection?.purpose).toBe("thought");
      expect(db.prepare(
        "SELECT COUNT(*) AS count FROM context_allocation_receipts WHERE purpose = 'thought'",
      ).get()).toEqual({ count: 1 });
    } finally {
      env.groqApiKey = originalGroqKey;
      db.close();
    }
  });
});
