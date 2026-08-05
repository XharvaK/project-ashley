import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import {
  completeChat,
  adapterFor,
} from "../../mistral-client.js";
import {
  resolveRoute,
  requireRouteEnabled,
  disabledRouteError,
} from "./router.js";
import { quotaBucketFor } from "./types.js";
import { runAttentiveDispatch } from "../attention/governor.js";
import type { EstimateMessage } from "../attention/estimate.js";
import type { ProviderId } from "./types.js";
import { AppError } from "../../errors.js";

const ORIGINAL_MISTRAL_KEY = env.mistralApiKey;
const ORIGINAL_GROQ_KEY = env.groqApiKey;

afterEach(() => {
  env.mistralApiKey = ORIGINAL_MISTRAL_KEY;
  env.groqApiKey = ORIGINAL_GROQ_KEY;
});

function freshDb(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

function rowCount(db: DatabaseSync, table: string): number {
  return Number(
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c,
  );
}

describe("route-to-provider mapping", () => {
  it("expression routes to the Mistral primary", () => {
    const b = resolveRoute("expression");
    expect(b.route).toBe("ashley_expression");
    expect(b.provider).toBe("mistral");
    expect(b.configuredModelId).toBe("mistral-medium-latest");
  });

  it("thought routes to Groq 120B", () => {
    const b = resolveRoute("thought");
    expect(b.route).toBe("thought");
    expect(b.provider).toBe("groq");
    expect(b.configuredModelId).toBe("openai/gpt-oss-120b");
  });

  it.each([
    "exchange_cognition",
    "curiosity_consolidation",
    "thought_observation",
    "maintenance",
  ])("utility purpose %s routes to Groq 20B", (purpose) => {
    const b = resolveRoute(purpose);
    expect(b.route).toBe("utility_bulk");
    expect(b.provider).toBe("groq");
    expect(b.configuredModelId).toBe("openai/gpt-oss-20b");
  });

  it("all four utility purposes share one 20B quota bucket", () => {
    const buckets = [
      "exchange_cognition",
      "curiosity_consolidation",
      "thought_observation",
      "maintenance",
    ].map((p) => quotaBucketFor(resolveRoute(p).provider, "openai/gpt-oss-20b"));
    expect(new Set(buckets)).toEqual(new Set(["groq:openai/gpt-oss-20b"]));
    expect(quotaBucketFor("groq", "openai/gpt-oss-120b")).toBe(
      "groq:openai/gpt-oss-120b",
    );
  });
});

describe("disabled routes fail closed", () => {
  const disabled: readonly string[] = [
    "sandbox_operator_light",
    "sandbox_operator_deep",
    "sandbox_reviewer",
    "experimental_auditor",
    "experimental_multimodal",
  ];

  it.each(disabled)("requireRouteEnabled rejects %s without dispatching", (route) => {
    const db = freshDb();
    let thrown: unknown;
    try {
      requireRouteEnabled(route as never);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("operator_disabled");
    expect(rowCount(db, "attention_requests")).toBe(0);
    db.close();
  });

  it.each(disabled)(
    "completeChat rejects %s before provider dispatch or reservation",
    async (route) => {
      const db = freshDb();
      // Mistral key present so any accidental mistral dispatch is not the reason
      // the call is rejected; the route itself must be the gate.
      env.mistralApiKey = "present";
      env.groqApiKey = "present";
      await expect(
        completeChat([], { route: route as never, attentionDb: db }),
      ).rejects.toMatchObject({ code: "operator_disabled" });
      expect(rowCount(db, "attention_requests")).toBe(0);
      db.close();
    },
  );

  it("adapterFor fails closed for unimplemented providers (NIM)", () => {
    expect(() => adapterFor("nim" as ProviderId)).toThrow(
      "unsupported_provider:nim",
    );
  });

  it("disabled route error is typed operator_disabled", () => {
    expect(disabledRouteError("sandbox_reviewer").code).toBe("operator_disabled");
    expect(disabledRouteError("sandbox_reviewer").httpStatus).toBe(503);
  });
});

describe("unknown routes fail closed", () => {
  it("requireRouteEnabled rejects an unknown route id", () => {
    expect(() => requireRouteEnabled("nope" as never)).toThrow();
  });

  it("completeChat rejects an unknown explicit route before dispatch", async () => {
    const db = freshDb();
    await expect(
      completeChat([], { route: "nope" as never, attentionDb: db }),
    ).rejects.toThrow();
    expect(rowCount(db, "attention_requests")).toBe(0);
    db.close();
  });
});

describe("provider-aware missing key gating", () => {
  it("Mistral route fails before reservation when MISTRAL_API_KEY is absent", async () => {
    env.mistralApiKey = "";
    env.groqApiKey = "present";
    const db = freshDb();
    await expect(
      completeChat(
        [{ role: "user", content: "hi" }],
        { route: "ashley_expression", attentionDb: db },
      ),
    ).rejects.toMatchObject({ code: "agent_not_ready" });
    expect(rowCount(db, "attention_requests")).toBe(0);
    db.close();
  });

  it("Groq route fails before reservation when GROQ_API_KEY is absent", async () => {
    env.mistralApiKey = "present";
    env.groqApiKey = "";
    const db = freshDb();
    await expect(
      completeChat(
        [{ role: "user", content: "hi" }],
        { route: "thought", attentionDb: db },
      ),
    ).rejects.toMatchObject({ code: "agent_not_ready" });
    expect(rowCount(db, "attention_requests")).toBe(0);
    db.close();
  });
});

describe("shared 20B quota bucket at the dispatch layer", () => {
  it("two utility purposes consume one shared bucket", async () => {
    env.mistralApiKey = "";
    env.groqApiKey = "present";
    const db = freshDb();

    const fake = vi.fn(
      async () => ({
        providerModel: "groq/openai/gpt-oss-20b",
        usage: { promptTokens: 1, completionTokens: 1 },
        result: { consumed: true },
      }),
    );

    async function dispatchOne(purpose: string): Promise<number> {
      const b = resolveRoute(purpose);
      const res = await runAttentiveDispatch<{ consumed: boolean }>(db, {
        messages: [] as EstimateMessage[],
        purpose: purpose as never,
        providerId: b.provider as ProviderId,
        quotaBucket: quotaBucketFor(b.provider, b.configuredModelId),
        modelAlias: b.configuredModelId,
        dispatch: fake,
      });
      return res.requestId;
    }

    const idA = await dispatchOne("exchange_cognition");
    const idB = await dispatchOne("maintenance");

    const rowA = db
      .prepare(`SELECT quota_bucket FROM attention_requests WHERE id = ?`)
      .get(idA) as { quota_bucket: string };
    const rowB = db
      .prepare(`SELECT quota_bucket FROM attention_requests WHERE id = ?`)
      .get(idB) as { quota_bucket: string };
    expect(rowA.quota_bucket).toBe("groq:openai/gpt-oss-20b");
    expect(rowB.quota_bucket).toBe("groq:openai/gpt-oss-20b");
    expect(rowA.quota_bucket).toBe(rowB.quota_bucket);
    expect(fake).toHaveBeenCalledTimes(2);
    db.close();
  });
});
