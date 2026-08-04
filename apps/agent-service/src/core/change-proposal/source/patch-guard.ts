export function rejectUnsafePatch(patchText: string): { ok: true } | { ok: false; reason: string } {
  const lines = patchText.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      const pathPart = line.slice(4).trim().split("\t")[0] ?? "";
      if (pathPart.startsWith("/") || pathPart.includes("..")) {
        return { ok: false, reason: "absolute_or_parent_path" };
      }
      if (/composer-assistant|\.env|\.pem|credentials/i.test(pathPart)) {
        return { ok: false, reason: "live_or_sensitive_path" };
      }
    }
    if (line.startsWith("Binary files ")) {
      return { ok: false, reason: "binary_patch" };
    }
  }
  return { ok: true };
}
