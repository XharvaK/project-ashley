import { DatabaseSync } from "node:sqlite";
import { AshleyCore } from "../runtime.js";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import { createIsolatedDataPlane } from "../data-plane.js";
import { processNextCognitiveJob, type CognitionAnalysis } from "../cognition/worker.js";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { advanceTurn, nowMs } from "./fake-clock.js";
import { snapshotLive, snapshotClass, type Row } from "./state-inventory.js";
import { env } from "../../env.js";

// The shadow Thought observation is gated on env.mistralApiKey (thought-observation.ts:33).
// The Wave 4 plan forbids using that as the PRIMARY suppression (the unpumped
// executor is). So the harness sets a fake key so the shadow Thought genuinely
// fires in the ON fixture; the OFF fixture still never fires it because its
// worker never runs (no correlated shadow episode). Restored per-test.
const SAVED_GROQ = env.groqApiKey;
const SAVED_NIM = env.nimApiKey;
const SAVED_MISTRAL = env.mistralApiKey;
export function armGroqKey(): void {
  env.groqApiKey = "wave4-fake-groq-key";
  env.nimApiKey = "wave4-fake-nim-key";
  env.mistralApiKey = "wave4-fake-mistral-key";
}
export function restoreGroqKey(): void {
  env.groqApiKey = SAVED_GROQ;
  env.nimApiKey = SAVED_NIM;
  env.mistralApiKey = SAVED_MISTRAL;
}

export { expressionCapture, thoughtCapture, clearCaptures } from "./mistral-client-mock-state.js";

const SENTINEL = "WAVE4_SENTINEL";

/** Deterministic shadow analysis for the worker (injected, never model-generated). */
export function fakeAnalyze(_transcript: string): Promise<{ analysis: CognitionAnalysis; model: string; raw: string }> {
  const analysis: CognitionAnalysis = {
    summary: `${SENTINEL} summary`,
    entities: [SENTINEL],
    salience: 0.5,
    unresolved: false,
    stateItems: [
      { kind: "concern", text: `${SENTINEL} state item`, activation: 0.6, urgency: 0.7, dueAt: null },
    ],
    affect: {
      valenceDelta: 0.02,
      activationDelta: 0.02,
      opennessDelta: 0,
      tensionDelta: 0,
      reason: `${SENTINEL} affect`,
    },
    revisions: [],
    facts: [],
  };
  return Promise.resolve({ analysis, model: "fake", raw: JSON.stringify(analysis) });
}

export type TurnResult = {
  text: string;
  threadId: string;
  decisionId: number;
  userMessageId: number;
};

export class Fixture {
  readonly db: DatabaseSync;
  readonly continuity: DatabaseSync;
  readonly core: AshleyCore;
  readonly shadow: boolean;
  readonly dataDir: string;
  readonly dbPath: string;
  lastUserMessageId = 0;

  constructor(shadow: boolean) {
    this.shadow = shadow;
    this.dataDir = mkdtempSync(join(tmpdir(), "ashley-nuclear-"));
    const plane = createIsolatedDataPlane(this.dataDir);
    mkdirSync(plane.conversationsDir, { recursive: true });
    this.dbPath = plane.nuclearDbPath;
    this.continuity = openContinuityDb(new DatabaseSync(plane.continuityDbPath), {
      dataPlane: plane,
    });
    this.db = openNuclearDb(new DatabaseSync(this.dbPath), {
      continuity: this.continuity,
      dataPlane: plane,
    });
    this.core = new AshleyCore(this.db);
  }

  async turn(message: string, inboundId?: string): Promise<TurnResult> {
    advanceTurn();
    const id = inboundId ?? `local:turn-${randomUUID()}`;
    const result = await this.core.handleReactiveChat({
      message,
      ownerId: "doc",
      channel: "discord",
      inboundDiscordMessageIds: [id],
      simulateDelivery: true,
      finalFragmentReceivedAtMs: nowMs(),
    });
    const userMessageId = this.db
      .prepare(
        `SELECT id FROM mem_messages WHERE thread_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1`,
      )
      .get(result.threadId) as { id: number } | undefined;
    this.lastUserMessageId = userMessageId?.id ?? this.lastUserMessageId;
    return {
      text: result.text,
      threadId: result.threadId,
      decisionId: result.decisionId,
      userMessageId: this.lastUserMessageId,
    };
  }

  /** Drain the cognition executor (only meaningful when shadow === true). */
  async pump(): Promise<void> {
    // The cognition job is enqueued with available_at = now + idle window.
    // Advance the fake clock well past that window so claimNextJob can claim it,
    // without affecting DB message-id ordering (used for shadow correlation).
    advanceTurn(60 * 60 * 1000);
    let guard = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const more = await processNextCognitiveJob(this.db, env.cognitionMode, fakeAnalyze);
      if (!more) break;
      guard += 1;
      if (guard > 100) throw new Error("pump: too many cognition jobs (loop?)");
    }
  }

  /** Wait for any fire-and-forget shadow Thought observation to land. */
  async quiesce(): Promise<void> {
    for (let i = 0; i < 50; i += 1) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }

  /** Full live behavioral projection. */
  live(): Record<string, string[]> {
    return snapshotLive(this.db);
  }

  /** Rows of every table in a given non-live class. */
  classRows(cls: Parameters<typeof snapshotClass>[1]): Record<string, Row[]> {
    return snapshotClass(this.db, cls);
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* noop */
    }
    try {
      this.continuity.close();
    } catch {
      /* noop */
    }
    rmSync(this.dataDir, { recursive: true, force: true });
  }
}

export type Script = Array<{ message: string; inboundId?: string }>;

/**
 * Run the SAME script against two independent fixtures (shadow ON vs OFF) and
 * return both projections. The only difference is execution of shadow cognition.
 */
export async function runCounterfactual(script: Script): Promise<{
  on: Fixture;
  off: Fixture;
}> {
  armGroqKey();
  const on = new Fixture(true);
  const off = new Fixture(false);
  try {
    for (const step of script) {
      await on.turn(step.message, step.inboundId);
      if (on.shadow) {
        await on.pump();
        await on.quiesce();
      }
      await off.turn(step.message, step.inboundId);
      if (off.shadow) {
        await off.pump();
        await off.quiesce();
      }
    }
    return { on, off };
  } finally {
    // caller closes via returned fixtures
  }
}

export { SENTINEL };
