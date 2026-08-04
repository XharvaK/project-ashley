export const MAX_ARCHIVE_SEGMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TASK_ARCHIVE_BYTES = 50 * 1024 * 1024;

const MANDATORY_EXCLUDES = [
  ".git/",
  "node_modules/",
  "dist/",
  ".env",
  ".pem",
  "credentials",
];

export type ArchiveManifest = {
  aggregateHash: string;
  segmentCount: number;
  segments: Array<{
    index: number;
    artifactRef: string;
    segmentHash: string;
    byteLength: number;
  }>;
  excludedPaths: string[];
  excludedPathCount: number;
};

export function shouldExcludePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return MANDATORY_EXCLUDES.some((rule) => normalized.includes(rule.replace(/\*\*/g, "")));
}

export function validateArchiveSize(totalBytes: number): { ok: true } | { ok: false; reason: "archive_too_large" } {
  if (totalBytes > MAX_TASK_ARCHIVE_BYTES) {
    return { ok: false, reason: "archive_too_large" };
  }
  return { ok: true };
}
