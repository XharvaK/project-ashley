# Model Fabric MF-M2→MF-ACT — Pass 2 checkpoint

**Status:** `DOCUMENTATION FROZEN` / `IMPLEMENTATION CONTRACTS READY` (machinery).
**Not:** production routing authorization.

**Date:** 2026-08-25

**Planning worktree:** `C:\Users\Xharv\Projects\model-fabric-m2-m6-planning`

**Branch:** `model-fabric-m2-m6-planning`

**Starting / current source HEAD before Pass-2 docs:** `d915af86483e2af4f5edf2838023ffe22f875dcc`

**MF-M1 candidate (unchanged):** `d918572c7ae01d5b367323692bd6e8fbcf257895`

Pass 2.1 is a consistency freeze of the Pass-2 contracts. It does not
reopen owner decisions. It does not implement runtime.

```text
NO RUNTIME CODE
NO PUSH
NO DEPLOY
NO MINT
NO TARGET ROUTE ACTIVATED
```

Governing execution contract:

[`../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`](../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md)

Example JSON under `docs/architecture/model-fabric/examples/` is
**documentation fixtures**, not live `config/model-fabric/` dispatch.

---

## Readiness

| Milestone | Status |
|---|---|
| SLICE 0 (MF-M1 R1/R2) | `IMPLEMENTATION_READY` |
| MF-M2 | `IMPLEMENTATION_READY` |
| MF-M3 | `IMPLEMENTATION_READY` |
| MF-M4 | `IMPLEMENTATION_READY` |
| MF-M5 | `IMPLEMENTATION_READY` |
| MF-M6 | `IMPLEMENTATION_READY` |
| MF-ACT | `IMPLEMENTATION_READY` |

No milestone is `OWNER_DECISION_REQUIRED`, `ARCHITECTURE_CONTRADICTION`,
or `DEFERRED` for **machinery**.

Still blocked for **actual §12.9 production routing** (intended):

- live Ashley SC-CON-04 position on the specific family cutover;
- Evaluation `QualificationResult` `PASS` per occupant;
- owner-created `OwnerApprovalRef`;
- owner-created `ActivationRef`;
- Wave production acceptance of the exact candidate.

Numeric Evaluation thresholds and held-out corpus visibility remain
Evaluation-spike local. They do not block Luna from implementing machinery.

CURRENT routing remains the existing live compatibility routing.
Target §12.9 is not live. MF-ACT implementation does not authorize
activation. Luna MUST NOT create `OwnerApprovalRef` or `ActivationRef`.

---

## Owner answers frozen

Q1=A, Q2=modified A/B (MF-ACT added), Q3=C, Q4=B, Q5=strict A, Q6=B refined,
Q7=A+C, Q8=A, Q9=A, Q10=A refined, Q11=refined A, Q12=A, Q13=A, Q14=A,
Q15=A, Q16=A refined, Q17=B, Q18=modified B, shadow closed, R1/R2 = SLICE 0.

Q7/Q13 closed reading: `thought` has two policy rows (`interactive`,
`durable_proactive`) with independent `ActivationRef`s and coupling review.

CURRENT Thought wire `low` remains policy `economical`, not `standard`.
TARGET Thought is policy `high` / wire `high`.

---

## Constitution / SC-CON-04

- `docs/Ashley_Constitution.md` `## Model` now governs multi-provider Fabric.
- Consultation:
  [`../governance/SC-CON-04_2026-08-25_Constitution_Model.md`](../governance/SC-CON-04_2026-08-25_Constitution_Model.md)
- Ashley live position for **family cutover** is still
  `awaiting_live_record`. That blocks `OwnerApprovalRef` for new families,
  not machinery and not this Constitution-text amendment.
- Constitution amendment does **not** activate routes.

---

## What Luna may do next (not this checkpoint)

Implement SLICE 0 → MF-M2 → MF-M3 → MF-M4 → MF-M5 → MF-M6 → MF-ACT
**mechanics** from the execution contract.

Luna MUST NOT create `OwnerApprovalRef` or `ActivationRef`.
Luna MUST NOT change production routing.

---

## Docs created or materially updated this pass

Created:

- `docs/architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`
- `docs/architecture/model-fabric/examples/**` documentation fixtures
- `docs/governance/SC-CON-04_2026-08-25_Constitution_Model.md`
- this checkpoint

Updated:

- `docs/Ashley_Constitution.md`
- `docs/architecture/Model_Fabric_Architecture.md`
- `docs/architecture/Ashley_Milestone_Execution_Governance.md`
- `docs/architecture/Ashley_Architecture_Roadmap.md`
- `docs/architecture/Ashley_Evaluation_Qualification_Plane.md`
- `docs/architecture/evaluation/Evaluation_First_Spike.md`
- `docs/architecture/Ashley_Architecture_Document_Index.md`
- `docs/Architecture_Index.md`
- `docs/Routing_Status.md` (CURRENT callers only)
- `docs/handoffs/MODEL_FABRIC_ROADMAP_HANDOFF.md`
- `docs/handoffs/MODEL_FABRIC_OWNER_DECISION_PACKET.md`
- Pass-1 packet / gap matrix / research audit banners

Runtime / `config/models.json` / `config/model-fabric/`: **untouched**.
