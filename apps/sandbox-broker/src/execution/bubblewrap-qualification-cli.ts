import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { ChildProcessRunner } from "../process/real-runner.js";
import {
  createDefaultQualificationManifest,
  runBubblewrapQualification,
  runBubblewrapQualificationCanary,
} from "./bubblewrap-qualification-runner.js";
import type { BubblewrapHostIdentity } from "./bubblewrap-execution-isolation.js";
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  return value?.trim() || undefined;
}
function requiredArgument(name: string): string {
  const value = argument(name);
  if (value === undefined) {
    throw new Error(name + "_missing");
  }
  return value;
}
function commandOutput(command: string, args: readonly string[]): string {
  return String(
    execFileSync(command, [...args], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).trim();
}
function hostIdentity(): BubblewrapHostIdentity {
  const pretty = readFileSync("/etc/os-release", "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("PRETTY_NAME="))
    ?.slice("PRETTY_NAME=".length)
    .replace(/^"|"$/g, "");
  return {
    osRelease: pretty || "unknown",
    kernelRelease: commandOutput("uname", ["-r"]),
    architecture: commandOutput("uname", ["-m"]),
    systemdVersion: commandOutput("systemd", ["--version"]).split(/\r?\n/)[0] || "unknown",
    cgroupMode: existsSync("/sys/fs/cgroup/cgroup.controllers")
      ? "cgroup2fs"

      : "unknown",
  };
}
function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireAbsolute(name: string): string {
  const value = requiredArgument(name);
  if (!value.startsWith("/")) {
    throw new Error(name + "_must_be_absolute");
  }
  return value;
}
async function main(): Promise<void> {
  const sourceCommit = requiredArgument("--source-commit");
  const fixtureRoot = requireAbsolute("--fixture-root");
  const workspaceRoot = requireAbsolute("--workspace-root");
  const probeScript = requireAbsolute("--probe-script");
  const canaryReceiptPathArgument = argument("--canary-receipt-out");
  const canaryReceiptPath =
    canaryReceiptPathArgument === undefined
      ? undefined
      : requireAbsolute("--canary-receipt-out");
  const evidencePath = requireAbsolute("--evidence-out");
  const fixtureProbeManifestPath = requireAbsolute("--fixture-probe-manifest");
  const boundary = requiredArgument("--boundary-fingerprint");
  const evidenceId =
    argument("--evidence-id") || "bubblewrap-mint-02c-physical";
  const manifest = createDefaultQualificationManifest({
    sourceCommit,
    fixtureRoot,
    workspaceRoot,
    probeScript,
  });
  const identity = hostIdentity();
  const fixtureProbeManifestDigest = sha256File(fixtureProbeManifestPath);
  const result = await runBubblewrapQualification({
    manifest,
    sourceCommit,
    evidenceId,
    hostIdentity: identity,
    effectiveSecurityBoundaryFingerprint: boundary,
    evidencePath,
    fixtureProbeManifestDigest,
  });
  if (result.status !== "qualified") {
    console.error(
      JSON.stringify(
        {
          status: result.status,
          reason: result.reason,
          failedProbeId: result.failedProbeId,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  let materializedCanaryReceiptPath: string | undefined;
  if (canaryReceiptPath !== undefined) {
    const canary = await runBubblewrapQualificationCanary({
      manifest,
      sourceCommit,
      qualification: { status: "qualified", evidence: result.evidence },
      qualificationContext: {
        sourceCommit,
        hostIdentity: identity,
        effectiveSecurityBoundaryFingerprint: boundary,
        fixtureProbeManifestDigest,
      },
      workspaceRoot,
      processRunner: new ChildProcessRunner(),
      receiptPath: canaryReceiptPath,
    });
    if (canary.status !== "qualified") {
      console.error(
        JSON.stringify(
          {
            status: canary.status,
            reason: canary.reason,
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }
    materializedCanaryReceiptPath = canary.receiptPath;
  }
  console.log(
    JSON.stringify(
      {
        status: result.status,
        evidenceId: result.evidence.evidenceId,
        sourceCommit: result.evidence.sourceCommit,
        profileFingerprint: result.evidence.profileFingerprint,
        providerBinaryDigest: result.evidence.providerBinaryDigest,
        fixtureProbeManifestDigest: result.evidence.fixtureProbeManifestDigest,
        evidencePath: result.evidencePath,
        canaryReceiptPath: materializedCanaryReceiptPath,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(
    "bubblewrap qualification refused: " +
      (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
});
