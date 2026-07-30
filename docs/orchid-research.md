# Orchid → Ashley research notes

_Last updated: 2026-07-30. Probe evening + Telegram distill slice shipped._

## Intent

Personal free Ashley (Mistral). Study Orchid UX privately. No commercial clone, no public teardown, no OAuth.

## Steal (UX patterns)

1. **Adaptive mirroring** — match Doc register/rhythm per turn (already in core-ashley; strengthen, do not Orchid-cosplay).
2. **Messenger-as-surface** — life happens in the thread, not a dashboard.
3. **Habit / reminder layer** — NL “remind me…” + timed check-ins (local SQLite only).
4. **Approve-before-act** — drafts stay drafts until Doc says so.
5. **Anti-feature-tour onboarding** — do a real small thing; no inventory tours.
6. **Value-demo over pitch** — show usefulness in-thread.
7. **Timezone pin** before scheduling (Europe/Istanbul for Doc).
8. **Quiet-contract** — honor go-quiet; on reopen, acknowledge then soft mode offer (Telegram distill).
9. **Dual-bubble** — reaction then hook via blank-line split (Telegram `splitMessage`, max 3).
10. **Coach-lite once** — normalize, one named micro-rule, one soft CTA; no nag loop.
11. **Peer fumble** — one casual own-it line, then deliver.
12. **Anti-WYR treadmill** — games OK briefly; soft exit; never default loop.

## Reject

- Cloning casual-lowercase as Ashley identity
- Screenshot lines as onboarding copy
- Gmail / Google OAuth / inbox-zero-as-product
- Booking / checkout theater
- Nutrition confidence theater
- Paywall / OAuth nag patterns
- Infinite cursed would-you-rather as default personality

## Distill status (2026-07-30)

| Surface | Status |
|---------|--------|
| Telegram banter + dual-bubble fix | **Shipped** — `workspace/prompts/telegram-companion.md`, `apps/telegram-bot/src/chat/split-message.ts` |
| `core-ashley.md` | Unchanged (identity bleed risk; wait 3+ clean evenings) |
| Discord companion | Unchanged (Doc acceptance surface; existing Ashley voice) |
| Proactive cadence | Unchanged (need multi-day idle evidence) |

Live private log: `~/.composer-assistant/orchid-logs/behaviour-notes.md`

## Ashley mapping

| Pattern | Where |
|---------|--------|
| Adaptive mirror | `workspace/prompts/core-ashley.md` |
| Telegram delivery + banter distill | `workspace/prompts/telegram-companion.md` |
| Dual-bubble send | `apps/telegram-bot/src/chat/split-message.ts` |
| Habits / reminders | SCHEMA_V5 + `/habits/*` `/reminders/*` `/scheduler/tick` |
| Approvals | `mem_pending_actions` + Telegram inline buttons |
| Channel | `ChatChannel` += `telegram`, `apps/telegram-bot/` |
| Discord 24/7 host | `deploy/linux-mint/` (agent + discord only) |

## Probe evidence (fill during study)

- Habits/proactive reliability: Morning 8:30 weather nudge not armed without explicit “trial on” ask (Day0). Quiet-contract honored until Doc reopened.
- Memory stick/forget: Saved Europe/Istanbul for timing; restated quiet preference on return. Quiet mornings crumb accepted then Doc walked it back as half-asleep — she rolled with it.
- Draft-only approval: Draft-to-friend worked; she clarified draft-only when Doc said “What do you mean?”
- Media/voice: Play-menu message had media (`msg 52`). Not yet voice.
- No-tools usefulness (friend/unemployed persona): Banter mode strong tonight (cursed WYR chain). Peer fumble recovery after ~10m stall. Coach-lite 3-tab rule + soft CTA after soft exit.
- Pay pressure: Pricing disclosed when asked once; nag loop not observed.
- OAuth-nag persistence after deflect: Not re-hit tonight.
- Adaptiveness / bilingual: Energy-mirrors flat day → nonsense games; dual-bubble (validate + next hook). TR not tested tonight. Curly-quote polish is a tell.

## Notes

Orchid bot cannot fingerprint Telethon. Risk is pacing/QA smell. Outbound: zero em dashes, safety deny-list, unemployed deflect if linking asked.
