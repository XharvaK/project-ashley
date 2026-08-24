# M5 Live Invocation Repair — Candidate Authorship Workspace Binding

**Status:** `M5 CAPABILITY ACCEPTANCE = UNCHANGED`  
**Live smoke ledger:** M2 PASS · M3 PASS · M4 PASS · M5 READY FOR ONE OWNER SMOKE  
**This packet:** Repairs M5 live natural-language invocation so operator-owned workspace binding resolves omitted `workspaceId`, enabling candidate change-set authoring and sealing without modifying live repository state.

---

## 1. Context & Exact SHAs

| Role | SHA |
|---|---|
| Baseline production SHA (M4 pass, M5 first break) | `984a0e23754693e44c441b2aaee9dba10b9781d4` |
| Repaired candidate SHA | current HEAD |

---

## 2. Root Cause Analysis

In the initial M5 Discord live smoke:
- Owner utterance: *"Seal the current Project Ashley candidate workspace as an advisory candidate change-set using the candidate authorship capability..."*
- NVIDIA NIM `gpt-oss-20b` correctly and naturally selected `operationalRequest: { kind: "candidate_authorship", request: { operation: "changeset.author", projectId: "project-ashley", ... } }`.
- However, Thought omitted `workspaceId` because the prompt did not provide candidate workspace IDs, yet the Thought parser enforced `workspaceId` as a required non-empty string.
- As a result, the parser rejected the request as `payload_invalid` (`field: "workspaceId"`), falling back to deterministic thought.

---

## 3. Structural Repair

1. **Authorship Selector Binding (`authorship-binding.ts`):**
   - Created `resolveAuthorshipBinding`, `assessAuthorshipResolvability`, and `describeAuthorshipGrounding`.
   - Binds omitted `workspaceId` to the unique current candidate workspace via `uniqueCurrentWorkspaceId(manager.listProjectWorkspaces(projectId))`.
   - Rejects ambiguous or non-existent candidate workspaces fail-closed (`no_current_workspace`, `ambiguous_current_workspace`).
   - Honors explicit `workspaceId` when provided.

2. **Thought Parser & Prompt Contract:**
   - In `apps/agent-service/src/core/types.ts`: `workspaceId?: string` in `CognitionAuthorshipRequest`.
   - In `apps/agent-service/src/core/agency/thought.ts`:
     - `parseCandidateAuthorshipRequest` accepts optional `workspaceId`.
     - `buildSystemPrompt` includes `describeAuthorshipGrounding`, guiding Thought that `workspaceId` can be omitted when resolvable.

3. **Runtime Execution & Admission:**
   - In `apps/agent-service/src/core/sandbox/v2-execution.ts`:
     - `executeCandidateAuthorshipV2` resolves `boundRequest = resolveAuthorshipBinding(...)` before secret scanning, dispatch, and persistence.
   - In `apps/agent-service/src/core/delivery/turn-deadline-plan.ts`:
     - Enabled `candidateAuthorship: { available: true, ... }` with standard physically-qualified durations.

4. **Authority Invariants:**
   - `VERIFICATION != APPROVAL`
   - `VERIFIED_FAILURE != AUTHORSHIP PROHIBITION`
   - `AUTHORSHIP != APPLICATION`
   - M5 authors advisory deltas and seals `CandidateChangeSet`s; it NEVER modifies live repositories, branches, or Git working trees.

---

## 4. Verification

- `authorship-binding.test.ts`: 8 unit tests covering binding resolution, timestamp tie-breaking, missing workspaces, and grounding descriptions.
- `thought-authorship.test.ts`: 5 unit tests for schema parsing and validation.
- `m5-live-composition.e2e.test.ts`: 3 end-to-end composition tests verifying natural utterance invocation, system prompt contracts, and authority isolation.
- `turn-deadline-plan.test.ts`: 13 tests covering turn deadline policies and branch availability.
- `m5-phase-e.test.ts`: 20 tests verifying cognition admission, fail-closed handling, and license issuance.
- Full agent-service typecheck (`npm run build:agent; npm run build:discord`) passed cleanly with 0 TypeScript errors.
