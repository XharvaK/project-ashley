# Discord presence truth

**Status:** `SUPPORTING`  
**Date:** 2026-08-26

Discord custom status is a rendering of current activity. It is not the owner
of read lifecycle, Mind State, takes, or recency.

## Laws

- DISCOVERED != READ
- FETCHED != READ
- READ != CURRENTLY READING
- TAKE EXISTS != CURRENTLY THINKING
- RECENT != CURRENT
- HISTORICAL ACTIVITY != LIVE ACTIVITY
- COMPLETED ACTIVITY != ACTIVE ACTIVITY
- PERSISTED ACTIVITY RECORD != PRESENT-TENSE PRESENCE

Present-progressive labels such as `reading <title>` require an in-flight
lifecycle that has started and has not yet ended. Freshness alone cannot
establish that.

## Root cause

`getCuriosityStatus` already exposed a completed `lastTake` (title, depth,
`createdAt`, `ageMin`). That projection was historical and true.

`pickPresenceLabel` was the first false step. It treated `lastTake.ageMin <=
120` as currently reading, `<= 720` as `last: <title>`, and excerpt depth as
`skimmed <title>`. Sticky TTL for that band was two hours, so a completed take
could keep present-progressive Discord text long after the read (and after
take formation) had finished.

`last:` was history-composer syntax on the public presence string. It was not
a product contract for Discord.

`networkActivity` / `researchTopic` were never populated by agent-service.

## Ownership

Curiosity owns in-flight reading as process-local `currentActivity`
(`begin` around fetch, `end` in `finally`, matching id so an older completion
cannot clear a newer read). Restart empties that slot. A persisted `cur_reads`
row or `cur_takes` row cannot refill it.

`getCuriosityStatus` projects `currentActivity` plus optional historical
`lastTake`. Status reads do not write cognitive or curiosity state.

Discord renders `currentActivity`. It ignores `lastTake` for labels. Idle
defaults remain `feed quiet`, `curiosity off`, and `around`.

## Semantics

| Case | Source | Discord |
|---|---|---|
| Active read (fetch in flight) | `currentActivity.state === "active"`, kind `reading` | `reading <title>` is allowed |
| Completed or failed/aborted read | slot cleared | must not say `reading <title>` |
| Recent take / recent thought artifact | `lastTake` or other stored rows | not current activity; no `last:` leak |
| No current activity | `state: "none"` | existing idle / mode labels |

There is no currently-thinking presence path. A stored take is not thinking.

## TTL

The 120-minute and 720-minute `ageMin` windows were illegitimate currentness
rules. They are removed from the renderer.

The two-hour sticky TTL on the old reading band was the same error: it treated
a completed label as still live. Live activity labels now yield immediately
when the snapshot no longer reports them.

The Discord refresh interval remains ten minutes. That interval is how often
the bot polls. It is not a recency-to-currentness window.

## Remaining limits

A genuine in-flight read is usually shorter than the ten-minute poll, so
Discord may never show `reading <title>` even when the semantic slot is
briefly active. That is fail-closed, not a license to stretch completed reads
into currentness. No Operational Continuity, Event Spine, or Discord-owned
cognition was added to close that gap.
