import express from "express";
import cors from "cors";
import type { Server } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { AgentManager } from "./agent.js";
import { env } from "./env.js";
import { toErrorResponse, AppError } from "./errors.js";
import { listRecentDecisions } from "./core/agency/log.js";
import { retrieveEpisodes } from "./core/memory/episodes.js";
import { isAuthorizedOwnerId } from "./owner-auth.js";
import { assertRegisteredRoutes } from "./route-surface.js";
import { signSandboxApproval, signSandboxTombstone } from "./core/sandbox/handlers.js";
import { SandboxApprovalService } from "./core/sandbox/approval-service.js";
import type { SandboxBrokerClient } from "./core/sandbox/broker-client.js";
import type { SandboxApprovalPathTarget, SandboxApprovalProposalSource, SandboxApprovalProposalStatus } from "./core/sandbox/approval-proposal.js";
import type { SandboxCapabilityId, SandboxRiskClass } from "@composer-assistant/sandbox-policy";
import type { ErrorCode } from "./errors.js";
import { openCognitiveSidecarDb } from "./core/cognitive-v021/sidecar/db.js";
import { createCognitiveIngressHandler } from "./core/cognitive-v021/ingress/http.js";
import {
  admitOwnerCorrection,
  type AdmissionPath,
  type CorrectionClass,
  type InclusionReason,
  type ResolutionBasis,
} from "./core/memory/corrections.js";
import {
  correctionDiagnostics,
  correctionHighWater,
  fanoutCorrection,
} from "./core/memory/fanout.js";
import { getMemoryContractState } from "./core/memory/contract-state.js";
import { capabilityCanInfluence } from "./core/rollout/capabilities.js";
import {
  C1_EVALUATION_DEFINITION_ID,
  C1_EVALUATION_DEFINITION_VERSION,
  C1_REQUIRED_EVAL_SEEDS,
} from "./core/rollout/memory-evidence-qualification-epoch.js";
import { inspectAllocation } from "./core/context-budget/inspect.js";
import {
  assertC3ContractCompatible,
  listActiveLearnedInfluences,
} from "./core/learned-autonomy/index.js";
import { getCognitiveGraduationDiagnostics } from "./core/cognitive-graduation/diagnostics.js";
import type { DataClassification } from "./core/privacy/classification.js";
import type {
  ConsentEventKind,
  ConsentGrantorRole,
  InteractionContractKind,
  InteractionContractLifecycle,
  RepairDisposition,
  RepairProposalOrigin,
} from "./core/relationship/types.js";
import type { InteractionContractEvidenceRef } from "./core/relationship/interaction-contracts.js";

const C5_CLASSIFICATIONS = ["ordinary", "sensitive", "never_public", "secret"] as const;
const C5_OPERATIONS = [
  "self_commitment",
  "tension",
  "consent",
  "interaction_contract",
  "repair_proposal",
  "repair_evidence",
  "repair_adjudication",
  "mutual_proposal",
  "mutual_doc_confirmation",
  "mutual_ashley_decision",
  "mutual_delivery",
  "mutual_activate",
  "mutual_withdraw",
] as const;

function c5RequiredString(body: Record<string, unknown>, key: string, max = 2000): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("message_required", `${key} is required`, 400);
  }
  return value.trim().slice(0, max);
}

function c5NullableString(
  body: Record<string, unknown>,
  key: string,
  max = 2000,
): string | null | undefined {
  if (!(key in body) || body[key] === undefined) return undefined;
  if (body[key] === null) return null;
  if (typeof body[key] !== "string") {
    throw new AppError("message_required", `${key} must be a string or null`, 400);
  }
  return body[key].trim().slice(0, max);
}

function c5OptionalString(
  body: Record<string, unknown>,
  key: string,
  max = 2000,
): string | undefined {
  const value = c5NullableString(body, key, max);
  return value === null ? undefined : value;
}

function c5RequiredInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AppError("message_required", `${key} must be an integer`, 400);
  }
  return value;
}

function c5NullableInteger(
  body: Record<string, unknown>,
  key: string,
): number | null | undefined {
  if (!(key in body) || body[key] === undefined) return undefined;
  if (body[key] === null) return null;
  if (typeof body[key] !== "number" || !Number.isInteger(body[key])) {
    throw new AppError("message_required", `${key} must be an integer or null`, 400);
  }
  return body[key] as number;
}

function c5OptionalInteger(
  body: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = c5NullableInteger(body, key);
  return value === null ? undefined : value;
}

function c5Array(body: Record<string, unknown>, key: string): unknown[] {
  const value = body[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError("message_required", `${key} must be a non-empty array`, 400);
  }
  return value;
}

function c5OptionalArray(body: Record<string, unknown>, key: string): unknown[] | undefined {
  if (!(key in body) || body[key] === undefined) return undefined;
  if (!Array.isArray(body[key])) {
    throw new AppError("message_required", `${key} must be an array`, 400);
  }
  return body[key];
}

function c5Object(body: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  if (!(key in body) || body[key] === undefined) return undefined;
  const value = body[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("message_required", `${key} must be an object`, 400);
  }
  return value as Record<string, unknown>;
}

function c5Enum<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = body[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AppError("message_required", `${key} has an invalid value`, 400);
  }
  return value as T;
}

function c5Classification(body: Record<string, unknown>): DataClassification {
  return c5Enum(body, "classification", C5_CLASSIFICATIONS);
}

function c5InteractionEvidenceRefs(
  body: Record<string, unknown>,
): InteractionContractEvidenceRef[] {
  return c5Array(body, "evidenceRefs").map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new AppError("message_required", "evidenceRefs contains an invalid reference", 400);
    }
    const ref = value as Record<string, unknown>;
    if (typeof ref.type !== "string" || !ref.type.trim() ||
        (typeof ref.id !== "string" && typeof ref.id !== "number")) {
      throw new AppError("message_required", "evidenceRefs contains an invalid reference", 400);
    }
    return { type: ref.type.trim().slice(0, 200), id: ref.id };
  });
}

const MAX_DISCORD_MESSAGE = 4000;

function requireOwner(userId: string | undefined): string {
  if (!isAuthorizedOwnerId(userId)) {
    throw new AppError("forbidden", "Forbidden", 403);
  }
  return userId;
}

function c1Body(req: express.Request): Record<string, unknown> {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError("bad_request", "request body must be an object", 400);
  }
  return body as Record<string, unknown>;
}

function c1RequiredString(
  body: Record<string, unknown>,
  key: string,
  max = 300,
): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("message_required", `${key} is required`, 400);
  }
  const clean = value.trim();
  if (clean.length > max) {
    throw new AppError("message_required", `${key} is too long`, 400);
  }
  return clean;
}

function c1RequiredNullableString(
  body: Record<string, unknown>,
  key: string,
): string | null {
  if (!(key in body)) {
    throw new AppError("message_required", `${key} is required`, 400);
  }
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("message_required", `${key} must be a string or null`, 400);
  }
  const clean = value.trim();
  if (clean.length > 300) {
    throw new AppError("message_required", `${key} is too long`, 400);
  }
  return clean;
}

function c1EvaluationSeeds(
  body: Record<string, unknown>,
): Array<{ id: string; passed: boolean }> {
  const value = body.seeds;
  if (!Array.isArray(value) || value.length !== C1_REQUIRED_EVAL_SEEDS.length) {
    throw new AppError("message_required", "seeds must contain all required C1 seeds", 400);
  }
  const allowed = new Set<string>(C1_REQUIRED_EVAL_SEEDS);
  const seen = new Set<string>();
  const seeds = value.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new AppError("message_required", "seeds contains an invalid entry", 400);
    }
    const seed = candidate as Record<string, unknown>;
    if (
      typeof seed.id !== "string" ||
      !allowed.has(seed.id) ||
      seen.has(seed.id) ||
      typeof seed.passed !== "boolean"
    ) {
      throw new AppError("message_required", "seeds contains an invalid value", 400);
    }
    seen.add(seed.id);
    return { id: seed.id, passed: seed.passed };
  });
  if (seen.size !== C1_REQUIRED_EVAL_SEEDS.length) {
    throw new AppError("message_required", "seeds must contain all required C1 seeds", 400);
  }
  return seeds;
}

function trustedC1Quiescence(manager: AgentManager, ownerId: string): {
  expressionPlanePaused: boolean;
  ownerExpressionActive: boolean;
} {
  return {
    expressionPlanePaused: manager.isPaused(),
    ownerExpressionActive: !manager.core.isExpressionQuiesced(ownerId),
  };
}

function gone(_req: express.Request, res: express.Response): void {
  res.status(410).json({
    error: "retired",
    code: "endpoint_retired",
    message: "Voice, Telegram, habits, and network skills were retired.",
  });
}

export function createServer(
  manager: AgentManager,
  options: {
    sandboxBrokerClient?: SandboxBrokerClient | null;
    cognitiveSidecar?: DatabaseSync | null;
  } = {},
): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  let cognitiveSidecar = options.cognitiveSidecar ?? null;
  function getCognitiveSidecar(): DatabaseSync {
    if (cognitiveSidecar) return cognitiveSidecar;
    const dataPlane = manager.dataPlane;
    if (!dataPlane) throw new AppError("agent_not_ready", "Cognitive sidecar unavailable", 503);
    cognitiveSidecar = openCognitiveSidecarDb(
      new DatabaseSync(dataPlane.cognitiveSidecarDbPath),
      { dataPlane },
    );
    return cognitiveSidecar;
  }

  function approvalService(ownerId: string): SandboxApprovalService {
    return new SandboxApprovalService({
      db: manager.core.getDatabase(),
      ownerId,
      brokerClient: options.sandboxBrokerClient ?? null,
    });
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      ready: manager.getState() === "ready" || manager.getState() === "busy",
      state: manager.getState(),
      uptimeSec: manager.getUptimeSec(),
      providerState: manager.getProviderState(),
    });
  });

  app.get("/nuclear/health", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getHealthSnapshot({
        ready: manager.getState() === "ready" || manager.getState() === "busy",
        providerState: manager.getProviderState(),
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/decisions", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 20) || 20);
      res.json({
        nuclear: true,
        decisions: listRecentDecisions(manager.core.getDatabase(), ownerId, limit),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/reflections", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 20) || 20);
      res.json(manager.core.getReflections(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/episodes", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(20, Number(req.query.limit ?? 10) || 10);
      res.json({
        mode: env.cognitionMode,
        episodes: retrieveEpisodes(
          manager.core.getDatabase(),
          ownerId,
          String(req.query.query ?? ""),
          limit,
        ),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/cognition", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getCognitionOverview(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/capabilities", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getCapabilities());
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/attention", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getAttentionObservability());
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/continuity", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.continuitySnapshot());
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/relationship", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(25, Number(req.query.limit ?? 25) || 25);
      const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
      res.json(manager.core.relationshipSummary(ownerId, limit, offset));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  /**
   * Explicit owner-authenticated C5 admission. The request is an event
   * envelope, not a model callback. The runtime selects the current master
   * mode; callers cannot request dark_apply or bypass the apply ceiling.
   */
  app.post("/nuclear/relationship/c5", (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const operation = c5Enum(body, "operation", C5_OPERATIONS);
      let result: unknown;
      switch (operation) {
        case "self_commitment":
          result = manager.core.recordC5AshleySelfCommitment({
            ownerId,
            text: c5RequiredString(body, "text", 600),
            sourceEntityType: c5RequiredString(body, "sourceEntityType", 200),
            sourceEntityUuid: c5RequiredString(body, "sourceEntityUuid", 200),
            decisionId: c5NullableInteger(body, "decisionId"),
            evidenceRefs: c5Array(body, "evidenceRefs"),
            hostValidationOk: true,
            classification: c5Classification(body),
            partySubjectScope: c5OptionalString(body, "partySubjectScope", 200),
            dueAt: c5NullableString(body, "dueAt", 80),
          });
          break;
        case "tension":
          result = manager.core.recordC5RelationalTension({
            ownerId,
            text: c5RequiredString(body, "text", 600),
            sourceEntityType: c5RequiredString(body, "sourceEntityType", 200),
            sourceEntityUuid: c5RequiredString(body, "sourceEntityUuid", 200),
            decisionId: c5NullableInteger(body, "decisionId"),
            evidenceRefs: c5Array(body, "evidenceRefs"),
            hostValidationOk: true,
            classification: c5Classification(body),
            partySubjectScope: c5OptionalString(body, "partySubjectScope", 200),
          });
          break;
        case "consent":
          result = manager.core.recordC5Consent({
            ownerId,
            grantorIdentityRole: c5Enum<ConsentGrantorRole>(body, "grantorIdentityRole", ["doc", "ashley"]),
            granteeOrConsumer: c5RequiredString(body, "granteeOrConsumer", 200),
            scope: c5RequiredString(body, "scope", 200),
            purpose: c5RequiredString(body, "purpose", 500),
            evidenceOrDecisionRef: c5RequiredString(body, "evidenceOrDecisionRef", 300),
            classification: c5Classification(body),
            eventKind: c5Enum<ConsentEventKind>(body, "eventKind", ["grant", "revoke", "expire", "supersede"]),
            supersedesConsentId: c5NullableInteger(body, "supersedesConsentId"),
            grantedAt: c5OptionalString(body, "grantedAt", 80),
            effectiveFrom: c5OptionalString(body, "effectiveFrom", 80),
            effectiveTo: c5NullableString(body, "effectiveTo", 80),
            expiresAt: c5NullableString(body, "expiresAt", 80),
          });
          break;
        case "interaction_contract":
          result = manager.core.recordC5InteractionContract({
            ownerId,
            kind: c5Enum<InteractionContractKind>(body, "kind", [
              "owner_standing_instruction",
              "ashley_standing_boundary",
              "mutual_contract",
              "implicit_hypothesis",
            ]),
            lifecycleState: body.lifecycleState == null
              ? undefined
              : c5Enum<InteractionContractLifecycle>(body, "lifecycleState", [
                "recorded",
                "in_force",
                "withdrawn",
                "superseded",
                "proposed",
                "bilaterally_evidenced",
                "hypothesis",
              ]),
            classification: c5Classification(body),
            partySubjectScope: c5OptionalString(body, "partySubjectScope", 200),
            evidenceRefs: c5InteractionEvidenceRefs(body),
            effectiveFrom: c5OptionalString(body, "effectiveFrom", 80),
            effectiveTo: c5NullableString(body, "effectiveTo", 80),
            scope: c5NullableString(body, "scope", 500),
            audience: c5NullableString(body, "audience", 500),
            withdrawalRefs: c5OptionalArray(body, "withdrawalRefs"),
            correctionRefs: c5OptionalArray(body, "correctionRefs"),
            supersessionRefs: c5OptionalArray(body, "supersessionRefs"),
            identityEntryId: c5NullableInteger(body, "identityEntryId"),
            identityIntervalVersion: c5NullableString(body, "identityIntervalVersion", 200),
            proposalId: c5NullableString(body, "proposalId", 200),
            ownerConfirmationEvidenceRef: c5NullableString(body, "ownerConfirmationEvidenceRef", 300),
            ashleyConfirmationEvidenceRef: c5NullableString(body, "ashleyConfirmationEvidenceRef", 300),
            ashleyDecisionId: c5NullableInteger(body, "ashleyDecisionId"),
            deliveryReference: c5NullableString(body, "deliveryReference", 300),
            typedEvidence: c5Object(body, "typedEvidence"),
            uncertainty: body.uncertainty == null
              ? undefined
              : typeof body.uncertainty === "number" ? body.uncertainty : (() => {
                throw new AppError("message_required", "uncertainty must be a number", 400);
              })(),
            adaptationPolicy: c5NullableString(body, "adaptationPolicy", 500),
            text: c5NullableString(body, "text", 1000),
          });
          break;
        case "repair_proposal":
          result = manager.core.recordC5RepairProposal({
            ownerId,
            tensionId: c5NullableInteger(body, "tensionId"),
            proposalOrigin: c5Enum<RepairProposalOrigin>(body, "proposalOrigin", [
              "model",
              "worker",
              "deterministic_extractor",
              "owner",
            ]),
            proposalDecisionId: c5NullableInteger(body, "proposalDecisionId"),
            text: c5RequiredString(body, "text", 1000),
            evidenceRefs: c5Array(body, "evidenceRefs"),
            classification: c5Classification(body),
            partySubjectScope: c5OptionalString(body, "partySubjectScope", 200),
          });
          break;
        case "repair_evidence":
          result = manager.core.recordC5RepairEvidence({
            ownerId,
            proposalId: c5RequiredInteger(body, "proposalId"),
            evidenceRefs: c5Array(body, "evidenceRefs"),
            classification: c5Classification(body),
            partySubjectScope: c5OptionalString(body, "partySubjectScope", 200),
          });
          break;
        case "repair_adjudication":
          result = manager.core.recordC5RepairAdjudication({
            ownerId,
            proposalId: c5RequiredInteger(body, "proposalId"),
            disposition: c5Enum<RepairDisposition>(body, "disposition", [
              "repaired",
              "not_repaired",
              "unresolved",
              "withdrawn",
            ]),
            adjudicatingDecisionId: c5NullableInteger(body, "adjudicatingDecisionId"),
            hostValidationOk: true,
            classification: c5Classification(body),
            evidenceRefs: c5OptionalArray(body, "evidenceRefs"),
            partySubjectScope: c5OptionalString(body, "partySubjectScope", 200),
            deliveryReceiptId: c5NullableString(body, "deliveryReceiptId", 300),
            supersedesAdjudicationId: c5NullableInteger(body, "supersedesAdjudicationId"),
          });
          break;
        case "mutual_proposal":
          result = manager.core.recordC5MutualProposal({
            ownerId,
            text: c5RequiredString(body, "text", 600),
            sourceEntityType: c5RequiredString(body, "sourceEntityType", 200),
            sourceEntityUuid: c5RequiredString(body, "sourceEntityUuid", 200),
            classification: c5Classification(body),
          });
          break;
        case "mutual_doc_confirmation":
          manager.core.recordC5MutualDocConfirmation(
            ownerId,
            c5RequiredString(body, "entityUuid", 200),
            c5RequiredString(body, "evidenceRef", 300),
          );
          result = null;
          break;
        case "mutual_ashley_decision":
          manager.core.recordC5MutualAshleyDecision(
            ownerId,
            c5RequiredString(body, "entityUuid", 200),
            c5RequiredInteger(body, "decisionId"),
            c5OptionalString(body, "evidenceRef", 300),
          );
          result = null;
          break;
        case "mutual_delivery":
          manager.core.recordC5MutualDelivery(
            ownerId,
            c5RequiredString(body, "entityUuid", 200),
            c5RequiredString(body, "deliveryEntityUuid", 200),
            c5OptionalInteger(body, "decisionId"),
          );
          result = null;
          break;
        case "mutual_activate":
          result = manager.core.activateC5MutualCommitment(
            ownerId,
            c5RequiredString(body, "entityUuid", 200),
          );
          break;
        case "mutual_withdraw":
          manager.core.withdrawC5MutualCommitment(
            ownerId,
            c5RequiredString(body, "entityUuid", 200),
            c5Enum(body, "initiator", ["doc", "ashley"]),
            c5RequiredString(body, "evidenceRef", 300),
          );
          result = null;
          break;
      }
      res.json({ ok: true, operation, result });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/routing", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json({ nuclear: true, routes: manager.core.getRoutingStatus() });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/status", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.nuclearStatusSnapshot(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/jobs", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      const jobId = String(req.query.job_id ?? "");
      requireOwner(ownerId || undefined);
      if (!jobId) {
        res.json({ jobs: manager.core.listDurableOperationalJobs(ownerId) });
        return;
      }
      res.json(manager.core.getDurableOperationalJobStatus(ownerId, jobId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/jobs/cancel", (req, res) => {
    try {
      const { userId, jobId } = req.body as { userId?: string; jobId?: string };
      const ownerId = requireOwner(userId);
      if (typeof jobId !== "string" || !jobId.trim()) {
        throw new AppError("message_required", "job_id required", 400);
      }
      res.json(manager.core.cancelDurableOperationalJob(ownerId, jobId.trim()));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/engineering", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getEngineeringStatus(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/context-budget", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const db = manager.core.getDatabase();
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
      const policies = db.prepare(
        `SELECT policy_id, version, total_utf8_bytes, section_json,
                token_estimate_divisor, created_at
         FROM context_budget_policies ORDER BY created_at DESC LIMIT ?`,
      ).all(limit).map((row) => {
        const value = row as Record<string, unknown>;
        let sections: unknown = {};
        try {
          sections = JSON.parse(String(value.section_json ?? "{}"));
        } catch {
          sections = {};
        }
        return {
          policyId: String(value.policy_id),
          version: Number(value.version),
          totalUtf8Bytes: Number(value.total_utf8_bytes),
          sectionBudgets: sections,
          tokenEstimateDivisor: Number(value.token_estimate_divisor),
          createdAt: String(value.created_at),
        };
      });
      const receiptRows = db.prepare(
        `SELECT receipt_id FROM context_allocation_receipts
         WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?`,
      ).all(ownerId, limit) as Array<{ receipt_id?: string }>;
      res.json({
        nuclear: true,
        capability: "context_budget",
        state: "observe",
        policies,
        allocations: receiptRows
          .filter((row): row is { receipt_id: string } => typeof row.receipt_id === "string")
          .map((row) => inspectAllocation(db, row.receipt_id)),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/learned-autonomy", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const db = manager.core.getDatabase();
      assertC3ContractCompatible(db);
      const state = db.prepare(
        `SELECT highest_contract_version, live_authority_existed,
                cutover_or_activation_state, state
         FROM cognitive_maturation_contract_state WHERE wave = 'c3'`,
      ).get() as Record<string, unknown> | undefined;
      const total = db.prepare(
        `SELECT COUNT(*) AS count FROM learned_influences WHERE owner_id = ?`,
      ).get(ownerId) as { count?: number } | undefined;
      const byState = db.prepare(
        `SELECT adjudication_state, contradiction_state, COUNT(*) AS count
         FROM learned_influences WHERE owner_id = ?
         GROUP BY adjudication_state, contradiction_state`,
      ).all(ownerId) as Array<Record<string, unknown>>;
      const byLineage = db.prepare(
        `SELECT lineage_kind, COUNT(*) AS count
         FROM learned_influences WHERE owner_id = ? GROUP BY lineage_kind`,
      ).all(ownerId) as Array<Record<string, unknown>>;
      const byProvenance = db.prepare(
        `SELECT provenance, capability_mode_at_write, COUNT(*) AS count
         FROM learned_influences WHERE owner_id = ?
         GROUP BY provenance, capability_mode_at_write`,
      ).all(ownerId) as Array<Record<string, unknown>>;
      const byClassification = db.prepare(
        `SELECT data_classification, COUNT(*) AS count
         FROM learned_influences WHERE owner_id = ?
         GROUP BY data_classification`,
      ).all(ownerId) as Array<Record<string, unknown>>;
      const receipts = db.prepare(
        `SELECT COUNT(*) AS count FROM learned_choice_receipts WHERE owner_id = ?`,
      ).get(ownerId) as { count?: number } | undefined;
      res.json({
        mode: env.cognitionMode,
        contract: {
          highestContractVersion: Number(state?.highest_contract_version ?? 0),
          liveAuthorityExisted: Number(state?.live_authority_existed ?? 0) === 1,
          state: String(state?.state ?? state?.cutover_or_activation_state ?? "observe"),
        },
        counts: {
          total: Number(total?.count ?? 0),
          choiceReceipts: Number(receipts?.count ?? 0),
          derivedEligibleInDarkApply: listActiveLearnedInfluences(
            db,
            ownerId,
            { mode: "dark_apply" },
          ).length,
        },
        byState,
        byLineage,
        byProvenance,
        byClassification,
        privacy: {
          rawTextIncluded: false,
          secretBodiesIncluded: false,
        },
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/cognitive-graduation", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(getCognitiveGraduationDiagnostics(manager.core.getDatabase(), ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/memory/corrections", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const db = manager.core.getDatabase();
      res.json({
        currentnessAuthority: getMemoryContractState(db)?.currentnessAuthority ?? "UNKNOWN",
        correctionSeq: correctionHighWater(db),
        corrections: correctionDiagnostics(db, ownerId),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/memory/corrections", (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const sourceMessageId = Number(body.sourceMessageId);
      const correctionOrdinal = Number(body.correctionOrdinal);
      const scopeText = typeof body.scopeText === "string" ? body.scopeText : "";
      if (!Number.isInteger(sourceMessageId) || !Number.isInteger(correctionOrdinal) || !scopeText.trim()) {
        throw new AppError("message_required", "sourceMessageId, correctionOrdinal, and scopeText are required", 400);
      }
      const admissionPath = String(body.admissionPath ?? "typed_control") as AdmissionPath;
      const correctionClass = body.class == null ? undefined : String(body.class) as CorrectionClass;
      const rawTargets = body.targets == null ? [] : body.targets;
      if (!Array.isArray(rawTargets)) {
        throw new AppError("message_required", "targets must be an array", 400);
      }
      const targets = rawTargets.map((raw) => {
        if (typeof raw !== "object" || raw === null) {
          throw new AppError("message_required", "invalid correction target", 400);
        }
        const target = raw as Record<string, unknown>;
        return {
          assertionId: Number(target.assertionId),
          inclusionReason: String(target.inclusionReason) as InclusionReason,
          resolutionBasis: String(target.resolutionBasis) as ResolutionBasis,
        };
      });
      const requestedMode = body.capabilityMode == null
        ? "observe"
        : String(body.capabilityMode);
      if (requestedMode !== "observe" && requestedMode !== "apply") {
        throw new AppError("message_required", "capabilityMode must be observe or apply", 400);
      }
      const db = manager.core.getDatabase();
      const capabilityMode = requestedMode === "apply" &&
        capabilityCanInfluence(db, "memory_evidence", "apply")
        ? "apply"
        : "observe";
      const admitted = admitOwnerCorrection(db, {
        ownerId,
        sourceMessageId,
        correctionOrdinal,
        admissionPath,
        class: correctionClass,
        scopeText,
        proposal: body.proposal,
        targets,
        capabilityMode,
      });
      const fanout = capabilityMode === "apply" &&
        admitted.correction.lifecycleStatus === "applying"
        ? fanoutCorrection(db, admitted.correction.id)
        : null;
      res.json({
        requestedMode,
        capabilityMode,
        admitted,
        fanout,
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/evaluation", (req, res) => {
    try {
      const { userId, capability, seeds, passed, sourceKey } = req.body as {
        userId?: string;
        capability?: string;
        seeds?: number;
        passed?: boolean;
        sourceKey?: string;
      };
      requireOwner(userId);
      if (capability === "memory_evidence") {
        res.status(400).json({
          ok: false,
          reason: "memory_evidence_requires_bound_evaluation",
        });
        return;
      }
      if (
        typeof capability !== "string" ||
        typeof seeds !== "number" ||
        typeof passed !== "boolean" ||
        typeof sourceKey !== "string" ||
        !sourceKey.trim()
      ) {
        throw new AppError("message_required", "evaluation fields required", 400);
      }
      res.json(manager.core.recordCapabilityEvaluation({
        capability,
        seeds,
        passed,
        sourceKey,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/promote", (req, res) => {
    try {
      const { userId, capability } = req.body as {
        userId?: string;
        capability?: string;
      };
      const ownerId = requireOwner(userId);
      if (typeof capability !== "string" || !capability.trim()) {
        throw new AppError("message_required", "capability required", 400);
      }
      res.json(manager.core.promoteCapability({
        capability,
        authorizedBy: ownerId,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/rollback", (req, res) => {
    try {
      const { userId, capability } = req.body as {
        userId?: string;
        capability?: string;
      };
      const ownerId = requireOwner(userId);
      if (typeof capability !== "string" || !capability.trim()) {
        throw new AppError("message_required", "capability required", 400);
      }
      res.json(manager.core.operatorRollbackCapability({
        capability,
        authorizedBy: ownerId,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/recall/cutover", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const ownerId = requireOwner(userId);
      res.json(manager.core.recordRecallCutover(ownerId, { authorizedBy: ownerId }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/recall/qualification-epoch/start", (req, res) => {
    try {
      const { userId, startRequestKey, expectedCurrentEpochId } = req.body as {
        userId?: string;
        startRequestKey?: string;
        expectedCurrentEpochId?: string | null;
      };
      const ownerId = requireOwner(userId);
      res.json(manager.core.startRecallQualificationEpoch({
        authorizedBy: ownerId,
        startRequestKey: startRequestKey ?? "",
        expectedCurrentEpochId: expectedCurrentEpochId ?? null,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/capabilities/recall/qualification-epochs", (req, res) => {
    try {
      const { userId } = req.query as { userId?: string };
      requireOwner(userId);
      res.json(manager.core.listRecallQualificationEpochs());
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/memory-evidence/qualification-epoch/start", (req, res) => {
    try {
      const body = c1Body(req);
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      res.json(manager.core.startMemoryEvidenceQualificationEpoch({
        ownerId,
        startRequestKey: c1RequiredString(body, "startRequestKey"),
        predecessorEpochId: c1RequiredNullableString(body, "predecessorEpochId"),
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/capabilities/memory-evidence/qualification-epochs", (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const ownerId = requireOwner(userId);
      res.json(manager.core.listMemoryEvidenceQualificationEpochs(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/memory-evidence/evaluation", (req, res) => {
    try {
      const body = c1Body(req);
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const definitionId = c1RequiredString(body, "definitionId", 100);
      const definitionVersion = body.definitionVersion;
      if (definitionId !== C1_EVALUATION_DEFINITION_ID ||
          definitionVersion !== C1_EVALUATION_DEFINITION_VERSION) {
        throw new AppError("message_required", "invalid C1 evaluation definition", 400);
      }
      res.json(manager.core.recordMemoryEvidenceEvaluation({
        ownerId,
        sourceKey: c1RequiredString(body, "sourceKey"),
        definitionId,
        definitionVersion,
        definitionHash: c1RequiredString(body, "definitionHash", 128),
        seeds: c1EvaluationSeeds(body),
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/capabilities/memory-evidence/readiness", (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const ownerId = requireOwner(userId);
      const current = manager.core.listMemoryEvidenceQualificationEpochs(ownerId).current;
      const quiescence = trustedC1Quiescence(manager, ownerId);
      res.json(manager.core.getMemoryEvidenceCutoverReadiness({
        ownerId,
        epochId: current?.epochId ?? "",
        masterMode: env.cognitionMode,
        ...quiescence,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/memory-evidence/cutover", (req, res) => {
    try {
      const body = c1Body(req);
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const quiescence = trustedC1Quiescence(manager, ownerId);
      res.json(manager.core.executeMemoryEvidenceCutover({
        ownerId,
        epochId: c1RequiredString(body, "epochId"),
        masterMode: env.cognitionMode,
        ...quiescence,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/revisions", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
      res.json(manager.core.getRevisions(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/revisions/revert", (req, res) => {
    try {
      const { userId, revisionId } = req.body as {
        userId?: string;
        revisionId?: number;
      };
      const ownerId = requireOwner(userId);
      if (typeof revisionId !== "number") {
        throw new AppError("message_required", "revisionId required", 400);
      }
      res.json({ reverted: manager.core.revertRevision(ownerId, revisionId) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/identity/reviews", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
      res.json(manager.core.getIdentityReviews(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/reviews/ashley", (req, res) => {
    try {
      const { userId, reviewId, position, rationale, evidenceType, evidenceId } = req.body as {
        userId?: string;
        reviewId?: number;
        position?: "affirm" | "object" | "defer";
        rationale?: string;
        evidenceType?: string;
        evidenceId?: string | number;
      };
      const ownerId = requireOwner(userId);
      if (
        typeof reviewId !== "number" ||
        !position || !["affirm", "object", "defer"].includes(position) ||
        typeof rationale !== "string" || !rationale.trim() ||
        typeof evidenceType !== "string" || evidenceId == null
      ) {
        throw new AppError("message_required", "grounded Ashley review fields required", 400);
      }
      res.json(manager.core.recordAshleyIdentityPosition({
        ownerId, reviewId, position, rationale, evidenceType, evidenceId,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/reviews/doc", (req, res) => {
    try {
      const { userId, reviewId, decision, rationale } = req.body as {
        userId?: string;
        reviewId?: number;
        decision?: "approve" | "reject" | "defer";
        rationale?: string;
      };
      const ownerId = requireOwner(userId);
      if (
        typeof reviewId !== "number" ||
        !decision || !["approve", "reject", "defer"].includes(decision)
      ) {
        throw new AppError("message_required", "Doc review fields required", 400);
      }
      res.json(manager.core.recordDocIdentityDecision({
        ownerId, reviewId, decision, rationale,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });
  
  // Identity proposals (owner approval for foundational changes)
  app.get("/nuclear/identity/proposals", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
      res.json(manager.core.getIdentityProposals(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/identity/proposals/:entityUuid", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const entityUuid = String(req.params.entityUuid ?? "");
      const detail = manager.core.getIdentityProposal(ownerId, entityUuid);
      if (!detail) {
        throw new AppError("not_found", "identity proposal not found", 404);
      }
      res.json(detail);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/proposals", (req, res) => {
    try {
      const { userId, layer, kind, currentText, proposedText, rationale, evidenceRefs } = req.body as {
        userId?: string;
        layer: "stable" | "dynamic";
        kind: string;
        currentText?: string | null;
        proposedText: string;
        rationale: string;
        evidenceRefs?: string[];
      };
      const ownerId = requireOwner(userId);
      if (!layer || !kind || !proposedText || !rationale) {
        throw new AppError("message_required", "identity proposal fields required", 400);
      }
      res.json(manager.core.createIdentityProposal({
        ownerId,
        layer,
        kind,
        currentText: currentText ?? null,
        proposedText,
        rationale,
        evidenceRefs: evidenceRefs ?? [],
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/proposals/:entityUuid/approve", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const ownerId = requireOwner(userId);
      const entityUuid = String(req.params.entityUuid ?? "");
      res.json(manager.core.approveIdentityProposal(ownerId, entityUuid));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/proposals/:entityUuid/reject", (req, res) => {
    try {
      const { userId, rationale } = req.body as { userId?: string; rationale?: string };
      const ownerId = requireOwner(userId);
      const entityUuid = String(req.params.entityUuid ?? "");
      if (!rationale || !rationale.trim()) {
        throw new AppError("message_required", "rejection rationale required", 400);
      }
      res.json(manager.core.rejectIdentityProposal(ownerId, entityUuid, rationale));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/proposals/:entityUuid/withdraw", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const ownerId = requireOwner(userId);
      const entityUuid = String(req.params.entityUuid ?? "");
      res.json(manager.core.withdrawIdentityProposal(ownerId, entityUuid));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/change-proposals", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
      res.json(manager.core.getChangeProposals(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/change-proposals/:entityUuid", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const entityUuid = String(req.params.entityUuid ?? "");
      const detail = manager.core.getChangeProposal(ownerId, entityUuid);
      if (!detail) {
        throw new AppError("not_found", "change proposal not found", 404);
      }
      res.json(detail);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/change-proposals/ashley-position", (req, res) => {
    try {
      const { userId, entityUuid, position } = req.body as {
        userId?: string;
        entityUuid?: string;
        position?: "affirm" | "object" | "defer";
      };
      const ownerId = requireOwner(userId);
      if (
        typeof entityUuid !== "string" ||
        !position ||
        !["affirm", "object", "defer"].includes(position)
      ) {
        throw new AppError("message_required", "Ashley position fields required", 400);
      }
      res.json(
        manager.core.recordChangeProposalAshleyPosition({ ownerId, entityUuid, position }),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/change-proposals/doc-decision", (req, res) => {
    try {
      const { userId, entityUuid, decision } = req.body as {
        userId?: string;
        entityUuid?: string;
        decision?: "approve" | "reject" | "defer";
      };
      const ownerId = requireOwner(userId);
      if (
        typeof entityUuid !== "string" ||
        !decision ||
        !["approve", "reject", "defer"].includes(decision)
      ) {
        throw new AppError("message_required", "Doc decision fields required", 400);
      }
      res.json(
        manager.core.recordChangeProposalDocDecision({ ownerId, entityUuid, decision }),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/change-proposals/external-outcome", (req, res) => {
    try {
      const { userId, entityUuid, outcome, note } = req.body as {
        userId?: string;
        entityUuid?: string;
        outcome?: "committed" | "deployed" | "abandoned";
        note?: string;
      };
      const ownerId = requireOwner(userId);
      if (
        typeof entityUuid !== "string" ||
        !outcome ||
        !["committed", "deployed", "abandoned"].includes(outcome)
      ) {
        throw new AppError("message_required", "External outcome fields required", 400);
      }
      res.json(
        manager.core.recordChangeProposalExternalOutcome({
          ownerId,
          entityUuid,
          outcome,
          note,
        }),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/external/actions", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
      res.json(manager.core.getExternalActions(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/external/actions/:entityUuid", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const entityUuid = String(req.params.entityUuid ?? "");
      const detail = manager.core.getExternalAction(ownerId, entityUuid);
      if (!detail) {
        throw new AppError("not_found", "external action not found", 404);
      }
      res.json(detail);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/external/accounts", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getExternalAccounts(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/external/actions/:entityUuid/cancel", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const ownerId = requireOwner(userId);
      const entityUuid = String(req.params.entityUuid ?? "");
      res.json(manager.core.cancelExternalAction(ownerId, entityUuid));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/external/actions/:entityUuid/reconcile", (req, res) => {
    try {
      const { userId, outcome } = req.body as {
        userId?: string;
        outcome?: "committed" | "partially_delivered" | "aborted" | "outcome_unknown";
      };
      const ownerId = requireOwner(userId);
      const entityUuid = String(req.params.entityUuid ?? "");
      if (
        !outcome ||
        !["committed", "partially_delivered", "aborted", "outcome_unknown"].includes(outcome)
      ) {
        throw new AppError("message_required", "reconcile outcome required", 400);
      }
      res.json(manager.core.reconcileExternalAction(ownerId, entityUuid, outcome));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/external/credentials/:credentialRef/revoke", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const ownerId = requireOwner(userId);
      const credentialRef = String(req.params.credentialRef ?? "");
      res.json(manager.core.revokeExternalCredential(ownerId, credentialRef));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/external/emergency-stop", (req, res) => {
    try {
      const { userId, active } = req.body as { userId?: string; active?: boolean };
      const ownerId = requireOwner(userId);
      if (typeof active !== "boolean") {
        throw new AppError("message_required", "active boolean required", 400);
      }
      res.json(manager.core.setExternalEmergencyStop(ownerId, active));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/sandbox/approve", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const userId = typeof body.userId === "string" ? body.userId : undefined;
      const ownerId = requireOwner(userId);
      res.json({ envelope: signSandboxApproval(ownerId, body) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/sandbox/tombstone/sign", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const userId = typeof body.userId === "string" ? body.userId : undefined;
      const ownerId = requireOwner(userId);
      res.json({ envelope: signSandboxTombstone(ownerId, body) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  function approvalFailure(
    result: { ok: false; errorCode: string; reason: string },
  ): never {
    if (result.errorCode === "unknown_approval_proposal") {
      throw new AppError("unknown_approval_proposal", result.reason, 404);
    }
    throw new AppError(approvalErrorCode(result.errorCode), result.reason, 400);
  }

  function approvalErrorCode(errorCode: string): ErrorCode {
    const known: readonly ErrorCode[] = [
      "approval_owner_mismatch",
      "approval_capability_missing",
      "approval_invalid_risk_class",
      "approval_no_target_paths",
      "approval_too_many_target_paths",
      "approval_invalid_path_intent",
      "approval_invalid_persistence",
      "approval_network_mode_unsupported",
      "approval_policy_unbound",
      "approval_not_approvable",
      "approval_not_rejectable",
      "approval_not_withdrawable",
      "approval_not_staleable",
      "approval_not_resumable",
      "approval_update_failed",
      "approval_session_unbound",
      "approval_stale_policy",
      "owner_approval_key_unavailable",
      "broker_client_unavailable",
      "policy_unavailable",
      "unknown_session",
      "session_not_awaiting_owner",
    ];
    return known.includes(errorCode as ErrorCode) ? (errorCode as ErrorCode) : "internal_error";
  }

  app.get("/sandbox/approvals", (req, res) => {
    try {
      const ownerId = requireOwner(String(req.query.owner_id ?? ""));
      const status =
        typeof req.query.status === "string" && req.query.status.length > 0
          ? (req.query.status as SandboxApprovalProposalStatus)
          : null;
      res.json({
        proposals: approvalService(ownerId).listProposals({ status }),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/sandbox/approvals/:proposalId", (req, res) => {
    try {
      const ownerId = requireOwner(String(req.query.owner_id ?? ""));
      const proposal = approvalService(ownerId).getProposal(req.params.proposalId);
      if (proposal === null) {
        throw new AppError("unknown_approval_proposal", "proposal not found", 404);
      }
      res.json({ proposal });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/sandbox/approvals", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const created = approvalService(ownerId).createProposal({
        ownerId,
        taskId: typeof body.taskId === "string" ? body.taskId : null,
        sessionUuid: typeof body.sessionUuid === "string" ? body.sessionUuid : null,
        capabilityId: String(body.capabilityId ?? "") as SandboxCapabilityId,
        authoritativeRiskClass: String(body.authoritativeRiskClass ?? "") as SandboxRiskClass,
        affectedCanonicalPaths: Array.isArray(body.affectedCanonicalPaths)
          ? (body.affectedCanonicalPaths as SandboxApprovalPathTarget[])
          : [],
        policyRuleId: String(body.policyRuleId ?? ""),
        policyId: String(body.policyId ?? ""),
        policyVersion: Number(body.policyVersion ?? NaN),
        policyHash: String(body.policyHash ?? ""),
        recipeId: typeof body.recipeId === "string" ? body.recipeId : null,
        executableId: typeof body.executableId === "string" ? body.executableId : null,
        persistence: String(body.persistence ?? "temporary") as "temporary" | "persistent",
        requiresNetwork: body.requiresNetwork === true,
        externalSideEffect: body.externalSideEffect === true,
        modelSummary: typeof body.modelSummary === "string" ? body.modelSummary : null,
        source: String(body.source ?? "policy_precheck") as SandboxApprovalProposalSource,
      });
      if (!created.ok) {
        throw new AppError(approvalErrorCode(created.errorCode), created.reason, 400);
      }
      res.status(201).json({ proposal: created.value });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/sandbox/approvals/:proposalId/approve", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const result = approvalService(ownerId).approveProposal(req.params.proposalId, {
        reason: typeof body.reason === "string" ? body.reason : null,
      });
      if (!result.ok) approvalFailure(result);
      res.json({ proposal: result.value });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/sandbox/approvals/:proposalId/reject", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const result = approvalService(ownerId).rejectProposal(
        req.params.proposalId,
        typeof body.reason === "string" ? body.reason : null,
      );
      if (!result.ok) approvalFailure(result);
      res.json({ proposal: result.value });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/sandbox/approvals/:proposalId/withdraw", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const result = approvalService(ownerId).withdrawProposal(
        req.params.proposalId,
        typeof body.reason === "string" ? body.reason : null,
      );
      if (!result.ok) approvalFailure(result);
      res.json({ proposal: result.value });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/sandbox/approvals/:proposalId/resume", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const ownerId = requireOwner(
        typeof body.userId === "string" ? body.userId : undefined,
      );
      const result = await approvalService(ownerId).resumeSession(req.params.proposalId);
      if (!result.ok) approvalFailure(result);
      res.json({ proposal: result.value.proposal, session: result.value.session });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/sessions", (_req, res) => {
    res.json({ activeSessionId: null });
  });

  app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const client = {
      write: (data: object) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      },
    };
    manager.addSseClient(client);
    req.on("close", () => manager.removeSseClient(client));
  });

  app.post("/session/start", (_req, res) => {
    res.json({ sessionId: manager.startSession() });
  });

  app.post("/chat", gone);

  app.post(
    "/chat/ingress",
    (req, res, next) => {
      try {
        createCognitiveIngressHandler({
          sidecar: getCognitiveSidecar(),
          nuclearDb: manager.core.getDatabase(),
          authorizeOwner: (userId) => { requireOwner(userId); },
          maxMessageLength: MAX_DISCORD_MESSAGE,
        })(req, res, next);
      } catch (err) {
        const { status, body } = toErrorResponse(err);
        res.status(status).json(body);
      }
    },
  );

  app.post("/chat/text", async (req, res) => {
    try {
      const {
        message,
        userId,
        channel,
        threadId,
        auditSessionId,
        discordPresence,
        inboundDiscordMessageIds,
        finalFragmentReceivedAtMs,
        externalTransportHardDeadlineAtMs,
        attachments,
      } = req.body as {
        message?: string;
        userId?: string;
        channel?: string;
        threadId?: string;
        auditSessionId?: string;
        discordPresence?: string;
        inboundDiscordMessageIds?: string[];
        finalFragmentReceivedAtMs?: number;
        externalTransportHardDeadlineAtMs?: number;
        attachments?: Array<{
          discordAttachmentId: string;
          declaredMime: string;
          fileName: string;
          declaredByteSize?: number;
          sourceUrl: string;
        }>;
      };
      const owner = requireOwner(userId);
      if (!message?.trim()) {
        throw new AppError("message_required", "message required", 400);
      }
      if (message.length > MAX_DISCORD_MESSAGE) {
        throw new AppError("message_too_long", "message too long", 400);
      }
      const delivery =
        Array.isArray(inboundDiscordMessageIds) &&
        inboundDiscordMessageIds.length > 0 &&
        typeof finalFragmentReceivedAtMs === "number"
          ? {
              inboundDiscordMessageIds,
              finalFragmentReceivedAtMs,
              externalTransportHardDeadlineAtMs,
            }
          : undefined;
      const result = await manager.handleTextChat(
        message.trim(),
        owner,
        channel ?? "discord",
        threadId,
        auditSessionId,
        undefined,
        discordPresence,
        delivery,
        attachments,
      );
      if (result.duplicate) {
        res.status(202).json({
          ...result,
          statusUrl: result.statusUrl ?? `/delivery/${result.reservationId}`,
        });
        return;
      }
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/delivery/pending", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      const lane = typeof req.query.lane === "string" ? req.query.lane : undefined;
      const owner = requireOwner(ownerId || undefined);
      res.json({
        deliveries: manager.core.getPendingDeliveries(owner, { lane }),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/delivery/claim", (req, res) => {
    try {
      const owner = requireOwner((req.body as { userId?: string }).userId);
      const { lane } = (req.body ?? {}) as {
        lane?: string;
      };
      const claimed = manager.core.claimPendingDeliveries(owner, {
        lane,
      });
      res.json({ deliveries: claimed });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/delivery/:id", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      const owner = requireOwner(ownerId || undefined);
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        throw new AppError("not_found", "reservation not found", 404);
      }
      const status = manager.core.getDeliveryStatus(owner, id);
      if (!status) {
        throw new AppError("not_found", "reservation not found", 404);
      }
      res.json(status);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/delivery/:id/receipt", (req, res) => {
    try {
      const owner = requireOwner(
        (req.body as { userId?: string }).userId,
      );
      const id = Number(req.params.id);
      const { ordinal, discordMessageId } = req.body as {
        ordinal?: number;
        discordMessageId?: string;
      };
      if (
        !Number.isFinite(id) ||
        typeof ordinal !== "number" ||
        !discordMessageId?.trim()
      ) {
        throw new AppError("message_required", "ordinal and discordMessageId required", 400);
      }
      manager.core.receiptDeliveryBubble(
        owner,
        id,
        ordinal,
        discordMessageId.trim(),
      );
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/delivery/:id/auxiliary", (req, res) => {
    try {
      const owner = requireOwner(
        (req.body as { userId?: string }).userId,
      );
      const id = Number(req.params.id);
      const { kind, text, discordMessageId } = req.body as {
        kind?: "progress" | "delivery_error";
        text?: string;
        discordMessageId?: string;
      };
      if (
        !Number.isFinite(id) ||
        (kind !== "progress" && kind !== "delivery_error") ||
        !text?.trim() ||
        !discordMessageId?.trim()
      ) {
        throw new AppError("message_required", "kind, text, discordMessageId required", 400);
      }
      manager.core.receiptDeliveryAuxiliary(owner, id, {
        kind,
        text: text.trim(),
        discordMessageId: discordMessageId.trim(),
      });
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/delivery/:id/finalize", (req, res) => {
    try {
      const owner = requireOwner(
        (req.body as { userId?: string }).userId,
      );
      const id = Number(req.params.id);
      const { cause, auditSessionId } = req.body as {
        cause?:
          | "complete"
          | "cancel"
          | "send_failure"
          | "first_bubble_deadline"
          | "delivery_lease";
        auditSessionId?: string;
      };
      if (!Number.isFinite(id)) {
        throw new AppError("not_found", "reservation not found", 404);
      }
      const result = manager.core.finalizeDeliveryReservation(
        owner,
        id,
        cause ?? "complete",
        (text) => {
          if (!auditSessionId) return;
          manager.logger.append({
            ts: new Date().toISOString(),
            role: "assistant",
            text,
            source: "nuclear",
            session_id: auditSessionId,
            model: "delivery",
          });
        },
      );
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/chat/preflight", (req, res) => {
    try {
      const { message } = req.body as { message?: string };
      const text = message?.trim() ?? "";
      if (!text) throw new AppError("message_required", "message required", 400);
      res.json({ lookup: manager.core.lookupPreflight(text) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/signals/reaction", (req, res) => {
    try {
      const { userId, messageId, emoji } = req.body as {
        userId?: string;
        messageId?: string;
        emoji?: string;
      };
      const owner = requireOwner(userId);
      if (!messageId?.trim() || !emoji?.trim()) {
        throw new AppError("message_required", "messageId and emoji required", 400);
      }
      res.json(
        manager.core.recordReaction(owner, {
          messageId: messageId.trim(),
          emoji: emoji.trim(),
        }),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/signals/gif-feedback", (req, res) => {
    try {
      const { userId, query, success } = req.body as {
        userId?: string;
        query?: string;
        success?: boolean;
      };
      const owner = requireOwner(userId);
      manager.core.recordGifFeedback(owner, {
        query: (query ?? "").trim().slice(0, 200),
        success: success === true,
      });
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/signals/gif-queries", (req, res) => {
    try {
      const ownerId =
        typeof req.query.owner_id === "string"
          ? req.query.owner_id
          : env.discordOwnerId;
      requireOwner(ownerId || undefined);
      res.json({
        queries: manager.core.listSuccessfulGifQueries(ownerId!),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/signals/emoji-weight", (req, res) => {
    try {
      const { userId, emoji, context, positive } = req.body as {
        userId?: string;
        emoji?: string;
        context?: string;
        positive?: boolean;
      };
      const owner = requireOwner(userId);
      if (!emoji?.trim() || !context?.trim()) {
        throw new AppError("message_required", "emoji and context required", 400);
      }
      const weight = manager.core.recordEmojiWeight(
        owner,
        emoji.trim().slice(0, 32),
        context.trim().slice(0, 64),
        positive === true,
      );
      res.json({ ok: true, weight });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/memory/pin", (req, res) => {
    try {
      const { userId, text, sensitivity } = req.body as {
        userId?: string;
        text?: string;
        sensitivity?: "none" | "private";
      };
      const owner = requireOwner(userId);
      if (!text?.trim()) {
        throw new AppError("message_required", "text required", 400);
      }
      const fact = manager.core.pinMemory(
        owner,
        text.trim(),
        sensitivity ?? "none",
      );
      res.json({ ok: true, fact });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/memory/summary", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(
        manager.core.getMemorySummary(
          ownerId,
          req.query.include_private === "true",
        ),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/memory/newthread", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      res.json({ threadId: manager.core.newThread(owner) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/memory/forget", (req, res) => {
    try {
      const {
        userId,
        topic,
        confirmed,
        previewId,
        confirmationDiscordMessageId,
        cancel,
      } = req.body as {
        userId?: string;
        topic?: string;
        confirmed?: boolean;
        previewId?: string;
        confirmationDiscordMessageId?: string;
        cancel?: boolean;
      };
      const owner = requireOwner(userId);
      if (cancel === true) {
        if (!previewId?.trim()) {
          throw new AppError("message_required", "previewId required", 400);
        }
        res.json(
          manager.core.forget(owner, topic?.trim() ?? "", false, {
            previewId: previewId.trim(),
            cancel: true,
          }),
        );
        return;
      }
      if (confirmed === true && previewId?.trim()) {
        res.json(
          manager.core.forget(owner, topic?.trim() ?? "", true, {
            previewId: previewId.trim(),
          }),
        );
        return;
      }
      if (confirmed === true) {
        throw new AppError(
          "message_required",
          "previewId required for confirmation",
          400,
        );
      }
      if (!topic?.trim() && !previewId?.trim()) {
        throw new AppError("message_required", "topic required", 400);
      }
      res.json(
        manager.core.forget(owner, topic?.trim() ?? "", false, {
          previewId: previewId?.trim(),
          confirmationDiscordMessageId:
            confirmationDiscordMessageId?.trim() ?? null,
        }),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/memory/forget/bind", (req, res) => {
    try {
      const { userId, previewId, confirmationDiscordMessageId } = req.body as {
        userId?: string;
        previewId?: string;
        confirmationDiscordMessageId?: string;
      };
      const owner = requireOwner(userId);
      if (!previewId?.trim() || !confirmationDiscordMessageId?.trim()) {
        throw new AppError(
          "message_required",
          "previewId and confirmationDiscordMessageId required",
          400,
        );
      }
      manager.core.bindForgetConfirmation(
        owner,
        previewId.trim(),
        confirmationDiscordMessageId.trim(),
      );
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/memory/forget/resolve", (req, res) => {
    try {
      const { userId, confirmationDiscordMessageId } = req.body as {
        userId?: string;
        confirmationDiscordMessageId?: string;
      };
      const owner = requireOwner(userId);
      if (!confirmationDiscordMessageId?.trim()) {
        throw new AppError(
          "message_required",
          "confirmationDiscordMessageId required",
          400,
        );
      }
      const previewId = manager.core.resolveForgetPreviewByDiscordMessage(
        owner,
        confirmationDiscordMessageId.trim(),
      );
      res.json({ previewId });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/debug/memory-context", (req, res) => {
    if (env.nodeEnv === "production") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const ownerId = String(req.query.owner_id ?? "");
      const message = String(req.query.message ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.debugMemoryContext(ownerId, message));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/cancel", (req, res) => {
    try {
      const { userId, reservationId } = req.body as {
        userId?: string;
        reservationId?: number;
      };
      const owner = requireOwner(userId);
      if (typeof reservationId !== "number") {
        throw new AppError(
          "message_required",
          "reservationId required",
          400,
        );
      }
      const result = manager.cancel(reservationId, owner);
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/curiosity/tick", async (_req, res) => {
    try {
      const ownerId = env.memoryOwnerId || env.discordOwnerId || "default";
      const result = await manager.core.runCuriosityTick(ownerId);
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/curiosity/status", (req, res) => {
    try {
      const ownerId =
        typeof req.query.owner_id === "string"
          ? req.query.owner_id
          : env.memoryOwnerId || env.discordOwnerId || "default";
      res.json(manager.core.getCuriosityStatus(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/tick", async (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      if (manager.isPaused()) {
        throw new AppError("agent_not_ready", "Agent not ready", 503);
      }
      res.json(await manager.core.tickProactive(owner));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/commit", async (req, res) => {
    try {
      const body = req.body as {
        userId?: string;
        reservationId?: number;
        deliveryReservationId?: number;
        text?: string;
        threadId?: string;
        angle?: string;
        discordMessageId?: string;
        bubbleReceipts?: Array<{ ordinal: number; discordMessageId: string }>;
        partial?: boolean;
      };
      const owner = requireOwner(body.userId);
      if (body.reservationId !== undefined || body.deliveryReservationId !== undefined) {
        manager.core.commitProactive(owner, {
          reservationId: body.reservationId,
          deliveryReservationId: body.deliveryReservationId,
          text: body.text ?? "",
          threadId: body.threadId ?? "",
          angle: body.angle ?? "check_in",
          reason: "commit",
          discordMessageId: body.discordMessageId ?? "",
          bubbleReceipts: body.bubbleReceipts,
          partial: body.partial === true,
        });
      } else if (body.text && body.threadId && body.discordMessageId) {
        manager.core.commitProactive(owner, {
          text: body.text,
          threadId: body.threadId,
          angle: body.angle ?? "check_in",
          reason: "commit",
          discordMessageId: body.discordMessageId,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/abort", (req, res) => {
    try {
      const { userId, reservationId } = req.body as {
        userId?: string;
        reservationId?: number;
      };
      const owner = requireOwner(userId);
      if (typeof reservationId === "number") {
        manager.core.abortProactive(owner, reservationId);
      }
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/pause", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      manager.core.pauseProactive(owner);
      res.json({ ok: true, paused: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/resume", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      manager.core.resumeProactive(owner);
      res.json({ ok: true, paused: false });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/evaluate", async (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      const result = await manager.core.evaluateProactive(owner);
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/generate", async (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      const result = await manager.core.generateProactive(owner);
      if (!result.shouldSend) {
        throw new AppError("initiative_skipped", result.reason, 409);
      }
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/initiative/status", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        if (!ownerId || (env.discordOwnerId && ownerId !== env.discordOwnerId)) {
          throw new AppError("forbidden", "Forbidden", 403);
        }
      }
      res.json(manager.core.getProactiveStatus(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/initiative/operational-status", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getProactiveOperationalStatus(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/initiative/urgent", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json({ urgent: manager.core.hasUrgentCognition(ownerId) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/habits/upsert", gone);
  app.get("/habits/list", gone);
  app.post("/habits/pause", gone);
  app.post("/reminders/create", gone);
  app.post("/scheduler/tick", gone);
  app.post("/scheduler/commit", gone);
  app.post("/actions/propose", gone);
  app.post("/actions/resolve", gone);

  app.post("/pause", async (_req, res) => {
    await manager.pause();
    res.json({ ok: true });
  });

  app.post("/resume", async (_req, res) => {
    await manager.resume();
    res.json({ ok: true });
  });

  app.post("/shutdown", async (_req, res) => {
    await manager.shutdown();
    res.json({ ok: true });
  });

  assertRegisteredRoutes(app);
  return app;
}

export function listen(app: express.Express): Server {
  return app.listen(env.agentPort, env.agentBindHost, () => {
    console.log(
      `[agent-service] listening on http://${env.agentBindHost}:${env.agentPort}`,
    );
  });
}
