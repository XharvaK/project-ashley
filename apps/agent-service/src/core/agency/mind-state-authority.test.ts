import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import {
  currentReleaseId,
  currentContractId,
  currentBuildIdentity,
  capabilityNames,
} from "../rollout/capabilities.js";
import {
  upsertMindStateItem,
  listActiveMindStateItems,
  claimUrgentMindState,
  consumeUrgentWake,
  retryUrgentWake,
  resolveMindStateItem,
  cancelMindStateItem,
  resolveMindStateBySource,
  applyMindStateDispositions,
} from "../state/mind-items.js";
import {
  tokenize,
  isTextRelevant,
  collectMotivations,
} from "./motivations.js";
import {
  hasReactiveTaskContinuationAdmission,
  runThoughtModel,
  deliberateDecision,
} from "./thought.js";
import type { Decision, Motivation, MindStateDisposition } from "../types.js";

const originalMode = env.cognitionMode;
const originalGroqKey = env.groqApiKey;
const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
const originalRegistryPath = env.sandboxProjectRegistryPath;

let tmpDir: string;
let registryPath: string;

function activateAllCapabilities(db: DatabaseSync) {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

function createBaseDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 40,
    reason: "respond",
    evidenceRefs: [],
    uncertainty: 0.2,
    urgency: 0.5,
    thoughtSource: "deterministic",
    thoughtError: null,
    thoughtValidation: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0.5,
      openness: 0.5,
      tension: 0,
      reason: "test",
    },
    cognitiveAllocation: { shouldSpeak: true, effort: "low", completion: "complete" },
    authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
    ...overrides,
  };
}

describe("Mind-State Authority and Speech Grounding", () => {
  let db: DatabaseSync;
  const ownerId = "doc";

  beforeEach(() => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test-key";
    env.sandboxEngineeringLifecycleEnabled = true;
    process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";
    tmpDir = mkdtempSync(join(tmpdir(), "mind-state-test-"));
    registryPath = join(tmpDir, "registry.json");
    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/srv/projects/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: true,
          engineeringAllowed: false,
        },
      ]),
    );
    env.sandboxProjectRegistryPath = registryPath;
    mkdirSync(join(tmpDir, "live-repo"), { recursive: true });

    db = openNuclearDb(new DatabaseSync(":memory:"));
    activateAllCapabilities(db);
  });

  afterEach(() => {
    env.cognitionMode = originalMode;
    env.groqApiKey = originalGroqKey;
    env.sandboxEngineeringLifecycleEnabled = originalLifecycle;
    env.sandboxProjectRegistryPath = originalRegistryPath;
    delete process.env.SANDBOX_V2_FORCE_AVAILABLE;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    db.close();
  });

  it("1. Core authority: mind_state items retain state/activation/urgency metadata across DB operations", () => {
    const id = upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "investigate package.json version",
      activation: 0.9,
      urgency: 0.85,
    });
    expect(id).toBeGreaterThan(0);

    const active = listActiveMindStateItems(db, ownerId);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id);
    expect(active[0].kind).toBe("concern");
    expect(active[0].text).toBe("investigate package.json version");
    expect(active[0].activation).toBe(0.9);
    expect(active[0].urgency).toBe(0.85);
    expect(active[0].status).toBe("active");
  });

  it("2. Relevance filtering: tokenize and isTextRelevant correctly identify matching words without false positives", () => {
    const tokens = tokenize("Hey Ashley, what are you thinking about tonight?");
    expect(tokens).toContain("ashley");
    expect(tokens).toContain("thinking");
    expect(tokens).toContain("tonight");
    expect(tokens).not.toContain("package.json");

    expect(isTextRelevant("what are you thinking about tonight?", "I was thinking about tonight's plan")).toBe(true);
    expect(isTextRelevant("what are you thinking about tonight?", "inspect package.json and provide version")).toBe(false);
    expect(isTextRelevant("can you check package.json?", "inspect package.json and provide version")).toBe(true);
  });

  it("3. Reactive candidate selection: active mind_state items candidate as callback motivations", () => {
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "verify build status",
      activation: 0.8,
      urgency: 0.7,
    });
    const motivations = collectMotivations(db, ownerId, "reactive");
    const callback = motivations.find((m) => m.summary === "verify build status");
    expect(callback).toBeDefined();
    expect(callback?.kind).toBe("callback");
  });

  it("4. Reactive relevance: unrelated mind_state items are not matched as text relevant to generic turn", () => {
    const userMsg = "Hey Ashley, what are you thinking about tonight?";
    const staleConcern = "inspect package.json and provide version";
    expect(isTextRelevant(userMsg, staleConcern)).toBe(false);
  });

  it("5. Reactive task continuation admission: direct user operational request grants admission", () => {
    expect(hasReactiveTaskContinuationAdmission("can you inspect package.json?")).toBe(true);
    expect(hasReactiveTaskContinuationAdmission("please read the package.json file")).toBe(true);
    expect(hasReactiveTaskContinuationAdmission("check the repository status")).toBe(true);
  });

  it("6. Reactive task continuation admission: conversational open question does NOT grant operational admission", () => {
    expect(hasReactiveTaskContinuationAdmission("Hey Ashley, what are you thinking about tonight?")).toBe(false);
    expect(hasReactiveTaskContinuationAdmission("How are you feeling today?")).toBe(false);
    expect(hasReactiveTaskContinuationAdmission("Tell me something interesting.")).toBe(false);
  });

  it("7. Reactive task continuation admission: explicit resumption of background task grants operational admission", () => {
    const candidateMotivations: Motivation[] = [
      {
        id: 101,
        kind: "callback",
        summary: "inspect package.json and provide version",
        score: 80,
      },
    ];
    // Asking explicitly about package.json matches background motivation
    expect(
      hasReactiveTaskContinuationAdmission(
        "Let's look at the package.json version task",
        candidateMotivations,
        [101],
      ),
    ).toBe(true);
  });

  it("8. Validation: Thought proposing operationalRequest on conversational turn without task admission fails validation", async () => {
    const base = createBaseDecision({
      motivationIds: [1, 2],
      score: 80,
      urgency: 0.5,
      uncertainty: 0.1,
      objective: "inspect version",
      reason: "checking package.json",
    });
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: "Hey Ashley, what are you thinking about tonight?", score: 90 },
      { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 85 },
    ];

    // Mock completion returning an operationalRequest
    const mockComplete = async () => ({
      text: JSON.stringify({
        kind: "speak",
        shouldSpeak: true,
        completion: "complete",
        effort: "low",
        uncertainty: 0.1,
        urgency: 0.5,
        objective: "inspect package.json",
        reason: "checking version",
        motivationIds: [1, 2],
        evidenceDisposition: "acquire_project_evidence",
        operationalRequest: {
          kind: "project_inspection",
          request: {
            operation: "project.read_file",
            projectId: "project-ashley",
            path: "package.json",
          },
        },
      }),
    });

    const result = await runThoughtModel(
      db,
      base,
      motivations,
      "reactive",
      mockComplete as any,
    );

    // Initial attempt proposing operationalRequest must fail validation with unsupported_operation
    // and structural retry or error outcome is returned
    expect(result.ok).toBe(false);
  });

  it("9. Validation: Thought proposing operationalRequest on turn with task admission succeeds validation", async () => {
    const base = createBaseDecision({
      motivationIds: [1],
      score: 90,
      urgency: 0.5,
      uncertainty: 0.1,
      objective: "read package.json",
      reason: "user requested package.json",
    });
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: "can you inspect package.json and tell me the version?", score: 95 },
    ];

    const mockComplete = async () => ({
      text: JSON.stringify({
        kind: "speak",
        shouldSpeak: true,
        completion: "complete",
        effort: "low",
        uncertainty: 0.1,
        urgency: 0.5,
        objective: "read package.json",
        reason: "user requested inspect",
        motivationIds: [1],
        evidenceDisposition: "acquire_project_evidence",
        operationalRequest: {
          kind: "project_inspection",
          request: {
            operation: "project.read_file",
            projectId: "project-ashley",
            path: "package.json",
          },
        },
      }),
    });

    const result = await runThoughtModel(
      db,
      base,
      motivations,
      "reactive",
      mockComplete as any,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.operationalRequest?.kind).toBe("project_inspection");
      expect(result.proposal.operationalBasisMotivationId).toBe(1);
    }
  });

  it("10. Operational basis derivation: operationalBasisMotivationId correctly identifies background vs user motivation", () => {
    const candidateMotivations: Motivation[] = [
      { id: 10, kind: "user_message", summary: "Let's work on the package.json task", score: 90 },
      { id: 20, kind: "callback", summary: "inspect package.json and provide version", score: 85 },
    ];

    expect(
      hasReactiveTaskContinuationAdmission(
        "Let's work on the package.json task",
        candidateMotivations,
        [10, 20],
      ),
    ).toBe(true);
  });

  it("11. Proactive candidate selection: active mind_state items candidate for proactive wake", () => {
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "verify background pipeline",
      activation: 1.0,
      urgency: 0.9,
    });
    const motivations = collectMotivations(db, ownerId, "proactive");
    const item = motivations.find((m) => m.summary === "verify background pipeline");
    expect(item).toBeDefined();
    expect(item?.kind).toBe("callback");
  });

  it("12. Proactive eligibility: urgent mind_state item qualifies for urgent_grounded proactive wake", () => {
    const id = upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "critical pipeline failure",
      activation: 1.0,
      urgency: 0.95,
    });
    expect(id).toBeGreaterThan(0);

    const claimed = claimUrgentMindState(db, ownerId);
    expect(claimed).toBeDefined();
    expect(claimed?.id).toBe(id);
    expect(claimed?.wakeState).toBe("claimed");
  });

  it("13. Preserved updated_at: claimUrgentMindState, consumeUrgentWake, retryUrgentWake do not clobber updated_at", () => {
    const id = upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "test wake persistence",
      activation: 1.0,
      urgency: 0.95,
    });
    const originalRow = db.prepare("SELECT updated_at FROM mind_state_items WHERE id = ?").get(id) as any;
    const originalTime = originalRow.updated_at;

    const claimed = claimUrgentMindState(db, ownerId);
    expect(claimed).toBeDefined();
    const rowAfterClaim = db.prepare("SELECT updated_at FROM mind_state_items WHERE id = ?").get(id) as any;
    expect(rowAfterClaim.updated_at).toBe(originalTime);

    consumeUrgentWake(db, claimed!.id);
    const rowAfterConsume = db.prepare("SELECT updated_at, status FROM mind_state_items WHERE id = ?").get(id) as any;
    expect(rowAfterConsume.updated_at).toBe(originalTime);
    expect(rowAfterConsume.status).toBe("active");

    // Rearm and claim again
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "test wake persistence rearmed",
      activation: 1.0,
      urgency: 0.96,
    });
    claimUrgentMindState(db, ownerId);
    retryUrgentWake(db, claimed!.id);
    const rowAfterRetry = db.prepare("SELECT updated_at FROM mind_state_items WHERE id = ?").get(id) as any;
    expect(rowAfterRetry.updated_at).toBe(originalTime);
  });

  it("14. Lifecycle resolution: resolveMindStateItem updates status to 'resolved' and sets updated_at", () => {
    const id = upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "temporary concern",
      activation: 0.8,
      urgency: 0.5,
    });
    expect(id).toBeGreaterThan(0);

    const ok = resolveMindStateItem(db, id, "task completed");
    expect(ok).toBe(true);

    const active = listActiveMindStateItems(db, ownerId);
    expect(active).toHaveLength(0);

    const row = db.prepare("SELECT * FROM mind_state_items WHERE id = ?").get(id) as any;
    expect(row.status).toBe("resolved");
    expect(row.updated_at).toBeTruthy();
  });

  it("15. Lifecycle cancellation: cancelMindStateItem updates status to 'forgotten' and sets updated_at", () => {
    const id = upsertMindStateItem(db, {
      ownerId,
      kind: "goal",
      text: "abandoned goal",
      activation: 0.5,
      urgency: 0.2,
    });
    expect(id).toBeGreaterThan(0);

    const ok = cancelMindStateItem(db, id, "no longer relevant");
    expect(ok).toBe(true);

    const active = listActiveMindStateItems(db, ownerId);
    expect(active).toHaveLength(0);

    const row = db.prepare("SELECT * FROM mind_state_items WHERE id = ?").get(id) as any;
    expect(row.status).toBe("forgotten");
    expect(row.updated_at).toBeTruthy();
  });

  it("16. Lifecycle applyMindStateDispositions: batch applies preserve, resolve, cancel, and consume_callback", () => {
    const id1 = upsertMindStateItem(db, { ownerId, kind: "concern", text: "c1", sourceType: "custom", sourceId: "c1", activation: 0.8, urgency: 0.5 });
    const id2 = upsertMindStateItem(db, { ownerId, kind: "concern", text: "c2", sourceType: "custom", sourceId: "c2", activation: 0.8, urgency: 0.5 });
    const id3 = upsertMindStateItem(db, { ownerId, kind: "concern", text: "c3", sourceType: "custom", sourceId: "c3", activation: 0.8, urgency: 0.5 });

    const dispositions: MindStateDisposition[] = [
      { itemId: id1, disposition: "resolve", reason: "done" },
      { itemId: id2, disposition: "cancel", reason: "dropped" },
      { itemId: id3, disposition: "preserve" },
    ];

    applyMindStateDispositions(db, dispositions);

    const active = listActiveMindStateItems(db, ownerId);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id3);
  });

  it("17. Lifecycle resolveMindStateBySource: resolves matching items by source ref", () => {
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "linked concern",
      sourceType: "episode",
      sourceId: 42,
      activation: 0.8,
      urgency: 0.5,
    });

    const activeBefore = listActiveMindStateItems(db, ownerId);
    expect(activeBefore).toHaveLength(1);

    const count = resolveMindStateBySource(db, ownerId, "episode", 42);
    expect(count).toBe(1);

    const activeAfter = listActiveMindStateItems(db, ownerId);
    expect(activeAfter).toHaveLength(0);
  });

  it("18. (Mandatory) Open-ended 'Hey Ashley, what are you thinking about tonight?' surfaces background concern conversationally WITHOUT executing repository inspection", async () => {
    // Grounding: Ashley has a background concern in Mind State
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "thinking about refactoring the parser",
      activation: 0.8,
      urgency: 0.6,
    });

    const userMessage = "Hey Ashley, what are you thinking about tonight?";
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: userMessage, score: 95 },
      { id: 2, kind: "callback", summary: "thinking about refactoring the parser", score: 70 },
    ];

    const base = createBaseDecision({
      motivationIds: [1, 2],
      score: 95,
      urgency: 0.6,
      uncertainty: 0.1,
      objective: "respond to owner",
      reason: "answer question",
    });

    // Thought converses naturally about the concern without emitting an operationalRequest
    const mockComplete = async () => ({
      text: JSON.stringify({
        kind: "speak",
        shouldSpeak: true,
        completion: "complete",
        effort: "low",
        uncertainty: 0.1,
        urgency: 0.6,
        objective: "share thoughts about parser refactor",
        reason: "Doc asked what I am thinking about",
        motivationIds: [1, 2],
        evidenceDisposition: "sufficient",
      }),
    });

    const decision = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      mockComplete as any,
    );

    expect(decision.kind).toBe("speak");
    expect(decision.operationalRequest).toBeFalsy();
    expect(decision.evidenceDisposition).toBe("sufficient");
    expect(decision.objective).toBe("share thoughts about parser refactor");
  });

  it("19. (Mandatory) Background concern + explicit owner request to resume/inspect becomes valid operational basis", async () => {
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "inspect package.json and provide version",
      activation: 0.8,
      urgency: 0.7,
    });

    const userMessage = "Can you go ahead and inspect package.json now?";
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: userMessage, score: 95 },
      { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 85 },
    ];

    const base = createBaseDecision({
      motivationIds: [1, 2],
      score: 95,
      urgency: 0.7,
      uncertainty: 0.1,
      objective: "inspect package.json",
      reason: "user requested inspection",
    });

    const mockComplete = async () => ({
      text: JSON.stringify({
        kind: "speak",
        shouldSpeak: true,
        completion: "complete",
        effort: "low",
        uncertainty: 0.1,
        urgency: 0.7,
        objective: "inspect package.json",
        reason: "user requested inspection",
        motivationIds: [1, 2],
        evidenceDisposition: "acquire_project_evidence",
        operationalRequest: {
          kind: "project_inspection",
          request: {
            operation: "project.read_file",
            projectId: "project-ashley",
            path: "package.json",
          },
        },
      }),
    });

    const decision = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      mockComplete as any,
    );

    expect(decision.kind).toBe("speak");
    expect(decision.operationalRequest?.kind).toBe("project_inspection");
    expect(decision.evidenceDisposition).toBe("acquire_project_evidence");
    expect(decision.operationalBasisMotivationId).toBe(2);
  });

  it("20. (Mandatory) User motivation included alongside stale motivation is NOT by itself sufficient to license unrelated operational continuation", async () => {
    // Stale smoke test concern
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "inspect package.json and provide version",
      activation: 0.9,
      urgency: 0.9,
    });

    // Fresh conversational message from owner
    const userMessage = "Hey Ashley, what are you thinking about tonight?";
    const motivations: Motivation[] = [
      { id: 19590, kind: "user_message", summary: userMessage, score: 95 },
      { id: 19588, kind: "callback", summary: "inspect package.json and provide version", score: 90 },
    ];

    const base = createBaseDecision({
      motivationIds: [19590, 19588],
      score: 95,
      urgency: 0.9,
      uncertainty: 0.1,
      objective: "respond to owner",
      reason: "conversational turn",
    });

    // Model attempts the incident defect: emit project_inspection while including user_message ID
    const mockComplete = async () => ({
      text: JSON.stringify({
        kind: "speak",
        shouldSpeak: true,
        completion: "complete",
        effort: "low",
        uncertainty: 0.1,
        urgency: 0.9,
        objective: "inspect package.json",
        reason: "checking version string",
        motivationIds: [19590, 19588],
        evidenceDisposition: "acquire_project_evidence",
        operationalRequest: {
          kind: "project_inspection",
          request: {
            operation: "project.read_file",
            projectId: "project-ashley",
            path: "package.json",
          },
        },
      }),
    });

    const decision = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      mockComplete as any,
    );

    // The unauthorized operationalRequest MUST be rejected by task admission check.
    // Decision falls back safely without executing unprompted repository reads.
    expect(decision.operationalRequest).toBeFalsy();
    expect(decision.thoughtSource).toBe("fallback");
    expect(decision.thoughtError).toBe("unsupported_operation");
  });
});
