import { createHash, randomUUID } from "node:crypto";

export function sha256Stable(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256Stable(canonicalize(value));
}

export function newAuthorityId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function normalizePayload(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function payloadHash(text: string): string {
  return sha256Stable(normalizePayload(text));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}
