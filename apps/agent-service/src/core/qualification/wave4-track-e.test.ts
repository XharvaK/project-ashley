import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture } from "./counterfactual-harness.js";
import { resolveEvidenceRefs } from "../agency/resolve-evidence.js";
import { createEpisode } from "../memory/episodes.js";

/**
 * Track E (correction #5 — APPROVED defense-in-depth hardening).
 * `resolveEvidenceRefs` `case "episode"` now requires `provenance = 'live'`.
 * Regression: a manually-supplied episode evidence ref pointing at a SHADOW
 * episode must NOT be materialized, while a LIVE episode with the same id shape
 * IS. This makes the Wave 2 invariant ("behavioral materializers reject shadow
 * provenance") locally true, independent of reachability.
 */
describe("wave4 Track E — episode evidence rejects shadow provenance", () => {
  let f: Fixture;

  let threadId: string;
  beforeEach(async () => {
    installFakeClock();
    f = new Fixture(false);
    // one easy turn establishes the owner + thread + messages
    const r = await f.turn("hello");
    threadId = r.threadId;
  });
  afterEach(() => {
    uninstallFakeClock();
    f.close();
  });

  it("shadow episode ref is dropped; live episode ref materializes", async () => {
    // Second turn yields a distinct thread + messages (3,4) so the LIVE
    // episode has a unique dedup key and valid FK message ids.
    const second = await f.turn("world");
    const shadow = createEpisode(f.db, {
      ownerId: "doc",
      threadId,
      summary: "shadow summary",
      entities: ["x"],
      messageIds: [1, 2],
      salience: 0.5,
      unresolved: false,
      provenance: "shadow",
    }) as { id: number };
    const live = createEpisode(f.db, {
      ownerId: "doc",
      threadId: second.threadId,
      summary: "live summary",
      entities: ["x"],
      messageIds: [3, 4],
      salience: 0.5,
      unresolved: false,
      provenance: "live",
    }) as { id: number };

    const lines = resolveEvidenceRefs(f.db, "doc", [
      { type: "episode", id: String(shadow.id) },
      { type: "episode", id: String(live.id) },
    ]);
    const labels = lines.map((l) => l.label);
    expect(labels).not.toContain(`episode:${shadow.id}`);
    expect(labels).toContain(`episode:${live.id}`);
  });
});
