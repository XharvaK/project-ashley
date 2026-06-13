import { existsSync, readFileSync } from "node:fs";
import { CONFIG_PATH } from "./paths.js";

/** Orpheus default — most natural in official demos; override via config tts.voice */
export const DEFAULT_ORPHEUS_VOICE = "tara";

export function loadOrpheusVoice(): string {
  const fromEnv = process.env.ORPHEUS_VOICE?.trim();
  if (fromEnv) return fromEnv;

  if (!existsSync(CONFIG_PATH)) return DEFAULT_ORPHEUS_VOICE;
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as {
      tts?: { voice?: string };
    };
    const voice = cfg.tts?.voice?.trim();
    if (voice) return voice;
  } catch {
    /* use default */
  }
  return DEFAULT_ORPHEUS_VOICE;
}
