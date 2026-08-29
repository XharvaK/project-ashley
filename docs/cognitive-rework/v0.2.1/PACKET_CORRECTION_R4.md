# Packet correction R4 (post third independent NO-GO)

This file is a reviewer aid. Frozen contracts live in the specification, storage matrix, and phase files. Do not implement from this changelog.

Independent review of packet R3 SHA `de1f0fab20fd2faa56609ef07630075bf78fad7f`: **NO-GO FOR LUNA MAX EXECUTION**. Architecture v0.2.1 was **not** rejected.

R3 type-split, generation fencing, sidecar v1 DDL direction, quota, shadow suppressed outbox, durable inbox, isolated Q4, freeze identity, and Gate-R remain frozen.

## Status

**Architecture:** `ACCEPTED ARCHITECTURE / IMPLEMENTATION PLANNED`

**Execution until R4 independent review PASSES:** `BLOCKED — PACKET R4 AWAITING INDEPENDENT REVIEW`

**Owner Gate A:** still `UNSET`. Do not select M / C / Other.

## Identities (do not conflate)

| Identity | Meaning |
|---|---|
| `APPROVED_PACKET_REVIEW_SHA` | Independently accepted packet/governance tree (after R4 PASS = that exact commit) |
| `OWNER_SELECTED_SOURCE_BASELINE_SHA` | Doc’s production-line source checkout (M / C / Other) |
| `IMPLEMENTATION_START_SHA` | Docs-only binding commit: packet tree materialized onto a branch from the source baseline |
| `CANDIDATE_SHA` / `QUALIFIED_SHA` / `DEPLOYED_SHA` | Later freeze / qualification / production |

## Corrections applied

1. Deterministic packet-binding onto the owner-selected source baseline (checkout packet paths; do not cherry-pick). Phase 00 starts at `IMPLEMENTATION_START_SHA`.
2. `DataClassification` is the source type: `ordinary` \| `sensitive` \| `never_public` \| `secret`. No `internal`.
3. Discord-id identity table; drop JSON `$[0]` uniqueness. Edits keep the same Discord mapping.
4. `resolveActiveThread` is the **only** permitted shadow nuclear continuity write (conversation identity). Not semantic meaning.
5. One live Memory plane: `sidecar_memory_assertions` + `sidecar_memory_supports`. Slash commands remapped. `/forget` must hit sidecar authority, not only `mem_messages`.
6. `effect_receipts` table; `InFlightRecord.originJobId` nullable; no “or payload_json.”
7. `SystemNoticeOutbox` type + routing; ledger `thoughtUnavailable`.
8. `MemorySupport.provenance` `native` \| `legacy_import`; conversation evidence dedupe at cutover.
9. Quarantined ≠ admitted ≠ influential. LearnedSelfSlice is empty or already-admitted only.
10. Cutover mutations only inside the maintenance fence (services stopped).
11. Flat parser wraps `ThoughtSettlementDraft`, not published settlement.
12. `DeliveryIntent.trigger` includes `recovery` and `operation_completion`.
13. Deferred proactive outbox revalidates before later projection.
14. Phase 00 current pins use `NUCLEAR_SUPPORTED_VERSION` only.

## Not selected

Implementation baseline SHA. Production code. Cutover. Gate A remains UNSET.
