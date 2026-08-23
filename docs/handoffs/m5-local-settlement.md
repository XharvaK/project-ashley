# Sandbox V2 M5 — Local Settlement Packet

**Milestone:** Sandbox V2 M5 (Candidate Authorship)  
**Contract:** [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_M5_DESIGN.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_M5_DESIGN.md)  
**Implementation SHA:** `d0e84c753e7788d8b4f5539aa1c1a80ef5c3b85d` (branch `cursor/m5-authorship-boundary-2357`)  
**Packet date:** 2026-08-23  
**This packet status:**

```text
M5 = LOCALLY SETTLED
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

M5 answers only:

> Can Ashley seal a bounded proposed change-set artifact?

It does not answer whether Ashley should become that change.

No Mint, SSH, Bubblewrap qualification claim, production database mutation,
production registry mutation, capability promotion, deployment, production
witness, M6 implementation, M7 implementation, apply-to-Ashley, or self-change
execution was performed.

```text
M5 AUTHORSHIP != SELF-CHANGE
M5 AUTHORSHIP != APPLY
M5 AUTHORSHIP != M6
M5 AUTHORSHIP != M7
LOCAL SETTLEMENT != PHYSICAL QUALIFICATION
LOCAL SETTLEMENT != PRODUCTION ACCEPTANCE
```

Physical criteria in the M5 contract and M-series roadmap are preserved. They
are deferred to the coordinated Mint campaign after M7 independent review.
See roadmap §17.2.1.

---

## 1. Independent review verdict

**Verdict:** the accepted M5 contract is satisfied after three
architecture-consistent fixes. Central invariant holds: authorship seals an
advisory `CandidateChangeSet`; it does not apply, approve, or become Ashley.

### Defects found and fixed

| Defect | Fix |
|---|---|
| Dispatcher `changeset.apply` / `changeset.merge` / `git.commit` / `git.push` returned generic `unsupported_operation` | Reachable apply-class ops now refuse `m5_apply_forbidden` |
| Quarantine persisted unredacted `objective` when secret scan hit Thought text | Quarantine stores `[redacted:secret_detected]` for objective and rationale; no patch bytes |
| `linkedVerificationRefs` copied declared `evidenceRefs` | Column stays `[]` until matching M4 receipts exist |
| Parent Git identity accepted any argv | Allowlist: `rev-parse HEAD`, `status --porcelain` |
| Empty `.git` directory in the candidate could be missed | Refuse if `.git` exists in the candidate tree |
| File-backed v21→current reopen still expected schema `29` | Assert `NUCLEAR_SUPPORTED_VERSION` (30) |

### Review areas

| Area | Result |
|---|---|
| 1. Artifact correctness | One store: `candidate_changesets`. Opaque `cs_…` id, owner/project/workspace, candidate and base hashes, mechanical delta, sealed patch outside `tree/`, bounded rationale. Wave 08 `change_proposals` unused as the V2 store |
| 2. Lifecycle | CHECK allows `proposed`, `quarantined`, `stale_base`, `superseded`, `abandoned`. First slice writes `proposed` and `quarantined`. No `approved` / `applied` / `committed` / `deployed` / `merged` columns or writers |
| 3. Authority isolation | Needs `candidate_authorship` influence + `authorshipAllowed === true` + reactive admission + existing M3 workspace. `engineeringAllowed`, `verificationAllowed`, `candidateWorkspaceAllowed`, `candidate_verification`, and `project_experimentation` do not grant M5 |
| 4. Non-mutation | Kernel hashes candidate before/after; writes only `_control/changesets/`; live files and Git HEAD unchanged in fixtures; `.git` in candidate refuses |
| 5. Patch bounds | ≤32 paths, ≤256 KiB, intended-path enforcement, text/id/recipe bounds, binary as hashes only, empty delta `empty_changeset`, extra paths `unbounded_path`. Thought cannot supply patch/argv/commands/apply |
| 6. Secrets | Rationale, objective, targetArea, expectedEffect, and generated patch scanned. Hit → `quarantined`, no raw patch, Thought text redacted. Events carry metadata only |
| 7. Control plane | Schema v30 `CONTROL_PLANE`. Row owns metadata; sealed file owns patch bytes; events are append-only metadata. No Memory / Recall / Identity / Mind State writes |
| 8. M4 | Capability dep is `thought` only. M5 does not run recipes. Receipt identity is not copied as a verified link. Verification is not approval |
| 9. Honesty | Locked success sentence: named candidate change-set sealed as advisory work; it has not been applied. Expression inflation to applied/merged/deployed/improved/self-modified is floored |
| 10. Apply refusal | Dispatcher apply-class ops return `m5_apply_forbidden`. Helper `refuseApplyCandidateChangeSet()` is the named refusal. Absence of UI is not the proof |
| 11. One-operation boundary | Continuation rejects any new `operationalRequest` / `authorshipRequest`. Author → verify is tested. Author → mutate / M6-like also fail because any second sandbox op is refused |
| 12. Legacy | M5 does not use Wave 08 `change_proposals`, V1 broker, or `source_*` as authority |

---

## 2. Ladder (this packet)

| Stage | Status | Evidence |
|---|---|---|
| Design accepted | PASS | M5 design header `DESIGN ACCEPTED` |
| Implemented | PASS at `d0e84c753e7788d8b4f5539aa1c1a80ef5c3b85d` | Capability, `changeset.author`, schema v30, honesty lock, apply refuse |
| Locally verified | PASS | Matrix below |
| Independently reviewed | PASS | This packet |
| Physically qualified | NO | Not run. Not claimed. Criteria remain |
| RELEASE_QUALIFIED | NO | Not claimed |
| Deployed | NO | Not claimed |
| Capability promoted | NO | `candidate_authorship` production branch stays `available: false` / `candidate_authorship_unqualified` |
| Production witnessed | NO | Not claimed |
| Production accepted | NO | Not assigned |

---

## 3. Verification matrix

Local only. No production database.

| Claim | Command / surface | Result | Classification |
|---|---|---|---|
| sandbox-policy typecheck | `npm run build --prefix apps/sandbox-policy` | PASS | Settlement |
| sandbox-tree typecheck | `npm run build --prefix apps/sandbox-tree` | PASS | Settlement |
| sandbox-m1 typecheck | `npm run build --prefix apps/sandbox-m1` | PASS | Settlement |
| sandbox-v2 typecheck | `npm run build --prefix apps/sandbox-v2` | PASS | Settlement |
| agent-service typecheck | `cd apps/agent-service && npx tsc --noEmit` | PASS | Settlement |
| sandbox-policy tests | `npm test --prefix apps/sandbox-policy` | 120 passed | Settlement |
| sandbox-tree tests | `npm test --prefix apps/sandbox-tree` | 31 passed | Settlement |
| sandbox-m1 tests | `npm test --prefix apps/sandbox-m1` | 11 passed, 1 skipped | Settlement. Skip is host integration, not Mint qualification |
| sandbox-v2 tests (M1–M5 kernel) | `npm test --prefix apps/sandbox-v2` | 142 passed, 2 skipped | Settlement. Linux integration skips are not physical qualification |
| schema/migration regressions | targeted vitest including v30 | 91 passed | Settlement |
| M3–M5 agent regressions | m3/m4/m5 phase tests + authorship-license | 88 passed | Settlement |
| agent-service corpus excluding Mint host scripts | vitest, exclude activation/rollback script tests | 1313 passed / 159 files after schema pin fix | Settlement / candidate-freeze local corpus |
| agent-service offline, same exclude | `vitest.offline.config.ts` | 1313 passed / 159 files | Settlement |
| V1 `verify-agent-tsc` driver | requires `apps/agent-service` dist | 5 passed after `tsc` emit | Not M5. Historical V1 driver |
| Mint activation/rollback script tests | `activation-*.test.ts`, `rollback-corrections.test.ts` | Not completed locally | Classified: host-script fixtures hung on this runner. Out of M5 scope. Not physical qualification. Criteria not waived |
| First `npm exec tsc --noEmit` from repo root | printed `tsc` help | False FAIL | Runner artifact. Real package-dir `tsc --noEmit` is clean |
| Mint / SSH / Bubblewrap qualification / production DB | — | SKIPPED | Required later; not claimed |

Skipped physical checks remain required for a later exact frozen M-series candidate.

---

## 4. Open risks

- First-slice does not write `stale_base` / `superseded` / `abandoned` yet. CHECK allows them; no apply-shaped aliases exist.
- `linkedVerificationRefs` matching is deferred. Declared evidence refs persist separately.
- Production `candidate_authorship` remains unqualified. Example registry keeps `authorshipAllowed` false.
- Coordinated Mint campaign must still prove live/Git non-mutation on the real host.

---

## 5. Recommended Doc sign-off

If this packet is accepted as local settlement, say:

> M5 is locally settled: design accepted, implemented, locally verified, and independently reviewed at SHA `d0e84c753e7788d8b4f5539aa1c1a80ef5c3b85d`. It is not physically qualified and not production accepted. M6 implementation may begin under the batched M-series qualification policy.

Do not treat that sentence as capability promotion or Mint authorization.
