import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Decision } from "../types.js";
import {
  deriveCommunicationEffectIntent,
  evaluateAuthority,
  prepareCommitAndAudit,
  preserveCommunicationClass,
  refuseCapabilityAsAuthority,
  revalidatePreparedEffect,
} from "./index.js";

function memoryKv(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  return db;
}

function speakingDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 60,
    reason: "owner asked",
    evidenceRefs: [],
    uncertainty: 0,
    urgency: 0.4,
    thoughtSource: "deterministic",
    thoughtError: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0.5,
      openness: 0.5,
      tension: 0,
      reason: "neutral",
    },
    cognitiveAllocation: {
      shouldSpeak: true,
      effort: "medium",
      completion: "complete",
    },
    authorizedClaims: {
      readingRecordIds: [],
      readingTitles: [],
      readingClaims: [],
    },
    ...overrides,
  };
}

describe("Authority Kernel communication consumer", () => {
  it("grants a bounded authorization for an admitted owner-command reply", () => {
    const intent = deriveCommunicationEffectIntent({
      decision: speakingDecision({ id: 11 }),
      ownerId: "doc",
      trigger: "reactive",
      producer: "agency_runtime",
    });
    expect(intent.kind).toBe("effect_intent");
    const evaluation = evaluateAuthority({ intent });
    expect(evaluation.outcome).toBe("granted");
    if (evaluation.outcome !== "granted") return;
    expect(evaluation.authorization.kind).toBe("effect_authorization");
    expect(evaluation.authorization.class).toBe("owner_command_reply");
    expect("allowed" in evaluation.authorization).toBe(false);
  });

  it("refuses send when Agency wants to speak but is not admitted", () => {
    const intent = deriveCommunicationEffectIntent({
      decision: speakingDecision({
        cognitiveAllocation: {
          shouldSpeak: false,
          effort: "low",
          completion: "complete",
        },
        kind: "silence",
      }),
      ownerId: "doc",
      trigger: "reactive",
      producer: "agency_runtime",
    });
    const evaluation = evaluateAuthority({ intent });
    expect(evaluation.outcome).toBe("refused");
    if (evaluation.outcome !== "refused") return;
    expect(evaluation.code).toBe("agency_not_admitted");
  });

  it("rejects an underspecified 0.2.0 observation fragment", () => {
    const preserved = preserveCommunicationClass({
      communicationClass: "observation",
      text: "0.2.0",
    });
    expect(preserved.ok).toBe(false);
    if (preserved.ok) return;
    expect(preserved.code).toBe("underspecified_payload");
  });

  it("does not treat M2 inspection success as communication authority", () => {
    const intent = deriveCommunicationEffectIntent({
      decision: speakingDecision({
        cognitiveAllocation: {
          shouldSpeak: false,
          effort: "low",
          completion: "complete",
        },
        operationalLicense: {
          state: "succeeded",
          taskId: "inspect-1",
          profile: "project_investigation",
        },
        inspectionObservation: {
          projectId: "ashley",
          operation: "project.read_file",
          path: "package.json",
          verified: true,
          truncated: false,
          executedAtMs: 1,
          contentUtf8: "{}",
          bytes: 2,
          sha256: "ab",
        },
      }),
      ownerId: "doc",
      trigger: "proactive",
      producer: "agency_runtime",
    });
    const capability = refuseCapabilityAsAuthority(intent);
    expect(capability.code).toBe("capability_success_is_not_authority");
    const evaluation = evaluateAuthority({ intent });
    expect(evaluation.outcome).toBe("refused");
  });

  it("invalidates a prepared effect after a material Honesty mutation", () => {
    const intent = deriveCommunicationEffectIntent({
      decision: speakingDecision({ id: 4 }),
      ownerId: "doc",
      trigger: "reactive",
      producer: "agency_runtime",
    });
    const evaluation = evaluateAuthority({ intent });
    expect(evaluation.outcome).toBe("granted");
    if (evaluation.outcome !== "granted") return;
    const db = memoryKv();
    const first = prepareCommitAndAudit({
      db,
      evaluation,
      payloadText: "I can look at that with you.",
    });
    expect(first.outcome).toBe("commit");
    if (first.outcome !== "commit") return;
    const mutated = revalidatePreparedEffect({
      authorization: {
        ...evaluation.authorization,
        consumed: false,
      },
      previous: first.prepared,
      nextPayloadText: "0.2.0",
    });
    expect(mutated.outcome).toBe("refused");
    if (mutated.outcome !== "refused") return;
    expect(mutated.code).toBe("honesty_mutation_invalidated");
  });

  it("requires Authority for weekly-review templated communication", () => {
    const intent = deriveCommunicationEffectIntent({
      decision: null,
      ownerId: "doc",
      trigger: "proactive",
      producer: "weekly_review_template",
      weeklyReportRef: "weekly-review-1",
    });
    const evaluation = evaluateAuthority({ intent });
    expect(evaluation.outcome).toBe("granted");
    if (evaluation.outcome !== "granted") return;
    expect(evaluation.intent.class).toBe("observation");
    const db = memoryKv();
    const commit = prepareCommitAndAudit({
      db,
      evaluation,
      payloadText:
        "Weekly self-improvement review — candidate. I inspected the sealed report and found the tests passed.",
    });
    expect(commit.outcome).toBe("commit");
  });

  it("refuses a weekly-review payload that collapses to 0.2.0", () => {
    const intent = deriveCommunicationEffectIntent({
      decision: null,
      ownerId: "doc",
      trigger: "proactive",
      producer: "weekly_review_template",
      weeklyReportRef: "weekly-review-1",
    });
    const evaluation = evaluateAuthority({ intent });
    expect(evaluation.outcome).toBe("granted");
    if (evaluation.outcome !== "granted") return;
    const db = memoryKv();
    const commit = prepareCommitAndAudit({
      db,
      evaluation,
      payloadText: "0.2.0",
    });
    expect(commit.outcome).toBe("refused");
  });

  it("does not expose an externalAllowed boolean API", () => {
    const intent = deriveCommunicationEffectIntent({
      decision: speakingDecision(),
      ownerId: "doc",
      trigger: "reactive",
      producer: "agency_runtime",
    });
    const evaluation = evaluateAuthority({ intent });
    expect(JSON.stringify(evaluation)).not.toMatch(/externalAllowed/);
    expect(JSON.stringify(evaluation)).not.toMatch(/"allowed":true/);
  });
});
