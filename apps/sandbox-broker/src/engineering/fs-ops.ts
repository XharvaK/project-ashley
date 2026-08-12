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
  MAX_LIST_ENTRIES: 2000,
  MAX_DEPTH: 24,
} as const;

export type FsResolveResult =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; errorCode: string; reason: string };

/** Resolve a canonical relative path against the trusted root; fail on escape. */
export async function resolveWithinRoot(
  root: string,
  relativePath: string,
): Promise<FsResolveResult> {
  if (relativePath.length === 0) {
    return { ok: true, absolute: root, relative: "." };
  }
  if (!isCanonicalForm(relativePath)) {
    return { ok: false, errorCode: "relative_path_invalid", reason: "not a canonical relative path" };
  }
  const absolute = path.resolve(root, relativePath);
  const rootReal = await fs.realpath(root).catch(() => root);
  if (!isWithin(absolute, rootReal)) {
    return { ok: false, errorCode: "path_escape", reason: "path escapes trusted root" };
  }
  // Reject symlink escapes: resolve the candidate and ensure it stays contained.
  const candidateReal = await fs
    .realpath(absolute)
    .catch(() => absolute);
  if (!isWithin(candidateReal, rootReal)) {
    return { ok: false, errorCode: "symlink_escape", reason: "symlink escapes trusted root" };
  }
  return { ok: true, absolute, relative: relativePath };
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
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "m");
  } catch {
    return { ok: false, errorCode: "pattern_invalid", reason: "invalid regex" };
  }
  const maxMatches = Math.min(
    opts.maxMatches ?? FS_OP_LIMITS.MAX_SEARCH_MATCHES,
    FS_OP_LIMITS.MAX_SEARCH_MATCHES,
  );
  const matches: SearchMatch[] = [];
  let truncated = false;
  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (depth > FS_OP_LIMITS.MAX_DEPTH) return;
    if (matches.length >= maxMatches) {
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
      if (matches.length >= maxMatches) {
        truncated = true;
        return;
      }
      const abs = path.join(dir, entry.name);
      const entryRel = rel === "." ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(abs, entryRel, depth + 1);
      } else if (entry.isFile()) {
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
          if (regex.test(lines[i]!)) {
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
