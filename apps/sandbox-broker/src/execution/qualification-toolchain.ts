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

function isAbsoluteUnixPath(path: string): boolean {
  return path.startsWith("/") && path.split("/").every((segment) => segment !== "." && segment !== "..");
}

function isWithinVisibleRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function invalid(id: string): QualificationToolchainValidation {
  return {
    status: "invalid",
    reason: `qualification_probe_toolchain_invalid:${id}`,
  };
}

export function validateQualificationToolchain(
  tools: readonly QualificationToolContractEntry[] = BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT,
  filesystem: QualificationToolchainFilesystem = nativeFilesystem,
): QualificationToolchainValidation {
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const tool of tools) {
    if (
      tool.id.length === 0 ||
      !isAbsoluteUnixPath(tool.path) ||
      ids.has(tool.id) ||
      paths.has(tool.path) ||
      tool.visibleRoots.length === 0 ||
      tool.visibleRoots.some((root) =>
        !VISIBLE_ROOTS.includes(root as (typeof VISIBLE_ROOTS)[number]) || !isAbsoluteUnixPath(root),
      )
    ) {
      return invalid(tool.id);
    }
    ids.add(tool.id);
    paths.add(tool.path);

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
