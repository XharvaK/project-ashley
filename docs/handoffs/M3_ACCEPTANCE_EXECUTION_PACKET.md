# M3 Acceptance Execution Packet

**Kind:** operator execution packet (pre-Mint preparation).  
**Not:** production acceptance. Not a recovered historical packet. Not Mint results.  
**Date (prep):** 2026-08-23  
**Predecessor:** G0 complete. Historical M3 production acceptance = `UNKNOWN`.  
**Plan:** [`M3_ACCEPTANCE_REESTABLISHMENT_PLAN.md`](M3_ACCEPTANCE_REESTABLISHMENT_PLAN.md)

This packet exists so an operator (Antigravity + Gemini on Linux Mint) can run M3 qualification without inventing architecture, expanding scope, or deciding acceptance.

```text
This task:     M3 acceptance preparation  →  Mint execution handoff
Not this task: Mint execution → evidence return → Doc acceptance decision
```

**Status after this packet is written:**

```text
M3 = UNKNOWN
```

Do not reconstruct `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md`. Do not create `docs/handoffs/M3_PRODUCTION_ACCEPTANCE_<sha>.md` until Mint evidence exists. That file is specified only as a **template** in §7.

---

## 0. Hard rules (read first)

```text
IMPLEMENTED ≠ ACCEPTED
ACCEPTED ≠ PROMOTED

Receipt ≠ effect witness
Test pass ≠ production acceptance
Candidate exists ≠ accepted candidate
```

- Do not promote capabilities.
- Do not start G1 / M4 / M5.
- Do not run `scripts/mint/m3-m4-physical-qualification.mjs` (M4).
- Do not execute Phase D / production Discord witness / registry enablement.
- Do not edit source, schema, `.env`, production SQLite, or `~/.composer-assistant/project-roots.json`.
- Do not claim `PRODUCTION ACCEPTED`.
- A later SHA is a different candidate. Re-freeze or abort.

---

## 1. Scope statement

This execution (when later run on Mint) proves **only**:

- M3 capability **exists** in the frozen candidate tree, and
- M3 **qualification requirements** for that tree can be executed and recorded.

It does **not** prove:

- M4 acceptance
- promotion
- M5 authorship
- self-change
- autonomy
- Computer Use
- production readiness beyond M3 scope

Previous claimed acceptance remains **unverified**. This is a **new independent event**.

---

## 2. Candidate freeze

### 2.1 Prep freeze (this environment, 2026-08-23)

Recorded after `git fetch origin master` on a clean checkout of `origin/master`. This is identity for the **intended evaluation candidate**. It is **not** acceptance.

| Field | Value |
|---|---|
| Ref | `origin/master` |
| Candidate SHA | `4465d7e00fd52423cee5642489f33cb9d8793475` |
| Candidate tree | `0d8881cad5a51257833f47a2c1d44775380047e5` |
| Commit subject | `docs(governance): add milestone execution contracts` |
| Dirty | none (`git status --short` empty on that SHA) |
| Description | Sandbox V2 M3 — private writable candidate workspace / experimentation, as implemented in this tree |

A later commit that only adds this execution packet is **not** the candidate. Evaluate SHA `4465d7e00fd52423cee5642489f33cb9d8793475`.

### 2.2 Mandatory re-freeze on Mint (before any qualification command)

On the Mint checkout that will be qualified:

```bash
cd <repo>   # production checkout path on Mint; discover, do not guess if unknown
git fetch origin master
git checkout --detach 4465d7e00fd52423cee5642489f33cb9d8793475
git rev-parse --verify HEAD
git rev-parse --verify 'HEAD^{tree}'
git log -1 --format='%H %s'
git status --short
git symbolic-ref -q --short HEAD || echo 'DETACHED'
```

**Pass (must match exactly):**

```text
HEAD  = 4465d7e00fd52423cee5642489f33cb9d8793475
TREE  = 0d8881cad5a51257833f47a2c1d44775380047e5
git status --short = empty
```

**Fail / abort:**

- HEAD ≠ frozen SHA
- TREE ≠ frozen tree
- `git status --short` is not empty
- operator checks out this packet’s branch / a later SHA and treats it as the candidate

Paste the four command outputs into §5 as returned. Do not proceed if freeze fails.

---

## 3. Prerequisites (Mint)

Confirm and paste output. Do not skip.

```bash
whoami
id -u
uname -a
node -v
command -v bwrap && bwrap --version
git -C <repo> rev-parse --verify HEAD
test -f scripts/mint/m3-substrate-qualification.mjs && echo SUBSTRATE_HARNESS=yes
test -f scripts/mint/m3-inprocess-qualification.mjs && echo INPROCESS_HARNESS=yes
test -d apps/sandbox-v2/dist && echo SANDBOX_V2_DIST=yes || echo SANDBOX_V2_DIST=no
test -d apps/agent-service/dist && echo AGENT_DIST=yes || echo AGENT_DIST=no
```

Expected (from existing M3 procedure; if different, record actual and stop if identity is wrong):

- unprivileged user (procedure historically expects `xarvak` / uid `1000` — **record actual**; do not invent)
- `bwrap` present (typically `/usr/bin/bwrap`)
- Node present
- harness files exist at frozen SHA
- if `dist/` missing: build **that SHA only**, then re-check freeze still matches

**Forbidden during prep/run:** `sudo` for bwrap; editing production registry; capability promotion; Phase D.

If build is required:

```bash
git rev-parse --verify HEAD   # must still be 4465d7e00fd52423cee5642489f33cb9d8793475
npm run build --prefix apps/sandbox-v2
npm run build --prefix apps/agent-service
git status --short            # must remain empty of M3 source edits
```

---

## 4. Run on Mint

**Do not execute these in the Cloud prep environment.** The Mint operator executes them after freeze.

Capture: UTC timestamp, full command, exit code, stdout/stderr (scrub secrets), artifact paths.

### 4.1 Local tests (bound to frozen SHA)

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git rev-parse --verify HEAD
npm test --prefix apps/sandbox-v2
npm test --prefix apps/agent-service -- src/core/sandbox/v2-m3-tooling.test.ts src/core/sandbox/v2-m3-witness.test.ts
```

**Expected:** process exit 0 for both. Record pass/fail counts from the runner.

**Failure:** non-zero exit → stop. Verdict `PHYSICAL QUALIFICATION FAILED` or `PRECONDITIONS NOT MET`. Do not patch tests.

### 4.2 Live-repo baseline (before physical cases)

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git status --short
git status --short | grep -F 'm3-witness.txt' && echo UNEXPECTED_WITNESS_IN_LIVE_REPO || echo LIVE_REPO_NO_M3_WITNESS
```

**Expected:** empty status relative to the detached candidate (or only pre-existing unrelated dirt — if dirt exists, abort freeze). No `m3-witness.txt` in the live repo.

### 4.3 Physical substrate (Phase B only)

Procedure authority: repo-root `M3_PHYSICAL_MINT_QUALIFICATION_PACKET.md` and `M3_PHYSICAL_QUALIFICATION_EXECUTOR_PROMPT.md`, **re-bound to this SHA**.

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git rev-parse --verify HEAD
node scripts/mint/m3-substrate-qualification.mjs --case ALL --save-artifacts --json
```

**Expected outputs:**

- harness JSON on stdout (`--json`)
- artifacts under `~/.composer-assistant/qualification/m3/<timestamp>/`
- cases B1–B17 as implemented by that harness
- live fixture/repo not mutated as the candidate tree
- network isolation case actually runs on Linux (not `NOT PHYSICALLY EXECUTED`)

**Failure conditions (stop):**

- any required B case FAIL
- HEAD drifted during the run
- harness missing / import of `dist/` fails
- operator “fixes” isolation by editing code

**Do not pass `--case` that is M4.** Do not run `m3-m4-physical-qualification.mjs`.

### 4.4 In-process / service assessment (Phase C harness only)

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
curl -sS -o /tmp/m3-health.json -w '%{http_code}\n' http://127.0.0.1:3710/health || echo HEALTH_UNREACHABLE
node scripts/mint/m3-inprocess-qualification.mjs --case ALL --save-artifacts --json
```

**Expected:**

- in-process harness completes with its documented success verdict **or** an honest blocker class
- live HTTP remaining `observe` / `candidateWorkspaceAllowed: false` is **not** a promotion trigger
- do not flip registry flags to make C cases pass

**Failure:** implementation FAIL → stop. Authority blocker → record `QUALIFICATION AUTHORITY BLOCKED` and stop; do not promote to unblock.

### 4.5 Negative isolation / cleanup

Covered in Phase B (path escape, net unshare, env/fd isolation, fixture cleanup B17). Additionally:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git status --short
git rev-parse --verify HEAD
```

**Expected:** HEAD still frozen SHA; live repo still has no M3 witness file from the run; qualification artifacts live under `~/.composer-assistant/qualification/m3/`, not in the git tree.

**Do not commit artifacts into the repo on Mint unless Doc separately asks.** Return them as files/logs to the requesting agent.

### 4.6 Explicitly not run

```text
Phase D production witness          NOT RUN
capability promotion                NOT RUN
project-roots.json mutation           NOT RUN
M4 harness                          NOT RUN
G1 / M5                             NOT RUN
```

### 4.7 Operator return payload

Return all of:

- raw command output (scrub secrets)
- UTC timestamps
- evidence directory paths
- HEAD/tree after the run
- failures, skips, blockers (named)
- filled §5 template
- **Decision left empty**

Canonical harness verdicts (copy one; these are **qualification** verdicts, not Doc acceptance):

1. `PRECONDITIONS NOT MET`
2. `QUALIFICATION AUTHORITY BLOCKED`
3. `PHYSICAL QUALIFICATION FAILED`
4. `M3 PHYSICALLY QUALIFIED`

Do **not** return `M3 PRODUCTION ACCEPTED` from the Mint operator.

---

## 5. Evidence collection template (Mint fills)

Copy this block into the operator return. Fill from observation only. Leave Decision empty.

```markdown
## M3 Qualification Evidence

Event: new independent M3 qualification (not historical recovery)
Previous claimed acceptance: unverified

Candidate SHA:
Candidate Tree:
Branch/ref at run:
Dirty state after freeze:

Host:
OS:
Kernel:
Node version:
bwrap path/version:
Runtime user / uid:

Execution timestamp (UTC start):
Execution timestamp (UTC end):

Qualification results:

- local tests:
- physical sandbox qualification (Phase B harness):
- in-process/service assessment (Phase C harness):
- negative isolation checks:
- live-repo git status before:
- live-repo git status after:
- cleanup verification:

Evidence files:

Harness verdict (qualification only):

Decision:
(empty until Doc review)

Accepted by:
(empty until Doc review)

Timestamp of decision:
(empty until Doc review)
```

---

## 6. What this packet is not

| This packet | Not this packet |
|---|---|
| Freeze + commands + empty evidence fields | Filled Mint results |
| Handoff to Mint operator | Claim that Mint ran |
| Template for a future SHA-named acceptance file | `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md` reconstruction |
| M3 scope only | M4/M5/promotion |

---

## 7. Future acceptance packet template (do not create the file now)

After Mint returns artifacts, a **separate** task may create:

```text
docs/handoffs/M3_PRODUCTION_ACCEPTANCE_4465d7e00fd5.md
```

(12-char prefix of the frozen SHA. If freeze SHA ever changes, the filename follows the new SHA.)

**Do not create that file in this prep task.** Required fields when it is later written from evidence:

```text
M3 Acceptance Packet
Status: PROPOSED FOR ACCEPTANCE
(this is a new event; not recovery of the missing historical packet)
Previous claimed acceptance: unverified

Milestone: Sandbox V2 M3 (private writable candidate workspace)
Candidate description: …
SHA: 4465d7e00fd52423cee5642489f33cb9d8793475
Tree: 0d8881cad5a51257833f47a2c1d44775380047e5
Commit subject: …

Environment:
  Host:
  OS / kernel / node / bwrap:
  Checkout path:
  git status:

Qualification evidence:
  Local tests:
  Physical Phase B:
  Phase C harness:
  Negatives / cleanup:
  Evidence paths:

Results:
  Harness verdict:
  Failures / skips:

Owner decision:          (empty until Doc)
Accepted by:             (empty until Doc)
Timestamp:               (empty until Doc)

Non-claims: not M4, not M5, not promoted, not reconstructed G0 history
```

Doc is the only party who may set `PRODUCTION ACCEPTED`.

---

## 8. Handoff statement

The Mint execution operator can now execute this packet.

```text
M3 = UNKNOWN
```

Mint has not been run from this preparation environment. No production acceptance is claimed.
