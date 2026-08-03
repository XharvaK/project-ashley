# Ashley Architecture Index

Nuclear-only Discord runtime.

## Production (Mint)

Two processes: `agent-service` (:3710) + `discord-bot` (gateway).

```
Discord DM → /chat/text → AshleyCore (Identity → State → Agency → Conversation)
Proactive tick → Agency.decide → draft → commit
Curiosity feed → nuclear.db takes → Agency motivations
```

SQLite: `~/.composer-assistant/conversations/nuclear.db`.

## Module tree

`apps/agent-service/src/core/` — identity, state, memory, curiosity, agency, honesty, conversation, writers, runtime.

Shared utils: `apps/agent-service/src/lib/` (feed-parse, typography, metadata-echo, strip-markers).

Retired: voice, Telegram, habits, Moltbook, skills, legacy ChatService / `index.db` writers.

## Observability

- `GET /health` → `nuclear` block
- `GET /nuclear/decisions?owner_id=` → recent `decision_log` rows
