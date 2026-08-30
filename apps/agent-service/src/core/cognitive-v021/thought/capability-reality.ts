import type { DatabaseSync } from "node:sqlite";
import { env } from "../../../env.js";
import { perceptionCapabilityCanInfluence } from "../../perception/capability-self-model.js";
import {
  canOfferBoundedOperation,
  canOfferCandidateAuthorship,
  canOfferCandidateVerification,
  canOfferCandidateWorkspace,
  canOfferPatchExport,
  canOfferProjectInspection,
  listApprovedReadProjectIds,
  loadOperatorProjectReadRegistry,
  type V2ProjectReadRegistry,
} from "../../sandbox/project-registry.js";
import type { CapabilityName } from "../../rollout/capabilities.js";
import type { CapabilityReality } from "../types.js";

/** Capabilities with an actual v0.2.1 production adapter in this candidate. */
const V021_LIVE_OPERATION_CAPABILITIES: ReadonlySet<CapabilityName> = new Set([
  "project_inspection",
  "project_experimentation",
  "candidate_verification",
  "candidate_authorship",
]);

/** The production v0.2.1 perception provider is not bound in this candidate. */
const V021_LIVE_PERCEPTION_CAPABILITIES: ReadonlySet<CapabilityName> = new Set();

export type CapabilityRealityOptions = {
  registry?: V2ProjectReadRegistry;
  masterMode?: "observe" | "apply";
  lifecycleEnabled?: boolean;
  substrateAvailable?: boolean;
};

/** Read capability facts for Thought. This deliberately bypasses Expression text composition. */
export function getCapabilityReality(
  db: DatabaseSync,
  options: CapabilityRealityOptions = {},
): CapabilityReality {
  const registry = options.registry ?? loadOperatorProjectReadRegistry();
  const masterMode = options.masterMode ?? env.cognitionMode;
  const sandboxOptions = {
    registry,
    masterMode,
    lifecycleEnabled: options.lifecycleEnabled,
    substrateAvailable: options.substrateAvailable,
  };
  return {
    vision: V021_LIVE_PERCEPTION_CAPABILITIES.has("vision") &&
      perceptionCapabilityCanInfluence(db, "vision", masterMode),
    attachmentText: V021_LIVE_PERCEPTION_CAPABILITIES.has("attachment_text") &&
      perceptionCapabilityCanInfluence(db, "attachment_text", masterMode),
    conversationalRead: V021_LIVE_PERCEPTION_CAPABILITIES.has("conversational_read") &&
      perceptionCapabilityCanInfluence(db, "conversational_read", masterMode),
    webSearch: V021_LIVE_PERCEPTION_CAPABILITIES.has("web_search") &&
      perceptionCapabilityCanInfluence(db, "web_search", masterMode),
    canOfferProjectInspection: V021_LIVE_OPERATION_CAPABILITIES.has("project_inspection") &&
      canOfferProjectInspection(db, sandboxOptions),
    canOfferWorkspace: V021_LIVE_OPERATION_CAPABILITIES.has("project_experimentation") &&
      canOfferCandidateWorkspace(db, sandboxOptions),
    canOfferVerification: V021_LIVE_OPERATION_CAPABILITIES.has("candidate_verification") &&
      canOfferCandidateVerification(db, sandboxOptions),
    canOfferAuthorship: V021_LIVE_OPERATION_CAPABILITIES.has("candidate_authorship") &&
      canOfferCandidateAuthorship(db, sandboxOptions),
    canOfferBoundedOperation: false,
    canOfferPatchExport: false,
    approvedProjectIds: listApprovedReadProjectIds(registry),
  };
}
