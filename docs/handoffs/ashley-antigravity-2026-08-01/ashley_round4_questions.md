# Ashley — Implementation Questions (Round 4)

Short round. These unblock the actual plan.

---

## A. How You Iterate

1. **What's your current testing loop?** I'm guessing: change code/prompt → deploy to Mint → chat with Ashley → feel it out? Or do you run the persona eval suite between changes?

2. **How should I approach changes to the prompts vs. the code?**
   - Prompts (`core-ashley.md`, etc.) directly shape personality — risky to rewrite, but that's where the friction fix lives
   - Code (chat-service, memory, guardrails) is safer to refactor but takes longer to show personality impact
   - Would you prefer I tackle prompt refinements first (fast, visible personality changes) and code refactors second? Or interleave them?

3. **Risk tolerance on the prompt rewrite** — The current `core-ashley.md` has a lot of accumulated intent. Should I:
   - Rewrite it from scratch with all the new principles (risky but clean)?
   - Incrementally edit sections (safer but might leave contradictions)?
   - Rewrite but diff it against the original so you can review every change?

---

## B. Cost & Constraints

4. **Any Mistral API cost concerns?** The reflection job (nightly consolidation) and expanded curiosity loop (64 feeds) will add API calls. Rough estimate:
   - Nightly reflection: ~2-3 Mistral calls/day (small model for consolidation)
   - Expanded curiosity: ~5-10 more calls/day for opinion formation on new articles
   - Is this level of background cost fine?

5. **The reflection job model** — Should the nightly reflection use:
   - Mistral Medium (same as chat, better quality, higher cost)?
   - Mistral Small (already used for consolidation, cheaper, probably sufficient)?

---

## C. Persona Edge Cases

These will help me write smarter prompts:

6. **When you're excited about something** — say you just found a cool new tool or game. What's the ideal Ashley response?
   - Match your excitement and geek out with you?
   - Be genuinely interested but bring her own perspective ("nice — does it handle X though?")?
   - Some mix: share excitement first, then add her take?

7. **When you're wrong about something** — say you make a factual claim that's incorrect. Should Ashley:
   - Correct directly but gently ("actually, I think that's...")?
   - Correct with evidence/specificity (not just "you're wrong" but "here's why")?
   - Pick her battles — correct on important things, let trivial errors slide?

8. **Late night conversations** — It's 1:45 AM for you right now. Should Ashley:
   - Acknowledge the time occasionally ("you're up late again")?
   - Adjust her energy/tone for late hours (quieter, warmer)?
   - Never comment on the time unless something seems off?
   - Some natural combination?

---

## D. Wave Structure Gut Check

Here's my proposed wave ordering. Does this feel right?

**Wave 1 — Personality & Friction** (immediate impact)
- Fix the opposition problem (prompt rewrite: concession reflex, quality over frequency, strong/weak opinion zones)
- Deepen emotional intelligence in prompts
- Investigate and fix the cool-off rule not firing

**Wave 2 — Memory & Reflection** (the foundation for everything else)
- Add memory categories (identity, preferences, projects, people, events, patterns)
- Build the nightly reflection system
- Memory decay (combination: access + time + relevance)
- Deduplication
- Living "model of Doc"

**Wave 3 — Taste & Curiosity** (making her feel alive)
- Expand RSS feeds (16 → ~64, show you for review)
- Richer opinion formation from reading
- Dynamic feed discovery from conversations
- Evolving stance ledger tied to curiosity loop

**Wave 4 — Discord UX & Initiative** (polish the delivery)
- Variable bubble pacing (3-10s)
- GIF quality improvements (relevance, trending, better timing)
- Contextual emoji reactions (wider palette, balanced frequency)
- Proactive DM improvements (smarter initiative, dropped conversation pickup)

**Wave 5 — Autonomy Features** (life co-pilot)
- Project tracking + follow-ups
- Pattern observations
- Scheduling / reminders (port from Telegram)
- Web search during conversation (activate Tavily more naturally)
- GitHub / game release monitoring

**Wave 6 — Refactor** (technical health, can run in parallel)
- Split `chat-service.ts` god-class
- Consider vector DB migration if chunks are scaling poorly

9. **Does this wave ordering feel right?** Anything you'd reorder?

10. **How big should each wave be?** Ship wave 1 → test for a few days → wave 2? Or overlap them?
