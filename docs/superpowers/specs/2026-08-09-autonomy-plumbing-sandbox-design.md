# Autonomy Plumbing 01 Sandbox Design

## Goal

Close the confirmed delegated nonce and readiness defects through existing
broker ownership while preserving fail-closed isolation and leaving normal
runtime task admission unchanged.

## Design

`SandboxBroker` will inject a `reserve` adapter backed by its existing
`BrokerStore.recordNonce`. `DurableBrokerStore` already provides synchronous
unique insertion, persistence, reopen recovery, and rollback on persistence
failure; the delegated runtime must use that same store instead of a process-
local `Set`.

`DelegatedRuntime.readiness()` will compute `ready` from enabled/initialized
material, a valid executable-capable recipe set, and
`networkIsolation.status() === "operational"`. The existing isolation provider
still performs the final `prepare()` check immediately before the only spawn
path. The Unix client will require and validate the isolation-operational field
and all readiness material before returning `ready: true`; malformed or
incomplete responses remain false.

No new database, nonce cleanup policy, task schema, production operator
adapter, capability promotion, or normal runtime caller will be added. Phase F
will be documented as blocked if the existing source still exposes only the
fixture diagnostics boundary to the sandbox loop.

## Verification

Use disposable broker stores for same-process replay, reopen replay,
concurrent duplicate use, persistence failure, and no-spawn refusal. Exercise
broker readiness with operational/unavailable isolation and empty/unsupported
recipes. Exercise the Unix client with valid, false, malformed, and missing
readiness fields. Run sandbox-broker tests/build and the existing offline
qualification suites.
