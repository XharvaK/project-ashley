import express from "express";

import cors from "cors";

import type { Server } from "node:http";

import { AgentManager } from "./agent.js";

import { env } from "./env.js";

import { toErrorResponse, AppError } from "./errors.js";

import {
  createReminder,
  draftHabitNudge,
  listDueSchedulerItems,
  listHabits,
  markHabitFired,
  markReminderSent,
  pauseHabit,
  upsertHabit,
} from "./habits/scheduler.js";

import {
  createPendingAction,
  resolvePendingAction,
} from "./habits/actions.js";

import { runCuriosityTick } from "./curiosity/tick.js";

import { curiosityPresencePayload } from "./curiosity/presence-payload.js";
import { curiosityStats } from "./curiosity/store.js";
import {
  emojiWeight,
  listSuccessfulGifQueries,
  recordEmojiUse,
  recordGifFeedback,
} from "./discord-feedback.js";



const MAX_DISCORD_MESSAGE = 4000;

const MAX_IMAGES = 4;

/**
 * Mistral fetches these URLs server side, so anything that is not a plain https
 * link is a request to make the model fetch something on someone else's behalf.
 */
function parseImageUrls(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const urls = raw
    .filter((u): u is string => typeof u === "string")
    .filter((u) => {
      try {
        return new URL(u).protocol === "https:";
      } catch {
        return false;
      }
    })
    .slice(0, MAX_IMAGES);
  return urls.length > 0 ? urls : undefined;
}



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

      const {
        message,
        channel,
        userId,
        threadId,
        auditSessionId,
        imageUrls,
        discordPresence,
      } =

        req.body as {

          message?: string;

          channel?: string;

          userId?: string;

          threadId?: string;

          auditSessionId?: string;

          imageUrls?: unknown;

          discordPresence?: { status?: string; label?: string };

        };



      if (
        channel !== "discord" &&
        channel !== "voice" &&
        channel !== "telegram"
      ) {

        throw new AppError(
          "invalid_channel",
          "channel must be discord, voice, or telegram",
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

      const images = parseImageUrls(imageUrls);

      const presence =
        channel === "discord" &&
        (discordPresence?.status === "online" ||
          discordPresence?.status === "idle") &&
        typeof discordPresence.label === "string" &&
        discordPresence.label.trim()
          ? {
              status: discordPresence.status as "online" | "idle",
              label: discordPresence.label.trim().slice(0, 80),
            }
          : undefined;

      const result = await manager.handleTextChat(

        text,

        userId,

        threadId,

        auditSessionId,

        images,

        channel === "telegram" ? "telegram" : "discord",

        presence,

      );

      res.json({

        text: result.text,

        threadId: result.threadId,

        model: result.model,

        usage: { promptTokens: 0, completionTokens: 0 },

      });

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

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      if (!messageId?.trim() || !emoji?.trim()) {

        throw new AppError(
          "message_required",
          "messageId and emoji required",
          400,
        );

      }

      const result = manager.chat.recordReaction(userId, {
        messageId: messageId.trim(),
        emoji: emoji.trim().slice(0, 32),
      });

      res.json({ ok: true, ...result });

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });

  app.post("/signals/gif-feedback", (req, res) => {
    try {
      const { userId, query, gifUrl, reaction } = req.body as {
        userId?: string;
        query?: string;
        gifUrl?: string;
        reaction?: string | null;
      };
      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (!query?.trim() || !gifUrl?.trim()) {
        throw new AppError("message_required", "query and gifUrl required", 400);
      }
      recordGifFeedback(manager.chat.getDb(), userId, {
        query: query.trim(),
        gifUrl: gifUrl.trim(),
        reaction: reaction ?? null,
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
      if (!ownerId) throw new AppError("forbidden", "Forbidden", 403);
      res.json({
        queries: listSuccessfulGifQueries(manager.chat.getDb(), ownerId),
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
      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (!emoji?.trim() || !context?.trim()) {
        throw new AppError("message_required", "emoji and context required", 400);
      }
      const e = emoji.trim().slice(0, 32);
      const ctx = context.trim().slice(0, 64);
      recordEmojiUse(manager.chat.getDb(), e, ctx, positive === true);
      res.json({
        ok: true,
        weight: emojiWeight(manager.chat.getDb(), e, ctx),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });



  app.post("/chat/preflight", (req, res) => {

    try {

      const { message } = req.body as { message?: string };

      const text = message?.trim() ?? "";

      if (!text) {

        throw new AppError("message_required", "message required", 400);

      }

      res.json({ lookup: manager.chat.lookupPreflight(text) });

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



  app.post("/curiosity/tick", async (_req, res) => {

    try {

      const result = await runCuriosityTick(manager.chat.database);

      res.json(result);

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.get("/curiosity/status", (_req, res) => {
    try {
      const db = manager.chat.database;
      const ownerId = env.memoryOwnerId || env.discordOwnerId;
      res.json({
        enabled: env.curiosityEnabled,
        ...curiosityStats(db),
        presence: curiosityPresencePayload(db, ownerId, env.curiosityEnabled),
      });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
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

      const {
        userId,
        text,
        threadId,
        angle,
        reason,
        discordMessageId,
        materialKey,
        candidateKind,
        reservationId,
      } = req.body as {
        userId?: string;
        text?: string;
        threadId?: string;
        angle?: string;
        reason?: string;
        discordMessageId?: string;
        materialKey?: string;
        candidateKind?: string;
        reservationId?: number;
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
          angle: (angle ?? "check_in") as import("./initiative/queue.js").Angle,
          reason: reason ?? "committed",
          materialKey,
          candidateKind,
          reservationId,
        },
        discordMessageId.trim(),
      );

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

      if (!userId || (env.discordOwnerId && userId !== env.discordOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      if (!reservationId) {

        throw new AppError("message_required", "reservationId required", 400);

      }

      manager.chat.abortInitiative(userId, reservationId);

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

        angle?: string;

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

        (angle ?? evalResult.angle ?? "check_in") as import("./initiative/queue.js").Angle,

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

      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {

        throw new AppError("forbidden", "Forbidden", 403);

      }

      res.json(manager.chat.getInitiativeStatus(ownerId));

    } catch (err) {

      const { status, body } = toErrorResponse(err);

      res.status(status).json(body);

    }

  });



  app.post("/habits/upsert", (req, res) => {
    try {
      const body = req.body as {
        userId?: string;
        id?: number;
        name?: string;
        cronExpr?: string;
        promptText?: string;
        timezone?: string;
        enabled?: boolean;
      };
      const ownerId = body.userId?.trim() ?? "";
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (!body.name?.trim() || !body.cronExpr?.trim() || !body.promptText?.trim()) {
        throw new AppError("bad_request", "name, cronExpr, promptText required", 400);
      }
      const habit = upsertHabit(manager.chat.getDb(), {
        ownerId,
        id: body.id,
        name: body.name.trim(),
        cronExpr: body.cronExpr.trim(),
        promptText: body.promptText.trim(),
        timezone: body.timezone,
        enabled: body.enabled,
      });
      res.json({ ok: true, habit });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.get("/habits/list", (req, res) => {
    try {
      const ownerId = String(req.query.owner_id ?? "");
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      res.json({ habits: listHabits(manager.chat.getDb(), ownerId) });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/habits/pause", (req, res) => {
    try {
      const body = req.body as { userId?: string; habitId?: number };
      const ownerId = body.userId?.trim() ?? "";
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (body.habitId == null) {
        throw new AppError("bad_request", "habitId required", 400);
      }
      pauseHabit(manager.chat.getDb(), ownerId, body.habitId);
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/reminders/create", (req, res) => {
    try {
      const body = req.body as {
        userId?: string;
        text?: string;
        dueAt?: string;
        timezone?: string;
        channel?: string;
      };
      const ownerId = body.userId?.trim() ?? "";
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (!body.text?.trim() || !body.dueAt?.trim()) {
        throw new AppError("bad_request", "text and dueAt required", 400);
      }
      const reminder = createReminder(manager.chat.getDb(), {
        ownerId,
        text: body.text.trim(),
        dueAt: body.dueAt.trim(),
        timezone: body.timezone,
        channel: body.channel,
      });
      res.json({ ok: true, reminder });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/scheduler/tick", async (req, res) => {
    try {
      const body = req.body as { userId?: string };
      const ownerId = body.userId?.trim() ?? "";
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      const due = listDueSchedulerItems(manager.chat.getDb(), ownerId);
      const items: Array<{
        kind: "reminder" | "habit";
        id: number;
        text: string;
        channel: string;
      }> = [];
      for (const d of due) {
        let text = d.text;
        if (d.kind === "habit") {
          text = await draftHabitNudge(
            manager.chat.getAssembler(),
            ownerId,
            d.text,
          );
        }
        items.push({
          kind: d.kind,
          id: d.id,
          text,
          channel: d.channel,
        });
      }
      res.json({ items });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/scheduler/commit", (req, res) => {
    try {
      const body = req.body as {
        userId?: string;
        kind?: "reminder" | "habit";
        id?: number;
        externalMessageId?: string;
        text?: string;
      };
      const ownerId = body.userId?.trim() ?? "";
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (!body.kind || body.id == null || !body.externalMessageId) {
        throw new AppError(
          "bad_request",
          "kind, id, externalMessageId required",
          400,
        );
      }
      if (body.kind === "reminder") {
        markReminderSent(
          manager.chat.getDb(),
          body.id,
          body.externalMessageId,
        );
      } else {
        markHabitFired(
          manager.chat.getDb(),
          body.id,
          ownerId,
          body.text ?? "",
        );
      }
      res.json({ ok: true });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/actions/propose", (req, res) => {
    try {
      const body = req.body as {
        userId?: string;
        actionType?: "pin_fact" | "create_reminder" | "create_habit";
        payload?: unknown;
        channel?: string;
      };
      const ownerId = body.userId?.trim() ?? "";
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (!body.actionType || body.payload == null) {
        throw new AppError("bad_request", "actionType and payload required", 400);
      }
      const action = createPendingAction(manager.chat.getDb(), {
        ownerId,
        actionType: body.actionType,
        payload: body.payload,
        channel: body.channel,
      });
      res.json({ ok: true, action });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  });

  app.post("/actions/resolve", (req, res) => {
    try {
      const body = req.body as {
        userId?: string;
        actionId?: number;
        decision?: "approved" | "rejected";
      };
      const ownerId = body.userId?.trim() ?? "";
      if (!ownerId || (env.memoryOwnerId && ownerId !== env.memoryOwnerId)) {
        throw new AppError("forbidden", "Forbidden", 403);
      }
      if (body.actionId == null || !body.decision) {
        throw new AppError("bad_request", "actionId and decision required", 400);
      }
      const result = resolvePendingAction(
        manager.chat.getDb(),
        ownerId,
        body.actionId,
        body.decision,
      );
      if (!result.ok) {
        throw new AppError("bad_request", result.error ?? "resolve_failed", 400);
      }
      res.json(result);
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


