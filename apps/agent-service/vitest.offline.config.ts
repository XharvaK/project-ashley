import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    setupFiles: ["src/core/qualification/offline-network-guard.ts"],
  },
});
