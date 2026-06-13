import express from "express";

import cors from "cors";

import type { Server } from "node:http";

import { AgentManager } from "./agent.js";

import { env } from "./env.js";

import { toErrorResponse, AppError } from "./errors.js";



const MAX_DISCORD_MESSAGE = 4000;



export function createServer(manager: AgentManager): express.Application {

  const app = express();

  app.use(cors());

  app.use(express.json({ limit: "2mb" }));



  app.get("/health", (_req, res) => {

    const state = manager.getState();
    const mem = manager.chat.getMemoryHealth();

    res.json({

      ready: state === "ready" || state === "busy",

      state,

      mistral: {

        configured: manager.isMistralConfigured(),

        model: env.mistralModel,

      },

      memory: {
        enabled: env.autoRememberEnabled,
        ok: mem.ok,
        db: mem.ok ? "ok" : "error",
        jobsPending: mem.jobsPending,
        jobsPendingByType: mem.jobsPendingByType,
        jobsRunning: mem.jobsRunning,
        jobsStuck: mem.jobsStuck,
        jobsFailed: mem.jobsFailed,
        jobsDone: mem.jobsDone,
        lastJobError: mem.lastJobError,
        metrics: mem.metrics,
        pendingAlertThreshold: mem.pendingAlertThreshold,
      },

      proactive: {
        enabled: env.proactiveEnabled,
      },

      uptimeSec: manager.getUptimeSec(),

    });

  });



  app.get("/sessions", (_req, res) => {

    res.json({ sessions: manager.logger.listSessions() });

  });



  app.get("/events", (req, res) => {

    res.setHeader("Content-Type", "text/event-stream");

    res.setHeader("Cache-Control", "no-cache");

    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();



    const client = {

      write: (data: object) => {

        res.write(`data: ${JSON.stringify(data)}\n\n`);

      },

    };

    manager.addSseClient(client);

    client.write({ type: "connected", state: manager.getState() });



    req.on("close", () => manager.removeSseClient(client));

  });



  app.post("/session/start", (_req, res) => {

    const sessionId = manager.startSession();

    res.json({ sessionId });

  });



  app.post("/ui-state", (req, res) => {

    const { state, label } = req.body as { state?: string; label?: string };

    if (state && label) {

      manager.broadcast({ type: "assistant-state", state, label });

    }

    res.json({ ok: true });

  });



  app.post("/chat", async (req, res) => {

    const { transcript, sessionId } = req.body as {

      transcript?: string;

      sessionId?: string;

    };

    if (!transcript?.trim()) {

      res.status(400).json({ error: "transcript required", code: "message_required" });

      return;

    }

    const sid = sessionId ?? manager.startSession();



    try {

      await manager.handleChat(transcript, sid, async (pcm, sampleRate) => {

        manager.broadcast({

          type: "audio",

          sessionId: sid,

          pcm: Buffer.from(pcm).toString("base64"),

          sampleRate: sampleRate ?? 24000,

        });

      });

      res.json({ sessionId: sid, ok: true });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/chat/text", async (req, res) => {

    try {

      const { message, channel, userId, threadId, auditSessionId } =

        req.body as {

          message?: string;

          channel?: string;

          userId?: string;

          threadId?: string;

          auditSessionId?: string;

        };



      if (channel !== "discord" && channel !== "voice") {

        throw new AppError(
          "invalid_channel",
          "channel must be discord or voice",
          400,
        );

      }

      if (!userId?.trim()) {

        throw new AppError("forbidden", "userId required", 403);

      }

      const text = message?.trim() ?? "";

      if (!text) {

        throw new AppError("message_required", "message required", 400);

      }

      if (text.length > MAX_DISCORD_MESSAGE) {

        throw new AppError("message_too_long", "message too long", 413);

      }



      const result = await manager.handleTextChat(

        text,

        userId,

        threadId,

        auditSessionId,

      );

      res.json({

        text: result.text,

        threadId: result.threadId,

        model: result.model,

        memoryDigest: result.memoryDigest,

        usage: { promptTokens: 0, completionTokens: 0 },

      });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/memory/pin", (req, res) => {

    try {

      const { userId, text, sensitivity } = req.body as {

        userId?: string;

        text?: string;

        sensitivity?: "none" | "private";

      };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      if (!text?.trim()) {

        throw new AppError("message_required", "text required", 400);

      }

      const fact = manager.chat.pinMemory(

        userId,

        text.trim(),

        sensitivity ?? "none",

      );

      res.json({ ok: true, fact });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.get("/memory/summary", (req, res) => {

    try {

      const ownerId = String(req.query.owner_id ?? "");

      const includePrivate = req.query.include_private === "true";

      if (!ownerId || (env.discordOwnerId && ownerId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      res.json(manager.chat.getMemorySummary(ownerId, includePrivate));

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/memory/newthread", (req, res) => {

    try {

      const { userId } = req.body as { userId?: string };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      const threadId = manager.chat.newThread(userId);

      res.json({ threadId });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/memory/forget", (req, res) => {

    try {

      const { userId, topic, confirmed } = req.body as {

        userId?: string;

        topic?: string;

        confirmed?: boolean;

      };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      if (!topic?.trim()) {

        throw new AppError("message_required", "topic required", 400);

      }

      const result = manager.chat.forget(

        userId,

        topic.trim(),

        confirmed === true,

      );

      res.json(result);

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.get("/debug/memory-context", async (req, res) => {

    if (env.nodeEnv === "production") {

      res.status(404).json({ error: "not found" });

      return;

    }

    const host = req.socket.remoteAddress;

    if (host !== "127.0.0.1" && host !== "::1" && host !== "::ffff:127.0.0.1") {

      res.status(403).json({ error: "localhost only" });

      return;

    }

    const ownerId = String(req.query.owner_id ?? env.memoryOwnerId);
    const userMessage = req.query.message
      ? String(req.query.message)
      : undefined;
    const channel =
      req.query.channel === "voice" ? ("voice" as const) : ("discord" as const);

    const data = await manager.chat.getDebugContext(
      ownerId,
      userMessage,
      channel,
    );
    res.json(data);

  });



  app.post("/cancel", async (_req, res) => {

    await manager.cancelActiveRun();

    res.json({ ok: true });

  });



  app.post("/initiative/tick", async (req, res) => {

    try {

      const { userId } = req.body as { userId?: string };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      const result = await manager.chat.tickInitiative(userId);

      res.json(result);

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/initiative/commit", async (req, res) => {

    try {

      const { userId, text, threadId, angle, reason, discordMessageId } =
        req.body as {
          userId?: string;
          text?: string;
          threadId?: string;
          angle?: "question" | "opinion" | "check_in";
          reason?: string;
          discordMessageId?: string;
        };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      if (!text?.trim() || !threadId || !discordMessageId?.trim()) {

        throw new AppError(
          "message_required",
          "text, threadId, and discordMessageId required",
          400,
        );

      }

      manager.chat.commitInitiative(
        userId,
        {
          text: text.trim(),
          threadId,
          angle: angle ?? "check_in",
          reason: reason ?? "committed",
        },
        discordMessageId.trim(),
      );

      res.json({ ok: true });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/initiative/pause", (req, res) => {

    try {

      const { userId } = req.body as { userId?: string };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      manager.chat.setProactivePaused(userId, true);

      res.json({ ok: true, paused: true });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/initiative/resume", (req, res) => {

    try {

      const { userId } = req.body as { userId?: string };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      manager.chat.setProactivePaused(userId, false);

      res.json({ ok: true, paused: false });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/initiative/evaluate", async (req, res) => {

    try {

      const { userId } = req.body as { userId?: string };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      const result = await manager.chat.evaluateInitiative(userId);

      res.json(result);

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/initiative/generate", async (req, res) => {

    try {

      const { userId, angle, reason } = req.body as {

        userId?: string;

        angle?: "question" | "opinion" | "check_in";

        reason?: string;

      };

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      const evalResult = await manager.chat.evaluateInitiative(userId);

      if (!evalResult.shouldReachOut) {

        throw new AppError(

          "initiative_skipped",

          evalResult.reason,

          409,

        );

      }

      const result = await manager.chat.generateInitiativeMessage(

        userId,

        angle ?? evalResult.angle ?? "check_in",

        reason ?? evalResult.reason,

      );

      res.json(result);

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.get("/initiative/status", (req, res) => {

    try {

      const ownerId = String(req.query.owner_id ?? "");

      if (!ownerId || (env.discordOwnerId && ownerId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      res.json(manager.chat.getInitiativeStatus(ownerId));

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/pause", async (_req, res) => {

    await manager.pause();

    res.json({ ok: true, state: manager.getState() });

  });



  app.post("/resume", async (_req, res) => {

    await manager.resume();

    res.json({ ok: true, state: manager.getState() });

  });



  app.post("/shutdown", async (_req, res) => {

    await manager.shutdown();

    res.json({ ok: true });

    setTimeout(() => process.exit(0), 100);

  });



  return app;

}



export function listen(app: express.Application): Server {

  return app.listen(env.agentPort, env.agentBindHost, () => {

    console.log(`[agent-service] http://${env.agentBindHost}:${env.agentPort}`);

  });

}


