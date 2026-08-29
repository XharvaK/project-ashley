import express from "express";
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createCognitiveIngressHandler } from "./http.js";
import { openTestSidecar } from "../test-support.js";
import { openNuclearDb } from "../../db.js";
import { createIsolatedDataPlane } from "../../data-plane.js";

describe("v0.2.1 durable ingress", () => {
  it("returns 202 and persists two messages without invoking Thought", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    const app = express();
    app.use(express.json());
    app.post("/chat/ingress", createCognitiveIngressHandler({
      sidecar,
      nuclearDb: nuclear,
      authorizeOwner: () => undefined,
    }));
    const server = app.listen(0);
    try {
      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("address_missing");
      const url = `http://127.0.0.1:${address.port}/chat/ingress`;
      const first = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "doc", message: "first", discordMessageIds: ["d1"] }) });
      const second = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "doc", message: "second", discordMessageIds: ["d2"] }) });
      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM conversation_evidence_log").get()).toMatchObject({ count: 2 });
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM inbox_events").get()).toMatchObject({ count: 2 });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      nuclear.close();
      sidecar.close();
    }
  });
});
