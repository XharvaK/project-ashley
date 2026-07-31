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

export async function chatText(
  message: string,
  threadId?: string,
  imageUrls?: string[],
) {
  return agentFetch<{
    text: string;
    threadId: string;
    model: string;
  }>("/chat/text", {
    method: "POST",
    body: JSON.stringify({
      message,
      channel: "discord",
      userId: config.ownerId,
      threadId,
      imageUrls: imageUrls?.length ? imageUrls : undefined,
    }),
  });
}

export async function curiosityStatus() {
  return agentFetch<{
    enabled: boolean;
    sources: number;
    itemsToday: number;
    readToday: number;
    takesToday: number;
    lastTakeAt: string | null;
  }>("/curiosity/status");
}

export async function reportReaction(messageId: string, emoji: string) {
  return agentFetch<{ ok: boolean; feedback: string }>("/signals/reaction", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId, messageId, emoji }),
  });
}

/** Cheap and best effort: a failure here just means no interim bubble. */
export async function lookupPreflight(message: string): Promise<boolean> {
  try {
    const res = await fetch(`${config.agentUrl}/chat/preflight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { lookup?: boolean };
    return Boolean(body.lookup);
  } catch {
    return false;
  }
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
        candidateKind?: string;
        materialKey?: string;
        reservationId?: number;
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
  candidateKind?: string;
  materialKey?: string;
  reservationId?: number;
}) {
  return agentFetch<{ ok: boolean }>("/initiative/commit", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId, ...body }),
  });
}

export async function abortInitiative(reservationId: number) {
  return agentFetch<{ ok: boolean }>("/initiative/abort", {
    method: "POST",
    body: JSON.stringify({ userId: config.ownerId, reservationId }),
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
