# Cognitive Maturation Current-Production Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new exact C1–C5 candidate that preserves current production SHA `968787d1a5261aef4bf266091b8cf044eddbfdb2` and adds the accepted cognitive maturation semantics without deploying, mutating Mint production, invoking providers, or changing capability authority.

**Architecture:** Treat current production HEAD as the only integration base. Apply the accepted cognitive functional history as source changes onto that base, resolve conflicts by ownership and current production authority, and keep Model Fabric as the routing/model-selection/transport owner. Revalidate every changed consumer and freeze the resulting clean commit as a new candidate for independent differential review and physical qualification.

**Tech Stack:** Git isolated worktree, TypeScript, Node.js/npm, SQLite migration contracts, Vitest focused packs, Model Fabric/runtime/sandbox tests, Markdown handoff packets.

**Spec:** The owner-supplied current-production reconciliation contract in `C:\Users\Xharv\.codex\attachments\0d34c42e-79c5-46cc-a7d3-9aa1962e5612\pasted-text.txt`, `docs/handoffs/COGNITIVE_MATURATION_CANONICAL_INTEGRATION_FREEZE.md`, `docs/handoffs/COGNITIVE_MATURATION_C1_C5_PHYSICAL_QUALIFICATION_RESULT.md`, and the current production SHA `968787d1a5261aef4bf266091b8cf044eddbfdb2`.

## Global Constraints

- `968787d1a5261aef4bf266091b8cf044eddbfdb2` is the integration base and MUST remain represented in the new candidate's ancestry.
- `a3bef15ec8e54ffc7fbf182572aeac716ca08021` and `395b0b9ba6205fac86c4d70677bed36035e66a6c` remain historical accepted evidence; they are not the new candidate.
- Preserve all current production commits. Do not drop, reset, force-rewrite, or silently replace Model Fabric, routing, runtime, Agency, Sandbox V2, Operational Truth, or Discord Presence work.
- Do not access or mutate Mint production, production DBs, production services, capability state, or provider endpoints.
- All five cognitive capabilities remain `observe / unpromoted / non-live`; dark apply remains fixture/local-only.
- Ashley Identity remains owner-authoritative. C1–C5 records cannot authorize speech, delivery, executed actions, sandbox claims, engineering claims, external effects, Model Fabric routing, or Identity mutation.
- `CONTEXT PROJECTION != ROUTING AUTHORITY`; Model Fabric remains the current routing/model-selection/transport owner.
- Schema history is additive and source-derived. Do not renumber or overwrite existing migrations.
- A semantic incompatibility must be recorded as `PRODUCTION-RECONCILIATION SEMANTIC DELTA`; do not resolve it silently.
- No provider calls, push, deployment, restart, promotion, activation, qualification-state mutation, or merge into a protected branch.

---

### Task 1: Establish the current-production integration baseline

**Files:**
- Read: `AGENTS.md`, canonical freeze/result records, current production source at `968787d1a5261aef4bf266091b8cf044eddbfdb2`, and the accepted cognitive commit history.
- Create: this plan and later the reconciliation handoff.

**Interfaces:**
- Consumes: current production SHA, previous candidate parents, and accepted C1–C5 functional commits.
- Produces: a bounded commit/domain inventory and a clean isolated branch rooted at current production.

- [ ] Verify the reconciliation worktree path, branch, HEAD, status, common Git directory, and source schema before editing.
- [ ] Record the exact cognitive commits: `378e14b` C1, `6f83395` C2, `cb6b454` C3, `947119d` C4, `b33d244` C5, and `395b0b9` C3→C4 repair.
- [ ] Record all 30 production-only commits after merge base `5a05e96`, classifying Model Fabric, model routing, runtime/Agency, Sandbox V2, Operational Truth, Discord Presence, schema, routes, and documentation.
- [ ] Inspect the changed shared files before choosing cherry-pick or merge. The production line is the authority for current consumers and operational behavior.

### Task 2: Integrate accepted cognitive functional history

**Files:**
- Modify only files carried by the six accepted functional cognitive commits, plus required current-production seam adaptations.
- Do not replay the old settlement documentation commit `48e8b7a` as a mechanical source merge.

**Interfaces:**
- Consumes: clean branch at `968787d1a5261aef4bf266091b8cf044eddbfdb2` and historical cognitive functional commits.
- Produces: a buildable branch containing C1–C5 source and current production source.

- [ ] Use the cleanest Git method after inventory. Prefer preserving the six cognitive functional commits in order, but resolve each conflict against the current production implementation rather than accepting stale integration output.
- [ ] Integrate C1 first and verify assertion/currentness/correction/barrier authority remains independent of current production consumers.
- [ ] Integrate C2 and reconcile `ContextProjection` with current Model Fabric projection/routing ownership. Preserve bounded eligible projection, privacy/currentness, content binding, and metadata-only receipts without creating a second routing owner.
- [ ] Integrate C3 and trace all learned-state consumers through current Agency, curiosity, and runtime paths. Keep observe mode inert and preserve inherited/current/Ashley-native/shared interest distinctions.
- [ ] Integrate C4 and trace prediction, observation, adjudication, view revision, experience links, calibration, Reflection, and current Decision consumers. Preserve future-only calibration and no current-turn authority.
- [ ] Integrate C5 and trace relationship, consent, withdrawal, repair, reminder, privacy, and proactive consumers. Preserve separately current owner/Ashley state and no Identity collapse.
- [ ] Integrate `395b0b9` last so C3 currentness and invalidation are consumed by C4 after all current-production seams are present.
- [ ] For every conflict, classify the resolution as mechanical adaptation or `PRODUCTION-RECONCILIATION SEMANTIC DELTA` and record the affected owner and invariant.

### Task 3: Reconcile schema, routes, and operational authority

**Files:**
- Inspect/modify as required: `apps/agent-service/src/core/db.ts`, cognitive migration modules, `apps/agent-service/src/core/cognition/schema-contract.ts`, `apps/agent-service/src/core/rollout/capabilities.ts`, `apps/agent-service/src/core/runtime.ts`, `apps/agent-service/src/server.ts`, `apps/agent-service/route-surface.json`, and current Model Fabric/routing/sandbox modules.

**Interfaces:**
- Consumes: integrated source from Task 2 and current production schema/migration history.
- Produces: additive source-derived schema progression, route surface, and authority boundaries with no migration history rewrite.

- [ ] Read the current production source schema authority and list every production-only migration after `5a05e96`.
- [ ] If current production remains v35, preserve the reviewed v36 C1 → v37 C2 → v38 C3 → v39 C4 → v40 C5 mapping only if source reality still supports it.
- [ ] If a schema collision exists, construct a new additive sequence and record the exact progression; never reuse a version by relabeling history.
- [ ] Verify migration/reopen/unsupported-newer-state behavior and sidecar lineage contracts against the current base.
- [ ] Verify all new routes are owner-scoped where required, diagnostics do not mutate semantic state, and cognitive artifacts cannot authorize operational claims or effects.
- [ ] Verify Sandbox V2 remains current and no historical broker/V1 path is reactivated.

### Task 4: Differential falsification verification

**Files:**
- Test only the integrated branch; modify tests only when a current-production seam requires a precise regression witness.

**Interfaces:**
- Consumes: integrated source and schema from Tasks 2–3.
- Produces: focused differential evidence across C1–C5 and current production consumers.

- [ ] Run changed C1–C5 tests for memory, context budget, learned autonomy, cognitive graduation, relationship graduation, schema, migration, currentness, non-revival, Identity, and diagnostics.
- [ ] Run current Model Fabric tests covering projection, profiles/catalog, routing, specialist/portfolio, reasoning translation, receipts, health, and MF-ACT authority.
- [ ] Run current runtime/Agency/proactive tests covering mind-state authority, Thought, candidate selection, motivations, curiosity, Reflection, delivery, and current activity/presence.
- [ ] Run Operational Truth, external-effect authority, Sandbox V2, and route-surface tests where paths overlap the cognitive changes.
- [ ] Add focused regression witnesses for any conflict resolution that is not already covered. Prove C3 observe state cannot reach Agency/Curiosity influence, C5 observe state cannot add relationship Agency influence, C4 cannot mutate current Decisions, and cognitive state cannot grant speaking or OperationalClaimLicense authority.
- [ ] Run the smallest relevant schema/migration differential pack and verify foreign keys, integrity, sidecar continuity, no-revival, and capability ceiling.
- [ ] Do not invoke providers or run a full generic corpus unless a concrete failure makes expansion necessary.

### Task 5: Build, review the final diff, and freeze a new candidate

**Files:**
- Create: `docs/handoffs/COGNITIVE_MATURATION_CURRENT_PRODUCTION_RECONCILIATION.md`
- Create: `docs/handoffs/COGNITIVE_MATURATION_CURRENT_PRODUCTION_DIFFERENTIAL_REVIEW_PACKET.md`
- Create: `docs/handoffs/COGNITIVE_MATURATION_CURRENT_PRODUCTION_PHYSICAL_QUALIFICATION_PACKET.md`

**Interfaces:**
- Consumes: bounded inventory, conflict classifications, focused tests, schema evidence, and build evidence.
- Produces: clean committed functional candidate, review packet, and exact-candidate physical-qualification packet.

- [ ] Run `npm run build --prefix apps/agent-service` and the relevant package builds needed by current production consumers.
- [ ] Run `git diff --check`, inspect the full diff against `968787d1a5261aef4bf266091b8cf044eddbfdb2`, and verify current production files were preserved except for explained seam adaptations.
- [ ] Verify the five capability states remain `observe`, `effective=false`, `promotionEligible=false`, and non-live in source/test fixtures.
- [ ] Record the new exact candidate SHA, production base SHA, previous cognitive candidate/source SHAs, ancestry, final schema progression, preserved production domains, conflicts, mechanical adaptations, semantic deltas, Model Fabric result, runtime/Agency result, Operational Truth result, Sandbox result, Identity result, tests, build, diff check, provider calls, and zero production mutation/deployment.
- [ ] Commit the reconciled source and packets locally on the reconciliation branch. Do not push or merge.
- [ ] Verify the committed worktree is clean and that the new candidate SHA is the exact source identity bound by both new packets.

Final ending after successful reconciliation:

```text
COGNITIVE MATURATION C1–C5 =
RECONCILED ON CURRENT PRODUCTION — NEW EXACT CANDIDATE READY FOR DIFFERENTIAL REVIEW
```
