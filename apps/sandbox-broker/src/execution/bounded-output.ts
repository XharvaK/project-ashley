/**
 * Bounded output capture and redaction (Sandbox Wave 4, Commit 9).
 *
 * The process runner already bounds raw capture to the effective output
 * budget; this module applies the receipt-facing post-processing: a
 * deterministic combined-budget cap (never beyond the runner's bound), and
 * credential-shaped redaction so that no raw output, environment value, or
 * secret-shaped substring ever reaches receipts or audit records. The
 * algorithm is deterministic, so hashes over captured output are stable
 * across runs given identical output.
 */

import { sha256Hex } from "../crypto/types.js";

const SECRET_SHAPES =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{8,}|Bearer\s+eyJ[A-Za-z0-9._-]{10,}))/g;

const SECRET_PATH_SHAPES =
  /((^|[\\/])\.env([\\/]|$)|(^|[\\/])id_(rsa|ed25519)([\\/]|$)|(^|[\\/])\.aws[\\/]credentials([\\/]|$)|(^|[\\/])\.git-credentials([\\/]|$))/gi;

/**
 * Redacts credential-shaped substrings (tokens, PEM private keys) and
 * credential-file path references from captured output. Deterministic.
 */
export function redactExecutionOutput(text: string): string {
  return text.replace(SECRET_PATH_SHAPES, "[redacted-credential-path]").replace(
    SECRET_SHAPES,
    "[redacted-credential]",
  );
}

export type BoundedCapture = {
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
  stdoutHash: string;
  stderrHash: string;
};

/**
 * Truncates text to a byte budget without splitting a UTF-8 code point.
 * Returns the original text when it already fits.
 */
function truncateUtf8(text: string, budgetBytes: number): string {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= budgetBytes) return text;
  let slice = Buffer.from(text, "utf8").subarray(0, budgetBytes);
  while (slice.length > 0) {
    const last = slice[slice.length - 1]!;
    if ((last & 0xc0) !== 0x80 && (last & 0xc0) !== 0xc0) break;
    slice = slice.subarray(0, slice.length - 1);
  }
  return slice.toString("utf8");
}

/**
 * Deterministically bounds and redacts captured output to a combined
 * budget. The budget is split evenly between streams; overflow beyond the
 * split marks the capture truncated. Inputs are expected to already be
 * within the runner's per-stream bound.
 */
export function buildBoundedCapture(
  rawStdout: string,
  rawStderr: string,
  combinedBudgetBytes: number,
): BoundedCapture {
  const budget = Math.max(1, Math.floor(combinedBudgetBytes / 2));
  let stdout = rawStdout;
  let stderr = rawStderr;
  let truncated = false;
  if (Buffer.byteLength(stdout, "utf8") > budget) {
    stdout = truncateUtf8(stdout, budget);
    truncated = true;
  }
  if (Buffer.byteLength(stderr, "utf8") > budget) {
    stderr = truncateUtf8(stderr, budget);
    truncated = true;
  }
  const redactedStdout = redactExecutionOutput(stdout);
  const redactedStderr = redactExecutionOutput(stderr);
  return {
    stdout: redactedStdout,
    stderr: redactedStderr,
    stdoutBytes: Buffer.byteLength(redactedStdout, "utf8"),
    stderrBytes: Buffer.byteLength(redactedStderr, "utf8"),
    truncated,
    stdoutHash: sha256Hex(redactedStdout),
    stderrHash: sha256Hex(redactedStderr),
  };
}
