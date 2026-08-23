# Sandbox V2 M7 — Local Settlement Packet

**Milestone:** Sandbox V2 M7 (Controlled Engineering Effects), first named
profile `patch_export` only  
**Contract:** [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md) §15  
**External-effect law:** [`docs/architecture/External_Effect_and_Authority_Architecture.md`](../architecture/External_Effect_and_Authority_Architecture.md)  
**Handoff context:** [`m7-design-handoff.md`](m7-design-handoff.md)  
**Implementation SHA:** `34e5798278786f0cb40808abcb242db93512d4bc` (branch `cursor/m-series-local-completion-2357`)  
**Packet date:** 2026-08-23  
**This packet status:**

```text
M7 = LOCALLY SETTLED
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

M7's first slice answers only:

> Can Ashley cross one named engineering border by exporting a sealed M5
> candidate artifact to an operator-controlled review location, under
> independently authorized destination and artifact scope, with receipt and
> effect witness kept distinct?

It does not apply the patch. It does not merge, commit, push, deploy, or
restart. It does not make the sealed artifact Ashley.

No Mint, SSH, Bubblewrap qualification claim, production database mutation,
production registry mutation, capability promotion, deployment, production
witness, live apply, Git write, apply-to-Ashley, or self-change execution was
performed for this packet.

```text
NAMED EFFECT != GENERAL AUTHORITY
CAPABILITY != AUTHORITY
REQUEST != EFFECT
RECEIPT != EFFECT WITNESS
M5 SEALED ARTIFACT != ASHLEY
PATCH EXPORT != APPLY
LOCAL SETTLEMENT != PHYSICAL QUALIFICATION
LOCAL SETTLEMENT != PRODUCTION ACCEPTANCE
```

There is no dedicated `ASHLEY_SANDBOX_V2_M7_DESIGN.md`. Authority used was
roadmap §15 plus External Effect and Authority plus the M7 design handoff as
context. The handoff did not override the roadmap. Later profiles were not
invented.

Physical destination and read-back witness remain required per profile. They
are deferred to the coordinated Mint campaign. Production acceptance still
requires M6 `PRODUCTION ACCEPTED` plus this named profile's own ladder.

---

## 1. Independent review verdict

**Verdict:** the accepted first-slice M7 contract is satisfied. Central
invariant holds: `patch_export` copies a sealed M5 artifact to an
operator-bound review location; it does not apply, and it does not confer any
later M7 profile.

M6 remains responsible for finite M3/M4/M5 sequences with border state
`none`. Completing M6 does not export. M5 sealing does not export. Unrelated
capabilities do not export.

### Defects found and fixed

| Defect | Classification | Fix |
|---|---|---|
| Kernel tests used raw `mkdtempSync` paths that can fail `isCanonicalForm` when `/tmp` is a symlink | BLOCKER during ITERATION | Tests canonicalize via `realpathSync` + `canonicalizePath` |
| Export destination could sit inside the live project root | BLOCKER during ITERATION | Registry refuses destination overlap with `canonicalRoot` |
| Roadmap names `git_commit` / `git_push` were not in the first-slice refuse list | BLOCKER during ITERATION | Added to `M7_FORBIDDEN_PROFILES`. `git.commit` / `git.push` still fail first as `m5_apply_forbidden` |
| Bare `patch_export` envelope needed a typed fail, not `unknown_operation` | NON-BLOCKING during ITERATION | Known op; missing fields fail closed inside the executor (`missing_project`) |

No remaining blockers against roadmap §15 first slice.

### Non-blocking notes

| Note | Why not a blocker |
|---|---|
| No dedicated rollback profile | First slice is an additive copy. Different digest at the destination is `destination_conflict` and is not overwritten. Revoking the capability does not delete an already-copied file. |
| Discord turn-deadline is not the M7 lifecycle | PREPARE/REVALIDATE/COMMIT is the effect lifecycle. Same reading as M6 vs roadmap §10. Physical timing remains a later Mint claim. |
| Historical M6 settlement said dispatcher `unknown_operation` for `patch_export` | True at M6 SHA `9f6544b`. After M7, `patch_export` is a known named op. M6 still refuses it as a sequence step (`m7_effect_forbidden`). |
| Uncaught witness mismatch after write | File remains. Retry refuses `destination_conflict`. License maps `witness_mismatch` to `outcome_unknown` and does not repeat. |

### Review areas

| Area | Result |
|---|---|
| 1. Named effect only | Dispatcher admits `patch_export`. `live_apply`, `git_branch_create`, `git_commit`, `git_push`, `git_pr`, package, deploy, restart, and `network.request` return `m7_profile_forbidden`. |
| 2. Authority isolation | Needs `patch_export` influence + `patchExportAllowed` + operator `exportDestinationCanonicalRoot`. `authorshipAllowed`, `operationAllowed`, `engineeringAllowed`, M5, and M6 do not grant M7. |
| 3. Model cannot choose the host path | Thought may name `projectId` + `changesetId` only. Destination, artifact bytes, and digest come from registry + sealed M5 row. |
| 4. Artifact identity | Only `proposed` change-sets with `artifact_ref` and `patch_sha256` export. Quarantined, missing, owner-mismatched, and project-mismatched rows refuse. |
| 5. PREPARE → REVALIDATE → COMMIT | Kernel binds dest/grant/artifact, rechecks digest and dest, copies once, read-back witnesses SHA-256. |
| 6. Receipt ≠ witness | Record stores copy facts. Honesty/OperationalTruth require `witnessState: digest_readback` matching `patchSha256`. Transport success is not the claim. |
| 7. Export ≠ apply | Result locks `applied: false`, `liveUnwritten: true`, `gitUnwritten: true`. Schema CHECKs the same. Honesty says it has not been applied. |
| 8. M6 independence | `objective.operate` remains `unknown_operation`. M6 admission still returns `m7_effect_forbidden` for `patch_export`. |
| 9. Control plane | Schema v32 `patch_export_records` is `CONTROL_PLANE`. Production `patch_export` defaults to observe via `ensureRelease`. |
| 10. One Ashley | No worker, no OpenCode, no Computer Use, no second Agency. Continuation still refuses any second `operationalRequest`. Proactive M7 is refused. |
| 11. Legacy | No V1 broker, no live Git, no apply-to-Ashley. |

---

## 2. Ladder (this packet)

| Stage | Status | Evidence |
|---|---|---|
| Design accepted | PASS | Roadmap §15 is `RENAMED` / refined. First witness is `patch_export`. Handoff restates §15. |
| Implemented | PASS at `34e5798278786f0cb40808abcb242db93512d4bc` | Capability, destination grant, kernel copy+witness, schema v32, honesty lock |
| Locally verified | PASS | Matrix below |
| Independently reviewed | PASS | This packet |
| Physically qualified | NO | Not run. Not claimed. Real destination + read-back remain |
| RELEASE_QUALIFIED | NO | Not claimed |
| Deployed | NO | Not claimed |
| Capability promoted | NO | `patch_export` production default remains observe via `ensureRelease` |
| Production witnessed | NO | Not claimed |
| Production accepted | NO | Not assigned. Predecessor remains M6 `PRODUCTION ACCEPTED` |

---

## 3. Verification matrix

Local only. No production database. Stage 0 worker policy: parallel by default;
Mint host-script suites remain excluded.

| Claim | Command / surface | Result | Classification |
|---|---|---|---|
| sandbox-policy typecheck | `npm run build --prefix apps/sandbox-policy` | PASS | Settlement |
| sandbox-v2 typecheck | `npm run build --prefix apps/sandbox-v2` | PASS | Settlement |
| agent-service typecheck | `cd apps/agent-service && npx tsc --noEmit` | PASS | Settlement |
| sandbox-policy tests | `npm test --prefix apps/sandbox-policy` | 125 passed | Settlement |
| sandbox-tree tests | `npm test --prefix apps/sandbox-tree` | 31 passed | Settlement |
| sandbox-m1 tests | `npm test --prefix apps/sandbox-m1` | 11 passed, 1 skipped | Settlement. Skip is host integration, not Mint qualification |
| sandbox-v2 tests | `npm test --prefix apps/sandbox-v2` | 160 passed, 2 skipped | Settlement. Linux integration skips are not physical qualification |
| M7 kernel + agent falsification | `export/executor.test.ts`, `dispatch.test.ts`, `m7-phase-d.test.ts`, `migration-32.test.ts` | PASS | Settlement |
| M6 regressions | `operate/controller.test.ts`, `m6-phase-d.test.ts` | PASS | Settlement |
| agent-service corpus excluding Mint host scripts | `npm test --prefix apps/agent-service` | 1344 passed / 163 files in 68.28s | Settlement |
| agent-service offline, same exclude | `npm run test:offline --prefix apps/agent-service` | 1344 passed / 163 files in 68.15s | Settlement |
| Mint / SSH / Bubblewrap qualification / production DB | — | SKIPPED | Required later; not claimed |

Adversarial local proofs covered: capability observe/disabled, unrelated
capabilities, M5/M6 grants without `patchExportAllowed`, sealed-copy success
with locked `applied: false`, quarantined/missing artifacts, Thought-supplied
destination/apply fields, unauthorized project, later-profile refuse, digest
conflict, idempotent same-digest copy.

---

## 4. Open risks

- Production `patch_export` remains observe. Example registry keeps
  `patchExportAllowed` false.
- Real operator destination, symlink-escape on the Mint host, and read-back
  witness of a production review path are not proven.
- There is no named rollback that deletes an exported file.

---

## 5. Recommended Doc sign-off

If this packet is accepted as local settlement, say:

> M7 first slice (`patch_export`) is locally settled: design accepted,
> implemented, locally verified, and independently reviewed at SHA
> `34e5798278786f0cb40808abcb242db93512d4bc`. It is not physically qualified
> and not production accepted. No later M7 profile is authorized.

Do not treat that sentence as capability promotion or Mint authorization.
