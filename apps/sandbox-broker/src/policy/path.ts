import path from "node:path";
import { realpathSync } from "node:fs";

export function normalizeWorkspacePath(
  workspaceRoot: string,
  candidate: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (path.isAbsolute(candidate)) {
    return { ok: false, reason: "absolute_path_forbidden" };
  }
  if (candidate.includes("\0")) {
    return { ok: false, reason: "invalid_path" };
  }
  const normalized = path.posix.normalize(candidate.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === "..") {
    return { ok: false, reason: "path_escape" };
  }
  const absolute = path.resolve(workspaceRoot, normalized);
  let root: string;
  let resolved: string;
  try {
    root = realpathSync(workspaceRoot);
    resolved = realpathSync(absolute);
  } catch {
    return { ok: false, reason: "path_not_found" };
  }
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return { ok: false, reason: "path_escape" };
  }
  return { ok: true, value: resolved };
}
