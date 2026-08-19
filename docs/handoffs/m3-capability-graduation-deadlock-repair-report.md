# M3 Capability Graduation Deadlock Repair Report

Date: 2026-08-19
Scope: `project_experimentation` observe → active bootstrap deadlock (`DEADLOCK_PROVEN`)
Repository: `C:\Users\Xharv\Projects\composer-assistant` (production host: Mint, unchanged)

## Executive Summary

M3 candidate-workspace capability graduation was structurally impossible: one
global live-shadow promotion policy was applied to capabilities whose effect
semantics differ. `project_experimentation` cannot legitimately execute while
observe-only, so it can never accrue the required live-shadow evidence, so
`promotionEligible` could never become true, so it could never leave observe —
while every downstream gate (`capabilityCanInfluence`,
`canOfferCandidateWorkspace`, `executeWorkspaceExperimentV2`) requires exactly
that promotion.

The repair introduces a per-capability graduation policy declaration
(`live_shadow` default preserving historical semantics exactly; only
`project_experimentation` declared `operator_cutover`) with all fail-closed
properties intact: owner-authorized promotion, min-eval-seed + qualification
requirements, dependency readiness, contract/release-state checks, durable
audit, and canonical rollback.

## Background

- Schema v21 (capability contracts v3) requires evaluation seeds (>= 3),
  qualification attestation, 25 live-shadow events over a 7-day span, and
  active influence dependencies before an observe capability may be promoted.
- `capabilityCanInfluence` requires `state = active` plus master `apply` mode
  plus dependencies active; `canOfferCandidateWorkspace` and
  `executeWorkspaceExperimentV2` (when a db is present, as the runtime does)
  gate on `capabilityCanInfluence`.
- No caller of `recordLiveShadowEvent` exists for `project_experimentation`
  (project experimentation does not run in observe shadow mode by design), and
  the evaluation endpoint records `isolated_eval` only.
- Result: observe → no M3 → no live_shadow → never eligible → permanent
  deadlock.

## What Was Changed (local only — NOT deployed)

### `apps/agent-service/src/core/rollout/capabilities.ts` (only production source file touched)

- Added `CapabilityGraduationPolicy` union: `live_shadow` (minEvalSeeds,
  minLiveShadowEvents, minLiveShadowSpanDays, requiresQualification) and
  `operator_cutover` (minEvalSeeds, requiresQualification).
- Added `DEFAULT_GRADUATION_POLICY` (3 seeds / 25 events / 7 days / requires
  qualification — exactly the historical live-shadow semantics) and
  `GRADUATION_POLICIES` (only `project_experimentation` →
  `operator_cutover`, 3 seeds, requires qualification).
- Added `graduationPolicyFor()` accessor.
- `promotionEligible` is now policy-driven: the live-shadow evidence block
  applies only when `policy.kind === "live_shadow"`; every policy still
  requires eval seeds, qualification, dependency readiness, and
  contract/release validity. Recall keeps its epoch-based qualification path.
- `promoteCapability` records `promotionPath` (`"live_shadow"` |
  `"operator_cutover"`) in the `operator_promote` event detail for durable
  distinguishable audit. The `operator_cutover` event kind is NOT reused
  (recall-specific semantics).
- `CapabilityStatus` gained `graduationPolicy` for observability.

### Contract material

NOT modified. The capability contract hash (`contract-material.ts`) is
untouched, so no contract mismatch is introduced in production.

## Design Decisions

- Policy is a code declaration (like `dependencies`), not persisted state; no
  DB schema change, no new endpoint, no new request field. Promotion derives
  the path from the policy automatically via the existing
  `POST /nuclear/capabilities/promote` owner endpoint.
- The existing evaluation endpoint (`recordCapabilityEvaluation`) is the
  canonical owner-attested qualification seam; no new seam was added. It works
  for any capability (seeds >= 3 + passed sets `eval_seed_count`/`qualified_at`
  while state stays observe) and never activates anything.
- No fake live-shadow rows, no direct DB updates, no generic force flags, no
  global threshold lowering, no hidden observe-mode M3 execution, no V1
  broker/session revival, no coupling of `candidateWorkspaceAllowed` to
  capability promotion.

## Verification (all local, all green)

- `npm run build:agent` (tsc) — clean.
- `npx vitest run` targeted suites: capabilities.test.ts (15), new
  capabilities-graduation-policy.test.ts (12), new capabilities-endpoint.test.ts
  (15), v2-execution, v2-m3-tooling, project-registry, recall-qualification-epoch
  — 87/87 pass.
- Full `npm test --prefix apps/agent-service`: 143 files, 1168 passed, 2
  skipped (pre-existing skips).
- `npm run test:offline --prefix apps/agent-service`: 143 files, 1168 passed.
- Root `npm run phase0:offline`: OK offline tier.

## Production State After Repair (Mint — unchanged by this task)

- Deployed SHA still `042f211455a70620f053c3c7ab7fe30311d52493` (no deploy).
- `/health` ready; `ashley-agent` and `ashley-discord` (user units) active;
  port 3710 listening.
- `/nuclear/capabilities`: `project_experimentation` observe / effective=false;
  recall, mind_state, thought, project_inspection active.
- `~/.composer-assistant/project-roots.json` (canonical, valid JSON):
  `project-ashley` enabled=true, readAllowed=true,
  candidateWorkspaceAllowed=false, engineeringAllowed=false.
- Dormant baseline restored and preserved.

## Operator Path to Activation (future, not performed)

1. Owner records qualification via `POST /nuclear/capabilities/evaluation`
   (seeds >= 3, passed, sourceKey) — state stays observe.
2. Owner promotes via `POST /nuclear/capabilities/promote` (policy →
   `operator_cutover`; audit records `promotionPath: "operator_cutover"`).
3. Owner sets `candidateWorkspaceAllowed: true` in the operator registry when
   ready to admit candidate workspaces.
4. Rollback remains available via `POST /nuclear/capabilities/rollback`.

## Next Operator Decision

INDEPENDENT REVIEW OF CAPABILITY-GRADUATION REPAIR REQUIRED

## Verdict

REPAIR READY FOR INDEPENDENT REVIEW

## Open Notes

- Historical Aug 17 `operator_promote` rows (`promote:<cap>:<ts>` in place
  since 3ed3aa3) remain classified UNKNOWN provenance, not canonical code, and
  are untouched.
- Mint recall epoch `0d27ebb8-…` remains current with 0 seeds / no qualified_at
  — recall eligibility remains false until a future qualification campaign.
- The transient failed `run-u137.service` on Mint predates this task (sandbox
  broker binary run); `ashley-exec-broker` service is active and the agent
  health is ready. Untouched.
