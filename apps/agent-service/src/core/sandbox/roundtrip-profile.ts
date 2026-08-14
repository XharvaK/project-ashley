/**
 * Deterministic sandbox workspace file roundtrip profile execution (First Reactive Slice).
 *
 * Implements the locked invariants:
 *  1. operates only inside an authorized Sandbox workspace;
 *  2. generates a random nonce and deterministic temporary filename (no model/user paths);
 *  3. writes unique payload via `write_workspace_file`;
 *  4. reads payload back via `read_workspace_file` and verifies exact byte equality;
 *  5. deletes temporary file via `delete_workspace_file`;
 *  6. verifies absence of the deleted file (Receipt != Effect Witness);
 *  7. produces structured `RoundtripEffectEvidence`.
 *
 * Zero model calls, no arbitrary shell, no network access.
 */

import { randomBytes, createHash } from "node:crypto";
import type { EngineeringAction } from "@composer-assistant/sandbox-policy";
import type { OperatorEnvelopeProvider } from "./engineering-operator.js";
import type {
  EngineeringExecutionPort,
  RoundtripEffectEvidence,
} from "./engineering-types.js";

export type ExecuteRoundtripProfileInput = {
  taskId: string;
  workspaceId?: string | null;
  envelopes: OperatorEnvelopeProvider;
  port: EngineeringExecutionPort;
  nowMs: () => number;
};

export type RoundtripProfileResult =
  | {
      ok: true;
      evidence: RoundtripEffectEvidence;
      artifactRefs: string[];
      workspaceId: string;
    }
  | {
      ok: false;
      errorCode: string;
      reason: string;
      workspaceId?: string | null;
    };

export async function executeSandboxWorkspaceFileRoundtrip(
  input: ExecuteRoundtripProfileInput,
): Promise<RoundtripProfileResult> {
  let workspaceId = input.workspaceId ?? null;
  const nowMs = input.nowMs;

  const artifactRefs: string[] = [];
  // Step 1: Ensure workspace exists via broker port
  if (!workspaceId) {
    const requestAction: EngineeringAction = {
      type: "request_workspace",
      fields: { reason: "ephemeral roundtrip check" },
    };
    const envelope = input.envelopes(
      requestAction,
      "candidate_workspace_create",
      nowMs(),
    );
    const res = await input.port.executeAction(requestAction, envelope);
    if (!res.ok) {
      return {
        ok: false,
        errorCode: res.errorCode,
        reason: `workspace_request_failed: ${res.reason}`,
        workspaceId: null,
      };
    }
    if (res.artifactRef) artifactRefs.push(res.artifactRef);
    const data = res.data as Record<string, unknown> | undefined;
    const wsId = data?.workspaceId ?? data?.workspace_id;
    if (!wsId) {
      return {
        ok: false,
        errorCode: "invalid_workspace_response",
        reason: "broker did not return a valid workspaceId",
        workspaceId: null,
      };
    }
    workspaceId = String(wsId);
  }

  // Step 2: Generate deterministic unique filename and payload
  const nonce = randomBytes(8).toString("hex");
  const relativePath = `tmp_check_${nonce}.txt`;
  const uniqueSentence = `Project Ashley verified sandbox workspace file roundtrip nonce=${nonce} at ${new Date(nowMs()).toISOString()}`;
  const contentBase64 = Buffer.from(uniqueSentence, "utf8").toString("base64");
  const contentHash = createHash("sha256").update(uniqueSentence, "utf8").digest("hex");
  const bytesWritten = Buffer.byteLength(uniqueSentence, "utf8");

  // Step 3: Write temporary file
  const writeAction: EngineeringAction = {
    type: "write_workspace_file",
    fields: {
      workspaceId,
      relativePath,
      contentBase64,
    },
  };
  const writeEnvelope = input.envelopes(
    writeAction,
    "candidate_workspace_read_write_delete",
    nowMs(),
  );
  const writeRes = await input.port.executeAction(writeAction, writeEnvelope);
  if (!writeRes.ok) {
    return {
      ok: false,
      errorCode: writeRes.errorCode,
      reason: `write_failed: ${writeRes.reason}`,
      workspaceId,
    };
  }
  if (writeRes.artifactRef) artifactRefs.push(writeRes.artifactRef);

  // Step 4: Read temporary file and verify exact byte equality
  const readAction: EngineeringAction = {
    type: "read_workspace_file",
    fields: {
      workspaceId,
      relativePath,
    },
  };
  const readEnvelope = input.envelopes(
    readAction,
    "candidate_workspace_read_write_delete",
    nowMs(),
  );
  const readRes = await input.port.executeAction(readAction, readEnvelope);
  if (!readRes.ok) {
    return {
      ok: false,
      errorCode: readRes.errorCode,
      reason: `read_failed: ${readRes.reason}`,
      workspaceId,
    };
  }
  if (readRes.artifactRef) artifactRefs.push(readRes.artifactRef);
  const readData = readRes.data as Record<string, unknown> | undefined;
  const base64Content = readData?.contentBase64 ?? readData?.content_base64;
  const readContent =
    base64Content != null
      ? Buffer.from(String(base64Content), "base64").toString("utf8")
      : typeof readData?.content_utf8 === "string"
        ? readData.content_utf8
        : typeof readData?.contentUtf8 === "string"
          ? readData.contentUtf8
          : "";
  if (readContent !== uniqueSentence) {
    return {
      ok: false,
      errorCode: "content_mismatch",
      reason: "read content did not match written content",
      workspaceId,
    };
  }

  // Step 5: Delete temporary file
  const deleteAction: EngineeringAction = {
    type: "delete_workspace_file",
    fields: {
      workspaceId,
      relativePath,
    },
  };
  const deleteEnvelope = input.envelopes(
    deleteAction,
    "candidate_workspace_read_write_delete",
    nowMs(),
  );
  const deleteRes = await input.port.executeAction(deleteAction, deleteEnvelope);
  if (!deleteRes.ok) {
    return {
      ok: false,
      errorCode: deleteRes.errorCode,
      reason: `delete_failed: ${deleteRes.reason}`,
      workspaceId,
    };
  }

  // Step 6: Verify absence of deleted file (Effect Witness)
  const verifyAbsenceRes = await input.port.executeAction(readAction, readEnvelope);
  if (verifyAbsenceRes.ok) {
    return {
      ok: false,
      errorCode: "file_still_present",
      reason: "file was not removed after delete operation",
      workspaceId,
    };
  }

  // Step 7: Emit structured effect evidence
  const evidence: RoundtripEffectEvidence = {
    verified: true,
    workspaceId,
    relativePath,
    bytesWritten,
    contentHash,
    readMatches: true,
    deleted: true,
    verifiedAbsent: true,
    completedAtMs: nowMs(),
  };

  return {
    ok: true,
    evidence,
    artifactRefs,
    workspaceId,
  };
}
