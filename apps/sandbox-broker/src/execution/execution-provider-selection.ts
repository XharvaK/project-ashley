/**
 * Host-owned production selection for execution isolation providers.
 *
 * The selector is the only production construction seam. Recipe, task, and
 * model inputs never reach it. The default is no execution provider, and a
 * Bubblewrap provider is eligible only when the host supplies both the exact
 * source profile fingerprint and separate qualification evidence.
 */

import type { ProcessRunner } from "../process/fake-runner.js";
import {
  BUBBLEWRAP_PROFILE_FINGERPRINT,
  BubblewrapExecutionIsolation,
  type BubblewrapBind,
  type BubblewrapExecutionIsolationOptions,
  type BubblewrapQualification,
} from "./bubblewrap-execution-isolation.js";
import type { ExecutionIsolationProvider } from "./execution-isolation.js";

export type ProductionExecutionIsolationSelection =
  | {
      kind: "unavailable";
      label: "unavailable";
      provider?: undefined;
      qualification: null;
    }
  | {
      kind: "bubblewrap";
      label: "bubblewrap";
      provider: ExecutionIsolationProvider;
      qualification: {
        status: BubblewrapQualification["status"];
        expectedProfileFingerprint: string;
        suppliedProfileFingerprint: string | null;
        evidenceId: string | null;
      };
    };

export type ProductionExecutionIsolationSelectionInput = {
  /** Host configuration only; never a recipe or task field. */
  providerName?: string;
  /** Expected source profile fingerprint supplied by the host configuration. */
  profileFingerprint?: string;
  /** Physical qualification evidence supplied by the host only. */
  qualification?: BubblewrapQualification;
  platform: NodeJS.Platform;
  processRunner: ProcessRunner;
  probeBinary?: BubblewrapExecutionIsolationOptions["probeBinary"];
  probeProviderVersion?: BubblewrapExecutionIsolationOptions["probeProviderVersion"];
  binds?: readonly BubblewrapBind[];
  workspaceRoots?: readonly string[];
};

export function selectProductionExecutionIsolation(
  input: ProductionExecutionIsolationSelectionInput,
): ProductionExecutionIsolationSelection {
  const name = input.providerName?.trim() || "unavailable";
  if (name === "unavailable") {
    return {
      kind: "unavailable",
      label: "unavailable",
      qualification: null,
    };
  }
  if (name !== "bubblewrap") {
    throw new Error(`unknown execution provider: ${name}`);
  }

  const suppliedProfileFingerprint = input.profileFingerprint?.trim() || null;
  const profileMatches =
    suppliedProfileFingerprint === BUBBLEWRAP_PROFILE_FINGERPRINT;
  const suppliedQualification =
    input.qualification ?? ({ status: "unqualified" } as const);
  const qualification: BubblewrapQualification = profileMatches
    ? suppliedQualification
    : { status: "unqualified" };
  const provider = new BubblewrapExecutionIsolation({
    processRunner: input.processRunner,
    platform: input.platform,
    probeBinary: input.probeBinary,
    probeProviderVersion: input.probeProviderVersion,
    binds: input.binds,
    workspaceRoots: input.workspaceRoots,
    qualification,
  });
  return {
    kind: "bubblewrap",
    label: "bubblewrap",
    provider,
    qualification: {
      status: qualification.status,
      expectedProfileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      suppliedProfileFingerprint,
      evidenceId:
        qualification.status === "qualified"
          ? qualification.evidence.evidenceId
          : null,
    },
  };
}
