# Project Ashley — Roadmap Handoff: Model Fabric

**Source Document:** [`docs/architecture/Ashley_Architecture_Roadmap.md`](../architecture/Ashley_Architecture_Roadmap.md)
**Governing architecture:** [`docs/architecture/Model_Fabric_Architecture.md`](../architecture/Model_Fabric_Architecture.md)
**Owner decisions:** [`MODEL_FABRIC_OWNER_DECISION_PACKET.md`](MODEL_FABRIC_OWNER_DECISION_PACKET.md)
**Status:** `LOCAL MF-M1 CANDIDATE` plus Pass-2 `IMPLEMENTATION_READY`
machinery contracts (SLICE 0 and MF-M2 through MF-ACT). Owner scope for
MF-M1 `CLOSED`; acceptance `NOT YET EVALUATED`; production
`NOT IMPLEMENTED`. §12.9 not live.
**Date:** 2026-08-25

The local MF-M1 candidate is implemented and checkpointed at
`d918572c7ae01d5b367323692bd6e8fbcf257895`, from exact requested start
`5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6`. No route behavior, OpenCode
adapter, Mint, or Operational Fulfillment M1 changes are included. Acceptance,
promotion, and production activation remain separate. Resume:
[`MODEL_FABRIC_MF_M1_IMPLEMENTATION_CHECKPOINT.md`](MODEL_FABRIC_MF_M1_IMPLEMENTATION_CHECKPOINT.md).

```text
SOURCE SNAPSHOT != PROMOTED CANDIDATE != RUNNING PRODUCTION
```

| | SHA |
|---|---|
| MF-M1 `planningBaselineSha` (current integration line) | `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a` |
| MF-M1 `sourceBaselineSha` (current integration line) | `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a` |
| MF-M1 `productionBaselineSha` (runtime baseline) | `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a` — OF-M1 production-proven; MF-M1 candidate is not production-routed |
| MF-M1 `implementationStartSha` | `5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6` |
| MF-M1 `candidateCommitSha` | `d918572c7ae01d5b367323692bd6e8fbcf257895` — local candidate; not accepted or production-routed |
| Historical MF documentation checkpoint | `7a7883753a7e6e5a002bf23d226645ce85730ee5` — docs-only |
| Historical pre-repair MF planning baseline | `8eedad8bebbed2d8cd984849a269afe256a3d08a` |
| Not the Fabric source baseline | `48bad019fe601d5c871a54dd9902879862c6e96a` (Sandbox M-series closure) |
| Historical routing line inherited by `8eedad8` | `04beaf1c21c9f7e0c9580692f57ed533d822f61e` |

If a later accepted candidate supersedes `e36613b`, a new implementation
candidate must revalidate against that exact integration SHA.

---

## 1. Exact next track

* **Canonical track:** Model Fabric
* **First implementation milestone:** **`MF-M1`** — seam around **existing**
  production routes; local candidate starts at `5a05e96`; zero intended
  routing/provider/model/reasoning behavior change
* **Not first:** historical **`F1` / F1-obs** Thought-observation Lightning
  shadow (retained, deferred, optional)
* **Not MF-M1:** owner-selected §12.9 target map (Qwen-primary Expression, Groq
  120B Thought, Nemotron Super/Ultra, …)
* **Classification:** Mechanism work
* **OpenCode in MF-M1:** **No**

---

## 2. Prerequisite status

* **Order classification:** `OWNER_SELECTED_IMPLEMENTATION_ORDER` following
  Sandbox Autonomy. Model Fabric does **not** derive semantic parenthood
  from Sandbox.
* **Sandbox closure evidence:** M1–M7 are `PRODUCTION ACCEPTED` at exact
  candidate `48bad019fe601d5c871a54dd9902879862c6e96a`. M7 is limited to the
  named `patch_export` profile. That SHA is **not** the MF-M1 source tree.
* **MF-M0:** COMPLETE as documentation (research + reconciliation + this
  source-baseline correction).
* **Resume condition for starting MF-M1 code:** satisfied for this candidate
  from exact requested start `5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6`;
  follow the checkpoint for acceptance and later re-evaluation.

---

## 3. Milestone sequence (corrected dependency)

| ID | Meaning | Production OpenCode? |
|---|---|---|
| MF-M0 | Docs / current-state freeze | No — complete |
| MF-M1 | Existing-route seam + receipts | **No** |
| SLICE 0 | R1/R2 receipt-truth repairs | No |
| MF-M2 | Unified CURRENT snapshot | No |
| MF-M3 | Catalog + qualification **minimum** | **No production route** |
| MF-M4 | Zen HTTP utility adapter (dark) | Track A utility only |
| MF-M5 | Availability among approved | Among approved |
| MF-M6 | Specialist resolve; `routine_validation` dark | After packs + owner activation |
| MF-ACT | Activation **mechanism** | Not a route cutover |
| F1-obs | Historical observation witness | Separate |

**Why MF-M3 before MF-M4:** `MODEL AVAILABLE != QUALIFIED != APPROVED FOR
ROLE`. An elastic backend must not become a production route before
qualification records exist.

Track B (OpenCode Worker) is **not** in this sequence.

Track B is not empty history. OC-M0 physically passed the bounded off-tree
transport/isolation spike. OC-M1 physically passed one synthetic bugfix with a
temporary standalone Groq upstream. No OpenCode package, Ashley repository
integration, Model Fabric qualification, production route, or worker
activation exists in this repository.

---

## 4. What Sandbox V2 provides / does not provide

Unchanged: isolation substrate, specialist **operation** seams, state
separation, receipts ≠ truth. Sandbox does not own routing, dispatch,
ContextProjection, or model intelligence.

---

## 5. Future target policy summary (not live)

See Architecture §12.9. Highlights:

- Thought **target:** Groq 120B + NIM 120B same-model failover, reasoning `high`
- Expression **target:** Qwen primary / Mistral fallback (reverses live order)
- Observation / reflection **target:** Nemotron 3 Ultra + Groq 120B,
  `max_supported`
- Utility/bulk **target:** Lightning / GPT-OSS 20B as listed
- OpenCode seat portfolio remains accepted (Spark, Hy3, MiMo, Ultra, Lightning)

None of this is MF-M1 expected current behavior.

---

## 6. MF-M1 smallest closing evidence

Typed seam on current `completeChat` / Attention path such that:

- Thought NIM `openai/gpt-oss-20b` `reasoningEffort: "low"` → Groq same-model
  20B failover eligibility is unchanged
- Expression Mistral→Qwen substitution eligibility is unchanged
- `thought_observation` still configures `utility_bulk` and still dispatches
  `thought`; receipts expose the mismatch
- shared `groq:openai/gpt-oss-20b` bucket is unchanged
- every current caller maps to the exact logical role in Model Fabric
  Architecture §12.2; `utility_bulk` remains a route
- engineering records `logicalRole = engineering` plus
  `SpecialistRequirement(seat = complex_orchestration)` without specialist
  model selection
- each provider attempt has a stage-valid `ModelAttemptReceipt`
- each Fabric invocation has an ordered `ModelInvocationReceipt`
- Expression primary/fallback invocations share an explicit
  `ModelFallbackChain`
- current routes use non-transferable `existing_compatibility` including
  inference-policy fingerprint; no historical qualification is fabricated
- no provider package; no Fabric schema/DB migration; no OpenCode
- no Mint routing change

Explicitly not: cognitive advancement; full Context Budget; execution
authority; OpenCode worker authority; observation-route repair; §12.9 cutover.

---

## 7. Implementation order (local candidate complete; acceptance separate)

The pre-implementation resume gate was satisfied for the candidate recorded
above. The local implementation followed this order:

1. Characterization tests against **live** callers from exact requested start
   `5a05e96e` (not §12.9 targets). The pre-repair planning snapshot was
   `8eedad8`; the MF docs checkpoint was `7a788375`; the live route baseline
   is `e36613b`.
2. Fabric seam + caller `logicalRole` stamps; preserve configured ≠ requested ≠
   dispatched.
3. Falsification; Thought two attempts / one invocation; Expression two
   invocations / one chain.
4. Failed invocation: attach receipt to thrown `AppError` without changing
   error semantics.
5. Settlement tests and local checkpoint at `d918572c`. No push. No Mint.

Next: separate implementation-acceptance review and later milestone
re-evaluation. No production promotion or activation is implied.

---

## 8. Documents to read next

1. [`docs/architecture/Model_Fabric_Architecture.md`](../architecture/Model_Fabric_Architecture.md) — sole current owner; live §11; targets §12.9; MF-M1 §31
2. [`docs/architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`](../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md) — MF-M2–MF-ACT machinery contracts
3. [`MODEL_FABRIC_MF_M1_IMPLEMENTATION_CHECKPOINT.md`](MODEL_FABRIC_MF_M1_IMPLEMENTATION_CHECKPOINT.md) — resume gate
4. [`MODEL_FABRIC_OWNER_DECISION_PACKET.md`](MODEL_FABRIC_OWNER_DECISION_PACKET.md) — 2026-08-25 closed packet
5. [`MODEL_FABRIC_MF_M2_MF_M6_OWNER_DECISION_PACKET.md`](MODEL_FABRIC_MF_M2_MF_M6_OWNER_DECISION_PACKET.md) — Pass-1 questions, now owner-closed
6. [`docs/Routing_Status.md`](../Routing_Status.md) — live route facts only
7. [`docs/architecture/Model_Fabric_01_Contract_Draft.md`](../architecture/Model_Fabric_01_Contract_Draft.md) — frozen fields; F1-obs not MF-M1
8. [`docs/architecture/Ashley_Milestone_Execution_Governance.md`](../architecture/Ashley_Milestone_Execution_Governance.md)
9. [`docs/architecture/Ashley_Cross_Phase_Architecture.md`](../architecture/Ashley_Cross_Phase_Architecture.md)
