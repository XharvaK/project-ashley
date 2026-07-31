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
2. **Gate** (`initiative/schedule.ts`, deterministic, no LLM) — quiet hours,
   sleep suppress (6h after sign-off), local daily cap, silence backoff
   (max unanswered 2; burstMax=1 while ignored), burst rhythm, idle floor
3. **Material queue** (`initiative/queue.ts`) — candidates from open threads,
   watches, curiosity takes (Doc-tied lane B / orphan lane C ≤2/day), stances,
   facts, and honest `check_in` presence; nothing under `PROACTIVE_MIN_SCORE`
   may interrupt him
4. **Draft** (`mistral-medium-latest`, `proactive-companion.md`) — wording only,
   provenance for curiosity, language lock with force-EN after one regen
5. **Reserve, send, commit** — the log row is claimed before the send, so a lost
   commit cannot double-fire after a restart

Candidate kinds, ranked: `she_owes`, `time_anchored`, `he_never_answered`,
`watch_fired`, `curiosity_take`, `stance`, `callback`, `check_in` (presence).

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
PROACTIVE_MAX_PER_DAY=8
PROACTIVE_MIN_IDLE_HOURS=2
PROACTIVE_MIN_SCORE=20
PROACTIVE_BURST_MAX=3
PROACTIVE_BURST_GAP_MINUTES=12
PROACTIVE_BURST_REST_MINUTES=150
PROACTIVE_MAX_UNANSWERED=2
PROACTIVE_SLEEP_SUPPRESS_HOURS=6
PROACTIVE_ORPHAN_MAX_PER_DAY=2
PROACTIVE_AFFINITY_MIN_TOKENS=3
PROACTIVE_BACKOFF_STEP_HOURS=1.5
PROACTIVE_SESSION_WINDOW_HOURS=3
PROACTIVE_NUDGE_IDLE_MINUTES=25
DOC_TIMEZONE=Europe/Istanbul
QUIET_HOURS_START=23:30
QUIET_HOURS_END=07:30
```

