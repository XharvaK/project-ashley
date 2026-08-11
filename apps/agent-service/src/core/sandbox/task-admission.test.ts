import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import {
  currentBuildIdentity,
  currentContractId,
  currentReleaseId,
} from "../rollout/capabilities.js";
import {
  getOpenCognitiveItem,
  materializeOpenCognitiveItem,
} from "../cognition/open-items.js";
import { createQuestion } from "../state/questions.js";
import { applyForgetTargets } from "../memory/forget.js";
import type { Decision } from "../types.js";
import {
  admitSandboxTaskIntent,
  listSandboxTaskAdmissions,
  purposeProfile,
  SANDBOX_EFFECT_PROFILES,
  verifyEffectProfile,
} from "./task-admission.js";

const OWNER_ID = "owner-1";

function activateCapabilities(db: DatabaseSync, names: string[]): void {
  const releaseId = currentReleaseId();
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO capability_releases
       (capability, release_id, state, promoted_at, updated_at)
     VALUES (?, ?, 'active', ?, ?)`,
  );
  for (const name of names) insert.run(name, releaseId, now, now);
}

type Fixture = {
  db: DatabaseSync;
  ociEntityUuid: string;
  questionEntityUuid: string;
};

function decisionWithRefs(id: number, refs: Decision["evidenceRefs"]): Decision {
  return {
    id,
    trigger: "proactive",
    kind: "share",
    motivationIds: [1],
    score: 60,
    reason: "grounded share",
    evidenceRefs: refs,
    uncertainty: 0,
    urgency: 0,
    thoughtSource: "deterministic",
    thoughtError: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0.5,
      openness: 0.5,
      tension: 0,
      reason: "neutral baseline",
    },
    cognitiveAllocation: {
      shouldSpeak: true,
      effort: "medium",
      completion: "complete",
    },
    authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
  };
}

function makeFixture(): Fixture {
  const db = openNuclearDb(new DatabaseSync(":memory:"));
  activateCapabilities(db, ["recall"]);
  const originalMode = env.cognitionMode;
  env.cognitionMode = "apply";
  try {
    const questionId = createQuestion(db, OWNER_ID, "about_doc", "did the migration land?");
    const entityUuid = randomUUID();
    db.prepare(`UPDATE questions SET entity_uuid = ? WHERE id = ?`).run(entityUuid, questionId);
    const item = materializeOpenCognitiveItem(db, {
      ownerId: OWNER_ID,
      kind: "question",
      semanticSummary: "Question about the migration outcome",
      source: { type: "question", id: String(questionId), entityUuid },
      origin: "manual",
      semanticKeyMaterial: `admission-fixture-${entityUuid}`,
      provenance: "live",
      sourceCapability: "recall",
      contractId: currentContractId(),
      buildIdentity: currentBuildIdentity(),
      modelEpoch: 0,
    }).item;
    return { db, ociEntityUuid: item.entityUuid, questionEntityUuid: entityUuid };
  } finally {
    env.cognitionMode = originalMode;
  }
}

function closeFixture(fixture: Fixture): void {
  fixture.db.close();
}

describe("deterministic sandbox task admission", () => {
  it("records an admission grounded in a current qualified question OCI", () => {
    const fixture = makeFixture();
    try {
      const decision = decisionWithRefs(101, [
        { type: "open_cognitive_item", id: fixture.ociEntityUuid },
      ]);
      const result = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: OWNER_ID,
        decision,
        derivedFrom: "reactive",
        nowIso: "2026-01-01T00:00:00.000Z",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.status).toBe("recorded");
      if (result.status !== "recorded") return;
      expect(result.replayed).toBe(false);
      expect(result.intent.purposes).toEqual(["sandbox_verify_build_health"]);
      expect(result.intent.deterministic).toBe(true);
      expect(result.intent.groundedRefs).toEqual([
        { type: "open_cognitive_item", id: fixture.ociEntityUuid },
      ]);
      expect(result.task.maxModelCalls).toBe(0);
      expect(result.task.allowedRecipeIds).toEqual(["verify:agent-tsc"]);
      expect(result.task.allowedCapabilities).toEqual([
        "fixed_lint_verification_recipe",
      ]);
      expect(result.task.role).toBe("sandbox_operator_light");
      expect(result.task.ownerId).toBe(OWNER_ID);

      const rows = listSandboxTaskAdmissions(fixture.db, OWNER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "recorded",
        derivedFrom: "reactive",
        decisionId: 101,
        purposes: ["sandbox_verify_build_health"],
        profileKey: "verify-build-health",
        profileRecipeIds: ["verify:agent-tsc"],
        evidenceRefs: [fixture.ociEntityUuid],
        refusalCode: null,
        buildIdentity: currentBuildIdentity(),
        recordedAt: "2026-01-01T00:00:00.000Z",
      });
    } finally {
      closeFixture(fixture);
    }
  });

  it("is replay-safe: the same intent id records a single ledger row", () => {
    const fixture = makeFixture();
    try {
      const decision = decisionWithRefs(102, [
        { type: "open_cognitive_item", id: fixture.ociEntityUuid },
      ]);
      const first = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: OWNER_ID,
        decision,
        derivedFrom: "proactive",
      });
      const second = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: OWNER_ID,
        decision,
        derivedFrom: "proactive",
      });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.status).toBe("recorded");
      expect(second.admissionId).toBe(first.admissionId);
      expect(listSandboxTaskAdmissions(fixture.db, OWNER_ID)).toHaveLength(1);
    } finally {
      closeFixture(fixture);
    }
  });

  it("refuses with a durable ledger row when the OCI is redacted", () => {
    const fixture = makeFixture();
    try {
      applyForgetTargets(fixture.db, OWNER_ID, [
        {
          entityType: "questions",
          entityUuid: fixture.questionEntityUuid,
          action: "redact",
        },
      ]);
      const item = getOpenCognitiveItem(fixture.db, OWNER_ID, fixture.ociEntityUuid);
      expect(item?.status).toBe("WITHDRAWN");
      const decision = decisionWithRefs(103, [
        { type: "open_cognitive_item", id: fixture.ociEntityUuid },
      ]);
      const result = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: OWNER_ID,
        decision,
        derivedFrom: "reactive",
      });
      expect(result.status).toBe("refused");
      if (result.status !== "refused") return;
      expect(result.refusalCode).toBe("no_grounded_evidence");
      const rows = listSandboxTaskAdmissions(fixture.db, OWNER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "refused",
        refusalCode: "no_grounded_evidence",
        profileKey: "",
      });
    } finally {
      closeFixture(fixture);
    }
  });

  it("refuses when the OCI source row no longer exists", () => {
    const fixture = makeFixture();
    try {
      fixture.db
        .prepare(`UPDATE open_cognitive_items SET source_id = '999999' WHERE entity_uuid = ?`)
        .run(fixture.ociEntityUuid);
      const decision = decisionWithRefs(104, [
        { type: "open_cognitive_item", id: fixture.ociEntityUuid },
      ]);
      const result = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: OWNER_ID,
        decision,
        derivedFrom: "proactive",
      });
      expect(result.status).toBe("refused");
      if (result.status !== "refused") return;
      expect(result.refusalCode).toBe("no_grounded_evidence");
    } finally {
      closeFixture(fixture);
    }
  });

  it("refuses when the OCI belongs to a different owner", () => {
    const fixture = makeFixture();
    try {
      const decision = decisionWithRefs(105, [
        { type: "open_cognitive_item", id: fixture.ociEntityUuid },
      ]);
      const result = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: "other-owner",
        decision,
        derivedFrom: "reactive",
      });
      expect(result.status).toBe("refused");
      if (result.status !== "refused") return;
      expect(result.refusalCode).toBe("no_grounded_evidence");
    } finally {
      closeFixture(fixture);
    }
  });

  it("refuses a decision with no OCI evidence refs", () => {
    const fixture = makeFixture();
    try {
      const decision = decisionWithRefs(106, [{ type: "message", id: "m1" }]);
      const result = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: OWNER_ID,
        decision,
        derivedFrom: "reactive",
      });
      expect(result.status).toBe("refused");
      if (result.status !== "refused") return;
      expect(result.refusalCode).toBe("no_grounded_evidence");
      expect(result.intent.purposes).toEqual([]);
    } finally {
      closeFixture(fixture);
    }
  });

  it("refuses when the OCI kind cannot produce an effect purpose", () => {
    const fixture = makeFixture();
    try {
      fixture.db
        .prepare(`UPDATE open_cognitive_items SET kind = 'revisit' WHERE entity_uuid = ?`)
        .run(fixture.ociEntityUuid);
      const decision = decisionWithRefs(107, [
        { type: "open_cognitive_item", id: fixture.ociEntityUuid },
      ]);
      const result = admitSandboxTaskIntent({
        db: fixture.db,
        ownerId: OWNER_ID,
        decision,
        derivedFrom: "reactive",
      });
      expect(result.status).toBe("refused");
      if (result.status !== "refused") return;
      expect(result.refusalCode).toBe("no_effect_purpose");
    } finally {
      closeFixture(fixture);
    }
  });

  it("treats the verify purpose as the only supported profile", () => {
    expect(Object.keys(SANDBOX_EFFECT_PROFILES).sort()).toEqual([
      "sandbox_verify_build_health",
    ]);
    const profile = purposeProfile("sandbox_verify_build_health");
    expect(profile?.profileKey).toBe("verify-build-health");
    expect(profile?.recipeIds).toEqual(["verify:agent-tsc"]);
    expect(profile?.capabilities).toEqual(["fixed_lint_verification_recipe"]);
    expect(verifyEffectProfile(profile!)).toBe(true);
    expect(purposeProfile("sandbox_test_quality")).toBeNull();
  });

  it("fails closed when a profile references an unbounded recipe", () => {
    expect(
      verifyEffectProfile({
        profileKey: "custom",
        recipeIds: ["custom:anything"],
        capabilities: ["fixed_lint_verification_recipe"],
        objective: "x",
      }),
    ).toBe(false);
    expect(
      verifyEffectProfile({
        profileKey: "non-safe",
        recipeIds: ["verify:agent-tsc"],
        capabilities: ["arbitrary_command"],
        objective: "x",
      }),
    ).toBe(false);
  });

  it("throws on a decision without a materialized decision id", () => {
    const fixture = makeFixture();
    try {
      const decision = decisionWithRefs(0, []);
      delete decision.id;
      expect(() =>
        admitSandboxTaskIntent({
          db: fixture.db,
          ownerId: OWNER_ID,
          decision,
          derivedFrom: "reactive",
        }),
      ).toThrow("admission_requires_decision_id");
    } finally {
      closeFixture(fixture);
    }
  });
});
