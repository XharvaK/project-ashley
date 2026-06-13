import { config } from "./config.js";

export type AgentError = {
  error: string;
  code: string;
  retryAfterSec?: number;
};

async function agentFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${config.agentUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json()) as T & AgentError;
  if (!res.ok) {
    const err = new Error(body.error ?? res.statusText);
    const e = err as Error & { code?: string; retryAfterSec?: number };
    e.code = body.code;
    if (body.retryAfterSec != null) e.retryAfterSec = body.retryAfterSec;
    throw err;
  }
  return body;
}

export async function chatText(message: string, threadId?: string) {
  return agentFetch<{
    text: string;
    threadId: string;
    model: string;
    memoryDigest?: Array<{
      key: string;
      value: string;
      category: string;
      display: string;
    }>;
  }>("/chat/text", {
    method: "POST",
    body: JSON.stringify({
      message,
      channel: "discord",
      userId: config.ownerId,
      threadId,
    }),
  });
}

export async function pinMemory(text: string, sensitivity: "none" | "private" = "none") {
  return agentFetch<{ ok: boolean; fact: { key: string; value: string } }>(
    "/memory/pin",
    {
      method: "POST",
      body: JSON.stringify({
        userId: config.ownerId,
        text,
        sensitivity,
      }),
    },
  );
}

export async function memorySummary(includePrivate = false) {
  const q = new URLSearchParams({
    owner_id: config.ownerId,
    ...(includePrivate ? { include_private: "true" } : {}),
  });
  return agentFetch<{
    facts: Array<{ key: string; value: string; category: string }>;
    narrative: string | null;
    lastUpdated: string;
  }>(`/memory/summary?${q}`);
}

export async function newThread() {
  return agentFetch<{ threadId: string }>("/memory/newthread", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId }),
  });
}

export async function forgetTopic(topic: string, confirmed: boolean) {
  return agentFetch<{ preview: string[]; deleted: number }>("/memory/forget", {
    method: "POST",
    body: JSON.stringify({
      userId: config.ownerId,
      topic,
      confirmed,
    }),
  });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${config.agentUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ready?: boolean };
    return Boolean(data.ready);
  } catch {
    return false;
  }
}

export async function tickInitiative() {
  return agentFetch<
    | { shouldSend: false; reason: string; cooldownRemainingSec?: number }
    | {
        shouldSend: true;
        text: string;
        threadId: string;
        angle: "question" | "opinion" | "check_in";
        reason: string;
      }
  >("/initiative/tick", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId }),
  });
}

export async function commitInitiative(body: {
  text: string;
  threadId: string;
  angle: "question" | "opinion" | "check_in";
  reason: string;
  discordMessageId: string;
}) {
  return agentFetch<{ ok: boolean }>("/initiative/commit", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId, ...body }),
  });
}

export async function pauseProactiveRemote() {
  return agentFetch<{ ok: boolean; paused: boolean }>("/initiative/pause", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId }),
  });
}

export async function resumeProactiveRemote() {
  return agentFetch<{ ok: boolean; paused: boolean }>("/initiative/resume", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId }),
  });
}

export async function evaluateInitiative() {
  return agentFetch<{
    shouldReachOut: boolean;
    reason: string;
    angle?: "question" | "opinion" | "check_in";
    cooldownRemainingSec: number;
  }>("/initiative/evaluate", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId }),
  });
}

export async function generateInitiative(
  angle: "question" | "opinion" | "check_in",
  reason: string,
) {
  return agentFetch<{
    text: string;
    threadId: string;
    angle: string;
    reason: string;
  }>("/initiative/generate", {
    method: "POST",
    body: JSON.stringify({
      userId: config.ownerId,
      angle,
      reason,
    }),
  });
}

export async function initiativeStatus() {
  const q = new URLSearchParams({
    owner_id: config.ownerId,
  });
  return agentFetch<{
    enabled: boolean;
    paused: boolean;
    sentToday: number;
    maxPerDay: number;
    lastSentAt: string | null;
    lastUserMessageAt: string | null;
    minIdleHours: number;
  }>(`/initiative/status?${q}`);
}
