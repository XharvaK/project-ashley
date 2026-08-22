# Sandbox V2 M4 — Production Acceptance Packet

**Milestone:** Sandbox V2 M4 (Candidate Verification)  
**Predecessor:** M3 `PRODUCTION ACCEPTED` at SHA `28e157a4d2029c3196559fd2569d73e48c53e1b3`  
([`docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md`](M3_PRODUCTION_ACCEPTANCE.md))  
**Packet date:** 2026-08-22  
**This packet status:** `PROPOSED FOR ACCEPTANCE`  
**Not claimed:** `PRODUCTION ACCEPTED`, capability promotion, deployment, Discord witness, or production enablement

This file consolidates design, implementation, and Mint physical evidence so a reviewer can decide whether M4 may move from **implemented + physically qualified (kernel, overlay)** toward **PRODUCTION ACCEPTED**. It does not itself enable M4.

---

## 0. Honesty: two SHAs / two trees

M4 is **not** on the production checkout `HEAD`.

| Tree | SHA | Porcelain | M4 source |
|---|---|---|---|
| Production Mint `~/project-ashley` (qualification host) | `28e157a4d2029c3196559fd2569d73e48c53e1b3` | empty at qualification time | **Absent** (`apps/sandbox-v2/src/verification/` missing; harness missing) |
| This worktree (packet authoring) | `28e157a4d2029c3196559fd2569d73e48c53e1b3` on `master` | **dirty** — M4 implementation uncommitted | **Present** (uncommitted / untracked) |

Live `git` at packet writing (`C:\Users\Xharv\Projects\composer-assistant`):

- **HEAD:** `28e157a4d2029c3196559fd2569d73e48c53e1b3`
- **branch:** `master`
- **status:** M4 lives in modified `apps/sandbox-v2`, `apps/sandbox-policy`, `apps/agent-service`, and untracked `apps/sandbox-v2/src/verification/`, `scripts/mint/m3-m4-physical-qualification.mjs`, and related tests. Production Mint checkout was not this dirty tree.

**M4 physical qualification source:** a **temporary overlay** of that worktree kernel onto a `/tmp` clone of production `28e157a`, compiled there, executed, then **deleted**. Overlay is not production state. Do not treat production `HEAD` as containing M4.

---

## 1. Milestone identity

* **Milestone identifier:** `M4`
* **Name:** Sandbox V2 Candidate Verification
* **Governing architecture:** [`ASHLEY_SANDBOX_V2_ROADMAP.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md), [`ASHLEY_SANDBOX_V2_M4_DESIGN.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_M4_DESIGN.md)
* **Process:** [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md)

### Purpose and scope

M4 binds a named snapshot of an existing M3 candidate workspace and runs one operator-catalog recipe under direct Bubblewrap. The only licensed sentence is:

> This named snapshot of this candidate workspace produced this mechanical outcome under this named recipe.

**What M4 is:** bounded `workspace.verify`; split receipt (`protocolState` ≠ `verificationOutcome`); ephemeral `/output` projection; discard after run.

**What M4 is not:** engineering judgment, merge/Git/deploy authority, live-repository mutation, self-modification, package install, network acquisition, proactive/autonomous verification loops, M5 change-sets, M6 iteration, M7 engineering effects.

**Laws preserved:**

```text
CANDIDATE WORKSPACE MUTATION != LIVE REPOSITORY MUTATION
VERIFICATION RESULT != ENGINEERING JUDGMENT
```

---

## 2. Acceptance ladder (this packet)

Stages are independent. No stage implies a later stage.

| Stage | Status in this packet | Evidence bound |
|---|---|---|
| **Design accepted** | **PASS** | [`ASHLEY_SANDBOX_V2_M4_DESIGN.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_M4_DESIGN.md) header `DESIGN ACCEPTED` |
| **Implemented** | **PRESENT IN WORKTREE, NOT ON PRODUCTION HEAD** | Phases A–F source listed in §3. Production `28e157a` does not contain M4. |
| **Locally verified** | **NOT RE-EXECUTED IN THIS PACKET** | Phase tests exist in the worktree (`recipe-catalog.test.ts`, `snapshot.test.ts`, `executor.test.ts`, `m4-phase-d.test.ts`, `m4-phase-e.test.ts`, `m4-phase-f.test.ts`). This packet does not attach a fresh corpus log. |
| **Independently reviewed** | **NOT CLAIMED** | No separate independent-review packet is attached here. |
| **Physically qualified** | **PASS WITH NOTES** | Mint kernel harness §5–§6. Notes: overlay source; honest `verified_failure`; reduced `touch` probe not EROFS proof; kernel does not enforce `verificationAllowed` (agent layer does). |
| **RELEASE_QUALIFIED** | **NO** | M4 is not an exact production-checkout candidate. |
| **Deployed** | **NO** | Production checkout remains M3 SHA without M4. |
| **Capability promoted** | **NO** | `candidate_verification` not promoted. Ingress branch defaults `available: false` / `candidate_verification_unqualified`. |
| **Production witnessed** | **NO** | No Discord DM witness. |
| **Production accepted** | **NOT ASSIGNED** | Reviewer/Doc decision only. This file proposes; it does not accept. |

---

## 3. Implementation present (worktree)

Not a claim that production runs this code.

### Phase A — Recipe catalog

Source: `apps/sandbox-v2/src/verification/recipe-catalog.ts`

- Immutable catalog records; `recipeId`-only request surface
- `definitionHash` / `argvIdentity` seal
- Shell and package-manager executable rejection
- `networkMode: "none"` on the first-slice recipe
- Missing host executable → admission refusal (`toolchain_unavailable`), not PATH/npm fallback

### Phase B — Snapshot identity

Source: `apps/sandbox-v2/src/verification/snapshot.ts`, `workspace-manager.ts` `resumeExistingWorkspace`

- `snapshotId`, `workspaceId`, `projectId`, `candidateTreeHash`, `sourceSnapshotId`
- Before/after hash comparison on the durable candidate
- Verification resumes an existing workspace; it does not create one

### Phase C — Verification kernel

Source: `apps/sandbox-v2/src/verification/executor.ts` (separate from M3 `workspace/executor.ts`)

- Direct `spawn(/usr/bin/bwrap, argv array)` — no shell
- Candidate `--ro-bind` `/candidate`; projection `--bind` `/output`
- No copy-back; projection discarded
- Split receipt: `protocolState` vs `verificationOutcome`

### Phase D — Authority wiring (agent)

Source: `apps/agent-service/src/core/sandbox/v2-execution.ts`, `verification-license.ts`, `operational-truth.ts`, `project-registry.ts`, `capabilities.ts`

- Capability `candidate_verification` (`operator_cutover`, deps `["thought"]`)
- Registry `verificationAllowed` + `allowedRecipeIds` (defaults closed in `sandbox-policy`)
- `OperationalClaimLicense` / `OperationalTruth` after a receipt exists
- Honesty: recipe outcome is not quality, merge, or self-improvement

### Phase E — Cognition boundary

Source: `apps/agent-service/src/core/agency/thought.ts`, `runtime.ts`, `turn-deadline-plan.ts`

- Thought may request `{operation, projectId, workspaceId, recipeId}` only
- No command/argv/executable/env/network/cwd in the request
- No proactive verification; one sandbox action per turn
- Deadline branch `candidateVerification.available: false` by default

### Phase F — Composition witness (software)

Source: `apps/agent-service/src/core/sandbox/m4-phase-f.test.ts`

- Local composition of Thought → execute → license → truth → Expression
- Not Mint, not Discord, not promotion

---

## 4. Host (physical qualification)

Recorded by the M4 harness at `2026-08-22T18:34:10.093Z` and by the M3 substrate run the same evening.

| Fact | Value |
|---|---|
| OS | Linux Mint 22.3 |
| kernel | `6.17.0-29-generic` |
| hostname | QXY |
| user | xarvak |
| bwrap | bubblewrap 0.9.0 (`/usr/bin/bwrap`) |
| Node (declared) | v22.23.2 at `/opt/node/bin/node` → nvm prefix `/home/xarvak/.nvm/versions/node/v22.23.2` |
| TypeScript | Version 5.9.3 at `/opt/node/lib/node_modules/typescript/bin/tsc` |
| Production SHA | `28e157a4d2029c3196559fd2569d73e48c53e1b3` |
| Production branch | `master` |
| Production git status | porcelain empty (harness `liveBefore` / `liveAfter`) |

Declared toolchain: `/opt/node` symlink to the nvm prefix. Identity `mint:node-v22.23.2` matches Node v22.23.2.

---

## 5. M3 evidence (independent)

**Command** (production checkout, no M4 overlay required):

```bash
cd ~/project-ashley
node scripts/mint/m3-substrate-qualification.mjs --save-artifacts --json
```

Artifact: Mint `/tmp/m3-phys-qual.json` (copied locally as untracked `m3-phys-qual.json`). Timestamp `2026-08-22T18:26:54.573Z`.

| Field | Value |
|---|---|
| suite | `PROJECT_ASHLEY_SANDBOX_V2_M3_SUBSTRATE_QUALIFICATION` |
| **verdict** | **M3 SUBSTRATE QUALIFIED** |
| **physicalVerdict** | **PASS** |
| workspace ID | `aKylKnBlUj2Gu-AbZlK2vw` |
| B1–B17 | each `physicalVerdict: PASS` |
| B7 live repo | `liveMutated: false`; sha256 `cf638cbb32331a0d99110697fb5f9ff790a11c15749bbc287a132bcc0bcc708e` |
| B11 network | `sandboxHitsDelta: 0`, sandbox isolated |
| B12 environment | `envClean: true` |
| B17 cleanup | temporary fixture/workspace roots removed |

**Conclusion:** M3 substrate qualification remains **PASS** on this host, independent of M4.

---

## 6. M4 physical evidence

**Qualification command** (existing harness; not a new test path):

```bash
node scripts/mint/m3-m4-physical-qualification.mjs
```

**How it was run:** production `HEAD` lacked M4 and lacked this script. Operator copied the already-implemented kernel and harness into `/tmp/ashley-m4-qual-20260822T182756Z` (clone of `28e157a` + overlay). Compiled with operator `/opt/node` TypeScript. **No `npm install` during verification.** Overlay **deleted** after the run.

Artifact: Mint `/tmp/m4-phys-qual.json` (local untracked `m4-phys-qual.json`). Suite `PROJECT_ASHLEY_SANDBOX_V2_M3_M4_PHYSICAL_QUALIFICATION`.

### 6.1 Recipe admission

Catalog first-slice recipe (`typescriptFixtureCompileV1`):

| Field | Value |
|---|---|
| recipeId | `typescript_fixture_compile_v1` |
| recipeVersion | `1` |
| recipeDefinitionHash | `59537d26bc9ed6ae7dcfe76ad2d2e9c3d29d51dfccc847a6551e2c019188e18d` |
| executableIdentity | `mint:node-v22.23.2` |
| toolchainIdentity | `mint:node-v22.23.2+tsc` (catalog; not a receipt field) |
| argvIdentity | `aeb7389f0a7ba6df264a9d95780277f785ce66da4b53b48ecb466bee4f08c805` |
| executablePath | `/opt/node/bin/node` |
| argv | `/opt/node/lib/node_modules/typescript/bin/tsc --pretty false --rootDir /candidate --outDir /output` |
| networkMode | `none` |

Confirmed for this run: no shell wrapper, no package manager, no repository `package.json` scripts, no PATH fallback. Host `hostNodeBinExists: true`. Outcome was not `toolchain_unavailable`.

### 6.2 Snapshot evidence (s2)

Isolated fixture `projectId: m4-phys-fixture` (not the live Ashley tree).

| Field | Value |
|---|---|
| workspaceId | `JcAjEgk3fWqwb6LDEvc0BQ` |
| projectId | `m4-phys-fixture` |
| snapshotId | `vsnap_5c7c8b007c5ea48d064840c8bc9b8bc6` |
| sourceSnapshotId | `snap_67748c279ccab48e7b4e716e` |
| candidateTreeHashBefore | `8a32d8d78b1a1a438662c40e979287acc444cd888350deeb885cdc7327ea071a` |
| candidateTreeHashAfter | `8a32d8d78b1a1a438662c40e979287acc444cd888350deeb885cdc7327ea071a` |
| hashesEqual | true |
| candidateUnchanged | true |

Workspace existed from harness M3 `acquireWorkspace` (`s1_m3` same id). Kernel verify path is `resumeExistingWorkspace`. No copy-back. Hash change between s2 and s4 is the **harness** writing `bad.ts` between runs, not the recipe.

### 6.3 Bubblewrap evidence

Kernel `buildVerificationBwrapArgs` / `spawnBubblewrapVerification`:

| Claim | Evidence |
|---|---|
| `--unshare-net` | `s3_ro_bind.unshareNet: true` |
| candidate read-only | `candidateRoBind: true`, guest `/candidate` |
| projection writable | `--bind` of ephemeral `/output` (kernel args) |
| toolchain bind | nvm prefix `--ro-bind` to guest `/opt/node` |
| environment | `--clearenv`, `PATH=/usr/bin`, `HOME=/tmp` |
| live repository | not in verification binds; `liveUnchanged: true` |

**Verified:** actual recipe spawn occurred (s2/s4 `protocolState: admitted`, `exitCode: 1`, not `sandbox_failure`).

**Not proven:** the reduced independent probe `touch /candidate/leaked` failed with `bwrap: execvp /usr/bin/touch: No such file or directory`. That is missing `/usr/bin/touch` in that reduced bwrap, **not** an EROFS demonstration. After the probe, `leaked: false` and the candidate hash was unchanged.

### 6.4 Verification outcome

Recorded exactly (s2 receipt):

```text
protocolState: admitted
verificationOutcome: verified_failure
exitCode: 1
timedOut: false
stdoutSha256: a1aa1763854a721bf913dff5d4a09097acdca2f673eb6712ce4d0f77ccdf6730
stderrSha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

This is a **recipe outcome**, not sandbox failure. s4 produced the same protocol/outcome/exit and the **same** stdout/stderr hashes after adding a type-error file, which is consistent with tsc not seeing distinct inputs (fixture has no `tsconfig.json`; recipe argv lists no source files). That observation is mechanical. It is **not**:

- a judgment that the candidate is bad code
- a failed improvement
- a merge decision
- a quality or self-modification claim

s5 (injected spawn + `verificationAllowed: false` on an in-memory registry): `closedSpawns: 1`, error `sandbox_failure`. The **kernel** `executeCandidateVerification` does not check `verificationAllowed`; `executeCandidateVerificationV2` does. s5 is not production registry proof and must not be read as “recipe failed.”

### 6.5 Cleanup

| Item | Evidence |
|---|---|
| projection | `cleanupCompleted: true`, `projectionDiscarded: true` (s2 and s4) |
| processes / mounts | post-run: no leftover `bwrap`, no `/tmp/ashley-m4-proj-*`, no stale ashley-m4 mounts |
| overlay | `/tmp/ashley-m4-qual-20260822T182756Z` removed |
| production checkout | `liveUnchanged: true`; SHA still `28e157a4d2029c3196559fd2569d73e48c53e1b3`; porcelain empty |

---

## 7. Authority boundary

M4 does **not** provide:

- engineering judgment
- merge authority
- Git authority
- deployment authority
- self-modification
- production mutation
- autonomous verification loops

M4 provides only the licensed sentence in §1.

This packet did **not** query live `nuclear.db` or production `project-roots.json`. Worktree defaults: `verificationAllowed` normalizes false; example registry keeps `verificationAllowed: false` and empty `allowedRecipeIds`; deadline policy keeps `candidateVerification.available: false`.

---

## 8. Remaining blocked / not enabled

Explicitly **not** done by this packet and **not** enabled on production:

- Production registry `verificationAllowed` / recipe allowlist
- `candidate_verification` capability promotion
- Ingress deadline-branch availability for verification
- Discord witness
- Autonomous or proactive verification
- Exact-candidate M4 on production `HEAD` (commit/deploy)
- M5 change-sets
- M6 iteration
- M7 engineering effects

`implemented != available != promoted`. Overlay physical qualification ≠ production M4.

---

## 9. Acceptance status

**Allowed values:** `PROPOSED FOR ACCEPTANCE` | `ACCEPTED WITH NOTES` | `ACCEPTED` | `REJECTED`

**This packet:** `PROPOSED FOR ACCEPTANCE`

**Not used:** `PRODUCTION ACCEPTED` (Doc/reviewer only, after remaining ladder stages they require).

Notes a reviewer may weigh:

1. Physical kernel evidence is real Mint Bubblewrap with the declared toolchain, but the **code under test was an overlay**, not production `HEAD`.
2. Honest recipe result was `verified_failure`, not `verified_success`.
3. Later Wave Acceptance stages (release qualification, deploy, promotion, Discord witness) have **no** evidence here.
4. Agent-layer `verificationAllowed` is not enforced inside the kernel executor.

```text
================================================================================
M4 PACKET STATUS:        PROPOSED FOR ACCEPTANCE
Production HEAD:         28e157a4d2029c3196559fd2569d73e48c53e1b3 (M4 absent)
M4 source for Mint run:  temporary overlay, deleted
M3 substrate:            QUALIFIED / PASS (independent)
M4 kernel physical:      admitted + verified_failure; candidate unchanged; cleanup passed
Capability promoted:     NO
Registry enabled:        NO
Discord witness:         NO
Production accepted:     NOT ASSIGNED
================================================================================
```
