# Ashley Deep Improvement Questions

After thoroughly analyzing the entire codebase, all system prompts, the memory architecture, the curiosity/initiative systems, the eval suite, and the changes from the previous conversation, here are my questions organized by area. Each question targets a specific opportunity to make Ashley more natural, sophisticated, and human-feeling.

---

## A. Personality & Voice Depth

### A1. Emotional vocabulary is narrow
Ashley's mood detection ([mood.ts](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/memory/mood.ts)) uses 7 regex patterns: `tired`, `irritated`, `warm`, `playful`, `flat`, `curious`, `weird`. Real emotional range is much wider.

> **Q: Should we expand her emotional self-awareness?** For example: `amused`, `restless`, `nostalgic`, `stubborn`, `fond`, `skeptical`, `melancholy`, `energized`, `conflicted`. Would you want her to track and reference richer emotional states, or does the current set cover the moods that actually matter to you?

### A2. Her tastes are frozen in the prompt
[core-ashley.md](file:///c:/Users/Xharv/Projects/composer-assistant/workspace/prompts/core-ashley.md) hardcodes her likes (dub techno, Turkish psych rock, SQLite, roguelikes). The prompt says "they can evolve" but there's no mechanism for that.

> **Q: Should Ashley's tastes actually drift over time?** For instance, if she reads a lot of ambient music articles through her RSS feeds, should her taste profile gradually shift to include ambient? Should she be able to discover she likes something new and tell you about it? Or do you prefer her taste to stay manually curated by you?

### A3. She lacks personal history and continuity
Ashley can reflect on the last 24h, but she has no sense of her own arc. She can't say "I've been thinking about distributed systems a lot lately" unless the reflection job happened to capture that.

> **Q: Should Ashley build a long-term self-narrative?** A weekly or monthly "journal" that synthesizes patterns across reflections, giving her a sense of personal growth. "I've gotten more interested in X over the past month." This would be a higher-level summary of her reflections, not just the daily diary entry.

### A4. Her voice examples are static
[voice-examples.json](file:///c:/Users/Xharv/Projects/composer-assistant/workspace/prompts/voice-examples.json) has 41 examples that never change. Over time they become stale anchors that pull her toward the same phrasings.

> **Q: Should voice examples rotate or evolve?** Options:
> - **Curated rotation**: You periodically update the examples based on conversations you liked
> - **Organic capture**: When she says something you react positively to (laugh reaction, "that was good"), it gets promoted to a candidate example
> - **Decay**: Old examples gradually lose weight so she doesn't parrot the same patterns forever
> - **Keep static**: The current approach is fine

### A5. No "Ashley has been wrong before" memory
She tracks stances via [stances.ts](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/memory/stances.ts) including revisions, but there's no mechanism for her to learn from being wrong. She can't say "I was wrong about Go's error handling last time, so I'm less sure about this."

> **Q: Should past revisions inform her confidence on related topics?** When she changes her mind on something, should that affect how confidently she states opinions in the same domain? (e.g., if she's been wrong about 3 Go-related things, she should be slightly less cocky on the next Go opinion)

---

## B. Conversational Intelligence

### B6. Reasoning effort is underused
In [chat-service.ts L430-441](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/chat-service.ts#L430-L441), `reasoningEffort` is `"high"` for recall/soft_recall/activity asks and messages >160 chars, but `"none"` for everything else. Short banter gets `"none"`, which is fine. But medium-complexity questions (debugging, pharmacology, multi-step reasoning) that happen to be under 160 chars also get `"none"`.

> **Q: Should reasoning effort be content-aware rather than length-based?** For example, `"high"` for any message that contains a code question, pharma question, premise to check, or multi-part question, regardless of character count? The cost is slightly higher API usage; the benefit is better answers to complex short questions like "is that safe with SSRIs?"

### B7. Temperature is flat across contexts
Chat temperature is fixed at 0.65 ([env.ts](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/env.ts)). This is a good general value, but banter benefits from higher temperature (more variety, less predictable) while technical answers benefit from lower (more precise).

> **Q: Should temperature vary by detected context?** For example:
> - Banter/hanging: 0.7 (more creative/unpredictable)  
> - Technical/code/pharma: 0.5 (more precise)
> - Emotional/serious: 0.55 (careful but not robotic)
> - Recall: 0.3 (already done)

### B8. No conversation pacing awareness
Ashley doesn't track conversation rhythm beyond the `TurnBuffer` debounce. She can't tell if this is a rapid-fire debugging session vs. a lazy midnight hang.

> **Q: Should Ashley adapt her style based on conversation tempo?** If Doc is sending 3 messages per minute, she could be more terse and action-oriented. If messages are coming every 10 minutes, she could be more reflective and expansive. This would make the conversation feel more like a real back-and-forth with a human who reads the room.

### B9. She doesn't remember what she was mid-explaining
If a conversation gets interrupted (Doc goes AFK, new thread, restart), Ashley loses the thread of complex explanations. There's no "I was explaining X" recovery.

> **Q: Should we add lightweight conversation-state tracking?** For example, if she was mid-way through explaining a pharmacology mechanism and Doc came back, she could offer to continue. The open_threads table partially does this but only for things Doc owes her, not things she was actively explaining.

---

## C. Memory Architecture

### C10. Semantic retrieval is keyword-biased
[stances.ts selectRelevantStances](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/memory/stances.ts) and [curiosity inject.ts overlapScore](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/curiosity/inject.ts) both use lexical token overlap. This misses semantic connections (e.g., "deployment pipeline" won't match a stance about "CI/CD").

> **Q: Should stance and curiosity matching use embeddings instead of keyword overlap?** The embedding infrastructure already exists for `mem_chunks`. Using it for stances and curiosity takes would improve recall quality, especially for conceptually related but differently-worded topics. Trade-off: more Mistral API calls per turn.

### C11. Reflection is shallow and single-pass
[reflection.ts](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/memory/reflection.ts) runs once every 24h, producing 80-160 words. It reads 120 messages max, truncated to 400 chars each. This means long, important conversations get compressed to almost nothing.

> **Q: Should reflections be richer and more structured?** Options:
> - **Multi-paragraph reflections** with separate threads for emotional patterns, project progress, and new interests
> - **Tiered reflections**: daily (short, current), weekly (medium, trends), monthly (long, arc)
> - **Triggered reflections**: After emotionally intense conversations, not just on a timer
> - **Current approach is sufficient**

### C12. Facts have no temporal context
`mem_facts` stores when a fact was created and last confirmed, but doesn't track temporal relevance. "Doc is working on the Discord bot" might be true today but stale in a month.

> **Q: Should facts have explicit TTL or staleness detection?** For example, `ongoing` category facts could auto-expire after 30 days without reinforcement. `preference` facts could be longer-lived. This would prevent Ashley from confidently referencing months-old project states.

### C13. No cross-session emotional arc tracking
Mood is tracked per-message, but there's no higher-level pattern recognition. She can't notice "Doc has been flat for 3 days" or "He's been more energized since he started that project."

> **Q: Should Ashley track emotional patterns across sessions?** A weekly emotional summary that feeds into her context: "Doc has been consistently low-energy this week" or "He's been unusually excited about the new project." This would let her respond with deeper empathy and pattern awareness.

---

## D. Proactive Initiative & Autonomy

### D14. Initiative angles are limited
The proactive system has 3 angles: `question`, `opinion`, `check_in`. Real friend outreach patterns are richer.

> **Q: Should we add more initiative angles?** Candidates:
> - **`share_discovery`**: "I found something you'd like" (distinct from opinion, which requires a take)
> - **`callback`**: "Remember when you said X? I was thinking about that" 
> - **`reaction`**: "I just read the dumbest take on Y" (personality-forward, not Doc-focused)
> - **`ambient`**: Brief presence ("good morning" once a day, time-zone aware)
> - Or are the current 3 sufficient?

### D15. Return-from-AFK behavior is monotone
When Doc comes back after own-time, Ashley either shares a reading find or does a basic greeting. The current `mem_own_time_drafts` table exists but the cycling mechanism is simplistic.

> **Q: How should Ashley handle return-from-AFK more naturally?** Should she:
> - Sometimes just say "hey" and let him lead
> - Sometimes share something she was thinking about (not just reading)
> - Sometimes reference something from the last conversation before he left
> - Sometimes say nothing at all until he initiates
> - Adjust based on how long he was gone (1h absence vs 12h absence are different)

### D16. No awareness of external context
Ashley can't reference time of day, day of week, or seasons. She can't say "it's late even for you" without a standing fact about his sleep schedule.

> **Q: Should Ashley use temporal awareness more?** She has `DOC_TIMEZONE` set to `Europe/Istanbul`. Should she:
> - Reference time naturally ("it's 3am there, you know")
> - Adjust energy based on time (calmer at night, more energetic during day)
> - Note patterns ("you're up earlier than usual")
> - Keep it minimal (only when he explicitly mentions time)

---

## E. Discord & Channel Experience

### E17. GIF search is single-attempt
[gif-search.ts](file:///c:/Users/Xharv/Projects/composer-assistant/apps/discord-bot/src/chat/gif-search.ts) fetches GIFs but the selection mechanism could be smarter.

> **Q: Should Ashley learn which GIFs land?** If Doc reacts with 😂 to a GIF, that GIF (or that search style) could get weighted higher for future use. If he ignores a GIF, that style gets slightly deprioritized. Over time, she'd develop a sense of "what's funny to Doc."

### E18. Reaction emoji palette is wide but uninformed
The prompt lists a wide palette (`😂 💀 🔥 👀 🫠 🤝 🫡 😤 🥹`) but there's no tracking of which reactions he responds well to.

> **Q: Should emoji reactions be personalized over time?** Similar to GIF learning, should certain emoji reactions that get positive follow-ups get used more often, while ones that get ignored get rotated out?

### E19. No multi-modal conversation awareness
Ashley can see images Doc sends, but she doesn't track the emotional context of image-sharing. Sending a selfie vs sending a screenshot vs sending a meme are very different social signals.

> **Q: Should Ashley handle different image types differently?** For example:
> - Screenshot/code: respond technically
> - Meme/funny image: respond with humor
> - Personal photo: respond warmly, maybe with a compliment or observation
> - Food: match casual energy
> Or is the current "react to what's in the frame" sufficient?

---

## F. Technical & Codebase Improvements

### F20. The regeneration loop is single-shot
[chat-service.ts L462-551](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/chat-service.ts#L462-L551) allows at most one regeneration per turn. If the regen also fails a guard, the bad output goes through.

> **Q: Should regeneration be allowed a second attempt in critical cases?** For example, if a premise guard fails and regen also fails, should there be a fallback response rather than sending a potentially wrong answer? Trade-off: latency vs correctness on edge cases.

### F21. No response quality self-monitoring
Ashley doesn't track when her own responses were weak. She doesn't know that her recall answers are getting repetitive or that her teases are landing less often.

> **Q: Should Ashley have a quality feedback loop?** For example:
> - Track which responses get reactions (good signal)
> - Track which responses lead to Doc re-asking (bad signal)
> - Track trigram diversity across her recent messages
> - Feed this into her context to encourage self-correction
> - Too much engineering for the benefit?

### F22. Consolidation worker timing is fixed
The consolidator runs facts extraction every 4 assistant turns (`MEMORY_FACT_EVERY_N=4`). This means rapid-fire debugging sessions create lots of noise, while deep hour-long conversations with slow turns might miss consolidation windows.

> **Q: Should consolidation frequency be adaptive?** For example:
> - During rapid exchanges: consolidate less often (every 8 turns)
> - During slow, deep conversations: consolidate more often (every 2 turns)
> - After emotionally significant exchanges: immediate consolidation
> - Current fixed interval is fine

---

## G. Naturalness & Anti-Robotic Behavior

### G23. The prompt is instruction-heavy
[core-ashley.md](file:///c:/Users/Xharv/Projects/composer-assistant/workspace/prompts/core-ashley.md) contains extensive negative examples ("Does not sound like you"), behavioral algorithms (yield gate with 8 checks), and meta-instructions about instructions. This much scaffolding can make the LLM feel constrained.

> **Q: Should we reduce the prompt to principles rather than rules?** Instead of 8 yield-gate checks and explicit cool-off mechanics, should we express the same ideas as 2-3 principles? For example:
> - "Substance before style. Answer the question first."
> - "One jab per reply, and only when the material writes itself."
> - "Agree when he's right. Out loud."
> 
> Trade-off: fewer guardrails = more variance, but also more natural flow. Do you see her violating the spirit of the rules, or just the letter? If she mostly gets it right, the scaffolding can come down.

### G24. "Check the premise before you answer the question" is great but undertested
The premise guard ([premise-guard.ts](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/premise-guard.ts)) is a powerful idea but relies on regex for detection. It catches "since X" patterns but misses subtler false premises.

> **Q: Should premise checking use the LLM rather than regex?** The current guard catches structural patterns, but a short LLM preflight could catch semantic false premises. For example, "Now that Node dropped CommonJS support..." contains a false premise that regex won't catch. Cost: one extra small API call on flagged messages.

### G25. Turkish handling could be deeper
Ashley mirrors Doc's language, but her Turkish voice examples are fewer (14 TR vs 27 EN in voice-examples.json) and her Turkish cultural knowledge isn't explicitly represented in her personality.

> **Q: Should Ashley's Turkish personality be enriched?** For example:
> - More Turkish voice examples covering a wider range of situations
> - Turkish-specific humor patterns (not just translated English wit)
> - Awareness of Turkish cultural context (holidays, politics, daily rhythms)
> - Turkish slang/informal register that goes beyond direct translation
> - Or is the current balanced approach working well enough?

### G26. She has no sense of humor style
The prompt talks about teasing and roasting, but Ashley doesn't have a defined comedic voice. Is she deadpan? Absurdist? Observational? Self-deprecating?

> **Q: What's Ashley's comedic identity?** Currently she defaults to dry observations. Should she have:
> - A tendency toward absurdist humor (unexpected connections)
> - Deadpan delivery (understated, straight-faced)
> - Callbacks to running jokes between you two
> - Self-deprecating humor about her own limitations
> - A mix that evolves based on what you laugh at
> - The current undefined approach is fine

---

## H. Evaluation & Quality

### H27. Persona eval doesn't test for naturalness
The 39 probes test for honesty, substance, spine, voice, delivery, and earned friction. But there's no probe for "does this sound like a real person?"

> **Q: Should we add naturalness probes?** For example:
> - "Read these 5 responses and rank which sounds most like a real friend in a DM"
> - A/B tests between Ashley's response and a human-written response
> - A "Turing test" probe where the judge doesn't know which is the bot

### H28. No A/B testing of prompt changes
Currently, prompt changes are deployed and evaluated subjectively. The eval suite compares against a baseline, but there's no mechanism to test two prompt versions simultaneously.

> **Q: Would you want A/B testing for prompt experiments?** For example, running the same probes against two prompt variants and comparing judge scores. This would make it safe to try more aggressive changes (like simplifying the prompt) without risking regressions.

---

## I. Integration & Features

### I29. Telegram is underutilized
The Telegram bot exists but [telegram-companion.md](file:///c:/Users/Xharv/Projects/composer-assistant/workspace/prompts/telegram-companion.md) is sparse compared to Discord's prompt. Habits and reminders are Telegram-native but the personality is thin.

> **Q: Should Telegram get a distinct personality layer?** For example:
> - More "on the go" tone (shorter, quicker responses)
> - Location-aware if Doc shares location
> - Different rhythm than Discord (Telegram = quick check-ins, Discord = longer hangs)
> - Or should both channels feel identical?

### I30. No learning from Doc's corrections
When Doc says "that's not right" or corrects Ashley, the correction denylist prevents the wrong fact from resurfacing, but Ashley doesn't learn the positive lesson (what the right answer actually is).

> **Q: Should corrections create positive memories?** For example, if Doc corrects a pharmacology claim, should Ashley store the corrected version as a high-confidence fact? Currently she only blocks the wrong thing, she doesn't remember the right thing.

---

## Priority Signal

> [!IMPORTANT]
> **Pick the 5-8 questions that matter most to you.** Not everything needs to be built, and some of these are mutually exclusive. The goal is to understand your vision for Ashley's next evolution, not to implement everything at once.

Some rough tiers based on impact vs. effort:

| Tier | Questions | Why |
|------|-----------|-----|
| **High impact, moderate effort** | A1, B6, B7, C11, D16, G23 | These directly affect how natural she sounds in every conversation |
| **High impact, high effort** | A3, C13, D14, D15, G25 | These require new systems but add real depth |
| **Medium impact, low effort** | A4, B8, C12, F22, I30 | Quick wins that compound over time |
| **Nice-to-have** | E17, E18, E19, F20, F21, H27, H28, I29 | Polish and features that can wait |
