import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../memory/db.js";
import { env } from "../env.js";
import {
  closeThreadsTouchedBy,
  listOpenThreads,
  noteOpenThreads,
  noteUnansweredQuestion,
  openThread,
} from "./open-threads.js";
import { collectCandidates, decayedScore, pickCandidate } from "./queue.js";
import { burstGate, initiativeGate, unansweredCount } from "./schedule.js";
import { countInitiativesLocalToday } from "./cooldown.js";

const OWNER = "doc";
let db: DatabaseSync;

function seedThread(): void {
  db.prepare(
    `INSERT INTO mem_threads (id, owner_id, status, created_at, last_active_at)
     VALUES ('t1', ?, 'active', datetime('now'), datetime('now'))`,
  ).run(OWNER);
}

function userMessage(text: string, agoMinutes = 0): number {
  const result = db
    .prepare(
      `INSERT INTO mem_messages (thread_id, owner_id, role, text, channel, ts)
       VALUES ('t1', ?, 'user', ?, 'discord', datetime('now', ?))`,
    )
    .run(OWNER, text, `-${agoMinutes} minutes`);
  return Number(result.lastInsertRowid);
}

/** Open threads have to ripen before they may interrupt him. */
function ageOpenThreads(hours: number): void {
  db.prepare(
    `UPDATE mem_open_threads SET created_at = datetime('now', ?)`,
  ).run(`-${hours} hours`);
}

function logInitiative(agoMinutes: number, materialKey?: string): void {
  db.prepare(
    `INSERT INTO mem_initiative_log
       (owner_id, thread_id, angle, reason, message_text, sent_at, material_key)
     VALUES (?, 't1', 'question', 'test', 'msg', datetime('now', ?), ?)`,
  ).run(OWNER, `-${agoMinutes} minutes`, materialKey ?? null);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  migrate(db);
  seedThread();
});

afterEach(() => db.close());

describe("open threads", () => {
  it("records what she promised to come back to", () => {
    noteOpenThreads(db, OWNER, {
      role: "assistant",
      text: "i'll check the retry loop and get back to you",
      messageId: 1,
    });
    const open = listOpenThreads(db, OWNER);
    expect(open).toHaveLength(1);
    expect(open[0]?.kind).toBe("she_owes");
  });

  it("records a time anchor he set", () => {
    noteOpenThreads(db, OWNER, {
      role: "user",
      text: "deploying the mint box tomorrow morning",
      messageId: 2,
    });
    expect(listOpenThreads(db, OWNER)[0]?.kind).toBe("time_anchored");
  });

  it("ignores small talk", () => {
    noteOpenThreads(db, OWNER, {
      role: "user",
      text: "lol yeah",
      messageId: 3,
    });
    expect(listOpenThreads(db, OWNER)).toHaveLength(0);
  });

  it("treats her trailing question as unanswered only after a short reply", () => {
    noteUnansweredQuestion(db, OWNER, "did the migration actually finish?", "lol");
    expect(listOpenThreads(db, OWNER)[0]?.kind).toBe("he_never_answered");

    noteUnansweredQuestion(
      db,
      OWNER,
      "and the indexes?",
      "yeah it ran clean, took about four minutes, and the index build was easily the slowest part of it",
    );
    expect(listOpenThreads(db, OWNER)).toHaveLength(1);
  });

  it("closes a thread once he comes back to it", () => {
    openThread(db, OWNER, {
      kind: "she_owes",
      topic: "the retry loop in the queue",
      detail: "said i would look at the retry loop",
    });
    expect(closeThreadsTouchedBy(db, OWNER, "about that retry loop")).toBe(1);
    expect(listOpenThreads(db, OWNER)).toHaveLength(0);
  });
});

describe("candidate scoring", () => {
  it("decays with age and refuses unripe material", () => {
    expect(decayedScore("she_owes", 0)).toBe(0);
    const fresh = decayedScore("she_owes", 2);
    const old = decayedScore("she_owes", 60);
    expect(fresh).toBeGreaterThan(old);
  });

  it("ranks what she owes above what she happened to read", () => {
    expect(decayedScore("she_owes", 2)).toBeGreaterThan(
      decayedScore("curiosity_take", 2),
    );
  });

  it("returns nothing when there is no material, so silence is the default", () => {
    expect(collectCandidates(db, OWNER, { idleHours: 5 })).toEqual([]);
    expect(pickCandidate(db, OWNER, { idleHours: 5 })).toBeNull();
  });

  it("offers a check-in only after real silence", () => {
    expect(
      collectCandidates(db, OWNER, { idleHours: 3 }).some(
        (c) => c.kind === "check_in",
      ),
    ).toBe(false);
    expect(
      collectCandidates(db, OWNER, {
        idleHours: env.proactiveCheckInIdleHours + 1,
      }).some((c) => c.kind === "check_in"),
    ).toBe(true);
  });

  it("never offers the same material twice", () => {
    openThread(db, OWNER, {
      kind: "she_owes",
      topic: "sqlite migration",
      detail: "said i would check the migration",
    });
    ageOpenThreads(4);
    const first = pickCandidate(db, OWNER, { idleHours: 5 });
    expect(first).not.toBeNull();
    logInitiative(1, first!.materialKey);
    expect(pickCandidate(db, OWNER, { idleHours: 5 })).toBeNull();
  });
});

describe("gates", () => {
  const options = { busy: false, enabled: true };

  it("blocks while he is mid conversation", () => {
    userMessage("hey", 1);
    expect(initiativeGate(db, OWNER, options).reason).toBe(
      "user_active_recently",
    );
  });

  it("lets a nudge through inside a live session", () => {
    userMessage("hey", 30);
    expect(
      initiativeGate(db, OWNER, { ...options, nudge: true }).allowed,
    ).toBe(true);
  });

  it("refuses a nudge once the session is stale", () => {
    userMessage("hey", 60 * 10);
    expect(
      initiativeGate(db, OWNER, { ...options, nudge: true }).reason,
    ).toBe("no_live_session");
  });

  it("counts the day on Doc's clock", () => {
    logInitiative(5);
    expect(countInitiativesLocalToday(db, OWNER)).toBe(1);
  });

  it("keeps a burst short and then rests", () => {
    userMessage("hey", 60 * 6);
    logInitiative(5);
    logInitiative(20);
    logInitiative(40);
    expect(burstGate(db, OWNER).reason).toBe("burst_spent");
  });

  it("holds a gap between bubbles inside a burst", () => {
    userMessage("hey", 60 * 6);
    logInitiative(2);
    expect(burstGate(db, OWNER).reason).toBe("burst_gap");
  });

  it("stops talking into sustained silence", () => {
    userMessage("hey", 60 * 48);
    for (let i = 0; i < env.proactiveMaxUnanswered; i++) {
      logInitiative(60 * (i + 1));
    }
    expect(unansweredCount(db, OWNER)).toBe(env.proactiveMaxUnanswered);
    expect(initiativeGate(db, OWNER, options).reason).toBe(
      "talking_into_silence",
    );
  });
});
