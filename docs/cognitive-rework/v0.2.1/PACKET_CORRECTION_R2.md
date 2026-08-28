# Packet correction R2 (post independent NO-GO)

This file is a reviewer aid. Frozen contracts live in the other packet files. Do not implement from this changelog.

Independent review verdict on the first packet: **NO-GO FOR LUNA MAX EXECUTION**. Architecture v0.2.1 was **not** rejected.

## Corrections applied

1. Owner-accepted architecture status; Thought vs Agency split frozen in glossary, freeze, roadmap, Cross-Phase, Constitution banner, index.
2. Discord ingress redesigned: durable admit is not behind `ChannelQueue` + `/chat/text` wait. Bot→agent integration test required.
3. Thought step protocol: `ThoughtStepOutput` discriminated union; compose/preempt may restart model attempts; accepted generation ≠ raw call count.
4. `completeChat` adapter retains required `attentionDb` (`CognitiveDispatchOptions`).
5. All live-capable source exists in Phases 00–08. Candidate freeze is the last source-creating moment. Phases 09–11 are operations only.
6. Qualification identity: `QUALIFIED_SHA` must equal deployed SHA. Q1 exhaustive deterministic corpus. Q3 bounded inhabit witness of the configured Thought occupant (quota-aware). Isolated Mint, owner-authorized shadow, final unchanged-SHA pass. Real shadow and live Discord outrank extra synthetic API suites.
7. Outbox→nuclear delivery projector specified (idempotent, not cross-DB atomic). Legacy import tool specified.
8. Sidecar schema version frozen at 1. Authority field `withdrawalActive`. `finalLicensedText` is published speech.
9. Schema-v35 test inventory recorded (20 `NUCLEAR_SUPPORTED_VERSION.toBe(35)` pins plus additional `schemaVersion(...).toBe(35)` current-pins; live `NUCLEAR_SUPPORTED_VERSION = 41`).
10. Owner baseline gate: do not implement from detached HEAD. Execution blocked until Doc selects SHA.
11. Luna live outcomes: `PRODUCTION_WITNESSED / PROPOSED_FOR_ACCEPTANCE` | `WITNESS_INCOMPLETE` | `LIVE_DEFECT_FOUND`. Owner declares `PRODUCTION_ACCEPTED`. Grounded idle revisit is mandatory for acceptance.
12. Hard blockers 1–23 added.

## R2.1 — quota-aware Q3 (before second independent review)

Architecture qualification remains exhaustive and **deterministic**. Model-inhabitation witnessing is a **bounded** witness set (W1–W10), not the Q1 corpus on the live Thought API. No provider horse race. Retry-storm prevention is mandatory. Occupant change → OCCUPANT CONTRACT WITNESS only. Qualification artifacts report architecture / review / inhabit / Mint / shadow / final SHA **separately**. Owner/config quota ceilings (E12–E16) are recorded in `artifacts/QUOTA_BUDGET.md` before Q3.

Gate A is **unchanged**: still `UNSET`. This quota correction does not select M / C / Other.

## Execution status after R2.1

`BLOCKED_PENDING_OWNER_BASELINE_SELECTION` until [`OWNER_BASELINE_GATE.md`](OWNER_BASELINE_GATE.md) is filled. Packet text is otherwise intended for second independent review.
