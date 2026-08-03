import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR =
  process.env.COMPOSER_DATA_DIR ?? join(homedir(), ".composer-assistant");
export const STATE_PATH = join(DATA_DIR, "state.json");
export const CONFIG_PATH = join(DATA_DIR, "config.json");
export const CONVERSATIONS_DIR = join(DATA_DIR, "conversations");
export const SESSIONS_DIR = join(CONVERSATIONS_DIR, "sessions");
export const DB_PATH = join(CONVERSATIONS_DIR, "index.db");
export const NUCLEAR_DB_PATH = join(CONVERSATIONS_DIR, "nuclear.db");
export const LOGS_DIR = join(DATA_DIR, "logs");

export const WORKSPACE_PATH =
  process.env.COMPOSER_WORKSPACE ?? join(__dirname, "..", "..", "..", "workspace");

export const REPO_CONFIG_PATH = join(__dirname, "..", "..", "..", "config");

export const AGENT_PORT = Number(process.env.AGENT_PORT ?? 3710);
