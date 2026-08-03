import express from "express";
import cors from "cors";
import type { Server } from "node:http";
import { AgentManager } from "./agent.js";
import { env } from "./env.js";
import { toErrorResponse, AppError } from "./errors.js";
import { listRecentDecisions } from "./core/agency/log.js";
import { retrieveEpisodes } from "./core/memory/episodes.js";

const MAX_DISCORD_MESSAGE = 4000;

function requireOwner(userId: string | undefined): string {
  if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {
    throw new AppError("forbidden", "Forbidden", 403);
  }
  return userId;
}

function gone(_req: express.Request, res: express.Response): void {
  res.status(410).json({
    error: "retired",
    code: "endpoint_retired",
    message: "Voice, Telegram, habits, and network skills were retired.",
  });
}

export function createServer(manager: AgentManager): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      ready: manager.getState() === "ready" || manager.getState() === "busy",
      state: manager.getState(),
      uptimeSec: manager.getUptimeSec(),
      mistralConfigured: manager.isMistralConfigured(),
      nuclear: manager.core.getHealth(),
      proactive: {
        enabled: env.proactiveEnabled,
        nuclear: true,
      },
    });
  });

  app.get("/nuclear/decisions", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 20) || 20);
      res.json({
        nuclear: true,
        decisions: listRecentDecisions(manager.core.getDatabase(), ownerId, limit),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/reflections", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 20) || 20);
      res.json(manager.core.getReflections(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/episodes", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(20, Number(req.query.limit ?? 10) || 10);
      res.json({
        mode: env.cognitionMode,
        episodes: retrieveEpisodes(
          manager.core.getDatabase(),
          ownerId,
          String(req.query.query ?? ""),
          limit,
        ),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/cognition", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getCognitionOverview(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/capabilities", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.getCapabilities());
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/capabilities/evaluation", (req, res) => {
    try {
      const { userId, capability, seeds, passed, sourceKey } = req.body as {
        userId?: string;
        capability?: string;
        seeds?: number;
        passed?: boolean;
        sourceKey?: string;
      };
      requireOwner(userId);
      if (
        typeof capability !== "string" ||
        typeof seeds !== "number" ||
        typeof passed !== "boolean" ||
        typeof sourceKey !== "string" ||
        !sourceKey.trim()
      ) {
        throw new AppError("message_required", "evaluation fields required", 400);
      }
      res.json(manager.core.recordCapabilityEvaluation({
        capability,
        seeds,
        passed,
        sourceKey,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/revisions", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
      res.json(manager.core.getRevisions(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/revisions/revert", (req, res) => {
    try {
      const { userId, revisionId } = req.body as {
        userId?: string;
        revisionId?: number;
      };
      const ownerId = requireOwner(userId);
      if (typeof revisionId !== "number") {
        throw new AppError("message_required", "revisionId required", 400);
      }
      res.json({ reverted: manager.core.revertRevision(ownerId, revisionId) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/nuclear/identity/reviews", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
      res.json(manager.core.getIdentityReviews(ownerId, limit));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/reviews/ashley", (req, res) => {
    try {
      const { userId, reviewId, position, rationale, evidenceType, evidenceId } = req.body as {
        userId?: string;
        reviewId?: number;
        position?: "affirm" | "object" | "defer";
        rationale?: string;
        evidenceType?: string;
        evidenceId?: string | number;
      };
      const ownerId = requireOwner(userId);
      if (
        typeof reviewId !== "number" ||
        !position || !["affirm", "object", "defer"].includes(position) ||
        typeof rationale !== "string" || !rationale.trim() ||
        typeof evidenceType !== "string" || evidenceId == null
      ) {
        throw new AppError("message_required", "grounded Ashley review fields required", 400);
      }
      res.json(manager.core.recordAshleyIdentityPosition({
        ownerId, reviewId, position, rationale, evidenceType, evidenceId,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/nuclear/identity/reviews/doc", (req, res) => {
    try {
      const { userId, reviewId, decision, rationale } = req.body as {
        userId?: string;
        reviewId?: number;
        decision?: "approve" | "reject" | "defer";
        rationale?: string;
      };
      const ownerId = requireOwner(userId);
      if (
        typeof reviewId !== "number" ||
        !decision || !["approve", "reject", "defer"].includes(decision)
      ) {
        throw new AppError("message_required", "Doc review fields required", 400);
      }
      res.json(manager.core.recordDocIdentityDecision({
        ownerId, reviewId, decision, rationale,
      }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/sessions", (_req, res) => {
    res.json({ activeSessionId: null });
  });

  app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const client = {
      write: (data: object) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      },
    };
    manager.addSseClient(client);
    req.on("close", () => manager.removeSseClient(client));
  });

  app.post("/session/start", (_req, res) => {
    res.json({ sessionId: manager.startSession() });
  });

  app.post("/chat", gone);

  app.post("/chat/text", async (req, res) => {
    try {
      const {
        message,
        userId,
        channel,
        threadId,
        auditSessionId,
        discordPresence,
      } = req.body as {
        message?: string;
        userId?: string;
        channel?: string;
        threadId?: string;
        auditSessionId?: string;
        discordPresence?: string;
      };
      const owner = requireOwner(userId);
      if (!message?.trim()) {
        throw new AppError("message_required", "message required", 400);
      }
      if (message.length > MAX_DISCORD_MESSAGE) {
        throw new AppError("message_too_long", "message too long", 400);
      }
      const result = await manager.handleTextChat(
        message.trim(),
        owner,
        channel ?? "discord",
        threadId,
        auditSessionId,
        undefined,
        discordPresence,
      );
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/chat/preflight", (req, res) => {
    try {
      const { message } = req.body as { message?: string };
      const text = message?.trim() ?? "";
      if (!text) throw new AppError("message_required", "message required", 400);
      res.json({ lookup: manager.core.lookupPreflight(text) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/signals/reaction", (req, res) => {
    try {
      const { userId, messageId, emoji } = req.body as {
        userId?: string;
        messageId?: string;
        emoji?: string;
      };
      const owner = requireOwner(userId);
      if (!messageId?.trim() || !emoji?.trim()) {
        throw new AppError("message_required", "messageId and emoji required", 400);
      }
      res.json(
        manager.core.recordReaction(owner, {
          messageId: messageId.trim(),
          emoji: emoji.trim(),
        }),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/signals/gif-feedback", (req, res) => {
    try {
      const { userId, query, success } = req.body as {
        userId?: string;
        query?: string;
        success?: boolean;
      };
      const owner = requireOwner(userId);
      manager.core.recordGifFeedback(owner, {
        query: (query ?? "").trim().slice(0, 200),
        success: success === true,
      });
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/signals/gif-queries", (req, res) => {
    try {
      const ownerId =
        typeof req.query.owner_id === "string"
          ? req.query.owner_id
          : env.discordOwnerId;
      requireOwner(ownerId || undefined);
      res.json({
        queries: manager.core.listSuccessfulGifQueries(ownerId!),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/signals/emoji-weight", (req, res) => {
    try {
      const { userId, emoji, context, positive } = req.body as {
        userId?: string;
        emoji?: string;
        context?: string;
        positive?: boolean;
      };
      const owner = requireOwner(userId);
      if (!emoji?.trim() || !context?.trim()) {
        throw new AppError("message_required", "emoji and context required", 400);
      }
      const weight = manager.core.recordEmojiWeight(
        owner,
        emoji.trim().slice(0, 32),
        context.trim().slice(0, 64),
        positive === true,
      );
      res.json({ ok: true, weight });
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
      const owner = requireOwner(userId);
      if (!text?.trim()) {
        throw new AppError("message_required", "text required", 400);
      }
      const fact = manager.core.pinMemory(
        owner,
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
      requireOwner(ownerId || undefined);
      res.json(
        manager.core.getMemorySummary(
          ownerId,
          req.query.include_private === "true",
        ),
      );
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/memory/newthread", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      res.json({ threadId: manager.core.newThread(owner) });
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
      const owner = requireOwner(userId);
      if (!topic?.trim()) {
        throw new AppError("message_required", "topic required", 400);
      }
      res.json(manager.core.forget(owner, topic.trim(), confirmed === true));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/debug/memory-context", (req, res) => {
    if (env.nodeEnv === "production") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const ownerId = String(req.query.owner_id ?? "");
      const message = String(req.query.message ?? "");
      requireOwner(ownerId || undefined);
      res.json(manager.core.debugMemoryContext(ownerId, message));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/cancel", (_req, res) => {
    manager.cancel();
    res.json({ ok: true });
  });

  app.post("/curiosity/tick", async (_req, res) => {
    try {
      const ownerId = env.memoryOwnerId || env.discordOwnerId || "default";
      const result = await manager.core.runCuriosityTick(ownerId);
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/curiosity/status", (req, res) => {
    try {
      const ownerId =
        typeof req.query.owner_id === "string"
          ? req.query.owner_id
          : env.memoryOwnerId || env.discordOwnerId || "default";
      res.json(manager.core.getCuriosityStatus(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/tick", async (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      res.json(await manager.core.tickProactive(owner));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/commit", async (req, res) => {
    try {
      const body = req.body as {
        userId?: string;
        reservationId?: number;
        text?: string;
        threadId?: string;
        angle?: string;
        discordMessageId?: string;
      };
      const owner = requireOwner(body.userId);
      if (body.reservationId !== undefined) {
        manager.core.commitProactive(owner, {
          reservationId: body.reservationId,
          text: body.text ?? "",
          threadId: body.threadId ?? "",
          angle: body.angle ?? "check_in",
          reason: "commit",
          discordMessageId: body.discordMessageId ?? "",
        });
      } else if (body.text && body.threadId && body.discordMessageId) {
        manager.core.commitProactive(owner, {
          text: body.text,
          threadId: body.threadId,
          angle: body.angle ?? "check_in",
          reason: "commit",
          discordMessageId: body.discordMessageId,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/abort", (req, res) => {
    try {
      const { userId, reservationId } = req.body as {
        userId?: string;
        reservationId?: number;
      };
      const owner = requireOwner(userId);
      if (typeof reservationId === "number") {
        manager.core.abortProactive(owner, reservationId);
      }
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/pause", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      manager.core.pauseProactive(owner);
      res.json({ ok: true, paused: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/resume", (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      manager.core.resumeProactive(owner);
      res.json({ ok: true, paused: false });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/evaluate", async (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      const result = await manager.core.evaluateProactive(owner);
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/initiative/generate", async (req, res) => {
    try {
      const { userId } = req.body as { userId?: string };
      const owner = requireOwner(userId);
      const result = await manager.core.generateProactive(owner);
      if (!result.shouldSend) {
        throw new AppError("initiative_skipped", result.reason, 409);
      }
      res.json(result);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/initiative/status", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        if (!ownerId || (env.discordOwnerId && ownerId !== env.discordOwnerId)) {
          throw new AppError("forbidden", "Forbidden", 403);
        }
      }
      res.json(manager.core.getProactiveStatus(ownerId));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/initiative/urgent", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      requireOwner(ownerId || undefined);
      res.json({ urgent: manager.core.hasUrgentCognition(ownerId) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/habits/upsert", gone);
  app.get("/habits/list", gone);
  app.post("/habits/pause", gone);
  app.post("/reminders/create", gone);
  app.post("/scheduler/tick", gone);
  app.post("/scheduler/commit", gone);
  app.post("/actions/propose", gone);
  app.post("/actions/resolve", gone);

  app.post("/pause", async (_req, res) => {
    await manager.pause();
    res.json({ ok: true });
  });

  app.post("/resume", async (_req, res) => {
    await manager.resume();
    res.json({ ok: true });
  });

  app.post("/shutdown", async (_req, res) => {
    await manager.shutdown();
    res.json({ ok: true });
  });

  return app;
}

export function listen(app: express.Express): Server {
  return app.listen(env.agentPort, env.agentBindHost, () => {
    console.log(
      `[agent-service] listening on http://${env.agentBindHost}:${env.agentPort}`,
    );
  });
}
