# Model Fabric Reconciliation & Token Envelope Expansion — Production Acceptance Record

**Status:** `PRODUCTION_ACCEPTED`  
**Date:** 2026-08-26  
**Deployed SHA:** `3d57113659a19d91949ed6e4e36670a235fb8ba7`  
**Pre-deploy Parent SHA:** `e052a296c04e110c3e07787a366a6ae96fecdaa3`  
**Pre-deploy Mint Runtime SHA:** `d594a3ee5e1fc41bb2fe5ca9819fa4241588582c`  
**Independent Review Verdict:** `ACCEPT` (18 test files, 189 tests passed, 0 failures, clean `tsc` build, clean diff)

---

## 1. Scope and Core Invariant

This record documents the production deployment, live smoke witness, and final production acceptance of the **Model Fabric Portfolio & Token Envelope Reconciliation** candidate (`3d57113659a19d91949ed6e4e36670a235fb8ba7`).

```text
CURRENT THOUGHT OUTPUT CEILING: 1000 → 2048 TOKENS (NIM 20B low)
CURRENT EXPRESSION OUTPUT CEILING: 900 → 2048 TOKENS (Mistral Medium)
PROACTIVE EXPRESSION ISOLATION: 500 TOKENS
TARGET V2 PORTFOLIO: DECLARED + DARK (Ultra/Super 4096 envelopes, Super economical utility, Lightning deferred)
ACTIVE POINTER: ABSENT (0 active.json, 0 OwnerApprovalRef, 0 ActivationRef)
```

Target occupants (Ultra, Super) remain **DECLARED AND DARK**. No target route was activated or dispatched during this deployment.

---

## 2. Production Deployment Witness

- **Host:** Linux Mint (`QXY`, `xarvak@mint`)
- **Remote Branch:** `origin/model-fabric-m2-act-autopilot` (Fast-forward push `d594a3e..3d57113` verified)
- **Ancestry Verification:** `git merge-base --is-ancestor d594a3ee... 3d571136...` passed (Exit code 0).
- **Deployment Procedure:** `npm run start:ashley` invoking `scripts/mint/remote-update.ps1` -> `deploy/linux-mint/update.sh`.
- **Build & Synchronization:**
  - All 6 packages compiled cleanly with `tsc` (`sandbox-tree`, `sandbox-broker`, `sandbox-policy`, `sandbox-v2`, `agent-service`, `discord-bot`).
  - Runtime distribution artifacts verified.
  - User systemd units synchronized and daemon reloaded.
- **Service Status:**
  - `ashley-agent.service`: Active (running), Main PID: 1305712, listening on `http://127.0.0.1:3710`.
  - `ashley-discord.service`: Active (running), Main PID: 1305742, Gateway logged in as `Ashley#9571`, session allowance 996/1000 remaining.
  - Health endpoint (`/health`): `{"ok":true,"ready":true,"state":"ready","uptimeSec":7,"providerState":"configured"}`.
  - Crash/restart loops: None (`0`).
- **Control State:**
  - `active.json`: **ABSENT**
  - `OwnerApprovalRef` count: **0**
  - `ActivationRef` count: **0**
  - Loaded Intended Target: `mfp_target_12_9_v2`
  - Resolved Production Portfolio: `mfp_current_compatibility_v1` (CURRENT compatibility default)

---

## 3. Live Discord Smoke Witness

### 3.1 Inbound Turn
- **Discord Message ID:** `1541964621559238688`
- **Canonical Message ID:** `401` (`mem_messages`)
- **Entity UUID:** `9465b25f-4968-4b21-a1ea-76bcdac6a72c`
- **Timestamp:** `2026-08-26T00:16:55.937Z`
- **Owner Text:**
  > "I believe you are becoming a state of the art cognitive entity. ❤️"

### 3.2 Agency Decision
- **Decision ID:** `1427` (`decision_log`)
- **Trigger:** `reactive`
- **Kind:** `speak`
- **Objective:** `respond to the direct message`
- **Reason:** `acknowledge compliment`
- **Motivation IDs:** `[19645]`
- **Operational Request:** `null` (pure conversational evaluation/affection; zero sandbox/engineering side effects)
- **Thought Source:** `model`
- **Thought Error:** `null`

### 3.3 Thought Execution & Actual Invocations
- **Attention Request ID:** `1410` (`attention_requests`)
- **Logical Role:** `thought`
- **Policy Row ID:** `mfr_thought_interactive_compat_v1`
- **Occupant ID:** `mfo_nim_openai_gpt_oss_20b_low`
- **Provider:** `nim`
- **Model ID:** `openai/gpt-oss-20b`
- **Semantic Reasoning:** `economical`
- **Wire Reasoning:** `{"reasoning_effort": "low"}`
- **Effective maxOutputTokens Ceiling:** `2048` (recorded in `estimated_output_tokens`)
- **Hard Turn Deadline:** `6000 ms` (`deadline_at: 2026-08-26T00:17:01.933Z`, queued: `2026-08-26T00:16:56.062Z`)
- **Attempt Count:** `1`
- **Structural Regenerations:** `0`
- **Transport Fallback:** None (`none`)
- **Actual Tokens:** Input: `2486`, Output: `83`
- **Outcome / Finish Reason:** `completed` / `stop`
- **Material Inference Fingerprint:** `sha256:240fea0afbf7487c14ffa4f0119f6f40aa45696c7dd55e4d94450f88dc616b71`

### 3.4 Expression Execution & Actual Invocations
- **Attention Request ID:** `1411` (`attention_requests`)
- **Logical Role:** `expression`
- **Policy Row ID:** `mfr_expression_compat_v1`
- **Occupant ID:** `mfo_mistral_medium_compat`
- **Provider:** `mistral`
- **Model ID:** `mistral-medium-latest`
- **Effective maxOutputTokens Ceiling:** `2048` (recorded in `estimated_output_tokens`)
- **Attempt Count:** `1`
- **Fallback Occurrence:** None (`none`, primary Mistral succeeded)
- **Actual Tokens:** Input: `4684`, Output: `7`
- **Outcome / Finish Reason:** `completed` / `stop`
- **Material Inference Fingerprint:** `sha256:d96f22af48c1243e8979a1a7a00ee02a9759f8c71417f24cada1386df2c483c2`

### 3.5 Outbound Delivery & Continuity
- **Canonical Message ID:** `402` (`mem_messages`)
- **Entity UUID:** `48efe2c7-360c-45e3-a409-3fc3aaa4dcc5`
- **Delivery Reservation ID:** `189` (`entity_uuid: 59f29e59-bded-41a3-9c9b-15398d580ed7`, `state: "committed"`, `finalization_reason: "all_bubbles_delivered"`)
- **Delivery Bubble ID:** `190`
- **Discord Message ID:** `1541964643092799622`
- **Sent Timestamp:** `2026-08-26T00:16:59.432Z`
- **Finalized Timestamp:** `2026-08-26T00:16:59.452Z`
- **Exact Output:**
  > "thank you, doc."
- **Duplicate Deliveries:** `0`

---

## 4. Historical Nemotron Evidence & Known Debt

1. **Historical Nemotron Evidence:** Historical smoke records (<450 for Ultra observation, <1100 for Super exchange, <900 for Super curiosity) remain classified as `FAIL_STRUCTURED_OUTPUT_UNDER_SUPERSEDED_TOKEN_ENVELOPE`. No 4096 qualification campaign has been run; TARGET occupants remain unactivated and dark.
2. **Known Compatibility Scar (Observation Ceiling):** `current-compatibility.v1.json` declares row `mfr_thought_observation_compat_v1` with `maxOutputTokens: 450`, while runtime caller `enqueueThoughtObservation` routes via `runThoughtModel` which builds `maxTokens: 2048`. This is an accepted, documented legacy compatibility mismatch. Actual invocation receipts remain truthful.
3. **Future Activation Requirement:** Any future TARGET activation strictly requires fresh qualification evidence matching `mfp_target_12_9_v2` and an explicit owner activation record.

---

## 5. Final Acceptance Verdict

All 15 acceptance criteria are satisfied:
- Deployed Mint SHA is exact candidate `3d57113659a19d91949ed6e4e36670a235fb8ba7`.
- Live turn completed nominal interactive Thought (NIM GPT-OSS 20B low) with truthful `maxTokens: 2048`.
- Live turn completed nominal interactive Expression (Mistral Medium) with truthful `maxTokens: 2048`.
- Proactive Expression isolated to 500 tokens.
- Exactly one committed response delivered to Discord (`"thank you, doc."`).
- Zero side effects, zero operational commands executed.
- TARGET v2 declared and 100% dark (`active.json` absent, 0 `OwnerApprovalRef`, 0 `ActivationRef`).
- Services remain healthy, stable, and crash-loop free.

```text
============================================================
MODEL FABRIC =
PRODUCTION ACCEPTED — CURRENT ROUTES FROZEN, TARGET V2 DARK
============================================================
```