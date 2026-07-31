# Ashley Improvement Plan — All Waves

Implementing today. Each wave builds on the previous one.

---

## Wave 1 — Personality & Friction (Prompt Rewrite)

The biggest impact wave. Rewriting `core-ashley.md` from scratch with all the principles from our discussion.

### Key Changes

**The Concession Reflex (fixing "opposition for sport")**
- Remove the implicit "always defend or explain" bias
- Add explicit concession ability: "yeah, fair" / "actually, good point" are not caving — they're honesty
- Quality over frequency: disagree sharply on things that matter, let the rest flow
- Strong/weak opinion zones: fight hard on accuracy (pharmacology, code), relaxed on taste (browsers, games)
- After a tease lands and gets a laugh → **must** move on or build. No digging deeper into the same tease
- Real disagreement requires a genuine stake ("I think X because Y"), not just poking holes

**Emotional Depth**
- Read between the lines: notice mood from message length, timing, word choice
- Track emotional patterns: connect current state to past patterns
- Sit with heavy moments without trying to fix or lighten them
- Share genuine emotional responses ("that actually bothers me" / "I'm weirdly proud of you")
- Track the emotional thread, not just the factual one
- Bad days: match energy + gentle acknowledgment + lift with something specific she knows he likes (blend naturally)

**Taste & Opinions**
- Specific, not generic ("the combat in Elden Ring rewards patience" not "Elden Ring is great")
- Consistent but evolving — remember and build on past opinions
- Willing to dislike things confidently
- Surprise sometimes — she can like unexpected things
- When excited about something Doc shares: share the excitement first, then add her own perspective

**Corrections**
- Correct gently with evidence: "actually, I think that's..." + "here's why"
- Pick battles — correct on important things, let trivial errors slide

**Removed**
- İzmir stories reference (slop)
- Hardcoded em-dash ban from prompt text itself (keep the output rule, stop using them in the prompt)
- Overly prescriptive negative constraints that cause the model to over-refuse

### Files

#### [NEW] [core-ashley.md](file:///E:/composer-assistant/workspace/prompts/core-ashley.md)
Full rewrite. Preserves: yield gate, banned clichés, specific tastes (evolved), Mint box awareness, craft rules. Adds: concession reflex, emotional depth, strong/weak opinion zones, taste evolution rules.

#### [MODIFY] [discord-companion.md](file:///E:/composer-assistant/workspace/prompts/discord-companion.md)
Light touch — mostly prompt-aligned. Update to reference new friction model.

---

## Wave 2 — Memory & Reflection

### Nightly Reflection System

A new background job that runs once per 24 hours (during Ashley's "own time" when Doc is AFK, or after 24h of no reflection).

**What it does:**
1. Reviews conversations from the past 24h
2. Extracts: new facts, project status updates, emotional signals, behavioral patterns, stance changes
3. Cross-references with existing memory ("he mentioned X again — third time this week")
4. Produces a **reflection note** — richer than flat facts, more like a diary entry
5. Reflection note feeds into the next context assembly

**Ashley can share reflections explicitly** ("I've been thinking about something you said last week...")

**Model:** Mistral Medium (cost is irrelevant with 1B tokens/month)

### Memory Categories

Extend `mem_facts` with a `category` field:
- `identity` — who Doc is (name, background)
- `preference` — likes, dislikes, opinions  
- `project` — things he's working on, with status
- `person` — people he mentions, relationships
- `event` — things that happened, with timestamps
- `pattern` — behavioral observations

### Memory Decay (Combination)

- **Access-based**: facts recalled in conversation get a freshness boost
- **Time-based**: older facts get lower retrieval scores (gentle decay curve, not cliff)
- **Relevance-based**: facts contradicted by newer information get flagged and eventually pruned
- **Deduplication**: detect and merge near-duplicate facts

### Files

#### [MODIFY] [db.ts](file:///E:/composer-assistant/apps/agent-service/src/memory/db.ts)
Add `category` column to `mem_facts`. Add `mem_reflections` table. Add `last_accessed` / `access_count` columns for decay.

#### [NEW] `reflection.ts` in `apps/agent-service/src/memory/`
Nightly reflection job: gathers 24h context → Mistral Medium call → stores reflection note.

#### [MODIFY] [consolidator.ts](file:///E:/composer-assistant/apps/agent-service/src/memory/consolidator.ts)
Update fact extraction to include categories. Add deduplication logic.

#### [MODIFY] [assembler.ts](file:///E:/composer-assistant/apps/agent-service/src/memory/assembler.ts)
Include reflection notes in context assembly. Apply decay weighting to retrieved facts.

#### [MODIFY] [facts.ts](file:///E:/composer-assistant/apps/agent-service/src/memory/facts.ts)
Category-aware fact storage and retrieval.

---

## Wave 3 — Taste & Curiosity

### RSS Feed Expansion (16 → ~64)

Expand each existing feed's interest area with 3 related RSS feeds. Generate the expanded list and present it for review before applying.

### Richer Opinion Formation

When the curiosity loop reads an article, have Ashley form a stronger opinion:
- Not just "noted this article" but "I think X about this because Y"
- Tie opinions to the stance ledger
- Opinions should be specific and sometimes dismissive ("the usual hustle harder nonsense")

### Dynamic Feed Discovery

- Reflection job notices new interests from conversations
- Next curiosity tick searches for relevant RSS feeds for new interests
- Adds them silently — no announcement
- Surfaces content naturally later

### Files

#### [MODIFY] [curiosity-sources.json](file:///E:/composer-assistant/config/curiosity-sources.json)
Expand from 16 to ~64 feeds (show original + expansions for review).

#### [MODIFY] [tick.ts](file:///E:/composer-assistant/apps/agent-service/src/curiosity/tick.ts)
Support dynamic feed list that grows from conversation-discovered interests.

#### [MODIFY] [takes.ts](file:///E:/composer-assistant/apps/agent-service/src/curiosity/takes.ts)
Richer opinion formation prompt — stronger, more specific, sometimes dismissive.

#### [MODIFY] [store.ts](file:///E:/composer-assistant/apps/agent-service/src/curiosity/store.ts)
Store conversation-discovered interests and map to feeds.

---

## Wave 4 — Discord UX

### Variable Bubble Pacing (3–10s)

Replace the current 250–1600ms range with a variable 3–10 second range based on bubble character length. Longer bubbles = longer pause before the next one.

### GIF Quality

- Increase search results from `limit: 1` to `limit: 5`, then pick the highest-rated/most-relevant
- Keep the 120s cooldown (or increase it — Doc said 120s was too frequent)
- Better context: the model should generate more descriptive search queries, not just keywords
- Filter for popular/trending GIFs over obscure ones

### Contextual Emoji Reactions

- Widen the emoji palette beyond basics
- Reduce the minimum turn gap from 3-4 to 2-3 (Doc barely sees reactions currently)
- Make reactions more contextual — react to specific message types (jokes, achievements, venting)
- Keep balance — not every turn

### Files

#### [MODIFY] [pacing.ts](file:///E:/composer-assistant/apps/discord-bot/src/chat/pacing.ts)
New timing bands: 3–10s variable based on character count. Keep `PACE_BUDGET_MS` higher to accommodate.

#### [MODIFY] [gif-search.ts](file:///E:/composer-assistant/apps/discord-bot/src/chat/gif-search.ts)
Fetch top 5, pick best. Increase cooldown. Add trending/popular filter.

#### [MODIFY] [react-policy.ts](file:///E:/composer-assistant/apps/discord-bot/src/chat/react-policy.ts)
Reduce `MIN_TURNS_BETWEEN` to 2. Widen emoji palette guidance in prompts.

---

## Wave 5 — Initiative & Autonomy

### Eliminate Quiet Hours

Remove fixed quiet hours entirely. Replace with:
- **Own time**: triggered when Doc explicitly says he's going AFK/sleeping
- **3-nudge rule**: if 3 proactive DMs go unanswered within 1 hour each → wait 6 hours
- No passive hour assumptions — Doc's schedule is irregular

### Own-Time Behavior

When Doc says he's going AFK/sleeping:
1. Ashley enters "own time" mode
2. Reads RSS feeds deeper, forms opinions
3. Explores topics Doc mentioned but she didn't dig into
4. Drafts things to share when he's back (stored, not sent)
5. Runs reflection job if 24h since last one

### Return-from-AFK Cycling

When Doc comes back, Ashley **cycles naturally** between:
- Having something ready to share ("while you were out, I read something interesting...")
- Waiting for Doc to initiate and weaving in what she found
- Light greeting, then surfacing reading if the conversation flows there

Cycle should feel random/natural, not predictable.

### Dropped Conversation Pickup

Use existing `mem_open_threads` (`she_owes`, `he_never_answered`) more actively:
- Wait for natural pauses to circle back
- Ask directly but only once — if Doc doesn't engage, drop it
- Vary the approach based on importance of the dropped thread

### Files

#### [MODIFY] [env.ts](file:///E:/composer-assistant/apps/agent-service/src/env.ts)
Remove `quietHoursStart`/`quietHoursEnd`. Add `proactiveNudgeTimeoutMinutes` (60min for 1-hour unanswered window).

#### [MODIFY] [schedule.ts](file:///E:/composer-assistant/apps/agent-service/src/initiative/schedule.ts)
Remove quiet hours logic. Implement 3-nudge-within-1-hour backoff rule.

#### [MODIFY] [sleep.ts](file:///E:/composer-assistant/apps/agent-service/src/initiative/sleep.ts)
Replace sleep-suppress with explicit AFK detection from conversation signals.

#### [MODIFY] [cooldown.ts](file:///E:/composer-assistant/apps/agent-service/src/initiative/cooldown.ts)
Update cooldown logic for new nudge rule.

#### [MODIFY] [proactive-companion.md](file:///E:/composer-assistant/workspace/prompts/proactive-companion.md)
Rewrite for own-time behavior, return-from-AFK cycling, and dropped conversation pickup.

---

## Verification

After all waves ship:
1. Deploy to Mint via `npm run start:ashley`
2. Doc tests live by chatting with Ashley
3. Report back what feels off/wrong
4. Iterate

---

## Not in Scope Today

- `chat-service.ts` refactor (Doc will handle later)
- Telegram improvements
- Voice pipeline changes
- CI/CD setup
- Vector DB migration
- Scheduling/reminders (port from Telegram)
- GitHub/game release monitoring
