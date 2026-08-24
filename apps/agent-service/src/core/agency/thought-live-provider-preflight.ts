/**
 * Live structured-Thought preflight. Does not mutate production nuclear.db
 * and does not execute M4. Invoke explicitly:
 *
 *   npx tsx src/core/agency/thought-live-provider-preflight.ts --live
 *   npx tsx src/core/agency/thought-live-provider-preflight.ts --live --provider groq --samples 3
 */
import { mkdirSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WorkspaceManager } from "@composer-assistant/sandbox-v2";
import { env, loadEnvFile, refreshEnvFromProcess } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { createNimAdapter } from "../model-routing/adapters/nim-adapter.js";
import { createGroqAdapter } from "../model-routing/adapters/groq-adapter.js";
import type { ModelProviderAdapter } from "../model-routing/types.js";
import {
  currentBuildIdentity,
  currentContractId,
  currentReleaseId,
  capabilityNames,
} from "../rollout/capabilities.js";
import { decide } from "./decide.js";
import {
  THOUGHT_MAX_OUTPUT_TOKENS,
  runThoughtModel,
} from "./thought.js";
import type { Motivation } from "../types.js";

const M4_LIVE_SMOKE_UTTERANCE =
  "Verify the current candidate workspace for Project Ashley using the verification capability available to you. Report the mechanical outcome only. Don’t tell me whether the change is good, and don’t modify anything.";

const PRODUCTION_WORKSPACES: Array<{
  workspaceId: string;
  lastUsedAt: string;
  createdAt: string;
  sourceSnapshotId: string;
}> = [
  {
    workspaceId: "ZZZvUs-K1s43xWw4psdMOw",
    lastUsedAt: "2026-08-23T20:47:01.875Z",
    createdAt: "2026-08-23T20:47:01.875Z",
    sourceSnapshotId: "snap_d2b88a4a3000bcdc1289476c",
  },
  {
    workspaceId: "R95hG39bTbjCMXelivMvSw",
    lastUsedAt: "2026-08-23T15:48:11.449Z",
    createdAt: "2026-08-23T15:48:11.449Z",
    sourceSnapshotId: "snap-fixture",
  },
];

function activateCapabilities(db: DatabaseSync): void {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

function writeFixtureWorkspaces(root: string): void {
  for (const row of PRODUCTION_WORKSPACES) {
    const dir = join(root, row.workspaceId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        schemaVersion: 2,
        projectId: "project-ashley",
        ...row,
      }),
    );
  }
}

function classify(result: Awaited<ReturnType<typeof runThoughtModel>>): string {
  if (!result.ok) {
    const code = result.error ?? "thought_error";
    if (code === "invalid_json" || code === "truncation") return code;
    return code;
  }
  const kind = result.proposal.operationalRequest?.kind;
  if (kind === "candidate_verification") return "candidate_verification";
  return result.proposal.kind;
}

async function oneSample(input: {
  db: DatabaseSync;
  manager: WorkspaceManager;
  adapter: ModelProviderAdapter;
  modelId: string;
  provider: "nim" | "groq";
}): Promise<Record<string, unknown>> {
  const motivation: Motivation = {
    id: 1,
    kind: "user_message",
    score: 100,
    summary: M4_LIVE_SMOKE_UTTERANCE,
    refType: "message",
    refId: 1,
  };
  const started = Date.now();
  let visible = "";
  let providerUsage: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number } | null =
    null;
  let finishReason: string | null = null;
  const thought = await runThoughtModel(
    input.db,
    decide([motivation], "reactive", { userMessage: M4_LIVE_SMOKE_UTTERANCE }),
    [motivation],
    "reactive",
    async (messages, options) => {
      const dispatched = await input.adapter.dispatch({
        messages,
        modelId: input.modelId,
        options: {
          maxTokens: options?.maxTokens ?? THOUGHT_MAX_OUTPUT_TOKENS,
          temperature: options?.temperature ?? 0.15,
          reasoningEffort: options?.reasoningEffort ?? "low",
          responseFormat: options?.responseFormat,
        },
      });
      visible = dispatched.text ?? "";
      providerUsage = dispatched.usage ?? null;
      finishReason = dispatched.finishReason ?? null;
      return {
        text: dispatched.text,
        usage: dispatched.usage,
        finishReason: dispatched.finishReason,
        model: input.modelId,
        modelAlias: input.modelId,
      };
    },
    { verificationWorkspaceManager: input.manager },
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message.slice(0, 200) : "provider_error";
    return {
      ok: false as const,
      error: message,
    };
  });
  const latencyMs = Date.now() - started;
  const raw = visible.slice(0, 4000);
  let validJson = false;
  try {
    JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    validJson = true;
  } catch {
    validJson = false;
  }
  return {
    latencyMs,
    httpOk: thought.ok || Boolean(visible),
    request: {
      model: input.modelId,
      provider: input.provider,
      reasoningEffort: "low",
      responseFormat: "json_object",
      maxTokens: THOUGHT_MAX_OUTPUT_TOKENS,
      temperature: 0.15,
    },
    providerUsage,
    finishReason,
    validJson,
    visibleBytes: Buffer.byteLength(visible, "utf8"),
    rawVisibleContent: raw,
    classification: thought.ok ? classify(thought) : (thought.error ?? "thought_error"),
    ok: thought.ok,
    error: thought.ok ? null : thought.error,
    proposal: thought.ok
      ? {
          kind: thought.proposal.kind,
          shouldSpeak: thought.proposal.shouldSpeak,
          completion: thought.proposal.completion,
          objective: thought.proposal.objective,
          reason: thought.proposal.reason,
          evidenceDisposition: thought.proposal.evidenceDisposition,
          operationalRequest: thought.proposal.operationalRequest ?? null,
        }
      : null,
    envelope: "envelope" in thought ? thought.envelope ?? null : null,
  };
}

export async function runLiveThoughtStructuredPreflight(
  sampleCount: number,
  provider: "nim" | "groq" = "nim",
): Promise<{
  gate: "PASS" | "FAIL";
  samples: Record<string, unknown>[];
}> {
  loadEnvFile(join(homedir(), ".composer-assistant", ".env"));
  refreshEnvFromProcess();
  if (provider === "nim" && !env.nimApiKey) {
    throw new Error("NIM_API_KEY missing; preflight not run");
  }
  if (provider === "groq" && !env.groqApiKey) {
    throw new Error("GROQ_API_KEY missing; preflight not run");
  }
  process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";
  env.sandboxEngineeringLifecycleEnabled = true;
  env.cognitionMode = "apply";

  const tmp = mkdtempSync(join(tmpdir(), "thought-preflight-"));
  const mintWorkspaces = join(homedir(), ".composer-assistant", "sandbox", "workspaces");
  let manager: WorkspaceManager;
  if (existsSync(mintWorkspaces)) {
    manager = new WorkspaceManager();
  } else {
    const fixtureRoot = join(tmp, "workspaces");
    writeFixtureWorkspaces(fixtureRoot);
    manager = new WorkspaceManager({ managedRoot: fixtureRoot });
  }

  if (!existsSync(env.sandboxProjectRegistryPath)) {
    const registryPath = join(tmp, "project-roots.json");
    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: join(tmp, "canonical"),
          displayName: "Project Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: true,
          engineeringAllowed: false,
          verificationAllowed: true,
          allowedRecipeIds: ["typescript_fixture_compile_v1"],
          authorshipAllowed: true,
          operationAllowed: true,
          patchExportAllowed: true,
        },
      ]),
    );
    mkdirSync(join(tmp, "canonical"), { recursive: true });
    env.sandboxProjectRegistryPath = registryPath;
  }

  const db = openNuclearDb(new DatabaseSync(join(tmp, "preflight.db")));
  activateCapabilities(db);
  const adapter = provider === "nim" ? createNimAdapter() : createGroqAdapter();
  const modelId = "openai/gpt-oss-20b";
  const samples: Record<string, unknown>[] = [];
  const count = Math.max(1, Math.min(5, sampleCount));
  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    samples.push(await oneSample({ db, manager, adapter, modelId, provider }));
  }
  db.close();

  const structuredOk = samples.every((row) => row.ok === true);
  return { gate: structuredOk ? "PASS" : "FAIL", samples };
}

const live = process.argv.includes("--live");
if (live) {
  const samplesFlag = process.argv.indexOf("--samples");
  const n =
    samplesFlag >= 0 ? Number(process.argv[samplesFlag + 1] ?? 1) : 1;
  const providerFlag = process.argv.indexOf("--provider");
  const provider =
    providerFlag >= 0 && process.argv[providerFlag + 1] === "groq"
      ? "groq"
      : "nim";
  runLiveThoughtStructuredPreflight(Number.isFinite(n) ? n : 1, provider)
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(result.gate === "PASS" ? 0 : 1);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(2);
    });
}
