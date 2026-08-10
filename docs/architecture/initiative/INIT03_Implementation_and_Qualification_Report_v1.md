# INIT-03 REMEDIATION ROUND 2 REPORT

VERDICT: PASS for local Round-2 source qualification. Targeted Sol High closure audit is required before acceptance.

This round repaired INIT03-R01 through INIT03-R07 and corrected the non-blocking R08 documentation. The accepted INIT-03 four-layer architecture and the independently closed F01 and F08 boundaries were preserved.

## BASELINE

starting HEAD: `3f105ace68f14bc0e63d94806964b0800f28f8c4`

origin/master: `7d686f4d384da97b1d4d00fb26dedf95b82bbdce`

branch: `master`

worktree: `AGENTS.md` only, modified and unstaged at start. It was not edited, staged, reverted, or committed.

qualification history: initial Luna PASS; first Sol BLOCKED; first remediation PASS; second Sol BLOCKED; second remediation locally source-qualified with the evidence below.

Scope remained local only. No Mint, production, Recall mutation, capability-state change, promotion, sandbox activation, provider call, routing change, Discord traffic, deployment, or push occurred.

## R01 — DISPATCH PROVENANCE

status: FIXED

completed dispatch identity: the accepted dispatch carries request id, dispatch sequence, route alias, model alias, resolved model identity, model epoch, host identity, contract id, build identity, owner id, cognitive job id, and the attention ledger identity into worker materialization.

global current substitution possible: NO. The worker uses the accepted dispatch identity and does not reread current global model state as historical provenance.

regression: the real worker path dispatches model A at epoch E1, changes global continuity to model B/E2 before materialization, and persists A/E1 provenance. Unchanged A/E1 persistence, stale accepted-result handling, restart, source-capability enforcement, and model-independent database-owned source behavior are covered.

## R02 — CONTINUITY GENERATIONS

status: FIXED

semantic identity: host-derived identity for owner, source type, source id, source entity, OCI kind, normalized bounded semantic conclusion, and authoritative source revision. `semanticKeyMaterial` is ignored for durable identity.

generation identity: a separate valid continuity generation for contract, build identity, host-derived model identity, and model epoch. The durable uniqueness key combines semantic identity and continuity generation. Successors supersede older generations explicitly.

A/E1 -> B/E2 -> A/E3: PASS. Each valid generation creates one current lineage generation; the old generation cannot regain influence.

build A -> B: PASS. A valid build successor is materialized without redefining semantic meaning.

concurrency: PASS. Competing child writers use overlapping SQLite connections and synchronized contention. One current successor is durable; retries of the same generation converge.

source-revision + model-generation interaction: PASS. Source revision and continuity generation remain separate inputs to successor and stale-influence rules.

## R03 — BOUNDED SQL

status: FIXED

query: wake selection uses owner/status/id cursor-compatible ordering and seeks through the owner-scoped status range. Review-due existence/count uses an indexed bounded query.

index: `idx_open_cognitive_items_owner_status_id` supports wake selection. `idx_open_cognitive_item_attention_review_due` supports review-due selection. `idx_open_cognitive_items_semantic_generation` supports continuity-generation uniqueness.

EXPLAIN: PASS. `EXPLAIN QUERY PLAN` uses the owner/status/id index for wake selection and does not report a whole-population `USE TEMP B-TREE FOR ORDER BY`. The review-due plan uses the review index.

10 rows visits: bounded at the configured 128-row maximum.

100 rows visits: bounded at the configured 128-row maximum.

1000 rows visits: bounded at the configured 128-row maximum. The large fixture is independent of total retained inventory.

bounded independent of inventory: YES

eventual fairness: PASS. Eight blocked newer rows do not prevent the valid ninth row. A valid item after 100 blocked rows is reached with 101 scanned rows. Persistent cursor advancement, wrap, blocked/deferred handling, and more than 128 blocked rows across multiple wakes preserve eventual reachability.

review-due path: indexed and capped. The scheduler does not enumerate all pending OCI merely to determine whether review work exists.

## R04 — REAL SCHEDULER

status: FIXED

preflight endpoint: owner-authenticated `GET /initiative/operational-status`.

rich status ordinary wake: NO. Rich `/initiative/status` remains an explicit owner-diagnostics surface. The ordinary Discord scheduler does not call it as preflight.

no-material bounded: PASS across inventory sizes 10, 100, and 1000+.

all-blocked bounded: PASS through the indexed wake selector and bounded review check.

all-deferred bounded: PASS through the indexed wake selector and bounded review check.

review-due bounded: PASS through the indexed review-due path.

real scheduler regression: the scheduler-facing flow is exercised through the Discord client and operational status endpoint. Direct `tickProactive()` optimization alone is not the proof.

## R05 — REFLECTION

status: FIXED

normal decision producer: the production async review consumer calls the existing Reflection cognitive owner through the model-backed `modelReflectionAdjudicator`, with bounded grounded state and a deterministic test seam. Reflection output remains advisory. The deterministic OCI transition validator remains final mutation authority.

KEEP: PASS. A successful KEEP clears/rearms review with bounded delay and cannot hot-loop in the same scheduling cycle. Safe KEEP is also the bounded failure fallback.

WITHDRAW: PASS. The deterministic validator permits the authorized OCI withdrawal only after source, owner, capability, provenance, relationship, and current-source checks.

SUPERSEDE: PASS. The deterministic validator permits the authorized OCI supersession transition.

invalid external resolution: PASS. Unsupported or ungrounded resolution remains rejected.

default unconditional KEEP: NO. KEEP is not the effective unconditional production adjudication. It is a valid Reflection outcome and a safe model-failure fallback.

invalid-first-eight fairness: PASS. Eight newest invalid/unprocessable requests record dispositions and cannot permanently monopolize intake; the valid ninth request is eventually processed. Intake fairness survives restart and queues larger than the intake cap.

hot-loop resistance: PASS. Review cursor, attempt/disposition state, and bounded KEEP rearm prevent immediate repeated processing.

Reflection cannot speak, send messages, mutate mutual commitment truth, rewrite Identity or Recall, promote capability, turn shadow live, or invent evidence.

## R06 — MIGRATION CONTENT

status: FIXED

version-only trust: NO. `PRAGMA user_version` is not sufficient for recovery or finalization.

schema validator: `validateNuclearSchemaContent` checks the full v23/v24 contract: required tables, columns, nullability/defaults, primary keys, inspectable constraint fragments, exact required index columns/uniqueness/partial definitions, and migration-specific cursor/performance objects.

missing-column probe: refused with the pending record retained.

missing-table probe: refused with the pending record retained.

missing-index probe: refused with the pending record retained.

incorrect-index probe: refused with the pending record retained.

restart: repeated restart against incomplete target content remains fail-closed. Valid source content rolls back the recognized pending intent. Valid target content finalizes it.

failure injection: deterministic tests cover before pending, after pending, during DDL, after nuclear commit, during sidecar update through a real SQLite trigger, after sidecar update, and before finalization. Each interrupted state is inspected and recovered without version-only trust.

## R07 — QUALIFICATION TRUTH

status: FIXED

true concurrent writer test: PASS. Overlapping competing SQLite child writers contend on the same semantic generation.

real worker mismatch test: PASS. The worker path preserves the producing dispatch identity when global continuity changes before persistence.

real scheduler test: PASS. Discord scheduler preflight uses bounded operational status.

query-plan/row-visit test: PASS. EXPLAIN and deterministic scan instrumentation assert indexed bounded work at small and large inventory sizes.

Reflection fairness test: PASS. The real runtime caller processes non-KEEP decisions and cannot starve the valid ninth request behind invalid intake.

migration incomplete-schema test: PASS. Correct target version with missing or incorrect schema content is refused and remains recoverable.

## REGRESSION

F01 remains closed: PASS. Model-provided `semanticKeyMaterial` is non-authoritative; the host derives durable semantic identity.

F08 remains closed: PASS. Capability diagnostics remain truthful and distinguish unavailable capability state from available source classes.

source authority: PASS

OCI kinds exactly: `question`, `revisit`, `concern`

OCI statuses exactly: `OPEN`, `RESOLVED`, `WITHDRAWN`, `SUPERSEDED`

Thought floor: 25; PASS

relationship: PASS

withdrawal precedence: PASS

tension conservative: PASS

forget/redaction: PASS

shadow/live: PASS

Attention separation: PASS

reservation/delivery: PASS

privacy: PASS

The qualification inventory classifies OCI review and wake cursors as control-plane scheduling state, not semantic or live state.

## FULL QUALIFICATION

focused: PASS. 18 agent test files, 122 tests passed. Real Discord scheduler tests: 2 passed.

`npm test`: PASS, exit code 0; 117 test files, 843 passed, 1 skipped (844 tests total).

`npm run phase0:offline`: PASS, exit code 0; agent build passed, offline Vitest reported 117 files, 843 passed, 1 skipped (844 tests total), and the script ended with `OK offline tier`.

external network: 0 attempts in the offline tier; no live provider calls.

agent build: PASS, `npm run build:agent`.

discord build: PASS, `npm run build:discord`.

`git diff --check`: PASS after the documentation changes.

## DOCUMENTATION

contract corrected: YES. The contract removes normative authority from `semanticKeyMaterial`, distinguishes rich owner status from ordinary scheduler operational status, records dispatch-bound provenance, separates semantic identity from continuity generation, records indexed SQL bounds, records Reflection adjudication/fairness, and records schema-content recovery.

historical audit trail preserved: YES. The report states initial Luna PASS, first Sol BLOCKED, first remediation PASS, second Sol BLOCKED, and this second remediation's new evidence. The original baseline remains documented as historical evidence.

R08 documentation-only correction: YES, after source qualification.

## LOCAL COMMITS

Round-2 remediation commits only:

1. `7be85d7` — `fix(cognition): bind OCI provenance to accepted dispatch`
2. `a0b705a` — `fix(cognition): version OCI continuity generations`
3. `3843364` — `fix(initiative): enforce bounded indexed wake queries`
4. `3dfdcf9` — `fix(cognition): adjudicate OCI reviews through Reflection`
5. `2530322` — `fix(db): validate schema content during migration recovery`
6. `697b73c` — `test(qualification): cover INIT-03 remediation round 2`
7. `372967d` — `test(db): cover migration fault recovery phases`
8. Documentation publication commit: this corrected contract and report.

## PRODUCTION

Mint: UNTOUCHED

Recall: UNTOUCHED

sandbox: UNTOUCHED

providers: NO LIVE CALLS

Discord: NO LIVE TRAFFIC

push: NO

deploy: NO

## WORKTREE

AGENTS.md: UNCHANGED / UNSTAGED relative to the starting state.

other: final state must contain only the corrected contract/report commit and no internal plan artifact. Final status inspection is required before shutdown.

## HUMAN NEXT GATE

TARGETED SOL HIGH CLOSURE AUDIT REQUIRED BEFORE ACCEPTANCE.

STOP.
