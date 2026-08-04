import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { contractMismatch } from "../attention/ledger.js";
import {
  currentContractId,
  currentReleaseId,
  refreshCapabilityPromotions,
} from "../rollout/capabilities.js";
import type { CognitionMode } from "../types.js";

export type PerceptionCapabilityName =
  | "vision"
  | "attachment_text"
  | "conversational_read"
  | "web_search";

type CapabilityState = "observe" | "active" | "rolled_back" | "disabled";

const PERCEPTION_CAPABILITY_DEPS: Record<PerceptionCapabilityName, string[]> = {
  vision: ["thought"],
  attachment_text: ["thought"],
  conversational_read: ["reading", "thought"],
  web_search: ["thought"],
};

const PERCEPTION_CAPABILITIES: PerceptionCapabilityName[] = [
  "vision",
  "attachment_text",
  "conversational_read",
  "web_search",
];

function releaseState(
  db: DatabaseSync,
  capability: string,
  releaseId: string,
): CapabilityState {
  const row = db
    .prepare(
      `SELECT state FROM capability_releases
       WHERE capability = ? AND release_id = ?`,
    )
    .get(capability, releaseId) as { state?: string } | undefined;
  switch (row?.state) {
    case "active":
    case "rolled_back":
    case "disabled":
      return row.state;
    default:
      return "observe";
  }
}

function dependenciesReady(
  db: DatabaseSync,
  capability: PerceptionCapabilityName,
  releaseId: string,
): boolean {
  return PERCEPTION_CAPABILITY_DEPS[capability].every(
    (dependency) => releaseState(db, dependency, releaseId) === "active",
  );
}

/**
 * Mirrors capabilityCanInfluence for v3 perception capabilities until they join
 * the primary capability registry.
 */
export function perceptionCapabilityCanInfluence(
  db: DatabaseSync,
  capability: PerceptionCapabilityName,
  masterMode: CognitionMode = env.cognitionMode,
  releaseId = currentReleaseId() || currentContractId(),
): boolean {
  if (contractMismatch(db)) return false;
  if (masterMode !== "apply") return false;
  refreshCapabilityPromotions(db, releaseId);
  return (
    releaseState(db, capability, releaseId) === "active" &&
    dependenciesReady(db, capability, releaseId)
  );
}

export type PerceptionCapabilitySnapshot = {
  capability: PerceptionCapabilityName;
  state: CapabilityState;
  effective: boolean;
};

export function listPerceptionCapabilitySnapshots(
  db: DatabaseSync,
  masterMode: CognitionMode = env.cognitionMode,
  releaseId = currentReleaseId() || currentContractId(),
): PerceptionCapabilitySnapshot[] {
  return PERCEPTION_CAPABILITIES.map((capability) => {
    const state = releaseState(db, capability, releaseId);
    const effective =
      !contractMismatch(db) &&
      masterMode === "apply" &&
      state === "active" &&
      dependenciesReady(db, capability, releaseId);
    return { capability, state, effective };
  });
}

function describeCapability(snapshot: PerceptionCapabilitySnapshot): string {
  const label = snapshot.capability.replace(/_/g, " ");
  if (snapshot.effective) {
    return `${label}: active (may influence this turn when licensed)`;
  }
  if (snapshot.state === "active" && !snapshot.effective) {
    return `${label}: active release but blocked (dependencies or master observe)`;
  }
  return `${label}: observe (recorded only; not licensed for model influence)`;
}

export function composeSelfCapabilityContext(db: DatabaseSync): string {
  const snapshots = listPerceptionCapabilitySnapshots(db);
  const lines = [
    "Perception capabilities (honest self-model):",
    ...snapshots.map((snapshot) => `- ${describeCapability(snapshot)}`),
    "- Attachment fetch requires sufficient thought deadline and capability release.",
    "- Conversational page reads require explicit user URL-read intent plus authorization.",
    "- Web search has no configured provider in this deployment.",
    "- Sandboxed source execution is unavailable to this turn unless the separately qualified broker socket is configured and reachable.",
  ];
  return lines.join("\n");
}
