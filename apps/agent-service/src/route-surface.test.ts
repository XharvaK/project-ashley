import express from "express";
import { describe, expect, it } from "vitest";
import { AgentManager } from "./agent.js";
import { assertRegisteredRoutes, routeSurface } from "./route-surface.js";
import { createServer } from "./server.js";
import { env } from "./env.js";
import type { Server } from "node:http";

async function startTestServer(app: express.Express): Promise<{ server: Server; url: string }> {
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test_server_address_unavailable");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

describe("route surface registry", () => {
  it("accepts an app whose registered routes match the registry", () => {
    const app = express();
    for (const entry of routeSurface) {
      const handler = (_req: express.Request, res: express.Response) => {
        res.status(entry.lifecycle === "retired" ? 410 : 200).end();
      };
      if (entry.method === "GET") app.get(entry.path, handler);
      else if (entry.method === "POST") app.post(entry.path, handler);
      else if (entry.method === "PUT") app.put(entry.path, handler);
      else if (entry.method === "PATCH") app.patch(entry.path, handler);
      else app.delete(entry.path, handler);
    }
    expect(() => assertRegisteredRoutes(app)).not.toThrow();
  });

  it("rejects route drift", () => {
    const app = express();
    app.get("/health", (_req, res) => res.end());
    expect(() => assertRegisteredRoutes(app)).toThrow(/route_surface_drift/);
  });

  it("keeps the live server registration aligned with the registry", () => {
    expect(() => createServer({} as AgentManager)).not.toThrow();
  });

  it("routes explicit C5 admission through the owner-authenticated runtime seam", async () => {
    const ownerId = env.discordOwnerId || "route-test-owner";
    let captured: Record<string, unknown> | null = null;
    const manager = {
      core: {
        recordC5AshleySelfCommitment(input: Record<string, unknown>) {
          captured = input;
          return { entityUuid: "c5-route-fixture" };
        },
      },
    } as unknown as AgentManager;
    const { server, url } = await startTestServer(createServer(manager));
    try {
      const denied = await fetch(`${url}/nuclear/relationship/c5`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "self_commitment" }),
      });
      expect(denied.status).toBe(403);

      const response = await fetch(`${url}/nuclear/relationship/c5`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: ownerId,
          operation: "self_commitment",
          text: "Ashley will keep this bounded.",
          sourceEntityType: "decision",
          sourceEntityUuid: "decision:route-fixture",
          decisionId: 1,
          evidenceRefs: [{ type: "decision", id: 1 }],
          classification: "ordinary",
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        operation: "self_commitment",
        result: { entityUuid: "c5-route-fixture" },
      });
      expect(captured).toMatchObject({
        ownerId,
        hostValidationOk: true,
      });
      expect(captured).not.toHaveProperty("capabilityMode");
    } finally {
      await stopTestServer(server);
    }
  });
});
