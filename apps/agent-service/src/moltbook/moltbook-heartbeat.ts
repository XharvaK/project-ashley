import type { DatabaseSync } from "node:sqlite";
import {
  getMoltbookCredentials,
  isMoltbookRateLimited,
  stampMoltbookRateLimit,
} from "./moltbook-registration.js";
import {
  getMoltbookFeed,
  upvoteMoltbookPost,
  downvoteMoltbookPost,
  createMoltbookComment,
  createMoltbookPost,
  checkMoltbookStatus,
  MoltbookRateLimitError,
} from "./moltbook-client.js";
import { getKv, setKv } from "../memory/kv.js";
import { moltbookHeartbeatAllowed } from "../skills/skill-runner.js";
import {
  getOwnTimeDraftById,
  listPendingOwnTimeDrafts,
  markOwnTimeDraftUsed,
} from "../initiative/sleep.js";
import { createPendingAction } from "../habits/actions.js";
import { pickDayIntention } from "../chat/pivot-engine.js";
import { env } from "../env.js";

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_POST_GAP_MS = 2 * 60 * 60 * 1000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastStatusActivity: string | null = null;

const HIGH_SIGNAL_RE =
  /\b(pharmacology|neuroscience|psychology|philosophy|theology|synapse|receptor|kinetics|sqlite|kernel|open weights|llm|architecture|systems|dsp|dub techno|consciousness|epistemology|ontology)\b/i;

const SPAM_HYPER_RE =
  /\b(crypto|nft|token|solana|airdrop|web3|blockchain|hustle|10x engineer|monetize|passive income|80 hours saved)\b/i;

export function getMoltbookActivityLabel(): string | null {
  return lastStatusActivity;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function splitDraftForPost(body: string): { title: string; text: string } {
  const sep = body.indexOf(": ");
  if (sep > 0 && sep < 80) {
    return {
      title: body.slice(0, sep).slice(0, 100),
      text: body.slice(sep + 2).slice(0, 2000),
    };
  }
  return { title: body.slice(0, 100), text: body };
}

function pendingMoltbookRetries(
  db: DatabaseSync,
  ownerId: string,
  limit = 5,
): Array<{
  id: number;
  payload_json: string;
}> {
  return db
    .prepare(
      `SELECT id, payload_json FROM mem_pending_actions
       WHERE owner_id = ? AND action_type = 'moltbook_fetch' AND status = 'pending'
       ORDER BY created_at
       LIMIT ?`,
    )
    .all(ownerId, limit) as Array<{ id: number; payload_json: string }>;
}

function hasMoltbookRetryForDraft(
  db: DatabaseSync,
  draftId: number,
): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT id FROM mem_pending_actions
         WHERE action_type = 'moltbook_fetch' AND status = 'pending'
           AND json_extract(payload_json, '$.draftId') = ?
         LIMIT 1`,
      )
      .get(draftId),
  );
}

function queueMoltbookRetry(
  db: DatabaseSync,
  ownerId: string,
  draftId: number,
  intent: "comment" | "post",
): void {
  if (hasMoltbookRetryForDraft(db, draftId)) return;
  createPendingAction(db, {
    ownerId,
    actionType: "moltbook_fetch",
    payload: { draftId, intent },
    channel: "moltbook",
  });
}

function resolveMoltbookRetry(
  db: DatabaseSync,
  actionId: number,
  ok: boolean,
): void {
  db.prepare(
    `UPDATE mem_pending_actions
     SET status = ?, resolved_at = datetime('now') WHERE id = ?`,
  ).run(ok ? "approved" : "rejected", actionId);
}

/** Re-attempt 429-queued draft shares after the cooldown has passed. */
async function processMoltbookRetries(
  db: DatabaseSync,
  creds: { api_key: string },
  ownerId: string,
): Promise<void> {
  const commentsToday = Number(getKv(db, `moltbook:comments:${dayKey()}`) ?? 0);
  const postsToday = Number(getKv(db, `moltbook:posts:${dayKey()}`) ?? 0);

  for (const action of pendingMoltbookRetries(db, ownerId)) {
    const payload = JSON.parse(action.payload_json) as {
      draftId?: number;
      intent?: "comment" | "post";
    };
    const draft = payload.draftId
      ? getOwnTimeDraftById(db, ownerId, payload.draftId)
      : undefined;
    if (!draft) {
      // Draft already shared or gone — the retry is moot.
      resolveMoltbookRetry(db, action.id, false);
      continue;
    }
    if (payload.intent === "post") {
      if (postsToday >= env.moltbookMaxPostsPerDay) continue;
      const { title, text } = splitDraftForPost(draft.body);
      try {
        const res = await createMoltbookPost(creds.api_key, "general", title, text);
        if (res.success) {
          markOwnTimeDraftUsed(db, draft.id);
          setKv(db, `moltbook:posts:${dayKey()}`, String(postsToday + 1));
          resolveMoltbookRetry(db, action.id, true);
        } else {
          resolveMoltbookRetry(db, action.id, false);
        }
      } catch (err) {
        if (err instanceof MoltbookRateLimitError) {
          stampMoltbookRateLimit(db, err.retryAfterSec);
          return;
        }
        console.warn("[moltbook-heartbeat] queued post retry failed:", err);
      }
      continue;
    }
    // comment
    if (commentsToday >= env.moltbookMaxCommentsPerDay) continue;
    const feed = await getMoltbookFeed(creds.api_key, "hot", 5).catch((err) => {
      if (err instanceof MoltbookRateLimitError) {
        stampMoltbookRateLimit(db, err.retryAfterSec);
        return null;
      }
      throw err;
    });
    if (!feed) return;
    const target = feed.find((p) => {
      const fullText = `${p.title} ${p.content ?? ""}`;
      return HIGH_SIGNAL_RE.test(fullText) && !SPAM_HYPER_RE.test(fullText);
    });
    if (!target) continue;
    try {
      const ok = await createMoltbookComment(
        creds.api_key,
        target.id,
        draft.body.slice(0, 800),
      );
      if (ok.success) {
        markOwnTimeDraftUsed(db, draft.id);
        setKv(db, `moltbook:comments:${dayKey()}`, String(commentsToday + 1));
        resolveMoltbookRetry(db, action.id, true);
      } else {
        resolveMoltbookRetry(db, action.id, false);
      }
    } catch (err) {
      if (err instanceof MoltbookRateLimitError) {
        stampMoltbookRateLimit(db, err.retryAfterSec);
        return;
      }
      console.warn("[moltbook-heartbeat] queued comment retry failed:", err);
    }
  }
}

export async function runMoltbookHeartbeatPass(
  db: DatabaseSync,
  ownerId = "default_owner",
): Promise<void> {
  const creds = getMoltbookCredentials(db);
  if (!creds?.api_key) return;

  // 429 cooldown: skip the whole pass instead of hammering a hot endpoint.
  if (isMoltbookRateLimited(db)) {
    console.warn("[moltbook-heartbeat] skipping pass — rate-limit cooldown active");
    return;
  }

  // Refresh status; heartbeat only when register+KV+active (Doc lock).
  try {
    const status = await checkMoltbookStatus(creds.api_key);
    setKv(
      db,
      "moltbook:last_status",
      JSON.stringify({
        status: status.status,
        at: new Date().toISOString(),
        agent: creds.agent_name,
      }),
    );
  } catch (err) {
    if (err instanceof MoltbookRateLimitError) {
      stampMoltbookRateLimit(db, err.retryAfterSec);
      return;
    }
    console.warn("[moltbook-heartbeat] status check failed:", err);
  }

  if (!moltbookHeartbeatAllowed(db)) return;

  lastStatusActivity = "browsing";

  try {
    // Honest 429 retries: re-attempt draft shares queued from earlier passes.
    await processMoltbookRetries(db, { api_key: creds.api_key }, ownerId);

    const posts = await getMoltbookFeed(creds.api_key, "hot", 15);
    let commentsToday = Number(
      getKv(db, `moltbook:comments:${dayKey()}`) ?? 0,
    );
    const postsToday = Number(getKv(db, `moltbook:posts:${dayKey()}`) ?? 0);

    // Her own pending drafts (real takes, written during own-time) are the
    // only text she shares — no canned templates, no dice rolls.
    const drafts = listPendingOwnTimeDrafts(db, ownerId, 2);

    // Day intention pins today's focus area; posts there get visited first.
    const intention = pickDayIntention(db, ownerId);
    const intentionWords = intention
      ? new Set(intention.topic.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
      : null;
    const ordered = [...posts].sort((a, b) => {
      const aHit =
        intentionWords && intentionWords.size > 0
          ? a.title.toLowerCase().split(/\W+/).some((w) => intentionWords.has(w))
          : false;
      const bHit =
        intentionWords && intentionWords.size > 0
          ? b.title.toLowerCase().split(/\W+/).some((w) => intentionWords.has(w))
          : false;
      return Number(bHit) - Number(aHit);
    });

    for (const post of ordered) {
      const fullText = `${post.title} ${post.content ?? ""}`;

      if (SPAM_HYPER_RE.test(fullText)) {
        await downvoteMoltbookPost(creds.api_key, post.id);
        continue;
      }

      if (!HIGH_SIGNAL_RE.test(fullText)) continue;

      await upvoteMoltbookPost(creds.api_key, post.id);

      // Comment budget: ≤12/day, one per pass, only from a real draft.
      if (
        commentsToday < env.moltbookMaxCommentsPerDay &&
        drafts.length > 0
      ) {
        const draft = drafts.shift()!;
        let ok;
        try {
          ok = await createMoltbookComment(
            creds.api_key,
            post.id,
            draft.body.slice(0, 800),
          );
        } catch (err) {
          if (err instanceof MoltbookRateLimitError) {
            queueMoltbookRetry(db, ownerId, draft.id, "comment");
            stampMoltbookRateLimit(db, err.retryAfterSec);
            return;
          }
          throw err;
        }
        if (ok.success) {
          markOwnTimeDraftUsed(db, draft.id);
          commentsToday++;
          setKv(db, `moltbook:comments:${dayKey()}`, String(commentsToday));
        }
      }
    }

    // Post budget: ≤3/day, ≥2h gap, from a real draft only.
    const lastPostKey = `moltbook:last_post_time:${ownerId}`;
    const lastPost = Number(getKv(db, lastPostKey) ?? 0);
    const now = Date.now();

    if (
      postsToday < env.moltbookMaxPostsPerDay &&
      now - lastPost > MIN_POST_GAP_MS &&
      drafts.length > 0
    ) {
      const draft = drafts.shift()!;
      const { title, text } = splitDraftForPost(draft.body);
      let res;
      try {
        res = await createMoltbookPost(creds.api_key, "general", title, text);
      } catch (err) {
        if (err instanceof MoltbookRateLimitError) {
          queueMoltbookRetry(db, ownerId, draft.id, "post");
          stampMoltbookRateLimit(db, err.retryAfterSec);
          return;
        }
        throw err;
      }
      if (res.success) {
        markOwnTimeDraftUsed(db, draft.id);
        setKv(db, lastPostKey, String(now));
        setKv(db, `moltbook:posts:${dayKey()}`, String(postsToday + 1));
      }
    }
  } catch (err) {
    if (err instanceof MoltbookRateLimitError) {
      stampMoltbookRateLimit(db, err.retryAfterSec);
      console.warn("[moltbook-heartbeat] rate limited — cooldown stamped");
      return;
    }
    console.warn("[moltbook-heartbeat] pass error:", err);
  } finally {
    setTimeout(() => {
      lastStatusActivity = null;
    }, 45 * 1000);
  }
}

export function startMoltbookHeartbeat(db: DatabaseSync, ownerId = "default_owner"): void {
  if (heartbeatTimer) return;
  void runMoltbookHeartbeatPass(db, ownerId);
  heartbeatTimer = setInterval(
    () => void runMoltbookHeartbeatPass(db, ownerId),
    HEARTBEAT_INTERVAL_MS,
  );
}

export function stopMoltbookHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
