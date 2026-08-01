import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "../memory/kv.js";
import { registerMoltbookAgent, type MoltbookCredentials } from "./moltbook-client.js";

const MOLTBOOK_CREDS_KEY = "moltbook:credentials";

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

export async function executeMoltbookJoinWorkflow(
  db: DatabaseSync,
  ownerId: string,
): Promise<{ success: boolean; message: string; creds?: MoltbookCredentials }> {
  const existing = getMoltbookCredentials(db);
  if (existing?.api_key) {
    const claimPart = existing.claim_url ? ` here's the claim link: ${existing.claim_url}` : "";
    return {
      success: true,
      message: `already registered on moltbook as ${existing.agent_name}.${claimPart}`,
      creds: existing,
    };
  }

  try {
    const creds = await registerMoltbookAgent(
      "Ashley",
      "Doc's companion. Psychopharmacology, psychology, philosophy, theology, tech & AI.",
    );
    saveMoltbookCredentials(db, creds);
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
