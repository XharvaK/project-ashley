import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  fetchTaskReceipt,
  fetchTaskResult,
  readArtifact,
  submitSourceDiff,
  submitSourcePrepare,
  submitSourceVerify,
  type ApprovalEnvelopeLike,
  type BrokerClientTransport,
} from "../broker-client.js";
import { markStaleBase, quarantineProposal } from "../lifecycle.js";
import { scanProposalText } from "../secret-guard.js";
import {
  appendChangeProposalEvent,
  setTestReceiptRefs,
} from "../store.js";
import type { TestReceiptRef } from "../types.js";
import { attachSystemReceipt, deriveVerified } from "../verification.js";
import {
  shouldExcludePath,
  validateArchiveSize,
  type ArchiveManifest,
} from "./archive.js";
import { rejectUnsafePatch } from "./patch-guard.js";
import { compareBase } from "./stale-base.js";

export type RepositorySnapshot = {
  baseCommit: string;
  baseTreeHash: string;
  repositoryIdentity: string;
  sourceCleanliness: "clean" | "dirty_blocked" | "dirty_explicit_manifest";
};

export type ArchiveSegmentInput = {
  relativePath: string;
  bytes: Buffer;
};

export function captureRepositorySnapshot(input: {
  baseCommit: string;
  baseTreeHash: string;
  repositoryIdentity: string;
  dirty: boolean;
  explicitDirtyManifest?: boolean;
}): RepositorySnapshot {
  const sourceCleanliness = input.dirty
    ? input.explicitDirtyManifest
      ? "dirty_explicit_manifest"
      : "dirty_blocked"
    : "clean";
  return {
    baseCommit: input.baseCommit,
    baseTreeHash: input.baseTreeHash,
    repositoryIdentity: input.repositoryIdentity,
    sourceCleanliness,
  };
}

export function buildArchiveManifest(segments: ArchiveSegmentInput[]): ArchiveManifest {
  const excludedPaths: string[] = [];
  const included: ArchiveSegmentInput[] = [];
  let totalBytes = 0;
  for (const segment of segments) {
    if (shouldExcludePath(segment.relativePath)) {
      excludedPaths.push(segment.relativePath);
      continue;
    }
    totalBytes += segment.bytes.length;
    included.push(segment);
  }
  const sizeCheck = validateArchiveSize(totalBytes);
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.reason);
  }
  const manifestSegments = included.map((segment, index) => {
    const segmentHash = createHash("sha256").update(segment.bytes).digest("hex");
    return {
      index,
      artifactRef: `segment-${index}`,
      segmentHash,
      byteLength: segment.bytes.length,
    };
  });
  const aggregateHash = createHash("sha256")
    .update(manifestSegments.map((segment) => segment.segmentHash).join(":"))
    .digest("hex");
  return {
    aggregateHash,
    segmentCount: manifestSegments.length,
    segments: manifestSegments,
    excludedPaths,
    excludedPathCount: excludedPaths.length,
  };
}

export function assertBaseStillCurrent(
  db: DatabaseSync,
  ownerId: string,
  entityUuid: string,
  current: { baseCommit: string; baseTreeHash: string },
  stored: { baseCommit: string | null; baseTreeHash: string | null },
  actor: string,
): { ok: true } | { ok: false; errorCode: "stale_base" } {
  if (!compareBase(stored, current)) {
    markStaleBase(
      db,
      ownerId,
      entityUuid,
      actor,
      current.baseCommit,
      current.baseTreeHash,
    );
    return { ok: false, errorCode: "stale_base" };
  }
  return { ok: true };
}

export async function runBrokerVerificationBatch(input: {
  db: DatabaseSync;
  ownerId: string;
  proposalEntityUuid: string;
  transport: BrokerClientTransport;
  currentBase: { baseCommit: string; baseTreeHash: string };
  storedBase: { baseCommit: string | null; baseTreeHash: string | null };
  prepareApproval: ApprovalEnvelopeLike;
  verifyApproval: ApprovalEnvelopeLike;
  diffApproval?: ApprovalEnvelopeLike;
  patchText?: string;
  actor?: string;
}): Promise<
  | { ok: true; receipts: TestReceiptRef[]; prepareState: string; verifyState: string }
  | { ok: false; errorCode: string }
> {
  const actor = input.actor ?? "orchestrator";
  const scan = scanProposalText({
    objective: input.prepareApproval.proposalId ?? "",
    rationale: input.patchText ?? "",
  });
  if (!scan.ok) {
    quarantineProposal(input.db, input.ownerId, input.proposalEntityUuid, scan.reason, actor);
    return { ok: false, errorCode: scan.reason };
  }
  if (input.patchText) {
    const patchCheck = rejectUnsafePatch(input.patchText);
    if (!patchCheck.ok) {
      quarantineProposal(
        input.db,
        input.ownerId,
        input.proposalEntityUuid,
        "patch_unsafe",
        actor,
      );
      return { ok: false, errorCode: "patch_unsafe" };
    }
  }
  const baseCheck = assertBaseStillCurrent(
    input.db,
    input.ownerId,
    input.proposalEntityUuid,
    input.currentBase,
    input.storedBase,
    actor,
  );
  if (!baseCheck.ok) {
    return baseCheck;
  }

  const prepare = submitSourcePrepare(input.transport, input.prepareApproval);
  if (!prepare.ok) {
    return { ok: false, errorCode: prepare.errorCode };
  }
  appendChangeProposalEvent(input.db, {
    ownerId: input.ownerId,
    proposalEntityUuid: input.proposalEntityUuid,
    eventType: "source_prepare_submitted",
    actor,
    payload: {
      taskId: prepare.data.taskId,
      brokerState: prepare.data.state,
      proposalId: input.prepareApproval.proposalId ?? "",
    },
  });

  const verify = submitSourceVerify(input.transport, input.verifyApproval);
  if (!verify.ok) {
    return { ok: false, errorCode: verify.errorCode };
  }
  const verifyReceipt = fetchTaskReceipt(input.transport, verify.data.taskId);
  if (!verifyReceipt.ok) {
    return { ok: false, errorCode: verifyReceipt.errorCode };
  }

  const receipts: TestReceiptRef[] = [];
  const verifyStatus =
    verifyReceipt.data.state === "unsupported"
      ? "unsupported"
      : verifyReceipt.data.state === "succeeded" && verifyReceipt.data.exitCode === 0
        ? "succeeded"
        : "failed";
  const verifyRef: TestReceiptRef = {
    artifactRef: `receipt:${verify.data.taskId}`,
    entityUuid: input.proposalEntityUuid,
    taskId: verify.data.taskId,
    verified: false,
    verifyStatus,
    recipeId: input.verifyApproval.recipeId,
    contentHash: verifyReceipt.data.state,
  };
  const derived = deriveVerified({
    brokerState: verifyReceipt.data.state,
    exitCode: verifyReceipt.data.exitCode,
    recipeId: input.verifyApproval.recipeId ?? "",
    receiptArtifactHash: verifyRef.contentHash ?? "",
    storedArtifactHash: verifyRef.contentHash ?? "",
  });
  verifyRef.verified = derived.verified;
  verifyRef.verifyStatus = derived.verifyStatus;
  receipts.push(verifyRef);

  if (input.diffApproval) {
    const diff = submitSourceDiff(input.transport, input.diffApproval);
    if (diff.ok) {
      const diffReceipt = fetchTaskReceipt(input.transport, diff.data.taskId);
      if (diffReceipt.ok && diffReceipt.data.state === "succeeded") {
        const diffResult = fetchTaskResult(input.transport, diff.data.taskId);
        if (diffResult.ok && diffResult.data.stdout) {
          const patchRead = readArtifact(
            input.transport,
            input.ownerId,
            diffResult.data.stdout,
          );
          if (patchRead.ok) {
            const patchText = Buffer.from(patchRead.data.dataBase64, "base64").toString("utf8");
            const patchGuard = rejectUnsafePatch(patchText);
            if (!patchGuard.ok) {
              quarantineProposal(
                input.db,
                input.ownerId,
                input.proposalEntityUuid,
                "patch_unsafe",
                actor,
              );
              return { ok: false, errorCode: "patch_unsafe" };
            }
          }
        }
      }
    }
  }

  const attached = attachSystemReceipt(receipts, verifyRef);
  setTestReceiptRefs(input.db, input.ownerId, input.proposalEntityUuid, attached);
  appendChangeProposalEvent(input.db, {
    ownerId: input.ownerId,
    proposalEntityUuid: input.proposalEntityUuid,
    eventType: "verification_recorded",
    actor,
    payload: {
      taskId: verify.data.taskId,
      recipeId: input.verifyApproval.recipeId ?? "",
      verifyStatus: verifyRef.verifyStatus,
      brokerState: verifyReceipt.data.state,
    },
  });

  return {
    ok: true,
    receipts: attached,
    prepareState: prepare.data.state,
    verifyState: verifyReceipt.data.state,
  };
}
