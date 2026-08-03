# Ashley Architecture Index

Authority: `Ashley_Core_Principles.md` → `Ashley_Constitution.md` → `Ashley_Glossary.md` → `Ashley_Design_Patterns.md`.

## Production (Mint)

Two processes: `agent-service` (:3710) + `discord-bot` (gateway).

Nuclear path (default `ASHLEY_NUCLEAR=true`):

```
Discord DM → /chat/text → AshleyCore (Identity → State → Agency → Conversation)
Proactive tick → Agency.decide → draft → commit
Curiosity feed → nuclear.db takes → Agency motivations
```

Clean SQLite: `~/.composer-assistant/conversations/nuclear.db` (no migration from `index.db`).

## Module tree

`apps/agent-service/src/core/` — identity, state, memory, curiosity, agency, honesty, conversation, runtime.

Legacy `chat-service` + Moltbook/Telegram/voice loops are quarantined when nuclear is on.

## Observability

- `GET /health` → `nuclear` block
- `GET /nuclear/decisions?owner_id=` → recent `decision_log` rows
