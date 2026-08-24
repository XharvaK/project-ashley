import { describe, expect, it } from "vitest";
import { parseCandidateAuthorshipRequest } from "./thought.js";

describe("parseCandidateAuthorshipRequest", () => {
  it("accepts a valid request when workspaceId is omitted", () => {
    const res = parseCandidateAuthorshipRequest({
      operation: "changeset.author",
      projectId: "project-ashley",
      objective: "seal candidate workspace",
      rationale: "owner requested candidate change-set sealing",
      riskClass: "low",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected success");
    expect(res.request).toEqual({
      operation: "changeset.author",
      projectId: "project-ashley",
      objective: "seal candidate workspace",
      rationale: "owner requested candidate change-set sealing",
      riskClass: "low",
    });
    expect(res.request.workspaceId).toBeUndefined();
  });

  it("accepts a valid request when workspaceId is explicitly provided", () => {
    const res = parseCandidateAuthorshipRequest({
      operation: "changeset.author",
      projectId: "project-ashley",
      workspaceId: "ws_valid_000001",
      objective: "seal candidate workspace",
      rationale: "owner requested candidate change-set sealing",
      riskClass: "medium",
      targetArea: "core",
      expectedEffect: "seals workspace delta",
      evidenceRefs: ["ref_1"],
      verificationRecipeIds: ["typescript_fixture_compile_v1"],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected success");
    expect(res.request.workspaceId).toBe("ws_valid_000001");
    expect(res.request.riskClass).toBe("medium");
    expect(res.request.targetArea).toBe("core");
    expect(res.request.evidenceRefs).toEqual(["ref_1"]);
  });

  it("rejects an explicit workspaceId that is too short (< 8 chars)", () => {
    const res = parseCandidateAuthorshipRequest({
      operation: "changeset.author",
      projectId: "project-ashley",
      workspaceId: "short",
      objective: "seal candidate workspace",
      rationale: "owner requested candidate change-set sealing",
      riskClass: "low",
    });

    expect(res).toEqual({
      ok: false,
      errorCode: "payload_invalid",
      field: "workspaceId",
    });
  });

  it("rejects forbidden mutation fields", () => {
    for (const forbidden of ["patch", "content", "argv", "apply", "gitWrite", "commit", "merge"]) {
      const res = parseCandidateAuthorshipRequest({
        operation: "changeset.author",
        projectId: "project-ashley",
        objective: "seal candidate workspace",
        rationale: "owner requested candidate change-set sealing",
        riskClass: "low",
        [forbidden]: "malicious",
      });

      expect(res.ok).toBe(false);
    }
  });

  it("rejects missing objective, rationale, or riskClass", () => {
    expect(
      parseCandidateAuthorshipRequest({
        operation: "changeset.author",
        projectId: "project-ashley",
        rationale: "some rationale",
        riskClass: "low",
      }),
    ).toEqual({ ok: false, errorCode: "missing_required_field", field: "objective" });

    expect(
      parseCandidateAuthorshipRequest({
        operation: "changeset.author",
        projectId: "project-ashley",
        objective: "some objective",
        riskClass: "low",
      }),
    ).toEqual({ ok: false, errorCode: "missing_required_field", field: "rationale" });

    expect(
      parseCandidateAuthorshipRequest({
        operation: "changeset.author",
        projectId: "project-ashley",
        objective: "some objective",
        rationale: "some rationale",
      }),
    ).toEqual({ ok: false, errorCode: "missing_required_field", field: "riskClass" });
  });
});
