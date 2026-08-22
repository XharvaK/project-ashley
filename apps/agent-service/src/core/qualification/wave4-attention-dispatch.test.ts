import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { completeChat } from "../../mistral-client.js";
import { openNuclearDb } from "../db.js";
import { Fixture, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { thoughtCapture, clearCaptures } from "./mistral-client-mock-state.js";
import {
  compareAttentionPriority,
  completeRequest,
  createFakeClock,
  currentModelEpoch,
  earliestLegalDispatchMs,
  getRequest,
  insertQueuedRequest,
  markRunning,
  runAttentiveDispatch,
  selectNextEligibleRequestId,
  tryAdmitRequest,
  type AttentionClock,
} from "../attention/index.js";
import { quotaContractFor } from "../model-routing/router.js";
import { bucketForRoute, routeBinding } from "../model-routing/registry.js";
import { MODEL_SENSITIVE_SET_FOR_CONTRACT } from "../attention/contract-material.js";
import {
  capabilityCanExecuteShadow,
  currentReleaseId,
  type CapabilityName,
} from "../rollout/capabilities.js";

/**
 * Track M — attention-dispatch side effects (M1, M2, M4, M5, M6).
 * M3 (route precedence) lives in wave4-attention-route-precedence.test.ts.
 *
 * OFFLINE only: the shadow Thought path is exercised through the mocked
 * mistral-client; the ledger A/B uses the REAL admission/queue functions with
 * only the injected provider `dispatch` callback faked (no HTTP anywhere).
 */

const EXPRESSION_ROUTE = routeBinding("ashley_expression");
const THOUGHT_ROUTE = routeBinding("thought");
const MISTRAL_BUCKET = bucketForRoute("ashley_expression");
const GROQ_THOUGHT_BUCKET = bucketForRoute("thought");

const SAVED = { groq: env.groqApiKey, mistral: env.mistralApiKey };

const temps: Array<{ db: DatabaseSync; path: string }> = [];

function tempDb(): DatabaseSync {
  const path = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
  const db = openNuclearDb(new DatabaseSync(path));
  temps.push({ db, path });
  return db;
}

function closeTempDbs(): void {
  while (temps.length > 0) {
    const entry = temps.pop();
    if (!entry) break;
    try {
      entry.db.close();
    } catch {
      /* noop */
    }
    rmSync(entry.path, { force: true });
  }
}

function enqueueLiveExpression(
  db: DatabaseSync,
  clock: AttentionClock,
  ageOriginAtMs?: number,
): number {
  return insertQueuedRequest(
    db,
    {
      lane: "interactive",
      purpose: "expression",
      modelAlias: EXPRESSION_ROUTE.configuredModelId,
      providerId: EXPRESSION_ROUTE.provider,
      quotaBucket: MISTRAL_BUCKET,
      routeAlias: "ashley_expression",
      estimatedInputTokens: 200,
      estimatedOutputTokens: 200,
      ageOriginAtMs,
    },
    clock,
  );
}

function enqueueShadowThought(
  db: DatabaseSync,
  clock: AttentionClock,
  ageOriginAtMs: number,
): number {
  return insertQueuedRequest(
    db,
    {
      lane: "exchange_cognition",
      purpose: "thought_observation",
      modelAlias: THOUGHT_ROUTE.configuredModelId,
      providerId: THOUGHT_ROUTE.provider,
      quotaBucket: GROQ_THOUGHT_BUCKET,
      routeAlias: "thought",
      estimatedInputTokens: 400,
      estimatedOutputTokens: 450,
      ageOriginAtMs,
    },
    clock,
  );
}

function seq(db: DatabaseSync, requestId: number): number | null {
  const value = getRequest(db, requestId)?.dispatch_sequence;
  return value == null ? null : Number(value);
}

function state(db: DatabaseSync, requestId: number): string {
  return String(getRequest(db, requestId)?.state);
}

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("wave4 Track M1 — shadow Thought dispatch wiring (no network)", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
    clearCaptures();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("thought observation reaches completeChat as purpose=thought_observation / lane=exchange_cognition / route=thought with fixture attentionDb", async () => {
    const fixture = new Fixture(true);
    try {
      await fixture.turn("tell me about dub techno");
      await fixture.pump();
      await fixture.quiesce();
      await fixture.turn("don't give me fake agreement just to be nice");
      await fixture.pump();
      await fixture.quiesce();

      expect(thoughtCapture.length).toBeGreaterThan(0);
      const options = thoughtCapture[0]!.options;
      expect(options.purpose).toBe("thought_observation");
      expect(options.lane).toBe("exchange_cognition");
      expect(options.route).toBe("thought");
      expect(options.attentionDb).toBe(fixture.db);
      expect(
        thoughtCapture.every(
          (capture) =>
            capture.options.purpose === "thought_observation" &&
            capture.options.lane === "exchange_cognition" &&
            capture.options.route === "thought" &&
            capture.options.attentionDb === fixture.db,
        ),
      ).toBe(true);
    } finally {
      fixture.close();
    }
  });

  it("route='thought' resolves to the production-equivalent groq 120B binding", () => {
    expect(THOUGHT_ROUTE.provider).toBe("groq");
    expect(THOUGHT_ROUTE.configuredModelId).toBe("openai/gpt-oss-120b");
    expect(THOUGHT_ROUTE.enabled).toBe(true);
  });
});

describe("wave4 Track M2 — ledger A/B: shadow Thought vs live Expression admission", () => {
  beforeEach(() => {
    env.groqApiKey = "wave4-fake-groq";
    env.mistralApiKey = "wave4-fake-mistral";
  });
  afterEach(() => {
    env.groqApiKey = SAVED.groq;
    env.mistralApiKey = SAVED.mistral;
    closeTempDbs();
  });

  it("DEFECT FIXED: an older queued shadow Thought does NOT preempt the live Expression via the DB-global queue", () => {
    const clock = createFakeClock(Date.parse("2026-02-01T00:00:00.000Z"));

    const control = tempDb();
    const controlLive = enqueueLiveExpression(control, clock);
    const controlAdmit = tryAdmitRequest(control, controlLive, clock);

    const variant = tempDb();
    const shadow = enqueueShadowThought(variant, clock, clock.nowMs() - 5_000);
    const variantLive = enqueueLiveExpression(variant, clock);
    const variantAdmit = tryAdmitRequest(variant, variantLive, clock);

    expect(controlAdmit).toEqual({ admitted: true, dispatchSequence: 1 });
    expect(state(control, controlLive)).toBe("reserved");

    expect(variantAdmit).toEqual({ admitted: true, dispatchSequence: 1 });
    expect(state(variant, variantLive)).toBe("reserved");
    expect(seq(variant, variantLive)).toBe(1);
    expect(selectNextEligibleRequestId(variant, clock)).toBe(shadow);
    expect(
      compareAttentionPriority(
        {
          id: shadow,
          lane: "exchange_cognition",
          purpose: "thought_observation",
          ageOriginAt: new Date(clock.nowMs() - 5_000).toISOString(),
          eligibleAt: new Date(clock.nowMs()).toISOString(),
        },
        {
          id: variantLive,
          lane: "interactive",
          purpose: "expression",
          ageOriginAt: new Date(clock.nowMs()).toISOString(),
          eligibleAt: new Date(clock.nowMs()).toISOString(),
        },
        clock.nowMs(),
      ),
    ).toBeGreaterThan(0);

    tryAdmitRequest(variant, shadow, clock);
    completeRequest(variant, shadow, { outcome: "completed" }, clock);

    const verdict =
      controlAdmit.admitted === variantAdmit.admitted &&
      seq(control, controlLive) === seq(variant, variantLive)
        ? "NO DEFECT"
        : "DEFECT PROVEN";
    expect(verdict).toBe("NO DEFECT");
    expect(seq(control, controlLive)).toBe(1);
    expect(seq(variant, variantLive)).toBe(1);
  });

  it("bounded: a shadow Thought enqueued AFTER the live Expression does not preempt it", () => {
    const clock = createFakeClock(Date.parse("2026-02-01T00:00:00.000Z"));
    const db = tempDb();
    const live = enqueueLiveExpression(db, clock, clock.nowMs() - 5_000);
    enqueueShadowThought(db, clock, clock.nowMs());
    expect(selectNextEligibleRequestId(db, clock)).toBe(live);
    expect(tryAdmitRequest(db, live, clock)).toEqual({
      admitted: true,
      dispatchSequence: 1,
    });
  });

  it("real runAttentiveDispatch A/B: shadow Thought shifts the live dispatch_sequence 1 -> 2", async () => {
    const runLive = (db: DatabaseSync, clock: AttentionClock) =>
      runAttentiveDispatch<{ text: string }>(db, {
        messages: [{ role: "user", content: "live expression turn" }],
        purpose: "expression",
        lane: "interactive",
        providerId: EXPRESSION_ROUTE.provider,
        quotaBucket: MISTRAL_BUCKET,
        routeAlias: "ashley_expression",
        modelAlias: EXPRESSION_ROUTE.configuredModelId,
        maxTokens: 64,
        dispatch: async () => ({
          providerModel: "mistral-medium-2026-01",
          usage: { promptTokens: 20, completionTokens: 10 },
          result: { text: "ok" },
        }),
      }, clock);

    const control = tempDb();
    const controlClock = createFakeClock(Date.parse("2026-02-01T00:00:00.000Z"));
    const controlResult = await runLive(control, controlClock);
    expect(seq(control, controlResult.requestId)).toBe(1);
    expect(getRequest(control, controlResult.requestId)?.outcome).toBe("completed");

    const variant = tempDb();
    const variantClock = createFakeClock(Date.parse("2026-02-01T00:00:00.000Z"));
    const shadow = enqueueShadowThought(
      variant,
      variantClock,
      variantClock.nowMs() - 5_000,
    );
    const pending = runLive(variant, variantClock);
    const variantLive = Number(
      (
        variant
          .prepare(
            `SELECT id FROM attention_requests WHERE purpose = 'expression' ORDER BY id DESC LIMIT 1`,
          )
          .get() as { id: number }
      ).id,
    );
    expect(state(variant, variantLive)).toBe("running");
    expect(selectNextEligibleRequestId(variant)).toBe(shadow);

    const variantResult = await pending;

    expect(tryAdmitRequest(variant, shadow, variantClock)).toEqual({
      admitted: true,
      dispatchSequence: 2,
    });
    markRunning(variant, shadow, variantClock);
    completeRequest(variant, shadow, {
      outcome: "completed",
      resolvedModelId: "gpt-oss-120b-2026-01",
      actualInput: 40,
      actualOutput: 20,
    }, variantClock);

    expect(variantResult.requestId).toBe(variantLive);
    expect(seq(variant, variantLive)).toBe(1);
    expect(getRequest(variant, variantLive)?.outcome).toBe("completed");
  });
});

describe("wave4 Track M4 — quota bucket isolation (NO DEFECT)", () => {
  beforeEach(() => {
    env.groqApiKey = "wave4-fake-groq";
    env.mistralApiKey = "wave4-fake-mistral";
  });
  afterEach(() => {
    env.groqApiKey = SAVED.groq;
    env.mistralApiKey = SAVED.mistral;
    closeTempDbs();
  });

  it("groq-thought and mistral-expression resolve to different quota buckets", () => {
    expect(GROQ_THOUGHT_BUCKET).toBe("groq:openai/gpt-oss-120b");
    expect(MISTRAL_BUCKET).toBe("mistral:mistral-medium-latest");
    expect(GROQ_THOUGHT_BUCKET).not.toBe(MISTRAL_BUCKET);
    expect(THOUGHT_ROUTE.provider).not.toBe(EXPRESSION_ROUTE.provider);
  });

  it("saturating the groq-thought TPM window leaves the mistral-expression bucket dispatchable now", () => {
    const clock = createFakeClock(Date.parse("2026-02-01T00:00:00.000Z"));
    const db = tempDb();
    const thoughtTpm = quotaContractFor(GROQ_THOUGHT_BUCKET).tpm;

    const hog = insertQueuedRequest(
      db,
      {
        lane: "interactive",
        purpose: "thought",
        modelAlias: THOUGHT_ROUTE.configuredModelId,
        providerId: THOUGHT_ROUTE.provider,
        quotaBucket: GROQ_THOUGHT_BUCKET,
        routeAlias: "thought",
        estimatedInputTokens: thoughtTpm - 1,
        estimatedOutputTokens: 1,
      },
      clock,
    );
    expect(tryAdmitRequest(db, hog, clock).admitted).toBe(true);

    expect(
      earliestLegalDispatchMs(db, 100, clock, GROQ_THOUGHT_BUCKET),
    ).toBeGreaterThan(clock.nowMs());
    expect(earliestLegalDispatchMs(db, 100, clock, MISTRAL_BUCKET)).toBe(
      clock.nowMs(),
    );
  });
});

describe("wave4 Track M5 — continuity demotion coupling", () => {
  const alias = THOUGHT_ROUTE.configuredModelId;
  const releaseId = currentReleaseId();

  beforeEach(() => {
    env.groqApiKey = "wave4-fake-groq";
    env.mistralApiKey = "wave4-fake-mistral";
  });
  afterEach(() => {
    env.groqApiKey = SAVED.groq;
    env.mistralApiKey = SAVED.mistral;
    closeTempDbs();
  });

  const dispatchThought = (
    db: DatabaseSync,
    providerModel: string,
    clock: AttentionClock,
  ) =>
    runAttentiveDispatch<{ text: string }>(
      db,
      {
        messages: [{ role: "user", content: "shadow thought" }],
        purpose: "thought",
        lane: "interactive",
        providerId: THOUGHT_ROUTE.provider,
        quotaBucket: GROQ_THOUGHT_BUCKET,
        routeAlias: "thought",
        modelAlias: alias,
        maxTokens: 64,
        dispatch: async () => ({
          providerModel,
          usage: { promptTokens: 20, completionTokens: 10 },
          result: { text: "{}" },
        }),
      },
      clock,
    );

  const releaseRows = (db: DatabaseSync) =>
    db
      .prepare(
        `SELECT capability, state, updated_at, promoted_at FROM capability_releases
         WHERE release_id = ? ORDER BY capability ASC`,
      )
      .all(releaseId);

  const capabilityState = (db: DatabaseSync, capability: string) =>
    String(
      (
        db
          .prepare(
            `SELECT state FROM capability_releases WHERE capability = ? AND release_id = ?`,
          )
          .get(capability, releaseId) as { state: string }
      ).state,
    );

  it("pre-promotion: a shadow-driven resolved_change demotes nothing", async () => {
    const clock = createFakeClock(Date.parse("2026-02-01T00:00:00.000Z"));
    const db = tempDb();
    for (const capability of MODEL_SENSITIVE_SET_FOR_CONTRACT) {
      capabilityCanExecuteShadow(db, capability as CapabilityName);
    }
    const before = releaseRows(db);
    expect(before.length).toBeGreaterThanOrEqual(
      MODEL_SENSITIVE_SET_FOR_CONTRACT.length,
    );
    expect(
      before.every((row) => (row as { state: string }).state === "observe"),
    ).toBe(true);

    await dispatchThought(db, "gpt-oss-120b-2026-01", clock);
    expect(currentModelEpoch(db, alias)).toBe(1);

    clock.advance(1_000);
    await dispatchThought(db, "gpt-oss-120b-2026-02", clock);
    expect(currentModelEpoch(db, alias)).toBe(2);

    const events = db
      .prepare(
        `SELECT kind, action FROM model_continuity_events WHERE alias = ? AND kind = 'resolved_change'`,
      )
      .all(alias) as Array<{ kind: string; action: string }>;
    expect(events.length).toBe(1);
    expect(events[0]!.action).toBe("demote_model_sensitive_to_observe");

    expect(releaseRows(db)).toEqual(before);
    expect(
      Number(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS c FROM capability_releases WHERE state != 'observe'`,
            )
            .get() as { c: number }
        ).c,
      ),
    ).toBe(0);
  });

  it("architectural fact: once promoted, one alias change demotes every model-sensitive capability", async () => {
    const clock = createFakeClock(Date.parse("2026-02-01T00:00:00.000Z"));
    const db = tempDb();
    for (const capability of [
      ...MODEL_SENSITIVE_SET_FOR_CONTRACT,
      "recall",
    ] as CapabilityName[]) {
      capabilityCanExecuteShadow(db, capability);
    }
    await dispatchThought(db, "gpt-oss-120b-2026-01", clock);

    for (const capability of ["thought", "reading", "recall"]) {
      db.prepare(
        `UPDATE capability_releases SET state = 'active' WHERE capability = ? AND release_id = ?`,
      ).run(capability, releaseId);
    }

    clock.advance(1_000);
    await dispatchThought(db, "gpt-oss-120b-2026-02", clock);

    expect(capabilityState(db, "thought")).toBe("observe");
    expect(capabilityState(db, "reading")).toBe("observe");
    expect(capabilityState(db, "recall")).toBe("active");
  });
});

describe("wave4 Track M6 — attentionDb default-path guard (documentation)", () => {
  it("completeChat must not acquire or synthesize a data plane", () => {
    const source = readSource("../../mistral-client.ts");
    expect(source).not.toContain("openNuclearDb");
    expect(source).not.toContain(":memory:");
  });

  it("live expression and Thought bind the caller-owned attentionDb", () => {
    expect(readSource("../runtime.ts")).toContain("attentionDb: this.db,");
    expect(readSource("../conversation/expression.ts")).toContain("attentionDb,");
    expect(readSource("../agency/thought.ts")).toContain("attentionDb: db");
  });

  it("guard: the Track M harness only stays offline because completeChat is mocked", () => {
    expect(vi.isMockFunction(completeChat)).toBe(true);
  });
});
