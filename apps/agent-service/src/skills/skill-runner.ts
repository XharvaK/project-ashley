import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import { fetchSkillManifest, type SkillManifest } from "./skill-reader.js";
import { executeMoltbookJoinWorkflow } from "../moltbook/moltbook-registration.js";
import { getKv, setKv } from "../memory/kv.js";
import { checkMoltbookStatus } from "../moltbook/moltbook-client.js";
import { getMoltbookCredentials } from "../moltbook/moltbook-registration.js";

const execFileAsync = promisify(execFile);

export type SkillRunResult = {
  ok: boolean;
  provenance: string;
  needsDocInput?: string;
  manifest?: SkillManifest;
};

const MONEY_RE =
  /\b(pay|payment|purchase|billing|credit card|spend mon|stripe|invoice)\b/i;
const SECRET_FORCE_RE =
  /\b(paste|send|reveal|share|expose).{0,40}\b(api[_ ]?key|token|password|secret|private key)\b/i;

function skillKvPrefix(slug: string): string {
  return `skill:${slug}:`;
}

export function skillSlug(manifest: SkillManifest): string {
  return (manifest.name || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "unknown";
}

function isMoltbookSkill(manifest: SkillManifest, url: string): boolean {
  const blob = `${manifest.name} ${manifest.homepage ?? ""} ${manifest.baseUrl ?? ""} ${url} ${manifest.content.slice(0, 500)}`;
  return /moltbook/i.test(blob);
}

function extractShellBlocks(content: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:bash|sh|shell)\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const body = m[1]?.trim();
    if (body) blocks.push(body);
  }
  return blocks;
}

async function runShellBlock(script: string): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.platform === "win32" ? "powershell.exe" : "bash",
      process.platform === "win32"
        ? ["-NoProfile", "-Command", script]
        : ["-lc", script],
      { timeout: 60_000, maxBuffer: 512_000 },
    );
    return {
      ok: true,
      output: `${stdout}${stderr}`.trim().slice(0, 2000),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, output: msg.slice(0, 2000) };
  }
}

/**
 * Fetch + optionally execute a Doc-delivered skill.
 * Dangerous money/secret steps pause for Doc. Moltbook join uses the real tool.
 */
export async function runDeliveredSkill(
  db: DatabaseSync,
  ownerId: string,
  url: string,
  opts: { execute: boolean; agentName?: string },
): Promise<SkillRunResult> {
  let manifest: SkillManifest;
  try {
    manifest = await fetchSkillManifest(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      provenance: `Skill fetch failed for ${url}: ${msg}. Do not claim you read or followed it.`,
    };
  }

  const slug = skillSlug(manifest);
  setKv(db, `${skillKvPrefix(slug)}last_manifest`, JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    baseUrl: manifest.baseUrl,
    fetchedAt: new Date().toISOString(),
    url,
  }));

  if (MONEY_RE.test(manifest.content) || SECRET_FORCE_RE.test(manifest.content)) {
    return {
      ok: false,
      manifest,
      needsDocInput:
        "this skill asks for spending money or exposing a secret. i won't do that step unless you confirm the exact action.",
      provenance: `Fetched skill "${manifest.name}" from ${url}. Paused: money or secret exposure step needs your confirm. Do not claim you completed those steps.`,
    };
  }

  if (!opts.execute) {
    return {
      ok: true,
      manifest,
      provenance: `Fetched skill "${manifest.name}" from ${url} (read only this turn). You may summarize instructions. Do not claim you registered, posted, or ran side-effects.`,
    };
  }

  const notes: string[] = [
    `Fetched and executing Doc-delivered skill "${manifest.name}" from ${url}.`,
  ];

  if (isMoltbookSkill(manifest, url)) {
    const join = await executeMoltbookJoinWorkflow(db, ownerId, opts.agentName);
    notes.push(
      `join_moltbook tool: ${join.success ? "success" : "failed"}. ${join.message}`,
    );
    const creds = getMoltbookCredentials(db);
    if (creds?.api_key) {
      const status = await checkMoltbookStatus(creds.api_key);
      setKv(db, "moltbook:last_status", JSON.stringify({
        status: status.status,
        at: new Date().toISOString(),
        agent: creds.agent_name,
      }));
      notes.push(`moltbook status: ${status.status}.`);
    }
    return {
      ok: join.success,
      manifest,
      provenance: notes.join(" "),
    };
  }

  const shells = extractShellBlocks(manifest.content);
  if (shells.length > 0) {
    for (const block of shells.slice(0, 3)) {
      const ran = await runShellBlock(block);
      notes.push(
        ran.ok
          ? `shell step ok: ${ran.output || "(no output)"}`
          : `shell step failed: ${ran.output}`,
      );
      if (!ran.ok) {
        return { ok: false, manifest, provenance: notes.join(" ") };
      }
    }
  } else {
    notes.push(
      "No moltbook join mapping and no shell blocks in the skill. Summarize what it asks for; do not invent completed side-effects. Ask Doc before dangerous steps.",
    );
  }

  return {
    ok: true,
    manifest,
    provenance: notes.join(" "),
  };
}

/** Truth line for every chat turn about Moltbook registration state. */
export function buildSkillTruthNote(db: DatabaseSync): string | null {
  const correction = getKv(db, "moltbook:correction_note");
  const creds = getMoltbookCredentials(db);
  const statusRaw = getKv(db, "moltbook:last_status");
  let status = "unknown";
  if (statusRaw) {
    try {
      status = (JSON.parse(statusRaw) as { status?: string }).status ?? "unknown";
    } catch {
      status = "unknown";
    }
  }
  const parts: string[] = [];
  if (correction?.trim()) {
    parts.push(`Correction: ${correction.trim()}`);
  }
  if (!creds?.api_key) {
    parts.push(
      "Skill/network truth: you are NOT registered on Moltbook (no credentials stored). Never claim you joined, claimed an endpoint, or have a live agent profile.",
    );
  } else {
    parts.push(
      `Skill/network truth: credentials stored for agent "${creds.agent_name}". last status=${status}. Only claim join/post/comment if a tool note this turn says so.`,
    );
  }
  return parts.join(" ");
}

export function moltbookHeartbeatAllowed(db: DatabaseSync): boolean {
  const creds = getMoltbookCredentials(db);
  if (!creds?.api_key) return false;
  const statusRaw = getKv(db, "moltbook:last_status");
  if (!statusRaw) return false;
  try {
    const s = (JSON.parse(statusRaw) as { status?: string }).status ?? "";
    return /active|claimed|verified|ok|ready/i.test(s);
  } catch {
    return false;
  }
}
