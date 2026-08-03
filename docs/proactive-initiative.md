# Proactive messages (nuclear)

Ashley messages first when Agency decides she has something to say. Empty material means silence — no filler path.

## Surface

- Discord DM only
- Cap: `PROACTIVE_MAX_PER_DAY`, idle floor: `PROACTIVE_MIN_IDLE_HOURS`
- Disable: `PROACTIVE_ENABLED=false`, `/proactive pause`, or ask her to stop

## Pipeline

1. **Scheduler** — Discord bot polls every `PROACTIVE_CHECK_INTERVAL_MIN` minutes (`apps/discord-bot/src/initiative/scheduler.ts`)
2. **Decide** — `AshleyCore.tickProactive` → Agency motivations + `decide`
3. **Reserve** — row in `initiative_reservations` (wire shape kept for the bot)
4. **Send** — bot DMs bubbles, then `/initiative/commit` (or abort on failure)

## Observability

- `GET /initiative/status?owner_id=`
- `GET /nuclear/decisions?owner_id=`
- `GET /health` → `proactive` block

See [Architecture_Index.md](Architecture_Index.md).
