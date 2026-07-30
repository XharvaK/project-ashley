import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { completeChat } from "../mistral-client.js";
import { getActiveSummary, listActiveFacts } from "../memory/facts.js";
import { resolveActiveThread } from "../memory/threads.js";
import {
  checkHardCooldown,
  getLastUserMessageAt,
  type CooldownResult,
} from "./cooldown.js";

export type EvaluateResult = {
  shouldReachOut: boolean;
  reason: string;
  angle?: "question" | "opinion" | "check_in";
  cooldownRemainingSec: number;
};

function hasMemoryContext(
  db: DatabaseSync,
  ownerId: string,
  threadId: string,
): boolean {
  const facts = listActiveFacts(db, ownerId);
  const narrative = getActiveSummary(db, threadId);
  if (facts.length > 0 || narrative?.trim()) return true;

  const lastUser = getLastUserMessageAt(db, ownerId);
  if (!lastUser) return false;
  const idleH =
    (Date.now() - new Date(lastUser).getTime()) / 3600000;
  return idleH < env.proactiveColdStartHours;
}

export async function evaluateInitiative(
  db: DatabaseSync,
  ownerId: string,
  options: { busy: boolean; enabled: boolean },
): Promise<EvaluateResult> {
  const hard: CooldownResult = checkHardCooldown(db, ownerId, options);
  if (!hard.allowed) {
    console.log(`[initiative] evaluate skip: ${hard.reason}`);
    return {
      shouldReachOut: false,
      reason: hard.reason,
      cooldownRemainingSec: hard.cooldownRemainingSec,
    };
  }

  const threadId = resolveActiveThread(db, ownerId, env.proactiveChannel);
  if (!hasMemoryContext(db, ownerId, threadId)) {
    return {
      shouldReachOut: false,
      reason: "cold_start_no_context",
      cooldownRemainingSec: 0,
    };
  }

  const facts = listActiveFacts(db, ownerId).slice(0, 15);
  const narrative = getActiveSummary(db, threadId) ?? "";
  const factLines = facts.map((f) => `- ${f.value}`).join("\n");

  try {
    const { text } = await completeChat(
      [
        {
          role: "system",
          content: `You gate proactive Discord outreach for a personal companion bot.
Output JSON only: { "reach_out": boolean, "angle": "question"|"opinion"|"check_in"|null, "reason": string }
reach_out true only if there is a natural, memory-grounded reason to message Doc now.
Never suggest outreach based on invented facts. Prefer false when uncertain.`,
        },
        {
          role: "user",
          content: `Standing facts:\n${factLines || "(none)"}\n\nThread summary:\n${narrative || "(none)"}\n\nShould Ashley reach out now?`,
        },
      ],
      { maxTokens: 200, temperature: 0.1 },
    );

    const parsed = JSON.parse(text) as {
      reach_out?: boolean;
      angle?: "question" | "opinion" | "check_in";
      reason?: string;
    };

    if (!parsed.reach_out) {
      return {
        shouldReachOut: false,
        reason: parsed.reason ?? "gate_declined",
        cooldownRemainingSec: 0,
      };
    }

    const angle = parsed.angle ?? "check_in";
    return {
      shouldReachOut: true,
      reason: parsed.reason ?? "gate_approved",
      angle,
      cooldownRemainingSec: 0,
    };
  } catch {
    return {
      shouldReachOut: false,
      reason: "gate_parse_failed",
      cooldownRemainingSec: 0,
    };
  }
}
