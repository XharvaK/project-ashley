import { vi } from "vitest";
import { dispatchCalls } from "./attention-dispatch-calls.js";
import { withOfflineAppGateDisabled } from "./offline-test-helpers.js";

// Mock the attention dispatcher (re-exported via core/attention/index.js) so we
// can assert which route alias is dispatched WITHOUT any network.
vi.mock("../attention/index.js", () => ({
  runAttentiveDispatch: vi.fn(async (_db: unknown, input: {
    routeAlias: string | null;
    purpose: string;
    lane: string;
    providerId: string;
  }) => {
    dispatchCalls.push({
      routeAlias: input.routeAlias,
      purpose: input.purpose,
      lane: input.lane,
      providerId: input.providerId,
    });
    return {
      result: { text: "x", providerModel: "x" },
      modelAlias: input.routeAlias ?? "unknown",
      resolvedModelId: "x",
      requestId: 1,
      acceptedDispatchIdentity: {
        requestId: 1,
        dispatchSequence: 1,
        routeAlias: input.routeAlias ?? null,
        modelAlias: input.routeAlias ?? "unknown",
        resolvedModelId: "x",
        modelEpoch: 0,
        modelIdentity: "test-model-identity",
        contractId: "phase5-test-contract",
        buildIdentity: "phase5-test-build",
        ownerId: null,
        cognitiveJobId: null,
      },
    };
  }),
}));

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeChat } from "../../mistral-client.js";
import { openNuclearDb } from "../db.js";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";

const SAVED = { groq: env.groqApiKey, mistral: env.mistralApiKey };

/**
 * Track M — route-precedence proof (owner correction #2).
 *
 * The attention router (model-routing/router.ts) gives an EXPLICIT routeId
 * precedence over the purpose-derived route. The proposed M-FIX changes
 * purpose="thought_observation" / lane="exchange_cognition" but KEEPS the
 * explicit route="thought". This test proves that with route="thought" present,
 * the dispatcher is told routeAlias="thought" (NOT "utility_bulk"), so Wave 3's
 * production-equivalent 120B Thought model is preserved.
 *
 * Note: `resolveRoute` has NO `thought_observation` entry, so a purpose-only
 * call throws rather than silently rerouting to utility_bulk — confirming the
 * "router silently overrides explicit route" trap cannot occur via completeChat.
 */
describe("wave4 Track M — route precedence for thought_observation", () => {
  let dbPath: string;
  let db: ReturnType<typeof openNuclearDb>;

  beforeEach(() => {
    env.groqApiKey = "wave4-fake-groq";
    env.mistralApiKey = "wave4-fake-mistral";
    dbPath = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    db = openNuclearDb(new DatabaseSync(dbPath));
    dispatchCalls.length = 0;
  });
  afterEach(() => {
    env.groqApiKey = SAVED.groq;
    env.mistralApiKey = SAVED.mistral;
    try {
      db.close();
    } catch {
      /* noop */
    }
    rmSync(dbPath, { force: true });
  });

  it("explicit route='thought' wins over purpose='thought_observation' (M-FIX safe)", async () => {
    await withOfflineAppGateDisabled(() => completeChat([{ role: "user", content: "t" }], {
      route: "thought",
      purpose: "thought_observation",
      lane: "exchange_cognition",
      attentionDb: db,
    } as never));
    expect(dispatchCalls.length).toBe(1);
    expect(dispatchCalls[0]!.routeAlias).toBe("thought");
    expect(dispatchCalls[0]!.purpose).toBe("thought_observation");
    expect(dispatchCalls[0]!.lane).toBe("exchange_cognition");
  });

  it("control: purpose='thought' with route='thought' -> thought (current Wave 3 behavior)", async () => {
    await withOfflineAppGateDisabled(() => completeChat([{ role: "user", content: "t" }], {
      route: "thought",
      purpose: "thought",
      lane: "interactive",
      attentionDb: db,
    } as never));
    expect(dispatchCalls[0]!.routeAlias).toBe("thought");
  });
});
