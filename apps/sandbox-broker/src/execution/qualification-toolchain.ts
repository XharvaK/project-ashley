import { accessSync, constants, lstatSync, realpathSync } from "node:fs";

const VISIBLE_ROOTS = ["/usr", "/lib", "/lib64"] as const;

export type QualificationToolContractEntry = {
  readonly id: string;
  readonly path: string;
  readonly visibleRoots: readonly string[];
};

export type QualificationToolchainValidation =
  | {
      status: "valid";
      tools: readonly QualificationToolContractEntry[];
    }
  | {
      status: "invalid";
      reason: `qualification_probe_toolchain_invalid:${string}`;
    };

export const BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT: readonly QualificationToolContractEntry[] = [
  { id: "dash", path: "/usr/bin/dash", visibleRoots: VISIBLE_ROOTS },
  { id: "bash", path: "/usr/bin/bash", visibleRoots: VISIBLE_ROOTS },
  { id: "timeout", path: "/usr/bin/timeout", visibleRoots: VISIBLE_ROOTS },
  { id: "env", path: "/usr/bin/env", visibleRoots: VISIBLE_ROOTS },
  { id: "sleep", path: "/usr/bin/sleep", visibleRoots: VISIBLE_ROOTS },
  { id: "rm", path: "/usr/bin/rm", visibleRoots: VISIBLE_ROOTS },
  { id: "true", path: "/usr/bin/true", visibleRoots: VISIBLE_ROOTS },
  { id: "yes", path: "/usr/bin/yes", visibleRoots: VISIBLE_ROOTS },
];

type QualificationToolchainFilesystem = {
  lstatSync(path: string): unknown;
  accessSync(path: string, mode: number): void;
  realpathSync(path: string): string;
};

const nativeFilesystem: QualificationToolchainFilesystem = {
  lstatSync,
  accessSync,
  realpathSync,
};

function isWithinVisibleRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function invalid(id: string): QualificationToolchainValidation {
  return {
    status: "invalid",
    reason: `qualification_probe_toolchain_invalid:${id}`,
  };
}

function matchesContractEntry(
  supplied: QualificationToolContractEntry | undefined,
  expected: QualificationToolContractEntry | undefined,
): boolean {
  return (
    supplied !== undefined &&
    expected !== undefined &&
    supplied.id === expected.id &&
    supplied.path === expected.path &&
    supplied.visibleRoots.length === expected.visibleRoots.length &&
    supplied.visibleRoots.every((root, index) => root === expected.visibleRoots[index])
  );
}

function contractMismatchId(tools: readonly QualificationToolContractEntry[]): string | null {
  const length = Math.max(tools.length, BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT.length);
  for (let index = 0; index < length; index += 1) {
    const expected = BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT[index];
    const supplied = tools[index];
    if (!matchesContractEntry(supplied, expected)) return expected?.id ?? supplied?.id ?? "contract";
  }
  return null;
}

export function validateQualificationToolchain(
  tools: readonly QualificationToolContractEntry[] = BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT,
  filesystem: QualificationToolchainFilesystem = nativeFilesystem,
): QualificationToolchainValidation {
  const mismatch = contractMismatchId(tools);
  if (mismatch !== null) return invalid(mismatch);

  for (const tool of tools) {
    try {
      filesystem.lstatSync(tool.path);
      filesystem.accessSync(tool.path, constants.X_OK);
      const resolved = filesystem.realpathSync(tool.path);
      if (!tool.visibleRoots.some((root) => isWithinVisibleRoot(resolved, root))) {
        return invalid(tool.id);
      }
    } catch {
      return invalid(tool.id);
    }
  }

  return { status: "valid", tools };
}
