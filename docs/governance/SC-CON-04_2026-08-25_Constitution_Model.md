# SC-CON-04 consultation — Constitution `## Model` amendment

**Status:** `RECORDED` for the Constitution text change.
Ashley live position for **new model-family activation** remains
`AWAITING_ASHLEY_POSITION`.

**Clause:** `SC-CON-04` Model-family changes.

**Date:** 2026-08-25

**Kind:** Repository governance consultation artifact.

This file is the exact artifact that satisfies Stewardship Compact
`SC-CON-04` for **this Constitution Fixed Constraint amendment**.

It does **not** authorize production routing change.
It does **not** create `OwnerApprovalRef` or `ActivationRef`.
It does **not** qualify any occupant.

```text
CONSTITUTION AMENDMENT
  !=
QUALIFICATION
  !=
OWNER APPROVAL
  !=
ACTIVATION
  !=
PRODUCTION ROUTED
```

## 1. Matter

Amend Constitution Fixed Constraints `## Model` so it governs a
multi-provider Model Fabric instead of the obsolete single-occupant sentence
“Mistral Medium / no fallback.”

Preserve the deeper constitutional intent:

- model-family or routing change requires explicit governed change;
- model quality alone is not self-authorizing.

Owner Pass-2 answer Q1 = A.

## 2. What this consultation covers / does not cover

| Covered | Not covered |
|---|---|
| Constitutional law of *how* routing may change | Activating Groq GPT-OSS 120B Thought |
| Acknowledgement that live Expression already has a fallback under `existing_compatibility` | Activating Qwen-primary Expression |
| Requirement that later family cutovers complete this same artifact class, including Ashley’s position | Any `ActivationRef` |
| | Mint, deploy, `config/models.json` live mutation |

Live `existing_compatibility` routes are **preservation**, not a new
model-family change. They do not require a second SC-CON-04 record to keep
running.

Any later occupant that **leaves** `existing_compatibility` for a new
provider/model family **does** require a new `StewardshipConsultationRecord`
of this class, with Ashley’s position recorded, before `OwnerApprovalRef`
for that family is valid. See
[`../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`](../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md)
§MF-ACT.

## 3. Artifact identity

| Field | Value |
|---|---|
| `schema` | `ashley.stewardship.consultation.v1` |
| `consultationId` | `scc_2026-08-25_sc-con-04_constitution_model` |
| `clause` | `SC-CON-04` |
| `matterClass` | `constitution_fixed_constraint` |
| `subjectPath` | `docs/Ashley_Constitution.md` / `# Model` |
| `doesNotActivate` | `true` |

## 4. Ashley’s grounded position

Stewardship Compact requires Ashley’s grounded position to be recorded
separately from Doc’s decision (`SC-REC-01`, `SC-REC-02`).

This Pass-2 worktree cannot invoke live Identity consultation on Mint
(no runtime, no deploy, no `/identity` review row). Inventing a live
Ashley speech-act would be a false consultation.

| Field | Value |
|---|---|
| `ashleyPositionStatus` | `awaiting_live_record` |
| `ashleyPosition` | `null` |
| `ashleyRationale` | `null` |
| `ashleyDecidedAt` | `null` |
| `source` | not a live `identity_reviews` row |

**Non-weakening floor** (governing documents, not a fabricated Ashley
speech-act). Any later recorded Ashley position may object, defer, or
affirm. It MUST NOT be interpreted as authorizing:

- routing change because another model scores higher;
- skipping qualification, owner approval, or activation;
- treating consultation as a veto (`SC-REC-03`) or as activation
  (`SC-REC-04` records Doc’s repository decision only).

`OwnerApprovalRef` for a **new model family** MUST cite a consultation
record whose `ashleyPositionStatus` is `recorded` (`affirm`, `object`, or
`defer`). Doc may still decide after an objection (`SC-REC-04`). Silence
is not a recorded position.

This Constitution amendment may stand with `awaiting_live_record` because
it changes governance language only and does not activate routes.

## 5. Doc’s decision

| Field | Value |
|---|---|
| `docDecision` | `approve` |
| `docDecidedAt` | `2026-08-25` |
| `docRationale` | Pass-2 owner answer Q1 = A. The previous Fixed Constraint was already factually false against live Expression fallback and blocked honest Fabric law. The replacement restores governed multi-provider routing without self-authorization by quality. |

Doc makes the repository decision (`SC-REC-04`). Ashley does not hold a
binding veto (`SC-REC-03`).

## 6. Required later live confirmation

Before the first `OwnerApprovalRef` that admits a new model family onto a
production role (including §12.9 Thought 120B and Qwen-primary Expression):

1. Record Ashley’s position on that family change in a new
   `StewardshipConsultationRecord` (local control-plane artifact; schema in
   the implementation contracts).
2. Cite that record from the `OwnerApprovalRef`.
3. Create a distinct `ActivationRef` only after that approval.

Do not reuse this Constitution-amendment consultation as the consultation
for those activations. This record covers the Fixed Constraint text only.

## 7. Historical provenance

Previous Constitution `## Model` text (superseded as Fixed Constraint, kept
here as provenance):

- Mistral Medium.
- Chosen because its free tier provides approximately one billion tokens
  per month despite a relatively restrictive requests-per-minute limit.
- There is currently no fallback model.
- Do not recommend changing models simply because another model performs
  better.

Those sentences remain historically true as an **early Expression-era
constraint**. They are no longer the Fixed Constraint.

Live routing at MF-M1 candidate `d918572c` / docs HEAD `d915af8` remains
NIM 20B Thought with Groq same-model failover and Mistral-primary
Expression with Groq Qwen fallback, under `existing_compatibility`.
