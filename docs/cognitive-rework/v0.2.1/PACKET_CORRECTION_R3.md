# Packet correction R3 (post second independent NO-GO)

This file is a reviewer aid. Frozen contracts live in the specification, storage matrix, and phase files. Do not implement from this changelog.

Independent review of packet R2.1 SHA `9f6776c013b6c16a662b638b6409e1a9c3d08f94`: **NO-GO FOR LUNA MAX EXECUTION**. Architecture v0.2.1 was **not** rejected.

R2.1 Thought/Agency, Discord ingress split, ThoughtStepOutput, same-SHA qualification, bounded Q3, freeze-before-qual, shadow authorization, outbox/import concepts, and owner acceptance authority remain frozen.

## Status

**Architecture:** `ACCEPTED ARCHITECTURE / IMPLEMENTATION PLANNED`

**Execution until R3 independent review PASSES:** `BLOCKED — PACKET R3 AWAITING INDEPENDENT REVIEW`

**Owner Gate A:** still `UNSET`. Do not select M / C / Other. After R3 review PASSES, Doc selects the implementation baseline; then source-map revalidation.

## Corrections applied

1. Split `ThoughtSettlementDraft` from `PublishedCognitiveSettlement`. Thought JSON must not contain `finalLicensedText`.
2. Nested cycle/generation identity must equal envelope and active snapshot or the step is STALE/MALFORMED.
3. Complete sidecar v1 DDL: authority epoch, memory supports, admission log, evidence lineage keys, in-flight idempotency, nomination fence fields, concern/occupancy/trigger vocabulary, occupancy `quarantined`.
4. `MemoryKind` + `MemorySupport` rows; views without LLM reinterpretation.
5. LearnedSelf: **Option B** — no automatic accumulation writer in this reconstruction; post-cutover maturation.
6. Outbox `nuclearReservationId` nullable; state machine includes `projecting` / `projected` / `suppressed_shadow`; nuclear translation table.
7. `ConversationId` = nuclear `thread_id`; `DeliveryIntent` distinguishes reactive vs proactive lanes.
8. `ExternalizationGate` KEEP mechanical pause/cap/availability/idle-floor; retire `urgent_grounded` as a semantic skip.
9. Strategy A: idempotent utterance evidence projection into `mem_messages` after cutover; slash surfaces KEEP.
10. Slash `/remember` and idle scheduler wiring moved to Phase 08 (Phase 10 remains no source).
11. Nuclear additive `cognitive_v021_outbox_id` is a real `NUCLEAR_SUPPORTED_VERSION + 1` migration after Gate A.
12. `renderForTransport` runs **before** `finalLicensedText` is published.
13. Shadow outbox is never sendable after cutover (`suppressed_shadow`).
14. Shadow evidence: owner ingress + **legacy delivered Ashley text**; candidate drafts are evaluation-only.
15. Replicator does not duplicate owner ingress.
16. Shadow/legacy ingress failure must not block legacy replies.
17. Cutover discards candidate semantic shadow state; conversation evidence of delivered reality may survive.
18. Q4 is isolated Mint (not production `update.sh`).
19. Shadow real-Thought call/cycle/duration budgets.
20. Private cognition mechanical compute budget.
21. Candidate freeze SHA is the source commit; runtime artifacts are gitignored.
22. Gate R publishes `review/cognitive-v021-candidate-<shortsha>` (no merge).
23. Durable inbox consumer protocol; 202 means durable work.
24. `SystemNoticeOutbox` + non-Ashley wording.
25. Dispatch rechecks active generation (`STALE_GENERATION`).
26. Ingress uses `detectCredentialShape`; no raw credential persist.
27. Ashley-role conversation evidence is delivery-truth.
28. Qualification commands use working `npm exec --prefix` / `npm run build:*`.
29. `MAX_THOUGHT_PASSES` counts accepted semantic passes, not cancelled compose attempts.

## Not selected

Implementation baseline SHA. Production code. Cutover.
