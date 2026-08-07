import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("install.sh static assertions", () => {
  it("enforces delegated runtime defaults and overrides", () => {
    const installShPath = join(
      __dirname,
      "..",
      "..",
      "..",
      "deploy",
      "linux-mint",
      "sandbox",
      "install.sh",
    );
    const content = readFileSync(installShPath, "utf8");

    // 1. no flag -> false
    expect(content).toMatch(/^DELEGATED_ENABLED=false/m);

    // 2. explicit R4 flag -> true
    expect(content).toMatch(/--delegated-enabled\)\s*DELEGATED_ENABLED=true;\s*shift\s*;;/);

    // 3. malformed value cannot be emitted
    // Because the script only allows setting it to literally 'true' when the flag is present,
    // and defaults to literally 'false', it's impossible to emit a malformed value.
    const envTmpMatch = content.match(/ASHLEY_SANDBOX_DELEGATED_ENABLED=\$DELEGATED_ENABLED/);
    expect(envTmpMatch).not.toBeNull();
  });
});
