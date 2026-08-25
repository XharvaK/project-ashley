# Project Ashley — Incident Repair Checkpoint
# Mind-State Authority & Speech-Grounding Repair

============================================================
1. INCIDENT EVIDENCE & IDENTIFIERS
============================================================

- **Incident Turn Timestamp**: 2026-08-25T19:07:37.491Z
- **Owner Turn**: `"Hey Ashley, what are you thinking about tonight?"`
- **Ashley Erroneous Output**: `"0.2.0"`
- **Decision ID**: `1331` (Decision Kind: `speak`, Operational Request: `project_inspection` on `package.json`)
- **Motivation IDs**: `[19590, 19588]`
  - `19590`: `user_message` (`"Hey Ashley, what are you thinking about tonight?"`)
  - `19588`: `callback` (`"inspect package.json and provide version"`)

============================================================
2. PRIMARY ROOT CAUSE & MODEL FABRIC NON-CAUSALITY
============================================================

- **Model Fabric Non-Causality**:
  - Model Fabric machinery was verified non-causal.
  - CURRENT Thought route ran (`qwen-2.5-32b-instruct` on Groq).
  - CURRENT Expression route ran (`mistral-small-latest` on Mistral).
  - TARGET route remained dark (no `ActivationRef` or `OwnerApprovalRef` existed).
- **Primary Root Cause**:
  - A stale Mind State concern from an earlier smoke interaction (`"inspect package.json and provide version"`) was included as motivation `19588` alongside user message `19590`.
  - Thought selected both motivations and emitted a `project_inspection` operational request.
  - The resulting observation (`"0.2.0"`) was rendered by Expression without any current conversational context anchoring the operational authority.

============================================================
3. ARCHITECTURAL INVARIANTS & REPAIR
============================================================

The following frozen architectural laws were implemented:

1. **PERSISTED MIND STATE != CURRENT TURN AUTHORITY**
2. **BACKGROUND MIND STATE MAY SURFACE != MAY EXECUTE**
3. **UNRESOLVED INTENTION != CURRENT OPERATIONAL AUTHORITY**
4. **EVIDENCE REF != FULFILLMENT**
5. **DELIVERY COMPLETE != MIND-STATE COMPLETE**
6. **THOUGHT OWNS COGNITION, EXPRESSION OWNS REALIZATION**

### Key Mechanisms:
- **Task Continuation Admission Gate** (`hasReactiveTaskContinuationAdmission` in `apps/agent-service/src/core/agency/thought.ts`):
  - Requires explicit task admission from the user turn (direct operational commands or explicit resumption of the background task) before any `operationalRequest` (`project_inspection`, `candidate_workspace_experiment`, `candidate_verification`, etc.) can be admitted on a reactive turn.
  - Merely including the current user motivation alongside a stale motivation fails validation with `unsupported_operation`, triggering standard bounded regeneration back into natural conversation.
- **Explicit Operational Basis Provenance** (`operationalBasisMotivationId` in `Decision`):
  - Every operational request is tied deterministically to the motivation ID that licensed it.
- **Mind State Lifecycle Protection** (`apps/agent-service/src/core/state/mind-items.ts`):
  - Wake operations (`claimUrgentMindState`, `consumeUrgentWake`, `retryUrgentWake`) strictly preserve `updated_at`.
  - Added typed explicit lifecycle resolution methods (`resolveMindStateItem`, `cancelMindStateItem`, `resolveMindStateBySource`, `applyMindStateDispositions`).
  - Delivery remains completely uninvolved in cognitive lifecycle decisions.

============================================================
4. EXACT AFFECTED SOURCE
============================================================

- `apps/agent-service/src/core/types.ts`:
  - Added `MindStateDispositionType`, `MindStateDisposition`, and fields `operationalBasisMotivationId`, `mindStateDispositions` to `Decision`.
- `apps/agent-service/src/core/agency/thought.ts`:
  - Added `hasReactiveTaskContinuationAdmission`.
  - Updated `validateInitialThoughtProposal` to validate reactive task continuation and derive `operationalBasisMotivationId`.
  - Updated `deliberateDecision` to populate `operationalBasisMotivationId` and `mindStateDispositions`.
- `apps/agent-service/src/core/agency/motivations.ts`:
  - Exported `tokenize` and `isTextRelevant`.
- `apps/agent-service/src/core/state/mind-items.ts`:
  - Preserved `updated_at` across wake transitions.
  - Implemented `resolveMindStateItem`, `cancelMindStateItem`, `resolveMindStateBySource`, `applyMindStateDispositions`.
- `apps/agent-service/src/core/runtime.ts`:
  - Applied `applyMindStateDispositions` after decision logging.
- `apps/agent-service/src/core/agency/mind-state-authority.test.ts`:
  - 20 unit tests covering all matrix items (core authority, relevance filtering, candidate selection, task admission, lifecycle resolution, and the exact incident turn failure mode).

============================================================
5. VERIFICATION TOTALS & TEST EVIDENCE
============================================================

Focused verification executed across 8 test files:
- `src/core/agency/mind-state-authority.test.ts` (20 tests) — **PASS**
  - Test 18 (Open-ended "what are you thinking?" surfaces background concern conversationally without execution) — **PASS**
  - Test 19 (Explicit owner request to resume becomes valid operational basis) — **PASS**
  - Test 20 (User motivation included alongside stale motivation does NOT license unrelated execution) — **PASS**
- `src/core/state/mind-items.test.ts` (2 tests) — **PASS**
- `src/core/agency/candidate-selection.test.ts` & `src/core/agency/decide.test.ts` (8 tests) — **PASS**
- `src/core/agency/thought.test.ts` & `src/core/agency/thought-continuation-repair.test.ts` (33 tests) — **PASS**
- `src/core/conversation/expression-fallback.test.ts` & `src/core/honesty/finalize.test.ts` (48 tests) — **PASS**
- **Total Tests**: 111 / 111 Passed (0 failed)
- **TypeScript Compilation**: `tsc` clean (0 errors).

============================================================
6. PRODUCTION POSTURE & STATUS
============================================================

- **Production Cleanup**: Stale DB rows in production `nuclear.db` have NOT been mutated.
- **Mint Access**: No SSH or remote host deployment has been performed.
- **Model Fabric TARGET**: TARGET route remains dark with zero activations or approvals.
- **Production Requalification**: Pending owner acceptance.
