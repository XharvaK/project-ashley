import { isRecallQuery } from "./recall.js";

export type HotTurn = { role: "user" | "assistant"; content: string };

/** Strip prior meta-memory Q&A pairs so recall answers are not copied from hot history. */
export function filterHotForRecall(hot: HotTurn[]): HotTurn[] {
  const out: HotTurn[] = [];
  let i = 0;
  while (i < hot.length) {
    const m = hot[i]!;
    if (m.role === "user" && isRecallQuery(m.content)) {
      i += 1;
      if (i < hot.length && hot[i]!.role === "assistant") {
        i += 1;
      }
      continue;
    }
    out.push(m);
    i += 1;
  }
  return out;
}

/** Keep at most one recent non-recall user turn for optional session reference. */
export function truncateHotForStrictRecall(hot: HotTurn[]): HotTurn[] {
  for (let i = hot.length - 1; i >= 0; i--) {
    const m = hot[i]!;
    if (m.role === "user" && !isRecallQuery(m.content)) {
      return [m];
    }
  }
  return [];
}
