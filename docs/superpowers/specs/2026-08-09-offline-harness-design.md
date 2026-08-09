# OFFLINE-HARNESS-01 Design

**Goal:** Make `phase0:offline` deterministic and fail-closed against external network access without changing Ashley product behavior.

## Boundary

`ASHLEY_PHASE0_OFFLINE=true` is the authoritative qualification-only semantic boundary. The existing `assertOutboundAllowed` process guard will reject outbound provider and curiosity transport before provider initialization or network transport. The default path remains unchanged when the variable is absent or false.

The phase0 offline launcher will set `COMPOSER_ENV_FILE` to the repository `config/env.example` only in the child-process context used for that offline run. Normal Ashley startup and environment precedence remain unchanged.

## Defense in depth

A Vitest setup guard will intercept external `fetch`, Node `http`, and Node `https` calls. It will allow legitimate loopback HTTP and existing Unix-domain socket tests, but any external attempt will emit a stable failure marker, set a failing process exit code, and reject/throw. The guard is a regression detector, not the semantic offline gate.

The current Mistral SDK path uses global `fetch`; direct `undici` use is not present in the relevant application path. Node HTTP/HTTPS interception covers bypasses through those built-ins.

## Deterministic fixtures

The two delivery tests that currently invoke the real runtime will use the existing route-aware qualification fixture. It returns non-empty expression output and structured Thought-shaped output where required, preserving delivery reservations, bubble planning, and ledger assertions without a provider.

Dedicated offline-harness tests will prove:

- provider completion is rejected before transport in offline mode;
- a present credential cannot enable transport;
- missing credentials still permit deterministic fixture tests;
- an unexpected external request fails loudly;
- provider-like failures are represented by deterministic fixtures;
- fixture-backed output remains meaningful and non-empty.

## Scope exclusions

No initiative behavior, Thought policy, Recall state, capability promotion, master mode, sandbox authority, production database, Mint host, Discord traffic, Phase F admission, or deployment behavior changes.
