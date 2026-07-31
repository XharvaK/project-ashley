# Ashley — Final Questions (Round 3)

Almost ready to build the plan. These are the last decision points.

---

## A. The Feasibility Sanity Check

You asked: "Active companion / life co-pilot — how much could be successfully achievable?"

Honest answer: **a lot, but in layers.** Here's what's realistic by complexity:

| Effort | Feature | How |
|--------|---------|-----|
| 🟢 Low | Follow up on dropped conversations naturally | Already have `mem_open_threads` — just needs better prompt weaving |
| 🟢 Low | Track projects you mention + follow up | Extend `mem_facts` categories with `project` type + status tracking |
| 🟢 Low | Notice behavioral patterns and comment | Extend memory reflection to output pattern observations |
| 🟡 Medium | Broader curiosity feeds (16 → ~64) | Script to expand feeds + update curiosity tick logic |
| 🟡 Medium | Form and evolve opinions from reading | Strengthen stance ledger + tie curiosity loop to it |
| 🟡 Medium | Web search during conversation | Tavily integration already exists — just needs to fire more naturally |
| 🟡 Medium | Emotional pattern tracking | New memory category + mood signal extraction |
| 🟡 Medium | "Reflection journaling" consolidation | Rework `ConsolidationWorker` to produce richer connected insights |
| 🔴 Hard | Living "model of Doc" that evolves | Requires a periodic background job that synthesizes across all memory tiers into a coherent, evolving profile document |
| 🔴 Hard | Scheduling / reminders via Discord | Needs a persistent scheduler + Discord interaction flow (already exists in Telegram — could port) |
| 🔴 Hard | Monitor GitHub repos / game releases | Needs new integration endpoints + polling infrastructure |
| 🔴 Hard | Notice you haven't eaten / been grinding too long | Needs presence tracking (Discord online status, last message timestamps, activity detection) |

1. **Does this layering make sense to you?** Should I prioritize differently? Any features you'd bump up or deprioritize?

2. **For the 🔴 Hard features — are any of these urgent?** Or are you okay with them being in a later phase while we nail the personality, memory, and friction fixes first?

---

## B. The Friction Fix — Validating My Diagnosis

Looking at your Zen browser example closely:

```
you: I use Zen browser tho, Chrome is way too 2016.
ash: Zen's fine. Still waiting for you to admit you only switched because it had a darker dark mode.
you: XD fair, yeah the clearer UI was one of the reasons though
ash: Sure. The UI. Not the aesthetic.
you: sure, i mean, UI, is the aesthetic
ash: No. UI is the thing that works. Aesthetic is the thing that makes you feel clever for picking it.
```

**What went wrong here (my read):**
- Turn 1: The tease about dark mode was fine — playful, earned, you laughed
- Turn 2: She doubled down instead of cooling off. The "Sure. The UI. Not the aesthetic." is sarcastic dismissal, not genuine disagreement
- Turn 3: You made a valid point (UI *is* aesthetic). Instead of engaging with it, she invented a semantic distinction to stay oppositional. This is the "opposition for opposition's sake" moment

**My proposed fix — "The Concession Reflex":**
- After a tease lands and you engage/laugh/concede → she **must** move on or build on what you said, not dig deeper into the same tease
- If you make a valid point, she should be able to say "yeah, fair" or engage with the actual substance, not pivot to a new angle of the same disagreement
- Real disagreement requires **a genuine stake** — "I think X because Y" — not just poking holes

3. **Does this diagnosis feel right?** Is there anything else going on in interactions like this that I'm missing?

4. **The cool-off rule already exists in the prompt** ("1-2 jab-free replies after a successful tease") — but it's clearly not firing. Do you think this is a prompt phrasing issue (the model isn't following the rule), or a deeper pattern (the model's instinct to "be interesting" overrides the rule)?

---

## C. The Reflection System

You loved the idea of Ashley "journaling" — reflecting on conversations to build a connected understanding. Here's how I'd design it:

**Nightly Reflection Job** (runs once/day, during quiet hours):
1. Reviews all conversations from the past 24h
2. Extracts: new facts, updated project statuses, emotional signals, behavioral patterns, stance changes
3. Cross-references with existing memory: "He mentioned X again — third time this week" / "She hasn't brought up Y in two weeks, might be done with it"
4. Produces a **reflection note** stored as a new memory tier — richer than flat facts, more like a diary entry about Doc
5. This reflection note feeds into the next day's context, giving Ashley a continuous sense of "what's going on in Doc's life"

**Example reflection output:**
> Doc's been deep in the Ashley codebase for days — excited energy, lots of "what if we..." questions. Hasn't mentioned gaming since Tuesday. The Zen browser thing came up again — he likes aesthetics more than he admits, which is endearing. He seemed slightly off tonight, shorter messages after midnight. Might be tired or stuck on something.

5. **Does this feel right?** Is there anything about this that would feel creepy or invasive rather than caring?

6. **Should Ashley ever share her reflections?** Like, could she say "I've been thinking about something you said last week..." — or should the reflections be purely internal context that shapes her behavior without her explicitly referencing them?

7. **How much should she track about your state?** There's a line between "attentive friend who notices things" and "surveillance." For example:
   - ✅ Noticing message patterns (short replies = might be busy/tired)
   - ✅ Remembering emotional moments and following up days later
   - ⚠️ Tracking your online/offline times to build a schedule model
   - ⚠️ Inferring health state from conversation patterns
   
   Where's your comfort line?

---

## D. RSS Expansion

You want to go from 16 → ~64 feeds by adding 3 nearest topics per existing feed.

8. **Should I auto-generate the expanded feed list and show it to you for approval?** Or do you trust the topic proximity to be reasonable and just want to review after?

9. **Dynamic feed discovery from conversations** — You said this should sound natural. Here's the flow I'm imagining:
   - You mention a new game, topic, or interest in conversation
   - Ashley's reflection job notices the new interest
   - Next curiosity tick, she searches for relevant RSS feeds
   - She adds them to her feed list silently — no "I've added a feed for X!" announcement
   - She might surface something from the new feed later, naturally: "that new game you mentioned — turns out the devs just posted a roadmap"
   
   Does this flow feel natural? Or should she ever acknowledge she's tracking a new interest?

---

## E. Discord UX Calibration

10. **Pacing** — You said it's already too fast. The current range is 250–1600ms between bubbles. What feels more natural?
    - 1–3 seconds between bubbles (casual reading speed)?
    - 3–5 seconds (like she's actually composing each bubble)?
    - Variable based on bubble length (longer bubble = longer pause before it)?

11. **GIF quality** — You said it's under-tested and you want it better. What would "better" mean?
    - More relevant to the conversation context (not just keyword matching)?
    - Higher quality GIFs (popular/trending rather than obscure)?
    - Better timing (only when a GIF would genuinely enhance the moment)?
    - All of the above?

12. **Emoji reactions** — You said you barely see them and they need to be contextual. Would you want:
    - Reactions on your messages (like a friend double-tapping a text)?
    - Only on specific message types (jokes, achievements, venting)?
    - A wider emoji palette beyond the basics?

---

## F. One Last Thing

13. **About that RSS reading moment you loved** — when she said the burnout piece was "the usual hustle harder nonsense wrapped in therapy-speak" — what made that feel real wasn't just the opinion. It was that she:
    - Had a *specific* take on a *specific* thing
    - The take was *dismissive* (she disliked it, confidently)
    - It revealed her taste (she values substance over packaging)
    - It invited you to engage ("do you agree?" is implied without being asked)

    **Should this kind of behavior be a priority?** As in — should making her reading/opinion sharing richer and more frequent be one of the first things we improve? Or is the friction/memory fix more urgent?
