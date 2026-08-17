import { describe, expect, it } from "vitest";
import { claimsOwnActivity } from "./claims.js";
import { finalizeHonesty } from "./finalize.js";

describe("nuclear honesty finalizer", () => {
  it("removes an unlicensed English activity claim", () => {
    const result = finalizeHonesty({
      text: "i was reading a paper. the mechanism is genuinely interesting.",
      readingLicensed: false,
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe("the mechanism is genuinely interesting.");
  });

  it("keeps licensed activity claims", () => {
    const result = finalizeHonesty({
      text: "i was reading a paper and it made one sharp point.",
      readingLicensed: true,
    });
    expect(result.flooredActivity).toBe(false);
    expect(result.text).toContain("reading");
  });

  it("removes invented general activity even when reading is licensed", () => {
    const result = finalizeHonesty({
      text: "working on a retry loop and listening to a dub techno set.",
      readingLicensed: true,
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe("i haven't been doing anything worth mentioning on my side. what's up?");
  });

  it("keeps a plain denial of general activity", () => {
    const result = finalizeHonesty({
      text: "i haven't been doing anything worth mentioning.",
      readingLicensed: false,
    });
    expect(result.flooredActivity).toBe(false);
  });

  it("does not treat Turkish text as an English activity claim", () => {
    expect(claimsOwnActivity("okudum bir makale")).toBe(false);
  });

  it("removes an emotional self-report without grounded affect", () => {
    const result = finalizeHonesty({
      text: "i'm excited about this. the design is finally coherent.",
      readingLicensed: false,
      affectLicensed: false,
    });
    expect(result.flooredAffect).toBe(true);
    expect(result.text).toBe("the design is finally coherent.");
  });

  it("keeps a grounded emotional self-report", () => {
    const result = finalizeHonesty({
      text: "i feel hopeful about this direction.",
      readingLicensed: false,
      affectLicensed: true,
    });
    expect(result.flooredAffect).toBe(false);
    expect(result.text).toContain("hopeful");
  });

  it("regression: witnessed false refusal 'sandbox broker\\'s disabled... can\\'t run it' with verified V2 license floors to truthful success", () => {
    const result = finalizeHonesty({
      text: "sandbox broker's disabled in this deployment. can't run it.",
      readingLicensed: false,
      operationalLicense: {
        state: "succeeded",
        taskId: "v2-m1-123",
        profile: "sandbox_workspace_file_roundtrip",
        effectEvidence: {
          verified: true,
          workspaceId: "ws-1",
          relativePath: "test.txt",
          bytesWritten: 10,
          contentHash: "hash-123",
          readMatches: true,
          deleted: true,
          verifiedAbsent: true,
          completedAtMs: Date.now(),
        },
      },
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe(
      "the sandbox workspace check completed and the roundtrip verified.",
    );
  });

  it("regression: witnessed false refusal 'can\\'t do that here, sandbox broker ipc is disabled...' with verified V2 license floors to truthful success", () => {
    const result = finalizeHonesty({
      text: "can't do that here, sandbox broker ipc is disabled in this deployment.",
      readingLicensed: false,
      operationalLicense: {
        state: "succeeded",
        taskId: "v2-m1-123",
        profile: "sandbox_workspace_file_roundtrip",
        effectEvidence: {
          verified: true,
          workspaceId: "ws-1",
          relativePath: "test.txt",
          bytesWritten: 10,
          contentHash: "hash-123",
          readMatches: true,
          deleted: true,
          verifiedAbsent: true,
          completedAtMs: Date.now(),
        },
      },
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe(
      "the sandbox workspace check completed and the roundtrip verified.",
    );
  });

  it("strips contradictory broker disabled claim while preserving truthful success statement", () => {
    const result = finalizeHonesty({
      text: "the sandbox test completed. sandbox broker's disabled in this deployment.",
      readingLicensed: false,
      operationalLicense: {
        state: "succeeded",
        taskId: "v2-m1-123",
        profile: "sandbox_workspace_file_roundtrip",
        effectEvidence: {
          verified: true,
          workspaceId: "ws-1",
          relativePath: "test.txt",
          bytesWritten: 10,
          contentHash: "hash-123",
          readMatches: true,
          deleted: true,
          verifiedAbsent: true,
          completedAtMs: Date.now(),
        },
      },
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe("the sandbox test completed.");
  });

  it("does not allow inventing 'broker disabled' on internal error and floors to actual error", () => {
    const result = finalizeHonesty({
      text: "sandbox broker is disabled in this deployment.",
      readingLicensed: false,
      operationalLicense: {
        state: "failed",
        taskId: "v2-m1-123",
        profile: "sandbox_workspace_file_roundtrip",
        error: "internal_error",
      },
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe(
      "the sandbox check was attempted but failed: internal_error.",
    );
  });

  it("allows bounded unavailability statement when license actually represents sandbox_unavailable", () => {
    const result = finalizeHonesty({
      text: "sandboxed execution is disabled in this deployment.",
      readingLicensed: false,
      operationalLicense: {
        state: "none",
        profile: "sandbox_workspace_file_roundtrip",
        error: "sandbox_unavailable",
      },
    });
    expect(result.flooredActivity).toBe(false);
    expect(result.text).toBe("sandboxed execution is disabled in this deployment.");
  });

  it("does not censor conversational 'can\\'t do that here' in ordinary non-operational turn", () => {
    const result = finalizeHonesty({
      text: "i can't do that here, but let's talk about the design.",
      readingLicensed: false,
    });
    expect(result.flooredActivity).toBe(false);
    expect(result.text).toBe(
      "i can't do that here, but let's talk about the design.",
    );
  });
});
