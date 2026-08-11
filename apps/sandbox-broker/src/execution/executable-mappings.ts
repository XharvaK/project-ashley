/**
 * Production executable mappings (Sandbox Wave 5, host qualification prep).
 *
 * The broker never executes machine-specific paths: every fixed recipe's
 * executable is resolved through an injected mapping keyed by executable id
 * (`npm`, `git`, ...). In tests the mapping points at fixture binaries; in
 * production it must point at broker-controlled regular files. This module
 * derives the production mapping from a strict environment seam
 * (`ASHLEY_SANDBOX_EXECUTABLE_<ID>`), so the installer owns the pinned
 * paths and the broker owns the fail-closed default: any unmapped id stays
 * unmapped and every fixed-recipe run for it is refused at the executable
 * stage without spawning.
 */

import { isAbsolute } from "node:path";
import type { ExecutableMappings } from "./executable-resolver.js";

export type ExecutableMappingsEnvResult =
  | { ok: true; mappings: ExecutableMappings }
  | { ok: false; errorCode: string; reason: string };

const PREFIX = "ASHLEY_SANDBOX_EXECUTABLE_";
const IDENTIFIER_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Builds the production executable mapping from the environment seam.
 * Known executable ids are pinned by name (`npm`, `git`); any other
 * `ASHLEY_SANDBOX_EXECUTABLE_*` variable is ignored so a typo can never
 * silently authorize a binary. Values must be absolute paths; non-absolute
 * or empty values fail closed with a boot-shape error.
 */
export function executableMappingsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): ExecutableMappingsEnvResult {
  const mappings: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(PREFIX)) continue;
    const id = name.slice(PREFIX.length).toLowerCase();
    if (id.length === 0 || !IDENTIFIER_RE.test(id)) continue;
    if (!KNOWN_EXECUTABLE_IDS.has(id)) continue;
    if (value === undefined || value.trim().length === 0) {
      return { ok: false, errorCode: "executable_mapping_empty", reason: id };
    }
    const path = value.trim();
    if (!isAbsolute(path)) {
      return {
        ok: false,
        errorCode: "executable_mapping_not_absolute",
        reason: id,
      };
    }
    mappings[id] = path;
  }
  return { ok: true, mappings };
}

/**
 * Executable ids the fixed recipe registry may request in production.
 * `true` backs the verify:broker-smoke isolation canary
 * (SANDBOX-ISOLATION-01).
 */
export const KNOWN_EXECUTABLE_IDS: ReadonlySet<string> = new Set([
  "npm",
  "git",
  "true",
]);
