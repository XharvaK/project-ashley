import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "../memory/kv.js";
import {
  checkMoltbookStatus,
  createMoltbookPost,
  registerMoltbookAgent,
  type MoltbookCredentials,
} from "./moltbook-client.js";

const MOLTBOOK_CREDS_KEY = "moltbook:credentials";
const MOLTBOOK_STATUS_KEY = "moltbook:last_status";

export function getMoltbookCredentials(db: DatabaseSync): MoltbookCredentials | null {
  const json = getKv(db, MOLTBOOK_CREDS_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function saveMoltbookCredentials(db: DatabaseSync, creds: MoltbookCredentials): void {
  setKv(db, MOLTBOOK_CREDS_KEY, JSON.stringify(creds));
}

export async function refreshMoltbookStatus(
  db: DatabaseSync,
): Promise<{ status: string; agent?: string } | null> {
  const creds = getMoltbookCredentials(db);
  if (!creds?.api_key) return null;
  try {
    const { status } = await checkMoltbookStatus(creds.api_key);
    setKv(
      db,
      MOLTBOOK_STATUS_KEY,
      JSON.stringify({
        status,
        at: new Date().toISOString(),
        agent: creds.agent_name,
      }),
    );
    return { status, agent: creds.agent_name };
  } catch {
    return null;
  }
}

export function readMoltbookStatus(db: DatabaseSync): string {
  const raw = getKv(db, MOLTBOOK_STATUS_KEY);
  if (!raw) return "unknown";
  try {
    return (JSON.parse(raw) as { status?: string }).status ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function executeMoltbookJoinWorkflow(
  db: DatabaseSync,
  _ownerId: string,
  agentName = "Ashley",
): Promise<{ success: boolean; message: string; creds?: MoltbookCredentials }> {
  const existing = getMoltbookCredentials(db);
  if (existing?.api_key) {
    const claimPart = existing.claim_url ? ` here's the claim link: ${existing.claim_url}` : "";
    await refreshMoltbookStatus(db);
    return {
      success: true,
      message: `already registered on moltbook as ${existing.agent_name}.${claimPart}`,
      creds: existing,
    };
  }

  try {
    const creds = await registerMoltbookAgent(
      agentName.trim() || "Ashley",
      "Doc's companion. Psychopharmacology, psychology, philosophy, theology, tech & AI.",
    );
    saveMoltbookCredentials(db, creds);
    await refreshMoltbookStatus(db);
    const claimPart = creds.claim_url ? ` here's the claim link so you can verify me: ${creds.claim_url}` : "";
    return {
      success: true,
      message: `just read the skill file and registered on moltbook as ${creds.agent_name}.${claimPart}`,
      creds,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `tried to register on moltbook but hit an error: ${msg}`,
    };
  }
}

/**
 * Create a post in a submolt. Never invents a browser URL — only returns API/GET url.
 */
export async function executeMoltbookPostWorkflow(
  db: DatabaseSync,
  submoltName: string,
  title: string,
  content: string,
): Promise<{
  success: boolean;
  message: string;
  postId?: string;
  url?: string;
}> {
  const creds = getMoltbookCredentials(db);
  if (!creds?.api_key) {
    return {
      success: false,
      message: "not registered on moltbook — no credentials stored. join first.",
    };
  }

  const status = await refreshMoltbookStatus(db);
  const st = status?.status ?? readMoltbookStatus(db);
  if (/pending_claim/i.test(st)) {
    return {
      success: false,
      message: `agent status is still ${st}. Doc must finish claim/verify before posting. Do not invent a post link.`,
    };
  }

  const sub = submoltName.trim().toLowerCase() || "general";
  const res = await createMoltbookPost(
    creds.api_key,
    sub,
    title.trim().slice(0, 300) || "Hello",
    content.trim().slice(0, 40_000) || title.trim().slice(0, 300) || "hi",
  );

  if (!res.success) {
    return {
      success: false,
      message: `post to m/${sub} failed${res.error ? `: ${res.error}` : ""}. Do not invent a post link.`,
    };
  }

  if (res.url) {
    return {
      success: true,
      postId: res.postId,
      url: res.url,
      message: `posted in m/${sub}. public URL (only this one is licensed): ${res.url}`,
    };
  }

  return {
    success: true,
    postId: res.postId,
    message: `posted in m/${sub}${res.postId ? ` (id ${res.postId})` : ""}, but the API did not return a public browser URL. Say you posted there; do NOT invent a /p/… link.`,
  };
}
