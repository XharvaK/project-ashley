import { createHash } from "node:crypto";

const EFFECT_REF_DOMAIN_SEPARATOR = "ashley:effect:v1:";

/**
 * Mint a deterministic opaque host-derived effect reference.
 * Thought may only echo allowlisted refs; Thought must never receive raw host effect UUIDs.
 */
export function mintEffectRef(cycleId: string, generation: number, effectId: string): string {
  const hash = createHash("sha256")
    .update(`${EFFECT_REF_DOMAIN_SEPARATOR}${cycleId}:${generation}:${effectId}`, "utf8")
    .digest("hex");
  return `effect:${hash}`;
}

export function buildEffectRefMap(
  cycleId: string,
  generation: number,
  effectIds: readonly string[],
): {
  refToId: Map<string, string>;
  idToRef: Map<string, string>;
  allowlist: Set<string>;
} {
  const refToId = new Map<string, string>();
  const idToRef = new Map<string, string>();
  const allowlist = new Set<string>();
  for (const id of effectIds) {
    const ref = mintEffectRef(cycleId, generation, id);
    refToId.set(ref, id);
    idToRef.set(id, ref);
    allowlist.add(ref);
  }
  return { refToId, idToRef, allowlist };
}
