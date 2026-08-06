/**
 * Sanitized tree copy (Sandbox Wave 4, Commit 7).
 *
 * Strict broker-owned filesystem traversal: lstat-first, deterministic
 * (sorted) order, no symlink following, no external commands. Symlinks are
 * never followed; by default they are skipped and counted, with an option
 * to fail the whole copy. Sockets, FIFOs, block/char devices, and
 * setuid/setgid files always fail the copy. Hard links are copied (the
 * content at the path is ordinary file data) but counted and flagged.
 * Case-colliding relative paths are ambiguous on case-insensitive
 * filesystems and always fail the copy.
 *
 * Every ceiling is enforced incrementally during traversal so a hostile or
 * accidental source tree can never exhaust disk, inodes, or scan time.
 * The number of scanned entries is bounded by the file ceiling plus the
 * excluded-entry ceiling. File modes are preserved on POSIX hosts only.
 */

import {
  chmodSync,
  createReadStream,
  createWriteStream,
  lstatSync,
  mkdirSync,
  readdirSync,
  type Stats,
} from "node:fs";
import { createHash } from "node:crypto";
import type { WorkspaceExclusionSet } from "./workspace-exclusions.js";
import type { DisposableWorkspaceLimits } from "./workspace-limits.js";

export type WorkspaceCopyCounts = {
  files: number;
  directories: number;
  excluded: number;
  bytes: number;
  skippedSymlinks: number;
  hardLinkedFiles: number;
  specialFiles: number;
  privilegedFiles: number;
  caseCollisions: number;
};

export type WorkspaceCopyResult =
  | {
      ok: true;
      counts: WorkspaceCopyCounts;
      digest: string | null;
      fileDigests: Record<string, string> | null;
    }
  | {
      ok: false;
      errorCode: string;
      reason: string;
      counts: WorkspaceCopyCounts;
    };

export type WorkspaceCopyInput = {
  /** Native filesystem path of the source root (already realpath-resolved). */
  sourceRoot: string;
  /** Native filesystem path of the destination workspace root (already created). */
  destinationRoot: string;
  exclusionSet: WorkspaceExclusionSet;
  limits: DisposableWorkspaceLimits;
  symlinkPolicy?: "skip" | "fail";
  /** Compute per-file SHA-256 digests and the aggregate digest. */
  digests?: boolean;
};

type PendingEntry = { relPath: string; src: string; dest: string };

function emptyCounts(): WorkspaceCopyCounts {
  return {
    files: 0,
    directories: 0,
    excluded: 0,
    bytes: 0,
    skippedSymlinks: 0,
    hardLinkedFiles: 0,
    specialFiles: 0,
    privilegedFiles: 0,
    caseCollisions: 0,
  };
}

function assertSafeRelPath(relPath: string): boolean {
  return (
    relPath.length > 0 &&
    !relPath.startsWith("/") &&
    !relPath.startsWith("\\") &&
    !relPath.split("/").includes("..")
  );
}

function truncatedReason(code: string, relPath: string): string {
  const visible = relPath.length > 512 ? `${relPath.slice(0, 512)}...` : relPath;
  return `${code}:${visible}`;
}

/** Streams a regular file into the destination while optionally hashing it. */
function copyFileWithOptionalDigest(
  source: string,
  destination: string,
  wantDigest: boolean,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = createReadStream(source, { highWaterMark: 256 * 1024 });
    const output = createWriteStream(destination, { flags: "w" });
    const hash = wantDigest ? createHash("sha256") : null;
    input.on("data", (chunk: string | Buffer) => {
      output.write(chunk);
      hash?.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
    });
    input.on("end", () => {
      output.end();
    });
    input.on("error", (error) => {
      output.destroy();
      reject(error);
    });
    output.on("error", (error) => {
      input.destroy();
      reject(error);
    });
    output.on("finish", () => {
      resolve(hash === null ? null : hash.digest("hex"));
    });
  });
}

/**
 * Copies a sanitized tree from `sourceRoot` into `destinationRoot` under the
 * configured exclusions and limits. Never follows symlinks, never spawns
 * processes, and mutates only paths inside `destinationRoot`.
 */
export function copySanitizedTree(
  input: WorkspaceCopyInput,
): Promise<WorkspaceCopyResult> {
  const {
    sourceRoot,
    destinationRoot,
    exclusionSet,
    limits,
    symlinkPolicy = "skip",
    digests = false,
  } = input;
  const counts = emptyCounts();
  const fileDigests: Record<string, string> | null = digests ? {} : null;
  const aggregate = digests ? createHash("sha256") : null;
  const seenLower = new Map<string, string>();
  const scanBound = limits.maxFiles + limits.maxExcludedEntries;
  let scanned = 0;

  const fail = (
    errorCode: string,
    reason: string,
  ): WorkspaceCopyResult => ({ ok: false, errorCode, reason, counts });

  const excludeOrFail = (
    relPath: string,
  ): { excluded: boolean } | { failed: WorkspaceCopyResult } => {
    const verdict = exclusionSet.excludes(relPath);
    if (verdict.excluded) {
      counts.excluded += 1;
      if (counts.excluded > limits.maxExcludedEntries) {
        return {
          failed: fail(
            "limit_exceeded",
            truncatedReason("excluded_entries_exceeded", relPath),
          ),
        };
      }
      return { excluded: true };
    }
    return { excluded: false };
  };

  const checkDepthAndLength = (
    relPath: string,
  ): WorkspaceCopyResult | null => {
    const depth = relPath.split("/").length;
    if (depth > limits.maxDepth) {
      return fail("limit_exceeded", truncatedReason("depth_exceeded", relPath));
    }
    if (relPath.length > limits.maxPathLength) {
      return fail("limit_exceeded", truncatedReason("path_length_exceeded", relPath));
    }
    return null;
  };

  const registerName = (relPath: string): WorkspaceCopyResult | null => {
    const lower = relPath.toLowerCase();
    const prior = seenLower.get(lower);
    if (prior !== undefined && prior !== relPath) {
      counts.caseCollisions += 1;
      return fail("case_collision", `${prior} vs ${relPath}`);
    }
    seenLower.set(lower, relPath);
    return null;
  };

  const processFile = async (
    relPath: string,
    src: string,
    dest: string,
    stats: Stats,
  ): Promise<WorkspaceCopyResult | null> => {
    const setid = stats.mode & (0o4000 | 0o2000);
    if (setid !== 0) {
      counts.privilegedFiles += 1;
      return fail("workspace_unsafe_object", truncatedReason("privileged_file_forbidden", relPath));
    }
    if (stats.size > limits.maxSingleFileBytes) {
      return fail(
        "limit_exceeded",
        truncatedReason("single_file_bytes_exceeded", relPath),
      );
    }
    if (counts.files + 1 > limits.maxFiles) {
      return fail("limit_exceeded", truncatedReason("files_exceeded", relPath));
    }
    if (counts.bytes + stats.size > limits.maxBytes) {
      return fail("limit_exceeded", truncatedReason("bytes_exceeded", relPath));
    }
    const collision = registerName(relPath);
    if (collision !== null) return collision;
    try {
      const digest = await copyFileWithOptionalDigest(src, dest, digests);
      if (process.platform !== "win32") {
        chmodSync(dest, stats.mode & 0o777);
      }
      if (stats.nlink > 1) counts.hardLinkedFiles += 1;
      counts.files += 1;
      counts.bytes += stats.size;
      if (digest !== null && fileDigests !== null && aggregate !== null) {
        fileDigests[relPath] = digest;
        aggregate.update(`${relPath}\0${digest}\n`);
      }
    } catch {
      return fail("copy_failed", truncatedReason("file_copy_failed", relPath));
    }
    return null;
  };

  const processDir = (
    relPath: string,
    src: string,
    dest: string,
  ): { failed: WorkspaceCopyResult } | { descend: PendingEntry[] } => {
    let entries: string[];
    try {
      entries = readdirSync(src).sort();
    } catch {
      return { failed: fail("copy_failed", truncatedReason("readdir_failed", relPath)) };
    }
    const children: PendingEntry[] = [];
    for (const name of entries) {
      const childRel = relPath === "" ? name : `${relPath}/${name}`;
      const childSrc = `${src}${src.endsWith("/") ? "" : "/"}${name}`;
      const childDest = `${dest}${dest.endsWith("/") ? "" : "/"}${name}`;
      const verdict = excludeOrFail(childRel);
      if ("failed" in verdict) return { failed: verdict.failed };
      if (verdict.excluded) continue;
      const depthLimit = checkDepthAndLength(childRel);
      if (depthLimit !== null) return { failed: depthLimit };
      children.push({ relPath: childRel, src: childSrc, dest: childDest });
    }
    return { descend: children };
  };

  const stack: PendingEntry[] = [];
  const first = processDir("", sourceRoot, destinationRoot);
  if ("failed" in first) return Promise.resolve(first.failed);
  stack.push(...first.descend.reverse());

  return (async () => {
    for (;;) {
      if (stack.length === 0) {
        return {
          ok: true,
          counts,
          digest: aggregate === null ? null : aggregate.digest("hex"),
          fileDigests,
        };
      }
      const entry = stack.pop()!;
      const { relPath, src, dest } = entry;
      scanned += 1;
      if (scanned > scanBound) {
        return fail("limit_exceeded", truncatedReason("scan_exceeded", relPath));
      }
      if (!assertSafeRelPath(relPath)) {
        return fail("invalid_path", truncatedReason("unsafe_relative_path", relPath));
      }
      let stats: Stats;
      try {
        stats = lstatSync(src);
      } catch {
        return fail("copy_failed", truncatedReason("lstat_failed", relPath));
      }
      if (stats.isSymbolicLink()) {
        counts.skippedSymlinks += 1;
        if (symlinkPolicy === "fail") {
          return fail("workspace_unsafe_object", truncatedReason("symlink_forbidden", relPath));
        }
        continue;
      }
      if (stats.isDirectory()) {
        counts.directories += 1;
        const collision = registerName(relPath);
        if (collision !== null) return collision;
        try {
          mkdirSync(dest, { recursive: false });
          if (process.platform !== "win32") {
            chmodSync(dest, stats.mode & 0o777);
          }
        } catch {
          return fail("copy_failed", truncatedReason("mkdir_failed", relPath));
        }
        const processed = processDir(relPath, src, dest);
        if ("failed" in processed) return processed.failed;
        stack.push(...processed.descend.reverse());
        continue;
      }
      if (!stats.isFile()) {
        counts.specialFiles += 1;
        return fail("workspace_unsafe_object", truncatedReason("special_file_forbidden", relPath));
      }
      const failure = await processFile(relPath, src, dest, stats);
      if (failure !== null) return failure;
    }
  })();
}
