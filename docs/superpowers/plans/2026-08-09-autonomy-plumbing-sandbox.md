# Autonomy Plumbing 01 Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make delegated nonce use durable and delegated readiness truthful without inventing a production task-admission authority.

**Architecture:** The broker injects its existing `BrokerStore.recordNonce` into the delegated runtime. Readiness is an aggregate of valid runtime material, supported recipe capacity, and operational network isolation; the broker’s final `prepare()` call remains the spawn gate. The normal agent sandbox loop is inspected and documented, not widened.

**Tech Stack:** TypeScript, Node `node:sqlite` `DatabaseSync`, Vitest, existing Unix broker protocol and fixed-recipe execution service.

## Global Constraints

- `NO ISOLATION -> NO READY` and `NO ISOLATION -> NO SPAWN`.
- Preserve broker-final authorization, fixed recipes, owner/signer/policy checks, and fail-closed persistence.
- Reuse `broker.db`; add no new semantic store or generic task schema.
- Keep delegated activation disabled and local/disposable; do not use Mint, SSH, keys, providers, or production state.
- Do not commit or push.

---

### Task 1: Prove the current process-local nonce defect

**Files:**
- Create: `apps/sandbox-broker/src/delegated-runtime-wiring.test.ts`
- Modify: `apps/sandbox-broker/src/broker.ts`

- [x] **Step 1: Write the failing wiring test**

Construct a disposable `DurableBrokerStore`, create the existing delegated
runtime fixture, authorize one valid envelope through the broker, reopen the
store/runtime with the same `broker.db`, and assert that the same nonce is
refused before execution. Add a concurrent duplicate assertion with exactly one
successful authorization and a runner counter that remains zero for refused
replays.

- [x] **Step 2: Run the test and verify the current failure**

```powershell
npm test -- --run src/delegated-runtime-wiring.test.ts
```

Expected before the fix: the reopened delegated runtime accepts the nonce
again because `broker.ts` injects `createRuntimeNonceStore()`.

- [x] **Step 3: Inject the existing durable store**

Remove the process-local runtime nonce import and pass
`nonceStore: { reserve: (nonce) => this.store.recordNonce(nonce) }` from
`SandboxBroker.buildDelegatedRuntime`.

- [x] **Step 4: Run the wiring test to verify the fix**

```powershell
npm test -- --run src/delegated-runtime-wiring.test.ts
```

Expected: one winner, durable replay refusal after reopen, and zero child
spawns for the replay.

### Task 2: Verify durable nonce failure and context invariants

**Files:**
- Modify: `apps/sandbox-broker/src/delegated-runtime-wiring.test.ts`
- Test: `apps/sandbox-broker/src/store/durable-store.test.ts`

- [x] **Step 1: Add failure/context tests**

Use a disposable failing `flush` subclass to assert storage failure returns
false and leaves no in-memory nonce. Use distinct owner/signer/policy envelopes
and expired/cleanup cases to assert refusal remains closed and no spawn occurs.

- [x] **Step 2: Run the nonce suites**

```powershell
npm test -- --run src/delegated-runtime-wiring.test.ts src/store/durable-store.test.ts src/failure-injection.test.ts
```

### Task 3: Make broker readiness truthful

**Files:**
- Modify: `apps/sandbox-broker/src/delegated/runtime.ts`
- Create or modify: `apps/sandbox-broker/src/delegated-runtime-wiring.test.ts`

- [x] **Step 1: Write failing readiness tests**

Assert readiness is false for unavailable isolation, empty/unsupported recipe
capacity, and incomplete material; assert it is true only for operational
isolation plus valid material and supported capacity.

- [x] **Step 2: Run the readiness tests to verify the current failure**

```powershell
npm test -- --run src/delegated-runtime-wiring.test.ts
```

Expected before the fix: `ready` is true even when isolation is unavailable.

- [x] **Step 3: Compute aggregate readiness**

Set `networkIsolationOperational` from the provider, set capacity from at least
one supported recipe, validate non-empty key/policy material, and derive
`ready` from all required conditions. Leave execution’s immediate `prepare()`
revalidation unchanged.

- [x] **Step 4: Run readiness tests**

```powershell
npm test -- --run src/delegated-runtime-wiring.test.ts
```

### Task 4: Make the Unix client reject incomplete readiness

**Files:**
- Modify: `apps/agent-service/src/core/sandbox/unix-broker-client.ts`
- Create: `apps/agent-service/src/core/sandbox/unix-broker-client.test.ts`

- [x] **Step 1: Write failing client tests**

Return readiness responses with false, malformed, missing, and operational
isolation fields. Assert only a complete response with enabled/ready/material,
operational isolation, and positive supported capacity yields `ready: true`.

- [x] **Step 2: Implement validation**

Require boolean `networkIsolationOperational`, include it in the client
snapshot, and derive client readiness from all broker-reported conditions.

- [x] **Step 3: Run client tests**

```powershell
npm test -- --run src/core/sandbox/unix-broker-client.test.ts
```

### Task 5: Verify Phase F and package regression suites

**Files:**
- Test: `apps/sandbox-broker/src/delegated-runtime-wiring.test.ts`
- Test: `apps/agent-service/src/core/sandbox/unix-broker-client.test.ts`

- [x] **Step 1: Run affected sandbox suites**

```powershell
npm test -- --run src/store/durable-store.test.ts src/failure-injection.test.ts src/delegated-runtime-wiring.test.ts
```

- [x] **Step 2: Run agent sandbox suites**

```powershell
npm test -- --run src/core/sandbox/unix-broker-client.test.ts src/core/sandbox/availability-probe.test.ts src/core/sandbox/loop.test.ts
```

- [x] **Step 3: Build both packages**

```powershell
npm run build --prefix apps/sandbox-broker
npm run build --prefix apps/agent-service
```

- [x] **Step 4: Record Phase F**

Document the existing loop’s required fixture-only policy/path diagnostics and
the absence of a production Ashley-owned task/admission producer. Do not add a
generic task schema, operator authority, or normal runtime caller merely to
remove the block.
