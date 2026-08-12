import { isAbsolute } from "node:path";
import { runQualificationPolicyPreflight } from "./qualification-policy-preflight.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  return value?.trim() || undefined;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (value === undefined) throw new Error(name + "_missing");
  return value;
}

function booleanArgument(name: string): boolean {
  const value = requiredArgument(name);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(name + "_must_be_true_or_false");
}

function absoluteArgument(name: string): string {
  const value = requiredArgument(name);
  if (!isAbsolute(value)) throw new Error(name + "_must_be_absolute");
  return value;
}

function main(): void {
  const enabled = booleanArgument("--delegated-enabled");
  const nowArgument = argument("--now-ms");
  const nowMs = nowArgument === undefined ? Date.now() : Number(nowArgument);
  const artifactPath = enabled
    ? absoluteArgument("--artifact-path")
    : "/disabled/ashley-sandbox-policy.json";
  const signaturePath = enabled
    ? absoluteArgument("--signature-path")
    : "/disabled/ashley-sandbox-policy.json.sig";
  const ownerPublicKeyPath = enabled
    ? absoluteArgument("--owner-public-key")
    : "/disabled/ashley-sandbox-owner.pub";
  const result = runQualificationPolicyPreflight({
    enabled,
    artifactPath,
    signaturePath,
    ownerPublicKeyPath,
    ownerKeyId: argument("--owner-key-id") ?? "owner-ed25519-v1",
    nowMs,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "blocked") {
    console.error("BLOCKED " + result.reason);
    process.exitCode = 77;
  }
}

try {
  main();
} catch (error) {
  console.error(
    "BLOCKED delegated_policy_configuration_invalid " +
      (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 77;
}
