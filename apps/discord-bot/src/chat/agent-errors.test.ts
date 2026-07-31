import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentErrorMessage } from "./agent-errors.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

describe("agentErrorMessage", () => {
  it("never names agent-service or Mistral", () => {
    const codes = [
      "agent_not_ready",
      "mistral_unavailable",
      "rate_limited",
      "message_too_long",
      "forbidden",
      "chat_in_progress",
      "mystery",
    ];
    for (const code of codes) {
      const msg = agentErrorMessage(code, 12);
      assert.doesNotMatch(msg, /agent-service|Mistral|mistral/i);
    }
  });

  it("source file has no hardcoded Turkish-only user strings", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "agent-errors.ts"), "utf8");
    assert.doesNotMatch(src, /Not ettim|bir saniye|agent-service/);
  });
});
