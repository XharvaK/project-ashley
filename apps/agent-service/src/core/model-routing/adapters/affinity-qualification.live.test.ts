/**
 * THOUGHT-AFFINITY-QUALIFICATION-01 — bounded live provider qualification.
 *
 * GATED: this file does nothing unless ASHLEY_LIVE_QUALIFY=1 is set in the
 * operator shell. It never runs in CI, never touches production databases,
 * cognition, memory, or conversation state. It dispatches exactly 8 synthetic
 * Thought-shaped requests through the REAL production path
 * (completeChat -> Model Fabric -> Cloudflare adapter -> real fetch) against:
 *
 *   POST /accounts/{account}/ai/v1/chat/completions
 *   model @cf/deepseek-ai/deepseek-v4-flash-0731
 *
 * Required operator shell exports before running (never committed):
 *
 *   CLOUDFLARE_API_TOKEN=...
 *   CLOUDFLARE_ACCOUNT_ID=...
 *   ASHLEY_LIVE_QUALIFY=1
 *   npx vitest run src/core/model-routing/adapters/affinity-qualification.live.test.ts
 *
 * Run from apps/agent-service. Budget: 8 provider calls, no retry.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { completeChat } from "../../../mistral-client.js";
import { env, refreshEnvFromProcess } from "../../../env.js";
import { openNuclearDb } from "../../db.js";
import { withOfflineAppGateDisabled } from "../../qualification/offline-test-helpers.js";
import { thoughtOutputStructuredRequest } from "../../cognitive-v021/thought/output-contract.js";
import { buildOperationalEffectNamespaceFromRefs } from "../../cognitive-v021/effect/effect-ref.js";
import { providerHttpStatusFromBoundary } from "../types.js";
import type { ChatMessage } from "../types.js";

const LIVE = process.env.ASHLEY_LIVE_QUALIFY === "1";

/** Synthetic qualification affinity id. Non-secret, never the production id. */
const QUAL_AFFINITY_ID = "live-qual-synthetic-affinity-B01";

const AFFINITY_ENV_VAR = "ASHLEY_CLOUDFLARE_THOUGHT_AFFINITY_ID";
const originalAffinityEnv = process.env[AFFINITY_ENV_VAR];

afterEach(() => {
  if (originalAffinityEnv === undefined) delete process.env[AFFINITY_ENV_VAR];
  else process.env[AFFINITY_ENV_VAR] = originalAffinityEnv;
  refreshEnvFromProcess();
});

function sha8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

/**
 * Deterministic ~30KB synthetic stable prefix per family. Families differ in
 * namespace; variants mutate per the A/B quartet design. No owner data, no
 * memory content, no secrets.
 */
function buildStablePrefix(family: "A" | "B", earlyMutation: boolean): string {
  const lines: string[] = [
    `SYNTHETIC PREFIX FAMILY ${family} — Thought affinity cache-locality qualification only.`,
  ];
  for (let i = 0; i < 100; i += 1) {
    const head = i === 0 && earlyMutation
      ? `block 0000 family-${family} EARLY-MUTATION probe variant with divergent opening tokens. `
      : `block ${String(i).padStart(4, "0")} family-${family} stable synthetic context for prefix-cache measurement. `;
    lines.push(head + "synthetic stable context for prefix-cache measurement. ".repeat(5));
  }
  return lines.join("\n");
}

const TAIL_FIXED = "Summarize the counting task in one short sentence.";
const TAIL_LATE_MUTATION = "Summarize the counting task in one short sentence, then name the color blue.";

function buildMessages(family: "A" | "B", variant: 1 | 2 | 3 | 4): ChatMessage[] {
  const system = buildStablePrefix(family, variant === 4);
  const user = variant === 3 ? TAIL_LATE_MUTATION : TAIL_FIXED;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

type QualRow = {
  ordinal: number;
  family: "A" | "B";
  variant: number;
  affinityExpected: boolean;
  httpStatus: number | null;
  failureCode: string | null;
  sessionAffinityApplied: boolean | null;
  affinityPolicy: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  neuronUsage: number | null;
  elapsedMs: number | null;
  finishReason: string | null;
  providerModel: string | null;
  providerRequestIdPresent: boolean;
  messagesDigest: string;
};

describe.skipIf(!LIVE)("thought affinity live qualification (bounded, 8 calls)", () => {
  it("runs the A/B prefix-cache quartet against the exact Thought route", async () => {
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("live qualification requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the operator shell");
    }
    // The env module snapshot was taken at import; re-read operator exports.
    refreshEnvFromProcess();
    if (!env.cloudflareApiToken || !env.cloudflareAccountId) {
      throw new Error("live qualification credentials did not reach the env snapshot; export them before launching vitest");
    }

    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const namespace = buildOperationalEffectNamespaceFromRefs(["effect:cycle-specific"]);
    const rows: QualRow[] = [];
    let providerCalls = 0;

    const plan: Array<{ family: "A" | "B"; variant: 1 | 2 | 3 | 4; affinity: boolean }> = [
      { family: "A", variant: 1, affinity: false },
      { family: "B", variant: 1, affinity: true },
      { family: "A", variant: 2, affinity: false },
      { family: "B", variant: 2, affinity: true },
      { family: "A", variant: 3, affinity: false },
      { family: "B", variant: 3, affinity: true },
      { family: "A", variant: 4, affinity: false },
      { family: "B", variant: 4, affinity: true },
    ];

    try {
      for (const [index, step] of plan.entries()) {
        if (step.affinity) process.env[AFFINITY_ENV_VAR] = QUAL_AFFINITY_ID;
        else delete process.env[AFFINITY_ENV_VAR];
        refreshEnvFromProcess();

        const messages = buildMessages(step.family, step.variant);
        const messagesDigest = sha8(JSON.stringify(messages));
        const row: QualRow = {
          ordinal: index + 1,
          family: step.family,
          variant: step.variant,
          affinityExpected: step.affinity,
          httpStatus: null,
          failureCode: null,
          sessionAffinityApplied: null,
          affinityPolicy: null,
          inputTokens: null,
          cachedInputTokens: null,
          completionTokens: null,
          reasoningTokens: null,
          neuronUsage: null,
          elapsedMs: null,
          finishReason: null,
          providerModel: null,
          providerRequestIdPresent: false,
          messagesDigest,
        };
        try {
          const result = await withOfflineAppGateDisabled(() => completeChat(messages, {
            attentionDb: db,
            purpose: "thought",
            logicalRole: "thought",
            route: "thought",
            responseFormat: "json_schema",
            structuredOutput: thoughtOutputStructuredRequest(namespace),
            temperature: 1.0,
            maxTokens: 64,
            deadlineAtMs: Date.now() + 180_000,
          }));
          providerCalls += 1;
          const terminalAttempt = result.modelFabric?.receipt?.receiptStage === "resolved"
            ? result.modelFabric.receipt.attempts.at(-1)
            : null;
          row.httpStatus = terminalAttempt?.receiptStage === "provider_response"
            ? (terminalAttempt.providerHttpStatus ?? null)
            : null;
          row.sessionAffinityApplied = result.providerBoundaryTransport?.sessionAffinityApplied ?? null;
          row.affinityPolicy = result.providerBoundaryTransport?.affinityPolicy ?? null;
          row.inputTokens = result.usage?.promptTokens ?? null;
          row.cachedInputTokens = result.usage?.cachedTokens ?? null;
          row.completionTokens = result.usage?.completionTokens ?? null;
          row.reasoningTokens = result.usage?.reasoningTokens ?? null;
          row.neuronUsage = result.usage?.neuronUsage ?? null;
          row.elapsedMs = result.providerBoundaryTiming?.elapsedMs ?? null;
          row.finishReason = result.finishReason ?? null;
          row.providerModel = result.providerModel ?? null;
          row.providerRequestIdPresent = result.providerRequestId != null;
        } catch (error) {
          providerCalls += 1;
          const code = (error as { code?: unknown })?.code;
          row.failureCode = typeof code === "string" ? code : "unknown_error";
          row.httpStatus = providerHttpStatusFromBoundary(error) ?? null;
          const { providerBoundaryTransportFromError } = await import("../types.js");
          const transport = providerBoundaryTransportFromError(error);
          row.sessionAffinityApplied = transport?.sessionAffinityApplied ?? null;
          row.affinityPolicy = transport?.affinityPolicy ?? null;
        }
        rows.push(row);
        // eslint-disable-next-line no-console
        console.log(`QUAL_ROW ${JSON.stringify(row)}`);

        // Early stop: wrong credentials invalidate every further call.
        if (row.failureCode === "credential_invalid" || row.httpStatus === 401 || row.httpStatus === 403) {
          // eslint-disable-next-line no-console
          console.log(`QUAL_STOP auth failure at ordinal ${row.ordinal}; credentials must be fixed before any rerun`);
          break;
        }
        // Early stop: treatment applied-flag mismatch invalidates the B cohort.
        if (step.affinity && row.sessionAffinityApplied !== true) {
          // eslint-disable-next-line no-console
          console.log(`QUAL_STOP treatment ordinal ${row.ordinal} did not apply affinity; gate/binding assumption is wrong, stopping to preserve budget`);
          break;
        }
        if (!step.affinity && row.sessionAffinityApplied !== false && row.sessionAffinityApplied !== null) {
          // eslint-disable-next-line no-console
          console.log(`QUAL_STOP control ordinal ${row.ordinal} unexpectedly applied affinity; stopping to preserve budget`);
          break;
        }
      }
    } finally {
      db.close();
    }

    // eslint-disable-next-line no-console
    console.log(`QUAL_SUMMARY ${JSON.stringify({ providerCalls, rows: rows.length })}`);
    // The harness log above is the evidence; assertions only guard mechanics.
    expect(providerCalls).toBeLessThanOrEqual(8);
    expect(rows.length).toBeGreaterThan(0);
  }, 1_800_000);
});
