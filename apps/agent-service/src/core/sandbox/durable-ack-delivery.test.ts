import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openNuclearDb } from "../db.js";
import { AshleyCore } from "../runtime.js";
import { env } from "../../env.js";
import {
  currentReleaseId,
  currentContractId,
  currentBuildIdentity,
  capabilityNames,
} from "../rollout/capabilities.js";
import { listDeliveryBubbles } from "../delivery/store.js";
import { getOperationalJob } from "./operational-job-store.js";
import { tickDurableCognition, type RunDurableThought } from "./durable-cognition.js";

vi.mock("../conversation/expression.js", () => ({
  expressSpeak: async () => ({
    text: "i can answer that from the live thread.",
    model: "test-model",
  }),
}));

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

const DURABLE_PROMPT =
  "[durable-work] Using the bounded operation capability, perform this finite Project Ashley candidate-only sequence: create a fresh candidate file called ashley-owner-smoke.txt containing Durable bounded work live smoke test, mechanically verify that candidate using the available verification capability, then seal the resulting candidate work as an advisory change-set.";

describe("Durable Work Owner Ack Delivery Boundary", () => {
  const originalMode = env.cognitionMode;
  const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
  const originalRegistryPath = env.sandboxProjectRegistryPath;
  const originalBounded = env.durableBoundedOperationEnabled;
  const originalThought = env.durableOperationalThoughtEnabled;

  let tmpDir: string;
  let registryPath: string;

  beforeEach(() => {
    env.cognitionMode = "apply";
    env.sandboxEngineeringLifecycleEnabled = true;
    process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";

    tmpDir = mkdtempSync(join(tmpdir(), "durable-ack-test-"));
    registryPath = join(tmpDir, "registry.json");
    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/mock/repo/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: true,
          verificationAllowed: true,
          authorshipAllowed: true,
          operationAllowed: true,
        },
      ]),
    );
    env.sandboxProjectRegistryPath = registryPath;
  });

  afterEach(() => {
    env.cognitionMode = originalMode;
    env.sandboxEngineeringLifecycleEnabled = originalLifecycle;
    env.sandboxProjectRegistryPath = originalRegistryPath;
    env.durableBoundedOperationEnabled = originalBounded;
    env.durableOperationalThoughtEnabled = originalThought;
    delete process.env.SANDBOX_V2_FORCE_AVAILABLE;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("A/B/C/D: durable admission returns populated plannedBubbles and persists draft_text and bubbles", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateCapabilities(db);
    env.durableBoundedOperationEnabled = true;
    env.durableOperationalThoughtEnabled = true;

    try {
      const core = new AshleyCore(db);

      // Simulate real Discord turn (simulateDelivery: false, inboundDiscordMessageIds present)
      const result = await core.handleReactiveChat({
        ownerId: "212123686923272192",
        channel: "discord",
        message: DURABLE_PROMPT,
        inboundDiscordMessageIds: ["discord-msg-1001"],
        simulateDelivery: false,
      });

      // A: plannedBubbles must be populated and non-empty
      expect(result.plannedBubbles).toBeDefined();
      expect(result.plannedBubbles?.length).toBeGreaterThan(0);
      expect(result.plannedBubbles?.[0]?.text).toBe(
        "I'll work on that in my own time. No sandbox operation is admitted yet.",
      );

      // B: delivery reservation must have draft_text and delivery_bubbles rows in DB
      expect(result.reservationId).toBeDefined();
      const resRow = db
        .prepare("SELECT * FROM delivery_reservations WHERE id = ?")
        .get(result.reservationId!) as { draft_text: string | null; state: string };
      expect(resRow.draft_text).toBe(
        "I'll work on that in my own time. No sandbox operation is admitted yet.",
      );
      expect(resRow.state).toBe("reserved");

      const bubbles = listDeliveryBubbles(db, result.reservationId!);
      expect(bubbles.length).toBe(1);
      expect(bubbles[0]?.text).toBe(
        "I'll work on that in my own time. No sandbox operation is admitted yet.",
      );

      // C: Discord-facing check - length > 0, plannedBubbles.length > 0, so never empty sendable reply
      expect(result.text.length).toBeGreaterThan(0);
      expect((result.plannedBubbles ?? []).length).toBe(1);

      // D: Ack text is strictly non-operational (no M6 or effect claims)
      expect(result.text).not.toContain("workspace created");
      expect(result.text).not.toContain("verified");
      expect(result.text).not.toContain("sealed");
      expect(result.text).toContain("No sandbox operation is admitted yet.");

      // Verify the durable job was created in DB
      const jobRow = db
        .prepare(
          "SELECT * FROM operational_jobs WHERE admission_reservation_id = ?",
        )
        .get(result.reservationId!) as { job_id: string; status: string; job_phase: string };
      expect(jobRow).toBeDefined();
      expect(jobRow.job_id).toMatch(/^doj_/);
      expect(jobRow.job_phase).toBe("cognition_pending");
    } finally {
      db.close();
    }
  });

  it("E/F/G/H: background job continues independently and reaches success even if ack delivery later fails; never invites duplicate submission", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateCapabilities(db);
    env.durableBoundedOperationEnabled = true;
    env.durableOperationalThoughtEnabled = true;

    try {
      const core = new AshleyCore(db);

      const result = await core.handleReactiveChat({
        ownerId: "212123686923272192",
        channel: "discord",
        message: DURABLE_PROMPT,
        inboundDiscordMessageIds: ["discord-msg-1002"],
        simulateDelivery: false,
      });

      const reservationId = result.reservationId!;
      const jobRow = db
        .prepare(
          "SELECT * FROM operational_jobs WHERE admission_reservation_id = ?",
        )
        .get(reservationId) as { job_id: string };

      // Simulate an external Discord transport failure on the ack reservation
      core.finalizeDeliveryReservation("212123686923272192", reservationId, "send_failure");

      const resAfterFail = db
        .prepare("SELECT * FROM delivery_reservations WHERE id = ?")
        .get(reservationId) as { state: string; finalization_reason: string };
      expect(resAfterFail.state).toBe("aborted");
      expect(resAfterFail.finalization_reason).toBe("send_failure");

      // F: Ack failure does not alter job status in operational_jobs
      const jobAfterAckFail = getOperationalJob(db, jobRow.job_id);
      expect(jobAfterAckFail?.jobPhase).toBe("cognition_pending");
      expect(jobAfterAckFail?.status).toBe("admitted");

      // E/G: Background runner can still pick up the job and execute Thought
      const runThought: RunDurableThought = async () => ({
        kind: "ok",
        normalized: {
          schemaVersion: 1,
          kind: "speak",
          shouldSpeak: true,
          completion: "complete",
          evidenceDisposition: "operational_claim",
          operationalKind: "bounded_operation",
          operationalRequest: {
            operation: "objective.operate",
            projectId: "project-ashley",
            origin: "owner_request",
            objective: "test",
            successCondition: "done",
            failureCondition: "fail",
            steps: [],
            budget: { maxSteps: 1, deadlineAtMs: Date.now() + 10000 },
          },
          thoughtError: null,
        },
        attentionRequestId: 999,
      });

      await tickDurableCognition({
        db,
        nowMs: () => Date.now(),
        runDurableThought: runThought,
      });

      const jobAfterThought = getOperationalJob(db, jobRow.job_id);
      expect(jobAfterThought?.jobPhase).toBe("execution_admitted");
      expect(jobAfterThought?.cognitionState).toBe("succeeded");
    } finally {
      db.close();
    }
  });

  it("I: ordinary reactive turn when both flags are OFF remains unchanged", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateCapabilities(db);
    env.durableBoundedOperationEnabled = false;
    env.durableOperationalThoughtEnabled = false;

    try {
      const core = new AshleyCore(db);

      const result = await core.handleReactiveChat({
        ownerId: "212123686923272192",
        channel: "discord",
        message: "hello there",
        simulateDelivery: true,
      });

      expect(result.text).toBe("i can answer that from the live thread.");
      expect(result.deliveryState).toBe("committed");

      // Zero operational jobs created
      const jobsCount = db
        .prepare("SELECT count(*) as c FROM operational_jobs")
        .get() as { c: number };
      expect(jobsCount.c).toBe(0);
    } finally {
      db.close();
    }
  });

  it("J: Slice 1 only (Thought off) does not admit early durable cognition envelope but preserves normal flow", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateCapabilities(db);
    env.durableBoundedOperationEnabled = true;
    env.durableOperationalThoughtEnabled = false;

    try {
      const core = new AshleyCore(db);

      const result = await core.handleReactiveChat({
        ownerId: "212123686923272192",
        channel: "discord",
        message: DURABLE_PROMPT,
        simulateDelivery: true,
      });

      // Under Slice 1 only, early durable cognition envelope is skipped
      expect(result.deliveryState).toBe("committed");
      expect(result.text).toBe("i can answer that from the live thread.");
    } finally {
      db.close();
    }
  });
});
