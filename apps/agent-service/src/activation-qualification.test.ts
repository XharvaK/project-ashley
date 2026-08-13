import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupFixture,
  makeMintFixture,
  readText,
  runActivation,
  type MintFixture,
  writeJson,
} from "./mint-script-test-helpers.js";

const fixtures: MintFixture[] = [];
function fixture(): MintFixture {
  const created = makeMintFixture();
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) cleanupFixture(created);
});

describe("activation qualification and provenance refusal", () => {
  it.each([
    ["missing evidence", "evidence", ""],
    ["malformed evidence", "evidence", "{"],
    ["missing canary", "canary", ""],
    ["malformed canary", "canary", "{"],
  ])("refuses %s before authority mutation", (_label, target, contents) => {
    const created = fixture();
    const targetPath = target === "evidence" ? created.evidence : created.canary;
    writeFileSync(targetPath, contents);
    const result = runActivation(created);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("qualification_evidence_invalid");
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
  });

  it.each([
    ["non-pass canary", "canary-status"],
    ["canary source mismatch", "canary-source"],
    ["evidence source mismatch", "evidence-source"],
  ])("refuses %s before mutation", (_label, mutation) => {
    const created = fixture();
    const canary = JSON.parse(readText(created.canary));
    const evidence = JSON.parse(readText(created.evidence));
    if (mutation === "canary-status") canary.status = "fail";
    if (mutation === "canary-source") canary.sourceCommit = "0".repeat(40);
    if (mutation === "evidence-source") evidence.evidence.sourceCommit = "0".repeat(40);
    writeJson(created.canary, canary);
    writeJson(created.evidence, evidence);
    const result = runActivation(created);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("qualification_evidence_invalid");
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
  });

  it("refuses a one-byte installed runtime mutation before authority mutation", () => {
    const created = fixture();
    writeFileSync(created.broker + "/dist/sibling.js", "mutated\n");
    const result = runActivation(created);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("provenance_mismatch");
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
  });
});
