import { env } from "./env.js";
import { completeChat } from "./mistral-client.js";
import { parseJsonObject } from "./memory/extract-json.js";

/**
 * Tag questions are the sycophancy trap: he states a technical claim and asks
 * her to confirm it, and the cheapest next token is "yes". This spots the shape
 * and asks her to check the claim before she answers it.
 */
const TAG_QUESTION =
  /\b(right|correct|yeah)\s*\?\s*$|\bisn'?t it\s*\?\s*$|\b(değil mi|öyle değil mi|doğru mu)\s*\?*\s*$/i;

const ASSERTION =
  /\b(is|are|was|were|does|do|has|have|should|must|means|works)\b|\b(zaten|gerekiyor|oluyor|yapıyor|demek)\b/i;

export function isPremiseCheck(message: string): boolean {
  const text = message.trim();
  if (text.length < 15 || text.length > 400) return false;
  if (!TAG_QUESTION.test(text)) return false;
  return ASSERTION.test(text);
}

export const PREMISE_GUARD =
  "He wants a check on a claim he made. If the premise is wrong, fully unpack why it is false in the first 1-2 clauses before offering advice or alternatives. Do not nod along.";

/** Openers that mean she nodded along before checking. */
const ACCEPTED =
  /^\s*(yes|yep|yeah|right|correct|exactly|evet|aynen|doğru|kesinlikle)\b/i;

export function acceptedUncheckedPremise(reply: string): boolean {
  return ACCEPTED.test(reply);
}

export type PremiseLLMResult = {
  hasFalsePremise: boolean;
  correction: string | null;
};

/**
 * Lightweight LLM premise check for tag-question turns that are long enough
 * to justify the call. Call only when `isPremiseCheck(message)` is true and
 * `message.trim().length > 20`.
 */
export async function checkPremiseLLM(
  message: string,
): Promise<PremiseLLMResult> {
  const { text } = await completeChat(
    [
      {
        role: "system",
        content: `You check whether a user's message contains a false technical premise.
Reply with JSON only: {"false": true/false, "correction": "brief correction" or null}
Only flag clearly false premises, not opinions or preferences.
Examples of false premises: "since Node dropped CommonJS", "now that Python 4 is out"
Examples that are NOT false: "since I switched to Rust", "now that the deploy works"`,
      },
      { role: "user", content: message },
    ],
    {
      model: env.mistralConsolidationModel,
      maxTokens: 80,
      temperature: 0.1,
      reasoningEffort: "low",
      lane: "interactive",
    },
  );

  try {
    const parsed = parseJsonObject<{
      false?: boolean;
      correction?: string | null;
    }>(text);
    return {
      hasFalsePremise: parsed.false === true,
      correction:
        typeof parsed.correction === "string" && parsed.correction.trim()
          ? parsed.correction.trim().slice(0, 200)
          : null,
    };
  } catch {
    return { hasFalsePremise: false, correction: null };
  }
}

/** Build a guard line from an LLM correction, or fall back to PREMISE_GUARD. */
export function premiseGuardWithCorrection(
  correction: string | null,
): string {
  if (!correction) return PREMISE_GUARD;
  return `${PREMISE_GUARD}\nLikely false premise — lead with this correction if it checks out: ${correction}`;
}
