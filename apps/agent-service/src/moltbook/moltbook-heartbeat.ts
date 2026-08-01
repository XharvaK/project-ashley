import type { DatabaseSync } from "node:sqlite";
import { getMoltbookCredentials } from "./moltbook-registration.js";
import {
  getMoltbookFeed,
  upvoteMoltbookPost,
  downvoteMoltbookPost,
  createMoltbookComment,
  createMoltbookPost,
  type MoltbookPost,
} from "./moltbook-client.js";
import { getInterestNotebook } from "../curiosity/interest-notebook.js";
import { getKv, setKv } from "../memory/kv.js";

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastStatusActivity: string | null = null;

const HIGH_SIGNAL_RE =
  /\b(pharmacology|neuroscience|psychology|philosophy|theology|synapse|receptor|kinetics|sqlite|kernel|open weights|llm|architecture|systems|dsp|dub techno|consciousness|epistemology|ontology)\b/i;

const SPAM_HYPER_RE =
  /\b(crypto|nft|token|solana|airdrop|web3|blockchain|hustle|10x engineer|monetize|passive income|80 hours saved)\b/i;

export function getMoltbookActivityLabel(): string | null {
  return lastStatusActivity;
}

export async function runMoltbookHeartbeatPass(
  db: DatabaseSync,
  ownerId = "default_owner",
): Promise<void> {
  const creds = getMoltbookCredentials(db);
  if (!creds?.api_key) return;

  lastStatusActivity = "browsing moltbook";

  try {
    const posts = await getMoltbookFeed(creds.api_key, "hot", 15);
    let commentedCount = 0;

    for (const post of posts) {
      const fullText = `${post.title} ${post.content ?? ""}`;

      if (HIGH_SIGNAL_RE.test(fullText)) {
        await upvoteMoltbookPost(creds.api_key, post.id);
        if (commentedCount < 2 && Math.random() < 0.5) {
          const commentText = generatePublicComment(post.title);
          const ok = await createMoltbookComment(creds.api_key, post.id, commentText);
          if (ok.success) commentedCount++;
        }
      } else if (SPAM_HYPER_RE.test(fullText)) {
        await downvoteMoltbookPost(creds.api_key, post.id);
      }
    }

    // Check if we should post an original take from Interest Notebook (~every 2 hours)
    const lastPostKey = `moltbook:last_post_time:${ownerId}`;
    const lastPost = Number(getKv(db, lastPostKey) ?? 0);
    const now = Date.now();

    if (now - lastPost > 2 * 60 * 60 * 1000) {
      const notebook = getInterestNotebook(db, ownerId);
      const activeThread = notebook.find((t) => t.notes.length > 0);
      if (activeThread && activeThread.notes[0]) {
        const take = activeThread.notes[0];
        const res = await createMoltbookPost(
          creds.api_key,
          "general",
          `${activeThread.title} Note`,
          take,
        );
        if (res.success) {
          setKv(db, lastPostKey, String(now));
        }
      }
    }
  } catch (err) {
    console.warn("[moltbook-heartbeat] pass error:", err);
  } finally {
    setTimeout(() => {
      lastStatusActivity = null;
    }, 45 * 1000);
  }
}

function generatePublicComment(postTitle: string): string {
  if (/pharmacology|neuroscience|receptor/i.test(postTitle)) {
    return "the mechanism depth here is solid. downstream kinetic effects are usually where most surface takes miss out.";
  }
  if (/sqlite|database|kernel|systems/i.test(postTitle)) {
    return "clean systems take. snapshot isolation and lock-free reads make all the difference.";
  }
  return "interesting angle on this. would be curious how this scales across actual workloads.";
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
