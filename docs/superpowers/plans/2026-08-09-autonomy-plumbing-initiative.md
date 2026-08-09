# Autonomy Plumbing 01 Initiative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make proactive reservation claims retry-safe and expose deterministic owner-only silence diagnostics.

**Architecture:** `AshleyCore.tickProactive` owns one SQLite transaction spanning the initiative and delivery reservations. The delivery store provides a transaction-scoped insert helper and carries the existing decision ID. Diagnostics use the existing `kv` table as bounded metadata, not semantic memory.

**Tech Stack:** TypeScript, Node `node:sqlite` `DatabaseSync`, Vitest, existing nuclear SQLite schema.

## Global Constraints

- Preserve Identity → Mind State → Thought → Agency → Expression → Rendering ownership.
- Do not change capability gates, Recall, production databases, Mint, Discord traffic, providers, deployment, commit, or push.
- Do not expose model reasoning or raw provider errors through diagnostics.
- Keep tests disposable and deterministic.

---

### Task 1: Reproduce the orphaned initiative reservation

**Files:**
- Modify: `apps/agent-service/src/core/runtime.test.ts`

- [x] **Step 1: Write the failing test**

The test creates a grounded question, installs a disposable SQLite trigger that
rejects only proactive delivery inserts, runs the real `AshleyCore.tickProactive`
flow, and asserts that no uncommitted initiative reservation remains and a
second tick can retry.

- [x] **Step 2: Run test to verify it fails**

Run from `apps/agent-service`:

```powershell
npm test -- --run src/core/runtime.test.ts -t "rolls back the initiative reservation"
```

Observed failure: one uncommitted initiative reservation remained instead of
zero. This proves the initiative insert is outside the delivery claim
transaction.

### Task 2: Make initiative and delivery claims atomic

**Files:**
- Modify: `apps/agent-service/src/core/delivery/store.ts`
- Modify: `apps/agent-service/src/core/runtime.ts`
- Test: `apps/agent-service/src/core/runtime.test.ts`

**Interfaces:**
- Produce `claimProactiveDeliveryInTransaction(db, input)` for an already-open
  transaction, with `input.decisionId: number`.
- Preserve `claimProactiveDelivery(db, input)` as a transaction-owning wrapper.

- [x] **Step 1: Add the transaction-scoped failing boundary test**

Keep the trigger test from Task 1 as the regression test and add assertions that
the successful retry has a delivery row whose `decision_id` equals the
initiative row's `decision_id`.

- [x] **Step 2: Run the focused test and confirm the existing failure**

```powershell
npm test -- --run src/core/runtime.test.ts -t "rolls back the initiative reservation"
```

- [x] **Step 3: Implement the smallest transaction helper**

Factor proactive row/bubble insertion into a helper that does not begin or
commit. Make the standalone wrapper begin/commit around it. In
`tickProactive`, begin `BEGIN IMMEDIATE`, insert `initiative_reservations`, call
the transaction-scoped delivery helper with `decisionId`, commit, and roll back
both rows on any error.

- [x] **Step 4: Run the focused test to verify the fix**

```powershell
npm test -- --run src/core/runtime.test.ts -t "rolls back the initiative reservation"
```

Expected: PASS; no orphan row and the retry produces a draft.

### Task 3: Add deterministic proactive diagnostics

**Files:**
- Modify: `apps/agent-service/src/core/runtime.ts`
- Modify: `apps/agent-service/src/core/runtime.test.ts`
- Modify: `apps/discord-bot/src/agent-client.ts`

- [x] **Step 1: Write failing diagnostics tests**

Cover `proactive_paused`, `daily_cap`, `unavailable`, `no_material`,
Thought silence, `mistral_unavailable`, `empty_draft`, reservation conflict,
and delivery claim failure. Assert only `lastDiagnostic.stage`, `code`, and
the presence of a timestamp; assert `evaluateProactive` does not create or
change the diagnostic.

- [x] **Step 2: Run the diagnostics tests to verify they fail**

```powershell
npm test -- --run src/core/runtime.test.ts -t "proactive diagnostic"
```

- [x] **Step 3: Implement metadata-only diagnostics**

Store `{ at, stage, code }` under an owner-specific `kv` key. Record closed
codes at tick gate returns and deterministic downstream transitions. Extend the
existing owner-only status return and Discord client type without adding a new
endpoint or exposing hidden reasoning.

- [x] **Step 4: Run the diagnostics tests to verify they pass**

```powershell
npm test -- --run src/core/runtime.test.ts -t "proactive diagnostic"
```

### Task 4: Run initiative regression verification

**Files:**
- Test: `apps/agent-service/src/core/runtime.test.ts`
- Test: `apps/agent-service/src/core/agency/proactive-eligibility.test.ts`
- Test: `apps/agent-service/src/core/qualification/wave4-proactive-boundary.test.ts`

- [x] **Step 1: Run focused suites**

```powershell
npm test -- --run src/core/runtime.test.ts src/core/agency/proactive-eligibility.test.ts src/core/qualification/wave4-proactive-boundary.test.ts
```

- [x] **Step 2: Confirm no capability or Recall state changed**

Use only the disposable test databases and inspect `git status --short`; no
production database or capability promotion command is permitted.

No commit or push is performed.
