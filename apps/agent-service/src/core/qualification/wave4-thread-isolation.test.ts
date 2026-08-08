import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent } from "./state-inventory.js";
import { thoughtCapture, clearCaptures } from "./mistral-client-mock-state.js";
import { archiveActiveThread } from "../memory/threads.js";

/**
 * Phase 3 — thread isolation for the SAME owner.
 *
 * `ReactiveChatInput.channel` is typed `"discord"` and `resolveActiveThread`
 * selects the owner's most recent ACTIVE thread regardless of channel, so a
 * second thread is produced the only way production does it: by archiving the
 * active thread. Both fixtures are archived at the same point in the script.
 *
 * Each thread gets its own hard-turn sentinel; the shadow Thought input
 * captured for thread B must not contain thread A's sentinel and vice versa.
 */

const OWNER = "doc";
const ALPHA = "ANCHOVYGRAM";
const BRAVO = "BASSOONWERK";

function activeThread(db: DatabaseSync): string {
  return (db
    .prepare(`SELECT id FROM mem_threads WHERE owner_id = ? AND status = 'active'`)
    .get(OWNER) as { id: string }).id;
}

function threadTexts(db: DatabaseSync, threadId: string): string {
  return (db
    .prepare(`SELECT text FROM mem_messages WHERE thread_id = ? ORDER BY id`)
    .all(threadId) as Array<{ text: string }>)
    .map((row) => row.text)
    .join("\n");
}

function captureText(index: number): string {
  return JSON.stringify(thoughtCapture[index]!.messages);
}

describe("wave4 Phase 3 — thread isolation (same owner, two threads)", () => {
  let on: Fixture;
  let off: Fixture;

  async function step(message: string): Promise<void> {
    await on.turn(message);
    await on.pump();
    await on.quiesce();
    await off.turn(message);
  }

  beforeEach(() => {
    installFakeClock();
    armGroqKey();
    on = new Fixture(true);
    off = new Fixture(false);
  });
  afterEach(() => {
    on.close();
    off.close();
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("no sentinel crosses threads in the shadow Thought input or the live tables", async () => {
    await step(`tell me about ${ALPHA} dub techno`);
    await step(`don't give me fake agreement just to be nice about ${ALPHA}`);
    const threadA = activeThread(on.db);
    const threadAOff = activeThread(off.db);
    const markA = thoughtCapture.length;
    expect(markA).toBeGreaterThan(0);

    expect(archiveActiveThread(on.db, OWNER)).toBe(threadA);
    expect(archiveActiveThread(off.db, OWNER)).toBe(threadAOff);

    await step(`tell me about ${BRAVO} dub techno`);
    await step(`don't give me fake agreement just to be nice about ${BRAVO}`);
    const threadB = activeThread(on.db);
    const threadBOff = activeThread(off.db);
    expect(threadB).not.toBe(threadA);
    expect(thoughtCapture.length).toBeGreaterThan(markA);

    for (let i = 0; i < markA; i += 1) {
      expect(captureText(i)).toContain(ALPHA);
      expect(captureText(i)).not.toContain(BRAVO);
    }
    for (let i = markA; i < thoughtCapture.length; i += 1) {
      expect(captureText(i)).toContain(BRAVO);
      expect(captureText(i)).not.toContain(ALPHA);
    }

    // Live rows are partitioned per thread in both fixtures.
    for (const [db, a, b] of [
      [on.db, threadA, threadB],
      [off.db, threadAOff, threadBOff],
    ] as Array<[DatabaseSync, string, string]>) {
      expect(threadTexts(db, a)).toContain(ALPHA);
      expect(threadTexts(db, a)).not.toContain(BRAVO);
      expect(threadTexts(db, b)).toContain(BRAVO);
      expect(threadTexts(db, b)).not.toContain(ALPHA);
      expect(
        db.prepare(`SELECT COUNT(*) AS c FROM mem_threads WHERE owner_id = ?`).get(OWNER),
      ).toMatchObject({ c: 2 });
      expect(
        db.prepare(`SELECT status FROM mem_threads WHERE id = ?`).get(a),
      ).toMatchObject({ status: "archived" });
      expect(
        db.prepare(`SELECT status FROM mem_threads WHERE id = ?`).get(b),
      ).toMatchObject({ status: "active" });
    }

    // Every shadow episode covers messages from exactly one thread.
    const episodes = on.db
      .prepare(
        `SELECT thread_id, source_start_message_id AS s, source_end_message_id AS e FROM episodes`,
      )
      .all() as Array<{ thread_id: string; s: number; e: number }>;
    expect(episodes.length).toBeGreaterThan(0);
    for (const episode of episodes) {
      expect(
        on.db
          .prepare(
            `SELECT COUNT(*) AS c FROM mem_messages
             WHERE id BETWEEN ? AND ? AND thread_id <> ?`,
          )
          .get(episode.s, episode.e, episode.thread_id),
      ).toMatchObject({ c: 0 });
    }

    expectLiveEquivalent(on.live(), off.live());
  });

  it("message/thread counts are consistent across the shadow boundary", async () => {
    await step(`tell me about ${ALPHA} dub techno`);
    archiveActiveThread(on.db, OWNER);
    archiveActiveThread(off.db, OWNER);
    await step(`tell me about ${BRAVO} dub techno`);

    const counts = (db: DatabaseSync) => ({
      threads: db.prepare(`SELECT COUNT(*) AS c FROM mem_threads`).get(),
      messages: db.prepare(`SELECT COUNT(*) AS c FROM mem_messages`).get(),
      perThread: db
        .prepare(`SELECT COUNT(*) AS c FROM mem_messages GROUP BY thread_id ORDER BY thread_id`)
        .all().length,
    });
    expect(counts(on.db)).toEqual(counts(off.db));
    expect(counts(on.db).threads).toMatchObject({ c: 2 });
    expectLiveEquivalent(on.live(), off.live());
  });
});
