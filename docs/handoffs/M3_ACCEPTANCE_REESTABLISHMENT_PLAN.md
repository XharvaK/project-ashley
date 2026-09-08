# M3 Acceptance Re-establishment Plan

**Kind:** planning only. Not an acceptance packet. Not a recovered historical record.  
**Date:** 2026-08-23  
**Predecessor gate:** G0 complete. Historical M3 production acceptance = `UNKNOWN`.  
**This document does not:** reconstruct the missing packet, claim prior `PRODUCTION ACCEPTED`, implement code, change schema, modify architecture, start M4, promote, or start M5.

G0 searched the repository, Git history, GitHub contents, CI artifacts, local project stores, and reachable Cursor artifacts. `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md` was never present. That absence stays `UNKNOWN`. This plan defines a **new, independent evidence-bound M3 acceptance event**.

---

## 0. Relationship to previous history

| Item | Status |
|---|---|
| Previous claimed acceptance | **Unverified.** M4 packet cites SHA `28e157a4d2029c3196559fd2569d73e48c53e1b3` and `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md`. G0 did not recover that packet. Citation ≠ acceptance. |
| SHA `28e157a` | Exists. It is a delivery-policy commit, not an acceptance document. Commit existence ≠ accepted. |
| New acceptance event | **Independent.** Bound only to the candidate frozen in §1 at execution start and to evidence collected under this plan. |

Do not copy, backfill, or restyle a historical packet. Do not treat `28e157a` as accepted because it was named. If that SHA is later selected as the new candidate, it is still a **new** event, not recovered history.

---

## 1. Candidate identity

Identity is frozen **at execution start**, not in this planning document. Planning-time Git is observation only.

### 1.1 How to freeze (required first execution step)

On the authorized evaluation checkout:

```text
SHA          = git rev-parse --verify HEAD
TREE         = git rev-parse --verify HEAD^{tree}
COMMIT       = git log -1 --format='%H %s' HEAD
WORKTREE     = git status --porcelain  (must be empty, or abort)
```

Record all four in the new packet before any qualification command. If HEAD moves after freeze, the packet is invalid for the new HEAD.

### 1.2 Intended default (not yet frozen)

Planning observation (`git fetch origin master`, 2026-08-23):

| Field | Value |
|---|---|
| Default freeze ref | `origin/master` at execution start |
| Observed `origin/master` at plan time | `4465d7e00fd52423cee5642489f33cb9d8793475` |
| Observed tree OID at plan time | `0d8881cad5a51257833f47a2c1d44775380047e5` |
| M3 implementation ancestor (source presence only) | `44a85c00ee7ac76942ce0f5b4dbe5a9938898116` |

Doc may name a different existing SHA at freeze. The named SHA must already contain M3. This plan does not add M3 features.

### 1.3 Candidate description (frozen M3 contract only)

**Milestone:** Sandbox V2 M3 — private writable candidate workspace / experimentation.

**Capability under test:** durable private candidate workspace; typed file operations; live-repository non-mutation; M1/M2/M3 arbitration as specified in [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_M3_DESIGN.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_M3_DESIGN.md).

**Out of candidate description:** M4 verification, M5 authorship, promotion, registry mutation, production enablement.

---

## 2. Acceptance criteria (frozen M3 contract; no scope expansion)

Source of criteria (do not widen):

- [`ASHLEY_SANDBOX_V2_M3_DESIGN.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_M3_DESIGN.md) — M3 surface, non-goals, local qualification, physical witness design
- [`M3_PHYSICAL_MINT_QUALIFICATION_PACKET.md`](../../M3_PHYSICAL_MINT_QUALIFICATION_PACKET.md) — Mint procedure and evidence classes
- [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md) — ladder; no stage implies the next

Acceptance of the **new** event must prove **only** these three claims, all bound to the frozen SHA/tree:

1. **M3 capability exists** in that tree (implementation present: candidate-workspace machinery and typed operations). Source presence is not acceptance by itself.
2. **M3 qualification criteria pass** for that tree: local tests required by the M3 design §13, plus Mint physical qualification required by the existing M3 packet (creation witness, persistence witness, live/candidate separation, stated negatives). Use the existing packet as procedure. Do not add M4 recipes, network, Git writes, or promotion steps.
3. **Evidence corresponds to this candidate:** every command output, hash, host fact, and log cites the frozen SHA and tree OID. A prior-SHA result does not qualify a later SHA.

Hard non-goals (already in the M3 contract; restated so this plan cannot grow):

- No shell/build/test/lint inside the candidate (M4)
- No change-set authorship (M5)
- No capability promotion
- No production registry change unless a later, separately authorized packet requires it for a named witness — **this re-establishment plan does not authorize that**

### 2.1 Ladder discipline

```text
IMPLEMENTED ≠ ACCEPTED
ACCEPTED ≠ PROMOTED
```

Local tests ≠ physically qualified. Physically qualified ≠ `PRODUCTION ACCEPTED`. `PRODUCTION ACCEPTED` ≠ capability promoted. Doc’s decision on the **new packet** is the only transition to `PRODUCTION ACCEPTED` for this event.

The existing physical packet’s frozen local block (`PRODUCTION ACCEPTANCE: NOT YET`, commit/push/deploy/promotion `NOT DONE`) is **procedure history for its original run**, not a result for the new SHA. Re-run and record against the frozen candidate. Do not edit that packet into a fake historical success.

---

## 3. Evidence packet (required contents)

**Do not** create `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md` as a reconstruction of the missing file.

**Do** create a **new** packet after evidence exists, named so it cannot be mistaken for recovered history:

```text
docs/handoffs/M3_PRODUCTION_ACCEPTANCE_<12-char-sha>.md
```

Required fields (fill only from collected evidence; leave `Decision` empty until Doc signs):

```text
M3 Acceptance Packet
Status: PROPOSED FOR ACCEPTANCE | PRODUCTION ACCEPTED | REJECTED | DEFERRED
(this is a new event; not a recovery of the missing historical packet)

Milestone: Sandbox V2 M3 (private writable candidate workspace)
Candidate description: <one paragraph from §1.3>
SHA: <full 40-char>
Tree: <git rev-parse HEAD^{tree}>
Commit subject: <git log -1 --format=%s>

Environment:
  Host: <production qualification host identity, e.g. Linux Mint>
  Checkout path: <path>
  git status: empty
  Kernel / bwrap: <observed, if the physical packet requires it>

Qualification results:
  Local (design §13): <commands, exit codes, bound to SHA>
  Physical (existing M3 Mint packet): <Gate 1, Gate 2, negatives; evidence class tags>
  Failures / skips: <named, or none>

Evidence:
  Files / logs / hashes / workspace ids / live-repo git status before and after
  (no secrets, no host credential material)

Decision: <empty until Doc>
Accepted by: <empty until Doc>
Timestamp: <empty until Doc>
```

Also required in the same packet:

- Explicit line: previous claimed acceptance = unverified
- Explicit line: this event is independent
- Non-claims: not M4, not M5, not promoted, not a reconstructed G0 packet

---

## 4. Separation rules

| Allowed in this path | Forbidden |
|---|---|
| Freeze SHA/tree | Architecture edits |
| Run existing M3 tests and existing Mint M3 procedure | New M3 features, schema, Sandbox code |
| Write the **new** named packet from results | Filling the missing historical filename as if recovered |
| Doc decision on that packet | Starting M4 acceptance (G1) before this event is `PRODUCTION ACCEPTED` |
| | Promotion (G2), M5, Model Fabric, capability enablement |

G1 (M4 packet close) stays blocked until this **new** event is `PRODUCTION ACCEPTED` for the predecessor SHA the M4 packet must then cite. Updating the M4 predecessor citation is **out of this plan**. It is G1-prep after this gate, not M4 start.

---

## 5. Execution steps (no implementation in this plan)

1. **Authorize** this re-establishment as the current task. Do not start G1/M4/M5.
2. **Freeze** candidate identity (§1.1). Abort if the worktree is dirty.
3. **Confirm source presence** of M3 in that tree (file/module inventory). Record as `IMPLEMENTED` observation, not acceptance.
4. **Local qualification** on a machine that can run the M3 unit/dispatch/authority tests named in design §13. Bind outputs to SHA. Docs-only this planning file does not satisfy §13.
5. **Physical qualification** on Linux Mint using [`M3_PHYSICAL_MINT_QUALIFICATION_PACKET.md`](../../M3_PHYSICAL_MINT_QUALIFICATION_PACKET.md) and the executor prompt, **re-bound** to the frozen SHA. Do not execute M4. Do not execute the packet’s production-promotion / Phase D enablement steps. Creation + persistence + negatives only.
6. **Write** `docs/handoffs/M3_PRODUCTION_ACCEPTANCE_<12-char-sha>.md` with results. Status: `PROPOSED FOR ACCEPTANCE`.
7. **Acceptance gate (Doc only):** if the packet is complete and bound, Doc may set `PRODUCTION ACCEPTED` with name and timestamp. If evidence is incomplete: leave `UNKNOWN` / reject / defer. Do not infer.

If any step cannot be run, stop and record `UNKNOWN` or `BLOCKED` for that step. Do not substitute another SHA’s logs.

---

## 6. Acceptance gate

**Opens when:** frozen SHA + tree recorded; local M3 tests for that SHA passed; Mint M3 physical gates for that SHA passed; new packet exists; live repo non-mutation shown; no M4/M5/promotion claims.

**Closes when:** Doc writes `PRODUCTION ACCEPTED` (or reject/defer) on that packet.

**Does not close by:** G0 report, M4 citation, implementation commit `44a85c0`, local tests alone, or this plan.

**After a close with `PRODUCTION ACCEPTED`:** M3 for **that SHA** is accepted. Promotion remains separate. G1 may then be considered as a later task against the M4 packet, which still must not be rewritten in this plan.

---

## 7. Required evidence (checklist)

- [ ] SHA (40 hex) and tree OID
- [ ] Empty worktree at freeze
- [ ] Host identity (Mint for physical claims)
- [ ] Local M3 test commands + exit codes for that SHA
- [ ] Physical Gate 1 (create witness, live repo unchanged)
- [ ] Physical Gate 2 (persist across authorized restart, same workspace id)
- [ ] Negatives (candidate ≠ live root; no network/Git/secrets in M3 path)
- [ ] New packet path `docs/handoffs/M3_PRODUCTION_ACCEPTANCE_<12-char-sha>.md`
- [ ] Doc decision fields filled only by Doc

---

## 8. What this plan is not

Not architecture. Not G0 reconstruction. Not `PRODUCTION ACCEPTED`. Not a candidate freeze until step 2 of execution. Not authorization to SSH, deploy, or promote.
