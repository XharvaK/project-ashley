#!/usr/bin/env node
/**
 * Owner issuance tooling for the R4-006 autonomous-engineering policy.
 *
 * SOURCE PASS ONLY. This command PREPARES (derives) the R4-006 policy payload
 * from the staged R4-005 policy using `prepareR4006Policy`. It does NOT sign
 * the policy and does NOT stage it on the host. Signing and staging remain
 * owner actions performed after this source pass is physically qualified.
 *
 * Usage:
 *   node scripts/prepare-r4-006.mjs \
 *     --source path/to/r4-005.policy.json \
 *     --issued-at 2026-08-20T00:00:00.000Z \
 *     --expires-at 2026-09-19T00:00:00.000Z \
 *     [--out path/to/r4-006.policy.json]
 *
 * The first owner-issued R4-006 uses a 30-day validity window. The expiry is
 * an explicit owner decision; an indefinite lifetime is rejected by the
 * preparation API.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareR4006Policy,
  R4006_POLICY_ID,
  R4006_POLICY_VERSION,
} from "@composer-assistant/sandbox-broker";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function fail(message) {
  process.stderr.write(`prepare-r4-006: ${message}\n`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = args.source;
  const issuedAt = args["issued-at"];
  const expiresAt = args["expires-at"];
  if (typeof sourcePath !== "string") fail("--source <r4-005 policy json> is required");
  if (typeof issuedAt !== "string") fail("--issued-at <iso8601> is required");
  if (typeof expiresAt !== "string") fail("--expires-at <iso8601> is required (owner expiry decision)");

  let sourceText;
  try {
    sourceText = readFileSync(sourcePath, "utf8");
  } catch {
    fail(`cannot read source policy: ${sourcePath}`);
  }
  let source;
  try {
    source = JSON.parse(sourceText);
  } catch {
    fail("source policy is not valid JSON");
  }

  const result = prepareR4006Policy(source, { issuedAt, expiresAt });
  if (!result.ok) {
    fail(
      `preparation refused: ${result.reason}` +
        (result.details ? ` (${result.details.join(", ")})` : ""),
    );
  }

  const policy = result.policy;
  const outPath = typeof args.out === "string"
    ? args.out
    : resolve(dirname(sourcePath), "r4-006.policy.json");
  writeFileSync(outPath, JSON.stringify(policy, null, 2) + "\n", "utf8");

  const days = Math.round(result.lifetimeMs / (24 * 60 * 60 * 1000));
  process.stdout.write(
    [
      "R4-006 policy prepared (UNSIGNED).",
      `  policyId:    ${policy.policyId} (expected ${R4006_POLICY_ID})`,
      `  version:     ${policy.policyVersion} (expected ${R4006_POLICY_VERSION})`,
      `  issuedAt:    ${policy.issuedAt}`,
      `  expiresAt:   ${policy.expiresAt}`,
      `  lifetime:    ${days} day(s)`,
      `  capabilities: ${policy.allowedCapabilities.length}`,
      `  recipes:     ${policy.allowedRecipeIds.length}`,
      `  executables:  ${policy.allowedExecutableIds.length}`,
      "",
      "NEXT (owner actions, not performed here):",
      "  1. Review the prepared payload for correctness.",
      "  2. Sign it with the owner key (owner authority).",
      "  3. Stage it on the Mint host while autonomy remains disabled.",
      `  written to: ${outPath}`,
    ].join("\n") + "\n",
  );
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === here) {
  main();
}
