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
  runThoughtModel,
  deliberateDecision,
} from "./thought.js";
import {
  authorizeReactiveOperationalExecution,
  evaluateReactiveOperationalAdmission,
} from "../sandbox/reactive-operational-admission.js";
import type { CognitionOperationalRequest, Decision, Motivation, MindStateDisposition } from "../types.js";

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

function inspectPackageJson(): CognitionOperationalRequest {
  return {
    kind: "project_inspection",
    request: {
      operation: "project.read_file",
      projectId: "project-ashley",
      path: "package.json",
    },
  };
}

function inspectionProposal(motivationIds: number[], extras: Record<string, unknown> = {}) {
  return JSON.stringify({
    kind: "speak",
    shouldSpeak: true,
    completion: "complete",
    effort: "low",
    uncertainty: 0.1,
    urgency: 0.5,
    objective: "inspect package.json",
    reason: "checking version",
    motivationIds,
    evidenceDisposition: "acquire_project_evidence",
    operationalRequest: inspectPackageJson(),
    ...extras,
  });
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

  it("5. Reactive task continuation admission: direct user operational request grants admission for THIS request", () => {
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: "can you inspect package.json?", score: 95 },
    ];
    expect(
      evaluateReactiveOperationalAdmission({
        userMessage: "can you inspect package.json?",
        motivations,
        selectedMotivationIds: [1],
        operationalRequest: inspectPackageJson(),
      }).admitted,
    ).toBe(true);
    expect(
      evaluateReactiveOperationalAdmission({
        userMessage: "please read the package.json file",
        motivations: [
          { id: 1, kind: "user_message", summary: "please read the package.json file", score: 95 },
        ],
        selectedMotivationIds: [1],
        operationalRequest: inspectPackageJson(),
      }).admitted,
    ).toBe(true);
  });

  it("6. Reactive task continuation admission: conversational open question does NOT grant operational admission", () => {
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: "Hey Ashley, what are you thinking about tonight?", score: 95 },
    ];
    expect(
      evaluateReactiveOperationalAdmission({
        userMessage: "Hey Ashley, what are you thinking about tonight?",
        motivations,
        selectedMotivationIds: [1],
        operationalRequest: inspectPackageJson(),
      }).admitted,
    ).toBe(false);
  });

  it("7. Reactive task continuation admission: explicit resumption of background task grants operational admission", () => {
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: "Finish that package.json thing from earlier.", score: 90 },
      { id: 101, kind: "callback", summary: "inspect package.json and provide version", score: 80 },
    ];
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Finish that package.json thing from earlier.",
      motivations,
      selectedMotivationIds: [1, 101],
      claimedBasisMotivationId: 101,
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(true);
    if (result.admitted) {
      expect(result.admissionClass).toBe("explicit_resumption");
      expect(result.validatedBasisMotivationId).toBe(101);
    }
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

    // Initial attempt proposing operationalRequest must fail validation with unauthorized_task_continuation
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
      expect(result.proposal.reactiveOperationalAdmission?.admitted).toBe(true);
      expect(result.proposal.reactiveOperationalAdmission?.admissionClass).toBe(
        "current_owner_request",
      );
    }
  });

  it("10. Operational basis claim: current owner turn licenses independently of background overlap helpers", () => {
    const motivations: Motivation[] = [
      { id: 10, kind: "user_message", summary: "Let's work on the package.json task", score: 90 },
      { id: 20, kind: "callback", summary: "inspect package.json and provide version", score: 85 },
    ];
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Let's work on the package.json task",
      motivations,
      selectedMotivationIds: [10, 20],
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
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
    const consumeId = upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "test wake persistence consume",
      sourceType: "custom",
      sourceId: "wake-preserve-consume",
      activation: 1.0,
      urgency: 0.97,
    });
    const retryId = upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "test wake persistence retry",
      sourceType: "custom",
      sourceId: "wake-preserve-retry",
      activation: 1.0,
      urgency: 0.95,
    });
    const consumeOriginal = (
      db.prepare("SELECT updated_at FROM mind_state_items WHERE id = ?").get(consumeId) as {
        updated_at: string;
      }
    ).updated_at;
    const retryOriginal = (
      db.prepare("SELECT updated_at FROM mind_state_items WHERE id = ?").get(retryId) as {
        updated_at: string;
      }
    ).updated_at;

    const claimedConsume = claimUrgentMindState(db, ownerId);
    expect(claimedConsume?.id).toBe(consumeId);
    expect(
      (db.prepare("SELECT updated_at FROM mind_state_items WHERE id = ?").get(consumeId) as {
        updated_at: string;
      }).updated_at,
    ).toBe(consumeOriginal);

    consumeUrgentWake(db, claimedConsume!.id);
    const afterConsume = db
      .prepare("SELECT updated_at, status FROM mind_state_items WHERE id = ?")
      .get(consumeId) as { updated_at: string; status: string };
    expect(afterConsume.updated_at).toBe(consumeOriginal);
    expect(afterConsume.status).toBe("active");

    const claimedRetry = claimUrgentMindState(db, ownerId);
    expect(claimedRetry?.id).toBe(retryId);
    retryUrgentWake(db, claimedRetry!.id);
    expect(
      (db.prepare("SELECT updated_at FROM mind_state_items WHERE id = ?").get(retryId) as {
        updated_at: string;
      }).updated_at,
    ).toBe(retryOriginal);
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
    upsertMindStateItem(db, {
      ownerId,
      kind: "concern",
      text: "inspect package.json and provide version",
      sourceType: "custom",
      sourceId: "stale-package-json",
      activation: 0.95,
      urgency: 1.0,
    });

    const userMessage = "Hey Ashley, what are you thinking about tonight?";
    const motivations: Motivation[] = [
      { id: 1, kind: "user_message", summary: userMessage, score: 95 },
      { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 90 },
    ];

    const base = createBaseDecision({
      motivationIds: [1, 2],
      score: 95,
      urgency: 1.0,
      uncertainty: 0.1,
      objective: "respond to owner",
      reason: "answer question",
    });

    const decision = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      async () => ({
        text: JSON.stringify({
          kind: "speak",
          shouldSpeak: true,
          completion: "complete",
          effort: "low",
          uncertainty: 0.1,
          urgency: 0.6,
          objective: "I still have that repository inspection in the back of my mind.",
          reason: "Doc asked what I am thinking about",
          motivationIds: [1, 2],
          evidenceDisposition: "sufficient",
        }),
      }) as any,
    );

    expect(decision.kind).toBe("speak");
    expect(decision.operationalRequest).toBeFalsy();
    expect(decision.reactiveOperationalAdmission).toBeFalsy();
    expect(decision.evidenceDisposition).toBe("sufficient");
    expect(decision.objective).toContain("repository inspection");
    expect(decision.motivationIds).toEqual(expect.arrayContaining([1, 2]));

    const rejected = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      async () => ({ text: inspectionProposal([1, 2]) }) as any,
    );
    expect(rejected.operationalRequest).toBeFalsy();
    expect(rejected.thoughtError).toBe("unauthorized_task_continuation");
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
    expect(decision.operationalBasisMotivationId).toBe(1);
    expect(decision.reactiveOperationalAdmission?.admitted).toBe(true);
    expect(decision.reactiveOperationalAdmission?.admissionClass).toBe(
      "current_owner_request",
    );
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
    expect(decision.thoughtError).toBe("unauthorized_task_continuation");
  });

  it("current-owner admission does not require the user_message id to be selected", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Please propose a bounded candidate change-set.",
      motivations: [
        { id: 1, kind: "question", summary: "Can you propose a bounded candidate change-set?", score: 80 },
        {
          id: 2,
          kind: "user_message",
          summary: "Please propose a bounded candidate change-set.",
          score: 95,
        },
      ],
      selectedMotivationIds: [1],
      operationalRequest: {
        kind: "candidate_authorship",
        request: {
          operation: "changeset.author",
          projectId: "project-ashley",
          objective: "seal",
          rationale: "owner asked",
          riskClass: "low",
        },
      },
    });
    expect(result.admitted).toBe(true);
    if (result.admitted) {
      expect(result.validatedBasisMotivationId).toBe(2);
      expect(result.admissionClass).toBe("current_owner_request");
    }
  });

  it("A. 'Did you get the file?' plus stale package.json inspection is rejected", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Did you get the file?",
      motivations: [
        { id: 1, kind: "user_message", summary: "Did you get the file?", score: 95 },
        { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 90 },
      ],
      selectedMotivationIds: [1, 2],
      claimedBasisMotivationId: 2,
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
  });

  it("B. Word 'version' about an idea does not license package.json inspection", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "What version of that idea were we discussing?",
      motivations: [
        { id: 1, kind: "user_message", summary: "What version of that idea were we discussing?", score: 95 },
        { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 90 },
      ],
      selectedMotivationIds: [1, 2],
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
  });

  it("C. Generic inspect-something with two stale inspection tasks fails closed", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Can you inspect something for me?",
      motivations: [
        { id: 1, kind: "user_message", summary: "Can you inspect something for me?", score: 95 },
        { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 80 },
        { id: 3, kind: "callback", summary: "inspect README.md for the intro", score: 80 },
      ],
      selectedMotivationIds: [1, 2, 3],
      claimedBasisMotivationId: 2,
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
  });

  it("D. Basis ID not in current motivations is rejected", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Can you inspect package.json and tell me the version?",
      motivations: [
        { id: 1, kind: "user_message", summary: "Can you inspect package.json and tell me the version?", score: 95 },
      ],
      selectedMotivationIds: [1],
      claimedBasisMotivationId: 999,
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
    if (!result.admitted) expect(result.reason).toBe("basis_not_in_input");
  });

  it("E. Basis pointing at a non-operational user_message is rejected", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Hey Ashley, what are you thinking about tonight?",
      motivations: [
        { id: 1, kind: "user_message", summary: "Hey Ashley, what are you thinking about tonight?", score: 95 },
      ],
      selectedMotivationIds: [1],
      claimedBasisMotivationId: 1,
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
  });

  it("F. Basis pointing at stale callback with unrelated current message is rejected", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "How are you feeling today?",
      motivations: [
        { id: 1, kind: "user_message", summary: "How are you feeling today?", score: 95 },
        { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 90 },
      ],
      selectedMotivationIds: [1, 2],
      claimedBasisMotivationId: 2,
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
  });

  it("G. User motivation alongside stale callback still rejects stale operation", async () => {
    const decision = await deliberateDecision(
      db,
      createBaseDecision({ motivationIds: [1, 2] }),
      [
        { id: 1, kind: "user_message", summary: "Hey Ashley, what are you thinking about tonight?", score: 95 },
        { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 90 },
      ],
      "reactive",
      async () => ({ text: inspectionProposal([1, 2], { operationalBasisMotivationId: 2 }) }) as any,
    );
    expect(decision.operationalRequest).toBeFalsy();
    expect(decision.thoughtError).toBe("unauthorized_task_continuation");
  });

  it("H. Explicit inspect package.json request is admitted", async () => {
    const result = await runThoughtModel(
      db,
      createBaseDecision(),
      [
        {
          id: 1,
          kind: "user_message",
          summary: "Can you inspect package.json and tell me the version?",
          score: 95,
        },
      ],
      "reactive",
      async () => ({
        text: inspectionProposal([1], { operationalBasisMotivationId: 1 }),
      }) as any,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.operationalRequest?.kind).toBe("project_inspection");
      expect(result.proposal.reactiveOperationalAdmission?.admissionClass).toBe(
        "current_owner_request",
      );
    }
  });

  it("I. Current request for file A does not license inspecting file B", () => {
    const result = evaluateReactiveOperationalAdmission({
      userMessage: "Can you inspect README.md for me?",
      motivations: [
        { id: 1, kind: "user_message", summary: "Can you inspect README.md for me?", score: 95 },
      ],
      selectedMotivationIds: [1],
      operationalRequest: inspectPackageJson(),
    });
    expect(result.admitted).toBe(false);
  });

  it("J. Trusted admission absent at runtime blocks execution", () => {
    const decision = createBaseDecision({
      motivationIds: [1],
      operationalRequest: inspectPackageJson(),
    });
    const gate = authorizeReactiveOperationalExecution({
      decision,
      userMessage: "Can you inspect package.json and tell me the version?",
      motivations: [
        { id: 1, kind: "user_message", summary: "Can you inspect package.json and tell me the version?", score: 95 },
      ],
      currentMessageEntityUuid: "turn-a",
    });
    expect(gate.permitted).toBe(false);
    if (!gate.permitted) expect(gate.reason).toBe("trusted_admission_absent");
  });

  it("K. Trusted admission from a different reactive turn is rejected", () => {
    const motivations: Motivation[] = [
      {
        id: 1,
        kind: "user_message",
        summary: "Can you inspect package.json and tell me the version?",
        score: 95,
      },
    ];
    const admitted = evaluateReactiveOperationalAdmission({
      userMessage: "Can you inspect package.json and tell me the version?",
      motivations,
      selectedMotivationIds: [1],
      operationalRequest: inspectPackageJson(),
      currentMessageEntityUuid: "turn-old",
    });
    expect(admitted.admitted).toBe(true);
    const decision = createBaseDecision({
      motivationIds: [1],
      operationalRequest: inspectPackageJson(),
      operationalBasisMotivationId: 1,
      reactiveOperationalAdmission: admitted.admitted ? admitted : undefined,
    });
    const gate = authorizeReactiveOperationalExecution({
      decision,
      userMessage: "Can you inspect package.json and tell me the version?",
      motivations,
      currentMessageEntityUuid: "turn-new",
    });
    expect(gate.permitted).toBe(false);
    if (!gate.permitted) expect(gate.reason).toBe("admission_turn_mismatch");
  });

  it("L. Unauthorized first attempt uses unauthorized_task_continuation and second attempt still does not execute", async () => {
    let calls = 0;
    const result = await runThoughtModel(
      db,
      createBaseDecision({ motivationIds: [1, 2] }),
      [
        { id: 1, kind: "user_message", summary: "Did you get the file?", score: 95 },
        { id: 2, kind: "callback", summary: "inspect package.json and provide version", score: 90 },
      ],
      "reactive",
      async (messages) => {
        calls += 1;
        if (calls === 2) {
          const system = String(messages.find((item) => item.role === "system")?.content ?? "");
          expect(system).toContain("not authorized by the current reactive turn");
          expect(system).not.toContain("Use only the operations listed in the contract");
        }
        return { text: inspectionProposal([1, 2], { operationalBasisMotivationId: 2 }) };
      },
    );
    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unauthorized_task_continuation");
    }
    expect(result.envelope?.attempts).toHaveLength(2);
    expect(result.envelope?.attempts.every((attempt) => attempt.errorCode === "unauthorized_task_continuation")).toBe(
      true,
    );
  });
});
