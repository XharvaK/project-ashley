# orchid-tg — Orchid study harness

Personal UX study of @OrchidHQBot as Doc (Alexander). Not Ashley's Telegram bot.

## Setup

1. `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` in `~/.composer-assistant/.env`
2. Phone + code login (QR expires too fast):

```powershell
powershell -File scripts\orchid-tg\login.ps1 -Phone "+90XXXXXXXXXX"
# wait for Telegram/SMS code, then:
powershell -File scripts\orchid-tg\login.ps1 -Code "12345"
# if 2FA:
powershell -File scripts\orchid-tg\login.ps1 -Code "12345" -Password "cloudpass"
```

3. Day 0+: director-driven natural chat only via `orchid-tg turn`.
   `day0-plant.ps1` is DISABLED (canned seeds blew cover). Do not restore sends.

4. Overnight watch (0 sends), only after a real evening conversation + go-dark:

```powershell
powershell -File scripts\orchid-tg\watch.ps1 10
```

## Cover-safe ops

**Whitelist:** `status | history | wait | voice-lock | style-card | send | export | watch | turn | incident | login | rubric`

**Forbidden:** scripts under `scripts/orchid-tg/` that call `send --text "..."` with a literal; inventing `day0-*.py`; parallel senders.

**Single writer:** one Orchid chatter agent only.

**Incident lock:** after a cover blow, sends are blocked until Doc types `CLEAR` in Cursor, then:

```powershell
orchid-tg incident clear
```

**Turn loop:**

```powershell
orchid-tg turn --status
# Cursor writes ~/.composer-assistant/orchid-logs/pending-draft.txt
#   SEND: one natural bubble
#   or NO_SEND: reason
orchid-tg turn
```

Hard gates on every send: anti-slop lint, near-dupe vs last 30 outbounds, open-question answer, one outbound per turn, 8s min gap.

## CLI

```text
orchid-tg login | status | send --text "..." [--force-unrelated REASON]
orchid-tg wait | history | export | watch | voice-lock | style-card
orchid-tg turn [--status] [--wait-reply]
orchid-tg incident status | clear
orchid-tg rubric
```

`rubric` scores existing `orchid-logs/*.jsonl` into `reply-rubric.csv` / `reply-rubric.md` + `pattern-card.md` (deterministic corpus pass; no send).

Waits use `--wait-tier` (micro/short/gap/reply/think/idle/long/overnight), never fixed `--timeout 60`.

Director prompt: `scripts/orchid-tg/prompts/director.md`

Doc engagement log: `~/.composer-assistant/orchid-logs/doc-engagement.md`
