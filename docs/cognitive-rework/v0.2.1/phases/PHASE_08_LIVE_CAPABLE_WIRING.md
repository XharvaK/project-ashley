# Phase 08 — Live-capable wiring and candidate freeze

## GOAL

Complete **all functional source required for live operation**, still disabled by configuration. Then **candidate freeze**. No later phase may add dispatcher, health fields, ingress wiring, projector hooks, shadow mode, import CLI invocation, or recovery hooks.

## ARCHITECTURAL LAWS IMPLEMENTED

S24 (flag-gated; candidate cannot speak until cutover), S25, S26, S27 (ingress+fence live-wired).

## DEPENDENCIES

Phase 07 PASS. Import tool and outbox projector already exist (Phases 05–06).

## CURRENT SOURCE STATE

Kernel complete in sidecar tests. Discord may still wait on `/chat/text` in production until this phase’s bot wiring. `ASHLEY_COGNITIVE_KERNEL` default `legacy`.

## TARGET SOURCE STATE

Source (flag-gated, default legacy):

- `POST /chat/ingress` used by Discord **outside** ChannelQueue
- `createMessageCreateHandler` live in `index.ts`
- `cognitive-v021/dispatch/live.ts` maps ingress → kernel → projector
- `runtime.ts` / `agent.ts`: if `v021` use live dispatch; if `shadow` run kernel capture-only **in parallel with** legacy `/chat/text` path without blocking ingress; if `legacy` skip kernel
- `getHealth` / snapshot include `cognitiveKernel`, sidecar schema version, sidecar path (no secrets)
- Shadow: candidate never calls Discord send; never writes nuclear **semantic** stores (outbox projector **off** in shadow). **Exception:** `resolveActiveThread` may UPDATE/INSERT `mem_threads` (conversation identity only).
- Recovery hooks on sidecar open
- Import CLI and cutover rehearsal script exist
- Deploy scripts unchanged except they already honor env (no SHA rewrite)

Then: clean tracked tree. **Candidate SHA = that functional source commit** (`git rev-parse HEAD`). Do **not** embed that SHA in a tracked file inside the same commit. Write untracked `artifacts/runtime/CANDIDATE_FREEZE.md` pointing **to** the SHA. Push Gate R review ref (QUALIFICATION_PROTOCOL Q2).

## FILES TO CREATE

- `cognitive-v021/dispatch/live.ts` + tests
- `cognitive-v021/cycle/inbox-consumer.ts` + tests (durable claim/lease)
- `cognitive-v021/shadow/replicator.ts` + tests (**legacy delivery mirror only**)
- `cognitive-v021/shadow/runner.ts` + tests
- `cognitive-v021/dispatch/health.ts` + tests
- `cognitive-v021/evidence/compatibility-projector.ts` + tests
- Discord `/remember` flag-gated wiring + idle scheduler tick (cannot send until `v021`)
- `scripts/cognitive-v021/cutover-rehearsal.mjs` (isolated paths only)
- `scripts/cognitive-v021/dispose-shadow-semantic-state.mjs`

## FILES TO MODIFY

- `runtime.ts` — flag-gated branches only; default path remains legacy inversion
- `server.ts` — ingress already from Phase 01; health fields
- `env.ts` — already parses kernel flag
- `messageCreate.ts` / `agent-client.ts` — ingress outside queue
- `serve.ts` — open sidecar if shadow|v021

## FILES / PATHS THAT MUST NOT CHANGE

V1 broker enablement. Capability promotion as fake cutover. Production `.env` on Mint.

## INTERFACES CONSUMED

Full kernel, projector, import tool, ingress.

## INTERFACES PRODUCED

Live dispatcher (disabled), shadow runner (disabled), health fields, freeze record.

## DATABASE / MIGRATION CHANGES

None beyond already-specified nuclear `cognitive_v021_outbox_id` (must already exist from Phase 05).

## LEGACY COMPATIBILITY

Default `legacy`. Doc still hears Expression/decide path. Candidate speech impossible.

---

## TEST-FIRST TASK SEQUENCE

### Task 8.1 Ingress outside ChannelQueue (production wiring)

- [ ] Discord `onReady` calls `ingressChat` then returns from the ingress await **without** waiting on `chatText`
- [ ] If kernel `legacy`|`shadow`, enqueue `chatText`+send on ChannelQueue separately
- [ ] Integration test from Phase 03 still PASS against wired handler
- [ ] Commit: `feat(discord): durable ingress not serialized behind Thought`

### Task 8.2 Live dispatcher exists, default unused

- [ ] `dispatch/live.ts` `runLiveCognitiveTurn` tested with fakes
- [ ] `cognitiveKernel === "legacy"` → `handleReactiveChat` unchanged order
- [ ] `v021` → live dispatch (unit test with isolated DBs; do not enable on Mint)
- [ ] Commit: `feat(cognitive-v021): flag-gated live dispatcher`

### Task 8.3 Shadow isolation

- [ ] `shadow` mode: kernel runs; `projectOutbox` no-op; no Discord send from candidate
- [ ] Legacy still produces Doc-visible reply
- [ ] Shadow failure does not throw into live turn
- [ ] Commit: `feat(cognitive-v021): shadow runner cannot send Discord`

### Task 8.4 Health

- [ ] `getHealth` includes `cognitiveKernel`, sidecar schema 1 when open, sidecar path basename only
- [ ] Commit: `feat(cognitive-v021): health reports kernel and sidecar`

### Task 8.5 Cutover rehearsal script (isolated)

- [ ] Isolated copies only; **must not** invoke production `update.sh`
- [ ] Import dry-run, verify, projector crash tests, shadow dispose rehearsal, rollback copy
- [ ] Refuses reserved production paths
- [ ] Commit: `feat(cognitive-v021): isolated cutover rehearsal script`

### Task 8.6 Durable inbox consumer + shadow isolation

- [ ] Crash after 202: event processed on restart
- [ ] `shadow`/`legacy`: sidecar ingress throw does **not** block `chatText`
- [ ] `v021`: ingress failure fails closed (no silent legacy cognition)
- [ ] Shadow outbox rows are `suppressed_shadow`; never sendable after simulated cutover
- [ ] Replicator mirrors legacy **delivered** Ashley text; does not duplicate owner ingress
- [ ] Commit: `feat(cognitive-v021): durable consumer and shadow isolation`

### Task 8.7 Slash + scheduler live wiring

- [ ] `/remember` → `admitOwnerSuppliedClaim` when kernel `v021` (flag-gated)
- [ ] `/memory` summary → sidecar Memory views + mechanical evidence narrative when `v021`
- [ ] `/forget` → sidecar evidence+Memory redact/retract + compatibility cleanup + continuity tombstones when `v021`
- [ ] `/new` → nuclear archive+resolve; next ingress uses new ConversationId
- [ ] Idle scheduler ticks kernel when `shadow`|`v021` without sending in shadow
- [ ] Commit: `feat(cognitive-v021): remember memory forget new and idle scheduler flag-gated wiring`

### Task 8.8 CANDIDATE FREEZE

- [ ] Tracked `git status --porcelain` clean (HARD BLOCKER 5 if dirty)
- [ ] `CANDIDATE_SHA = git rev-parse HEAD` of the **functional source commit**
- [ ] Untracked `artifacts/runtime/CANDIDATE_FREEZE.md` points **to** that SHA (not committed inside it)
- [ ] Push `review/cognitive-v021-candidate-<shortsha>` at exactly that SHA (Gate R)
- [ ] After this commit: **no functional source changes**

## FULL PHASE GATE

```powershell
npm run build:agent
npm run build:discord
npm exec --prefix apps/agent-service -- tsc --noEmit
npm test --prefix apps/agent-service -- src/core/cognitive-v021
npm test --prefix apps/discord-bot -- src/handlers/messageCreate.ingress.integration.test.ts
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

All above green. Untracked freeze record exists. Default kernel still `legacy`. Shadow cannot send.

## AUTONOMOUS REPAIR POLICY

Repair wiring/tests. Do not enable `v021` on Mint.

## HARD BLOCKERS

Shadow sends Discord. Live dispatcher reachable with default env. Dirty freeze. Missing live-capable source (would force Phase 10 code).

## OUTPUT ARTIFACT

`artifacts/runtime/PHASE_08_GATE.md` + `artifacts/runtime/CANDIDATE_FREEZE.md`

## NEXT PHASE PRECONDITIONS

Freeze recorded. Phase 09 is operations only.
