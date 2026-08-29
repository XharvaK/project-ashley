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
import type { CapabilityReality } from "../types.js";

export type CapabilityRealityOptions = {
  registry?: V2ProjectReadRegistry;
  masterMode?: "observe" | "apply";
};

/** Read capability facts for Thought. This deliberately bypasses Expression text composition. */
export function getCapabilityReality(
  db: DatabaseSync,
  options: CapabilityRealityOptions = {},
): CapabilityReality {
  const registry = options.registry ?? loadOperatorProjectReadRegistry();
  const masterMode = options.masterMode ?? env.cognitionMode;
  return {
    vision: perceptionCapabilityCanInfluence(db, "vision", masterMode),
    attachmentText: perceptionCapabilityCanInfluence(db, "attachment_text", masterMode),
    conversationalRead: perceptionCapabilityCanInfluence(db, "conversational_read", masterMode),
    webSearch: perceptionCapabilityCanInfluence(db, "web_search", masterMode),
    canOfferProjectInspection: canOfferProjectInspection(db, { registry, masterMode }),
    canOfferWorkspace: canOfferCandidateWorkspace(db, { registry, masterMode }),
    canOfferVerification: canOfferCandidateVerification(db, { registry, masterMode }),
    canOfferAuthorship: canOfferCandidateAuthorship(db, { registry, masterMode }),
    canOfferBoundedOperation: canOfferBoundedOperation(db, { registry, masterMode }),
    canOfferPatchExport: canOfferPatchExport(db, { registry, masterMode }),
    approvedProjectIds: listApprovedReadProjectIds(registry),
  };
}
