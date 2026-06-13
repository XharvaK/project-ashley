import type { DatabaseSync } from "node:sqlite";

const CORRECTION_DENIAL =
  /içmedim|içmemişim|kullanmadım|uydurmuşsun|uydurdu|yalan|hatırlamıyorum|şizofren|made that up|never (said|did|took)/i;

const ENTITY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /3[-\s]?meo[-\s]?pcp|3[-\s]?meo/i, label: "3-MeO-PCP" },
  { re: /sigma[-\s]?1/i, label: "sigma-1" },
  { re: /valorant/i, label: "Valorant" },
  { re: /factory deploy/i, label: "Factory deploy" },
  { re: /coffee habit/i, label: "coffee habits" },
];

function entitiesInText(text: string): string[] {
  const found: string[] = [];
  for (const { re, label } of ENTITY_PATTERNS) {
    if (re.test(text)) found.push(label);
  }
  return found;
}

/** Session-scoped topics Doc rejected after fabrication accusations. */
export function buildCorrectionGuard(
  db: DatabaseSync,
  threadId: string,
): string | null {
  const rows = db
    .prepare(
      `SELECT role, text FROM mem_messages
       WHERE thread_id = ? AND role IN ('user', 'assistant')
       ORDER BY id ASC`,
    )
    .all(threadId) as Array<{ role: string; text: string }>;

  const blocked = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.role !== "user" || !CORRECTION_DENIAL.test(row.text)) {
      continue;
    }

    for (const label of entitiesInText(row.text)) {
      blocked.add(label);
    }

    const prev = rows[i - 1];
    if (prev?.role === "assistant") {
      for (const label of entitiesInText(prev.text)) {
        blocked.add(label);
      }
    }

    if (/3[-\s]?meo|pcp/i.test(row.text) || /içmedim|içmemişim/i.test(row.text)) {
      blocked.add("3-MeO-PCP");
      blocked.add("sigma-1");
    }
  }

  if (blocked.size === 0) return null;

  return [
    "<correction_guard>",
    `Doc rejected these as fabricated — do not mention again unless Doc reintroduces them: ${[...blocked].join(", ")}.`,
    "</correction_guard>",
  ].join("\n");
}
