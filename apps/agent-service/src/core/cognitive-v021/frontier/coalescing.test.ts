import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { admitCognitiveIngress } from "../ingress/http.js";
import { consumeInboxEvent, consumeNextInboxEvent } from "../cycle/inbox-consumer.js";
import { getCycle, getInboxEvent } from "../cycle/inbox.js";
import { listConversationEvidence } from "../evidence/conversation-log.js";
import {
  getActiveDeferredFrontier,
  getDeferredFrontier,
  rescheduleDeferredFrontier,
} from "./ledger.js";
import { startFrontierCoordinator } from "./coordinator.js";
import { runLiveCognitiveTurn, createLiveCognitiveDispatcher } from "../dispatch/live.js";
import { makeSemanticSettlement } from "../test-support.js";
import type {
  CapabilityReality,
  IdentitySlice,
  KernelDeps,
  Observation,
} from "../types.js";

const constitution: IdentitySlice = { constitutional: ["truth first"], stableSelf: [] };
const capabilityReality: CapabilityReality = {
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

import { openNuclearDb } from "../../db.js";

function createNuclearDb(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

function createSidecarDb(): DatabaseSync {
  return openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
}

function mockDeps(nowRef: { nowMs: number }, completeChatImpl: any): KernelDeps {
  return {
    nowMs: () => nowRef.nowMs,
    attentionDb: openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } }),
    completeChat: vi.fn(completeChatImpl),
    runPerception: vi.fn(async (): Promise<Observation[]> => []),
    executeObservation: vi.fn(),
    executeEffect: vi.fn(),
    checkAuthority: () => ({ ok: true }),
    loadAuthorityPacks: () => ({
      epistemic: { allowInferredWorldClaims: false },
      currentness: { requireObservationForLatest: false },
      receipt: { receiptsByEffectId: {} },
      capability: capabilityReality,
      operational: { sandboxAvailable: false },
      relational: { withdrawalActive: false, neverMention: [] },
      stateEpoch: { authorityEpoch: 1 },
    }),
    expressionEnabled: false,
    projectOutbox: vi.fn(async () => undefined),
    constitution,
    capabilityReality,
  };
}

describe("Wave 1C: Deferred Reactive Frontier Coalescing & V021 Integration", () => {
  it("executes full Campaign 1 sequence: initial deferral A -> follower arrival B, C -> wake re-admission at T1 -> single dispatch", async () => {
    const sidecar = createSidecarDb();
    const nuclear = createNuclearDb();
    const clock = { nowMs: 1_000_000 };

    let thoughtCallCount = 0;
    const completeChatMock = async (messages: any[]) => {
      thoughtCallCount += 1;
      if (thoughtCallCount === 1) {
        // Initial call for A: simulate attention_deadline with advisory scheduling hint T1
        const err = Object.assign(new Error("attention_deadline"), {
          code: "attention_deadline",
          nextEligibleAtMs: clock.nowMs + 35_000,
        });
        throw err;
      }
      // Second call at T1: simulate successful admission and response
      return {
        text: JSON.stringify(makeSemanticSettlement()),
        model: "mistral-small-2603",
        modelAlias: "mistral-small-2603",
        resolvedModelId: "mistral-small-2603",
      };
    };

    const deps = mockDeps(clock, completeChatMock);
    const projectorMock = {
      project: vi.fn(async () => undefined),
      projectSystem: vi.fn(async () => undefined),
    };

    // 1. Initial utterance A arrives
    const ingressA = admitCognitiveIngress(
      sidecar,
      nuclear,
      { userId: "user:owner", message: "Message A from owner" },
      { nowMs: clock.nowMs },
    );
    expect(ingressA.accepted).toBe(true);

    // 2. Dispatcher processes inbox event A
    const inboxA = getInboxEvent(sidecar, ingressA.inboxEventId);
    expect(inboxA).not.toBeNull();

    const tickResult = await consumeNextInboxEvent(sidecar, {
      workerId: "worker:test",
      handler: createLiveCognitiveDispatcher({ sidecar, nuclear, deps, projector: projectorMock }),
      nowMs: () => clock.nowMs,
    });

    expect(tickResult.outcome).toBe("consumed");

    // Verify inbox event A was settled with deferred_to_frontier
    const settledA = getInboxEvent(sidecar, ingressA.inboxEventId);
    expect(settledA?.status).toBe("consumed");
    expect(settledA?.terminalReason).toBe("deferred_to_frontier");

    // Verify cycle is in capacity_wait state
    const cycleA = getCycle(sidecar, ingressA.cycleId);
    expect(cycleA?.state).toBe("capacity_wait");

    // Verify frontier was created in waiting state
    const frontier = getActiveDeferredFrontier(sidecar, ingressA.conversationId);
    expect(frontier).not.toBeNull();
    expect(frontier?.state).toBe("waiting");
    expect(frontier?.nextEligibleAtMs).toBe(1_035_000);
    expect(frontier?.capacityDeadlineAtMs).toBe(1_120_000);
    expect(frontier?.latestEvidenceRowId).toBe(ingressA.evidenceRowId);

    // Verify NO infrastructure error notice was emitted to Discord
    expect(projectorMock.project).not.toHaveBeenCalled();
    expect(projectorMock.projectSystem).not.toHaveBeenCalled();

    // 3. Follower message B arrives at +5s
    clock.nowMs = 1_005_000;
    const ingressB = admitCognitiveIngress(
      sidecar,
      nuclear,
      { userId: "user:owner", message: "Message B from owner" },
      { nowMs: clock.nowMs },
    );
    expect(ingressB.accepted).toBe(true);

    // Verify B's inbox event was subsumed
    const settledB = getInboxEvent(sidecar, ingressB.inboxEventId);
    expect(settledB?.status).toBe("consumed");
    expect(settledB?.terminalReason).toBe("subsumed_by_frontier");

    // Verify frontier advanced with B's row id and nextEligibleAtMs is unchanged (zero re-metering!)
    const frontierAfterB = getActiveDeferredFrontier(sidecar, ingressA.conversationId);
    expect(frontierAfterB?.latestEvidenceRowId).toBe(ingressB.evidenceRowId);
    expect(frontierAfterB?.nextEligibleAtMs).toBe(1_035_000); // Unchanged!

    // 4. Follower message C arrives at +10s
    clock.nowMs = 1_010_000;
    const ingressC = admitCognitiveIngress(
      sidecar,
      nuclear,
      { userId: "user:owner", message: "Message C from owner" },
      { nowMs: clock.nowMs },
    );
    expect(ingressC.accepted).toBe(true);

    const frontierAfterC = getActiveDeferredFrontier(sidecar, ingressA.conversationId);
    expect(frontierAfterC?.latestEvidenceRowId).toBe(ingressC.evidenceRowId);
    expect(frontierAfterC?.nextEligibleAtMs).toBe(1_035_000); // Still unchanged!

    // 5. Check distinct evidence persistence
    const evidenceList = listConversationEvidence(sidecar, ingressA.conversationId, { limit: 10 });
    expect(evidenceList.map((e) => e.text)).toEqual([
      "Message A from owner",
      "Message B from owner",
      "Message C from owner",
    ]);

    // 6. Advance clock to T1 (1_035_000) and start frontier coordinator
    clock.nowMs = 1_035_000;
    const coordinator = startFrontierCoordinator(sidecar, nuclear, deps, {
      projector: projectorMock,
      nowMs: () => clock.nowMs,
      pollMs: 100,
    });

    // Run coordinator poll
    const processed = await coordinator.pollNow();
    expect(processed).toBe(1);
    coordinator.stop();

    // Verify Thought pass was called with the coalesced evidence
    expect(thoughtCallCount).toBe(2);

    // Verify speech outbox was published
    expect(projectorMock.project).toHaveBeenCalledTimes(1);

    // Verify frontier is now resolved
    const resolvedFrontier = getDeferredFrontier(sidecar, frontier!.frontierId);
    expect(resolvedFrontier?.state).toBe("resolved");

    // Verify active frontier no longer exists for conversation
    expect(getActiveDeferredFrontier(sidecar, ingressA.conversationId)).toBeNull();

    // Verify cycle is sending/completed
    const finalCycle = getCycle(sidecar, ingressA.cycleId);
    expect(["sending", "completed"]).toContain(finalCycle?.state);

    sidecar.close();
    nuclear.close();
  });

  it("handles re-deferral: stays waiting if blocked at T1 and now < 120s deadline", async () => {
    const sidecar = createSidecarDb();
    const nuclear = createNuclearDb();
    const clock = { nowMs: 1_000_000 };

    let callCount = 0;
    const completeChatMock = async () => {
      callCount += 1;
      // Both call 1 and call 2 fail with attention_deadline
      const nextTime = callCount === 1 ? clock.nowMs + 30_000 : clock.nowMs + 25_000;
      const err = Object.assign(new Error("attention_deadline"), {
        code: "attention_deadline",
        nextEligibleAtMs: nextTime,
      });
      throw err;
    };

    const deps = mockDeps(clock, completeChatMock);
    const ingress = admitCognitiveIngress(
      sidecar,
      nuclear,
      { userId: "user:owner", message: "Initial message" },
      { nowMs: clock.nowMs },
    );

    // First attempt at t=0s -> deferred to t=30s
    await consumeNextInboxEvent(sidecar, {
      workerId: "worker:test",
      handler: createLiveCognitiveDispatcher({ sidecar, nuclear, deps }),
      nowMs: () => clock.nowMs,
    });

    const f1 = getActiveDeferredFrontier(sidecar, ingress.conversationId);
    expect(f1?.nextEligibleAtMs).toBe(1_030_000);
    expect(f1?.state).toBe("waiting");

    // Advance clock to t=30s and poll coordinator -> re-deferred to t=55s
    clock.nowMs = 1_030_000;
    const coordinator = startFrontierCoordinator(sidecar, nuclear, deps, {
      nowMs: () => clock.nowMs,
    });
    await coordinator.pollNow();
    coordinator.stop();

    const f2 = getActiveDeferredFrontier(sidecar, ingress.conversationId);
    expect(f2?.state).toBe("waiting");
    expect(f2?.nextEligibleAtMs).toBe(1_055_000);
    expect(f2?.attemptCount).toBe(1);

    // Advance clock to t=55s and poll coordinator again
    clock.nowMs = 1_055_000;
    const coordinator2 = startFrontierCoordinator(sidecar, nuclear, deps, {
      nowMs: () => clock.nowMs,
    });
    await coordinator2.pollNow();
    coordinator2.stop();

    const f3 = getActiveDeferredFrontier(sidecar, ingress.conversationId);
    expect(f3?.state).toBe("waiting");
    expect(f3?.attemptCount).toBe(2);

    sidecar.close();
    nuclear.close();
  });

  it("enforces 120s absolute ceiling: exhausts frontier and emits terminal notice when exceeded", async () => {
    const sidecar = createSidecarDb();
    const nuclear = createNuclearDb();
    const clock = { nowMs: 1_000_000 };

    const completeChatMock = async () => {
      const err = Object.assign(new Error("attention_deadline"), {
        code: "attention_deadline",
        nextEligibleAtMs: clock.nowMs + 30_000,
      });
      throw err;
    };

    const deps = mockDeps(clock, completeChatMock);
    const ingress = admitCognitiveIngress(
      sidecar,
      nuclear,
      { userId: "user:owner", message: "Message to exhaust" },
      { nowMs: clock.nowMs },
    );

    await consumeNextInboxEvent(sidecar, {
      workerId: "worker:test",
      handler: createLiveCognitiveDispatcher({ sidecar, nuclear, deps }),
      nowMs: () => clock.nowMs,
    });

    const frontier = getActiveDeferredFrontier(sidecar, ingress.conversationId);
    expect(frontier).not.toBeNull();
    // Frontier deadline is 1_000_000 + 120_000 = 1_120_000

    // Advance past 120s deadline to 1_121_000
    clock.nowMs = 1_121_000;
    const coordinator = startFrontierCoordinator(sidecar, nuclear, deps, {
      nowMs: () => clock.nowMs,
    });
    await coordinator.pollNow();
    coordinator.stop();

    // Verify frontier is now exhausted
    const check = getDeferredFrontier(sidecar, frontier!.frontierId);
    expect(check?.state).toBe("exhausted");
    expect(getActiveDeferredFrontier(sidecar, ingress.conversationId)).toBeNull();

    // Verify cycle is silent
    const cycle = getCycle(sidecar, ingress.cycleId);
    expect(cycle?.state).toBe("silent");

    sidecar.close();
    nuclear.close();
  });

  it("spin guard: enforces limit of 12 attempts and exhausts frontier", () => {
    const sidecar = createSidecarDb();
    const nowMs = 1_000_000;

    // Insert frontier already at attempt 12
    sidecar.prepare(
      `INSERT INTO deferred_reactive_frontiers
         (frontier_id, conversation_id, cycle_id, generation, state,
          next_eligible_at_ms, capacity_deadline_at_ms, latest_evidence_row_id,
          claim_token, lease_expires_at_ms, attempt_count, created_at_ms, updated_at_ms)
       VALUES ('f-spin', 'conv:1', 'c:1', 1, 'running', 1010000, 1120000, 'ev:1', 'tok', 1020000, 12, 1000000, 1000000)`,
    ).run();

    const resched = rescheduleDeferredFrontier(sidecar, "f-spin", nowMs + 10_000, nowMs);
    expect(resched.outcome).toBe("exhausted");
    expect(resched.reason).toBe("mechanical_spin_guard_limit_exceeded");

    const check = getDeferredFrontier(sidecar, "f-spin");
    expect(check?.state).toBe("exhausted");
    sidecar.close();
  });

  it("non-forward scheduling hint guard: exhausts frontier if governor returns past or non-forward timestamp", () => {
    const sidecar = createSidecarDb();
    const nowMs = 1_000_000;

    sidecar.prepare(
      `INSERT INTO deferred_reactive_frontiers
         (frontier_id, conversation_id, cycle_id, generation, state,
          next_eligible_at_ms, capacity_deadline_at_ms, latest_evidence_row_id,
          claim_token, lease_expires_at_ms, attempt_count, created_at_ms, updated_at_ms)
       VALUES ('f-nonfwd', 'conv:1', 'c:1', 1, 'running', 1010000, 1120000, 'ev:1', 'tok', 1020000, 1, 1000000, 1000000)`,
    ).run();

    // Reschedule with non-forward hint (equal to nowMs)
    const resched = rescheduleDeferredFrontier(sidecar, "f-nonfwd", nowMs, nowMs);
    expect(resched.outcome).toBe("exhausted");
    expect(resched.reason).toBe("non_forward_scheduling_hint");

    const check = getDeferredFrontier(sidecar, "f-nonfwd");
    expect(check?.state).toBe("exhausted");
    sidecar.close();
  });
});
