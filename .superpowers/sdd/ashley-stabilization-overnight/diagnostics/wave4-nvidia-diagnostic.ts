import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = process.cwd();
const sourceRoot = resolve(repositoryRoot, "apps", "agent-service", "src");
const baselineRoot = resolve(repositoryRoot, "..", "composer-assistant-baseline-7bae");
const baselineSourceRoot = resolve(baselineRoot, "apps", "agent-service", "src");

const importSource = (root: string, relativePath: string) =>
  import(pathToFileURL(join(root, relativePath)).href);

const { loadEnvFile, refreshEnvFromProcess, env } = await importSource(
  sourceRoot,
  "env.ts",
);
loadEnvFile(join(homedir(), ".composer-assistant", ".env"));
refreshEnvFromProcess();

const { createNimAdapter, buildNimRequestBody } = await importSource(
  sourceRoot,
  "core/model-routing/adapters/nim-adapter.ts",
);
const { wireEvidenceFor } = await importSource(
  sourceRoot,
  "core/model-fabric/wire-evidence.ts",
);
const { sha256Text } = await importSource(
  sourceRoot,
  "core/model-fabric/hash.ts",
);
const currentOutputContract = await importSource(
  sourceRoot,
  "core/cognitive-v021/thought/output-contract.ts",
);
const currentParser = await importSource(
  sourceRoot,
  "core/cognitive-v021/thought/parse.ts",
);
const { buildOperationalEffectNamespaceFromRefs, mintEffectRef } = await importSource(
  sourceRoot,
  "core/cognitive-v021/effect/effect-ref.ts",
);
const baselineOutputContract = await importSource(
  baselineSourceRoot,
  "core/cognitive-v021/thought/output-contract.ts",
);
const baselineParser = await importSource(
  baselineSourceRoot,
  "core/cognitive-v021/thought/parse.ts",
);

const MODEL_ID = "nvidia/nemotron-3-super-120b-a12b";
const MAX_TOKENS = 8192;
const TEMPERATURE = 1.0;
const REASONING_POLICY = "high" as const;
const DEADLINE_MS = 60_000;
const RETRY_POLICY = "single_attempt" as const;
const BINDING_ID = "compat_thought_nim_nemotron_super_native_json_schema_v1";
const WIRE_FORMAT = "nim_response_format_json_schema" as const;
const OUTPUT_DOMAINS = [
  "interpretation",
  "commitments",
  "workingContextDeltas",
  "concernDeltas",
  "occupancyDeltas",
  "futureTriggerDeltas",
  "subscriptionDeltas",
  "durableNominations",
  "evidenceUse",
] as const;

type Condition = "current_v1" | "sparse_v2";

type Scenario = {
  id: string;
  family: string;
  coverage: string;
  prompt: string;
  hostContext: string;
  allowedReferences: string[];
};

const receiptRef = mintEffectRef("wave4-diagnostic", 1, "receipt");

const scenarios: Scenario[] = [
  {
    id: "Q1",
    family: "ordinary_speech",
    coverage: "ordinary speech (13 varied cases)",
    prompt:
      "The owner says: Good morning, Ashley. What is one small thing you can help with today? Reply naturally and briefly. No memory, concern, evidence, or operation change is requested.",
    hostContext: "No additional evidence, operations, or durable changes are supplied.",
    allowedReferences: [],
  },
  {
    id: "Q2",
    family: "longer_ordinary_speech",
    coverage: "longer ordinary speech (13 varied cases)",
    prompt:
      "The owner asks for a warm, thoughtful paragraph about taking a quiet evening after a demanding week. This is ordinary conversation only. Do not create or change memory, concerns, triggers, subscriptions, evidence reliance, or operations.",
    hostContext: "No additional evidence, operations, or durable changes are supplied.",
    allowedReferences: [],
  },
  {
    id: "Q3",
    family: "intentional_silence",
    coverage: "silent settlement (5 cases)",
    prompt:
      "The owner explicitly says: No reply is needed. Please remain quietly present. Author intentional silence and do not add any internal state change.",
    hostContext: "No additional evidence, operations, or durable changes are supplied.",
    allowedReferences: [],
  },
  {
    id: "Q4",
    family: "silence_with_delta",
    coverage: "silence with internal delta (5 cases)",
    prompt:
      "The owner says: Do not speak, but mark a temporary focus that the evening review is waiting. Author silence together with the internal working-context change. Use a local alias if one is needed.",
    hostContext: "No existing references are supplied; a new local alias may be created by the semantic output.",
    allowedReferences: [],
  },
  {
    id: "Q5",
    family: "working_context",
    coverage: "working-context operations (10 cases)",
    prompt:
      "The owner says: Keep the project review as an active working context for this conversation. Author the working-context upsert and a concise acknowledgment.",
    hostContext: "No existing references are supplied; a new local alias may be created by the semantic output.",
    allowedReferences: [],
  },
  {
    id: "Q6",
    family: "concern",
    coverage: "concern operations (10 cases)",
    prompt:
      "The owner says: I am concerned that the overnight review may lose its evidence trail. Author a concern record for that concern and acknowledge the owner without inventing a resolution.",
    hostContext: "No existing references are supplied; a new local alias may be created by the semantic output.",
    allowedReferences: [],
  },
  {
    id: "Q7",
    family: "future_trigger",
    coverage: "future-trigger operations (10 cases)",
    prompt:
      "The owner asks Ashley to create a future trigger for tomorrow at 09:00 UTC to revisit the overnight review concern. Bind it to the concern snapshot authored in this same semantic output by using a local alias, and do not claim that the trigger has already fired.",
    hostContext: "No existing references are supplied; a new local concern alias may be created by the semantic output.",
    allowedReferences: [],
  },
  {
    id: "Q8",
    family: "durable_nomination",
    coverage: "durable nominations (10 cases)",
    prompt:
      "The owner explicitly teaches: Preserve the preference that review evidence should be easy to audit. Author a durable nomination from this owner utterance and acknowledge the teaching.",
    hostContext: "No existing references are supplied.",
    allowedReferences: [],
  },
  {
    id: "Q9",
    family: "evidence_reliance",
    coverage: "evidence reliance (4 cases)",
    prompt:
      "Use the supplied observation reference obs:incident-read to answer whether the incident review has a recorded observation. Author the answer only with that evidence and record the observation reliance.",
    hostContext: "The host supplied a governed observation with ref obs:incident-read. Its content says the incident review has a recorded observation. No other source is admissible.",
    allowedReferences: ["obs:incident-read"],
  },
  {
    id: "Q10",
    family: "currentness",
    coverage: "evidence and currentness (4 cases)",
    prompt:
      "Use the supplied governed observation obs:service-current to state the service's present status. The observation is explicitly current and may support a time:current epistemic claim. Record the observation reliance.",
    hostContext: "The host supplied a governed current observation with ref obs:service-current. Its content says the service is ready now. No other source is admissible.",
    allowedReferences: ["obs:service-current"],
  },
  {
    id: "Q11",
    family: "operational_truth",
    coverage: "operational claim (3 cases)",
    prompt: `A host-admitted effect with ref ${receiptRef} has a receipt whose state is succeeded. Author a settlement that truthfully reports that state. Do not claim a different effect or invent a new reference.`,
    hostContext: `The only admitted operational reference is ${receiptRef}. The host receipt for it is succeeded.`,
    allowedReferences: [receiptRef],
  },
  {
    id: "Q12",
    family: "correction_revision",
    coverage: "correction and revision (3 cases)",
    prompt:
      "The owner corrects the prior turn identified by turn:prior-user-message: the phrase 'review is finished' should be 'review is still open'. Author the correction with the exact existing reference and acknowledge the repair.",
    hostContext: "The host supplied the existing prior-turn reference turn:prior-user-message.",
    allowedReferences: ["turn:prior-user-message"],
  },
  {
    id: "Q13",
    family: "observation_intent",
    coverage: "intent branches (5 cases)",
    prompt:
      "The owner asks for the current contents of an authorized project file, but that evidence is not supplied in this turn. Select the registered read-only observation operation project.read_file rather than guessing or claiming the file contents.",
    hostContext: "The host exposes project.read_file as an available observation operation. No file content is supplied.",
    allowedReferences: [],
  },
  {
    id: "Q14",
    family: "effect_intent",
    coverage: "intent branches (5 cases)",
    prompt:
      "The owner asks to create a project directory named review-notes. Select the registered governed effect operation workspace.create_directory and state the expected outcome. Do not claim that the directory already exists.",
    hostContext: "The host exposes workspace.create_directory as an available effect operation. No effect receipt exists yet.",
    allowedReferences: [],
  },
  {
    id: "Q15",
    family: "abstain",
    coverage: "abstain branches (5 cases)",
    prompt:
      "The owner asks whether an external service is healthy now, but supplies no current observation and no available observation can answer it. Do not guess. Author a responsible abstention.",
    hostContext: "No evidence and no admissible observation capability are supplied for the requested current claim.",
    allowedReferences: [],
  },
];

if (!env.nimApiKey) {
  throw new Error("NVIDIA_NIM_API_KEY_NOT_CONFIGURED");
}

function requestFor(condition: Condition, allowedReferences: readonly string[]) {
  const namespace = buildOperationalEffectNamespaceFromRefs(allowedReferences);
  const contract = condition === "sparse_v2" ? currentOutputContract : baselineOutputContract;
  return contract.thoughtOutputStructuredRequest(namespace);
}

function trustedStructuredControl(request: {
  contractId: string;
  schemaId: string;
  schemaFingerprint: `sha256:${string}`;
  schema: Readonly<Record<string, unknown>>;
}) {
  return {
    kind: "native_json_schema" as const,
    contractId: request.contractId,
    schemaId: request.schemaId,
    schemaFingerprint: request.schemaFingerprint,
    bindingId: BINDING_ID,
    wireFormat: WIRE_FORMAT,
    schema: request.schema,
  };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function domainSummary(value: Record<string, unknown>): {
  present: string[];
  emptyPresent: string[];
  nonEmptyDomainCount: number;
  optionalDomainCount: number;
} {
  const present = OUTPUT_DOMAINS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  const emptyPresent = present.filter((key) => {
    const child = value[key];
    return Array.isArray(child)
      ? child.length === 0
      : jsonObject(child) !== null && Object.keys(child as Record<string, unknown>).length === 0;
  });
  return {
    present: [...present],
    emptyPresent: [...emptyPresent],
    nonEmptyDomainCount: present.length - emptyPresent.length,
    optionalDomainCount: present.length,
  };
}

function structuralSummary(text: string): Record<string, unknown> {
  const contentBytes = Buffer.byteLength(text, "utf8");
  try {
    const parsed = JSON.parse(text) as unknown;
    const root = jsonObject(parsed);
    if (!root) {
      return {
        json: "valid",
        root: "non_object",
        rootKeys: [],
        presentDomains: [],
        emptyPresentDomains: [],
        optionalDomainCount: 0,
        contentBytes,
      };
    }
    const domains = root.kind === "settlement" ? domainSummary(root) : null;
    return {
      json: "valid",
      root: typeof root.kind === "string" ? root.kind : "missing_kind",
      rootKeys: Object.keys(root).sort(),
      presentDomains: domains?.present ?? [],
      emptyPresentDomains: domains?.emptyPresent ?? [],
      optionalDomainCount: domains?.optionalDomainCount ?? 0,
      nonEmptyDomainCount: domains?.nonEmptyDomainCount ?? 0,
      contentBytes,
    };
  } catch {
    return {
      json: "invalid",
      root: "invalid_json",
      rootKeys: [],
      presentDomains: [],
      emptyPresentDomains: [],
      optionalDomainCount: 0,
      contentBytes,
    };
  }
}

function parserSummary(condition: Condition, text: string, allowedReferences: readonly string[]) {
  const parser = condition === "sparse_v2" ? currentParser : baselineParser;
  const result = parser.parseThoughtSemanticOutput(text, new Set(allowedReferences));
  return result.ok
    ? { status: "ok" as const }
    : { status: "failure" as const, code: result.code, field: result.field ?? null };
}

function errorSummary(error: unknown): Record<string, unknown> {
  const record = jsonObject(error);
  const code = record && typeof record.code === "string" ? record.code : null;
  const name = error instanceof Error ? error.name : record && typeof record.name === "string" ? record.name : "unknown";
  const status = record && typeof record.status === "number" ? record.status : null;
  return { name, code, status };
}

function sha256Digest(text: string): `sha256:${string}` {
  return `sha256:${sha256Text(text)}`;
}

function safeResponseDiagnostics(value: unknown): Record<string, unknown> | null {
  const response = jsonObject(value);
  if (!response) return null;
  return {
    contentContainerType: response.contentContainerType ?? null,
    contentChunkTypes: Array.isArray(response.contentChunkTypes) ? response.contentChunkTypes : [],
    textChunkCount: response.textChunkCount ?? null,
    thinkingChunkCount: response.thinkingChunkCount ?? null,
    finalTextBytes: response.finalTextBytes ?? null,
    finishReason: response.finishReason ?? null,
    finishReasonClass: response.finishReasonClass ?? null,
    outputTokenLimit: response.outputTokenLimit ?? null,
    outputTokens: response.outputTokens ?? null,
    reasoningTokens: response.reasoningTokens ?? null,
    reasoningContentBytes: response.reasoningContentBytes ?? null,
    reasoningHash: response.reasoningHash ?? null,
    extractionFailure: response.extractionFailure ?? null,
  };
}

const adapter = createNimAdapter();
const results: Record<string, unknown>[] = [];
const configuredInvocationLimit = Number(process.env.WAVE4_MAX_INVOCATIONS ?? "30");
const invocationLimit = Number.isFinite(configuredInvocationLimit) && configuredInvocationLimit > 0
  ? Math.floor(configuredInvocationLimit)
  : 30;

for (const scenario of scenarios) {
  for (const condition of ["current_v1", "sparse_v2"] as const) {
    if (results.length >= invocationLimit) break;
    const request = requestFor(condition, scenario.allowedReferences);
    const structured = trustedStructuredControl(request);
    const messages = [
      {
        role: "system" as const,
        content: [
          "You are Ashley's Thought semantic author in a synthetic qualification case.",
          "Return exactly one JSON object and no markdown or commentary.",
          condition === "sparse_v2"
            ? currentOutputContract.thoughtOutputCompatibilityInstruction()
            : baselineOutputContract.thoughtOutputCompatibilityInstruction(),
          `Host context: ${scenario.hostContext}`,
          `Allowlisted existing references: ${scenario.allowedReferences.length > 0 ? scenario.allowedReferences.join(", ") : "none"}.`,
        ].join(" "),
      },
      { role: "user" as const, content: scenario.prompt },
    ];
    const options = {
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      reasoningEffort: REASONING_POLICY,
      responseFormat: "json_schema" as const,
      deadlineAtMs: Date.now() + DEADLINE_MS,
      route: "thought" as const,
      purpose: "thought" as const,
      lane: "interactive" as const,
      ownerId: "wave4-diagnostic-owner",
    };
    const fabricReasoning = { kind: "reasoning_effort" as const, value: "high" as const };
    const body = buildNimRequestBody(messages, options, MODEL_ID, fabricReasoning, structured);
    const wire = wireEvidenceFor({
      adapterId: "ashley.adapter.nim.v1",
      body,
      structuredOutput: structured,
    });
    const startedAtMs = Date.now();
    const deadlineAtMs = startedAtMs + DEADLINE_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEADLINE_MS);
    let result: Record<string, unknown> = {
      scenario: scenario.id,
      family: scenario.family,
      coverage: scenario.coverage,
      contractMode: condition,
      provider: "nim",
      model: MODEL_ID,
      schemaId: request.schemaId,
      contractId: request.contractId,
      schemaFingerprint: request.schemaFingerprint,
      wireFingerprint: wire.sanitizedBodyDigest,
      wireFormat: wire.wireFormat,
      bindingId: wire.bindingId,
      controls: {
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        reasoningPolicy: REASONING_POLICY,
        reasoningWireControl: fabricReasoning,
        reasoningBudgetTokens: 1024,
        deadlineMs: DEADLINE_MS,
        retryPolicy: RETRY_POLICY,
      },
      startedAtMs,
      result: "error",
    };
    try {
      const completion = await adapter.dispatch({
        messages,
        modelId: MODEL_ID,
        options: { ...options, deadlineAtMs },
        fabricReasoning,
        fabricStructuredOutput: structured,
        signal: controller.signal,
      });
      const responseAtMs = Date.now();
      const text = typeof completion.text === "string" ? completion.text : "";
      const structure = structuralSummary(text);
      const parsed = parserSummary(condition, text, scenario.allowedReferences);
      const responseDiagnostics = safeResponseDiagnostics(completion.responseDiagnostics);
      const usage = jsonObject(completion.usage);
      const finishReason = typeof completion.finishReason === "string" ? completion.finishReason : null;
      const outputTokens = usage && typeof usage.completionTokens === "number" ? usage.completionTokens : null;
      const reasoningTokens = usage && typeof usage.reasoningTokens === "number" ? usage.reasoningTokens : null;
      result = {
        ...result,
        result: "response_received",
        responseAtMs,
        elapsedMs: responseAtMs - startedAtMs,
        remainingDeadlineMs: Math.max(0, deadlineAtMs - responseAtMs),
        finishReason,
        finishReasonClass: responseDiagnostics?.finishReasonClass ?? null,
        inputTokens: usage && typeof usage.promptTokens === "number" ? usage.promptTokens : null,
        outputTokens,
        reasoningTokens,
        contentLengthBytes: Buffer.byteLength(text, "utf8"),
        contentHash: sha256Digest(text),
        reasoningLengthBytes: responseDiagnostics?.reasoningContentBytes ?? null,
        reasoningHash: responseDiagnostics?.reasoningHash ?? null,
        parse: parsed,
        structure,
        responseDiagnostics,
        runaway: finishReason === "length" || (outputTokens !== null && outputTokens >= Math.floor(MAX_TOKENS * 0.95)),
        wireEvidence: {
          sanitizedBodyDigest: completion.wireEvidence?.sanitizedBodyDigest ?? wire.sanitizedBodyDigest,
          emittedEnforcementMode: completion.wireEvidence?.emittedEnforcementMode ?? wire.emittedEnforcementMode,
          providerDeclaredEnforcement: completion.wireEvidence?.providerDeclaredEnforcement ?? wire.providerDeclaredEnforcement,
        },
      };
    } catch (error) {
      const responseAtMs = Date.now();
      result = {
        ...result,
        responseAtMs,
        elapsedMs: responseAtMs - startedAtMs,
        remainingDeadlineMs: Math.max(0, deadlineAtMs - responseAtMs),
        error: errorSummary(error),
        failureClass: controller.signal.aborted ? "deadline_or_abort" : "provider_failure",
      };
    } finally {
      clearTimeout(timeout);
    }
    results.push(result);
    const status = result.result === "response_received" ? "response" : "error";
    const elapsed = typeof result.elapsedMs === "number" ? result.elapsedMs : 0;
    process.stdout.write(`${scenario.id}/${condition}: ${status} ${elapsed}ms\n`);
  }
  if (results.length >= invocationLimit) break;
}

const outputDirectory = join(
  repositoryRoot,
  ".superpowers",
  "sdd",
  "ashley-stabilization-overnight",
  "diagnostics",
);
mkdirSync(outputDirectory, { recursive: true });
const outputPath = join(outputDirectory, "wave4-nvidia-results.json");
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      diagnostic: "controlled_nvidia_current_vs_sparse",
      generatedAtMs: Date.now(),
      provider: "nim",
      model: MODEL_ID,
      controls: {
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        reasoningPolicy: REASONING_POLICY,
        reasoningBudgetTokens: 1024,
        deadlineMs: DEADLINE_MS,
        retryPolicy: RETRY_POLICY,
      },
      scenarioCount: scenarios.length,
      invocationCount: results.length,
      privacy: {
        rawTextRetained: false,
        hiddenReasoningRetained: false,
        onlyContentHashAndBoundedLengths: true,
      },
      results,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
process.stdout.write(`RESULT_ARTIFACT=${outputPath}\n`);
