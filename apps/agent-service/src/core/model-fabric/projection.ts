import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../model-routing/types.js";
import { freezeDeep, sha256, sha256Text } from "./hash.js";
import type {
  ContextPolicyId,
  ContextProjection,
  MediaRef,
  ModelContentPart,
  ModelPurposeId,
  ProjectionClassification,
  ProjectionContentBinding,
  ProjectionTelemetryFingerprint,
} from "./types.js";

export type ContextProjectionInput = {
  purpose: ModelPurposeId;
  contextPolicyId: string;
  messages: readonly ChatMessage[];
  bounds?: Partial<ContextProjection["bounds"]>;
  privacyPolicyId?: string;
};

const DEFAULT_BOUNDS = {
  maxParts: 512,
  maxUtf8Bytes: 4_000_000,
  maxEstimatedTokens: 1_000_000,
  maxMediaBytes: 100_000_000,
};

function roleFor(message: ChatMessage): "instruction" | "user" | "assistant" {
  return message.role === "system" ? "instruction" : message.role;
}

function classificationFor(message: ChatMessage): ProjectionClassification {
  return message.role === "system" ? "system_private" : "owner_private";
}

function mediaRefFor(url: string): MediaRef {
  const contentHash = `sha256:${sha256Text(url)}`;
  const comma = url.indexOf(",");
  const header = comma >= 0 ? url.slice(0, comma) : "";
  const mime = header.match(/^data:([^;,]+)/i)?.[1] ?? "application/octet-stream";
  const encoded = comma >= 0 ? url.slice(comma + 1) : url;
  return {
    artifactEntityUuid: `inline:${contentHash.slice(7, 23)}`,
    contentHash,
    mime,
    byteSize: Math.ceil((encoded.length * 3) / 4),
    retentionUntilMs: null,
    representation: "source_attachment",
    parentArtifactEntityUuid: null,
  };
}

function partsFor(messages: readonly ChatMessage[]): ModelContentPart[] {
  const parts: ModelContentPart[] = [];
  for (const message of messages) {
    if (message.content) {
      parts.push({
        kind: "text",
        role: roleFor(message),
        text: message.content,
        classification: classificationFor(message),
      });
    }
    for (const imageUrl of message.imageUrls ?? []) {
      parts.push({
        kind: "image_ref",
        mediaRef: mediaRefFor(imageUrl),
        classification: classificationFor(message),
      });
    }
  }
  return parts;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function sizeBucket(value: number): string {
  if (value === 0) return "0";
  if (value <= 256) return "1-256";
  if (value <= 1024) return "257-1024";
  if (value <= 4096) return "1025-4096";
  if (value <= 16_384) return "4097-16384";
  return "16385+";
}

function telemetryFingerprint(
  purpose: ModelPurposeId,
  contextPolicyId: string,
  parts: readonly ModelContentPart[],
  measured: { parts: number; utf8Bytes: number; estimatedTokens: number; mediaBytes: number },
): ProjectionTelemetryFingerprint {
  const structural = {
    purpose,
    contextPolicyId,
    kinds: parts.map((part) => part.kind),
    classifications: parts.map((part) => part.classification),
    partCount: measured.parts,
    utf8Bytes: sizeBucket(measured.utf8Bytes),
    estimatedTokens: sizeBucket(measured.estimatedTokens),
    mediaBytes: sizeBucket(measured.mediaBytes),
  };
  return `projection_structure_v1:${sha256(structural)}` as ProjectionTelemetryFingerprint;
}

/** Builds an immutable metadata projection without changing provider messages. */
export function createContextProjection(
  input: ContextProjectionInput,
): ContextProjection {
  const bounds = {
    ...DEFAULT_BOUNDS,
    ...(input.bounds ?? {}),
  };
  const rawParts = partsFor(input.messages);
  const parts = rawParts.map((part) => freezeDeep(part));
  const evidenceRefs: [] = [];
  const measured = {
    parts: parts.length,
    utf8Bytes: parts.reduce(
      (sum, part) => sum + (part.kind === "text" ? utf8Bytes(part.text) : 0),
      0,
    ),
    estimatedTokens: Math.ceil(
      parts.reduce(
        (sum, part) => sum + (part.kind === "text" ? utf8Bytes(part.text) : 0),
        0,
      ) / 4,
    ),
    mediaBytes: parts.reduce(
      (sum, part) =>
        sum + (part.kind === "image_ref" ? part.mediaRef.byteSize : 0),
      0,
    ),
  };
  const contentBinding: ProjectionContentBinding = {
    canonicalization: "context_projection_content_v1",
    algorithm: "sha256",
    value: `sha256:${sha256({
      purpose: input.purpose,
      contextPolicyId: input.contextPolicyId,
      parts,
      evidenceRefs,
      bounds,
    })}`,
    privacyPolicyId: input.privacyPolicyId ?? input.contextPolicyId,
  };
  const projection: ContextProjection = {
    projectionId: randomUUID() as ContextProjection["projectionId"],
    contextPolicyId: input.contextPolicyId as ContextPolicyId,
    purpose: input.purpose,
    parts,
    evidenceRefs,
    contentBinding,
    telemetryFingerprint: telemetryFingerprint(
      input.purpose,
      input.contextPolicyId,
      parts,
      measured,
    ),
    bounds,
    measured,
  };
  return freezeDeep(projection);
}
