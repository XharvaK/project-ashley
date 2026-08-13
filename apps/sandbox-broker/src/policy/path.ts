import path from "node:path";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import {
  canonicalizePath,
  classifyProtectedPath,
  isWithin,
  type ProtectedPathClass,
  type SandboxPathIntent,
} from "@composer-assistant/sandbox-policy";
import type { BrokerRootConfig } from "./root-config.js";
import type { BrokerDelegatedPathFactResolver } from "./delegated-authorization.js";

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

/**
 * Canonical broker path facts (Sandbox Wave 4, Commit 6).
 *
 * The broker is the filesystem authority behind delegated path claims. The
 * envelope's `canonicalTargetPaths` are untrusted claims; this module
 * resolves each claim through `realpath` against the broker's injected
 * canonical root configuration and produces a typed fact. Production is
 * Linux Mint, where `realpath` output is already POSIX-canonical. On a
 * Windows development host the resolved path is mapped to a deterministic
 * POSIX-canonical form (`C:\dir` -> `/C:/dir`) so the shared policy
 * canonicality contract holds everywhere; the mapping is injective and
 * invertible via `toNativeBrokerPath`.
 *
 * Fail-closed rules:
 * - claims must be canonical absolute paths (no NUL, no `..` above root);
 * - the realpath result must stay inside a configured broker root
 *   (`path_escape` when a claim inside a root leaves it via symlink);
 * - read/delete targets must already exist;
 * - write targets resolve through the nearest existing canonical parent
 *   (no file is ever created here);
 * - delete is only permitted inside the disposable workspace;
 * - sockets, FIFOs, block/char devices, and setuid/setgid write targets fail
 *   closed; symlinks are resolved (and classified) but never escape roots.
 *
 * No process is spawned and nothing on the filesystem is mutated by this
 * module: it only resolves and classifies paths.
 */

export type BrokerRootZone = "read_only" | "writable_disposable" | "protected";

export type BrokerCanonicalPathFact = {
  canonicalPath: string;
  root: string;
  rootZone: BrokerRootZone;
  pathClass: ProtectedPathClass;
  intent: SandboxPathIntent;
  exists: boolean;
  symlink: boolean;
  special: boolean;
  privilegedBits: boolean;
};

export type BrokerPathResolutionRequest = {
  candidate: string;
  intent: SandboxPathIntent;
  workspaceRoot: string;
  roots: BrokerRootConfig;
};

export type BrokerPathResolutionResult =
  | { ok: true; fact: BrokerCanonicalPathFact }
  | { ok: false; reason: string };

/**
 * Injective host normalization: a native absolute path becomes the
 * deterministic POSIX-canonical form used by shared policy evaluation.
 */
export function toCanonicalBrokerPath(
  nativeAbsolute: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  const posix = nativeAbsolute.replace(/\\/g, "/");
  const direct = canonicalizePath(posix);
  if (direct.ok) return direct;
  if (/^[A-Za-z]:\//.test(posix)) {
    const mapped = canonicalizePath(`/${posix}`);
    if (mapped.ok) return mapped;
  }
  return { ok: false, reason: "path_not_canonical" };
}

/** Inverts `toCanonicalBrokerPath` for host filesystem operations. */
export function toNativeBrokerPath(canonicalPosix: string): string {
  if (process.platform === "win32" && /^\/[A-Za-z]:\//.test(canonicalPosix)) {
    return canonicalPosix.slice(1);
  }
  return canonicalPosix;
}

function nearestExistingParent(candidate: string): string | null {
  let current = candidate;
  for (;;) {
    if (existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Classifies a canonical path into broker root zones. Protected roots win;
 * within the remaining roots the most specific configured root wins.
 */
export function classifyBrokerZone(
  canonicalPath: string,
  roots: BrokerRootConfig,
): { zone: BrokerRootZone; root: string; pathClass: ProtectedPathClass } | null {
  const protectedClass = classifyProtectedPath(roots.protectedRoots, canonicalPath);
  if (protectedClass.class !== "none") {
    return { zone: "protected", root: protectedClass.root, pathClass: protectedClass };
  }
  for (const root of roots.writableDisposableRoots) {
    if (isWithin(root, canonicalPath)) {
      return { zone: "writable_disposable", root, pathClass: { class: "none" } };
    }
  }
  for (const root of roots.readOnlyRoots) {
    if (isWithin(root, canonicalPath)) {
      return { zone: "read_only", root, pathClass: { class: "none" } };
    }
  }
  return null;
}

/**
 * Resolves an untrusted claim into broker-owned canonical path facts.
 * Never creates files and never spawns processes.
 */
export function resolveBrokerPath(
  request: BrokerPathResolutionRequest,
): BrokerPathResolutionResult {
  const { candidate, intent, roots } = request;
  if (typeof candidate !== "string" || candidate.length === 0) {
    return { ok: false, reason: "invalid_path" };
  }
  if (candidate.includes("\0")) {
    return { ok: false, reason: "invalid_path" };
  }
  const canonical = canonicalizePath(candidate);
  let canonicalPath: string;
  if (canonical.ok) {
    canonicalPath = canonical.value;
  } else if (canonical.reason === "path_not_absolute") {
    const joined = canonicalizePath(
      `${roots.workspaceRoot}/${candidate.replace(/\\/g, "/")}`,
    );
    if (!joined.ok) {
      return { ok: false, reason: "path_escape" };
    }
    canonicalPath = joined.value;
  } else if (canonical.reason === "path_escape_above_root") {
    return { ok: false, reason: "path_escape" };
  } else if (canonical.reason === "path_invalid_nul") {
    return { ok: false, reason: "invalid_path" };
  } else {
    return { ok: false, reason: canonical.reason };
  }
  const native = toNativeBrokerPath(canonicalPath);
  const lexicalZone = classifyBrokerZone(canonicalPath, roots) !== null;

  let exists: boolean;
  let resolvedNative: string;
  let resolvedCanonical: string;
  try {
    resolvedNative = realpathSync(native);
    exists = true;
    const canonicalResult = toCanonicalBrokerPath(resolvedNative);
    if (!canonicalResult.ok) {
      return { ok: false, reason: "path_not_canonical" };
    }
    resolvedCanonical = canonicalResult.value;
  } catch {
    if (!lexicalZone) {
      return { ok: false, reason: "path_outside_configured_roots" };
    }
    if (intent !== "write") {
      return { ok: false, reason: "path_not_found" };
    }
    const nearest = nearestExistingParent(native);
    if (nearest === null) {
      return { ok: false, reason: "path_not_found" };
    }
    let realParent: string;
    try {
      realParent = realpathSync(nearest);
    } catch {
      return { ok: false, reason: "path_not_found" };
    }
    const parentCanonical = toCanonicalBrokerPath(realParent);
    if (!parentCanonical.ok) {
      return { ok: false, reason: "path_not_canonical" };
    }
    const suffix = native.slice(nearest.length).replace(/\\/g, "/");
    const joined = canonicalizePath(`${parentCanonical.value}${suffix}`);
    if (!joined.ok) {
      return { ok: false, reason: "path_escape" };
    }
    exists = false;
    resolvedCanonical = joined.value;
  }

  const zone = classifyBrokerZone(resolvedCanonical, roots);
  if (zone === null) {
    return {
      ok: false,
      reason: lexicalZone ? "path_escape" : "path_outside_configured_roots",
    };
  }
  if (intent === "delete" && zone.zone !== "writable_disposable") {
    return { ok: false, reason: "delete_outside_disposable" };
  }

  let symlink = false;
  let special = false;
  let privilegedBits = false;
  if (exists) {
    let stats;
    try {
      stats = lstatSync(native);
    } catch {
      return { ok: false, reason: "path_not_found" };
    }
    symlink = stats.isSymbolicLink();
    if (!symlink && !stats.isFile() && !stats.isDirectory()) {
      return { ok: false, reason: "special_file_forbidden" };
    }
    if (intent !== "read") {
      const setid = stats.mode & (0o4000 | 0o2000);
      if (setid !== 0) {
        return { ok: false, reason: "privileged_file_forbidden" };
      }
    }
  }

  return {
    ok: true,
    fact: {
      canonicalPath: resolvedCanonical,
      root: zone.root,
      rootZone: zone.zone,
      pathClass: zone.pathClass,
      intent,
      exists,
      symlink,
      special,
      privilegedBits,
    },
  };
}

/**
 * Production-usable adapter of `resolveBrokerPath` for the delegated
 * authorization seam: the broker owns the facts, the envelope owns only
 * claims. Fails closed with the resolver reason on every miss.
 */
export function createBrokerPathFactResolver(
  rootConfig: BrokerRootConfig,
): BrokerDelegatedPathFactResolver {
  return (target) => {
    const result = resolveBrokerPath({
      candidate: target.path,
      intent: target.intent,
      workspaceRoot: rootConfig.workspaceRoot,
      roots: rootConfig,
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    return { ok: true, canonicalPath: result.fact.canonicalPath };
  };
}
