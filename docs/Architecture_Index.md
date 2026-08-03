# Ashley Architecture Index

Nuclear-only Discord runtime.

## Production (Mint)

Two processes: `agent-service` (:3710) + `discord-bot` (gateway).

```
Discord DM → /chat/text → AshleyCore (Identity → State → Agency → Conversation)
Proactive tick → Agency.decide → draft → commit
Curiosity feed → nuclear.db takes → Agency motivations
Committed proactive reaction → Reflection → bounded future Thought calibration
Completed exchange → durable cognition job → episode → Mind State / affect / learning proposal
Urgent concern or commitment → Discord wake poll → normal Agency send pipeline
```

SQLite: `~/.composer-assistant/conversations/nuclear.db`.

## Module tree

`apps/agent-service/src/core/` — identity, state, memory, cognition, learning,
curiosity, agency, reflection, honesty, conversation, writers, runtime.

Schema v9 adds grounded episodes with FTS5 retrieval, referenced Mind State
items, bounded affect, durable cognition jobs/runs, verified fact provenance,
edge-triggered urgent wake leases, Thought fallback auditing, and exact organic
revision lineage. Cognition integration is atomic: a completed job produces one
complete episode and all of its derived state, or none of them.
`ASHLEY_COGNITION_MODE=observe` records evidence and proposals without allowing
behavioral influence. `apply` is the master ceiling; release-scoped capability
states, dependencies, evaluation qualification, live-shadow thresholds, and
rollback still govern the full loop.

Reactive refusal is a distinct Thought decision. It is valid only when the
selected evidence contains the current user message and a persisted stable
boundary, and only while the `refusal` capability may influence behavior.
Silence, delay, challenge, and refusal remain separate decisions.

Feed scans store attention candidates only. `cur_reads` is the sole evidence
source for claims that Ashley read an article. Owner-confirmed forgetting
redacts matching source messages, removes FTS and evidence paths, reconciles
derived state, and records content-free receipts.

Full reading uses public-network validation on every DNS resolution and
redirect, bounded retrieval, deterministic extraction, hashed read records,
and restart-safe `consolidate_curiosity` jobs. Consolidation treats retrieved
text as untrusted evidence and may create only evidence-linked takes,
questions, interests, opinions, and source proposals. Source proposals require
three successful probation parses before activation. Agency alone decides
whether grounded material deserves an interruption.

Shared utils: `apps/agent-service/src/lib/` (feed-parse, typography, metadata-echo, strip-markers).

Retired: voice, Telegram, habits, Moltbook, skills, legacy ChatService / `index.db` writers.

## Observability

- `GET /health` → `nuclear` block
- `GET /nuclear/decisions?owner_id=` → recent `decision_log` rows
- `GET /nuclear/reflections?owner_id=` → immutable evidence + current proactive calibration
- `GET /nuclear/episodes?owner_id=&query=` → grounded episodic recall
- `GET /nuclear/cognition?owner_id=` → affect, urgency, jobs, and runs
- `GET /nuclear/capabilities?owner_id=` → release gates, evidence, and rollback
- `GET /nuclear/revisions?owner_id=` → proposed/applied identity and opinion growth
- `POST /nuclear/revisions/revert` → restore the prior value for one applied revision
- `GET /nuclear/identity/reviews?owner_id=` → separate Ashley and Doc positions
- `POST /nuclear/identity/reviews/ashley` → evidence-grounded Ashley position
- `POST /nuclear/identity/reviews/doc` → owner-authorized Doc decision

## Review

- [Architecture Review Protocol](Architecture_Review_Protocol.md) — informational mirror; binding audit plan is normative
