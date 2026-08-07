import { existsSync, statSync } from "node:fs";
import { env } from "../../env.js";
import {
  fetchBrokerStatus,
  type BrokerClientTransport,
  type BrokerStatusSnapshot,
} from "../change-proposal/broker-client.js";
import { createConfiguredUnixBrokerTransport } from "../change-proposal/unix-broker-transport.js";
import { sandboxKeysConfigured } from "./key-store.js";

export type SandboxQualificationState =
  | "disabled"
  | "keys_missing"
  | "socket_missing"
  | "configured"
  | "qualified"
  | "unreachable";

export type SandboxAvailabilitySnapshot = {
  brokerOptIn: boolean;
  socketPath: string;
  socketPresent: boolean;
  signingKeys: {
    ownerApproval: boolean;
    continuityTombstone: boolean;
  };
  transportConfigured: boolean;
  qualification: SandboxQualificationState;
  reachabilityCheckedAtMs: number | null;
  reachabilityErrorCode?: string;
  /** Latest broker `broker.status` snapshot; null when the broker did not answer. */
  brokerStatus?: BrokerStatusSnapshot | null;
};

type ReachabilityCache = {
  state: SandboxQualificationState;
  checkedAtMs: number | null;
  errorCode?: string;
  brokerStatus?: BrokerStatusSnapshot | null;
};

let reachabilityCache: ReachabilityCache = {
  state: "disabled",
  checkedAtMs: null,
};

export function resetSandboxReachabilityCacheForTests(): void {
  reachabilityCache = { state: "disabled", checkedAtMs: null };
}

function isUnixSocketPresent(socketPath: string): boolean {
  if (!socketPath) return false;
  try {
    return existsSync(socketPath) && statSync(socketPath).isSocket();
  } catch {
    return false;
  }
}

export function sandboxAvailabilityBaseSnapshot(): Omit<
  SandboxAvailabilitySnapshot,
  "qualification" | "reachabilityCheckedAtMs" | "reachabilityErrorCode"
> {
  const socketPath = env.sandboxBrokerSocket.trim();
  const signingKeys = sandboxKeysConfigured();
  const brokerOptIn = env.sandboxBrokerEnabled;
  const transportConfigured = brokerOptIn && socketPath.length > 0;
  return {
    brokerOptIn,
    socketPath,
    socketPresent: isUnixSocketPresent(socketPath),
    signingKeys,
    transportConfigured,
  };
}

function prerequisiteQualificationState(
  base: ReturnType<typeof sandboxAvailabilityBaseSnapshot>,
): SandboxQualificationState | "ready_for_probe" {
  if (!base.brokerOptIn) return "disabled";
  if (!base.socketPresent) return "socket_missing";
  if (!base.signingKeys.ownerApproval || !base.signingKeys.continuityTombstone) {
    return "keys_missing";
  }
  return "ready_for_probe";
}

function resolveQualificationState(
  base: ReturnType<typeof sandboxAvailabilityBaseSnapshot>,
  cache: ReachabilityCache,
): SandboxQualificationState {
  const prerequisite = prerequisiteQualificationState(base);
  if (prerequisite !== "ready_for_probe") return prerequisite;
  if (cache.state === "qualified") return "qualified";
  if (cache.state === "unreachable") return "unreachable";
  return "configured";
}

export function sandboxAvailabilitySnapshot(): SandboxAvailabilitySnapshot {
  const base = sandboxAvailabilityBaseSnapshot();
  const qualification = resolveQualificationState(base, reachabilityCache);
  return {
    ...base,
    qualification,
    reachabilityCheckedAtMs: reachabilityCache.checkedAtMs,
    ...(reachabilityCache.errorCode
      ? { reachabilityErrorCode: reachabilityCache.errorCode }
      : {}),
    ...(reachabilityCache.brokerStatus !== undefined
      ? { brokerStatus: reachabilityCache.brokerStatus }
      : {}),
  };
}

export function refreshSandboxQualificationBaseline(): void {
  const base = sandboxAvailabilityBaseSnapshot();
  const prerequisite = prerequisiteQualificationState(base);
  if (prerequisite === "ready_for_probe") {
    if (
      reachabilityCache.state === "disabled" ||
      reachabilityCache.state === "socket_missing" ||
      reachabilityCache.state === "keys_missing"
    ) {
      reachabilityCache = { state: "configured", checkedAtMs: null };
    }
    return;
  }
  reachabilityCache = { state: prerequisite, checkedAtMs: Date.now() };
}

export async function probeSandboxBrokerReachability(
  ownerId: string,
  transport: BrokerClientTransport | null = createConfiguredUnixBrokerTransport(),
): Promise<SandboxAvailabilitySnapshot> {
  refreshSandboxQualificationBaseline();
  const base = sandboxAvailabilityBaseSnapshot();
  if (
    !ownerId ||
    !transport ||
    prerequisiteQualificationState(base) !== "ready_for_probe"
  ) {
    return sandboxAvailabilitySnapshot();
  }
  const result = await transport.dispatch("artifact.list", { ownerId });
  if (result.ok) {
    const status = await fetchBrokerStatus(transport);
    reachabilityCache = {
      state: "qualified",
      checkedAtMs: Date.now(),
      brokerStatus: status.ok ? status.data : null,
    };
  } else {
    reachabilityCache = {
      state: "unreachable",
      checkedAtMs: Date.now(),
      errorCode: result.errorCode,
    };
  }
  return sandboxAvailabilitySnapshot();
}

export function describeSandboxAvailability(
  snapshot: SandboxAvailabilitySnapshot = sandboxAvailabilitySnapshot(),
): string {
  switch (snapshot.qualification) {
    case "disabled":
      return "Sandboxed execution: broker IPC disabled (ASHLEY_SANDBOX_BROKER_ENABLED is not true).";
    case "socket_missing":
      return `Sandboxed execution: broker socket not present at ${snapshot.socketPath}.`;
    case "keys_missing": {
      const missing: string[] = [];
      if (!snapshot.signingKeys.ownerApproval) missing.push("owner approval");
      if (!snapshot.signingKeys.continuityTombstone) missing.push("continuity tombstone");
      return `Sandboxed execution: signing keys incomplete (${missing.join(", ")} not configured).`;
    }
    case "configured":
      return "Sandboxed execution: broker socket and signing keys are configured; reachability has not been verified yet this session.";
    case "unreachable":
      return `Sandboxed execution: broker socket is present but unreachable (${snapshot.reachabilityErrorCode ?? "broker_error"}).`;
    case "qualified":
      return "Sandboxed execution: OS sandbox broker is qualified this session (socket reachable, signing keys configured). Each isolated task still requires owner-signed approval and is not licensed from conversation alone.";
    default: {
      const never: never = snapshot.qualification;
      return `Sandboxed execution: unknown state (${never}).`;
    }
  }
}
