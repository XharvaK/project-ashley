import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openNuclearDb } from "../../db.js";
import { admitCognitiveIngress } from "../ingress/http.js";
import { runCognitiveCycle } from "../thought/run.js";
import { runLiveCognitiveTurn } from "../dispatch/live.js";
import { admitCycle, appendInboxEvent, claimInboxEvent } from "../cycle/inbox.js";
import { consumeInboxEvent } from "../cycle/inbox-consumer.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { insertOutboxPending, updateOutboxStatus } from "../speech/outbox.js";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { openTestSidecar, makeThoughtDraft } from "../test-support.js";
import type { KernelDeps, Observation, ThoughtInput } from "../types.js";

const capabilityReality = {
  vision: false,
  attachmentText: false,
  conversationalRead: false,
  webSearch: false,
  canOfferProjectInspection: false,
  canOfferWorkspace: false,
  canOfferVerification: false,
  canOfferAuthorship: false,
  canOfferBoundedOperation: false,
  canOfferPatchExport: false,
  approvedProjectIds: [],
};

function packs() {
  return {
    epistemic: { allowInferredWorldClaims: false },
    currentness: { requireObservationForLatest: true },
    receipt: { receiptsByEffectId: {} },
    capability: capabilityReality,
    operational: { sandboxAvailable: false },
    relational: { withdrawalActive: false, neverMention: [] },
    stateEpoch: { authorityEpoch: 1 },
  };
}

function thoughtCompletion(input: ThoughtInput, text = "hello") {
  return {
    text: JSON.stringify(makeThoughtDraft({
      cycleId: input.cycleId,
      generation: input.generation,
      authorityEpoch: input.authorityEpoch,
      occupantId: input.occupantId,
      triggerRef: input.trigger.ref,
      speech: {
        mode: "draft",
        mustSay: [text],
        mustNot: [],
        surfaceDraft: text,
        acceptableRealizations: [text],
        presentationDirectives: [],
      },
    })),
    model: "fake",
    modelAlias: "thought",
    resolvedModelId: null,
  };
}

function baseDeps(
  sidecar: DatabaseSync,
  completeChat: KernelDeps["completeChat"],
  overrides: Partial<KernelDeps> = {},
): KernelDeps {
  return {
    nowMs: () => 10,
    attentionDb: sidecar,
    completeChat,
    runPerception: vi.fn(async (): Promise<Observation[]> => []),
    executeObservation: vi.fn(),
    executeEffect: vi.fn(),
    checkAuthority: () => ({ ok: true }),
    loadAuthorityPacks: packs,
    expressionEnabled: false,
    projectOutbox: vi.fn(async () => undefined),
    constitution: { constitutional: ["truth first"], stableSelf: ["curious"] },
    capabilityReality,
    ...overrides,
  };
}

function thoughtInput(messages: unknown[]): ThoughtInput {
  const user = (messages as Array<{ role?: string; content?: unknown }>).find((item) => item.role === "user");
  return JSON.parse(String(user?.content ?? "{}")) as ThoughtInput;
}

describe("Q2 repair integrated lifecycle", () => {
  it("composes a second owner turn during a pending Thought call, aborts the first call, and rebuilds both evidence rows in the same generation", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    let calls = 0;
    let firstSignal: AbortSignal | undefined;
    const completeChat = vi.fn(async (messages: unknown[], options: { signal?: AbortSignal }) => {
      calls += 1;
      const input = thoughtInput(messages);
      if (calls === 1) {
        firstSignal = options.signal;
        firstStarted();
        await new Promise<never>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      }
      expect(input.rawConversation.map((item) => item.text)).toEqual(["first", "second"]);
      expect(input.authorityObjections).toEqual([]);
      return thoughtCompletion(input, "second");
    });
    const first = admitCognitiveIngress(sidecar, nuclear, { userId: "doc", message: "first" }, { nowMs: 1 });
    const firstEvent = claimInboxEvent(sidecar, { workerId: "test", eventId: first.inboxEventId, nowMs: 2 });
    if (!firstEvent) throw new Error("first_event_not_claimed");
    const run = runCognitiveCycle(sidecar, nuclear, firstEvent, baseDeps(sidecar, completeChat));
    await started;

    const second = admitCognitiveIngress(sidecar, nuclear, { userId: "doc", message: "second" }, { nowMs: 3 });
    expect(second.action).toBe("compose");
    expect(second.generation).toBe(first.generation);
    expect(firstSignal?.aborted).toBe(true);

    const result = await run;
    expect(result).toMatchObject({ published: true, generation: first.generation, thoughtModelAttempts: 2, acceptedThoughtPasses: 1, composeCancelledAttempts: 1 });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM speech_outbox WHERE generation = 1").get()).toMatchObject({ count: 1 });
    nuclear.close();
    sidecar.close();
  });

  it("preempts after a delivered turn and publishes the next turn in generation N+1", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    const completeChat = vi.fn(async (messages: unknown[]) => thoughtCompletion(thoughtInput(messages), "reply"));
    const first = admitCognitiveIngress(sidecar, nuclear, { userId: "doc", message: "first" }, { nowMs: 1 });
    const firstEvent = claimInboxEvent(sidecar, { workerId: "test", eventId: first.inboxEventId, nowMs: 2 });
    if (!firstEvent) throw new Error("first_event_not_claimed");
    const firstResult = await runLiveCognitiveTurn({
      sidecar,
      nuclear,
      event: firstEvent,
      deps: baseDeps(sidecar, completeChat),
    });
    if (firstResult.outboxId === null) throw new Error("first_outbox_missing");
    updateOutboxStatus(sidecar, firstResult.outboxId, "delivered", { discordMessageIds: ["discord-1"] });

    const second = admitCognitiveIngress(sidecar, nuclear, { userId: "doc", message: "second" }, { nowMs: 3 });
    expect(second.action).toBe("preempt");
    expect(second.generation).toBe(first.generation + 1);
    const secondEvent = claimInboxEvent(sidecar, { workerId: "test", eventId: second.inboxEventId, nowMs: 4 });
    if (!secondEvent) throw new Error("second_event_not_claimed");
    const secondResult = await runCognitiveCycle(sidecar, nuclear, secondEvent, baseDeps(sidecar, completeChat));
    expect(secondResult).toMatchObject({ published: true, generation: first.generation + 1 });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: 2 });
    expect(sidecar.prepare("SELECT send_status FROM speech_outbox WHERE generation = 1").get()).toMatchObject({ send_status: "delivered" });
    nuclear.close();
    sidecar.close();
  });

  it("preempts while an effect is pending and fences the late old-generation result", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    let effectStarted!: () => void;
    const started = new Promise<void>((resolve) => { effectStarted = resolve; });
    let releaseEffect!: () => void;
    const effectRelease = new Promise<void>((resolve) => { releaseEffect = resolve; });
    let calls = 0;
    const completeChat = vi.fn(async (messages: unknown[]) => {
      calls += 1;
      const input = thoughtInput(messages);
      return {
        text: JSON.stringify({
          kind: "effect_proposal",
          cycleId: input.cycleId,
          generation: input.generation,
          occupantId: input.occupantId,
          effectProposal: {
            effectId: "effect-pending",
            cycleId: input.cycleId,
            generation: input.generation,
            idempotencyKey: "idempotency-pending",
            kind: "workspace.write_file",
            authorityEpoch: input.authorityEpoch,
            request: { projectId: "project-ashley", path: "src/pending.ts" },
          },
        }),
        model: "fake",
        modelAlias: "thought",
        resolvedModelId: null,
      };
    });
    const executeEffect = vi.fn(async () => {
      effectStarted();
      await effectRelease;
      return {
        receiptId: "receipt-pending",
        effectId: "effect-pending",
        idempotencyKey: "idempotency-pending",
        outcome: "succeeded" as const,
        claims: { state: "succeeded" },
        atMs: 5,
        dataClassification: "never_public" as const,
        secretOmitted: true,
      };
    });
    const first = admitCognitiveIngress(sidecar, nuclear, { userId: "doc", message: "start operation" }, { nowMs: 1 });
    const firstEvent = claimInboxEvent(sidecar, { workerId: "test", eventId: first.inboxEventId, nowMs: 2 });
    if (!firstEvent) throw new Error("first_event_not_claimed");
    const run = runCognitiveCycle(sidecar, nuclear, firstEvent, baseDeps(sidecar, completeChat, { executeEffect }));
    await started;

    const second = admitCognitiveIngress(sidecar, nuclear, { userId: "doc", message: "preempt operation" }, { nowMs: 3 });
    expect(second.action).toBe("preempt");
    expect(second.generation).toBe(first.generation + 1);
    releaseEffect();

    const result = await run;
    expect(result).toMatchObject({ published: false, generation: first.generation, acceptedSettlements: 0 });
    expect(calls).toBe(1);
    expect(executeEffect).toHaveBeenCalledTimes(1);
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: 0 });
    nuclear.close();
    sidecar.close();
  });

  it("reclaims a real inbox event after a publication commit and replays its durable identity without a second Thought call or semantic delta", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ashley-q2-replay-"));
    const databasePath = join(directory, "sidecar.db");
    let sidecar = openCognitiveSidecarDb(new DatabaseSync(databasePath), { dataPlane: { kind: "isolated" } });
    const cycle = admitCycle(sidecar, {
      cycleId: "cycle-reclaim",
      conversationId: "thread-reclaim",
      triggerKind: "owner_message",
      triggerRef: "owner-reclaim",
      occupantId: "doc",
      authorityEpoch: 1,
      nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: cycle.conversationId,
      text: "reclaim me",
      discordMessageIds: ["discord-reclaim"],
      nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      id: "event-reclaim",
      conversationId: cycle.conversationId,
      kind: "owner_message",
      payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: evidence.text },
      createdAtMs: 2,
    });
    const claimed = claimInboxEvent(sidecar, { workerId: "first", eventId: event.id, nowMs: 3, leaseMs: 120_000 });
    if (!claimed) throw new Error("event_not_claimed");
    const first = await runCognitiveCycle(sidecar, sidecar, claimed, baseDeps(sidecar, vi.fn(async (messages) => thoughtCompletion(thoughtInput(messages), "replayed"))));
    const before = {
      settlements: Number((sidecar.prepare("SELECT COUNT(*) AS count FROM settlements").get() as { count: number }).count),
      context: Number((sidecar.prepare("SELECT COUNT(*) AS count FROM working_context_items").get() as { count: number }).count),
      outbox: Number((sidecar.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get() as { count: number }).count),
    };
    expect(first.published).toBe(true);
    sidecar.close();

    sidecar = openCognitiveSidecarDb(new DatabaseSync(databasePath), { dataPlane: { kind: "isolated" } });
    const reclaimed = claimInboxEvent(sidecar, { workerId: "second", eventId: event.id, nowMs: Date.now() + 1 });
    if (!reclaimed) throw new Error("event_not_reclaimed");
    const completeChat = vi.fn(async () => { throw new Error("thought_must_not_run_on_replay"); });
    let replay: Awaited<ReturnType<typeof runCognitiveCycle>> | undefined;
    await consumeInboxEvent(sidecar, reclaimed, async () => {
      replay = await runCognitiveCycle(sidecar, sidecar, reclaimed, baseDeps(sidecar, completeChat));
    });
    if (!replay) throw new Error("replay_result_missing");
    expect(replay).toMatchObject({ published: true, cycleId: cycle.cycleId, generation: cycle.generation, outboxId: first.outboxId });
    expect(completeChat).not.toHaveBeenCalled();
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: before.settlements });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM working_context_items").get()).toMatchObject({ count: before.context });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: before.outbox });
    expect(sidecar.prepare("SELECT status FROM inbox_events WHERE id = ?").get(event.id)).toMatchObject({ status: "consumed" });
    sidecar.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
