import { defineConfig } from "vitest/config";

/**
 * Host qualification scripts (Mint activation/rollback fixtures).
 * Not part of the local settlement corpus. Serial by shared systemd/sudo
 * fake-bin and process spawn, and because these suites have hung this
 * runner when mixed into the default Vitest pool.
 */
export default defineConfig({
  test: {
    include: [
      "src/rollback-corrections.test.ts",
      "src/activation-corrections.test.ts",
      "src/activation-qualification.test.ts",
    ],
    environment: "node",
    testTimeout: 20_000,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
