import { sha256 } from "../../model-fabric/hash.js";
import type { ExistingRef, LocalAlias, SemanticRef } from "../types.js";

export type ThoughtReferenceAllowlist = {
  readonly existing: ReadonlySet<string>;
  readonly fingerprint: string;
  readonly aliases: Set<string>;
};

export function buildReferenceAllowlist(references: readonly string[]): ThoughtReferenceAllowlist {
  const existing = new Set(references.filter((ref) => typeof ref === "string" && ref.length > 0));
  return {
    existing,
    fingerprint: `sha256:${sha256([...existing].sort())}`,
    aliases: new Set(),
  };
}

export function registerLocalAlias(
  allowlist: ThoughtReferenceAllowlist,
  alias: string,
): LocalAlias {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(alias)) throw new Error("alias_invalid");
  if (allowlist.existing.has(alias)) throw new Error("alias_collides_with_existing_ref");
  if (allowlist.aliases.has(alias)) throw new Error("alias_duplicate");
  allowlist.aliases.add(alias);
  return alias as LocalAlias;
}

export type ResolvedReference =
  | { ok: true; ref: ExistingRef }
  | { ok: true; alias: LocalAlias }
  | { ok: false; code: "reference_not_allowlisted" | "alias_not_registered" | "reference_shape_invalid" };

export function resolveReference(
  allowlist: ThoughtReferenceAllowlist,
  value: SemanticRef | { kind: "existing"; ref: string } | { kind: "local"; alias: string },
): ResolvedReference {
  if (!value || (value.kind !== "existing" && value.kind !== "local")) {
    return { ok: false, code: "reference_shape_invalid" };
  }
  if (value.kind === "existing") {
    return allowlist.existing.has(value.ref)
      ? { ok: true, ref: value.ref as ExistingRef }
      : { ok: false, code: "reference_not_allowlisted" };
  }
  return allowlist.aliases.has(value.alias)
    ? { ok: true, alias: value.alias as LocalAlias }
    : { ok: false, code: "alias_not_registered" };
}
