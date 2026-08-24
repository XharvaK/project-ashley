# M4 Live Invocation Repair — Structured Thought First Break

**Status:** `M4 CAPABILITY ACCEPTANCE = UNCHANGED`  
**Live smoke ledger:** M2 PASS · M3 PASS · M4 FAIL until a later owner Discord smoke  
**This packet:** live `a24bf39` first break is Thought schema (`contradictory_decision_fields`), not Discord and not M4 execution.

Owner Discord smoke is not fabricated here. Pass requires actual mechanical M4 execution after a valid reactive Thought decision.

---

## Exact SHAs

| Role | SHA |
|---|---|
| Production at incident | `1b30c9c96ff7f05de464b7e88733b9c7c4bc885f` |
| Repair candidate | the git commit that introduces this file revision |

Incident thread: `2d445d64-ca17-4fd7-91e3-9f3578062a16`  
Attention: **1122** Thought completed `invalid_json` at 1000/1000 output tokens (632 visible bytes); **1123** retry `deadline_before_dispatch`; **1124** Expression fallback. Decision 1299 `thought_error=attention_deadline`. No `operationalRequest`. Binder and M4 not reached.

---

## 1. Raw 1122 failure analysis

Thought does not persist raw provider text — only sha256, byte length, and token telemetry.

| Recovered | Value |
|---|---|
| Visible content bytes | 632 |
| Visible sha256 | `2915b6c61bc4f33c982e7fe1eaf342765b5934e37587e8d8841f41c879ce88ac` |
| actual_output_tokens | 1000 |
| actual_input_tokens | 2293 |
| envelope `maxTokens` | `null` (completion object does not echo request max) |
| envelope `truncated` | `false` (bug: detector required echoed `response.maxTokens`) |
| finish_reason | not stored (Groq adapter dropped it) |
| reasoning_content | not stored (adapter reads `message.content` only) |
| reasoning token breakdown | not stored |
| Configured Thought max output | 1000 (route-specific; TPM reserves the entire 1000) |
| Dispatch window | ~5.85s of the 6s reactive Thought budget |
| First-attempt latency | ~2.65s |

**Was `invalid_json` caused by hard truncation of a 1000-token JSON object?**  
No. 632 UTF-8 bytes cannot be a 1000-token serialized decision. Completion usage hitting 1000 while visible JSON is small and unclosed is the gpt-oss pattern: **hidden reasoning is billed as completion tokens**, then `content` is a short incomplete JSON object. `truncated: false` was a telemetry lie because `completeChat` never copies request `maxTokens` onto the completion.

Parser: first `{` to last `}`. No closing `}` → `invalid_json`. No partial `operationalRequest` was admitted.

---

## 2. First-cause classification

**Primary:** `REASONING_LEAKED_INTO_JSON` (reasoning occupied the completion budget; visible JSON was residual and invalid)

Contributing, not primary:

- `JSON_MODE_NOT_ENFORCED` — Groq Thought had no `response_format`
- `PROVIDER_NORMALIZATION_BUG` — finish_reason / reasoning dropped; truncation misclassified
- `RETRY_POLICY_INCOMPATIBLE_WITH_DEADLINE` — after a 1000-token Groq burn, estimated retry (~input + 1000 output) cannot enter 8000 TPM inside the leftover ~3s window → `deadline_before_dispatch`, masking `invalid_json` as `attention_deadline`

Not primary: `OUTPUT_TOKEN_CAP_TOO_LOW`. Raising 1000 would worsen Groq TPM admission. Visible JSON was already small.

---

## 3. Structured Thought repair

Same Thought protocol. Smallest structural correction:

- `reasoningEffort: "none"` for Thought (machine-readable decision, not a reasoning essay)
- Groq `response_format: { type: "json_object" }` for Thought only
- Truncation detection uses **request** `maxTokens` (1000), not echoed response
- Ceiling + unparseable JSON classifies as `truncation`, not a fake operational request
- Prompt: compact JSON only; no chain-of-thought; short objective/reason
- Adapter still uses `message.content` only (gpt-oss `reasoning` / `reasoning_content` never enter the parser)

`THOUGHT_MAX_OUTPUT_TOKENS` remains **1000**. TPM still reserves that full output budget. Do not raise it.

---

## 4. Retry / deadline semantics

Max two attempts remains. Provider failures still never retry.

Structural retry now dispatches only when:

1. remaining deadline ≥ `MIN_THOUGHT_RETRY_REMAINING_MS` (2500ms), and
2. the first attempt did **not** hit the output ceiling under a reactive deadline

A full 1000-token Thought plus another 1000-token reservation cannot repay Groq 8000 TPM inside a 6s owner window. Retry after that burn was theater. Cheap invalid JSON with leftover time still retries once.

Proactive hard-complexity gating and the 60s TPM earliest-dispatch search are unchanged. Owner-initiated reactive Thought stays latency-sensitive.

---

## 5. Projection / binder (downstream, still required)

Pre-Thought: currently resolvable unique workspace + sole allowlisted recipe, without exposing opaque ids. Projection ≠ authority. Resolvable ≠ authorized.

Post-Thought: `resolveVerificationBinding` binds exact workspace (unique newest `lastUsedAt`) and recipe (sole `allowedRecipeIds`). Capability + `verificationAllowed` + recipe admission still authorize execution.

---

## 6. Deadline-plan availability

`candidateVerification.available` is a **deadline/resource-plan** flag: whether the turn budget includes an M4 child/settlement/continuation branch.

It is not an authority grant. `available: true` after G2 does not by itself run M4. Thought must still emit `candidate_verification`; capability, registry, and recipe admission still decide.

---

## 7. Deadline-key bound 40 → 64

Encoder key count on the provisional M3+M4 policy: **42** (24 common/M1/M2 + 14 M3 + 4 M4). M5 authorship would add 4 (46). Cap 40 discarded the envelope → `phase_lifecycle_missing`.

`PHASE_LIFECYCLE_MAX_DEADLINE_KEYS = 64` is a parser ceiling, not a model budget. Thought cannot add keys. Above 64: parse returns null (fail closed).

---

## 8. Local verification

Focused suites PASS: Thought structured output / parser / continuation, attention, proactive gate, capability self-model, verification binding, M4 D/E/F, deadline plan, phase-lifecycle keys, context composer, Honesty finalize, OperationalTruth, Expression fallback, runtime, Groq adapter.

`apps/agent-service` `tsc --noEmit` / build: required green on the candidate.

Windows M5/M7 `tmp_not_canonical` remains unrelated unless this diff touches those surfaces (it does not).

---

## 9–12. Candidate, CI, deploy

Commit this packet with the code. GitHub `test` workflow (`ubuntu-latest`, `npm test`) is the supported Linux offline corpus. Deploy only that SHA via `npm run start:ashley` (Mint `git pull --ff-only` + `deploy/linux-mint/update.sh`). No DB authority change. No registry authority change.

---

## 13. Owner smoke

After clean HEAD/services/health:

```text
M4 FINAL LIVE INVOCATION REPAIR DEPLOYED
READY FOR OWNER DISCORD SMOKE
```

Owner utterance (do not fabricate):

> Verify the current candidate workspace for Project Ashley using the verification capability available to you. Report the mechanical outcome only. Don’t tell me whether the change is good, and don’t modify anything.

Live pass requires: valid Thought → `candidate_verification` → governed bind → M4 admission → mechanical verification → grounded mechanical reply.

---

## Post-98ec359 live smoke failure

**Incident SHA (deployed):** `98ec3598759d0375303a8635d2a3120a06c644b3`  
**Newest turn:** thread `2d445d64-ca17-4fd7-91e3-9f3578062a16`, user mem **337**, assistant mem **338**, inbound Discord `1541355336584134667`, outbound `1541355352891859054`, reservation **146**, decision **1326**, attention Thought **1180** / Expression **1181**.  
Process start `2026-08-24T07:49:11Z`. `accepted_build_identity` on 1180 = `98ec359`. Uptime after deploy was new; artifact matched SHA.

### Stage trace

| Stage | Reached |
|---|---|
| Discord ingress | YES |
| Context / self-model / Thought admission | YES (queued, reserved, dispatched) |
| Provider request | YES |
| Provider completion | **NO** — Groq HTTP 400 in 326ms, no tokens |
| Thought parse / Agency operationalRequest | NO |
| Binding / M4 / Honesty license from execution | NO |
| Expression fallback | YES (`I did not run a verification this turn.`) |

### First causal break

`THOUGHT_PROVIDER_FAILURE`

`reasoning_effort: "none"` is illegal on Groq `openai/gpt-oss-120b` (allowed: `low`/`medium`/`high`). Journal: `[groq] 400`. Same 400 hit proactive Thought **1179** immediately after activate — generic Thought dispatch, not M4-specific selection.

Provider request on 98ec359 **was** constructed with `reasoning_effort=none`, `response_format=json_object`, `max_tokens=1000` (source + Groq 400). There was **no** completion, no JSON, no `candidate_verification` choice.

Previous tests missed this because they stubbed `completeChat` and never sent the Groq body for gpt-oss.

Context budget is not the first break (request died at HTTP 400). Estimated Thought input 5210; M4 keys were present on the reservation deadline envelope (`candidateVerificationChild` etc.).

Binder was **not** reached.

### Repair

- Thought `reasoningEffort: "low"` (minimum legal gpt-oss effort).
- Adapter maps `none` → `low` for `openai/gpt-oss*`.
- Keep `json_object`.
- Parse Groq 400 body text; do not remapping `AppError`.

### Production-equivalent regression

`apps/agent-service/src/core/sandbox/m4-live-composition.e2e.test.ts` starts at the exact smoke utterance, uses real Thought composition (no mocked grounding string), Case A omitted-id `candidate_verification` → binder + execute seam, Case B asserts the composed contract + legal Groq effort mapping. No keyword routing.

M5–M7: same Thought Groq request would 400; the illegal `none` is a **generic Thought provider** defect, not an M4-only affordance gap. Durable-state projection (workspace/recipe/changeset) remains a later selection risk once Thought actually completes.

---

## Post-a24bf39 live smoke failure (decision 1327)

**Incident SHA (deployed, still running at investigation):** `a24bf39667ff7cd300f00a60ad0b27ff7a515b57`  
**Newest owner smoke:** thread `2d445d64-ca17-4fd7-91e3-9f3578062a16`, user mem **339**, assistant mem **340**, inbound Discord `1541368503418888202`, outbound `1541368524369432586`, reservation **147**, decision **1327**, attention Thought **1183** (retry **1184**) / Expression **1185**.  
Process start `2026-08-24T08:41:38+03`. `accepted_build_identity` on 1183/1185 = `a24bf39`. Dist artifact: `reasoningEffort: "low"`, `json_object`, `THOUGHT_MAX_OUTPUT_TOKENS = 1000`.

### Stage trace

| Stage | Reached |
|---|---|
| Discord ingress | YES |
| Context composition | YES (Thought payload is trigger/base/candidates, not Expression clipping) |
| Capability projection | YES (deadline envelope includes M4 child keys; registry `verificationAllowed`) |
| Attention reservation | YES (1183 reserved, dispatched) |
| Provider request | YES |
| Provider response | YES — Groq completed; 2334 prompt / 381 completion tokens; 394 visible bytes; sha256 `f61f11b39f114b1c82471e7d764028f08e8b5f83945553c3b90d27c6727aaf61` |
| Thought parser | YES (`parseOk: true`) |
| Agency decision | YES as **fallback** — `validationOk: false`, `contradictory_decision_fields` |
| operationalRequest | **NO** — invalid proposal discarded; no partial admission |
| Verification binding | **NOT REACHED** |
| Deadline qualification / M4 admission / execution / evidence | **NOT REACHED** |
| Honesty / Expression | YES — fallback sentence `I did not run a verification this turn.` |

Attempt 2 (1184): `deadline_before_dispatch` after 2715 billed tokens; retry estimate 5236+1000 cannot enter Groq 8000 TPM. `thought_error` stored as `attention_deadline` (masking).

### First causal break

`THOUGHT_SCHEMA_FAILURE`

Not truncation (381 << 1000). Not HTTP 400. Raw Groq body was not retained; bounded telemetry now records `decisionKind` / `shouldSpeak` / `completion` / `opKind` / `finishReason` / `reasoningTokens` without raw owner text.

### Live provider request (runtime, not source-only)

| Field | Evidence |
|---|---|
| model | `openai/gpt-oss-120b` (attention 1183 `model_alias`) |
| provider | `groq` |
| max output reserved | 1000 (`estimated_output_tokens`) |
| temperature | 0.15 (running dist `buildThoughtCallOptions`; not copied onto attention row) |
| reasoning_effort | `low` (running dist; journal silent on 200s) |
| response_format | `json_object` (running dist) |
| input tokens | actual 2334; estimate 5184 (overestimate, not a dropped-section clip) |
| TPM | first attempt actual 2715; retry blocked |

Live-provider preflight (Mint, isolated DB, no M4 execute, production registry/workspaces):

- N=1 structured gate: **PASS** in 999ms. `finish_reason=stop`. prompt 1861, completion 207, reasoning 109, visible 410 bytes. Valid JSON selecting `candidate_verification` with omitted-id `workspace.verify` / `project-ashley`.
- N=5 characterization (TPD 429 on two samples): 2× `candidate_verification` + `speak`/`complete`/`shouldSpeak true`; 2× `rate_limited` (daily TPD, not TPM); 1× **exact schema failure** `kind=share`, `shouldSpeak=true`, `completion=hold`, plus `candidate_verification`. Visible 385 bytes — same class as live 394-byte sha256 `f61f11…`.

`low` + 1000 is physically sufficient. Hidden reasoning on successful samples was 63–251 tokens, not a ceiling.

### Repair (this candidate)

- Derive omitted/`"true"`/`"false"` `shouldSpeak` from kind+completion; still reject genuine boolean contradictions.
- When `operationalRequest` is present, `completion: "hold"` normalizes to `complete` (hold is a terminal non-act; an operational request is this-turn work).
- Do not structurally retry `contradictory_decision_fields` (TPM theater after a completed Groq call).
- Persist bounded decision-field telemetry + Groq `finish_reason` / `reasoning_tokens`.
- Live-provider preflight: `npx tsx src/core/agency/thought-live-provider-preflight.ts --live` (optional `--samples 5`). No production DB writes. No M4 execute.

Gates stay split: DETERMINISTIC COMPOSITION E2E · LIVE PROVIDER STRUCTURED-THOUGHT PREFLIGHT · LIVE DISCORD M4 SMOKE.

M5–M7 share the same Thought structured-output → `operationalRequest` seam. Authorship/operation/export contracts are in the same system prompt when those registry flags are true (production `project-roots.json` has them). Provider/schema reliability here is a shared prerequisite; do not treat an M4 Discord miss as M4-only.

Workspace at investigation: 7 Project Ashley workspaces; unique newest `ZZZvUs-K1s43xWw4psdMOw` at `2026-08-23T20:47:01.875Z`; sole recipe `typescript_fixture_compile_v1`. Binder not reached on this turn.

