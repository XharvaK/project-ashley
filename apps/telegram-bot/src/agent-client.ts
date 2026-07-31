import { config } from "./config.js";

export type AgentError = {
  error: string;
  code: string;
  retryAfterSec?: number;
};

function isTimeoutAbort(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

async function agentFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.agentUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if (isTimeoutAbort(err)) {
      const e = new Error("agent request timed out") as Error & {
        code?: string;
      };
      e.code = "agent_timeout";
      throw e;
    }
    throw err;
  }
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
  }>("/chat/text", {
    method: "POST",
    body: JSON.stringify({
      message,
      channel: "telegram",
      userId: config.memoryOwnerId,
      threadId,
    }),
  });
}

export async function pinMemory(
  text: string,
  sensitivity: "none" | "private" = "none",
) {
  return agentFetch<{ ok: boolean; fact: { key: string; value: string } }>(
    "/memory/pin",
    {
      method: "POST",
      body: JSON.stringify({
        userId: config.memoryOwnerId,
        text,
        sensitivity,
      }),
    },
  );
}

export async function memorySummary(includePrivate = false) {
  const q = new URLSearchParams({
    owner_id: config.memoryOwnerId,
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
    body: JSON.stringify({ userId: config.memoryOwnerId }),
  });
}

export async function forgetTopic(topic: string, confirmed: boolean) {
  return agentFetch<{ preview: string[]; deleted: number }>("/memory/forget", {
    method: "POST",
    body: JSON.stringify({
      userId: config.memoryOwnerId,
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
    body: JSON.stringify({ userId: config.memoryOwnerId }),
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
    body: JSON.stringify({ userId: config.memoryOwnerId, ...body }),
  });
}

export async function pauseProactiveRemote() {
  return agentFetch<{ ok: boolean; paused: boolean }>("/initiative/pause", {
    method: "POST",
    body: JSON.stringify({ userId: config.memoryOwnerId }),
  });
}

export async function resumeProactiveRemote() {
  return agentFetch<{ ok: boolean; paused: boolean }>("/initiative/resume", {
    method: "POST",
    body: JSON.stringify({ userId: config.memoryOwnerId }),
  });
}

export async function initiativeStatus() {
  const q = new URLSearchParams({
    owner_id: config.memoryOwnerId,
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

export async function schedulerTick() {
  return agentFetch<{
    items: Array<{
      kind: "reminder" | "habit";
      id: number;
      text: string;
      channel: string;
    }>;
  }>("/scheduler/tick", {
    method: "POST",
    body: JSON.stringify({ userId: config.memoryOwnerId }),
  });
}

export async function schedulerCommit(body: {
  kind: "reminder" | "habit";
  id: number;
  externalMessageId: string;
  text?: string;
}) {
  return agentFetch<{ ok: boolean }>("/scheduler/commit", {
    method: "POST",
    body: JSON.stringify({ userId: config.memoryOwnerId, ...body }),
  });
}

export async function resolveAction(
  actionId: number,
  decision: "approved" | "rejected",
) {
  return agentFetch<{ ok: boolean; result?: unknown }>("/actions/resolve", {
    method: "POST",
    body: JSON.stringify({
      userId: config.memoryOwnerId,
      actionId,
      decision,
    }),
  });
}

export async function proposeAction(
  actionType: "pin_fact" | "create_reminder" | "create_habit",
  payload: unknown,
) {
  return agentFetch<{
    ok: boolean;
    action: { id: number; action_type: string; payload_json: string };
  }>("/actions/propose", {
    method: "POST",
    body: JSON.stringify({
      userId: config.memoryOwnerId,
      actionType,
      payload,
      channel: "telegram",
    }),
  });
}
