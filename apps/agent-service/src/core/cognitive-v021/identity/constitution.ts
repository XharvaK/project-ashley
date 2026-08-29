import type { DatabaseSync } from "node:sqlite";
import { listIdentity } from "../../identity/store.js";
import type { IdentitySlice } from "../types.js";

/** Read the canonical nuclear identity source; no sidecar identity table exists. */
export function readIdentitySlice(
  nuclear: DatabaseSync,
  ownerId: string,
): IdentitySlice {
  const entries = listIdentity(nuclear, ownerId, { layer: "stable" });
  return {
    constitutional: entries
      .filter((entry) => entry.kind === "value" || entry.kind === "boundary")
      .map((entry) => entry.text),
    stableSelf: entries
      .filter((entry) => entry.kind !== "value" && entry.kind !== "boundary")
      .map((entry) => entry.text),
  };
}

export const buildIdentitySlice = readIdentitySlice;
