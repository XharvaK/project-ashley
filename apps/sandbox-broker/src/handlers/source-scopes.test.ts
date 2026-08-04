import { describe, expect, it } from "vitest";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";
import { signedApproval } from "../test/fixtures/keys.js";

const sourcePrepareFields = {
  proposalId: "prop-source",
  baseCommit: "abc123",
  baseTreeHash: "tree456",
  sourceCleanliness: "clean",
  archiveManifestRef: "manifest-ref",
  archiveAggregateHash: "hash789",
  excludeRules: ["**/.env"],
  destinationNamespace: "proposal/prop-source",
};

describe("source_verify / source_diff scopes", () => {
  it("returns unsupported for broker-owned recipe marked unsupported", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "source_verify",
      taskId: "verify-unsupported",
      recipeId: "verify:repo-tsc",
      argv: undefined,
      cwd: undefined,
    });
    const result = broker.taskSubmit({ approval }, testCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("unsupported");
    }
    const receipt = broker.taskReceipt({ taskId: "verify-unsupported" });
    expect(receipt.ok).toBe(true);
    if (receipt.ok) {
      expect(receipt.data.state).toBe("failed");
    }
  });

  it("runs supported broker-owned verify recipe without repo package.json authority", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "source_verify",
      taskId: "verify-supported",
      recipeId: "verify:agent-tsc",
      argv: ["npm", "run", "test"],
      cwd: "/repo",
    });
    const result = broker.taskSubmit({ approval }, testCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("running");
    }
  });

  it("produces patch artifact ref via source_diff without executing repo scripts", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "source_diff",
      taskId: "diff-1",
      argv: undefined,
      cwd: undefined,
    });
    const result = broker.taskSubmit({ approval }, testCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("succeeded");
    }
    const fetched = broker.taskResultFetch({ taskId: "diff-1" });
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.data.stdout.length).toBeGreaterThan(0);
    }
  });

  it("keeps source_prepare extraction deferred with validated_only state", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "source_prepare",
      taskId: "prepare-1",
      argv: undefined,
      cwd: undefined,
      ...sourcePrepareFields,
    });
    const result = broker.taskSubmit({ approval }, testCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("validated_only");
    }
  });
});
