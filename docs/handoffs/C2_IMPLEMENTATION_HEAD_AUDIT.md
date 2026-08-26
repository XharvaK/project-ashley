# C2 Implementation-HEAD Predecessor Audit

**Audited HEAD:** `378e14b2a7dc1b61f0313e0729b2ac45dda666d6`

**Audited worktree:** `C:\Users\Xharv\Projects\ashley-cognitive-maturation-implementation`

**Audit date:** 2026-08-26

**Result:** `C2 PREDECESSOR AUDIT = PASS WITH LOCATOR DRIFT`

## Required predecessor checks

| Contract check | Current evidence | Result |
|---|---|---|
| C1 eligibility and deny-barrier readers | `memory/eligibility.ts` provides `influenceEligibleAt`, `episodeInfluenceEligibleAt`, `mindStateItemInfluenceEligibleAt`, and barrier readers. `memory/context-role.ts` provides current, historical, and corrected source labels. | PASS |
| C1 hot-window role rendering | `memory/threads.ts` annotates fetched messages. `memory/context-role.ts` renders `memory_context_role`, assertion ids, and correction ids into message content. | PASS |
| Model Fabric projection seam | The accepted packet names `core/model-fabric/projection.ts`, but this implementation HEAD has no `core/model-fabric` source directory and `completeChat` sends `ChatMessage[]` directly into the attention/provider path. | LOCATOR DRIFT |
| `completeChat` dispatch funnel | `src/mistral-client.ts` is the single provider dispatch funnel used by the enrolled Thought and Expression paths. | PASS |
| Privacy helper | `privacy/classification.ts` provides `canEnterModelContext`; current source search showed no enrolled-path callers. C2 will use this helper rather than fork one. | GAP TO CLOSE |
| Capability registration | `rollout/capabilities.ts` has `memory_evidence` but no `context_budget`; C2 will add `context_budget` as default `observe` with no promotion or live apply. | GAP TO CLOSE |
| Current schema | `core/db.ts` reports `NUCLEAR_SUPPORTED_VERSION = 35`; C1 is committed and the C2 migration must advance the source-derived schema to 36. | PASS |
| Thought composition | `agency/thought.ts` truncates candidates with `motivations.slice(0, 12)` and Pass 2 can include unbounded `contentUtf8`. | GAP TO CLOSE |
| Expression composition | `context-composer.ts`, `memory/assemble.ts`, and `conversation/expression.ts` can include overlapping hot-window material in the system prompt and history. | GAP TO CLOSE |
| Expression fallback | `conversation/expression-fallback.ts` creates a second message set without a distinct allocation request/receipt. | GAP TO CLOSE |
| Provider adapters | Mistral, Groq, and NIM map only `role`, `content`, and image parts. C2 must prove the C1 labels survive the provider-bound mapping. | PASS / WITNESS REQUIRED |
| Legacy callers | Cognition worker, Curiosity consolidation, Reflection OCI adjudication, and engineering model adapter remain outside the exact C2 enrollment boundary. | PASS / MUST REMAIN EXCLUDED |

## Semantic conclusion

The C1 implementation at this HEAD matches its local settlement and remains
the authority for currentness, provenance, barriers, corrections, and forgetting.
The only predecessor mismatch is the absent minimal Model Fabric projection
implementation assumed by the C2 packet. This is an implementation seam gap,
not a route, authority, privacy, or architecture contradiction. C2 will close
the seam with a minimal immutable projection builder and `completeChat` fill;
it will not implement Model Fabric routing, profiles, specialists, fallback
policy, or qualification.

No C1 redesign is required. No C1 focused campaign is rerun for this audit.

## C2 boundaries carried forward

- `context_budget` remains `observe` and unpromoted.
- Dark-apply is fixture-only.
- C2 enrolls Thought, Expression primary, and Expression fallback as a distinct
  request.
- Other `completeChat` callers remain `legacy_unbudgeted` and unqualified.
- `LOCAL PERSISTENCE != LOCAL INFERENCE`.
- `CONTEXT PROJECTION != MEMORY MUTATION`.
- `BUDGET PRESSURE != SEMANTIC INVALIDATION`.
- No provider calls, Mint access, deployment, activation, qualification,
  promotion, production mutation, or push are part of this implementation.
