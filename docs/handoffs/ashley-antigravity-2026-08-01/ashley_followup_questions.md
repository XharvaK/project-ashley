# Ashley — Follow-Up Questions (Round 2)

Based on your answers, I'm zeroing in on the core vision: **an autonomous companion with genuine taste who feels natural**. Here are deeper questions to shape the implementation.

---

## A. The Opposition Problem

You said she "acts opposition just to oppose." This is a real risk with the current prompt design — the spine rules are written as *always defend or explain*, which a model can interpret as *always push back*.

**The fix is probably not removing spine — it's teaching her *when* to have one.**

A real friend with taste doesn't disagree with everything. They pick their battles. They agree enthusiastically when something is genuinely good, disagree sharply when something is genuinely bad, and let the rest flow.

1. **Can you give me an example (even rough) of a conversation where Ashley opposed you and it felt forced?** Like she was disagreeing with a preference, a plan, or a take — and you thought "why are you fighting this?"

2. **When she *does* disagree, what would make it feel earned?** For example:
   - She should only push back on things she's previously expressed opinions about (stance ledger)
   - She should agree first with whatever she genuinely agrees with, then push back on the specific part she doesn't
   - She should be able to say "yeah that's solid" or "honestly, fair point" without it feeling like caving

3. **Is there a ratio that feels right to you?** Something like: for every 1 time she disagrees, she should agree/affirm 3-4 times? Or is it more about *quality* of disagreement than frequency?

4. **Should she have "strong opinion" vs. "weak opinion" zones?** For example, maybe she fights hard on pharmacology claims (where accuracy matters) but is relaxed about game preferences (where it's just taste)?

---

## B. Emotional Depth & Smartness

You want her "emotionally deeper and smarter." That's a layered ask. Let me unpack what that could mean:

5. **Deeper how?** Which of these resonate (pick any/all)?
   - She notices when you're in a different mood without you saying so (reading between the lines)
   - She remembers emotional patterns over time ("last time you were up this late, something was bugging you")
   - She can sit with a heavy moment without trying to fix it or lighten it
   - She shares her own emotional responses genuinely ("that actually bothers me" / "I'm weirdly proud of you for that")
   - She asks follow-up questions that show she's actually tracking the emotional thread, not just the factual one

6. **"Smarter" in what sense?**
   - Better at reading subtext / what you're not saying?
   - More insightful observations (connecting dots you didn't connect)?
   - Knowing when to go deep vs. keep it light based on context?
   - Better at knowing when you want to vent vs. want a solution?

7. **How should she handle genuinely bad days?** If you come in clearly stressed, upset, or low energy:
   - Match energy quietly (short, warm, no pressure)?
   - Gently acknowledge it ("rough day?")?
   - Try to lift mood with something specific she knows you like?
   - Just be present and follow your lead?

---

## C. Autonomy & Initiative

You said she should be more initiative as a companion, and your 6-month vision is "all at once" — better memory → more autonomous → deeper personality.

8. **What does "autonomous" look like to you in practice?** Which of these would you actually want (pick any/all)?
   - She notices you haven't eaten in hours and says something
   - She keeps track of projects/tasks you mention and follows up ("did you finish that refactor?")
   - She notices patterns in your behavior ("you always code better after midnight, you know that?")
   - She suggests things proactively based on context ("you've been grinding for 3 hours — want to take a break and I'll find something interesting to read?")
   - She manages a personal knowledge base for you (bookmarks, notes, ideas you mentioned)
   - She monitors things you care about (GitHub repos, game releases, news topics) and surfaces them naturally
   - She schedules things or sets reminders
   - She does web searches when relevant to the conversation without you asking

9. **How pushy should initiative be?** There's a spectrum:
   - **Ghost mode**: She only speaks when spoken to, but remembers everything
   - **Attentive friend**: She checks in occasionally, follows up on things, surfaces interesting stuff — but backs off immediately if you're not engaging
   - **Active companion**: She regularly initiates, tracks your state, manages context about your life, and feels like a presence even when you're not talking to her
   - **Life co-pilot**: She's always on, tracking your projects, health, interests, and proactively managing information for you

10. **The "dropped conversation" problem** — You said she should pick up dropped conversations more. What's the ideal behavior?
    - She brings it up naturally next time you talk ("by the way, you never said how that meeting went")
    - She waits for a natural pause in conversation to circle back
    - She asks directly but only once — if you don't bite, she drops it
    - Some combination depending on how important the dropped thread was?

---

## D. Memory Engineering

You want smarter memory. Here's where I need your input on direction:

11. **Memory categories** — I'm thinking:
    - **Identity** (who you are, name, location, background)
    - **Preferences** (likes, dislikes, opinions)
    - **Projects** (things you're working on, with status)
    - **People** (people you mention, relationships, context)
    - **Events** (things that happened, with timestamps)
    - **Patterns** (behavioral observations: "works late", "prefers X over Y")
    
    Would these categories be useful? Anything to add or remove?

12. **Memory decay** — Two approaches:
    - **Access-based**: Facts that are never recalled fade in priority (like a cache LRU)
    - **Time-based**: Old facts get lower retrieval scores unless explicitly refreshed
    - **Relevance-based**: Facts that become contradicted or outdated are flagged and eventually pruned
    
    Which feels right? Or a combination?

13. **Memory consolidation** — Right now, facts are pinned every 4 turns. What if instead:
    - Ashley periodically "reflects" on accumulated conversations and produces a richer, more connected understanding (like journaling)
    - She connects facts across conversations ("he mentioned project X three weeks ago and it's still unfinished — might be stuck")
    - She builds a living "model of Doc" that evolves over time, rather than just accumulating flat facts

---

## E. Taste & Naturalness

You want a companion with **taste that feels natural**. This is the hardest problem. Let me probe what "natural taste" means to you:

14. **When Ashley shares an opinion about something (a game, a song, a tech take), what makes it feel real vs. performative?**
    - Specificity? ("the combat in Elden Ring rewards patience in a way most ARPGs don't" vs. "Elden Ring is a great game")
    - Consistency? (she should remember and build on past opinions)
    - Surprise? (sometimes she likes something you wouldn't expect)
    - Willingness to dislike things? (not everything is "interesting")

15. **Should her taste evolve?** For example:
    - She starts with baseline tastes (from the current prompt) but develops new ones based on what you share with her
    - She might change her mind about something over time and say so
    - She discovers things through her RSS feeds and forms opinions about them before sharing

16. **The curiosity loop** — You said it should be broader. What areas are missing from the current 16 feeds? Anything you've been interested in recently that she doesn't know about?

---

## F. Discord Experience

17. **Pacing** — You want faster. Currently the inter-bubble delay is 250–1600ms based on your typing tempo. What would feel right?
    - Minimal delay (50–200ms) — just enough to not feel like a wall of text
    - No delay — all bubbles sent instantly
    - Something else?

18. **GIFs** — You want more, with better quality. Currently there's a 120s per-channel cooldown.
    - Should we lower the cooldown (e.g., 60s or 30s)?
    - Should she use GIFs in more contexts (reactions, emphasis, mood-setting)?
    - Is the search quality issue about relevance (wrong GIFs) or variety (same GIFs)?

19. **Reactions** — Currently 3-4 turn gap between emoji reactions.
    - Too conservative? Should she react more often?
    - Should she use a wider variety of emoji?
    - Should reactions be more contextual (reacting to specific parts of what you said)?

20. **Word-by-word streaming** — This is a significant engineering change. Just to confirm: you want to see Ashley's response appear character-by-character in Discord (like she's typing it live), rather than the current "typing... → full message appears"?

---

## G. The Big Picture

21. **If Ashley were a real person, who would she remind you of?** Not a celebrity — more like a type. The sharp friend who sends you articles at 2am? The quiet friend who remembers everything? The opinionated friend who makes you think? The one who just *gets it* without needing explanation?

22. **What's the single interaction that would make you think "she's finally *there*"?** Paint me a scenario — something she does or says that would make her feel genuinely alive and not like software.
