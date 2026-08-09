# Offline Qualification Network Isolation v1

Prepared: 2026-08-09

## Purpose

This document records the qualification-only repair for OFFLINE-HARNESS-01.
It does not authorize provider evaluation, production operation, Mint access,
Discord traffic, sandbox activation, capability promotion, or deployment.

## Prior defect

`npm run phase0:offline` invoked `scripts/phase0/run-all.ps1 -Tier offline`.
The offline branch built `apps/agent-service` and then ran the entire agent
Vitest suite. Two delivery tests entered the real reactive runtime without an
Expression completion fixture. Before this repair, the exact path was:

```text
phase0:offline
  -> scripts/phase0/run-all.ps1 -Tier offline
  -> npm test --prefix apps/agent-service
  -> core/delivery/delivery.test.ts
  -> AshleyCore.handleReactiveChat
  -> expressSpeak
  -> completeChat
  -> runAttentiveDispatch
  -> Mistral model adapter
  -> Mistral SDK chat.complete
  -> global fetch
  -> https://api.mistral.ai/v1/chat/completions
```

The runner also allowed `env.ts` to fall back to the user's normal
`COMPOSER_ENV_FILE`/home dotenv path. The resulting bounded reproduction made
one real provider attempt and received HTTP 402. No credential value is
recorded here, and no successful provider request was intentionally made.

## Offline boundary

The offline child process now sets:

```text
ASHLEY_PHASE0_OFFLINE=true
COMPOSER_ENV_FILE=<repository>/config/env.example
```

These variables are scoped to the `phase0:offline` launcher child. Normal
Ashley startup and its existing environment precedence are unchanged.

`assertOutboundAllowed` is the authoritative application boundary. In offline
mode it rejects provider and default curiosity transport before provider
transport can run. The existing evaluation-fork guard retains precedence when
both guards are active. Explicit injected fetchers/resolvers used by
deterministic network unit tests are fixture seams; they do not grant external
access, and the runner-level guard remains installed around them.

The two previously unmocked delivery tests now import the existing route-aware
qualification fixture. Dedicated OFFLINE-HARNESS tests cover non-empty
deterministic expression output, a structured provider-like failure fixture,
and both absent and present credential states without reading a secret.

## Defense-in-depth transport guard

`vitest.offline.config.ts` installs `offline-network-guard.ts` for the offline
suite. The guard rejects external:

- global `fetch` (the current Mistral SDK path uses this, through Node's
  undici-backed implementation);
- Node `http.request`/`http.get`; and
- Node `https.request`/`https.get`.

An unexpected attempt emits
`offline_external_network_blocked:<transport>:<safe-target>`, records no
query string or secret, sets a failing process exit code, and rejects or
throws. A child-process regression proof exercises all three transport
families and requires the nonzero result.

Local communication policy is explicit:

```text
LOCAL LOOPBACK ALLOWED: localhost, 127.0.0.1, ::1, and Unix socket paths
EXTERNAL NETWORK FORBIDDEN: every other HTTP/HTTPS target
```

The loopback allowance preserves legitimate in-process/local test fixtures;
it is not provider access.

## Verification

Final local qualification on the current worktree:

- `npm run phase0:offline`: PASS; 100 test files, 765 passed, 1 skipped;
  agent build passed; duration 187.95 seconds.
- Offline logs: zero `offline_external_network_blocked` markers and zero
  provider URL markers.
- OFFLINE-HARNESS-01 focused tests: 1 file, 5 passed.
- Delivery qualification focus: 1 file, 9 passed.
- Agency/Thought/runtime focus: 7 files, 42 passed.
- INIT-02 material-floor matrix: 1 file, 2 passed.
- Sandbox client focus: 2 files, 8 passed.
- Delegated broker wiring focus: 1 file, 4 passed.
- Agent-service, sandbox-broker, and discord-bot TypeScript builds: PASS.

All results are local/disposable qualification evidence. No Mint host,
production database, Discord gateway, live provider, SSH session, deployment,
capability promotion, Recall change, or commit/push was used.
