import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { env } from "./env.js";
import { createServer } from "./server.js";
import type { AgentManager } from "./agent.js";
import { AshleyCore } from "./core/runtime.js";
import { openNuclearDb } from "./core/db.js";
import {
  currentContractId,
  recordIsolatedEvaluation,
  recordLiveShadowEvent,
} from "./core/rollout/capabilities.js";
import { startDeterministicRecallEpoch } from "./core/rollout/recall-epoch-test-util.js";

const start = new Date("2026-07-01T00:00:00.000Z");
const OWNER = "doc";
const INTRUDER = "intruder";

function makeDb(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

function makeManager(db: DatabaseSync): AgentManager {
  const core = new AshleyCore(db);
  return {
    getState: () => "ready",
    getUptimeSec: () => 0,
    getProviderState: () => "unavailable",
    core: {
      promoteCapability: (input: { capability: string; authorizedBy: string }) =>
        core.promoteCapability(input),
      operatorRollbackCapability: (input: { capability: string; authorizedBy: string }) =>
        core.operatorRollbackCapability(input),
      recordCapabilityEvaluation: (input: {
        capability: string;
        seeds: number;
        passed: boolean;
        sourceKey: string;
      }) => core.recordCapabilityEvaluation(input),
    },
  } as unknown as AgentManager;
}

function qualify(
  db: DatabaseSync,
  capability: "reading" | "recall" | "mind_state" | "thought",
): void {
  if (capability === "recall") startDeterministicRecallEpoch(db);
  recordIsolatedEvaluation(db, capability, {
    seeds: 3,
    passed: true,
    sourceKey: `${capability}:eval`,
    occurredAt: start.toISOString(),
  });
  for (let index = 0; index < 25; index++) {
    const at = new Date(start.getTime() + index * (7 * 86_400_000 / 24));
    recordLiveShadowEvent(db, capability, `${capability}:${index}`, {
      occurredAt: at.toISOString(),
    });
  }
}

async function post(
  app: ReturnType<typeof createServer>,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    return { status: response.status, body: payload };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function withServer(
  db: DatabaseSync,
  fn: (app: ReturnType<typeof createServer>) => Promise<void>,
): Promise<void> {
  const originalDiscordOwnerId = env.discordOwnerId;
  const originalMemoryOwnerId = env.memoryOwnerId;
  const originalPersonaEvalMode = env.personaEvalMode;
  env.discordOwnerId = OWNER;
  env.memoryOwnerId = OWNER;
  try {
    const app = createServer(makeManager(db));
    await fn(app);
  } finally {
    env.discordOwnerId = originalDiscordOwnerId;
    env.memoryOwnerId = originalMemoryOwnerId;
    env.personaEvalMode = originalPersonaEvalMode;
  }
}

describe("POST /nuclear/capabilities/promote (operator endpoint)", () => {
  it("promotes an eligible live-shadow capability for the owner", async () => {
    const db = makeDb();
    try {
      qualify(db, "reading");
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "reading",
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: true, state: "active" });
      });
    } finally {
      db.close();
    }
  });

  it("returns not_eligible for an ineligible live-shadow capability", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "reading",
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: false, reason: "not_eligible" });
      });
    } finally {
      db.close();
    }
  });

  it("promotes an eligible explicit-cutover capability for the owner without live_shadow", async () => {
    const db = makeDb();
    try {
      qualify(db, "recall");
      qualify(db, "mind_state");
      qualify(db, "thought");
      await withServer(db, async (app) => {
        const recallPromote = await post(app, "/nuclear/capabilities/promote", { userId: OWNER, capability: "recall" });
        const mindPromote = await post(app, "/nuclear/capabilities/promote", { userId: OWNER, capability: "mind_state" });
        const thoughtPromote = await post(app, "/nuclear/capabilities/promote", { userId: OWNER, capability: "thought" });
        expect(recallPromote.body).toMatchObject({ ok: true, state: "active" });
        expect(mindPromote.body).toMatchObject({ ok: true, state: "active" });
        expect(thoughtPromote.body).toMatchObject({ ok: true, state: "active" });

        recordIsolatedEvaluation(db, "project_experimentation", {
          seeds: 3,
          passed: true,
          sourceKey: "endpoint:cutover-eval",
          occurredAt: start.toISOString(),
        });
        const res = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "project_experimentation",
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: true, state: "active" });
        const status = (res.body as { capabilities?: { capabilities?: Array<{ capability: string; state: string; liveShadowEvents: number }> } })
          .capabilities?.capabilities?.find((s) => s.capability === "project_experimentation");
        expect(status).toMatchObject({ state: "active", liveShadowEvents: 0 });
      });
    } finally {
      db.close();
    }
  });

  it("returns not_eligible for an ineligible explicit-cutover capability", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "project_experimentation",
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: false, reason: "not_eligible" });
      });
    } finally {
      db.close();
    }
  });

  it("denies a non-owner", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/promote", {
          userId: INTRUDER,
          capability: "reading",
        });
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "forbidden" });
      });
    } finally {
      db.close();
    }
  });

  it("errors on an unknown capability", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "no_such_capability",
        });
        expect(res.status).toBe(500);
        expect(res.body).toMatchObject({ code: "internal_error" });
      });
    } finally {
      db.close();
    }
  });

  it("is idempotent for an already-active capability and fails closed for rolled-back state", async () => {
    const db = makeDb();
    try {
      qualify(db, "reading");
      await withServer(db, async (app) => {
        const first = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "reading",
        });
        expect(first.body).toMatchObject({ ok: true, state: "active" });

        const again = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "reading",
        });
        expect(again.body).toMatchObject({ ok: true, alreadyActive: true, state: "active" });

        db.prepare(
          `UPDATE capability_releases SET state = 'rolled_back', rolled_back_at = ?, updated_at = ?
           WHERE capability = 'reading' AND release_id = ?`,
        ).run(new Date().toISOString(), new Date().toISOString(), currentContractId());

        const rolled = await post(app, "/nuclear/capabilities/promote", {
          userId: OWNER,
          capability: "reading",
        });
        expect(rolled.body).toMatchObject({ ok: false, reason: "rolled_back" });
      });
    } finally {
      db.close();
    }
  });
});

describe("POST /nuclear/capabilities/evaluation (qualification recording)", () => {
  it("records owner-attested qualification without activating the capability", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/evaluation", {
          userId: OWNER,
          capability: "project_experimentation",
          seeds: 3,
          passed: true,
          sourceKey: "endpoint:qualification-1",
        });
        expect(res.status).toBe(200);
        const status = (res.body as { capabilities?: Array<{ capability: string; state: string; evalSeedCount: number; qualifiedAt: string | null }> })
          .capabilities?.find((s) => s.capability === "project_experimentation");
        expect(status).toMatchObject({
          state: "observe",
          evalSeedCount: 3,
        });
        expect(typeof status?.qualifiedAt).toBe("string");
      });
    } finally {
      db.close();
    }
  });

  it("denies a non-owner", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/evaluation", {
          userId: INTRUDER,
          capability: "project_experimentation",
          seeds: 3,
          passed: true,
          sourceKey: "endpoint:qualification-nonowner",
        });
        expect(res.status).toBe(403);
      });
    } finally {
      db.close();
    }
  });

  it("rejects missing evidence fields", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/evaluation", {
          userId: OWNER,
          capability: "project_experimentation",
        });
        expect(res.status).toBe(400);
      });
    } finally {
      db.close();
    }
  });

  it("errors on a capability outside the rollout registry", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/evaluation", {
          userId: OWNER,
          capability: "no_such_capability",
          seeds: 3,
          passed: true,
          sourceKey: "endpoint:bad-capability",
        });
        expect(res.status).toBe(500);
      });
    } finally {
      db.close();
    }
  });

  it("is idempotent for a duplicate source key", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const first = await post(app, "/nuclear/capabilities/evaluation", {
          userId: OWNER,
          capability: "reading",
          seeds: 3,
          passed: true,
          sourceKey: "endpoint:dup",
        });
        const second = await post(app, "/nuclear/capabilities/evaluation", {
          userId: OWNER,
          capability: "reading",
          seeds: 3,
          passed: true,
          sourceKey: "endpoint:dup",
        });
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        const rows = db.prepare(
          `SELECT COUNT(*) AS c FROM capability_events
           WHERE capability = 'reading' AND kind = 'isolated_eval' AND source_key = 'endpoint:dup'`,
        ).get() as { c: number };
        expect(rows.c).toBe(1);
      });
    } finally {
      db.close();
    }
  });

  it("qualification never activates, never widens project authority, and never executes M3", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/evaluation", {
          userId: OWNER,
          capability: "project_experimentation",
          seeds: 3,
          passed: true,
          sourceKey: "endpoint:qualification-authority",
        });
        expect(res.status).toBe(200);
        const status = (res.body as { capabilities?: Array<{ capability: string; state: string }> })
          .capabilities?.find((s) => s.capability === "project_experimentation");
        expect(status?.state).toBe("observe");
        const row = db.prepare(
          `SELECT state FROM capability_releases WHERE capability = 'project_experimentation' AND release_id = ?`,
        ).get(currentContractId()) as { state: string };
        expect(row.state).toBe("observe");
      });
    } finally {
      db.close();
    }
  });
});

describe("POST /nuclear/capabilities/rollback (canonical rollback)", () => {
  it("rolls an active capability back through the canonical endpoint", async () => {
    const db = makeDb();
    try {
      qualify(db, "reading");
      await withServer(db, async (app) => {
        expect((await post(app, "/nuclear/capabilities/promote", { userId: OWNER, capability: "reading" })).body)
          .toMatchObject({ ok: true, state: "active" });
        const res = await post(app, "/nuclear/capabilities/rollback", {
          userId: OWNER,
          capability: "reading",
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, status: "rolled_back" });
        const audit = db.prepare(
          `SELECT COUNT(*) AS c FROM capability_events
           WHERE capability = 'reading' AND kind = 'operator_rollback'`,
        ).get() as { c: number };
        expect(audit.c).toBe(1);
      });
    } finally {
      db.close();
    }
  });

  it("denies a non-owner", async () => {
    const db = makeDb();
    try {
      await withServer(db, async (app) => {
        const res = await post(app, "/nuclear/capabilities/rollback", {
          userId: INTRUDER,
          capability: "reading",
        });
        expect(res.status).toBe(403);
      });
    } finally {
      db.close();
    }
  });
});
