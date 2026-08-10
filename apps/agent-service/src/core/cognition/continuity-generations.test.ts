import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { runAttentiveDispatch } from "../attention/governor.js";
import { currentContractId } from "../rollout/capabilities.js";
import { enqueueCognitiveJob } from "./jobs.js";
import {
  getOpenCognitiveItem,
  listOpenCognitiveItems,
  materializeOpenCognitiveItem,
  type OpenCognitiveItemProposal,
} from "./open-items.js";

async function acceptedDispatch(
  db: DatabaseSync,
  jobId: number,
  providerModel: string,
) {
  return runAttentiveDispatch<{ text: string }>(db, {
    messages: [{ role: "user", content: "bounded generation fixture" }],
    purpose: "maintenance",
    lane: "curiosity_maintenance",
    modelAlias: env.mistralModel,
    providerId: "groq",
    quotaBucket: "groq:continuity-generation-test",
    ownerId: "doc",
    cognitiveJobId: jobId,
    dispatch: async () => ({
      providerModel,
      usage: { promptTokens: 2, completionTokens: 2 },
      result: { text: "accepted" },
    }),
  });
}

function makeQuestion(db: DatabaseSync, entityUuid: string): { id: number; entityUuid: string } {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO questions
       (owner_id, subject, text, status, priority, created_at, updated_at,
        entity_uuid, data_classification)
     VALUES ('doc', 'about_self', 'Which generation remains current?', 'open', 0.8, ?, ?, ?, 'never_public')`,
  ).run(now, now, entityUuid);
  return { id: Number(result.lastInsertRowid), entityUuid };
}

function proposal(
  source: { id: number; entityUuid: string },
  dispatch: Awaited<ReturnType<typeof acceptedDispatch>>,
  semanticSummary = "Which generation remains current?",
): OpenCognitiveItemProposal {
  return {
    ownerId: "doc",
    kind: "question",
    semanticSummary,
    source: {
      type: "question",
      id: String(source.id),
      entityUuid: source.entityUuid,
    },
    origin: "cognition",
    provenance: "shadow",
    sourceCapability: "recall",
    contractId: dispatch.acceptedDispatchIdentity.contractId,
    buildIdentity: dispatch.acceptedDispatchIdentity.buildIdentity,
    modelEpoch: dispatch.acceptedDispatchIdentity.modelEpoch,
    modelIdentity: dispatch.acceptedDispatchIdentity.modelIdentity ?? "",
    dispatchIdentity: dispatch.acceptedDispatchIdentity,
  };
}

function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (existsSync(path)) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`continuity_generation_ready_timeout:${path}`));
      }
    }, 5);
  });
}

function startCompetingChild(
  dbPath: string,
  proposalPath: string,
  readyPath: string,
  gatePath: string,
  resultPath: string,
): { ready: Promise<void>; done: Promise<{ code: number | null; stderr: string }> } {
  const childPath = fileURLToPath(new URL("./continuity-generation-child.ts", import.meta.url));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", childPath, dbPath, proposalPath, readyPath, gatePath, resultPath],
    { cwd: dirname(dirname(dirname(childPath))), stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const done = new Promise<{ code: number | null; stderr: string }>((resolve) => {
    child.once("exit", (code) => resolve({ code, stderr }));
  });
  return { ready: waitForFile(readyPath), done };
}

describe("OCI continuity generations", () => {
  it("creates one current successor for A/E1 -> B/E2 -> A/E3 and converges retries", async () => {
    const originalGroqKey = env.groqApiKey;
    env.groqApiKey = "test-key";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const jobId = enqueueCognitiveJob(db, {
      ownerId: "doc",
      kind: "consolidate_thread",
      sourceKey: "continuity-generation-test",
    });
    const source = makeQuestion(db, "continuity-question");
    try {
      const aE1 = await acceptedDispatch(db, jobId, "model-a");
      const first = materializeOpenCognitiveItem(db, proposal(source, aE1));
      const bE2 = await acceptedDispatch(db, jobId, "model-b");
      const second = materializeOpenCognitiveItem(db, proposal(source, bE2));
      const aE3 = await acceptedDispatch(db, jobId, "model-a");
      const third = materializeOpenCognitiveItem(db, proposal(source, aE3));
      const retry = materializeOpenCognitiveItem(db, proposal(source, aE3));

      expect(first.created).toBe(true);
      expect(second.created).toBe(true);
      expect(third.created).toBe(true);
      expect(retry.created).toBe(false);
      expect(third.item.entityUuid).not.toBe(first.item.entityUuid);
      expect(third.item.entityUuid).not.toBe(second.item.entityUuid);
      expect(
        listOpenCognitiveItems(db, "doc", { status: "OPEN" }),
      ).toEqual([expect.objectContaining({ id: third.item.id })]);
      expect(getOpenCognitiveItem(db, "doc", first.item.entityUuid)).toMatchObject({
        status: "SUPERSEDED",
      });
      expect(getOpenCognitiveItem(db, "doc", second.item.entityUuid)).toMatchObject({
        status: "SUPERSEDED",
      });

      const oldRetry = materializeOpenCognitiveItem(db, proposal(source, aE1));
      expect(oldRetry.created).toBe(false);
      expect(getOpenCognitiveItem(db, "doc", first.item.entityUuid)).toMatchObject({
        status: "SUPERSEDED",
      });

      const distinct = materializeOpenCognitiveItem(
        db,
        proposal(source, aE3, "A different semantic conclusion"),
      );
      expect(distinct.created).toBe(true);
      expect(distinct.item.entityUuid).not.toBe(third.item.entityUuid);

      db.prepare("UPDATE questions SET updated_at = ? WHERE id = ?").run(
        "2026-08-10T00:01:00.000Z",
        source.id,
      );
      const revised = materializeOpenCognitiveItem(db, proposal(source, aE3));
      expect(revised.created).toBe(true);
      expect(revised.item.sourceRevision).toBe("2026-08-10T00:01:00.000Z");
      expect(getOpenCognitiveItem(db, "doc", third.item.entityUuid)).toMatchObject({
        status: "SUPERSEDED",
      });

      expect(() =>
        materializeOpenCognitiveItem(
          db,
          { ...proposal(source, aE3), ownerId: "other-owner" },
        ),
      ).toThrow("oci_dispatch_owner_mismatch");
    } finally {
      env.groqApiKey = originalGroqKey;
      db.close();
    }
  });

  it("creates a current successor when only the build generation changes", async () => {
    const originalGroqKey = env.groqApiKey;
    const originalBuild = env.ashleyReleaseId;
    env.groqApiKey = "test-key";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const jobId = enqueueCognitiveJob(db, {
      ownerId: "doc",
      kind: "consolidate_thread",
      sourceKey: "build-generation-test",
    });
    const source = makeQuestion(db, "build-question");
    try {
      env.ashleyReleaseId = "build-a";
      const buildA = await acceptedDispatch(db, jobId, "model-a");
      const old = materializeOpenCognitiveItem(db, proposal(source, buildA));
      env.ashleyReleaseId = "build-b";
      const buildB = await acceptedDispatch(db, jobId, "model-a");
      const current = materializeOpenCognitiveItem(db, proposal(source, buildB));

      expect(buildA.acceptedDispatchIdentity.contractId).toBe(currentContractId());
      expect(buildA.acceptedDispatchIdentity.buildIdentity).toBe("build-a");
      expect(buildB.acceptedDispatchIdentity.buildIdentity).toBe("build-b");
      expect(current.created).toBe(true);
      expect(current.item.entityUuid).not.toBe(old.item.entityUuid);
      expect(getOpenCognitiveItem(db, "doc", old.item.entityUuid)).toMatchObject({
        status: "SUPERSEDED",
      });
      expect(listOpenCognitiveItems(db, "doc", { status: "OPEN" })).toEqual([
        expect.objectContaining({ id: current.item.id }),
      ]);
    } finally {
      env.groqApiKey = originalGroqKey;
      env.ashleyReleaseId = originalBuild;
      db.close();
    }
  });

  it("converges true overlapping writers to one current successor", async () => {
    const originalGroqKey = env.groqApiKey;
    env.groqApiKey = "test-key";
    const directory = mkdtempSync(join(tmpdir(), "ashley-continuity-generation-"));
    const dbPath = join(directory, "nuclear.db");
    const proposalPath = join(directory, "proposal.json");
    const gatePath = join(directory, "gate");
    const sourceReady = makeQuestion;
    const db = openNuclearDb(new DatabaseSync(dbPath));
    const jobId = enqueueCognitiveJob(db, {
      ownerId: "doc",
      kind: "consolidate_thread",
      sourceKey: "true-concurrent-generation-test",
    });
    const source = sourceReady(db, "concurrent-question");
    try {
      const dispatch = await acceptedDispatch(db, jobId, "model-concurrent");
      writeFileSync(proposalPath, JSON.stringify(proposal(source, dispatch)), "utf8");
      db.close();

      const children = ["one", "two"].map((label) =>
        startCompetingChild(
          dbPath,
          proposalPath,
          join(directory, `${label}.ready`),
          gatePath,
          join(directory, `${label}.result`),
        ),
      );
      await Promise.all(children.map((child) => child.ready));
      writeFileSync(gatePath, "go", "utf8");
      const exits = await Promise.all(children.map((child) => child.done));
      expect(exits.every((exit) => exit.code === 0), exits.map((exit) => exit.stderr).join("; ")).toBe(true);
      const outcomes = ["one", "two"].map((label) =>
        JSON.parse(readFileSync(join(directory, `${label}.result`), "utf8")) as {
          ok: boolean;
          created?: boolean;
          error?: string;
        },
      );
      expect(outcomes).toEqual([
        expect.objectContaining({ ok: true }),
        expect.objectContaining({ ok: true }),
      ]);
      expect(outcomes.filter((outcome) => outcome.created)).toHaveLength(1);

      const check = openNuclearDb(new DatabaseSync(dbPath), { continuityOptional: true });
      expect(listOpenCognitiveItems(check, "doc", { status: "OPEN" })).toHaveLength(1);
      expect(
        check.prepare(
          `SELECT COUNT(*) AS count FROM open_cognitive_item_transitions
           WHERE owner_id = 'doc' AND to_status = 'OPEN'`,
        ).get(),
      ).toEqual({ count: 1 });
      check.close();
    } finally {
      env.groqApiKey = originalGroqKey;
      try {
        db.close();
      } catch {
        // The connection is already closed after the child handoff.
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
