# OFFLINE-HARNESS-01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `phase0:offline` genuinely network-isolated and requalify the existing AUTONOMY-PLUMBING-01 work.

**Architecture:** Reuse the existing `assertOutboundAllowed` process guard as the authoritative qualification gate, enabled only by `ASHLEY_PHASE0_OFFLINE=true`. Add a Vitest-level fetch/http/https guard as defense-in-depth, and reuse the existing route-aware deterministic qualification fixture for the two unmocked delivery tests. Scope `COMPOSER_ENV_FILE=config/env.example` to the phase0 offline child process only.

**Tech Stack:** PowerShell phase0 launcher, TypeScript, Vitest, Node `fetch`/`http`/`https`, existing Ashley model-routing and qualification fixtures.

## Global Constraints

- `PHASE0:OFFLINE -> ZERO EXTERNAL NETWORK`.
- `ASHLEY_PHASE0_OFFLINE=true` is the authoritative application-level boundary.
- Loopback may remain allowed only where an existing test legitimately needs it.
- Credentials present/absent/invalid must not affect offline qualification.
- No initiative, Thought policy, Recall, sandbox authority, Phase F, Mint, SSH, deployment, commit, or push changes.
- Preserve the existing dirty AUTONOMY-PLUMBING-01 worktree; do not reset, stash, discard, or rewrite it.

---

### Task 1: Add failing offline-boundary regression tests

**Files:**
- Create: `apps/agent-service/src/core/qualification/offline-harness.test.ts`
- Modify: `apps/agent-service/src/core/delivery/delivery.test.ts`

**Interfaces:**
- Consumes: existing `completeChat`, `expressSpeak`, `AppError`, `mistral-client-mock.ts`, and delivery runtime.
- Produces: executable proofs for pre-transport blocking, credential independence, deterministic fixture output, provider failure fixtures, and delivery fixture wiring.

- [x] **Step 1: Write the failing test**

  Add tests that expect `completeChat` to reject with the offline outbound code before any transport when `ASHLEY_PHASE0_OFFLINE=true`, both with an empty and a sentinel provider credential. Add a deterministic `expressSpeak` fixture test with no credential, a deterministic provider-error fixture test, and a child-process guard test that expects an external fetch attempt to exit nonzero with the guard marker. Import the existing qualification Mistral fixture in `delivery.test.ts` so its two runtime tests receive non-empty deterministic expression output.

- [x] **Step 2: Run the focused tests to verify the expected failure**

  Run from `apps/agent-service`:

  ```powershell
  npx vitest run src/core/qualification/offline-harness.test.ts src/core/delivery/delivery.test.ts --testTimeout=10000 --hookTimeout=10000 --reporter=dot
  ```

  Expected: the offline boundary and child guard tests fail because the authoritative gate and guard do not yet exist; the delivery fixture import is not yet present.

### Task 2: Implement the authoritative outbound gate and network guard

**Files:**
- Modify: `apps/agent-service/src/core/continuity/process-guards.ts`
- Create: `apps/agent-service/src/core/qualification/offline-network-guard.ts`

**Interfaces:**
- Consumes: `ASHLEY_PHASE0_OFFLINE` and existing process-level outbound guard calls.
- Produces: `assertOutboundAllowed` rejection before provider/curiosity transport and a Vitest-installable guard for `fetch`, Node `http`, and Node `https`.

- [x] **Step 1: Add the dynamic offline branch to `assertOutboundAllowed`**

  Check `process.env.ASHLEY_PHASE0_OFFLINE === "true"` before the existing eval-fork branch and throw a stable `offline_network_blocked:<purpose>` error. Do not alter behavior when the variable is absent or false.

- [x] **Step 2: Add the defense-in-depth guard**

  Patch global `fetch` plus CommonJS Node `http`/`https` request/get functions through a reversible installer. Permit loopback hosts and Unix socket options; reject external targets, print only a stable marker and safe target metadata, record the attempt, and set `process.exitCode = 1`. Auto-install only when `ASHLEY_PHASE0_OFFLINE=true`.

- [x] **Step 3: Run the focused tests to verify green**

  ```powershell
  npx vitest run src/core/qualification/offline-harness.test.ts src/core/delivery/delivery.test.ts --testTimeout=10000 --hookTimeout=10000 --reporter=dot
  ```

  Expected: all offline-harness and delivery tests pass with no external request.

### Task 3: Isolate the phase0 offline launcher

**Files:**
- Modify: `scripts/phase0/run-all.ps1`
- Modify: `apps/agent-service/package.json`

**Interfaces:**
- Consumes: the existing offline tier selection.
- Produces: `phase0:offline` invoking the full agent suite with the offline setup file and an explicit example environment source only in that subprocess.

- [x] **Step 1: Add an offline Vitest script**

  Add `test:offline` using the existing single-worker Vitest command and a
  dedicated `vitest.offline.config.ts` setup file. The installed Vitest CLI
  does not support the `--setupFiles` flag.

- [x] **Step 2: Scope offline environment variables in `run-all.ps1`**

  In the `offline` branch, set `ASHLEY_PHASE0_OFFLINE=true` and `COMPOSER_ENV_FILE` to `Join-Path $Root "config\\env.example"` before invoking `npm run test:offline --prefix ...`. Leave normal `agent` and `full` tiers and normal startup environment precedence unchanged.

- [x] **Step 3: Run the launcher with an explicit timeout**

  ```powershell
  npm run phase0:offline
  ```

  Expected: build succeeds, the full agent Vitest suite completes, and the launcher prints `OK offline tier` without any network guard marker.

### Task 4: Document the qualification boundary

**Files:**
- Create: `docs/qualification/Offline_Qualification_Network_Isolation_v1.md`
- Modify: `docs/architecture/initiative/Initiative_Production_Path_Audit_v1.md`

- [x] **Step 1: Record the prior defect and exact chain**

  Document the old `.env` fallback, the delivery test import path, the Mistral SDK/global-fetch boundary, and the prior HTTP 402 without exposing credentials.

- [x] **Step 2: Record the new boundary and loopback policy**

  State that the application gate is authoritative, the runner guard is defense-in-depth, external network is forbidden, and loopback/Unix sockets are allowed only for existing local tests.

- [x] **Step 3: Record verification without changing AUTONOMY-PLUMBING conclusions**

  Preserve the existing initiative/sandbox/Phase F conclusions and add exact offline-harness, phase0, focused, build, and diff-check evidence.

### Task 5: Final verification and diff audit

**Files:**
- Inspect all current tracked and untracked worktree changes; do not discard or rewrite pre-existing work.

- [x] **Step 1: Run focused OFFLINE-HARNESS tests**

  ```powershell
  npx vitest run src/core/qualification/offline-harness.test.ts src/core/delivery/delivery.test.ts --testTimeout=10000 --hookTimeout=10000 --reporter=dot
  ```

- [x] **Step 2: Re-run `phase0:offline`**

  ```powershell
  npm run phase0:offline
  ```

  If it exposes an unrelated failure after network isolation is proven, stop and report it without product changes.

- [x] **Step 3: Re-run affected AUTONOMY-PLUMBING tests**

  Run the existing initiative/Agency/Thought/runtime, sandbox client, and sandbox-broker focused suites with explicit empty-provider configuration where needed.

- [x] **Step 4: Run required package builds**

  ```powershell
  npm run build --prefix apps/agent-service
  npm run build --prefix apps/sandbox-broker
  npm run build --prefix apps/discord-bot
  ```

- [x] **Step 5: Audit the final worktree**

  ```powershell
  git diff --check
  git diff --name-only
  git diff --stat
  git status --short
  ```

  Do not commit or push.
