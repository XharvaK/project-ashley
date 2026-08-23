# Sandbox V2 M6 — Local Settlement Packet

**Milestone:** Sandbox V2 M6 (Bounded Operation)  
**Contract:** [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md) §14  
**Handoff context:** [`m6-design-handoff.md`](m6-design-handoff.md)  
**Implementation SHA:** `9f6544bf4692c2544011ab3f31543446bf8d3c42` (branch `cursor/m-series-local-completion-2357`)  
**Packet date:** 2026-08-23  
**This packet status:**

```text
M6 = LOCALLY SETTLED
```

That means:

```text
DESIGN ACCEPTED
IMPLEMENTED
LOCALLY VERIFIED
INDEPENDENTLY REVIEWED
```

It does **not** mean:

```text
PHYSICALLY QUALIFIED
RELEASE_QUALIFIED
DEPLOYED
CAPABILITY PROMOTED
PRODUCTION WITNESSED
PRODUCTION ACCEPTED
```

`LOCALLY SETTLED` is an intermediate review label for this packet. Canonical
ladder stages remain those listed above. No production-acceptance term is
invented.

---

## 0. Honesty

M6 answers only:

> Can Ashley pursue one admitted engineering objective through a finite,
> budgeted sequence of already-accepted M3, M4, and M5 operations?

It does not add a new effect class. It does not cross an engineering border.
It does not replace Agency.

No Mint, SSH, Bubblewrap qualification claim, production database mutation,
production registry mutation, capability promotion, deployment, production
witness, M7 implementation, apply-to-Ashley, or self-change execution was
performed for this packet.

```text
M6 SEQUENCE != NEW EFFECT CLASS
M6 SEQUENCE != M7 BORDER EFFECT
M6 BOUNDS != AGENCY CHOOSES
LOCAL SETTLEMENT != PHYSICAL QUALIFICATION
LOCAL SETTLEMENT != PRODUCTION ACCEPTANCE
```

Physical criteria in roadmap §14 and §17.2 remain. They are deferred to the
coordinated Mint campaign after M7 independent review.

---

## 1. Independent review verdict

**Verdict:** the accepted M6 contract is satisfied. Central invariant holds:
Agency admits a closed finite sequence; M6 bounds and executes it; child M3/M4/M5
grants stay independent; border state stays `none`.

The first M6 slice does not implement an inspect-and-choose cognitive loop
inside the controller. Roadmap §14.3's "choose one permitted step" is the next
admitted step. Re-evaluation is authority, deadline, cancel, and remaining
budget. The controller does not invent steps. That reading is required by the
execution-governance forbidden equation "a workflow ran, therefore Agency
chose" and by `AGENCY CHOOSES / M6 BOUNDS`.

There is no dedicated `ASHLEY_SANDBOX_V2_M6_DESIGN.md`. Authority used was
roadmap §14 plus the M6 design handoff as context. The handoff did not override
the roadmap.

### Defects found and fixed

| Defect | Classification | Fix |
|---|---|---|
| `recipe_not_allowed` was mapped to `authority_lost` | BLOCKER during ITERATION | Child grant-loss mapping is explicit (`*_gate_denied`, `authorship_not_allowed`, `verification_not_allowed`, and sibling grant denials). Recipe refusal stays `step_failed` |
| Continuity pending protocol omitted `30 → 31` | BLOCKER during ITERATION | `reconcilePendingNuclearMigration` admits `30 → 31` |
| v29 protocol fixture still held v31 tables | BLOCKER during ITERATION | Fixture drops v31 objects before pretending to be v29 |
| Health snapshot still expected schema 30 | BLOCKER during SETTLEMENT | Pin `schemaVersion: 31` |
| Recovery event window `LIMIT 24` hid `recovered` after extra hops | BLOCKER during SETTLEMENT | Assert recovered against the full migration event list |
| Leftover mock-dispatch body in `m6-phase-d.test.ts` | BLOCKER during ITERATION | Removed |

No remaining blockers against roadmap §14.

### Non-blocking notes

| Note | Why not a blocker |
|---|---|
| No separate `abandonCondition` string on the request | Operator cancel is the abandon/stop mechanism. Success and failure conditions are recorded. |
| `repeated_non_progress` is a stop reason in the type union but is not produced | Detecting non-progress would require the controller to inspect-and-choose. The closed sequence stops at the admitted ceiling instead. |
| Uncaught child throw could leave a task row `admitted` | Child executors catch internally. Restart does not auto-resume. |
| Discord turn-deadline is not the M6 lifecycle | Matches roadmap §10. Physical controller timing remains a later Mint claim. |

### Review areas

| Area | Result |
|---|---|
| 1. Finite bound | `maxSteps === steps.length`, hard ceiling `M6_MAX_STEPS = 8`, wall ceiling `M6_MAX_WALL_MS = 15m`. `continueUntilSolved` refused at parse and admission. |
| 2. Closed sequence | Thought admits the exact step list. Controller executes each once. No self-extending budget. |
| 3. Authority isolation | Needs `bounded_operation` influence + `operationAllowed === true`. `authorshipAllowed`, `engineeringAllowed`, `candidate_authorship`, and child capabilities do not grant M6. Child steps still need their own M3/M4/M5 grants. |
| 4. Objective admission | Origin is `owner_request` or `ashley_private_interest`. Independent of M5 sealing. |
| 5. No new effect class | Dispatcher still returns `unknown_operation` for `objective.operate`, `patch_export`, and `live_apply`. M6 composes existing executors. |
| 6. M7 refusal | `patch_export` / apply / git / deploy names refused at parse and admission (`m7_effect_forbidden`). |
| 7. Stop/cancel | Deadline, cancel-before-next-step, child failure, and authority loss all stop. No silent continue. |
| 8. M5 consumption | Success path may persist a `proposed` change-set. `applied` and `exported` are locked false. Honesty says no border effect was performed. |
| 9. Control plane | Schema v31 `bounded_operation_tasks` / `bounded_operation_steps` are `CONTROL_PLANE`. `border_state` CHECK is `'none'`. No auto-resume. |
| 10. One Ashley | No worker, no OpenCode, no nested Thought-inside-controller. Continuation still refuses any second `operationalRequest`. Proactive M6 is refused. |
| 11. Honesty | Locked sentence names completed or stopped admitted operations and "no border effect was performed." Expression inflation to applied/exported is floored. |
| 12. Legacy | No V1 broker, no Wave 08 `change_proposals` as the V2 store, no `source_*` authority. |

---

## 2. Ladder (this packet)

| Stage | Status | Evidence |
|---|---|---|
| Design accepted | PASS | Roadmap §14 is `REFINED`. No dedicated M6 design file. Handoff restates §14. |
| Implemented | PASS at `9f6544bf4692c2544011ab3f31543446bf8d3c42` | Capability, closed-sequence controller, schema v31, honesty lock |
| Locally verified | PASS | Matrix below |
| Independently reviewed | PASS | This packet |
| Physically qualified | NO | Not run. Not claimed. Criteria remain |
| RELEASE_QUALIFIED | NO | Not claimed |
| Deployed | NO | Not claimed |
| Capability promoted | NO | `bounded_operation` production default remains observe via `ensureRelease` |
| Production witnessed | NO | Not claimed |
| Production accepted | NO | Not assigned |

---

## 3. Verification matrix

Local only. No production database. Stage 0 worker policy: parallel by default;
Mint host-script suites remain excluded.

| Claim | Command / surface | Result | Classification |
|---|---|---|---|
| sandbox-policy typecheck | `npm run build --prefix apps/sandbox-policy` | PASS | Settlement |
| sandbox-v2 typecheck | `npm run build --prefix apps/sandbox-v2` | PASS | Settlement |
| agent-service typecheck | `cd apps/agent-service && npx tsc --noEmit` | PASS | Settlement |
| sandbox-policy tests | `npm test --prefix apps/sandbox-policy` | 122 passed | Settlement |
| sandbox-tree tests | `npm test --prefix apps/sandbox-tree` | 31 passed | Settlement |
| sandbox-m1 tests | `npm test --prefix apps/sandbox-m1` | 11 passed, 1 skipped | Settlement. Skip is host integration, not Mint qualification |
| sandbox-v2 tests | `npm test --prefix apps/sandbox-v2` | 154 passed, 2 skipped | Settlement. Linux integration skips are not physical qualification |
| M6 kernel + agent falsification | `controller.test.ts`, `m6-phase-d.test.ts`, `migration-31.test.ts` | 31 passed | Settlement |
| agent-service corpus excluding Mint host scripts | `npm test --prefix apps/agent-service` | 1333 passed / 161 files | Settlement |
| agent-service offline, same exclude | `npm run test:offline --prefix apps/agent-service` | 1333 passed / 161 files | Settlement |
| Wall-clock (agent corpus) | Stage 0 parallel policy | 65.84s test + 67.15s offline | Performance, not architecture |
| Mint / SSH / Bubblewrap qualification / production DB | — | SKIPPED | Required later; not claimed |

Skipped physical checks remain required for a later exact frozen M-series candidate.

---

## 4. Open risks

- Production `bounded_operation` remains observe. Example registry keeps
  `operationAllowed` false.
- Real controller timing, cancellation under load, and cleanup on the Mint host
  are not proven.
- Partial-progress restart remains audit-only. No auto-resume, by design.

---

## 5. Recommended Doc sign-off

If this packet is accepted as local settlement, say:

> M6 is locally settled: design accepted, implemented, locally verified, and independently reviewed at SHA `9f6544bf4692c2544011ab3f31543446bf8d3c42`. It is not physically qualified and not production accepted. M7 design handoff and implementation may begin under the batched M-series qualification policy.

Do not treat that sentence as capability promotion or Mint authorization.
