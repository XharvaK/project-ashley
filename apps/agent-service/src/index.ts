import { bootstrapProductionRuntime } from "./bootstrap/production.js";
import { serveAgent } from "./serve.js";

const manager = bootstrapProductionRuntime();

serveAgent(manager).catch((err) => {
  console.error("[agent-service] fatal:", err);
  process.exit(1);
});
