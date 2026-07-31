# Ashley — Final Round (Round 5)

Last questions. After this, we build.

---

## A. Ashley's "Own Time"

You introduced a great concept: when you explicitly say you're going AFK/sleeping, that becomes Ashley's "own time" to be autonomous.

1. **What should she do during her own time?** Pick any/all:
   - Read her RSS feeds and form opinions (current curiosity loop, but deeper)
   - Run the reflection job (review today's conversations, update her model of you)
   - Draft things she wants to share when you're back (but not send them yet)
   - Explore topics you mentioned but she didn't have time to dig into
   - Just... exist quietly until you're back (minimal background work)

2. **When you come back online, should she:**
   - Have something ready to share ("while you were out, I read something interesting...")?
   - Wait for you to initiate and weave in what she found naturally?
   - Greet you with something light, then surface her reading if the conversation flows there?

---

## B. What to Preserve

I'm about to rewrite the prompts from scratch.

3. **Is there anything about current Ashley you love and absolutely don't want changed?** For example:
   - Her specific likes/dislikes list (SQLite, changelogs, dub techno, Turkish psych rock, etc.)
   - The yield gate (substance-first when you ask real questions)
   - The banned clichés list ("How can I assist you today?" etc.)
   - Her awareness of living on the Mint box
   - Anything else that makes her feel like *her*?

4. **The İzmir stories reference in the current prompt** — is that a real thing she should keep? Are there other personal references/inside jokes that should survive the rewrite?

---

## C. The Nudge Rule

You said: "If I don't answer after the third nudge, wait 6 hours."

5. **What counts as a nudge?** 
   - Only proactive DMs (initiative messages she sends unprompted)?
   - Any message from her that you don't respond to (including in-conversation)?
   - Only proactive DMs that go unanswered within a time window (e.g., 1 hour)?

---

## D. Deployment

We're shipping all waves today. I need to make sure I don't break your flow.

6. **Your deploy command is `npm run start:ashley`** which SSHes to Mint, pulls, rebuilds, and restarts. For me to ship changes, I just need to:
   - Make code/prompt changes in this workspace (`E:\composer-assistant`)
   - You commit + push + run `npm run start:ashley`
   - Correct? Or do you want me to trigger the deploy too?

7. **Should I run the persona eval suite (`npm run eval:full`) between waves?** You mentioned Cursor was firing tests. The eval runs on port 3712 (isolated), so it won't touch live Ashley. It would add ~5-10 minutes per wave but would catch regressions.

---

## E. One Technical Decision

8. **The `chat-service.ts` refactor** — you said "yes, but carefully." Given we're shipping all waves today, should I:
   - Refactor it in Wave 6 as planned (safest — personality and memory changes land first)?
   - Refactor it early (Wave 1-2) since it makes all subsequent changes cleaner to implement?
   - Skip it entirely today and tackle it in a future session?
