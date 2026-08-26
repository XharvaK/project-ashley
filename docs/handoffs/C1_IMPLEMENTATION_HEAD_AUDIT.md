# C1 Implementation-HEAD Audit

**Status:** Supporting implementation evidence for C1 slice 0. This file is
not an architecture owner, qualification record, release record, or promotion
record.

**Implementation HEAD:** `04beaf1c21c9f7e0c9580692f57ed533d822f61e`

**Implementation worktree:** `C:\Users\Xharv\Projects\ashley-cognitive-maturation-implementation`

**Branch:** `codex/cognitive-maturation-implementation`

**Audit scope:** C1 slice 0 source inventory and green characterization of the
known current non-revival gaps. The accepted contract is the focused C1
implementation contract in the planning worktree. This audit does not change
the original dirty checkout.

## Candidate and source drift

- The implementation candidate is the exact HEAD above.
- The current source-derived nuclear schema version is `34`, from
  `apps/agent-service/src/core/db.ts`.
- The C1 authority substrate, correction admission path, deny barriers, and
  assertion reader cutover are absent at this candidate, as expected for the
  pre-C1 baseline.
- The audited differences from the contract are implementation gaps and
  source locators, not a semantic conflict that would reopen the accepted
  design.

## Audited writer and reader inventory

### Legacy fact writers

The current `upsertFact` implementation is
`apps/agent-service/src/core/memory/facts.ts`. The production call sites found
at this HEAD are:

- `apps/agent-service/src/core/writers.ts:122` — pin/manual fact write.
- `apps/agent-service/src/core/runtime.ts:2964` — runtime fact write.
- `apps/agent-service/src/core/cognition/worker.ts:590` — cognition-derived
  fact write.

`apps/agent-service/src/core/memory/facts.ts:268` also contains the legacy
`forgetByTopic` writer, while governed forgetting performs fact reconciliation
through `apps/agent-service/src/core/memory/forget.ts:462` and
`apps/agent-service/src/core/memory/forget.ts:769`. Episode forgetting also
reconciles linked facts through `apps/agent-service/src/core/memory/episodes.ts`;
this is part of the assertion-aware bridge and is included in the closed C1
writer inventory.

### Legacy currentness readers

- `apps/agent-service/src/core/memory/facts.ts:92` reads active facts directly
  from `mem_facts` using `superseded_by IS NULL`.
- `apps/agent-service/src/core/agency/resolve-evidence.ts:123` resolves fact
  evidence directly from `mem_facts`.
- `apps/agent-service/src/core/state/mind-items.ts:128` reads active Mind State
  items directly from `mind_state_items`.
- `apps/agent-service/src/core/context-composer.ts:85` uses the legacy Mind
  State block and its active-item reader when the existing capability gate
  permits influence.
- `apps/agent-service/src/core/memory/assemble.ts:36` assembles the current
  hot window as raw role-prefixed message text. It has no provider-bound C1
  source/corrected/history role.
- `apps/agent-service/src/core/memory/threads.ts:146` reads the hot window
  from unredacted `mem_messages`.

### Adjacent semantic consumers

- `apps/agent-service/src/core/agency/resolve-evidence.ts:52` is the existing
  Thought-selected evidence resolver.
- `apps/agent-service/src/core/cognition/worker.ts:628` writes Mind State
  through the current Mind State owner.
- `apps/agent-service/src/core/agency/motivations.ts` remains the existing
  motivation projection and is not changed in slice 0.
- `apps/agent-service/src/core/agency/thought.ts` remains the existing Thought
  owner and is not changed in slice 0.

No C1 module under the contract module map exists at this baseline. No
Metacognition directory or owner is introduced by this implementation.

## Slice 0 characterization

`apps/agent-service/src/core/memory/correction-revival.test.ts` records three
pre-C1 behaviors in isolated in-memory databases:

1. A legacy active fact remains returned after a correction-shaped owner
   message because no C1 correction admission or barrier exists.
2. A legacy active Mind State item remains returned by its current reader.
3. A correction-shaped hot-window message is passed as raw role-prefixed text
   without a provider-bound C1 context role.

These are baseline observations. They are not C1 acceptance claims and do not
authorize a correction, capability activation, promotion, or production use.

## Verification record

The focused characterization command is:

```text
npm test --prefix apps/agent-service -- src/core/memory/correction-revival.test.ts
```

The first invocation exited `1` during test collection because the clean
worktree's local `@composer-assistant/sandbox-broker` file dependency had no
`dist` package entry. The isolated prerequisite builds for the local sandbox
packages completed successfully. The same focused command was then rerun and
exited `0`: one test file passed and all three characterization tests passed.

The next slice must add the inert schema and run its failing schema test before
production migration code is written.
