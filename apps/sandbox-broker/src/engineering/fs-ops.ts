/**
 * Bounded filesystem operations for the engineering workstation.
 *
 * Every operation resolves a canonical relative path against a single trusted
 * root and refuses any escape (no "..", no symlink pointing outside the root,
 * no absolute model-selected path). Reads are chunk/range bounded; writes are
 * size bounded. This module performs NO secret classification itself — callers
 * must apply the project/workspace exclusion rules before trusting content.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { isCanonicalForm, isWithin } from "@composer-assistant/sandbox-policy";

export const FS_OP_LIMITS = {
  MAX_READ_BYTES: 2 * 1024 * 1024,
  MAX_WRITE_BYTES: 8 * 1024 * 1024,
  MAX_SEARCH_MATCHES: 4000,
  MAX_SEARCH_FILE_BYTES: 1 * 1024 * 1024,
  MAX_SEARCH_FILES: 20_000,
  MAX_LIST_ENTRIES: 2000,
  MAX_DEPTH: 24,
} as const;

/** Directories never traversed by the engineering search walk. */
export const SEARCH_EXCLUDED_DIRS = new Set<string>([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  "coverage",
]);

/**
 * A pattern containing only this charset is treated as a literal substring
 * search (linear, ReDoS-immune). Anything else is treated as a bounded RegExp
 * (file/byte/match caps still apply).
 */
const LITERAL_SEARCH_CHARSET = /^[A-Za-z0-9_./\- \t]+$/;

export type FsResolveResult =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; errorCode: string; reason: string };

/** Split a canonical absolute path into its non-empty segments. */
function splitPathSegments(p: string): string[] {
  return p.split("/").filter((s) => s.length > 0);
}

/**
 * Walk `absolute` from `rootReal` component by component, resolving any
 * symlink encountered and refusing (fail closed) the moment a symlink points
 * outside the trusted root or is dangling. Once a component does not yet exist,
 * the remaining segments are plain (canonical, no `..`) new names appended to
 * the deepest existing ancestor — which is itself provably inside `rootReal` —
 * so the final path cannot escape through a dangling symlink that was merely
 * unresolved by `realpath` (the previous `.catch(() => absolute)` fallback).
 */
async function walkResolveWithin(
  rootReal: string,
  absolute: string,
): Promise<{ ok: true; realPath: string } | { ok: false; errorCode: string; reason: string }> {
  const rootParts = splitPathSegments(rootReal);
  const absParts = splitPathSegments(absolute);
  if (absParts.length < rootParts.length) {
    return { ok: false, errorCode: "path_escape", reason: "path escapes trusted root" };
  }
  for (let i = 0; i < rootParts.length; i += 1) {
    if (rootParts[i] !== absParts[i]) {
      return { ok: false, errorCode: "path_escape", reason: "path escapes trusted root" };
    }
  }
  let cur = rootReal;
  let idx = rootParts.length;
  while (idx < absParts.length) {
    const next = path.join(cur, absParts[idx]!);
    let st;
    try {
      st = await fs.lstat(next);
    } catch {
      // First non-existent component: the rest are new plain names.
      break;
    }
    if (st.isSymbolicLink()) {
      let target: string;
      try {
        target = await fs.realpath(next);
      } catch {
        // Dangling symlink: refusing is the only safe option; following it is
        // exactly the write-through escape the caller must not permit.
        return { ok: false, errorCode: "symlink_escape", reason: "dangling symlink in trusted path" };
      }
      if (!isWithin(rootReal, target)) {
        return { ok: false, errorCode: "symlink_escape", reason: "symlink escapes trusted root" };
      }
      cur = target;
    } else {
      cur = next;
    }
    idx += 1;
  }
  const remaining = absParts.slice(idx);
  const realPath = remaining.length > 0 ? path.join(cur, ...remaining) : cur;
  if (!isWithin(rootReal, realPath)) {
    return { ok: false, errorCode: "path_escape", reason: "path escapes trusted root" };
  }
  return { ok: true, realPath };
}

/** Resolve a canonical relative path against the trusted root; fail on escape. */
export async function resolveWithinRoot(
  root: string,
  relativePath: string,
): Promise<FsResolveResult> {
  if (relativePath.length === 0) {
    const rootReal = await fs.realpath(root).catch(() => null);
    if (rootReal === null) {
      return { ok: false, errorCode: "root_unavailable", reason: "trusted root unavailable" };
    }
    return { ok: true, absolute: rootReal, relative: "." };
  }
  const rootReal = await fs.realpath(root).catch(() => null);
  if (rootReal === null) {
    return { ok: false, errorCode: "root_unavailable", reason: "trusted root unavailable" };
  }
  const absolute = path.resolve(rootReal, relativePath);
  const resolved = await walkResolveWithin(rootReal, absolute);
  if (!resolved.ok) {
    return { ok: false, errorCode: resolved.errorCode, reason: resolved.reason };
  }
  return { ok: true, absolute: resolved.realPath, relative: relativePath };
}

export async function boundedReadFile(
  root: string,
  relativePath: string,
  opts: { offset?: number; length?: number } = {},
): Promise<
  | { ok: true; content: string; truncated: boolean; bytes: number }
  | { ok: false; errorCode: string; reason: string }
> {
  const resolved = await resolveWithinRoot(root, relativePath);
  if (!resolved.ok) return resolved;
  let stat;
  try {
    stat = await fs.stat(resolved.absolute);
  } catch {
    return { ok: false, errorCode: "not_found", reason: "file not found" };
  }
  if (!stat.isFile()) return { ok: false, errorCode: "not_a_file", reason: "not a regular file" };
  if (stat.size > FS_OP_LIMITS.MAX_READ_BYTES) {
    return { ok: false, errorCode: "file_too_large", reason: "file exceeds read bound" };
  }
  const offset = Math.max(0, opts.offset ?? 0);
  const length = Math.min(opts.length ?? FS_OP_LIMITS.MAX_READ_BYTES, FS_OP_LIMITS.MAX_READ_BYTES);
  const handle = await fs.open(resolved.absolute, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, offset);
    return {
      ok: true,
      content: buf.slice(0, bytesRead).toString("utf8"),
      truncated: bytesRead >= stat.size,
      bytes: bytesRead,
    };
  } finally {
    await handle.close();
  }
}

export async function boundedListDir(
  root: string,
  relativePath: string,
): Promise<
  | { ok: true; entries: Array<{ name: string; kind: "file" | "dir" | "other"; size: number }> }
  | { ok: false; errorCode: string; reason: string }
> {
  const resolved = await resolveWithinRoot(root, relativePath);
  if (!resolved.ok) return resolved;
  let entries;
  try {
    entries = await fs.readdir(resolved.absolute, { withFileTypes: true });
  } catch {
    return { ok: false, errorCode: "not_found", reason: "directory not found" };
  }
  const out: Array<{ name: string; kind: "file" | "dir" | "other"; size: number }> = [];
  for (const entry of entries.slice(0, FS_OP_LIMITS.MAX_LIST_ENTRIES)) {
    let size = 0;
    try {
      const s = await fs.stat(path.join(resolved.absolute, entry.name));
      size = s.size;
    } catch {
      size = 0;
    }
    out.push({
      name: entry.name,
      kind: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other",
      size,
    });
  }
  return { ok: true, entries: out };
}

export type SearchMatch = { relativePath: string; line: number; text: string };

export async function boundedSearchText(
  root: string,
  pattern: string,
  opts: { relativePath?: string; maxMatches?: number } = {},
): Promise<
  | { ok: true; matches: SearchMatch[]; truncated: boolean }
  | { ok: false; errorCode: string; reason: string }
> {
  const resolved = await resolveWithinRoot(root, opts.relativePath ?? ".");
  if (!resolved.ok) return resolved;
  if (pattern.length === 0 || pattern.length > 512) {
    return { ok: false, errorCode: "pattern_invalid", reason: "pattern length out of bounds" };
  }
  let regex: RegExp;
  const useLiteral = LITERAL_SEARCH_CHARSET.test(pattern);
  if (!useLiteral) {
    try {
      regex = new RegExp(pattern, "m");
    } catch {
      return { ok: false, errorCode: "pattern_invalid", reason: "invalid regex" };
    }
  }
  const maxMatches = Math.min(
    opts.maxMatches ?? FS_OP_LIMITS.MAX_SEARCH_MATCHES,
    FS_OP_LIMITS.MAX_SEARCH_MATCHES,
  );
  const matches: SearchMatch[] = [];
  let truncated = false;
  let filesScanned = 0;
  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (depth > FS_OP_LIMITS.MAX_DEPTH) return;
    if (matches.length >= maxMatches || filesScanned >= FS_OP_LIMITS.MAX_SEARCH_FILES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= maxMatches || filesScanned >= FS_OP_LIMITS.MAX_SEARCH_FILES) {
        truncated = true;
        return;
      }
      const abs = path.join(dir, entry.name);
      const entryRel = rel === "." ? entry.name : `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        // Never follow symlinks during the search walk: a symlinked directory
        // could point anywhere, including outside the trusted root.
        continue;
      }
      if (entry.isDirectory()) {
        if (SEARCH_EXCLUDED_DIRS.has(entry.name)) continue;
        await walk(abs, entryRel, depth + 1);
      } else if (entry.isFile()) {
        filesScanned += 1;
        let stat;
        try {
          stat = await fs.stat(abs);
        } catch {
          continue;
        }
        if (stat.size > FS_OP_LIMITS.MAX_SEARCH_FILE_BYTES) continue;
        let content: string;
        try {
          content = await fs.readFile(abs, "utf8");
        } catch {
          continue;
        }
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxMatches) {
            truncated = true;
            break;
          }
          const hit = useLiteral ? lines[i]!.includes(pattern) : regex!.test(lines[i]!);
          if (hit) {
            matches.push({ relativePath: entryRel, line: i + 1, text: lines[i]! });
          }
        }
      }
    }
  }
  await walk(resolved.absolute, resolved.relative, 0);
  return { ok: true, matches, truncated };
}

export async function boundedWriteFile(
  root: string,
  relativePath: string,
  contentBase64: string,
): Promise<{ ok: true } | { ok: false; errorCode: string; reason: string }> {
  const resolved = await resolveWithinRoot(root, relativePath);
  if (!resolved.ok) return resolved;
  let buf: Buffer;
  try {
    buf = Buffer.from(contentBase64, "base64");
  } catch {
    return { ok: false, errorCode: "content_malformed", reason: "base64 decode failed" };
  }
  if (buf.length > FS_OP_LIMITS.MAX_WRITE_BYTES) {
    return { ok: false, errorCode: "content_too_large", reason: "write exceeds bound" };
  }
  try {
    await fs.mkdir(path.dirname(resolved.absolute), { recursive: true });
    await fs.writeFile(resolved.absolute, buf);
    return { ok: true };
  } catch {
    return { ok: false, errorCode: "write_failed", reason: "write failed" };
  }
}

export async function boundedDeleteFile(
  root: string,
  relativePath: string,
): Promise<{ ok: true } | { ok: false; errorCode: string; reason: string }> {
  const resolved = await resolveWithinRoot(root, relativePath);
  if (!resolved.ok) return resolved;
  try {
    await fs.rm(resolved.absolute, { force: true, recursive: false });
    return { ok: true };
  } catch {
    return { ok: false, errorCode: "delete_failed", reason: "delete failed" };
  }
}
