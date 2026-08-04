import express from "express";
import { describe, expect, it } from "vitest";
import { AgentManager } from "./agent.js";
import { assertRegisteredRoutes, routeSurface } from "./route-surface.js";
import { createServer } from "./server.js";

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
});
