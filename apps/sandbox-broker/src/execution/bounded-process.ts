/**
 * Bounded, networkless command runner for the engineering workstation.
 *
 * A narrow, broker-final execution primitive used by candidate-repository git
 * operations and bounded diagnostics. It reuses the existing network-isolation
 * gate, executable allowlist/resolution, and execution limits; it never grants
 * shell access, never permits network, and never runs an unpinned executable.
 */

import * as path from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import {
  assertArgvPolicy,
  assertAllowlistedInterpreter,
  assertExecutionLimits,
} from "../policy/execution.js";
import { classifyBrokerZone, toCanonicalBrokerPath, toNativeBrokerPath } from "../policy/path.js";
import type { ExecutableMappings } from "./executable-resolver.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import type { NetworkIsolationProvider } from "./network-isolation.js";
import type { FakeRunRequest, FakeRunResult, ProcessRunner } from "../process/fake-runner.js";

/**
 * Resolve an arbitrary allowlisted executable id to a broker-controlled
 * binary. Mirrors the fixed-recipe resolver's file checks: absolute mapping,
 * regular file, no symlink, not inside a writable-disposable or protected zone.
 */
function resolveExecutableId(
  mappings: ExecutableMappings,
  rootConfig: BrokerRootConfig,
  id: string,
): { ok: true; path: string } | { ok: false; errorCode: string; reason: string } {
  const mapped = mappings[id];
  if (typeof mapped !== "string" || mapped.length === 0) {
    return { ok: false, errorCode: "executable_unmapped", reason: id };
  }
  if (!path.isAbsolute(mapped)) {
    return { ok: false, errorCode: "executable_mapping_not_absolute", reason: id };
  }
  const native = path.resolve(mapped);
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
  const zone = classifyBrokerZone(canonicalResult.value, rootConfig);
  if (zone !== null && (zone.zone === "writable_disposable" || zone.zone === "protected")) {
    return { ok: false, errorCode: "executable_in_forbidden_zone", reason: `${zone.zone}:${canonicalResult.value}` };
  }
  return { ok: true, path: toNativeBrokerPath(canonicalResult.value) };
}

export type BoundedCommandRequest = {
  executableId: string;
  argv: string[];
  cwd: string;
  limits: { wallMs: number; maxProcesses: number; maxOutputBytes: number };
  /** Additional env pairs merged after the allowlist (broker-controlled only). */
  extraEnv?: Record<string, string>;
};

export type BoundedCommandResult = FakeRunResult & {
  executed: boolean;
};

export type BoundedCommandDeps = {
  executableMappings: ExecutableMappings;
  rootConfig: BrokerRootConfig;
  processRunner: ProcessRunner;
  networkIsolation: NetworkIsolationProvider;
  envAllowlist: Set<string>;
};

function buildEnv(allowlist: Set<string>, extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of allowlist) {
    const value = process.env[key];
    if (value !== undefined) out[key] = value;
  }
  if (extra) Object.assign(out, extra);
  return out;
}

export async function runBoundedCommand(
  deps: BoundedCommandDeps,
  request: BoundedCommandRequest,
): Promise<{ ok: true; result: BoundedCommandResult } | { ok: false; errorCode: string; reason: string }> {
  const resolved = resolveExecutableId(deps.executableMappings, deps.rootConfig, request.executableId);
  if (!resolved.ok) {
    return { ok: false, errorCode: "executable_unresolved", reason: resolved.reason };
  }
  const argv = [resolved.path, ...request.argv];
  const argvCheck = assertArgvPolicy(argv);
  if (!argvCheck.ok) {
    return { ok: false, errorCode: argvCheck.reason, reason: "argv policy violation" };
  }
  const interpreterCheck = assertAllowlistedInterpreter(resolved.path, new Set([resolved.path]));
  if (!interpreterCheck.ok) {
    return { ok: false, errorCode: interpreterCheck.reason, reason: "interpreter policy violation" };
  }
  const limitsCheck = assertExecutionLimits(request.limits);
  if (!limitsCheck.ok) {
    return { ok: false, errorCode: limitsCheck.reason, reason: "limits violation" };
  }
  const runRequest: FakeRunRequest = {
    taskId: "engineering-bounded",
    argv,
    cwd: request.cwd,
    env: buildEnv(deps.envAllowlist, request.extraEnv),
    wallMs: request.limits.wallMs,
    maxProcesses: request.limits.maxProcesses,
    maxOutputBytes: request.limits.maxOutputBytes,
  };
  const plan = await deps.networkIsolation.prepare(runRequest);
  if (!plan.ok) {
    return { ok: false, errorCode: plan.errorCode, reason: plan.reason };
  }
  const result: FakeRunResult = await deps.processRunner.run(plan.request);
  return {
    ok: true,
    result: { ...result, executed: true },
  };
}
