import { configDefaults, defineConfig } from "vitest/config";

const HOST_SCRIPT_TESTS = [
  "src/rollback-corrections.test.ts",
  "src/activation-corrections.test.ts",
  "src/activation-qualification.test.ts",
];

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...HOST_SCRIPT_TESTS],
    environment: "node",
    testTimeout: 20_000,
    setupFiles: ["src/core/qualification/offline-network-guard.ts"],
  },
});
