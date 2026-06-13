# Proactive Initiative — Design

## Goal

Ashley sends unprompted DM messages when context warrants it — not on a fixed spam schedule.

## Doc preferences

- **Surface:** DM only
- **Cadence:** 3–4 per day max, min 2 hours since Doc's last message, min 2 hours between proactive sends
- **Hours:** 7/24 (no quiet hours)
- **Rollback:** `PROACTIVE_ENABLED=false` or `/proactive pause`

## Pipeline

1. **Scheduler** (discord-bot, every `PROACTIVE_CHECK_INTERVAL_MIN` minutes)
2. **Hard cooldown** (agent-service, no LLM) — idle time, daily cap, busy lock, cold start
3. **Soft gate** (`mistral-small-latest`, JSON) — is there enough context for a natural outreach?
4. **Generate** (`mistral-medium-latest`, `proactive-companion.md`) — one short message, persisted to `mem_messages` + `mem_initiative_log`

## API

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/initiative/evaluate` | `{ userId }` | `{ shouldReachOut, reason?, angle?, cooldownRemainingSec? }` |
| POST | `/initiative/generate` | `{ userId }` | `{ text, threadId, angle, reason }` |
| GET | `/initiative/status?owner_id=` | — | `{ enabled, sentToday, lastSentAt, lastUserMessageAt, paused }` |

## DB

`mem_initiative_log` (schema v2): owner_id, thread_id, angle, reason, message_text, discord_message_id, sent_at

## Env

```
PROACTIVE_ENABLED=true
PROACTIVE_MAX_PER_DAY=4
PROACTIVE_MIN_IDLE_HOURS=2
PROACTIVE_CHECK_INTERVAL_MIN=20
PROACTIVE_COLD_START_HOURS=24
MISTRAL_REASONING_EFFORT=none
MISTRAL_CHAT_TEMPERATURE=0.55
```
