# M-Series Mint Campaign Plan (plan only)

**Status:** PLAN ONLY. This file does not authorize SSH, Mint qualification,
deployment, registry mutation, capability promotion, production witness, or
production acceptance.

**Date:** 2026-08-23  
**Frozen local candidate:** [`m-series-local-freeze.md`](m-series-local-freeze.md)  
**Predecessor policy:** [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md) §17  
**Wave acceptance:** [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md)

```text
MINT CAMPAIGN = NOT EXECUTED
```

A coordinated campaign does **not** mean simultaneous inherited acceptance.
Each milestone keeps its own evidence and gate.

---

## 1. Exact candidate first

Freeze the exact local M-series candidate (SHA, schema, packets) before any
Mint work. Do not qualify a moving worktree. Do not mix M5, M6, and M7
physical evidence into one inherited acceptance.

Current local freeze identity is recorded in
[`m-series-local-freeze.md`](m-series-local-freeze.md). Resolve HEAD live
from Git at campaign start. If it cannot be established: `UNKNOWN`. Stop.

---

## 2. Production dependency order

```text
freeze exact M-series candidate

M5 physical qualification
  → release qualification
  → deploy/admit as required
  → promotion
  → production witness
  → M5 production acceptance

then M6 production ladder
  (predecessor: M5 PRODUCTION ACCEPTED)

then M7 production ladder
  (predecessor: M6 PRODUCTION ACCEPTED
   plus accepted design for the named profile)
```

Do not start M6 physical qualification as a substitute for M5 acceptance.
Do not start M7 physical qualification as a substitute for M6 acceptance.
Do not treat a green local corpus as any of those gates.

---

## 3. Per-milestone physical claims (not run here)

### M5

Physical where Git/filesystem mechanics are host-dependent. Prove no writable
`.git` in the candidate workspace, approval cannot apply, stale base blocks,
secrets excluded. Smallest witness: one coherent multi-file candidate
change-set. Still forbidden after M5 physical: M6 autonomy and every M7
effect.

### M6

Physical for the real controller and failure/cleanup paths. Prove no border
gain, no unbounded loop, no peer identity, no blind retry, child authority
attenuated. Smallest witness: one bounded multi-step candidate-only
objective. Still forbidden after M6 physical: every M7 effect.

### M7 (`patch_export` only)

Physical per effect profile and real destination. Prove PREPARE → REVALIDATE
→ COMMIT on the operator review path, exact artifact identity, destination
grant, receipt distinct from read-back witness, other profiles denied,
authority expiry/revocation, no live apply / Git / deploy / network unless a
later independently accepted profile says so. Smallest witness: one sealed
M5 patch copied to the real operator review location.

Later profiles (`live_apply`, git, package, deploy, restart, network) each
need their own design, local settlement, physical qualification, and
acceptance. Accepting `patch_export` does not authorize them.

---

## 4. What this campaign must not do

- SSH or qualify from this local-completion task (already forbidden; remains
  forbidden until Doc starts the campaign against the frozen SHA)
- Mutate production `nuclear.db` or continuity as a test convenience
- Promote `candidate_authorship`, `bounded_operation`, or `patch_export`
  because local tests passed
- Apply an exported patch to Ashley
- Run Learned Autonomy, Cognitive Graduation, Computer Use, Model Fabric, or
  Operational Continuity work under this banner
- Revive Sandbox V1 / OpenCode workers

---

## 5. Suggested campaign packets (later)

When Doc starts the campaign, create separate evidence packets:

1. `m5-physical-qualification.md` for the frozen SHA
2. M5 release / deploy / promotion / witness / production acceptance packets
3. `m6-physical-qualification.md` only after M5 `PRODUCTION ACCEPTED`
4. M6 remaining ladder packets
5. `m7-patch-export-physical-qualification.md` only after M6
   `PRODUCTION ACCEPTED`
6. M7 remaining ladder packets for `patch_export` only

Do not collapse those into one "M-series accepted" sentence.
