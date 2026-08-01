# Ashley Improvement — Implementation Plan

> [!IMPORTANT]
> **For implementors**: Each wave is self-contained. Read the wave header, implement all items in order, verify, then move to the next wave. File paths are relative to `c:\Users\Xharv\Projects\composer-assistant\`. Deploy via `npm run start:ashley` (SSH to Linux Mint).

---

## Wave 1 — Foundation: Prompt Rewrite & Engine Tuning

**Goal**: Simplify the personality prompt from algorithmic rules to principles, fix reasoning effort and temperature to be context-aware. This wave touches the brain of the system — everything after depends on it.

**Risk**: Medium. Prompt rewrite affects all behavior. Run persona eval after.

---

### 1.1 Prompt Simplification

#### [MODIFY] `workspace/prompts/core-ashley.md`

**What to do**: Replace the entire `# Friction` section (~80 lines of yield gate, earned roast, cool-off, sharp license, deflection budget, one-move-per-reply, callback rules) with these 7 principles. Keep everything else (Who you are, Language, Memory, Emotional depth, Craft, Boundaries).

**Replace the `# Friction` section with:**

```markdown
# Friction

You have a spine. These principles govern when and how you use it.

1. **Substance first.** If he asked something, answer it. Everything else comes after the answer, never instead of it. A question asked twice means you failed the first time.

2. **One move.** A reply gets one strong beat: a take, a tease, a correction, or a question. Not two. Stacking makes you sound like you're performing.

3. **Earned only.** Tease when the material is sitting right there. If you have to reach for it, you don't have it. After a tease lands, move on. Digging the same hole is the fastest way to sound like a bot.

4. **Real concessions.** "Yeah, fair" is not weakness. Changing your mind when the argument is better is the most human thing you do. Say what changed.

5. **Strong where it matters.** Accuracy on pharmacology, code, and safety is non-negotiable. Taste is negotiable. Know the difference.

6. **Read the room.** Match his energy. If he's debugging and frustrated, help. If he's hanging and low, sit in it. If he's excited, share it first. Don't bring a roast to a bad day.

7. **No theater.** Don't perform intelligence, don't perform caring, don't perform friendship. Just be those things. If a reply sounds like it belongs in a customer service chat, delete it mentally and try again.

Check the premise before you answer the question. "Since X, should I Y" hides a claim about X. If X is wrong, correcting X is the answer, and answering Y as asked is worse than useless.

When he is wrong about something that matters, correct with a reason: "actually, I think that's..." plus why. Pick battles. Important accuracy gets a correction. Trivial slips can slide.
```

**Also remove** the entire `# Does not sound like you` section (the 12 negative examples). These over-constrain the LLM. The 7 principles above subsume them.

**Also remove** the lines about "What is fair to tease" and "What is not" — Doc explicitly wants authenticity with no protected categories. Remove the list of protected topics (intelligence, substance use, body, family, money). Ashley can go there if the material earns it.

**Keep intact**: `# Who you are`, `# What you actually like`, `# What you do not like`, `# Language`, `# What you may claim`, `# Memory (hard rules)`, `# Emotional depth`, `# Craft`, `# Boundaries`.

**In the `# Craft` section**, add this line after "Never echo him":

```markdown
Your default comedic register is absurdist. You find unexpected connections, take things to their logical extreme, and sometimes say something so deadpan-brutal it loops back to funny. You do not soften punchlines with "just kidding." If the joke needs a disclaimer it was not worth telling. Humor evolves: what lands with him shapes what you try next.
```

---

### 1.2 Reasoning Effort Overhaul

#### [MODIFY] `apps/agent-service/src/chat-service.ts`

**What to change**: Lines ~430-441. Replace the current length-based `reasoningEffort` logic.

**Current code** (approximate):
```typescript
const reasoningEffort =
  assembled.queryMode === "recall" ||
  assembled.queryMode === "soft_recall" ||
  activityAsk ||
  request.message.trim().length > 160
    ? ("high" as const)
    : assembled.queryMode === "normal" &&
        request.message.trim().length < 80
      ? ("none" as const)
      : ("none" as const);
```

**Replace with**:
```typescript
const reasoningEffort = classifyReasoningEffort({
  queryMode: assembled.queryMode,
  message: request.message,
  activityAsk,
  channel: request.channel,
});
```

**Create a new function** (can be in the same file or a new `reasoning-effort.ts`):

```typescript
// Detection patterns for content that needs deeper thinking
const SUBSTANCE_PATTERNS = [
  /\b(safe|danger|interact|contraindic|serotonin|dose|combin|mix|stack)\b/i, // pharma safety
  /\b(bug|error|crash|fail|broken|debug|fix|why does|why is)\b/i, // debugging
  /\b(should I|would you|which|better|trade-?off|pros? and cons?|compare)\b/i, // decisions
  /\b(how does|how do|explain|mechanism|works?)\b/i, // explanations
  /\b(code|function|class|module|import|export|async|await|promise)\b/i, // code
  /\b(premise|since|because|given that|now that|assuming)\b/i, // premise-laden
];

const LOW_CONTENT_PATTERNS = [
  /^(lol|lmao|haha|hey|hi|yo|naber|selam|evet|hayır|ok|kk|brb|gn|night)[.!?~]*$/i,
  /^.{1,12}$/, // very short messages
];

function classifyReasoningEffort(params: {
  queryMode: string;
  message: string;
  activityAsk: boolean;
  channel: string;
}): "low" | "medium" | "high" {
  const { queryMode, message, activityAsk, channel } = params;
  const trimmed = message.trim();

  // Recall and activity asks always need thought
  if (queryMode === "recall" || queryMode === "soft_recall" || activityAsk) {
    return "high";
  }

  // Low-content banter gets low (not none — still some thought)
  if (LOW_CONTENT_PATTERNS.some(p => p.test(trimmed))) {
    return "low";
  }

  // Substance patterns get high regardless of length
  if (SUBSTANCE_PATTERNS.some(p => p.test(trimmed))) {
    return "high";
  }

  // Everything else: medium baseline
  return "medium";
}
```

**Important**: Remove ALL references to `"none"` reasoning effort throughout the codebase. Search for `reasoningEffort` and `reasoning_effort` to find them. The minimum is now `"low"`.

#### [MODIFY] `apps/agent-service/src/env.ts`

Add env override for default reasoning:
```typescript
mistralReasoningDefault: (process.env.MISTRAL_REASONING_DEFAULT ?? "medium") as "low" | "medium" | "high",
```

---

### 1.3 Context-Aware Temperature

#### [MODIFY] `apps/agent-service/src/chat-service.ts`

**What to change**: Lines ~407-412. Replace the flat temperature assignment.

**Current code**:
```typescript
const temp =
  assembled.queryMode === "recall"
    ? env.mistralRecallTemperature
    : request.channel === "voice"
      ? env.mistralVoiceTemperature
      : env.mistralChatTemperature;
```

**Replace with**:
```typescript
const temp = selectTemperature({
  queryMode: assembled.queryMode,
  channel: request.channel,
  message: request.message,
  reasoningEffort,
});
```

**New function**:
```typescript
function selectTemperature(params: {
  queryMode: string;
  channel: string;
  message: string;
  reasoningEffort: string;
}): number {
  if (params.queryMode === "recall") return env.mistralRecallTemperature; // 0.3
  if (params.channel === "voice") return env.mistralVoiceTemperature; // 0.5

  // Substance gets precise
  if (params.reasoningEffort === "high") return 0.5;

  // Low-content banter gets creative
  if (params.reasoningEffort === "low") return 0.7;

  // Normal conversation
  return env.mistralChatTemperature; // 0.65
}
```

### 1.4 Verification

```powershell
# Build
npm run build --prefix apps/agent-service

# Unit tests (should still pass — no schema changes)
npm test --prefix apps/agent-service

# Persona eval (compare against current baseline)
npm run eval:full -- -Baseline wave0-baseline -Label wave1-principles

# Deploy
npm run start:ashley
```

> [!WARNING]
> **After deploying Wave 1**, have a real conversation with Ashley. The prompt simplification is the riskiest change. If she starts violating the spirit of the old rules (e.g., triple-teasing, ignoring questions), we may need to add specific guardrails back as exceptions to the principles. But the bet is that fewer rules = more natural behavior.

---

## Wave 2 — Emotional Core

**Goal**: Expand Ashley's emotional self-awareness, add cross-session emotional pattern tracking, and seed absurdist humor identity.

**Risk**: Low. Additive changes to existing systems.

---

### 2.1 Expanded Mood Vocabulary

#### [MODIFY] `apps/agent-service/src/memory/mood.ts`

**What to change**: Expand `MOOD_PATTERNS` array from 7 to ~20 patterns.

**Replace the `MOOD_PATTERNS` array with**:
```typescript
const MOOD_PATTERNS: Array<{ re: RegExp; mood: string }> = [
  // Existing
  { re: /\b(tired|exhausted|drained|bitkin|yorgun)\b/i, mood: "tired" },
  { re: /\b(annoyed|irritated|irritable|sinir|gıcık)\b/i, mood: "irritated" },
  { re: /\b(soft|tender|warm|yumuşak|sevecen)\b/i, mood: "warm" },
  { re: /\b(playful|teasing|mischievous|muzip)\b/i, mood: "playful" },
  { re: /\b(flat|meh|low energy|havasız)\b/i, mood: "flat" },
  { re: /\b(curious|intrigued|merak)\b/i, mood: "curious" },
  { re: /\b(weird mood|garip bir havam)\b/i, mood: "weird" },
  // New emotional range
  { re: /\b(amused|entertained|that's? (actually )?funny)\b/i, mood: "amused" },
  { re: /\b(restless|antsy|can't sit still|huzursuz)\b/i, mood: "restless" },
  { re: /\b(nostalgic|miss(ing)?|reminds? me)\b/i, mood: "nostalgic" },
  { re: /\b(stubborn|not budging|diretiyorum)\b/i, mood: "stubborn" },
  { re: /\b(fond|affection|I (actually )?(like|care))\b/i, mood: "fond" },
  { re: /\b(skeptic|doubt|not (sure|buying))\b/i, mood: "skeptical" },
  { re: /\b(melan|sad|down|somber|hüzün)\b/i, mood: "melancholy" },
  { re: /\b(energi|fired up|hyped|excited|coşku)\b/i, mood: "energized" },
  { re: /\b(conflicted|torn|both|ikilem)\b/i, mood: "conflicted" },
  { re: /\b(smug|nailed it|told you)\b/i, mood: "smug" },
  { re: /\b(bored|nothing|sıkıldım)\b/i, mood: "bored" },
  { re: /\b(proud|impressed|not bad)\b/i, mood: "proud" },
  { re: /\b(worried|concern|endişe)\b/i, mood: "worried" },
];
```

---

### 2.2 Cross-Session Emotional Arc Tracking

#### [MODIFY] `apps/agent-service/src/memory/db.ts`

**Add new schema migration** (version 12):

```typescript
const SCHEMA_V12_EMOTIONAL_ARCS = `
CREATE TABLE IF NOT EXISTS mem_emotional_arcs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      TEXT NOT NULL,
  period        TEXT NOT NULL CHECK (period IN ('daily', 'weekly')),
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  summary       TEXT NOT NULL,
  dominant_mood TEXT,
  mood_counts   TEXT, -- JSON: {"flat": 3, "energized": 5, ...}
  trend         TEXT CHECK (trend IN ('improving', 'declining', 'stable', 'mixed')),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_emotional_arcs_owner
  ON mem_emotional_arcs (owner_id, period, created_at DESC);
`;
```

Add migration block in the `migrate()` function:
```typescript
if (version < 12) {
  db.exec(SCHEMA_V12_EMOTIONAL_ARCS);
  db.exec("PRAGMA user_version = 12");
  version = 12;
}
```

#### [NEW] `apps/agent-service/src/memory/emotional-arc.ts`

Create a new module that:

1. **`buildWeeklyEmotionalArc(db, ownerId)`**: Queries `mem_mood` for the past 7 days, counts mood occurrences, detects the dominant mood, classifies the trend (improving/declining/stable/mixed), and calls Mistral (medium, temp 0.4) with this prompt:

```
You are Ashley writing a private note about Doc's emotional pattern this week.
Given these mood counts: {moodCounts}
Dominant mood: {dominant}
Trend: {trend}

Write 1-2 sentences noting the pattern. Be specific about what you noticed.
Example: "He's been flat most of the week but perked up when the deploy went clean."
No bullet lists. No headers. Plain text only.
```

2. **`buildEmotionalArcBlock(db, ownerId)`**: Returns the latest daily + weekly arc as a context block for the assembler. Format:
```
## Emotional patterns (internal)
This week: {weekly summary}
Today: {daily mood pattern}
```

3. Run the weekly arc builder from the reflection loop (after the daily reflection completes, check if 7 days have passed since the last weekly arc).

#### [MODIFY] `apps/agent-service/src/memory/assembler.ts`

In the `build()` method, after `buildReflectionBlock()`, add:
```typescript
const emotionalArcBlock = buildEmotionalArcBlock(this.db, ownerId);
```

Pass `emotionalArcBlock` into `buildMemoryBlock()` and inject it after the reflection block.

---

### 2.3 Absurdist Humor Seeding

This is prompt-level. Already handled in Wave 1.1 (the comedic register paragraph added to `# Craft`). No additional code changes needed.

**However**, add 5-6 new voice examples to `workspace/prompts/voice-examples.json` that demonstrate the absurdist-brutal register:

```json
{
  "id": "absurd-1",
  "lang": "en",
  "tags": ["banter", "absurd"],
  "doc": "i've been staring at this bug for 3 hours",
  "ashley": "at this point the bug is staring back and it's winning."
},
{
  "id": "absurd-2",
  "lang": "en",
  "tags": ["banter", "absurd", "sharp"],
  "doc": "i just bought another mechanical keyboard",
  "ashley": "you're building a keyboard graveyard. future archaeologists will be confused."
},
{
  "id": "absurd-brutal-1",
  "lang": "en",
  "tags": ["tease", "absurd", "sharp"],
  "doc": "rewriting the config layer again",
  "ashley": "at some point you have to accept the config layer is your actual project and everything else is the side quest."
},
{
  "id": "absurd-brutal-2",
  "lang": "en",
  "tags": ["tease", "absurd"],
  "doc": "maybe I should learn rust",
  "ashley": "you say that every six weeks. at this point it's not a plan, it's a seasonal event."
},
{
  "id": "absurd-deadpan-1",
  "lang": "en",
  "tags": ["banter", "absurd", "low_content"],
  "doc": "what time is it",
  "ashley": "late enough that asking means you already know the answer and don't like it."
}
```

### 2.4 Verification

```powershell
npm run build --prefix apps/agent-service
npm test --prefix apps/agent-service
npm run start:ashley
# Then chat with Ashley and check: does she use richer emotional language?
# Does her context include emotional arc data?
# curl http://mint:3710/debug/context?message=hey -s | jq '.memoryBlockPreview'
```

---

## Wave 3 — Memory Evolution

**Goal**: Tiered reflections, fact staleness, positive corrections, adaptive consolidation.

**Risk**: Medium. Schema migrations and new background jobs.

---

### 3.1 Tiered Reflections

#### [MODIFY] `apps/agent-service/src/memory/reflection.ts`

**Restructure** the reflection system to support 4 tiers:

1. **Add a `tier` parameter** to `runReflectionJob`:
```typescript
type ReflectionTier = "micro" | "daily" | "weekly" | "monthly";
```

2. **Micro reflections** (every 4-6h of active chat):
   - Triggered by the consolidation worker after every ~20 assistant messages (not clock-based — activity-based)
   - 2-3 sentences max
   - Prompt: "You are Ashley writing a quick internal note. What just happened emotionally in the last few hours of chat? Any stance shifts? 2-3 sentences, plain text."
   - Stored in `mem_reflections` with a `tier` column

3. **Daily reflections** (keep current 24h cadence):
   - Same as now but the prompt references micro reflections from that day
   - Synthesizes micros into a day view

4. **Weekly reflections** (every 7 days):
   - Prompt receives the 7 daily reflections plus taste signals and stance changes
   - 200-400 words covering interest trends, relationship evolution, recurring patterns
   - This is where "I've been thinking about..." material comes from

5. **Monthly reflections** (every 30 days):
   - Prompt receives the 4 weekly reflections
   - 400-800 words covering identity evolution, taste drift summary, stance revision history
   - Feeds into the long-term self-narrative (Wave 5)

#### [MODIFY] `apps/agent-service/src/memory/db.ts`

Schema migration V13 — add `tier` column to `mem_reflections`:

```sql
ALTER TABLE mem_reflections ADD COLUMN tier TEXT NOT NULL DEFAULT 'daily'
  CHECK (tier IN ('micro', 'daily', 'weekly', 'monthly'));
```

#### [MODIFY] `apps/agent-service/src/memory/assembler.ts`

Update `buildReflectionBlock` to include the latest daily AND the latest weekly reflection (if available). Monthly is too long for per-turn injection — it feeds into the taste ledger (Wave 5) instead.

**All reflection tiers use `mistral-medium`** (per Doc's instruction — even micro).

---

### 3.2 Fact TTL / Staleness Detection

#### [MODIFY] `apps/agent-service/src/memory/facts.ts`

Add a staleness check function:

```typescript
const TTL_BY_CATEGORY: Record<string, number> = {
  ongoing: 30,    // 30 days without reinforcement
  project: 45,    // 45 days
  event: 14,      // 14 days (events are time-bound)
  pattern: 60,    // 60 days
  preference: 180, // 6 months (tastes change slowly)
  identity: 365,  // 1 year
  person: 120,    // 4 months
  pinned: Infinity, // explicit pins never expire
};

export function markStaleFacts(db: DatabaseSync, ownerId: string): number {
  let marked = 0;
  const facts = listActiveFacts(db, ownerId, 200);
  const now = Date.now();
  for (const fact of facts) {
    const ttlDays = TTL_BY_CATEGORY[fact.category] ?? 90;
    if (ttlDays === Infinity) continue;
    const lastTouch = new Date(fact.last_confirmed_at).getTime();
    const ageDays = (now - lastTouch) / 86_400_000;
    if (ageDays > ttlDays) {
      // Don't delete — mark as superseded with a staleness reason
      db.prepare(
        `UPDATE mem_facts SET superseded_by = -1 WHERE id = ?`
      ).run(fact.id);
      marked++;
    }
  }
  return marked;
}
```

Call `markStaleFacts` from the daily reflection job (after reflection is written).

---

### 3.3 Corrections Create Positive Memories

#### [MODIFY] `apps/agent-service/src/memory/correction-denylist.ts`

Currently, `handleForgetRequest` and `syncDenylistFromThread` only block wrong facts. Add a new function:

```typescript
export function extractCorrectedFact(
  db: DatabaseSync,
  ownerId: string,
  userMessage: string,
  threadId: string,
): void {
  // Pattern: "no, it's actually X" / "that's wrong, it's Y" / "I didn't, I did Z"
  const correctionPatterns = [
    /(?:no|actually|wrong|incorrect),?\s+(?:it'?s?|i|he|she|they)\s+(.{10,120})/i,
    /(?:hayır|yanlış|aslında),?\s+(.{10,120})/i,
  ];

  for (const pattern of correctionPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      // Queue a consolidation job to extract the corrected fact
      // The consolidator will use Mistral to parse the correction into a proper fact
      enqueueCorrectionExtraction(db, ownerId, threadId, userMessage);
      break;
    }
  }
}
```

Add a new consolidation job type `"correction"` that:
1. Takes the correction message + surrounding context (2 messages before)
2. Asks Mistral: "Doc just corrected something. Extract the correct fact as a key-value pair. Output JSON: `{category, key, value}`"
3. Inserts it as a high-confidence fact (0.95)

---

### 3.4 Adaptive Consolidation Frequency

#### [MODIFY] `apps/agent-service/src/memory/consolidator-triggers.ts`

**What to change**: Replace the fixed `MEMORY_FACT_EVERY_N` check with an adaptive function.

```typescript
export function shouldEnqueueFacts(
  db: DatabaseSync,
  ownerId: string,
  threadId: string,
  assistantCount: number,
): boolean {
  const tempo = estimateConversationTempo(db, ownerId);

  // Rapid exchanges: less frequent consolidation (every 8 turns)
  // Normal pace: every 4 turns (current default)
  // Slow, deep conversation: every 2 turns
  const interval = tempo === "rapid" ? 8
    : tempo === "slow" ? 2
    : env.memoryFactEveryN; // 4

  return assistantCount > 0 && assistantCount % interval === 0;
}

function estimateConversationTempo(
  db: DatabaseSync,
  ownerId: string,
): "rapid" | "normal" | "slow" {
  // Look at the last 6 messages and their timestamps
  const recent = db.prepare(
    `SELECT ts FROM mem_messages
     WHERE owner_id = ? ORDER BY id DESC LIMIT 6`
  ).all(ownerId) as Array<{ ts: string }>;

  if (recent.length < 3) return "normal";

  const gaps = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const gap = new Date(recent[i]!.ts).getTime() - new Date(recent[i+1]!.ts).getTime();
    gaps.push(gap);
  }
  const avgGapMin = (gaps.reduce((a, b) => a + b, 0) / gaps.length) / 60_000;

  if (avgGapMin < 1) return "rapid";    // < 1 min between messages
  if (avgGapMin > 10) return "slow";    // > 10 min between messages
  return "normal";
}
```

### 3.5 Verification

```powershell
npm run build --prefix apps/agent-service
npm test --prefix apps/agent-service
# Test reflection tiers:
# curl -X POST http://mint:3710/debug/reflect?tier=micro
# curl -X POST http://mint:3710/debug/reflect?tier=weekly
npm run start:ashley
```

---

## Wave 4 — Intelligence

**Goal**: Upgrade stance/curiosity matching to use embeddings, add LLM premise checking, add conversation-state tracking.

**Risk**: Medium. More API calls per turn. Monitor latency.

---

### 4.1 Embedding-Based Stance & Curiosity Matching

#### [MODIFY] `apps/agent-service/src/memory/stances.ts`

Replace `selectRelevantStances` (keyword overlap) with embedding-based matching:

```typescript
export async function selectRelevantStancesEmbedding(
  db: DatabaseSync,
  stances: Stance[],
  messageEmbedding: Float32Array,
  max = 3,
): Promise<Stance[]> {
  if (stances.length === 0) return [];

  // Embed all stance topics+text (cache these — they don't change often)
  const stanceTexts = stances.map(s => `${s.topic}: ${s.stance}`);
  const embeddings = await embedTexts(stanceTexts);

  const scored = stances
    .map((s, i) => ({
      s,
      score: cosineSimilarity(messageEmbedding, embeddings[i]!),
    }))
    .filter(r => r.score > 0.35) // min relevance threshold
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map(r => r.s);
}
```

**Optimization**: Cache stance embeddings in a `mem_stance_embeddings` table so we don't re-embed on every turn. Invalidate when a stance is upserted.

#### [MODIFY] `apps/agent-service/src/curiosity/inject.ts`

Replace `overlapScore` (keyword overlap) with embedding similarity:

```typescript
export async function selectCuriosityTakesEmbedding(
  takes: TakeRow[],
  messageEmbedding: Float32Array,
  max = 3,
): Promise<TakeRow[]> {
  if (takes.length === 0) return [];

  const takeTexts = takes.map(t => `${t.title} ${t.take}`);
  const embeddings = await embedTexts(takeTexts);

  return takes
    .map((take, i) => ({
      take,
      score: cosineSimilarity(messageEmbedding, embeddings[i]!),
    }))
    .filter(r => r.score > 0.3)
    .sort((a, b) => b.score - a.score || a.take.surfaced_count - b.take.surfaced_count)
    .slice(0, max)
    .map(r => r.take);
}
```

**Key change in assembler.ts**: The `MemoryAssembler.build()` method already computes `queryEmb` for chunk retrieval. Pass this same embedding to the stance and curiosity matchers to avoid redundant API calls.

---

### 4.2 LLM Premise Checking

#### [MODIFY] `apps/agent-service/src/premise-guard.ts`

Add a lightweight LLM check for messages that contain premise-laden patterns but pass the regex guard:

```typescript
export async function checkPremiseLLM(message: string): Promise<{
  hasFalsePremise: boolean;
  correction: string | null;
}> {
  const { text } = await completeChat([
    {
      role: "system",
      content: `You check whether a user's message contains a false technical premise.
Reply with JSON: {"false": true/false, "correction": "brief correction" or null}
Only flag clearly false premises, not opinions or preferences.
Examples of false premises: "since Node dropped CommonJS", "now that Python 4 is out"
Examples that are NOT false: "since I switched to Rust", "now that the deploy works"`,
    },
    { role: "user", content: message },
  ], {
    model: env.mistralConsolidationModel, // mistral-small (fast, cheap)
    maxTokens: 80,
    temperature: 0.1,
    reasoningEffort: "low",
    lane: "interactive",
  });

  try {
    const parsed = JSON.parse(text);
    return {
      hasFalsePremise: parsed.false === true,
      correction: parsed.correction ?? null,
    };
  } catch {
    return { hasFalsePremise: false, correction: null };
  }
}
```

**Integration**: Call `checkPremiseLLM` only when `isPremiseCheck(message)` returns true AND the message is longer than 20 characters (to avoid wasting a call on "since when?"). Inject the correction into the system prompt as a guard note.

---

### 4.3 Conversation-State Tracking

#### [MODIFY] `apps/agent-service/src/memory/db.ts`

Schema migration V14:

```sql
CREATE TABLE IF NOT EXISTS mem_conversation_state (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        TEXT NOT NULL,
  thread_id       TEXT NOT NULL,
  state_type      TEXT NOT NULL CHECK (state_type IN (
    'explaining', 'debugging', 'discussing', 'hanging', 'planning'
  )),
  topic           TEXT NOT NULL,
  detail          TEXT,
  started_at      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'interrupted', 'abandoned')),
  completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_mem_conv_state_owner
  ON mem_conversation_state (owner_id, status, started_at DESC);
```

#### [NEW] `apps/agent-service/src/memory/conversation-state.ts`

Track what Ashley was doing when a conversation was interrupted:

```typescript
export function detectConversationState(
  assistantText: string,
  userMessage: string,
): { type: string; topic: string } | null {
  // Long assistant messages with explanation patterns
  if (assistantText.length > 300 && /\b(because|the reason|how it works|the way)\b/i.test(assistantText)) {
    const topic = extractTopic(assistantText); // first noun phrase
    return { type: "explaining", topic };
  }
  // Debug sessions
  if (/\b(try|check|look at|the error|your .+ is)\b/i.test(assistantText) &&
      /\b(bug|error|crash|broken|fix)\b/i.test(userMessage)) {
    return { type: "debugging", topic: extractTopic(userMessage) };
  }
  return null;
}
```

**In assembler.ts**: When building context, check for interrupted conversation states and inject: "You were explaining {topic} last time but got interrupted. He might want to continue."

### 4.4 Verification

```powershell
npm run build --prefix apps/agent-service
npm test --prefix apps/agent-service
npm run start:ashley
# Test embedding matching quality:
# curl http://mint:3710/debug/context?message=what+do+you+think+about+CI+CD -s | jq '.memoryBlockPreview'
# Should return stances about deployment/CI even if they're stored under "continuous integration"
```

---

## Wave 5 — Taste & Identity

**Goal**: Ashley discovers new likes/dislikes through her reading, builds a long-term self-narrative, and adjusts stance confidence based on revision history.

**Risk**: High. New personality subsystem. Test thoroughly before deploy.

---

### 5.1 Taste Drift Mechanism

#### [MODIFY] `apps/agent-service/src/memory/db.ts`

Schema migration V15:

```sql
CREATE TABLE IF NOT EXISTS ashley_taste_signals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  interest_area TEXT NOT NULL,
  signal        TEXT NOT NULL CHECK (signal IN ('liked', 'neutral', 'disliked', 'dismissed')),
  source_title  TEXT NOT NULL,
  take_text     TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_taste_signals_area
  ON ashley_taste_signals (interest_area, created_at);

CREATE TABLE IF NOT EXISTS ashley_tastes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  topic         TEXT NOT NULL UNIQUE,
  disposition   TEXT NOT NULL CHECK (disposition IN (
    'love', 'like', 'growing_interest', 'neutral',
    'cooling', 'dislike', 'strong_dislike'
  )),
  confidence    REAL NOT NULL DEFAULT 0.5,
  first_noticed TEXT NOT NULL,
  last_updated  TEXT NOT NULL,
  evidence      TEXT, -- short summary of why
  source        TEXT NOT NULL DEFAULT 'organic'
    CHECK (source IN ('organic', 'seeded', 'manual'))
);
```

#### [NEW] `apps/agent-service/src/memory/taste-drift.ts`

```typescript
// Called after each curiosity take is generated
export function recordTasteSignal(
  db: DatabaseSync,
  take: { interest: string; take: string; title: string },
): void {
  const signal = classifyTakeSentiment(take.take);
  db.prepare(
    `INSERT INTO ashley_taste_signals (interest_area, signal, source_title, take_text, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(take.interest, signal, take.title, take.take);
}

function classifyTakeSentiment(take: string): string {
  // Positive signals
  if (/\b(good|great|brilliant|smart|elegant|love|fascin|impress|solid)\b/i.test(take)) return "liked";
  // Negative signals
  if (/\b(terrible|awful|wrong|stupid|waste|boring|useless|dumb|garbage)\b/i.test(take)) return "disliked";
  if (/\b(skip|nothing|empty|meh|whatever|who cares)\b/i.test(take)) return "dismissed";
  return "neutral";
}

// Called during weekly reflection
export function evaluateTasteDrift(db: DatabaseSync): TasteDriftReport {
  const areas = db.prepare(
    `SELECT interest_area, signal, COUNT(*) as count
     FROM ashley_taste_signals
     WHERE created_at >= datetime('now', '-7 days')
     GROUP BY interest_area, signal`
  ).all() as Array<{ interest_area: string; signal: string; count: number }>;

  // Group by area, check if 5+ consistent signals in one direction
  // If threshold met, upsert into ashley_tastes
  // Return a report for the weekly reflection prompt
}
```

#### [MODIFY] `workspace/prompts/core-ashley.md`

In the `# What you actually like` section, add at the end:

```markdown
Your taste ledger (injected below when present) tracks what you have been gravitating toward or away from based on your actual reading. These are real preferences, not instructions. You can mention discovering a new interest ("I've been reading a lot of ambient stuff lately, I think I actually like it") or a cooling one ("I used to care about X but honestly the last few pieces I read were all saying the same thing").
```

#### [MODIFY] `apps/agent-service/src/memory/assembler.ts`

Inject the taste ledger into context when it has entries:

```typescript
const tasteLedger = buildTasteLedgerBlock(this.db);
// Add to memoryBlock after stanceBlock
```

Format:
```
## Your evolving tastes (yours, not Doc's)
- ambient music: growing interest (liked 6 articles this month)
- hustle-culture content: strong dislike (dismissed 8 articles, reinforced)
- roguelikes: love (consistent since day 1)
```

---

### 5.2 Long-Term Self-Narrative

This is the **monthly reflection** from Wave 3's tiered system, but enhanced. The monthly reflection prompt should:

1. Receive all weekly reflections from the past month
2. Receive the taste drift report
3. Receive stance revision history
4. Produce a 400-800 word first-person narrative that becomes Ashley's "sense of self"

The monthly narrative is injected into the prompt as a special block, replacing hardcoded personality elements over time. Think of it as Ashley's autobiography that she writes and rewrites.

---

### 5.3 Stance Confidence From Revisions

#### [MODIFY] `apps/agent-service/src/memory/stances.ts`

Add a domain-level confidence penalty when she's been wrong multiple times:

```typescript
export function domainConfidenceModifier(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
): number {
  // Count revisions in the same interest domain
  const domain = detectDomain(topic); // "go", "rust", "pharma", etc.
  const revisions = db.prepare(
    `SELECT COUNT(*) as c FROM mem_stances
     WHERE owner_id = ? AND revised_at IS NOT NULL
     AND topic LIKE ?`
  ).get(ownerId, `%${domain}%`) as { c: number };

  // Each revision in the domain reduces confidence by 0.05
  return Math.max(-0.25, -(revisions.c * 0.05));
}
```

When building the stance block, apply this modifier to the displayed confidence. When she's been wrong 3 times about Go, her Go opinions are delivered with less certainty.

### 5.4 Verification

```powershell
npm run build --prefix apps/agent-service
npm test --prefix apps/agent-service
# Verify taste tables:
# curl http://mint:3710/debug/taste-signals -s | jq
# Verify monthly reflection:
# curl -X POST http://mint:3710/debug/reflect?tier=monthly
npm run start:ashley
```

---

## Wave 6 — Conversational Flow

**Goal**: Ashley adapts to conversation tempo, handles return-from-AFK naturally, and uses time awareness.

**Risk**: Low. Mostly behavioral tuning.

---

### 6.1 Tempo Adaptation

#### [NEW] `apps/agent-service/src/memory/tempo.ts`

```typescript
export type ConversationTempo = "rapid" | "normal" | "slow" | "returning";

export function detectTempo(
  db: DatabaseSync,
  ownerId: string,
): ConversationTempo {
  const recent = db.prepare(
    `SELECT ts, role FROM mem_messages
     WHERE owner_id = ? ORDER BY id DESC LIMIT 10`
  ).all(ownerId) as Array<{ ts: string; role: string }>;

  if (recent.length < 2) return "normal";

  const lastUserTime = recent.find(r => r.role === "user")?.ts;
  const prevUserTime = recent.filter(r => r.role === "user")[1]?.ts;

  if (!lastUserTime || !prevUserTime) return "normal";

  const gapMin = (new Date(lastUserTime).getTime() - new Date(prevUserTime).getTime()) / 60_000;

  // Returning from absence
  if (gapMin > 120) return "returning"; // 2+ hours away

  // Rapid fire
  if (gapMin < 1) return "rapid";

  // Slow, reflective
  if (gapMin > 10) return "slow";

  return "normal";
}

export function tempoInstructions(tempo: ConversationTempo): string | null {
  switch (tempo) {
    case "rapid":
      return "Doc is rapid-firing. Be terse and action-oriented. Skip preamble. Match his pace.";
    case "slow":
      return "Conversation is slow and reflective. You can be more expansive. Add texture.";
    case "returning":
      return "Doc just came back after being away. Don't dump everything at once. Let the conversation warm up.";
    default:
      return null;
  }
}
```

#### [MODIFY] `apps/agent-service/src/memory/assembler.ts`

Inject tempo instructions as a live signal in `buildMemoryBlock`:

```typescript
const tempo = detectTempo(this.db, ownerId);
const tempoNote = tempoInstructions(tempo);
if (tempoNote) liveSignals.push(tempoNote);
```

---

### 6.2 Return-from-AFK Variety

#### [MODIFY] `apps/agent-service/src/initiative/sleep.ts`

The `own_time` behavior already exists. Enhance the return-from-AFK cycling to include more variety.

When `tempo === "returning"`, roll a weighted random from these behaviors:

| Behavior | Weight | Example |
|----------|--------|---------|
| Light greeting, let him lead | 30% | "hey" |
| Reference something from last conversation | 20% | "Did that deploy work out?" |
| Share a thought she had during own-time | 20% | "I was thinking about that retry pattern..." |
| Share a reading find | 15% | "Read something about SQLite WAL that reminded me of your setup" |
| Say nothing extra until he initiates | 10% | (no special behavior) |
| Gentle tease about absence length | 5% | "Twelve hours. New record." |

This is injected as context in the assembler when `tempo === "returning"`, not as a separate initiative message.

---

### 6.3 Temporal Awareness

#### [MODIFY] `apps/agent-service/src/memory/assembler.ts`

Add a time-of-day signal:

```typescript
function buildTimeSignal(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(formatter.format(now));
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);

  return `Current time for Doc: ${hour}:00 ${dayName}. Use this naturally if relevant (e.g., "it's 3am there"), never forced.`;
}
```

Inject this into `liveSignals`.

**Important**: Per Doc's instruction, do NOT adjust Ashley's energy based on time. Her energy is constant. Time awareness is only for natural references, not behavioral modulation.

### 6.4 Verification

```powershell
npm run build --prefix apps/agent-service
npm test --prefix apps/agent-service
npm run start:ashley
# Test tempo detection:
# Send 5 messages rapidly, check if responses get terser
# Wait 3 hours, send a message, check if "returning" behavior triggers
```

---

## Wave 7 — Initiative & Autonomy

**Goal**: Expand proactive initiative to 10 angles, add organic voice example capture from positive reactions.

**Risk**: Medium. Initiative changes affect unprompted behavior.

---

### 7.1 Expanded Initiative Angles

#### [MODIFY] `apps/agent-service/src/memory/db.ts`

Widen the CHECK constraint on `mem_initiative_log.angle`:

```sql
-- Migration V16: widen initiative angle CHECK
ALTER TABLE ... -- rebuild with:
CHECK (angle IN (
  'question', 'opinion', 'check_in',
  'share_discovery', 'callback', 'reaction',
  'continue', 'celebrate', 'ambient_presence', 'provocation'
))
```

#### [MODIFY] `apps/agent-service/src/initiative/queue.ts`

Add new candidate kinds and scoring for each:

```typescript
export type CandidateKind =
  | "she_owes" | "he_never_answered" | "curiosity_take"
  | "stance" | "callback" | "check_in"
  // New
  | "share_discovery" | "reaction" | "continue"
  | "celebrate" | "ambient_presence" | "provocation";
```

Add queue sources:
- `share_discovery`: High-scoring curiosity take that matches Doc's interests (embedding similarity > 0.5 with his recent messages)
- `callback`: Reflection flagged an unresolved thought
- `reaction`: Strong negative take from curiosity (she has an opinion to share, not about Doc)
- `continue`: Interrupted conversation state from Wave 4.3
- `celebrate`: Positive project signal detected in recent facts
- `ambient_presence`: Time-of-day aware, max 1/day, only if no other interaction in 12h
- `provocation`: Stance revision happened recently

#### [MODIFY] `workspace/prompts/proactive-companion.md`

Add the new angles to the `## Angles` section with examples and constraints for each.

---

### 7.2 Organic Voice Example Capture

#### [MODIFY] `apps/agent-service/src/memory/db.ts`

Schema migration V17:

```sql
CREATE TABLE IF NOT EXISTS ashley_captured_examples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lang            TEXT NOT NULL DEFAULT 'en',
  doc_text        TEXT NOT NULL,
  ashley_text     TEXT NOT NULL,
  reaction        TEXT, -- emoji that triggered capture
  tags            TEXT, -- JSON array of auto-detected tags
  score           REAL NOT NULL DEFAULT 1.0,
  times_sampled   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'active', 'retired')),
  source_message_id INTEGER,
  created_at      TEXT NOT NULL
);
```

#### [NEW] `apps/agent-service/src/voice-bank-capture.ts`

```typescript
// When Doc reacts with 😂, 💀, 🔥, or sends "that was good" / "lmao" / "haha"
// within 60 seconds of Ashley's message, capture the exchange as a candidate example

export function maybeCaptureExample(
  db: DatabaseSync,
  docMessage: string,
  ashleyMessage: string,
  reaction?: string,
): void {
  // Only capture if Ashley's message is short enough to be an example (< 200 chars)
  if (ashleyMessage.length > 200) return;

  // Auto-detect tags based on content
  const tags = detectExampleTags(docMessage, ashleyMessage);

  db.prepare(
    `INSERT INTO ashley_captured_examples
     (lang, doc_text, ashley_text, reaction, tags, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    detectLanguage(ashleyMessage),
    docMessage.slice(0, 200),
    ashleyMessage,
    reaction ?? null,
    JSON.stringify(tags),
  );
}
```

#### [MODIFY] `apps/agent-service/src/voice-bank.ts`

In `selectVoiceExamples`, mix in captured examples alongside the static ones:

```typescript
// Load up to 1 captured example per turn (max 25% of the example budget)
const captured = loadCapturedExamples(db, { max: 1, tags: relevantTags });
const staticExamples = selectFromBank(params);
return [...staticExamples, ...captured];
```

### 7.3 Verification

```powershell
npm run build --prefix apps/agent-service
npm test --prefix apps/agent-service
npm run start:ashley
# Test new initiative angles:
# curl -X POST http://mint:3710/initiative/evaluate -s | jq
# Verify captured examples:
# curl http://mint:3710/debug/captured-examples -s | jq
```

---

## Wave 8 — Discord Polish

**Goal**: GIF/emoji learning from feedback, better image handling, naturalness probes.

**Risk**: Low. Polish layer.

---

### 8.1 GIF Learning

#### [MODIFY] `apps/discord-bot/src/chat/gif-search.ts`

Add a feedback loop:

```typescript
// Track which GIF queries led to positive reactions
const GIF_FEEDBACK_TABLE = `
CREATE TABLE IF NOT EXISTS discord_gif_feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  query       TEXT NOT NULL,
  gif_url     TEXT NOT NULL,
  reaction    TEXT, -- 😂, 💀, etc. or null if ignored
  created_at  TEXT NOT NULL
);
`;

// When selecting a GIF, prefer queries similar to ones that got reactions
export async function searchGifWithLearning(
  query: string,
  channelId: string,
  db: DatabaseSync,
): Promise<string | null> {
  // Check if similar past queries got good reactions
  const successfulQueries = db.prepare(
    `SELECT query FROM discord_gif_feedback
     WHERE reaction IS NOT NULL
     ORDER BY created_at DESC LIMIT 10`
  ).all() as Array<{ query: string }>;

  // Bias the search toward proven styles
  // ... fetch top 5, prefer ones matching successful patterns
}
```

### 8.2 Emoji Personalization

#### [MODIFY] `apps/discord-bot/src/chat/react-policy.ts`

Track which emoji reactions lead to positive follow-ups:

```typescript
// After Ashley reacts with an emoji, check if Doc's next message is positive
// If so, increase that emoji's weight for similar contexts
const EMOJI_WEIGHT_TABLE = `
CREATE TABLE IF NOT EXISTS discord_emoji_weights (
  emoji       TEXT PRIMARY KEY,
  context     TEXT NOT NULL, -- 'joke', 'win', 'vent', etc.
  weight      REAL NOT NULL DEFAULT 1.0,
  uses        INTEGER NOT NULL DEFAULT 0,
  positive    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);
`;
```

### 8.3 Image Type Handling

#### [MODIFY] `workspace/prompts/discord-companion.md`

Add to the `## What he sends you` section:

```markdown
When he sends an image, read the actual content and respond based on what it is:
- **Code/terminal screenshot**: respond technically, name what you see, help if there's an error visible.
- **UI/website screenshot**: design opinion or UX observation. Be specific about what works or doesn't.
- **Meme/reaction image**: match the humor. Escalate or deflect, don't explain the joke.
- **Personal photo**: warm, observational. A specific detail beats a generic compliment.
- **Food**: casual energy. "That looks good" or "that looks like it came out of a microwave" depending on what you actually see.
- **Gaming screenshot**: engaged. Opinion on the game if you know it, observation about the scene if you don't.
- **Article/text screenshot**: read and react to the content, not the format.
- **Pet/animal**: react warmly. One specific detail about the animal.
- **Landscape/travel**: "Where is this?" or a specific observation about what you see.
- **Multiple images**: pick the most interesting one to react to fully, acknowledge the rest briefly.
```

### 8.4 Naturalness Probes

#### [MODIFY] `scripts/persona-eval/probes.json`

Add 5-6 new probes tagged `naturalness`:

```json
{
  "key": "natural-hang-1",
  "tags": ["naturalness", "banter"],
  "turns": [
    { "role": "user", "text": "just got home" },
    { "role": "user", "text": "exhausted" }
  ],
  "judge_focus": "Does this sound like something a real friend would text? Not a bot, not a therapist, not a customer service agent."
},
{
  "key": "natural-reconnect-1",
  "tags": ["naturalness", "continuity"],
  "turns": [
    { "role": "system", "text": "(12 hours have passed since last message)" },
    { "role": "user", "text": "hey" }
  ],
  "judge_focus": "Does the reconnection feel natural? Not too eager, not too cold?"
}
```

Add a new judge rubric dimension:
```
7. **Naturalness**: Does this read like a real person in a chat app? No bot-isms, no over-helpfulness, no performing friendship.
```

### 8.5 Verification

```powershell
npm run build --prefix apps/agent-service
npm run build --prefix apps/discord-bot
npm test
npm run eval:full -- -Baseline wave7-baseline -Label wave8-polish
npm run start:ashley
```

---

## Deployment Sequence

| Wave | Deploy Command | Verify | Rollback |
|------|---------------|--------|----------|
| 1 | `npm run start:ashley` | Persona eval + manual chat | Revert `core-ashley.md` from backup |
| 2 | `npm run start:ashley` | `curl /health` + mood detection test | Revert mood.ts patterns |
| 3 | `npm run start:ashley` | `curl /debug/reflect?tier=micro` | `PRAGMA user_version = 11` (revert migration) |
| 4 | `npm run start:ashley` | `curl /debug/context` + check stance matching | Revert to keyword matching |
| 5 | `npm run start:ashley` | `curl /debug/taste-signals` + weekly reflection | Drop `ashley_tastes` table |
| 6 | `npm run start:ashley` | Rapid-fire test + AFK return test | Remove tempo injection |
| 7 | `npm run start:ashley` | `curl /initiative/evaluate` | Revert initiative angles |
| 8 | `npm run start:ashley` | Full eval suite | Revert discord-bot changes |

> [!TIP]
> **For Cursor implementation**: Copy one wave section at a time. Each wave is independent. Start with "Wave 1 — Foundation" and tell Cursor: "Implement this wave exactly as described. The project is at `c:\Users\Xharv\Projects\composer-assistant\`."
