/**
 * Bounded output capture tests (Sandbox Wave 4, Commit 9).
 */

import { describe, expect, it } from "vitest";
import { buildBoundedCapture, redactExecutionOutput } from "../index.js";

describe("redactExecutionOutput", () => {
  it("1. redacts sk- style secrets", () => {
    expect(redactExecutionOutput("key=sk-abcdef1234567890xyz")).toContain(
      "[redacted-credential]",
    );
    expect(redactExecutionOutput("key=sk-abcdef1234567890xyz")).not.toContain("sk-");
  });

  it("2. redacts GitHub PAT style secrets", () => {
    const out = redactExecutionOutput("token=ghp_ABCDEFGHIJ1234567890");
    expect(out).toContain("[redacted-credential]");
    expect(out).not.toContain("ghp_");
  });

  it("3. redacts AWS access key style secrets", () => {
    const out = redactExecutionOutput("AKIAIOSFODNN7EXAMPLE");
    expect(out).toContain("[redacted-credential]");
  });

  it("4. redacts Slack token style secrets", () => {
    const out = redactExecutionOutput("xoxb-12345678-abcdefgh");
    expect(out).toContain("[redacted-credential]");
  });

  it("5. redacts bearer JWTs", () => {
    const out = redactExecutionOutput("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def");
    expect(out).toContain("[redacted-credential]");
    expect(out).not.toContain("eyJ");
  });

  it("6. redacts PEM private keys", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQ==\n-----END PRIVATE KEY-----";
    const out = redactExecutionOutput(pem);
    expect(out).not.toContain("BEGIN PRIVATE KEY");
    expect(out).toContain("[redacted-credential]");
  });

  it("7. redacts .env path references", () => {
    const out = redactExecutionOutput("reading /home/doc/.composer-assistant/.env");
    expect(out).not.toContain(".env");
    expect(out).toContain("[redacted-credential-path]");
  });

  it("8. redacts ssh key and aws credential path references", () => {
    expect(redactExecutionOutput("/home/doc/.ssh/id_rsa")).toContain(
      "[redacted-credential-path]",
    );
    expect(redactExecutionOutput("/home/doc/.aws/credentials")).toContain(
      "[redacted-credential-path]",
    );
    expect(redactExecutionOutput("/home/doc/.git-credentials")).toContain(
      "[redacted-credential-path]",
    );
  });

  it("9. leaves benign output untouched", () => {
    const benign = "clean output with # comments and {braces}";
    expect(redactExecutionOutput(benign)).toBe(benign);
  });
});

describe("buildBoundedCapture", () => {
  it("10. splits the combined budget evenly across streams", () => {
    const capture = buildBoundedCapture("a".repeat(200), "b".repeat(200), 400);
    expect(capture.truncated).toBe(false);
    expect(capture.stdoutBytes).toBe(200);
    expect(capture.stderrBytes).toBe(200);
  });

  it("11. truncates a stream that exceeds its half of the budget", () => {
    const capture = buildBoundedCapture("a".repeat(300), "b".repeat(50), 400);
    expect(capture.truncated).toBe(true);
    expect(capture.stdoutBytes).toBe(200);
    expect(capture.stderrBytes).toBe(50);
  });

  it("12. truncation is byte-budgeted, not char-budgeted", () => {
    const wide = "界".repeat(100);
    const capture = buildBoundedCapture(wide, "", 80);
    expect(capture.truncated).toBe(true);
    expect(capture.stdoutBytes).toBeLessThanOrEqual(40);
  });

  it("13. produces deterministic hashes for identical inputs", () => {
    const a = buildBoundedCapture("same", "same", 1000);
    const b = buildBoundedCapture("same", "same", 1000);
    expect(a.stdoutHash).toBe(b.stdoutHash);
    expect(a.stderrHash).toBe(b.stderrHash);
  });

  it("14. hashes the redacted content, never the raw secrets", () => {
    const raw = buildBoundedCapture("sk-abcdef1234567890xyz", "", 1000);
    const redacted = buildBoundedCapture("[redacted-credential]", "", 1000);
    expect(raw.stdoutHash).toBe(redacted.stdoutHash);
  });

  it("15. hashes differ when content differs", () => {
    const a = buildBoundedCapture("one", "", 1000);
    const b = buildBoundedCapture("two", "", 1000);
    expect(a.stdoutHash).not.toBe(b.stdoutHash);
  });

  it("16. empty streams produce empty hashes", () => {
    const capture = buildBoundedCapture("", "", 1000);
    expect(capture.stdout).toBe("");
    expect(capture.stderr).toBe("");
    expect(capture.truncated).toBe(false);
  });

  it("17. a tiny budget still yields a bounded result", () => {
    const capture = buildBoundedCapture("lots of text here", "more", 2);
    expect(capture.stdoutBytes).toBeLessThanOrEqual(1);
    expect(capture.truncated).toBe(true);
  });

  it("18. redaction applies to both streams", () => {
    const capture = buildBoundedCapture("ok", "token ghp_ABCDEFGHIJ1234567890", 1000);
    expect(capture.stderr).not.toContain("ghp_");
    expect(capture.stdout).toBe("ok");
  });
});
