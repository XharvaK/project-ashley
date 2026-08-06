/**
 * Fixed-recipe executable resolution (Sandbox Wave 4, Commit 9).
 *
 * The broker never executes machine-specific paths: every fixed recipe's
 * executable is resolved through an injected executable mapping (keyed by
 * executable id) that points at a broker-controlled binary. In tests the
 * mapping points at fixture executables; in production it points at the
 * pinned toolchain binaries. The resolver revalidates at execution time
 * that the resolved file is a real regular file — never a symlink, never a
 * directory, never a special file — and that it cannot be tampered with by
 * a disposable workspace (not inside a writable disposable root).
 */

import { isAbsolute, resolve } from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import type { FixedRecipe } from "../policy/recipe-registry.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { classifyBrokerZone, toCanonicalBrokerPath, toNativeBrokerPath } from "../policy/path.js";

/**
 * Injected executable mappings: executable id (the fixed recipe's
 * executable base name, e.g. `git`) -> absolute native path of the
 * broker-controlled binary.
 */
export type ExecutableMappings = Readonly<Record<string, string>>;

export type ResolveExecutableResult =
  | { ok: true; executable: string }
  | { ok: false; errorCode: string; reason: string };

function baseNameOf(canonicalExecutable: string): string {
  const name = canonicalExecutable.split("/").pop() ?? "";
  return name.length === 0 ? canonicalExecutable : name;
}

/**
 * Resolves a fixed recipe's executable through the injected mapping and
 * revalidates the file at execution time. Fails closed on: unmapped
 * executable, non-absolute mapping, missing file, symlink, directory or
 * special file, executable inside a writable disposable root (workspace
 * tamper boundary), or executable inside a protected root.
 */
export function resolveFixedRecipeExecutable(input: {
  recipe: FixedRecipe;
  mappings: ExecutableMappings;
  rootConfig: BrokerRootConfig;
}): ResolveExecutableResult {
  const { recipe, mappings, rootConfig } = input;
  const executableId = baseNameOf(recipe.executable);
  const mapped = mappings[executableId];
  if (typeof mapped !== "string" || mapped.length === 0) {
    return { ok: false, errorCode: "executable_unmapped", reason: executableId };
  }
  if (!isAbsolute(mapped)) {
    return { ok: false, errorCode: "executable_mapping_not_absolute", reason: executableId };
  }
  const native = resolve(mapped);
  let stats;
  try {
    stats = lstatSync(native);
  } catch {
    return { ok: false, errorCode: "executable_missing", reason: native };
  }
  if (!stats.isFile()) {
    return { ok: false, errorCode: "executable_not_regular_file", reason: native };
  }
  let realNative: string;
  try {
    realNative = realpathSync(native);
  } catch {
    return { ok: false, errorCode: "executable_missing", reason: native };
  }
  const sameRealPath =
    process.platform === "win32"
      ? realNative.toLowerCase() === native.toLowerCase()
      : realNative === native;
  if (!sameRealPath) {
    return { ok: false, errorCode: "executable_symlink", reason: native };
  }
  const canonicalResult = toCanonicalBrokerPath(realNative);
  if (!canonicalResult.ok) {
    return { ok: false, errorCode: "executable_path_not_canonical", reason: native };
  }
  const canonical = canonicalResult.value;
  const zone = classifyBrokerZone(canonical, rootConfig);
  if (zone !== null && (zone.zone === "writable_disposable" || zone.zone === "protected")) {
    return {
      ok: false,
      errorCode: "executable_in_forbidden_zone",
      reason: `${zone.zone}:${canonical}`,
    };
  }
  return { ok: true, executable: toNativeBrokerPath(canonical) };
}
