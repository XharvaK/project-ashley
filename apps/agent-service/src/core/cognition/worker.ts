import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { completeChat } from "../../mistral-client.js";
import { createEpisode, listUnconsolidatedMessages } from "../memory/episodes.js";
import { upsertFact, type FactCategory } from "../memory/facts.js";
import { applyAffectiveEvent, decayAffect } from "../state/affect.js";
import { upsertMindStateItem } from "../state/mind-items.js";
import { applyEligibleRevisions, proposeRevision, type RevisionLayer } from "../learning/revisions.js";
import { consolidateCuriosityRead } from "../curiosity/consolidate.js";
import type { CognitionMode, MindStateItemKind } from "../types.js";
import {
  capabilityCanInfluence,
  capabilityCanExecuteShadow,
  capabilityShadowDependenciesReady,
  recordLiveShadowEvent,
  type CapabilityName,
} from "../rollout/capabilities.js";
import {
  claimNextJob,
  completeJob,
  failJob,
  pruneCognitiveHistory,
  recoverCognitiveJobs,
  type CognitiveJob,
} from "./jobs.js";
import { isMutualCoPlanningText } from "../relationship/authority.js";
import { proposeMutualCommitment } from "../relationship/transitions.js";
import { relationshipCanRecord } from "../relationship/influence.js";
import { defaultUnclassifiedConversational } from "../privacy/classification.js";

export type CognitionAnalysis = {
  summary: string;
  entities: string[];
  salience: number;
  unresolved: boolean;
  stateItems: Array<{
    kind: MindStateItemKind;
    text: string;
    activation: number;
    urgency: number;
    dueAt?: string | null;
  }>;
  affect: {
    valenceDelta: number;
    activationDelta: number;
    opennessDelta: number;
    tensionDelta: number;
    reason: string;
  };
  revisions: Array<{
    layer: RevisionLayer;
    key: string;
    value: string;
    rationale: string;
  }>;
  facts: Array<{
    category: FactCategory;
    key: string;
    value: string;
    confidence: number;
    importance: number;
    explicit: boolean;
    sourceMessageId: number;
    sourceQuote: string;
  }>;
};

type Analyze = (transcript: string) => Promise<{ analysis: CognitionAnalysis; model: string; raw: string }>;
type CapabilityGate = (capability: CapabilityName) => boolean;

type ShadowContext = {
  recall?: { episodeId: number; summary: string; entities: string[]; salience: number };
  mindState?: {
    hasStateItems: boolean;
    hasAffect: boolean;
    stateItemCount: number;
    affectReason: string;
  };
};

function canShadowExecute(
  db: DatabaseSync,
  capability: CapabilityName,
): boolean {
  return (
    capabilityCanExecuteShadow(db, capability) &&
    capabilityShadowDependenciesReady(db, capability)
  );
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function analysisFrom(value: unknown, fallback: string): CognitionAnalysis {
  const root = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const stateKinds = new Set(["goal", "concern", "commitment", "interest", "unfinished"]);
  const revisionLayers = new Set(["dynamic_identity", "stable_identity", "opinion"]);
  const factCategories = new Set(["project", "preference", "person", "ongoing"]);
  const affect = typeof root.affect === "object" && root.affect !== null
    ? root.affect as Record<string, unknown>
    : {};
  return {
    summary: String(root.summary ?? fallback).trim().slice(0, 1600),
    entities: Array.isArray(root.entities)
      ? root.entities.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 24)
      : [],
    salience: Math.max(0, Math.min(1, number(root.salience, 0.5))),
    unresolved: root.unresolved === true,
    stateItems: Array.isArray(root.stateItems)
      ? root.stateItems.flatMap((raw) => {
          if (typeof raw !== "object" || raw === null) return [];
          const item = raw as Record<string, unknown>;
          const kind = String(item.kind);
          const text = String(item.text ?? "").trim();
          if (!stateKinds.has(kind) || !text) return [];
          return [{
            kind: kind as MindStateItemKind,
            text: text.slice(0, 600),
            activation: Math.max(0, Math.min(1, number(item.activation, 0.5))),
            urgency: Math.max(0, Math.min(1, number(item.urgency, 0))),
            dueAt: typeof item.dueAt === "string" ? item.dueAt : null,
          }];
        })
      : [],
    affect: {
      valenceDelta: Math.max(-0.25, Math.min(0.25, number(affect.valenceDelta))),
      activationDelta: Math.max(-0.25, Math.min(0.25, number(affect.activationDelta))),
      opennessDelta: Math.max(-0.25, Math.min(0.25, number(affect.opennessDelta))),
      tensionDelta: Math.max(-0.25, Math.min(0.25, number(affect.tensionDelta))),
      reason: String(affect.reason ?? "No material affect change.").trim().slice(0, 500),
    },
    revisions: Array.isArray(root.revisions)
      ? root.revisions.flatMap((raw) => {
          if (typeof raw !== "object" || raw === null) return [];
          const item = raw as Record<string, unknown>;
          const layer = String(item.layer);
          const key = String(item.key ?? "").trim();
          const candidate = String(item.value ?? "").trim();
          if (!revisionLayers.has(layer) || !key || !candidate) return [];
          return [{
            layer: layer as RevisionLayer,
            key: key.slice(0, 120),
            value: candidate.slice(0, 1000),
            rationale: String(item.rationale ?? "").trim().slice(0, 1000),
          }];
        })
      : [],
    facts: Array.isArray(root.facts)
      ? root.facts.flatMap((raw) => {
          if (typeof raw !== "object" || raw === null) return [];
          const item = raw as Record<string, unknown>;
          const category = String(item.category);
          const key = String(item.key ?? "").trim();
          const factValue = String(item.value ?? "").trim();
          if (!factCategories.has(category) || !key || !factValue) return [];
          return [{
            category: category as FactCategory,
            key: key.slice(0, 120),
            value: factValue.slice(0, 1000),
            confidence: Math.max(0, Math.min(1, number(item.confidence, 0.8))),
            importance: Math.max(0, Math.min(100, number(item.importance, 50))),
            explicit: item.explicit === true,
            sourceMessageId: number(item.sourceMessageId, 0),
            sourceQuote: String(item.sourceQuote ?? "").normalize("NFC").replace(/\r\n?/g, "\n").slice(0, 1000),
          }];
        })
      : [],
  };
}

function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
}

async function analyzeWithMistral(transcript: string): ReturnType<Analyze> {
  if (!env.groqApiKey) {
    return {
      analysis: analysisFrom({}, transcript.replace(/\s+/g, " ").slice(0, 700)),
      model: "offline",
      raw: "{}",
    };
  }
  const response = await completeChat([
    {
      role: "system",
      content: [
        "Consolidate only the supplied conversation evidence into one episode.",
        "Return strict JSON with: summary, entities[], salience 0..1, unresolved boolean,",
        "stateItems[{kind: goal|concern|commitment|interest|unfinished,text,activation,urgency,dueAt}],",
        "affect{valenceDelta,activationDelta,opennessDelta,tensionDelta,reason},",
        "revisions[{layer:dynamic_identity|stable_identity|opinion,key,value,rationale}],",
        "facts[{category:project|preference|person|ongoing,key,value,confidence,importance,explicit,sourceMessageId,sourceQuote}].",
        "Mark explicit true only when Doc directly stated or corrected the fact in this transcript.",
        "Every explicit fact must cite a user message ID and an exact supporting quote copied from that message.",
        "Identity revision keys must be specific semantic slugs such as interest.modular_synthesis or taste.music, never generic words like interest or taste.",
        "Do not infer durable identity from politeness, praise, or a single instruction. Empty arrays are valid.",
      ].join(" "),
    },
    { role: "user", content: transcript },
  ], {
    maxTokens: 1100,
    temperature: 0.2,
    reasoningEffort: "medium",
    purpose: "exchange_cognition",
    route: "utility_bulk",
    lane: "exchange_cognition",
  });
  return {
    analysis: analysisFrom(parseJson(response.text), transcript.slice(0, 700)),
    model: response.model,
    raw: response.text,
  };
}

function logRun(
  db: DatabaseSync,
  job: CognitiveJob,
  input: unknown,
  output: unknown,
  status: "completed" | "failed",
  model: string | null,
  error: string | null,
  episodeId: number | null,
): void {
  db.prepare(
    `INSERT INTO cognitive_runs
       (job_id, owner_id, kind, model, input_json, output_json, status, error,
        created_at, episode_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    job.id,
    job.ownerId,
    job.kind,
    model,
    JSON.stringify(input),
    JSON.stringify(output),
    status,
    error,
    new Date().toISOString(),
    episodeId,
  );
}

function normalizedEvidenceText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n");
}

function supportsFactValue(quote: string, value: string): boolean {
  const ignored = new Set([
    "a", "an", "and", "are", "at", "doc", "i", "in", "is", "it",
    "me", "my", "of", "on", "the", "to", "was", "we",
  ]);
  const tokens = (text: string): Set<string> => new Set(
    normalizedEvidenceText(text)
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => !ignored.has(token)) ?? [],
  );
  const valueTokens = tokens(value);
  if (valueTokens.size === 0) return false;
  const quoteTokens = tokens(quote);
  let overlap = 0;
  for (const token of valueTokens) {
    if (quoteTokens.has(token)) overlap += 1;
  }
  return overlap / valueTokens.size >= 0.5;
}

export async function processNextCognitiveJob(
  db: DatabaseSync,
  mode: CognitionMode,
  analyze: Analyze = analyzeWithMistral,
  canInfluence: CapabilityGate = (capability) =>
    capabilityCanInfluence(db, capability, mode),
): Promise<boolean> {
  const job = claimNextJob(db);
  if (!job) return false;
  try {
    if (job.kind === "consolidate_curiosity") {
      const readId = Number(job.payload.readId ?? 0);
      if (!Number.isInteger(readId) || readId <= 0) throw new Error("invalid_read_id");
      const result = await consolidateCuriosityRead(
        db,
        job.ownerId,
        readId,
        canInfluence("curiosity_consolidation"),
      );
       db.exec("BEGIN IMMEDIATE");
      try {
        if (canShadowExecute(db, "curiosity_consolidation")) {
          recordLiveShadowEvent(db, "curiosity_consolidation", `read:${readId}`);
        }
        if (result.analysis.sourceProposals.length > 0) {
          if (canShadowExecute(db, "source_discovery")) {
            recordLiveShadowEvent(db, "source_discovery", `read:${readId}`);
          }
        }
        logRun(
          db,
          job,
          { readId, evidenceTrust: "untrusted" },
          result.analysis,
          "completed",
          result.model,
          null,
          null,
        );
        completeJob(db, job.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return true;
    }
    const threadId = String(job.payload.threadId ?? "");
    const messages = listUnconsolidatedMessages(db, job.ownerId, threadId, 24);
    if (messages.length < 2) {
      completeJob(db, job.id);
      return true;
    }
    const transcript = messages
      .map((message) => `[message:${message.id} role:${message.role}] ${message.text}`)
      .join("\n");
    const result = await analyze(transcript);
    db.exec("BEGIN IMMEDIATE");
    try {
      const recallCanInfluence = canInfluence("recall");
      const recallShadowReady = canShadowExecute(db, "recall");
      if (!recallCanInfluence && !recallShadowReady) {
        logRun(
          db,
          job,
          { threadId, messageIds: messages.map((message) => message.id) },
          {},
          "completed",
          result.model,
          null,
          null,
        );
        completeJob(db, job.id);
        db.exec("COMMIT");
        return true;
      }
      const episode = createEpisode(db, {
        ownerId: job.ownerId,
        threadId,
        summary: result.analysis.summary,
        entities: result.analysis.entities,
        messageIds: messages.map((message) => message.id),
        salience: result.analysis.salience,
        unresolved: result.analysis.unresolved,
        provenance: recallCanInfluence ? "live" : "shadow",
      });
      if (!episode) throw new Error("episode_creation_failed");
      const shadow: ShadowContext = {
        recall: {
          episodeId: episode.id,
          summary: result.analysis.summary,
          entities: result.analysis.entities,
          salience: result.analysis.salience,
        },
      };
      if (recallShadowReady) {
        recordLiveShadowEvent(db, "recall", `episode:${episode.id}`);
      }
       const hasStateItems = result.analysis.stateItems.length > 0;
        const hasAffect = [
          result.analysis.affect.valenceDelta,
          result.analysis.affect.activationDelta,
          result.analysis.affect.opennessDelta,
          result.analysis.affect.tensionDelta,
        ].some((value) => Math.abs(value) >= 0.01);
        if (hasStateItems || hasAffect) {
          shadow.mindState = {
            hasStateItems,
            hasAffect,
            stateItemCount: result.analysis.stateItems.length,
            affectReason: result.analysis.affect.reason,
          };
        }
        if (hasStateItems && canShadowExecute(db, "mind_state")) {
          recordLiveShadowEvent(db, "mind_state", `episode:${episode.id}`);
        }
        if (hasAffect && canShadowExecute(db, "affect")) {
          recordLiveShadowEvent(db, "affect", `episode:${episode.id}`);
        }
        if (
          result.analysis.revisions.length > 0 ||
          result.analysis.facts.length > 0
        ) {
          if (canShadowExecute(db, "learning")) {
            recordLiveShadowEvent(db, "learning", `episode:${episode.id}`);
          }
        }
        if (result.analysis.stateItems.some((item) =>
          (item.kind === "concern" || item.kind === "commitment") &&
          item.urgency >= 0.85)) {
          if (canShadowExecute(db, "relational_initiative")) {
            recordLiveShadowEvent(db, "relational_initiative", `episode:${episode.id}`);
          }
        }
      for (const revision of result.analysis.revisions) {
        proposeRevision(db, {
          ownerId: job.ownerId,
          targetLayer: revision.layer,
          targetKey: revision.key,
          proposedValue: revision.value,
          rationale: revision.rationale,
          evidenceType: "episode",
          evidenceId: episode.id,
          provenance: canInfluence("learning") ? "live" : "shadow",
        });
      }
      if (mode === "apply") {
        const messagesById = new Map(messages.map((message) => [message.id, message]));
        for (const fact of canInfluence("learning") ? result.analysis.facts : []) {
          if (!fact.explicit || fact.confidence < 0.8) continue;
          const source = messagesById.get(fact.sourceMessageId);
          const quote = normalizedEvidenceText(fact.sourceQuote);
          if (
            source?.role !== "user" ||
            !quote ||
            !normalizedEvidenceText(source.text).includes(quote) ||
            !supportsFactValue(quote, fact.value)
          ) {
            continue;
          }
          const factId = upsertFact(db, {
            ownerId: job.ownerId,
            category: fact.category,
            key: fact.key,
            value: fact.value,
            confidence: fact.confidence,
            importance: fact.importance,
            sourceMessageId: source.id,
            origin: "explicit_user",
            sourceQuote: quote,
          });
          if (factId) {
            const link = db.prepare(
              `INSERT OR IGNORE INTO evidence_links
                 (owner_id, target_type, target_id, source_type, source_id, created_at)
               VALUES (?, 'fact', ?, ?, ?, ?)`,
            );
            const now = new Date().toISOString();
            link.run(job.ownerId, String(factId), "episode", String(episode.id), now);
            link.run(job.ownerId, String(factId), "message", String(source.id), now);
          }
        }
        for (const item of canInfluence("mind_state") ? result.analysis.stateItems : []) {
          if (
            item.kind === "commitment" &&
            item.urgency < 0.85 &&
            isMutualCoPlanningText(item.text) &&
            relationshipCanRecord(db, mode)
          ) {
            proposeMutualCommitment(db, {
              ownerId: job.ownerId,
              text: item.text,
              sourceEntityType: "episode",
              sourceEntityUuid: String(episode.id),
              classification: defaultUnclassifiedConversational(),
            });
            continue;
          }
          upsertMindStateItem(db, {
            ownerId: job.ownerId,
            ...item,
            sourceType: "episode",
            sourceId: episode.id,
          });
        }
        if (canInfluence("affect")) {
          applyAffectiveEvent(db, {
            ownerId: job.ownerId,
            sourceType: "episode",
            sourceId: episode.id,
            ...result.analysis.affect,
          });
        }
        if (canInfluence("learning")) {
          applyEligibleRevisions(db, job.ownerId, mode);
        }
      }
      logRun(
        db,
        job,
        { threadId, messageIds: messages.map((message) => message.id) },
        result.analysis,
        "completed",
        result.model,
        null,
        episode.id,
      );
      completeJob(db, job.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.exec("BEGIN IMMEDIATE");
    try {
      logRun(db, job, job.payload, {}, "failed", null, message, null);
      failJob(db, job, message);
      db.exec("COMMIT");
    } catch (logError) {
      db.exec("ROLLBACK");
      throw logError;
    }
    return true;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startCognitionLoop(
  db: DatabaseSync,
  ownerId: string,
  mode: CognitionMode = env.cognitionMode,
): void {
  stopCognitionLoop();
  recoverCognitiveJobs(db);
  timer = setInterval(() => {
    if (running) return;
    running = true;
    decayAffect(db, ownerId);
    pruneCognitiveHistory(db, ownerId);
    void (async () => {
      for (let processed = 0; processed < 5; processed++) {
        if (!(await processNextCognitiveJob(db, mode))) break;
      }
    })().finally(() => {
      running = false;
    });
  }, Math.max(5, env.cognitionDispatchIntervalSec) * 1000);
}

export function stopCognitionLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}

export type ShadowCognitionAnalysis = {
  stateItems: Array<{
    kind: MindStateItemKind;
    text: string;
    activation: number;
    urgency: number;
    dueAt?: string | null;
  }>;
  affect: {
    valenceDelta: number;
    activationDelta: number;
    opennessDelta: number;
    tensionDelta: number;
    reason: string;
  };
  episodeId: number;
  summary: string;
  entities: string[];
  salience: number;
};

export function getLatestShadowAnalysis(
  db: DatabaseSync,
  ownerId: string,
  threadId: string,
  beforeMessageId: number,
): ShadowCognitionAnalysis | null {
  const run = db.prepare(
    `SELECT cr.output_json, cr.episode_id, e.summary, e.entities, e.salience
     FROM cognitive_runs cr
     JOIN episodes e ON e.id = cr.episode_id
     WHERE cr.owner_id = ?
       AND cr.status = 'completed'
       AND cr.kind = 'consolidate_thread'
       AND e.provenance = 'shadow'
       AND e.thread_id = ?
       AND e.source_end_message_id < ?
     ORDER BY e.source_end_message_id DESC LIMIT 1`,
  ).get(ownerId, threadId, beforeMessageId) as
    | { output_json: string; episode_id: number; summary: string; entities: string; salience: number }
    | undefined;
  if (!run) return null;
  const output = parseJson(run.output_json) as {
    stateItems?: Array<{
      kind: MindStateItemKind;
      text: string;
      activation: number;
      urgency: number;
      dueAt?: string | null;
    }>;
    affect?: {
      valenceDelta: number;
      activationDelta: number;
      opennessDelta: number;
      tensionDelta: number;
      reason: string;
    };
  };
  const entitiesStr = run.entities?.trim() ?? "";
  return {
    stateItems: output.stateItems ?? [],
    affect: output.affect ?? {
      valenceDelta: 0,
      activationDelta: 0,
      opennessDelta: 0,
      tensionDelta: 0,
      reason: "No material affect change.",
    },
    episodeId: run.episode_id,
    summary: run.summary,
    entities: entitiesStr ? entitiesStr.split(" ").filter(Boolean) : [],
    salience: run.salience,
  };
}
