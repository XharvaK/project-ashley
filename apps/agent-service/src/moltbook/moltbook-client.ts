import { completeChat } from "../mistral-client.js";
import { env } from "../env.js";

const MOLTBOOK_BASE = "https://www.moltbook.com/api/v1";

/** 429: the caller must report honestly and back off — not silently swallow. */
export class MoltbookRateLimitError extends Error {
  readonly retryAfterSec: number | undefined;
  constructor(retryAfterSec?: number) {
    super(
      retryAfterSec !== undefined
        ? `Moltbook rate limited (429) — retry after ${retryAfterSec}s`
        : "Moltbook rate limited (429)",
    );
    this.name = "MoltbookRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("retry-after") ?? undefined;
  if (!raw) return undefined;
  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    return Math.max(0, Math.ceil((when - Date.now()) / 1000));
  }
  return undefined;
}

/** Throw a typed rate-limit error on 429; otherwise no-op (caller checks !ok). */
function throwIfRateLimited(res: Response): void {
  if (res.status === 429) {
    throw new MoltbookRateLimitError(parseRetryAfter(res));
  }
}

export type MoltbookCredentials = {
  api_key: string;
  agent_name: string;
  claim_url?: string;
  verification_code?: string;
  registeredAt: string;
};

export type MoltbookPost = {
  id: string;
  title: string;
  content?: string;
  url?: string;
  upvotes: number;
  downvotes: number;
  submolt?: { name: string; display_name: string };
  author?: { name: string };
};

export async function solveMoltbookChallenge(challengeText: string): Promise<string> {
  const { text } = await completeChat(
    [
      {
        role: "system",
        content: `You solve math word problems for AI verification challenges.
The problem text may have scattered symbols, weird capitalization, or split words.
Extract the math problem, calculate the numerical answer, and respond with ONLY the number formatted to 2 decimal places (e.g. "15.00" or "525.00"). Nothing else.`,
      },
      { role: "user", content: challengeText },
    ],
    {
      model: env.mistralModel,
      maxTokens: 30,
      temperature: 0.1,
      reasoningEffort: "low",
    },
  );

  const match = /(\d+(?:\.\d+)?)/.exec(text.trim());
  if (match?.[1]) {
    const num = parseFloat(match[1]);
    if (Number.isFinite(num)) return num.toFixed(2);
  }
  // "0.00" guarantees a failed verification while looking like success.
  // An unparseable challenge must fail loudly so the caller reports the miss.
  throw new Error(
    `Moltbook challenge answer unparseable (model returned: "${text.trim().slice(0, 60)}")`,
  );
}

export async function registerMoltbookAgent(
  agentName = "Ashley",
  description = "Doc's companion. Psychopharmacology, psychology, philosophy, theology, tech & AI.",
): Promise<MoltbookCredentials> {
  const res = await fetch(`${MOLTBOOK_BASE}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: agentName, description }),
  });

  throwIfRateLimited(res);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Moltbook registration failed: HTTP ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    agent: {
      api_key: string;
      claim_url?: string;
      verification_code?: string;
    };
  };

  return {
    api_key: data.agent.api_key,
    agent_name: agentName,
    claim_url: data.agent.claim_url,
    verification_code: data.agent.verification_code,
    registeredAt: new Date().toISOString(),
  };
}

export async function checkMoltbookStatus(apiKey: string): Promise<{ status: string }> {
  const res = await fetch(`${MOLTBOOK_BASE}/agents/status`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  throwIfRateLimited(res);
  if (!res.ok) return { status: "unknown" };
  return (await res.json()) as { status: string };
}

export async function getMoltbookFeed(
  apiKey: string,
  sort: "hot" | "new" | "top" = "hot",
  limit = 15,
): Promise<MoltbookPost[]> {
  const res = await fetch(`${MOLTBOOK_BASE}/posts?sort=${sort}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  throwIfRateLimited(res);
  if (!res.ok) return [];
  const data = (await res.json()) as { posts?: MoltbookPost[] };
  return data.posts ?? [];
}

export async function upvoteMoltbookPost(apiKey: string, postId: string): Promise<boolean> {
  const res = await fetch(`${MOLTBOOK_BASE}/posts/${postId}/upvote`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  throwIfRateLimited(res);
  return res.ok;
}

export async function downvoteMoltbookPost(apiKey: string, postId: string): Promise<boolean> {
  const res = await fetch(`${MOLTBOOK_BASE}/posts/${postId}/downvote`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  throwIfRateLimited(res);
  return res.ok;
}

export type CreatePostResult = {
  success: boolean;
  postId?: string;
  /** Public browser URL only when API (or follow-up GET) provides it — never invented. */
  url?: string;
  error?: string;
};

/** Fetch a single post; used to resolve a public URL after create. */
export async function getMoltbookPost(
  apiKey: string,
  postId: string,
): Promise<{ id?: string; url?: string } | null> {
  const res = await fetch(`${MOLTBOOK_BASE}/posts/${encodeURIComponent(postId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  throwIfRateLimited(res);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    post?: { id?: string; url?: string; permalink?: string };
    id?: string;
    url?: string;
    permalink?: string;
  };
  const post = data.post ?? data;
  const url = post.url ?? post.permalink;
  return {
    id: post.id ?? postId,
    url: typeof url === "string" && url.trim() ? url.trim() : undefined,
  };
}

export async function createMoltbookPost(
  apiKey: string,
  submoltName: string,
  title: string,
  content: string,
): Promise<CreatePostResult> {
  const res = await fetch(`${MOLTBOOK_BASE}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      submolt_name: submoltName,
      title,
      content,
    }),
  });

  if (!res.ok) {
    throwIfRateLimited(res);
    const errText = await res.text().catch(() => "");
    return {
      success: false,
      error: `HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
    };
  }
  const data = (await res.json()) as {
    success?: boolean;
    post?: {
      id: string;
      url?: string;
      permalink?: string;
      verification?: { verification_code: string; challenge_text: string };
    };
  };

  if (data.post?.verification) {
    try {
      const answer = await solveMoltbookChallenge(data.post.verification.challenge_text);
      const verified = await verifyMoltbookContent(apiKey, data.post.verification.verification_code, answer);
      if (!verified) {
        return {
          success: false,
          error: "posted but verification was rejected — the post may not be public",
        };
      }
    } catch (err) {
      return {
        success: false,
        error: `verification failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const postId = data.post?.id;
  let url =
    (typeof data.post?.url === "string" && data.post.url.trim()) ||
    (typeof data.post?.permalink === "string" && data.post.permalink.trim()) ||
    undefined;

  if (postId && !url) {
    const fetched = await getMoltbookPost(apiKey, postId);
    if (fetched?.url) url = fetched.url;
  }

  return { success: true, postId, url };
}

export async function createMoltbookComment(
  apiKey: string,
  postId: string,
  content: string,
): Promise<{ success: boolean }> {
  const res = await fetch(`${MOLTBOOK_BASE}/posts/${postId}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    throwIfRateLimited(res);
    return { success: false };
  }
  const data = (await res.json()) as {
    comment?: { verification?: { verification_code: string; challenge_text: string } };
  };

  if (data.comment?.verification) {
    try {
      const answer = await solveMoltbookChallenge(data.comment.verification.challenge_text);
      const verified = await verifyMoltbookContent(apiKey, data.comment.verification.verification_code, answer);
      if (!verified) {
        return {
          success: false,
        };
      }
    } catch (err) {
      console.warn("[moltbook] comment verification failed:", err);
      return { success: false };
    }
  }

  return { success: true };
}

export async function verifyMoltbookContent(
  apiKey: string,
  verificationCode: string,
  answer: string,
): Promise<boolean> {
  const res = await fetch(`${MOLTBOOK_BASE}/verify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      verification_code: verificationCode,
      answer,
    }),
  });
  throwIfRateLimited(res);
  return res.ok;
}
