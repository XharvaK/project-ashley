# Packet correction R5 (post fourth independent NO-GO)

This file is a reviewer aid. Frozen contracts live in the specification, storage matrix, bind manifest, and phase files. Do not implement from this changelog.

Independent review of packet R4 SHA `7d7a3f6bd00dfc03a33a82c7d40550cfd9ffef6d`: **NO-GO FOR LUNA MAX EXECUTION**. Architecture v0.2.1 was **not** rejected.

R4 data-plane corrections remain frozen (canonical `DataClassification`, Discord id table, ThoughtSettlementDraft parser, one sidecar Memory authority, EffectReceipt store, SystemNoticeOutbox, import support provenance, quarantine non-influence, maintenance-fenced cutover, recovery DeliveryIntent, deferred proactive revalidation, timeless schema-41 instructions).

## Status

**Architecture:** `ACCEPTED ARCHITECTURE / IMPLEMENTATION PLANNED`

**Execution until R5 independent review PASSES:** `BLOCKED — PACKET R5 AWAITING INDEPENDENT REVIEW`

**Owner source baseline:** still `UNSET`. Do not select M / C / Other.

## Identities (do not conflate)

| Identity | Meaning | Storage |
|---|---|---|
| `APPROVED_PACKET_REVIEW_SHA` | Independently accepted packet/governance tree | ignored runtime artifact after PASS |
| `OWNER_SELECTED_SOURCE_BASELINE_SHA` | Doc’s production-line source checkout | Doc instruction + ignored artifact |
| `IMPLEMENTATION_START_SHA` | Docs-only bind commit on a branch from the source baseline | `git rev-parse HEAD` after bind; ignored artifact |
| `PACKET_BASE_SHA` | Overlay merge-base `c7c81c4` | [`PACKET_BIND_MANIFEST.md`](PACKET_BIND_MANIFEST.md) |
| `CANDIDATE_SHA` / `QUALIFIED_SHA` / `DEPLOYED_SHA` | Later freeze / qualification / production | ignored freeze/qualification artifacts |

Tracked Gate A is a template. It must not contain a self-referential execution SHA.

## Corrections applied

1. Canonical [`PACKET_BIND_MANIFEST.md`](PACKET_BIND_MANIFEST.md): `NEW_EXACT_FILE` vs `EXISTING_DOC_OVERLAY` vs `IGNORE_RULE_OVERLAY`. Three-way overlay. Same-hunk conflict is HARD BLOCKER. Production source must remain byte-identical to the selected baseline.
2. Gate A tracked file is law only. Execution identity writes to ignored `artifacts/runtime/IMPLEMENTATION_IDENTITY.md` after the bind commit, with no extra commit.
3. Semantic publication replay-idempotent: singleton meta; `UNIQUE(cycle_id, generation)` on settlements; `publishSemanticTransaction` returns existing publication; one speech outbox per speaking settlement; crash-after-publish replay test.
4. Global `DeliveryProjectionKey` (`speech:<id>` / `system:<id>`). Nuclear unique column `cognitive_v021_projection_key`.
5. `InFlightRecord` matches DDL: `correlationId` required; `replay_safe` removed from effects table (effects are not Observations).
6. Classification follows Observations and Memory. Inheritance via `maxClassification`. No downgrade. Secret never durable plaintext.
7. Retrieval distinguishes conversation log / live Memory / quarantined Memory. Quarantine is tagged and not always-on.
8. `/remember` is a mechanical persist directive. Thought authors `MemoryKind`. Admission does not reinterpret.
9. `V021_FORGET_TARGET_MATRIX` covers every content-bearing sidecar table. Preview → confirm → apply → tombstone.
10. Legacy import does not invent a sidecar Identity table. `admittedGeneration` is null for quarantined legacy rows.
11. All phase/Q commands freeze **FROM REPOSITORY ROOT**.
12. Storage matrix lists the new uniqueness and classification invariants.
13. Governing-document drift audit (implementation-status identity split only; no new architecture-acceptance event).

## Not selected

Implementation baseline SHA. Production code. Cutover. Gate A remains UNSET.
