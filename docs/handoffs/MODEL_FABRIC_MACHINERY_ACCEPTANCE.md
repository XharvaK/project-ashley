# Model Fabric Machinery — Candidate Acceptance Record

**Status:** `CANDIDATE_ACCEPTED / PROMOTION_READY` — Machinery Only.
**Not:** `QUALIFIED`, `OWNER_APPROVED`, `ACTIVATION_APPROVED`, or `PRODUCTION_ROUTED`.

**Date:** 2026-08-25

**Accepted Candidate SHA:** `9f4fbee8710f7e08f6b83370c62a571cafe58a78`

**Independent Implementation Review:** `ACCEPT`

---

## 1. Scope of Acceptance

This acceptance covers **Model Fabric machinery only**:
- **SLICE 0:** MF-M1 R1/R2 receipt-truth repairs and Mistral retry strategy pin (`none`).
- **MF-M2:** Unified CURRENT portfolio snapshot (`current-compatibility.v1.json`), hashed registry resolution, and router authority cutover.
- **MF-M3:** Independence group, specialist seat, and quota coupling catalog records; model lifecycle state machine; qualification result binding validation.
- **MF-M4:** Dark OpenCode Zen Track A HTTP utility adapter (`opencode_zen_http`) with strict fail-closed guards.
- **MF-M5:** Approved-chain health walker and predicate separation (`configured`, `available`, `ready`, `qualified`, `owner_approved`, `active`, `degraded`).
- **MF-M6:** Specialist seat resolution against target candidate rows and execution witness verification (`SpecialistRequirement` != `SpecialistSession`).
- **MF-ACT:** Owner-gated activation/rollback mechanics, atomic `active.json` pointer replacement, and coupling preflight checks.

---

## 2. Explicit Exclusions and Governing Laws

```text
CURRENT ROUTING
  != TARGET POLICY
  != IMPLEMENTED SUPPORT
  != QUALIFIED
  != OWNER APPROVED
  != ACTIVATION APPROVED
  != PRODUCTION ROUTED
```

The following remain explicitly excluded and unperformed:
- **No target route is qualified:** Evaluation qualification campaigns for GPT-OSS 120B, Ultra, Super, Lightning, Qwen-primary, or Zen are not run or accepted by this record.
- **No target route is activated:** No §12.9 policy row is active or routable.
- **No production `OwnerApprovalRef` created:** Fabric machinery cannot and does not mint owner approvals.
- **No production `ActivationRef` created:** Machinery does not create activation records.
- **Production dispatch remains CURRENT compatibility:** Thought interactive remains 20B NIM -> Groq failover; Thought durable/proactive remains 20B; Expression remains Mistral primary -> Qwen fallback; Zen and routine_validation remain dark.

---

## 3. Pre-Promotion Verification Summary

- **Focused Regression Pack:** 13 test files, 127 tests passed, 0 failures.
- **Typecheck & Build:** `apps/agent-service` `npm run build` PASS (clean `tsc`).
- **Git Diff & Whitespace:** `git diff --check` PASS (clean).
- **Independent Architecture Review:** `MODEL FABRIC FINAL INDEPENDENT REVIEW = ACCEPT`.
