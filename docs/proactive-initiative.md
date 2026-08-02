# Proactive Initiative — Design

## Goal

Ashley messages first when she has something to say. Volume is capped, but the
binding constraint is material, not permission: there is no filler path, so an
empty queue means silence.

## Doc preferences

- **Surface:** DM only
- **Cadence:** up to 8 a day, in bursts rather than on a metronome
- **Hours:** `QUIET_HOURS_START`–`QUIET_HOURS_END` in `DOC_TIMEZONE`, enforced
- **Rollback:** `PROACTIVE_ENABLED=false`, `/proactive pause`, or a bare "stop" in chat

## Pipeline

1. **Scheduler** (discord-bot, every `PROACTIVE_CHECK_INTERVAL_MIN` minutes)
2. **Gate** (`initiative/schedule.ts`, deterministic, no LLM) — own-time/Sleep
   suppress (`PROACTIVE_SLEEP_SUPPRESS_HOURS` after any explicit sign-off like
   `gn`, `going to bed`, or `ill be sleeping now`), local daily cap, silence
   backoff (max unanswered 3, burstMax=1 while ignored), burst rhythm, idle floor
3. **Material queue** (`initiative/queue.ts`) — candidates from reading
   assignments, open threads, watches, curiosity takes (Doc-tied lane A/B or
   orphan lane C ≤2/day), stances, facts, and honest `check_in` presence; nothing
   under `PROACTIVE_MIN_SCORE` may interrupt him. Any non-orphan candidate (a
   reading assignment, an open thread, a lane A/B take) beats an orphan feed
   take — a strong pending task is never pushed aside by the day's weakest read
4. **Draft** (`mistral-medium-latest`, `proactive-companion.md`) — wording only,
   provenance for curiosity, language lock with force-EN after one regen. Feeds,
   formats, and specs are her own: the stake for toolchain takes must be first
   person ("my feeds kept breaking, so I'm switching to Atom"), never advice a
   Doc-side problem invented for his benefit
5. **Reserve, send, commit** — the log row is flagged on the send, so a lost
   commit cannot double-fire after a restart

Candidate kinds, roughly ranked: `reading_assignment`, then all open-thread /
obligation kinds (`she_owes`, `time_anchored`, `he_never_answered`),
`return_digest`, `watch_fired`, lane A/B `curiosity_take`, `stance`, `callback`,
lane C orphan `curiosity_take`, `check_in` (presence).

A `return_digest` knits several own-time drafts (notes she wrote while Doc was
asleep/AFK) into a single self-contained DM instead of a drip, and consumes the
drafted notes on send so they never leak out again.

## API

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/initiative/evaluate` | `{ userId }` | `{ shouldReachOut, reason, angle?, cooldownRemainingSec }` |
| POST | `/initiative/tick` | `{ userId }` | `{ shouldSend, text?, threadId?, angle?, materialKey?, reservationId? }` |
| POST | `/initiative/commit` | `{ userId, ...draft, discordMessageId }` | `{ ok }` |
| POST | `/initiative/abort` | `{ userId, reservationId }` | `{ ok }` |
| GET | `/initiative/status?owner_id=` | — | `{ enabled, sentToday, lastSentAt, lastUserMessageAt, paused }` |

## DB

- `mem_initiative_log` (v8 adds `material_key`, `candidate_kind`, `feedback`):
  `material_key` is what stops the same open thread or take going out twice.
- `mem_open_threads` (v8): unfinished business, closed as soon as either of them
  comes back to it.

## Env

```
PROACTIVE_ENABLED=true
PROACTIVE_MAX_PER_DAY=10
PROACTIVE_MIN_IDLE_HOURS=2
PROACTIVE_MIN_SCORE=20
PROACTIVE_BURST_MAX=3
PROACTIVE_BURST_GAP_MINUTES=12
PROACTIVE_BURST_REST_MINUTES=150
PROACTIVE_MAX_UNANSWERED=4
PROACTIVE_NUDGE_CAP_BACKOFF_HOURS=4
PROACTIVE_SLEEP_SUPPRESS_HOURS=6
PROACTIVE_ORPHAN_MAX_PER_DAY=2
PROACTIVE_AFFINITY_MIN_TOKENS=3
PROACTIVE_SESSION_WINDOW_HOURS=3
PROACTIVE_NUDGE_IDLE_MINUTES=25
DOC_TIMEZONE=Europe/Istanbul
```

