/**
 * When generation produces nothing sendable, Doc still gets something in her
 * voice. One fixed string would become a tell within a week.
 */
const LINES = [
  "blanked on that one, hit me again",
  "lost the thread there. say it again?",
  "that came out as nothing. one more time",
  "nope, brain went somewhere else. again?",
  "i had something and dropped it. repeat that",
];

const SEND_FAILED = [
  "that one didn't go through. say it again?",
  "discord ate that. one more time",
];

/** Sent only when she is actually about to search, never as filler. */
const LOOKING = [
  "hang on, looking",
  "one sec, checking",
  "gimme a sec, pulling it up",
  "bir saniye, bakıyorum",
];

function rotate(lines: string[], state: { last: number }): string {
  let i = Math.floor(Math.random() * lines.length);
  if (i === state.last) i = (i + 1) % lines.length;
  state.last = i;
  return lines[i]!;
}

const fumbleState = { last: -1 };
const sendState = { last: -1 };
const lookingState = { last: -1 };

export function fumbleLine(): string {
  return rotate(LINES, fumbleState);
}

export function sendFailedLine(): string {
  return rotate(SEND_FAILED, sendState);
}

export function lookingLine(): string {
  return rotate(LOOKING, lookingState);
}
