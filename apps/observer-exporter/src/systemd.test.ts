import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

describe("disabled deployment candidates", () => {
  it("keeps the exporter unit outside Ashley data storage and out of .env", () => {
    const service = readFileSync(
      join(repoRoot, "deploy/linux-mint/systemd/ashley-observer-export.service"),
      "utf8",
    );
    expect(service).toContain("Type=oneshot");
    expect(service).toContain("--out-root %h/.ashley-field-observer-bundles");
    expect(service).not.toContain("EnvironmentFile=");
    expect(service).not.toMatch(/DISCORD_BOT_TOKEN|MISTRAL_API_KEY|GROQ_API_KEY/);
  });

  it("uses the explicit Istanbul calendar expression without a Timezone directive", () => {
    const timer = readFileSync(
      join(repoRoot, "deploy/linux-mint/systemd/ashley-observer-export.timer"),
      "utf8",
    );
    expect(timer).toContain("OnCalendar=*-*-* 04:05:00 Europe/Istanbul");
    expect(timer).not.toMatch(/^Timezone=/mu);
  });
});
