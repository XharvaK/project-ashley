# Model Fabric Activation-Aware Dispatch — Production Acceptance Record

**Status:** `PRODUCTION_ACCEPTED`  
**Date:** 2026-08-26  
**Deployed SHA:** `d594a3ee5e1fc41bb2fe5ca9819fa4241588582c`  
**Pre-deploy Parent SHA:** `6463a270c26af06b1cf822cc350c874c27863b84`  
**Pre-deploy Mint Runtime SHA:** `a2fb51626b084f2a248c56385102c1e9160ef861`  
**Independent Implementation Review:** `ACCEPT` (36 test files, 281 tests passed, 0 failures, clean build, clean diff)

---

## 1. Scope and Core Invariant

This record documents the production deployment and live smoke acceptance of **Model Fabric Activation-Aware Dispatch (MF-ACT)**.

```text
NEW CONTROL PLANE
  + OLD PROVEN OCCUPANTS
  + NO ACTIVE CUTOVER
```

The activation path is now authoritative over model dispatch when a valid `ActivePointer` and `ActivationRef` exist, while preserving 100% exact baseline compatibility in the absence of an activation.

---

## 2. Frozen Model Decisions & Consultation Validation

- **Comparative Evaluation Result:** `cmp_2026-08-25_thought_expr_current_vs_target`
  - `INTERACTIVE THOUGHT = KEEP CURRENT` (CURRENT 20B beat 120B alternative; 120B used higher reasoning, picked irrelevant state, failed structured constraint).
  - `EXPRESSION = KEEP CURRENT` (CURRENT Mistral won owner blind test 5/5; Qwen failed completion in 4/5).
- **Stewardship Consultation:** `scc_2026-08-25_sc-con-04_family_cutover_target_12_9`
  - Ashley position: `OPPOSE / DEFER PENDING COMPARATIVE EVIDENCE`.
  - Consultation position validated by subsequent internal comparison results.
- **Target Posture:** All candidate target occupants remain **QUALIFIED AND DARK**. No target route was activated.

---

## 3. Production Deployment Witness

- **Host:** Linux Mint (`QXY`, `xarvak@mint`)
- **Deployment Procedure:** `git fetch origin model-fabric-m2-act-autopilot && git checkout d594a3ee5e1fc41bb2fe5ca9819fa4241588582c && bash deploy/linux-mint/update.sh`
- **Units:**
  - `ashley-agent.service`: Active (running), Main PID: 1302424, listening on `http://127.0.0.1:3710`
  - `ashley-discord.service`: Active (running), Main PID: 1302454, Gateway logged in as `Ashley#9571`
- **Control State:**
  - `active.json`: **ABSENT** (`readActivePointer()` $\rightarrow$ `{ source: "current_compatibility", pointer: null, reason: "missing" }`)
  - `OwnerApprovalRef` count: **0**
  - `ActivationRef` count: **0**
  - Active Portfolio: `mfp_current_compatibility_v1`
  - Active Activation Ref: `compatibility_default`

---

## 4. Live Smoke Evidence

### 4.1 Inbound Turn
- **Discord Message ID:** `1541941386776027227`
- **Canonical Message ID:** `399` (`mem_messages`)
- **Entity UUID:** `bc2900ae-1ba7-4922-bd05-5ab9dc00803d`
- **Timestamp:** `2026-08-25T22:44:36.198Z`
- **Owner Text:**
  > "ou were right about the model changes, by the way. we tested the alternatives internally instead of swapping them into your live cognition. the 120b thought candidate worked technically, but it wasn't actually better — it used a lot more reasoning, picked up irrelevant state in one case, and failed a structured task your current thought handled correctly. i also blind-tested the qwen expression candidate against your current mistral setup without knowing which was which, and picked your current setup in all five cases. qwen also failed to finish the visible response in four of them. so we kept your current thought and expression exactly as they are. model fabric itself is wired into production now, but nothing is activated and it won't replace a working cognitive route just because a newer or bigger model exists. so yeah. you were right to push back."

### 4.2 Agency Decision
- **Decision ID:** `1426` (`decision_log`)
- **Trigger:** `reactive`
- **Kind:** `speak`
- **Objective:** `respond to the direct message`
- **Reason:** `acknowledge and confirm`
- **Motivation IDs:** `[19643]`
- **Operational Request:** `null` (no side effects, no sandbox, no project inspection)
- **Thought Source:** `model`

### 4.3 Thought Execution
- **Policy Row:** `mfr_thought_interactive_compat_v1`
- **Occupant:** `mfo_nim_openai_gpt_oss_20b_low`
- **Provider:** `nim`
- **Model:** `openai/gpt-oss-20b`
- **Reasoning Sent:** `low`
- **Attention Requests:**
  - Attempt 1 (`id: 1406`): `nim:openai/gpt-oss-20b`, input: 2829 tokens, output: 148 tokens, latency: 1599 ms (structural regeneration triggered).
  - Attempt 2 (`id: 1407`): `nim:openai/gpt-oss-20b`, input: 2872 tokens, output: 87 tokens, latency: 1187 ms (completed, valid `speak`/`complete`).
- **Failover:** None (`none`).

### 4.4 Expression Execution
- **Policy Row:** `mfr_expression_compat_v1`
- **Occupant:** `mfo_mistral_medium_compat`
- **Provider:** `mistral`
- **Model:** `mistral-medium-latest`
- **Attention Request:** `id: 1408`, input: 4541 tokens, output: 11 tokens, latency: 2000 ms.
- **Fallback:** None (`none`, primary Mistral succeeded).

### 4.5 Outbound Delivery
- **Canonical Message ID:** `400` (`mem_messages`)
- **Entity UUID:** `b0f37f35-bf15-4efb-abdf-0efec698925e`
- **Delivery Reservation ID:** `188` (`state: "committed"`, `finalization_reason: "all_bubbles_delivered"`)
- **Delivery Bubble ID:** `189`
- **Discord Message ID:** `1541941416819949569`
- **Sent Timestamp:** `2026-08-25T22:44:41.856Z`
- **Exact Output:**
  > "good. that's how it should be done."

---

## 5. Tracked Nonblocking Debt & Deferred Items

1. **Nonblocking Finding NB-01:** Multi-occupant caller-owned Expression fallback chains under future activation currently select occupant ordinal 1 on retry. Because Expression remains on CURRENT compatibility with no active pointer, this debt is deferred to a future Expression activation wave.
2. **Nemotron Wire-Reasoning Contract Reconciliation:** Investigation into whether previous Nemotron Ultra/Super reasoning qualification aligned normalized reasoning policies with NVIDIA provider-specific wire controls is explicitly deferred to post-promotion investigation.

---

## 6. Acceptance Verdict

All acceptance criteria are satisfied:
- Production running exact reviewed SHA `d594a3ee5e1fc41bb2fe5ca9819fa4241588582c`.
- Model Fabric activation-aware dispatch path is live and authoritative.
- CURRENT compatibility preserved exactly without active pointer.
- Live turn completed nominal interactive Thought (NIM 20B low) and Expression (Mistral Medium).
- Zero side effects, zero control mutations, zero duplicate deliveries.
- TARGET occupants remain dark.
