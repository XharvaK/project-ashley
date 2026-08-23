# M-Series Local Freeze

**Date:** 2026-08-23  
**Branch:** `cursor/m-series-local-completion-2357`  
**This packet status:**

```text
M-SERIES IMPLEMENTATION TRACK LOCALLY COMPLETE
```

That means M3–M7 design/implementation/local verification/independent review
are recorded for this candidate. It does **not** mean any of M5, M6, or M7 is
physically qualified, release-qualified, deployed, promoted, production
witnessed, or production accepted.

```text
M5 NOT PHYSICALLY QUALIFIED
M6 NOT PHYSICALLY QUALIFIED
M7 NOT PHYSICALLY QUALIFIED

M5 NOT PRODUCTION ACCEPTED
M6 NOT PRODUCTION ACCEPTED
M7 NOT PRODUCTION ACCEPTED
```

Mint campaign was planned only. It was not executed.

---

## 1. Frozen local candidate identity

Resolve live from Git after this packet lands. At packet writing:

| Item | Value |
|---|---|
| Branch | `cursor/m-series-local-completion-2357` |
| M5 implementation | `d0e84c753e7788d8b4f5539aa1c1a80ef5c3b85d` |
| M6 implementation | `9f6544bf4692c2544011ab3f31543446bf8d3c42` |
| M7 implementation | `34e5798278786f0cb40808abcb242db93512d4bc` |
| Freeze packet | `69a57acb744bfb5dfc099a26aeb4ac86a2abe8a3` |
| Nuclear schema | source `NUCLEAR_SUPPORTED_VERSION = 32` in `apps/agent-service/src/core/db.ts` |
| Root package | `project-ashley` `0.2.0` |
| agent-service | `0.1.0` |
| sandbox-policy | `0.1.0` |
| sandbox-v2 | `0.1.0` |

Working tree at freeze writing is this docs packet on `69a57ac`.
Do not treat worktree source as deployed.

---

## 2. Local settlement artifacts

| Milestone | Packet | Local meaning |
|---|---|---|
| M5 | [`m5-local-settlement.md`](m5-local-settlement.md) | Authorship seals an advisory change-set |
| M6 | [`m6-local-settlement.md`](m6-local-settlement.md) | Finite bounded M3/M4/M5 sequence, border `none` |
| M7 | [`m7-local-settlement.md`](m7-local-settlement.md) | Named `patch_export` copy + digest witness |
| Test policy | [`local-test-parallelism-audit.md`](local-test-parallelism-audit.md) | Parallel by default; host suites excluded |

---

## 3. Integration review

The composed mechanism still decomposes as:

```text
M3  candidate workspace experimentation
M4  candidate mechanical verification
M5  candidate authorship / sealing
M6  finite bounded operation over accepted capabilities
M7  named engineering-border effect (first: patch_export)
```

Independent review of the composed tree rejects any automatic:

```text
author → verify → operate → export → apply
```

self-improvement loop. Composition does not create authority by accumulation.

| Risk | Result |
|---|---|
| M6 manufactures M7 | FAIL CLOSED. M6 step `patch_export` is `m7_effect_forbidden`. `objective.operate` is not a dispatcher effect. |
| M5 manufactures M7 | FAIL CLOSED. Sealed artifact is artifact scope only. Export needs `patch_export` + `patchExportAllowed` + dest root. |
| M7 manufactures apply | FAIL CLOSED. `applied` locked false. `changeset.apply` / `git.commit` remain `m5_apply_forbidden`. `live_apply` is `m7_profile_forbidden`. |
| Unrelated capabilities accumulate | FAIL CLOSED. Each milestone has its own capability and registry grant. |
| Second cognitive owner | FAIL CLOSED. Thought names bounded requests. M6 executes an admitted closed sequence. M7 copies a named artifact. Agency is not replaced. |
| V1 / OpenCode / workers | Absent. Direct unprivileged Bubblewrap kernel. No broker resurrection. |

M3–M4 local and production states are not reopened by this freeze. M5–M7
remain locally settled only.

---

## 4. Capability and registry states (this candidate)

| Capability | Production default | Local settlement claim |
|---|---|---|
| `candidate_authorship` | observe via `ensureRelease` | Locally settled. Not promoted. |
| `bounded_operation` | observe via `ensureRelease` | Locally settled. Not promoted. |
| `patch_export` | observe via `ensureRelease` | Locally settled. Not promoted. |

Example / operator registry defaults keep `authorshipAllowed`,
`operationAllowed`, and `patchExportAllowed` closed unless an operator
explicitly opens them. Tests open grants in isolated registries only.

---

## 5. Intentionally unqualified production states

Do not infer these from source presence or this freeze:

- PHYSICALLY QUALIFIED (M5, M6, M7)
- RELEASE_QUALIFIED
- DEPLOYED
- CAPABILITY PROMOTED
- PRODUCTION WITNESSED
- PRODUCTION ACCEPTED
- live repository mutation
- Git write / commit / push / PR
- apply-to-Ashley / self-change execution
- Learned Autonomy, Cognitive Graduation, Computer Use, Model Fabric,
  Operational Continuity

Later physical campaign: [`m-series-mint-campaign-plan.md`](m-series-mint-campaign-plan.md).
That file is a plan. It is not authorization to SSH, qualify, deploy, or
promote.
