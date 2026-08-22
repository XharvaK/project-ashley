# Sandbox Correction Audit Follow-ups

Status: deferred. No non-Sandbox fixes are included in the Sandbox correction candidate.

## PRE-MODEL-FABRIC TARGETED HARDENING

- Add adapter-boundary tests for Mistral, Groq, and any new provider path. Capture the outbound model, signal, provider response usage, provider identity, error mapping, and single-dispatch/fallback behavior at the transport seam.
- Verify attention quota admission and concurrency atomically across file-backed SQLite connections before treating Model Fabric dispatch guarantees as proven.

## OPERATIONAL-CONTINUITY HARDENING

- Exercise delivery restart, acknowledgement-loss, duplicate-webhook, stranded-reservation, and weekly-review claim recovery against persisted state.
- Exercise migration and restart recovery with close/reopen file-backed databases, including partial-failure and WAL/busy-timeout behavior.

## LATER / VERIFY FIRST

- Reproduce before changing: curiosity reentrancy, real abort/deadline propagation, route-surface drift, provider error fixtures, `env.example` enum drift, backup manifest checks, and Discord send-failure paths.
- Treat source-grep, same-user OS stubs, fake-clock-only, and provider-echo tests as non-witnesses for the corresponding production property until a lower-layer or real-host boundary is exercised.
