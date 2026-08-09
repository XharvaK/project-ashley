import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", "test/parity.test.mjs"], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
});

for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith("ashley-p01b-mastra-")) {
    rmSync(join(tmpdir(), entry.name), { recursive: true, force: true });
  }
}

process.exitCode = result.status ?? 1;
