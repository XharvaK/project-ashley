import { describe, expect, it } from "vitest";
import {
  validateSourcePrepareEnvelope,
  sourcePrepareFieldsMatch,
  SOURCE_PREPARE_ARCHIVE_EXTRACTION_DEFERRED,
} from "./source-prepare.js";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";
import { baseApproval, createTestKeys, signedApproval } from "../test/fixtures/keys.js";

describe("source_prepare validation", () => {
  const fields = {
    proposalId: "prop-1",
    baseCommit: "abc123",
    baseTreeHash: "tree456",
    sourceCleanliness: "clean",
    archiveManifestRef: "manifest-ref",
    archiveAggregateHash: "hash789",
    excludeRules: ["**/.env", "**/*.pem"],
    destinationNamespace: "proposal/prop-1",
  };

  const fieldKeys = [
    "proposalId",
    "baseCommit",
    "baseTreeHash",
    "sourceCleanliness",
    "archiveManifestRef",
    "archiveAggregateHash",
    "excludeRules",
    "destinationNamespace",
  ] as const;

  it("requires all eight bound fields", () => {
    const keys = createTestKeys();
    const envelope = signedApproval(keys, {
      scope: "source_prepare",
      ...fields,
    });
    expect(validateSourcePrepareEnvelope(envelope).ok).toBe(true);
  });

  it("rejects drift on any field", () => {
    for (const key of fieldKeys) {
      const drifted =
        key === "excludeRules"
          ? { ...fields, excludeRules: ["**/other"] }
          : { ...fields, [key]: "drifted" };
      expect(sourcePrepareFieldsMatch(fields, drifted).ok).toBe(false);
    }
  });

  it("rejects unsigned source_prepare at broker", () => {
    const { broker } = createTestBroker();
    const unsigned = {
      ...baseApproval({ scope: "source_prepare", taskId: "sp-unsigned", ...fields }),
      signature: undefined,
    };
    const result = broker.taskSubmit({ approval: unsigned }, testCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("missing_signature");
    }
  });

  it("rejects tampered source_prepare signature", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "source_prepare",
      taskId: "sp-tampered",
      argv: undefined,
      cwd: undefined,
      ...fields,
    });
    approval.proposalId = "tampered";
    const result = broker.taskSubmit({ approval }, testCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_signature");
    }
  });

  it("records validation-only audit without extraction", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "source_prepare",
      taskId: "sp-audit",
      nonce: "nonce-sp-audit",
      argv: undefined,
      cwd: undefined,
      ...fields,
    });
    const result = broker.taskSubmit({ approval }, testCtx);
    expect(result.ok).toBe(true);
    const audit = broker.store.auditEvents.find((event) => event.code === "source_prepare_validated");
    expect(audit?.metadata.extractionDeferred).toBe(true);
  });

  it("defers archive extraction explicitly", () => {
    expect(SOURCE_PREPARE_ARCHIVE_EXTRACTION_DEFERRED).toBe(true);
  });

  it("accepts source_prepare task.submit as validated_only", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "source_prepare",
      taskId: "sp-1",
      argv: undefined,
      cwd: undefined,
      ...fields,
    });
    const result = broker.taskSubmit({ approval }, testCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("validated_only");
    }
  });
});
