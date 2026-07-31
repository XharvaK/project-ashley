import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../memory/db.js";
import { env } from "../env.js";
import {
  ageOutOpenThreads,
  closeMismatchedOpenThreads,
  closeThreadsTouchedBy,
  listOpenThreads,
  noteOpenThreads,
  noteUnansweredQuestion,
  openThread,
} from "./open-threads.js";
import {
  collectCandidates,
  decayedScore,
  pickCandidate,
} from "./queue.js";
import { burstGate, initiativeGate, unansweredCount } from "./schedule.js";
import { countInitiativesLocalToday } from "./cooldown.js";
import {
  clearSleepSuppress,
  inSleepSuppress,
  isSignOff,
  noteSleepSignOff,
  noteUserSleepState,
} from "./sleep.js";
import { validateInitiativeDraft } from "./validate-draft.js";
import { resolveDocLanguage } from "./language.js";
import {
  insertItem,
  insertTake,
  logProvenance,
  upsertSource,
} from "../curiosity/store.js";

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

  it("does not open soft check-ins like Same old. You?", () => {
    noteUnansweredQuestion(db, OWNER, "Same old. You?", "hey!");
    expect(listOpenThreads(db, OWNER)).toHaveLength(0);
  });

  it("does not open How are you? after a short reply", () => {
    noteUnansweredQuestion(db, OWNER, "How are you?", "ok");
    expect(listOpenThreads(db, OWNER)).toHaveLength(0);
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

  it("ages out stale he_never_answered after 6 hours", () => {
    openThread(db, OWNER, {
      kind: "he_never_answered",
      topic: "did the migration finish",
      detail: "did the migration finish?",
    });
    ageOpenThreads(7);
    expect(ageOutOpenThreads(db, OWNER)).toBe(1);
    expect(listOpenThreads(db, OWNER)).toHaveLength(0);
  });

  it("closes Turkish unanswered threads on an English pivot", () => {
    openThread(db, OWNER, {
      kind: "he_never_answered",
      topic: "ne oynuyordun",
      detail: "Ne oynuyordun?",
    });
    expect(closeMismatchedOpenThreads(db, OWNER, "hey!")).toBe(1);
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

  it("never invents an ambient kind", () => {
    const kinds = collectCandidates(db, OWNER, {
      idleHours: env.proactiveCheckInIdleHours + 1,
    }).map((c) => c.kind);
    expect(kinds).not.toContain("ambient");
  });

  it("skips check-in presence while unanswered", () => {
    userMessage("hey", 60 * 48);
    logInitiative(30);
    expect(
      collectCandidates(db, OWNER, {
        idleHours: env.proactiveCheckInIdleHours + 1,
      }).some((c) => c.kind === "check_in"),
    ).toBe(false);
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

  it("drops aged-out open threads from candidates", () => {
    openThread(db, OWNER, {
      kind: "he_never_answered",
      topic: "same old soft",
      detail: "did the migration finish?",
    });
    ageOpenThreads(7);
    expect(pickCandidate(db, OWNER, { idleHours: 5 })).toBeNull();
  });
});

describe("sleep sign-off", () => {
  it("matches I'm about to sleep", () => {
    expect(isSignOff("I'm about to sleep…")).toBe(true);
    expect(isSignOff("still awake or sleep again?")).toBe(false);
  });

  it("suppresses for 6 hours and clears on awake chat", () => {
    noteSleepSignOff(db, OWNER);
    expect(inSleepSuppress(db, OWNER)).toBe(true);
    noteUserSleepState(db, OWNER, "morning — back");
    expect(inSleepSuppress(db, OWNER)).toBe(false);
  });

  it("blocks the gate while sleep suppress is active", () => {
    userMessage("hey", 60 * 6);
    noteSleepSignOff(db, OWNER);
    expect(
      initiativeGate(
        db,
        OWNER,
        { busy: false, enabled: true },
        new Date("2026-07-31T12:00:00.000Z"),
      ).reason,
    ).toBe("own_time");
    clearSleepSuppress(db, OWNER);
  });
});

describe("draft validation", () => {
  it("requires title tokens on curiosity drafts", () => {
    const result = validateInitiativeDraft(
      "That 80 hours saved framing is a red flag.",
      {
        kind: "curiosity_take",
        angle: "opinion",
        materialKey: "orphan:take:1",
        material:
          "Piece: How I Work With My Assistant To Save 80 Hours Per Month\nTake: spreadsheet theater\nDepth: full",
        strength: 68,
        ageHours: 0,
        score: 40,
        lane: "C",
        title: "How I Work With My Assistant To Save 80 Hours Per Month",
      },
      { unanswered: 0 },
    );
    // "hours" may still pass; require a draft with zero title tokens
    expect(
      validateInitiativeDraft(
        "Spreadsheet theater, honestly.",
        {
          kind: "curiosity_take",
          angle: "opinion",
          materialKey: "orphan:take:1",
          material:
            "Piece: Website Factory pipeline notes\nTake: nice deploy path\nDepth: excerpt",
          strength: 68,
          ageHours: 0,
          score: 40,
          lane: "B",
          title: "Website Factory pipeline notes",
        },
        { unanswered: 0 },
      ).ok,
    ).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("packs Depth and keeps excerpt-only takes out of orphan lane C", () => {
    upsertSource(db, {
      slug: "feed-x",
      title: "Feed X",
      kind: "rss",
      url: "https://example.com/feed",
      interest: "culture",
    });
    const itemId = insertItem(db, {
      sourceId: 1,
      url: "https://example.com/magician-assistant",
      title: "Secrets of a Magician Assistant",
      excerpt: "short blurb about stagecraft",
      interest: "culture",
      publishedAt: null,
      score: 1,
    });
    expect(itemId).not.toBeNull();
    insertTake(db, {
      itemId: itemId!,
      interest: "culture",
      take: "Joanie Spina was wasted as just an assistant",
    });

    const excerptOnly = collectCandidates(db, OWNER, { idleHours: 5 }).filter(
      (c) => c.kind === "curiosity_take",
    );
    expect(excerptOnly).toEqual([]);

    logProvenance(db, "read", "full article", itemId);
    const withRead = collectCandidates(db, OWNER, { idleHours: 5 }).filter(
      (c) => c.kind === "curiosity_take",
    );
    expect(withRead).toHaveLength(1);
    expect(withRead[0]?.lane).toBe("C");
    expect(withRead[0]?.material).toMatch(/Depth:\s*full/i);
    expect(withRead[0]?.materialKey).toMatch(/^orphan:take:/);
  });

  it("rejects check_in questions", () => {
    expect(
      validateInitiativeDraft(
        "You around?",
        {
          kind: "check_in",
          angle: "check_in",
          materialKey: "checkin:x",
          material: "Quiet ~20h.",
          strength: 38,
          ageHours: 0,
          score: 38,
        },
        { unanswered: 0 },
      ),
    ).toEqual({ ok: false, reason: "idle_pad_question" });
  });
});

describe("language helper", () => {
  it("prefers English when unclear", () => {
    expect(resolveDocLanguage(["hey", "ok"])).toBe("en");
    expect(resolveDocLanguage(["naber kanka ne yapıyorsun"])).toBe("tr");
  });
});

describe("gates", () => {
  const options = { busy: false, enabled: true };
  // Afternoon Istanbul — outside fail-closed quiet defaults (23:30–07:30).
  const day = new Date("2026-07-31T12:00:00.000Z");

  it("blocks while he is mid conversation", () => {
    userMessage("hey", 1);
    expect(initiativeGate(db, OWNER, options, day).reason).toBe(
      "user_active_recently",
    );
  });

  it("lets a nudge through inside a live session", () => {
    userMessage("hey", 30);
    expect(
      initiativeGate(db, OWNER, { ...options, nudge: true }, day).allowed,
    ).toBe(true);
  });

  it("refuses a nudge once the session is stale", () => {
    userMessage("hey", 60 * 10);
    expect(
      initiativeGate(db, OWNER, { ...options, nudge: true }, day).reason,
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

  it("holds a gap between bubbles when engaged", () => {
    logInitiative(5);
    userMessage("hey", 1); // he replied — unanswered clears
    expect(unansweredCount(db, OWNER)).toBe(0);
    expect(burstGate(db, OWNER).reason).toBe("burst_gap");
  });

  it("uses burstMax 1 while ignored", () => {
    userMessage("hey", 60 * 6);
    logInitiative(5);
    expect(unansweredCount(db, OWNER)).toBe(1);
    expect(burstGate(db, OWNER).reason).toBe("burst_spent");
  });

  it("backs off 6h after three unanswered proactive DMs", () => {
    userMessage("hey", 60 * 48);
    for (let i = 0; i < env.proactiveMaxUnanswered; i++) {
      logInitiative(60 * (i + 1));
    }
    expect(unansweredCount(db, OWNER)).toBe(env.proactiveMaxUnanswered);
    expect(env.proactiveMaxUnanswered).toBe(3);
    expect(initiativeGate(db, OWNER, options, day).reason).toBe(
      "nudge_cap_backoff",
    );
  });

  it("does not use clock quiet hours anymore", () => {
    userMessage("hey", 60 * 6);
    const night = new Date("2026-07-31T22:00:00.000Z"); // 01:00 Istanbul
    expect(initiativeGate(db, OWNER, options, night).reason).not.toBe(
      "quiet_hours",
    );
  });
});
