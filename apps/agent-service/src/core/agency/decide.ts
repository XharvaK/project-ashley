import type {
  Decision,
  DecisionKind,
  Motivation,
  MotivationKind,
  Trigger,
} from "../types.js";

function motivationIds(motivations: Motivation[]): number[] {
  return motivations
    .map((motivation) => motivation.id)
    .filter((id): id is number => id !== undefined);
}

function isFluff(summary: string): boolean {
  return /^(?:hi|hey|hello|ok|okay|k|lol|haha|nice|cool|thanks|ty|yeah|yep|nope|hm|hmm)[!.? ]*$/i.test(
    summary.trim(),
  );
}

function isSilenceSummary(summary: string): boolean {
  return /\b(?:stop(?: messaging| pinging)?|busy|later|not now|leave me alone|don't ping|do not ping)\b/i.test(
    summary,
  );
}

function mapMotivationKind(kind: MotivationKind): DecisionKind {
  switch (kind) {
    case "question":
      return "ask";
    case "unfinished":
      return "revisit";
    case "take":
      return "share";
    case "opinion":
      return "challenge";
    case "fact":
      return "revisit";
    case "callback":
      return "revisit";
    case "identity":
      return "share";
    case "availability":
      return "speak";
    case "user_message":
      return "speak";
    case "silence_signal":
      return "silence";
    case "silence_ok":
      return "silence";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function makeDecision(
  trigger: Trigger,
  kind: DecisionKind,
  motivations: Motivation[],
  reason: string,
  score: number,
): Decision {
  return {
    trigger,
    kind,
    motivationIds: motivationIds(motivations),
    score,
    reason,
  };
}

export function decide(
  motivations: Motivation[],
  trigger: Trigger,
): Decision {
  const silenceSignal = motivations.find(
    (motivation) =>
      motivation.kind === "silence_signal" && motivation.score >= 70,
  );
  if (trigger === "reactive" && silenceSignal) {
    return makeDecision(
      trigger,
      "silence",
      [silenceSignal],
      "The user asked for space.",
      silenceSignal.score,
    );
  }

  const userMessage = motivations.find(
    (motivation) => motivation.kind === "user_message",
  );
  if (trigger === "reactive" && userMessage) {
    if (isSilenceSummary(userMessage.summary)) {
      return makeDecision(
        trigger,
        "silence",
        [userMessage],
        "The user asked for space.",
        userMessage.score,
      );
    }
    const substantive = motivations
      .filter(
        (motivation) =>
          motivation !== userMessage &&
          motivation.kind !== "silence_ok" &&
          motivation.kind !== "availability",
      )
      .sort((a, b) => b.score - a.score)[0];
    if (isFluff(userMessage.summary) && (!substantive || substantive.score < 35)) {
      return makeDecision(
        trigger,
        "delay",
        [userMessage],
        "The message is a light ping without a real thread to pull.",
        userMessage.score,
      );
    }
    return makeDecision(
      trigger,
      "speak",
      [userMessage, ...(substantive ? [substantive] : [])],
      "A direct message deserves an answer.",
      Math.max(userMessage.score, substantive?.score ?? 0),
    );
  }

  if (trigger === "reactive") {
    return makeDecision(
      trigger,
      "speak",
      motivations.slice(0, 2),
      "A reactive turn without a user-message marker still defaults to speaking.",
      motivations[0]?.score ?? 0,
    );
  }

  const candidate = motivations
    .filter(
      (motivation) =>
        motivation.kind !== "silence_ok" &&
        motivation.kind !== "silence_signal" &&
        motivation.kind !== "user_message",
    )
    .sort((a, b) => b.score - a.score)[0];
  if (!candidate || candidate.score < 25) {
    return makeDecision(
      trigger,
      "silence",
      candidate ? [candidate] : motivations.slice(0, 1),
      "Nothing currently earns a proactive interruption.",
      candidate?.score ?? 0,
    );
  }

  return makeDecision(
    trigger,
    mapMotivationKind(candidate.kind),
    [candidate],
    `A ${candidate.kind} has enough weight to surface.`,
    candidate.score,
  );
}
