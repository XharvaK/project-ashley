import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { capabilityProfileFor } from "./profiles.js";
import { currentPortfolio } from "./portfolio.js";
import {
  createCouplingPreflight,
  loadActivationRef,
  readActivePointer,
  resolveActivePolicy,
  validateActivation,
  validateRollbackProvenance,
  writeActivePointerAtomic,
  writeImmutableArtifact,
  writeOwnerActivation,
  writeOwnerArtifact,
  type ActivationRef,
  type ActivePointer,
  type OwnerApprovalRef,
  type StewardshipConsultationRecord,
} from "./activation.js";
import { loadTargetPortfolio } from "./catalog.js";

const targetPortfolio = loadTargetPortfolio();
const targetRow = targetPortfolio.rows.find(
  (row) => row.policyRowId === "mfr_thought_interactive_target_v1",
)!;
const targetOccupant = targetRow.occupants[0]!;
const profile = capabilityProfileFor(
  targetOccupant.provider,
  targetOccupant.configuredModelId,
);
const inferenceFingerprint = `sha256:${"a".repeat(64)}`;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function controlRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ashley-model-fabric-act-fixture-"));
  roots.push(root);
  return root;
}

function qualification(overrides: Record<string, unknown> = {}) {
  return {
    schema: "ashley.evaluation.qualification_result.v1" as const,
    qualificationResultId: "qres_target_thought_interactive_fixture",
    status: "PASS" as const,
    policyRowId: targetRow.policyRowId,
    occupantId: targetOccupant.occupantId,
    subject: {
      logicalRole: targetRow.logicalRole,
      seat: targetRow.seat,
      materialInferenceFingerprint: inferenceFingerprint,
    },
    profileBinding: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      profileFingerprint: profile.profileFingerprint,
      provider: profile.provider,
      configuredModelId: profile.configuredModelId,
    },
    identityContinuityEpoch: null,
    recommendation: "owner_review",
    limitations: [],
    invalidated: false,
    invalidatedBy: null,
    ...overrides,
  };
}

function consultation(): StewardshipConsultationRecord {
  return {
    schema: "ashley.stewardship.consultation.v1",
    consultationId: "scc_target_family_fixture",
    clause: "SC-CON-04",
    matterClass: "model_family_activation",
    subject: "groq openai/gpt-oss-120b Thought fixture",
    doesNotActivate: true,
    ashleyPositionStatus: "recorded",
    ashleyPosition: "affirm",
    ashleyRationale: "fixture only",
    ashleyDecidedAt: "2026-08-25T00:00:00.000Z",
    docDecision: "approve",
    docRationale: "fixture only",
    docDecidedAt: "2026-08-25T00:00:00.000Z",
  };
}

function approval(
  overrides: Partial<OwnerApprovalRef> = {},
): OwnerApprovalRef {
  return {
    schema: "ashley.model_fabric.owner_approval_ref.v1",
    ownerApprovalRefId: "oap_target_thought_interactive_fixture",
    decision: "approve",
    qualificationResultId: "qres_target_thought_interactive_fixture",
    logicalRole: targetRow.logicalRole,
    seat: targetRow.seat,
    policyRowId: targetRow.policyRowId,
    occupantId: targetOccupant.occupantId,
    portfolioRevisionId: targetPortfolio.portfolioRevisionId,
    consultationId: consultation().consultationId,
    createdBy: "owner",
    createdAt: "2026-08-25T00:00:00.000Z",
    revokesOwnerApprovalRefId: null,
    artifactKind: "fixture",
    ...overrides,
  };
}

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    ...createCouplingPreflight({
      couplingPreflightId: "cpf_target_thought_fixture",
      policyRow: targetRow,
      activeRows: currentPortfolio().rows,
      ownerAcknowledged: false,
    }),
    ...overrides,
  };
}

function activation(
  overrides: Partial<ActivationRef> = {},
): ActivationRef {
  return {
    schema: "ashley.model_fabric.activation_ref.v1",
    activationRefId: "act_target_thought_interactive_fixture",
    kind: "activate",
    policyRowId: targetRow.policyRowId,
    portfolioRevisionId: targetPortfolio.portfolioRevisionId,
    ownerApprovalRefIds: [approval().ownerApprovalRefId],
    occupantsActivated: [targetOccupant.occupantId],
    couplingPreflightId: "cpf_target_thought_fixture",
    rollbackOfActivationRefId: null,
    createdBy: "owner",
    createdAt: "2026-08-25T00:00:00.000Z",
    revokesActivationRefId: null,
    artifactKind: "fixture",
    ...overrides,
  };
}

function pointer(
  activationRefId = activation().activationRefId,
  generation = 1,
): ActivePointer {
  return {
    schema: "ashley.model_fabric.active_pointer.v1",
    pointerGeneration: generation,
    replacedPointerGeneration: generation - 1,
    rows: { thought: { interactive: activationRefId } },
    artifactKind: "fixture",
  };
}

function writeQualification(root: string, value = qualification()): void {
  writeImmutableArtifact({
    controlDir: root,
    directory: "qualifications",
    id: value.qualificationResultId,
    artifact: value,
    controlRootMode: "fixture",
  });
}

function writeConsultation(root: string, value = consultation()): void {
  writeImmutableArtifact({
    controlDir: root,
    directory: "consultations",
    id: value.consultationId,
    artifact: value,
    controlRootMode: "fixture",
  });
}

function writeApproval(root: string, value = approval()): void {
  writeOwnerArtifact({
    controlDir: root,
    artifact: value,
    authorization: { ownerAuthenticated: true, controlRootMode: "fixture" },
  });
}

function writeValidActivation(root: string): void {
  writeQualification(root);
  writeConsultation(root);
  writeImmutableArtifact({
    controlDir: root,
    directory: "preflights",
    id: "cpf_target_thought_fixture",
    artifact: preflight(),
    controlRootMode: "fixture",
  });
  writeApproval(root);
  writeOwnerActivation({
    controlDir: root,
    activation: activation(),
    pointer: pointer(),
    targetPortfolio,
    qualifications: [qualification()],
    approvals: [approval()],
    consultations: [consultation()],
    preflights: [preflight()],
    authorization: { ownerAuthenticated: true, controlRootMode: "fixture" },
  });
}

describe("MF-ACT activation mechanics", () => {
  it("keeps approval without activation on current compatibility", () => {
    const root = controlRoot();
    writeQualification(root);
    writeConsultation(root);
    writeApproval(root);

    const resolved = resolveActivePolicy({
      controlDir: root,
      controlRootMode: "fixture",
      logicalRole: "thought",
      occupancyKey: "interactive",
    });
    expect(resolved.source).toBe("current_compatibility");
    expect(resolved.row?.portfolioRevisionId).toBe(
      currentPortfolio().portfolioRevisionId,
    );
  });

  it("refuses activation without a matching owner approval", () => {
    expect(() =>
      validateActivation({
        activation: activation(),
        targetPortfolio,
        qualifications: [qualification()],
        approvals: [],
        consultations: [consultation()],
        preflights: [preflight()],
      }),
    ).toThrow("activation_owner_approval_missing");
  });

  it("writes a valid fixture activation and resolves only its selected row", () => {
    const root = controlRoot();
    writeValidActivation(root);

    const resolved = resolveActivePolicy({
      controlDir: root,
      controlRootMode: "fixture",
      logicalRole: "thought",
      occupancyKey: "interactive",
    });
    expect(resolved.source).toBe("activated");
    expect(resolved.activationRefId).toBe(activation().activationRefId);
    expect(resolved.row?.policyRowId).toBe(targetRow.policyRowId);
    expect(resolved.row?.occupants.map((item) => item.occupantId)).toEqual(
      targetRow.occupants.map((item) => item.occupantId),
    );
  });

  it("rejects stale qualification and falls back to current compatibility", () => {
    const root = controlRoot();
    const stale = qualification({ invalidated: true, invalidatedBy: "qrev_1" });
    writeQualification(root, stale);
    writeConsultation(root);
    writeApproval(root);
    writeImmutableArtifact({
      controlDir: root,
      directory: "preflights",
      id: "cpf_target_thought_fixture",
      artifact: preflight(),
      controlRootMode: "fixture",
    });
    expect(() =>
      validateActivation({
        activation: activation(),
        targetPortfolio,
        qualifications: [stale],
        approvals: [approval()],
        consultations: [consultation()],
        preflights: [preflight()],
      }),
    ).toThrow("activation_qualification_invalid");
  });

  it("rejects an unqualified fallback occupant instead of adding it to the chain", () => {
    const second = targetRow.occupants[1]!;
    const secondApproval = approval({
      ownerApprovalRefId: "oap_unqualified_fallback_fixture",
      occupantId: second.occupantId,
      qualificationResultId: "qres_unqualified_fallback_fixture",
    });
    expect(() =>
      validateActivation({
        activation: activation({
          ownerApprovalRefIds: [
            approval().ownerApprovalRefId,
            secondApproval.ownerApprovalRefId,
          ],
          occupantsActivated: [targetOccupant.occupantId, second.occupantId],
        }),
        targetPortfolio,
        qualifications: [qualification()],
        approvals: [approval(), secondApproval],
        consultations: [consultation()],
        preflights: [preflight()],
      }),
    ).toThrow("activation_qualification_missing");
  });

  it("requires coupling acknowledgement when the target row overlaps an active row", () => {
    const targetExpression = targetPortfolio.rows.find(
      (row) => row.logicalRole === "expression" && row.occupancyKey === "default",
    )!;
    const failed = createCouplingPreflight({
      couplingPreflightId: "cpf_expression_overlap_fixture",
      policyRow: targetExpression,
      activeRows: currentPortfolio().rows,
      ownerAcknowledged: false,
    });
    expect(failed.passed).toBe(false);
    expect(failed.overlaps.length).toBeGreaterThan(0);
    expect(() =>
      validateActivation({
        activation: activation({
          policyRowId: targetExpression.policyRowId,
          couplingPreflightId: failed.couplingPreflightId,
        }),
        targetPortfolio,
        qualifications: [qualification()],
        approvals: [approval()],
        consultations: [consultation()],
        preflights: [failed],
      }),
    ).toThrow("coupling_ack_required");
  });

  it("keeps an unselected role on compatibility for partial activation", () => {
    const root = controlRoot();
    writeValidActivation(root);
    const thought = resolveActivePolicy({
      controlDir: root,
      controlRootMode: "fixture",
      logicalRole: "thought",
      occupancyKey: "interactive",
    });
    const expression = resolveActivePolicy({
      controlDir: root,
      controlRootMode: "fixture",
      logicalRole: "expression",
      occupancyKey: "default",
    });
    expect(thought.source).toBe("activated");
    expect(expression.source).toBe("current_compatibility");
    expect(expression.row?.portfolioRevisionId).toBe(
      currentPortfolio().portfolioRevisionId,
    );
  });

  it("ignores a crash-left tmp pointer and keeps the previous pointer", () => {
    const root = controlRoot();
    writeActivePointerAtomic({
      controlDir: root,
      pointer: pointer("act_old_fixture", 1),
      authorization: { ownerAuthenticated: true, controlRootMode: "fixture" },
    });
    writeFileSync(join(root, "active.json.tmp"), JSON.stringify(pointer("act_new_fixture", 2)));

    const loaded = readActivePointer({ controlDir: root, controlRootMode: "fixture" });
    expect(loaded.pointer?.pointerGeneration).toBe(1);
    expect(loaded.pointer?.rows.thought?.interactive).toBe("act_old_fixture");
    expect(existsSync(join(root, "active.json.tmp"))).toBe(true);
  });

  it("requires owner authentication and never mints an owner artifact id", () => {
    const root = controlRoot();
    expect(() =>
      writeActivePointerAtomic({
        controlDir: root,
        pointer: pointer(),
        authorization: { ownerAuthenticated: false, controlRootMode: "fixture" },
      }),
    ).toThrow("owner_authentication_required");
    expect(() =>
      writeOwnerArtifact({
        controlDir: root,
        artifact: approval(),
        authorization: { ownerAuthenticated: false, controlRootMode: "fixture" },
      }),
    ).toThrow("owner_authentication_required");
  });

  it("detects mutation of an immutable ActivationRef", () => {
    const root = controlRoot();
    writeValidActivation(root);
    const path = join(root, "activations", `${activation().activationRefId}.json`);
    const mutated = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    mutated.policyRowId = "mfr_mutated_row";
    writeFileSync(path, JSON.stringify(mutated));
    expect(() => loadActivationRef(root, activation().activationRefId, "fixture")).toThrow(
      "artifact_integrity_mismatch",
    );
  });

  it("does not load fixture activation artifacts from a production control root", () => {
    const root = controlRoot();
    writeValidActivation(root);
    expect(() => loadActivationRef(root, activation().activationRefId, "production")).toThrow(
      "fixture_artifact_in_production_control_dir",
    );
    const resolved = resolveActivePolicy({
      controlDir: root,
      controlRootMode: "production",
      logicalRole: "thought",
      occupancyKey: "interactive",
    });
    expect(resolved.source).toBe("current_compatibility");
  });

  it("requires rollback provenance without mutating the previous ActivationRef", () => {
    const previous = activation({ activationRefId: "act_previous_fixture" });
    const rollback = activation({
      activationRefId: "act_rollback_fixture",
      kind: "rollback",
      rollbackOfActivationRefId: previous.activationRefId,
    });
    expect(() => validateRollbackProvenance({ rollback, previous })).not.toThrow();
    expect(() =>
      validateRollbackProvenance({
        rollback: { ...rollback, rollbackOfActivationRefId: "act_other_fixture" },
        previous,
      }),
    ).toThrow("rollback_provenance_mismatch");
    expect(previous.activationRefId).toBe("act_previous_fixture");
  });
});
