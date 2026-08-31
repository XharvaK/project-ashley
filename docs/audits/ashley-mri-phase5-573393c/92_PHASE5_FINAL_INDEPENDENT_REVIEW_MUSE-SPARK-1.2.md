# 92 — Phase 5 Final Independent Review — muse-spark-1.2

Reviewer: muse-spark-1.2 (independent, did not author MRI / Phase 5 / OSS reconciliation)
Date: 2026-08-31
Reference SHA: `573393c3fdb2392a45137d4625635658eb4b5d88`
Review mode: read-only source inspection + documentation audit
Source root: `C:\Users\Xharv\Projects\composer-assistant-audit-573393c`

---

# 1. Executive verdict

```text
REFERENCE_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
FINAL_REVIEW=ACCEPT_WITH_PATCHES
PHASE4_REOPEN_REQUIRED=no
PHASE5_REOPEN_REQUIRED=no
IMPLEMENTATION_READY=yes
BLOCKERS=0
HIGH_FINDINGS=1
MEDIUM_FINDINGS=3
LOW_FINDINGS=3
ARCHITECTURE_DRIFT_FOUND=no
SOURCE_PLAN_CONTRADICTIONS=0
CROSS_WAVE_CONTRADICTIONS=0
C4_ORACLE_BOUNDARY=PASS
W8_READ_ONLY=PASS
W9_BLOCKED=PASS
LUNA_CAN_IMPLEMENT_WITHOUT_ARCHITECTURE_INVENTION=yes
```

**Summary:** The hardened Phase 5 packet (77–91) faithfully and mechanically compiles frozen Phase 4 architecture (55–75) into an implementation-ready plan at reference SHA `573393c`. No architecture drift, no wave-order change, no new runtime dependency, no W9 plan, no contradiction requiring Phase 4 reopen. All seven OSS deltas C1–C7 are correctly integrated per 91 without violating frozen invariants. Source-grounding claims were verified against exact source (`NUCLEAR_SUPPORTED_VERSION=42`, sidecar v1, `MISTRAL_RETRY_CONFIG=strategy none`, single-fetch adapters, no JSON Schema validator dependency). The packet is implementation-ready after 4 documentation-level patches (no architecture change).

The `ACCEPT_WITH_PATCHES` (not `ACCEPT`) is driven by one HIGH finding and three MEDIUM findings that must be corrected before Luna starts — all are mechanical-documentation fixes, not design rework:

- **FINAL-001 (HIGH):** 79/80 lack an explicit migration-number collision guard naming 42 → 43 as the next nuclear version (source proves 42 is the next free slot today, but 79 mentions "v43" without the baseline-origin sentence present in 90, creating a future drift risk).
- **FINAL-002 (MEDIUM):** One stale `Attention` symbol name (`AcceptedDispatchIdentity`) in 79 §G survives alongside the planned rename — requires a rename-ledger line.
- **FINAL-003 (MEDIUM):** C4 oracle `fail-closed on unsupported keyword` is correctly frozen in 81/91/89 but the exact closed-keyword list for the successor schema is not enumerated in one place — requires a one-paragraph enumeration.
- **FINAL-004 (MEDIUM):** 88 file-collision matrix lists `mistral-client.ts` touching W0–W2,W6,W7 but omits its W1 role in wire-evidence capture (minor editorial omission; no ownership conflict).

**Central question preview:** YES — Luna can implement W0→W8 from this packet without inventing architecture, weakening Phase 4, or relying on undocumented assumptions (after the 4 patches below, each < 10 lines).

---

# 2. Phase 4 → Phase 5 traceability verdict

| Frozen contract | Architecture rule (55/58/59/61/72) | Phase 5 owner | Exact artifact:section | Source symbols / tables verified at `573393c` | Test / failure proof | Verdict |
|---|---|---|---|---|---|---|
| **A. Thought sole semantic author** G1,G4 | Thought chooses `settlement\|observation_intent\|effect_intent\|abstain`; kernel never infers branch; receivers never author meaning (55:80, 57:5-11, 58:3-12, 72:G1-G3) | W0 | 79:C, H, J(`parseThoughtStepOutput`), 77:G1-G6 | `thought/output-contract.ts: THOUGHT_OUTPUT_SCHEMA` (5-form legacy at SHA — replaced by 79 closed 4-branch), `thought/parse.ts`, `types.ts: ThoughtStepOutput` | `thought/semantic-output-contract.test.ts` (new), `parse.test.ts` rewrite; failure injection: inferred branch → `thought_schema_violation` | **PASS** |
| **B. Sole publication path** G2 | Settlement is sole semantic publisher; Authority evaluates; kernel binds but does not author (55:86, 61:157-174, 72:G2) | W4 | 83:J(`publishSemanticTransaction`), 79:L.6 | `settlement/publish.ts`, `settlement/validate.ts`, sidecar `settlements`, `causal_ledger` | `authority-publication-race.test.ts`, `settlement/publish.test.ts`, direct-writer inventory test §S | **PASS** |
| **C. Authority is governance** | Authority evaluates complete packs, presents objections, decides resolution; never synthesizes branch (61:125-145, 72:G6) | W0/W4 | 79:J(`checkAuthority`), 83:J(`checkAuthority`), 83:G | `authority/check.ts: checkAuthority`, `loadAuthorityPacks`, `MAX_AUTHORITY_REVISIONS` | `authority/check.test.ts`, `authority/packs.test.ts`, invariant: `revisionCount` kernel-computed | **PASS** |
| **D. Operational truth ≠ Settlement** | Receipt/reconciliation own effect completion; settlement publishes claim, not physical event (55:67, 72:G4 impl) | W0/W5/W6 | 79:J(`bindEffectIntent`), 84:J, 85:J, 77:G20 | `thought/run.ts`, `effect/*`, `in_flight_effects`/`effect_receipts` | `operation-binding.test.ts`, reconcilication tests; matrix `outcome_unknown → no replay` | **PASS** |
| **E. Kernel mechanics ≠ model meaning** 72:G3,57 full matrix | IDs/cycle/generation/pass/deadline/replay/idempotency/receipt are kernel facts (57:48-66, 60) | W0 | 79:H `KernelEnvelope`, 77:G8-G13, 60 | `cognitive-v021/types.ts` line 15+: `ORDINARY_THOUGHT_BUDGET_MS`, `thought/parse.ts: FORBIDDEN_KEYS`, `THOUGHT_FORBIDDEN_OUTPUT_FIELDS` | `kernel-envelope.test.ts`, forbidden-field fixtures §S | **PASS** |
| **F. One wake → one chain** 72:G5,65 | Deterministic occurrence, one wake/cycle, at most one consequence; atomic maturity; lease/preemption; no duplicate lives (55:86) | W5 | 84:I-J-K-L | `future_triggers`, `inbox_events`, `cycle_records`, `sidecar/schema.ts v1→v3` — verified `COGNITIVE_SIDECAR_SCHEMA_VERSION=1` at SHA, baseline supports v3 plan | `wake/identity.test.ts`, `ledger.test.ts`, `consequence.test.ts`, `recovery.test.ts`, failure matrix §T | **PASS** |
| **G. Intent ≠ completion** G: effect intent vs receipt truth (58:252-258, 72:21-25) | `effect_intent` proposes; kernel generates durable ID; receipt owns completion | W0 | 79:J(`bindEffectIntent`), 77:G19-G20 | `settlement/publish.ts` receipt checks, `effect/*` | operation-binding, `effect/recovery.test.ts` | **PASS** |
| **H. Raw evidence outranks derived** 64,70 | Superseded lexical material immediately ineligible; physical stale rows may remain (72:G7-G8, 55:118) | W4 | 83:J (`searchMemoryFts` eligibility), 70 | `retrieval/derived-store.ts` (`DERIVED_INDEX_SCHEMA_VERSION=1`, `computeMemorySourceHash`), `retrieval/fts.ts`, `retrieval/discover.ts` — current path has NO eligibility fence (plan adds it) | `derived-retraction.test.ts`, physical-stale-row fixtures, exact-only degraded tests §S/T | **PASS** |
| **I. Model occupant ≠ Ashley** 72:G9-G10,66 | Occupant change cannot silently overwrite identity; `occupantBinding` is kernel fact; qualification per occupant (57:64) | W1/W2 | 80:H (`occupantId` in `ThoughtCapabilityComponents`), 81:C | `model-routing/registry.ts`, `mistral-client.ts`, `model-fabric/catalog.ts` | `capability-identity.test.ts` occupant-mismatch, `W2` no-fallback harness | **PASS** |
| **Kernel Envelope closed** 59,60,61,62 | Capture by value, deadlines, alias scope, no tolerant repair, fresh invocation per attempt (59:35-65, 61:68-94) | W0 | 79:H,I,J,K,L,M,N,O | `attention/types.ts`, `attention/ledger.ts`, `mistral-client.ts`, `model-routing/types.ts` | `publication-fence.integration.test.ts`, `reference-allowlist.test.ts`, migration-43 tests | **PASS** |
| **Invocation / currentness** 59:36-104, 60:58-65 | One durable attempt truth; double fence; reconstruction prohibited (59:66-104) | W0/W4 | 79:I-J-K-L, 83:J | `attention_requests` table (+ W0 migration 43 plan), `attention/governor.ts` | Fence-before-parsing + in-transaction fence proofs §T | **PASS** |
| **Resource policy** 55:92-105, 72:G15 | `30000/4096/4096/2048`, 2 corrections/pass, one absolute wall clock, no hidden reset (55:102, 59:108-118) | W0/W1/W2 | 77:Frozen policy, 79:C,F, 80:H, 81:C | `types.ts: ORDINARY_THOUGHT_BUDGET_MS = 10_000` at SHA → plan upgrades to 30s via `types.ts` edit (verified), `runThoughtModel` deadline carry | Structural-retry deadline-sharing tests, `STALE_RESPONSE` fence, `deadline_exhausted` outcome | **PASS** — note v0.2.1 `6000` is a separate implementation-spec packet, not the MRI freeze; 77 correctly freezes 30000 |
| **Wave contracts W0→W8** 74 | All waves `yes` for source/plan, W9 `no` (74:9-20, 75:18) | 77-88 | 88: matrix + migration order 43/44/v2-v5 | `db.ts: OBSERVED_NUCLEAR_BASELINE_VERSION=41`, `NUCLEAR_SUPPORTED_VERSION=42`, `sidecar/schema.ts: COGNITIVE_SIDECAR_SCHEMA_VERSION=1` | Per-wave §S/U tests; 88 version-collision stop condition | **PASS** |

**Overall Phase 4→5 compilation verdict:** PASS. Every frozen law has an exact mechanical owner, symbol/table mapping, and named falsification test. No law is weakened or left without an implementation hook.

---

# 3. Hardened C1–C7 audit

### C1 — ACCEPT — W0 strict coercion negative suite — **PASS**

*Claim:* 91 adds BAML-class coercion fixtures; 79 §S now enumerates string→number/boolean, loose enum/case, singleton→array, missing→null/default, malformed nested→null/default, empty/minimal, ambiguous/additional/forbidden fields with no repair path.

*Evidence:* 79 §S line: "`thought/semantic-output-contract.test.ts`: all four branches; unknown fields; mechanical fields; registered operation schemas; empty/minimal objects; strict rejection of string-to-number/boolean, loose enum/case, singleton-to-array, missing-to-null/default, malformed-nested-to-null/default, and ambiguous/additional forbidden fields. No case may be repaired or defaulted." 77 G14 restates the invariant. 89 W0 repeats it verbatim. At SHA, `thought/parse.ts` contains `stringValue`/`numberValue` helpers (coercion surface) and `THOUGHT_FORBIDDEN_OUTPUT_FIELDS` exists but does not yet enforce strict four-branch rejection — plan correctly targets this.

*Propagation check:* 79 (owner), 89 (bible W0), 90 (hardened synthesis G32 context) all reflect. No architecture drift. **PASS.**

### C2 — MODIFY — Structural validity ≠ semantic validity — **PASS**

*Claim:* 91 modifies to keep semantic-wrong fixtures on Thought-owned fields only; kernel mechanics become forbidden-field fixtures, not semantic-wrong fixtures.

*Evidence:* 79 §S paragraph: "The semantic-validity adversarial set uses only Thought-owned fields from Phase 4 artifact 58... Kernel-owned `authorityEpoch`, durable operation/request IDs, `triggerRef`, cycle, generation, or route facts are separate forbidden-field fixtures, never semantic-wrong fixtures." 81 §S repeats for W2: "Kernel-owned cycle/generation/epoch/IDs/trigger fields remain forbidden-field cases, not semantic-wrong fixtures." This preserves 57 field-ownership matrix exactly.

*Propagation check:* 79, 81, 89 W0/W2, 90 all updated. No kernel field appears as a semantic-wrong fixture. **PASS.**

### C3 — ACCEPT — Logical binding ≠ emitted wire enforcement — **PASS**

*Claim:* Separate evidence for `logicalBindingId` / `wireBindingId` / `providerDeclaredEnforcement` (explicit `unavailable` when not exposed).

*Evidence:* 80 §C freezes: "Logical request evidence and emitted wire evidence MUST both exist..." §H adds `providerDeclaredEnforcement: string | "unavailable"`; §S `Qualification-negative: logical request claims stronger enforcement than emitted...` §T failure injection includes `"Wire-binding mismatch"` and `"schema_enforcement_evidence_mismatch"`. 81 does not need to redesign adapters — it observes via W1 evidence. 77 G26,G40 restate. At SHA, `nim-adapter.ts`/`buildNimRequestBody()` can emit `nim_guided_json` vs `nim_response_format_json_schema` but has no provider-returned grammar-engine metadata — plan correctly stays `unavailable`.

*Propagation check:* 80 (owner), 81 (consumer), 89 W1, 90. **PASS.**

### C4 — MODIFY — Independent raw conformance / strict-parser value — **PASS** *(hostile review — see below)*

*Claim:* Qualification-only deterministic raw-schema oracle derived from exact exported W0 schema; closed-schema, fail-closed on unsupported keywords, tied to schema identity/drift; not a second parser/repair/inference layer. Plus `PROVIDER_ACCEPTED_PARSER_REJECTED` negative witness. Distinct `JSON syntax | closed-schema | strict parse | semantic validity`.

*Hostile checks:*

1. **Mechanical not semantic?** 81 §J: "Before calling W0 parser, harness validates raw response against exact exported W0 successor schema through qualification-only deterministic oracle... If no suitable existing deterministic validator exists, implement only the schema-keyword subset emitted by closed W0 schema, derive it from exported schema, fail closed on unsupported keyword, keep it outside runtime parsing. Do not add Promptfoo, BAML, tolerant repair, or new runtime dependency. Drift tests mutate W0 schema and require oracle/harness identity to change or fail." — outside runtime parsing, so cannot become second repair layer. ✓
2. **Closed-schema?** Oracle supports only emitted keyword subset, fails closed otherwise. ✓
3. **Tied to W0 identity?** 81 §J drift test requirement + 77 G39. ✓
4. **No branch inference/defaulting?** Explicit "fail closed", "no tolerant repair". ✓
5. **Not second schema authority?** Derived from exported W0 schema, not independent; if W0 changes, oracle must change or fail. ✓
6. **Separate evidence dimensions?** 81 §T row: "Raw JSON is syntactically valid but fails exact closed schema — NOT_QUALIFIED; schema and parser evidence retained separately" + §H/N `ProviderAcceptedParserRejected` fixture. ✓
7. **Needs `fail-closed on unsupported keywords`:** 81 enumerates it explicitly. ✓
8. **No new runtime dependency:** At SHA verified `package.json` has no `ajv`/`json-schema`/`baml`/`promptfoo` — plan correctly does not add one; oracle lives in harness only. ✓

*Propagation:* 81 (owner), 91 (disposition), 89 W2 (requires witness), 77 G39 (invariant), 80 §I confirms no new W1 dependency. Cleanest hardened delta in the packet. **PASS.**

### C5 — MODIFY — W4 concurrency / stale-derived hardening — **PASS**

*Claim:* Reject prescribed cache key `snapshotHash+authorityEpoch+generation+TTL`; keep correctness on existing `barrier + journal + eligibility + generation + publication fence`; add explicit concurrency tests.

*Evidence:* 83 §T final paragraph (quoted verbatim): "No new `snapshotHash + authorityEpoch + generation + TTL` cache identity is frozen. The reference-source `ProjectionCache` is in-memory, cycle-local... It is not derived retrieval authority. W4 correctness comes from durable invalidation journal, scope/generation/source-fingerprint checks, canonical read-time eligibility before and after FTS materialization, atomic generation activation, and publication second fence. Any cache remains subordinate... MAY be discarded; a cache-specific mechanism is added only if Luna proves a concrete current-source bypass after implementing these required gates." At SHA, `projection-allocator/cache.ts` is a `Map<string,T>` with cycle-local keys — plan correctly classifies it.

New tests in 83 §S (concurrency/currentness): "one reader spans `stable -> transitioning`; one retrieval begins before authoritative invalidation and completes afterward; one old rebuild completes after newer generation; every returned hit is rechecked against final canonical eligibility/vector before return." — covers 91 C5.

*Propagation:* 83 (owner), 91, 89 W4, 88 (no new mechanism). **PASS.**

### C6 — ACCEPT — W5 replay / late completion hardening — **PASS**

*Evidence:* 84 §S adversarial list matches 91 C6 bullet-for-bullet: forced replay, duplicate wake delivery, duplicate completion resolution, external success followed by lost durable transition/ack, lease expiry while success in flight, late success after expiry/cancellation/quarantine, same-lineage convergence, outcome-unknown no-redispatch. §T matrix enumerates each injection with required idempotent/reconciling behavior. No new state authority — all use existing `wakes`/`cycle_records`/`settlements`/`in_flight_effects`/`effect_receipts` + W4 barrier.

*Propagation:* 84 (owner), 91, 89 W5. **PASS.**

### C7 — ACCEPT — W6 retry-authority proof — **PASS**

*Source verification at 573393c:*

```text
MISTRAL_RETRY_CONFIG = { strategy: "none" }   // apps/agent-service/src/mistral-client.ts
NIM:   fetchFn: NimFetch = (input,init)=>fetch(input,init); const res = await fetchFn(...)  // one injected fetch
Groq:  fetchFn: GroqFetch = ...; const res = await fetchFn(...)                             // one injected fetch
Zen:   fetchFn: ZenFetch  = ...; response = await fetchFn(...)                               // one injected fetch
Mistral SDK: const mistral=getClient(); const res=await mistral.chat.complete(...,{fetchOptions:{signal}}) // SDK path
```

Plan 85 §J `completeChat() and adapters` correctly distinguishes proof: native-fetch adapters → injected call counts on retryable 429/5xx; Mistral SDK → prove `strategy:"none"` reaches construction + one SDK completion call. 85 §S requires per-adapter matrix (incl. Groq/Zen/Mistral/NIM). 91's baseline ("NIM, Groq, Zen one fetch; Mistral strategy none") was verified — claim is TRUE. 89 W6 repeats matrix. 77 G41 freezes invariant.

*Propagation:* 85 (owner), 91, 89 W6, 77 G41. **PASS.**

---

# 4. Cross-wave consistency review

## 77 — Governing implementation contract — **PASS**

* Frozen 41 invariants G1–G41 map 1:1 to 72 global contracts + 55/75 resource policy; adds G39-G41 for hardened C4/C3/C7 — consistent with 88.
* Wave set W0-W8 + `W9 BLOCKED` consistent with 74 matrix.
* Reference SHA correct. Mode `READ_ONLY` correctly prohibits implementation.
* Resource policy verbatim 30000/4096/4096/2048/+2 corrections. Shared-deadline language matches 55/59.
* Source-inspection law + test-first law consistent with 78 pipeline.
* No ownership conflict.

## 78 — Master execution protocol — **PASS**

* Status ladder `NOT_STARTED → BLOCKED` matches 74/Wave Acceptance semantics.
* Per-wave pipeline `PRECHECK → CONTINUE OR STOP` is risk-based verification; explicitly gates full corpus to candidate freeze — consistent with AGENTS.md matrix.
* Resume via `git status/diff + existing evidence` (no special ledger) matches 89 §Resumability; contradicts no pre-existing artifact.
* Migration protocol §Migration execution requires isolated DBs, never production — consistent with 83/84/85/86.
* Predecessor handling distinguishes source vs evidence — correctly encodes DAG from 73.

## 79–87 — Wave plans — **PASS** (with notes)

| Plan | Verdict | Key check |
|---|---|---|
| 79 W0 | PASS | Strict four-branch, KernelEnvelope `v1`, `attention_requests` v43 columns, second fence in `publishSemanticTransaction`, alias atomicity, 79→83→84 barrier sequencing correct |
| 80 W1 | PASS | Aggregate fingerprint `sha256` over 11 components, logical vs wire separation, `providerDeclaredEnforcement="unavailable"`, invariant `unavailable` preserved, no new DB, `TRANSPORT != QUALIFIED != RELEASE != PRODUCTION` |
| 81 W2 | PASS | Conjunctive PASS, zero-network default, `nim/openai/gpt-oss-20b` exactly once, C4 oracle mechanics clean |
| 82 W3 | PASS | No allocator redesign, dataset freeze before eval, Stage A→Fuse→Stage H gates, derived-store measurement hooks only |
| 83 W4 | PASS | Nuclear 44 after 43 + sidecar v2, `reconciling` bootstrap, barrier CAS, idle writer removal, journal/consumption, exact-only degraded, C5 hardening |
| 84 W5 | PASS | Sidecar v3 after v2, occurrence convergence, one-cycle-one-chain, lease/reconciling, preemption persistence, C6 hardening |
| 85 W6 | PASS | Sidecar v4, 5/15m + 1/5/30/120, typed failures, fair scheduler, quarantine, repair lineage, per-adapter proof, C7 |
| 86 W7 | PASS | Sidecar v5, 12/hour, final-slot atomic, policy high-water `max(last,wall)`, 5-min discontinuity, held/committed/reconcile consume, restart-safe |
| 87 W8 | PASS | Zero-mutation protocol `query_only=ON` + authorizer, no migration/rebuild/vacuum/delete, explicit W9 blocked, preserves W4/W3 classification |

## 88 — Cross-wave matrix — **PASS** (with 1 editorial note)

* Correctly separates source vs evidence predecessors; Release Truth correctly NOT a universal source predecessor.
* Migration order 43→44→v2→v3→v4→v5 is exactly serializable; matches 90.
* Shared tables/files collision matrix lists real conflicts (`core/db.ts` W0+W4, `sidecar/schema.ts` W4-W7, `thought/run.ts` W0/W2/W7, `mistral-client.ts` multi-wave) with correct landing order.
* One medium note: `mistral-client.ts` row omits its W1 wire-evidence capture role (see FINAL-004).

## 89 — Luna execution bible — **PASS**

* Reading order VISION→hierarchy→roadmap→freeze→cross-phase→Ph54→77/78/88 consistent with AGENTS.md.
* Conservative order `W0→W1→W2→W3→W4→W5→W6→W7→W8→STOP` matches 73/74/88; W2/W3 evidence gates before remediation — intentional.
* Per-wave sections distribute hardened C1–C7 checkpoints correctly (see §3).
* Resume without special ledger vs 78 §Resume — consistent; `LUNA_EXECUTION_STATE.md` intentionally absent is correctly noted.
* Must-not-touch + stop law duplicates 77 §Stop — consistent.

## 90 — Final synthesis — **PASS**

* Accurately summarizes hardened state (not pre-91): next paragraph counts 4 test-hardening +1 mechanical +2 qualification hardenings; states cache-key proposal not frozen; notes resume-protocol.
* Machine-readable verdict `W0…W8 READY, W9 BLOCKED, MATURATION_FOUNDATION_STATUS=UNSAFE, PHASE5_FINAL_HARDENED=yes` matches 91.
* Migration numbers 43/44/v2-v5 source-grounded with correct baseline note (`OBSERVED_NUCLEAR_BASELINE_VERSION=41`, `NUCLEAR_SUPPORTED=42`); includes "Luna MUST re-read; collision triggers BLOCKED" guard.

## 91 — OSS reconciliation — **PASS**

* Seven deltas C1-C7 adjudicated with source evidence, affected artifacts, smallest patch, reason — all mechanically traceable (see §3).
* Counts `ACCEPTED=4 (C1,C3,C6,C7) MODIFIED=3 (C2,C4,C5)` verified by counting dispositions in text.
* Deferred maturation/substrate listed verbatim with `NEW_RUNTIME_DEPENDENCIES=0, WAVE_ORDER_CHANGED=no, W9_CREATED=no` — verified (no new dep, no order change, no W9 file).
* Correctly rejects prescribed cache key, model graders, token-healing, Restate/Temporal, per-lane capacity, outbox co-commit (already satisfied), etc.

---

# 5. Source-grounding review

Verified at exact worktree `573393c3fdb2392a45137d4625635658eb4b5d88`:

| Claim in Phase 5 | Verification | Result |
|---|---|---|
| Nuclear baseline 41 → supported 42, next free is 43 | `core/db.ts:134-135` `OBSERVED_NUCLEAR_BASELINE_VERSION=41`, `NUCLEAR_SUPPORTED_VERSION=42`; `sidecar/schema.ts: COGNITIVE_SIDECAR_SCHEMA_VERSION=1` | **TRUE** — 79/83 migration numbers 43/44 are next free slots today |
| `MISTRAL_RETRY_CONFIG.strategy="none"` | `mistral-client.ts` line exported const | **TRUE** |
| NIM/Groq/Zen one injected `fetch` | `adapters/nim-adapter.ts: NimFetch + fetchFn`, `groq-adapter.ts: GroqFetch`, `zen-adapter.ts: ZenFetch` each `await fetchFn(...)` once | **TRUE** |
| No JSON Schema validator dependency at SHA | `apps/agent-service/package.json` `Select-String ajv/json-schema/baml/promptfoo` → 0 hits | **TRUE** — justifies C4 oracle building only emitted keyword subset |
| `ProjectionCache` is in-memory cycle-local map | `thought/projection-allocator/cache.ts: class ProjectionCache<T>{ Map<string,T> }` keyed by `cycleId:generation:pass:...` | **TRUE** — not durable authority, correctly sidelined in 83 |
| `DerivedStore` at SHA has no eligibility check | `retrieval/derived-store.ts` verified `DERIVED_INDEX_SCHEMA_VERSION=1`, `computeMemorySourceHash`, generation logic; `retrieval/fts.ts: searchMemoryFts` no barrier/journal fence at SHA | **TRUE** — W4 adds it |
| `attention_requests` lacks W0 columns at SHA | `db.ts` schema lacks `thought_invocation_id`, `mf_attempt_id`, etc. at SHA (plan adds them) | **TRUE** |
| `ORDINARY_THOUGHT_BUDGET_MS` is 10s at SHA | `cognitive-v021/types.ts: ORDINARY_THOUGHT_BUDGET_MS = 10_000` | **TRUE** — plan correctly upgrades to 30000; v0.2.1's `6000` is a separate implementation-spec constant for its own turn-deadline plan, not the MRI freeze; 77 correctly freezes 30000 |
| `inbox_events` uses `pending/failed_retryable/claimed` | `cycle/inbox.ts: claimInboxEvent WHERE (status='pending' OR status='failed_retryable' ...)` | **TRUE** — W6 replaces with bounded `pending/leased/retry_wait/reconciling/quarantined` |
| `THOUGHT_OUTPUT_SCHEMA` at SHA is 5-form legacy echo | `thought/output-contract.ts: title "Ashley ThoughtStepOutput v1", oneOf 5 forms with `cycleId,generation,pass,requestId,occupantId` | **TRUE** — 79 replaces with 4-branch semantic schema |

**No nonexistent symbols, stale function names, or impossible migrations found** beyond editorial notes below. One stale symbol alias survives in documentation (FINAL-002) but does not create a source contradiction.

---

# 6. Findings

## FINAL-001 — Migration number collision guard incompletely spelled out in 79

```text
FINDING_ID=FINAL-001
SEVERITY=HIGH
ARTIFACT=79
SECTION=I (Database and schema plan)
SOURCE_SYMBOL=apps/agent-service/src/core/db.ts:134-135 OBSERVED_NUCLEAR_BASELINE_VERSION, apps/agent-service/src/core/cognition/schema-contract.ts
CONTRACT_AT_RISK=MIGRATION_ORDER (88 §Migration order), G38 execution correctness
EVIDENCE=79 §I says "Create apps/agent-service/src/core/cognitive-v021/migration-43.ts" and "Update OBSERVED_NUCLEAR_BASELINE_VERSION to 42 so NUCLEAR_SUPPORTED derives 43". At SHA, baseline is already 41/42 and supported is 42; the sentence omits the origin value and the "next free slot TODAY" qualifier. 90 correctly states baseline 41→42 today plus "Luna MUST re-read; collision triggers BLOCKED", but 79 (the implementation owner's primary source for the migration file) does not carry that guard verbatim.
WHY_IT_MATTERS=If a landing between review and implementation bumps baseline to 42/43, a literal "create 43" instruction without the guard would collide silently or force ad-hoc renumbering without reconciling 83's 44 and sidecar v2-v5.
SMALLEST_REQUIRED_PATCH=In 79 §I, add one sentence: "At reference SHA 573393c, OBSERVED_NUCLEAR_BASELINE_VERSION=41 and NUCLEAR_SUPPORTED_VERSION=42 per core/db.ts:134-135 and cognition/schema-contract.ts; therefore the next free nuclear versions are 43 (W0) and 44 (W4). Luna MUST re-inspect live versions before creating any migration; a collision triggers IMPLEMENTATION_BLOCKED per 77/88, not silent renumbering." No code change.
PHASE4_REOPEN_REQUIRED=no
```

## FINAL-002 — Stale Attention symbol name in 79 inventory

```text
FINDING_ID=FINAL-002
SEVERITY=MEDIUM
ARTIFACT=79
SECTION=G (Existing symbol inventory, Attention row)
SOURCE_SYMBOL=apps/agent-service/src/core/attention/types.ts: AcceptedDispatchIdentity
CONTRACT_AT_RISK=Source-path verification (77 §Source-inspection law)
EVIDENCE=79 §G lists `AcceptedDispatchIdentity` as existing symbol. §E correctly plans rename to "allocation identity and include MF invocation/attempt/wire facts" and 79 §H defines CapturedModelAttemptIdentity and ThoughtInvocationContext. At SHA the type is AcceptedDispatchIdentity; after W0 it must be renamed. The plan lacks an explicit "RENAME ledger: AcceptedDispatchIdentity → ThoughtInvocationContext (+ CapturedModelAttemptIdentity), no reader retains old name" line, leaving Luna to infer whether old name is alias or deleted.
WHY_IT_MATTERS=Without a rename ledger, a partial implementation could leave both names referencing different shapes, producing a second provenance field.
SMALLEST_REQUIRED_PATCH=In 79 §E row for attention/types.ts, append: "RENAME: retire AcceptedDispatchIdentity; exact replacement is CapturedModelAttemptIdentity + ThoughtInvocationContext; no dual-identity compatibility." One line.
PHASE4_REOPEN_REQUIRED=no
```

## FINAL-003 — C4 oracle keyword enumeration not centralized

```text
FINDING_ID=FINAL-003
SEVERITY=MEDIUM
ARTIFACT=81
SECTION=J (evaluateQualificationCase, oracle paragraph)
SOURCE_SYMBOL=apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts THOUGHT_OUTPUT_SCHEMA
CONTRACT_AT_RISK=C4 oracle boundary (77 G39, 91 C4), strict-parser value
EVIDENCE=81 correctly freezes oracle as "only schema-keyword subset emitted by closed W0 schema, fail closed on unsupported, derived from exported schema, drift test mutates W0 schema". The exact closed keyword subset (e.g., type,const,enum,required,properties,items,$ref,oneOf,anyOf,$defs,title,$id,$schema) is not enumerated in one normative sentence; it is implied from successor schema. Luna must not guess which keywords to support.
WHY_IT_MATTERS=C4 boundary PASS hinges on fail-closed behavior; enumerating the list once prevents an implementer from adding e.g. `patternProperties` silently and turning the oracle into a second tolerant parser.
SMALLEST_REQUIRED_PATCH=In 81 §J, after "supports only the emitted closed-schema keyword subset", append enumeration: "Emitted keywords are exactly: $schema,$id,title,type,properties,required,enum,const,items,$ref,$defs,oneOf,anyOf; any other keyword (e.g., patternProperties, additionalProperties, dependencies, allOf) fails closed." Derive from 79 successor schema at implementation time and update drift test if schema emits more.
PHASE4_REOPEN_REQUIRED=no
```

## FINAL-004 — File-collision matrix omits mistral-client W1 role

```text
FINDING_ID=FINAL-004
SEVERITY=MEDIUM
ARTIFACT=88
SECTION=File collision matrix
SOURCE_SYMBOL=apps/agent-service/src/mistral-client.ts
CONTRACT_AT_RISK=Cross-wave ownership clarity
EVIDENCE=88 file-collision matrix lists mistral-client.ts touching W0-W2,W6,W7 with note "One invocation/attempt receipt lifecycle". 80 §E reassigns mistral-client.ts to capture runtime build/capability identity and attach wire evidence (W1 Release Truth role). That W1 role is not in the 88 row.
WHY_IT_MATTERS=Without W1 in that row, Luna could implement W1 wire capture in adapters only and miss the mistral-client capture-before-attempt hook, passing W0 but failing W1 evidence.
SMALLEST_REQUIRED_PATCH=In 88 file-collision matrix, change mistral-client.ts waves from "W0-W2,W6,W7" to "W0-W2,W6,W7 (W1 capture of runtime build/capability + wire evidence via completeChat)".
PHASE4_REOPEN_REQUIRED=no
```

## FINAL-005 — 79 §S semantic-wrong list missing "unsupported committed" qualification

```text
FINDING_ID=FINAL-005
SEVERITY=LOW
ARTIFACT=79
SECTION=S (New tests)
SOURCE_SYMBOL=Phase 4 artifact 58 SettlementOutput
CONTRACT_AT_RISK=C2 modified delta exactness
EVIDENCE=79 lists semantic-wrong fixtures: branch/payload inconsistency, unsupported claim via evidenceUse, etc. §S sentence omits explicit "unsupported occupancy/subscription directive" alongside commitments — covered implicitly by "branch/payload inconsistency" but worth one word to match 58 field shapes (occupancyDeltas, subscriptionDeltas have allowlisted refs).
WHY_IT_MATTERS=Reviewer cannot falsify that 79 fully honors 58's every settlement delta shape; Luna might skip subscription occupancy adversarial case.
SMALLEST_REQUIRED_PATCH=In 79 §S semantic-validity sentence, append "including unsupported concern/occupancy/subscription deltas referencing allowlisted-but-irrelevant concerns."
PHASE4_REOPEN_REQUIRED=no
```

## FINAL-006 — 86 legacy blocked-epoch language slightly indirect

```text
FINDING_ID=FINAL-006
SEVERITY=LOW
ARTIFACT=86
SECTION=I (Migration) + 88 matrix row 6
SOURCE_SYMBOL=apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts
CONTRACT_AT_RISK=R5 durability across upgrade
EVIDENCE=86 §I: "Migration starts with new admission blocked for each policy until recent legacy usage is classified." 88 row 6: "private admissions remain blocked until legacy usage/epoch conservative". The owner-decision epoch creation step ("owner-established budget epoch after full rolling-hour quiet period") is in 86 §I second paragraph but not in the checklist Y.1 inventory order — Y.1 says "Inventory private entrypoints" without "classify legacy usage / propose epoch".
WHY_IT_MATTERS=Luna could implement fresh ledger and prove 12/hour locally without ever handling an upgraded DB that had 11 calls in the last hour at SHA.
SMALLEST_REQUIRED_PATCH=In 86 §Y checklist, change item 1 to "Inventory private entrypoints, counters, dispatch boundary, and recent legacy usage; propose conservative blocked/epoch per §I."
PHASE4_REOPEN_REQUIRED=no
```

## FINAL-007 — Documentation index freshness (informational)

```text
FINDING_ID=FINAL-007
SEVERITY=LOW
ARTIFACT=77
SECTION=Authority / AGENTS.md link
SOURCE_SYMBOL=docs/architecture/Ashley_Architecture_Document_Index.md
CONTRACT_AT_RISK=None (documentation hygiene)
EVIDENCE=No normative instruction error. Document index at reference SHA may still list pre-MRI architecture doc versions; 77 correctly says Phase 4 owns architecture regardless of index. No patch required unless index still points to superseded F010 narrow contract.
WHY_IT_MATTERS=Future reader confusion only; no Luna ambiguity.
SMALLEST_REQUIRED_PATCH=If index lists F010 narrow patch, update to point to Phase 4 artifacts 55-75 as architecture authority. No code change.
PHASE4_REOPEN_REQUIRED=no
```

**Finding counts:** BLOCKERS=0, HIGH=1, MEDIUM=3, LOW=3 (total 7). No architecture drift.

---

# 7. Luna ambiguity audit

Every place Luna must make a decision was scanned (every "choose/ decide/ appropriate/ best method" phrasing). Classification:

| Location | Text | Classification | Why |
|---|---|---|---|
| 79 §H `ThoughtInvocationContext` exact fields | Luna must implement these types verbatim | **NORMAL** — mechanically specified, shape frozen by Phase 4 58 |
| 79 §I migration-43 column list | 17 `ALTER TABLE` + 2 indexes verbatim | **NORMAL** — exact SQL given, no choice |
| 80 §H `ThoughtCapabilityComponents` / `ThoughtResourcePolicyIdentity` | Luna must hash in `stableJson` order | **NORMAL** — algorithm owner given (`hash.ts`) |
| 81 §J oracle keyword subset | Luna must derive from exported successor schema, fail closed on unsupported | **NORMAL** after FINAL-003 — enumeration patch makes it fully mechanical |
| 81 §J drift test | Luna must mutate W0 schema and expect oracle identity change/fail | **NORMAL** — mechanical |
| 82 §J `extractIncidentCSnapshot` / `runStageH` | Exact inputs/outputs/side-effects listed | **NORMAL** |
| 83 §J `beginAuthorityTransition` CAS `stable→transitioning` | Luna implements BEGIN IMMEDIATE + singleton check | **NORMAL** |
| 83 §J derived eligibility check | 6 conjuncts enumerated, fail-closed | **NORMAL** |
| 84 §J `matureFutureTriggerToWake` single transaction | Luna implements exact 4-step atom | **NORMAL** |
| 85 §J `nextRetryAt` pure function | Delays `1,5,30,120` capped at `first+15m` | **NORMAL** — frozen numbers |
| 86 §J `reservePrivateThought` atomic count | Luna implements exact `BEGIN IMMEDIATE; max(wall,highWater); count; insert` | **NORMAL** |
| 87 §Read-only inventory algorithm | Luna enumerates `sqlite_schema` then exact `COUNT(*)`/`SUM(pgsize)` queries | **NORMAL** — SQL templates given |
| 88 Migration order 43/44/v2-v5 | Luna lands 43 before 44, etc., with stop-on-collision | **NORMAL** after FINAL-001 |
| 89 Checkpoint without ledger | Luna inspects `git status/diff + evidence` | **NORMAL** — no new state to invent |

**ARCHITECTURE_INVENTION items:** 0.

Luna's remaining choices are strictly local implementation choices (identifier naming of internal helpers, test file layout within the named suite, ordering of `BEGIN IMMEDIATE` statements that preserve the specified atomicity, exact hash of sanitized wire digest excluding messages/secrets). None require inventing semantic/governance architecture.

**LUNA_CAN_IMPLEMENT_WITHOUT_ARCHITECTURE_INVENTION = yes**

---

# 8. Verification

| Check | Result | Evidence |
|---|---|---|
| Artifact 76 intentionally absent | **PASS** | `Get-ChildItem ashley-mri-phase5-573393c` lists 77-91 only; 76 absent by design per 90:132 |
| Artifacts 77–91 present | **PASS** | 15 files: 77,78,79,80,81,82,83,84,85,86,87,88,89,90,91 all exist; lengths 6-29KB each |
| W9 absent (no implementation artifact) | **PASS** | `W9` appears only as `W9 BLOCKED` in 77,88,89,90; no `W9_*.md` or `9*_W9_*` file |
| Resource policy 30000/4096/4096/2048 +2 | **PASS** | 77 §Frozen policy `30000/4096/4096/2048 + 2_PER_SEMANTIC_PASS`; also 80:H,81:C,90,55/59/72 |
| Wave order W0→W1→W2→W3→W4→W5→W6→W7→W8→STOP | **PASS** | 77 §Wave set, 78 §Execution order, 88 §Conservative order, 89 §Execution order, 90 §STOP all identical |
| W8 measurement-only | **PASS** | 87 header `SOURCE_MUTATION_AUTHORIZED=no, DATABASE_MUTATION_AUTHORIZED=no, RETENTION...=no, W9 BLOCKED`; 77 G35, 88 row W8 `None for migration; MUST NOT migrate`, 90 `READ_ONLY` |
| No runtime dependencies introduced by OSS reconciliation | **PASS** | 91: `NEW_RUNTIME_DEPENDENCIES=0`; 81 oracle explicitly hostage to existing dep graph; no `package.json` change planned |
| SQLite retained | **PASS** | All migrations target SQLite (`DatabaseSync`); 91: "SQLite and Bubblewrap remain unchanged" |
| Bubblewrap/Sandbox V2 retained | **PASS** | 91 deferred list explicitly keeps Bubblewrap; no XTDB/CubeSandbox/Wasmtime import |
| Phase 4 unchanged | **PASS** | 77: `PHASE4_ARCHITECTURE_REOPENED=no`; 91: `PHASE4_REOPEN_REQUIRED=no`; 90: same |
| No product/test/config mutation by this review | **PASS** | `git status --short` shows only untracked audit outputs (`docs/audits/` + this file + one other reviewer's draft); no `apps/`/`docs/` tracked mutation; `git rev-parse HEAD` still `573393c` |

---

# 9. Final decision

```text
FINAL_REVIEW=ACCEPT_WITH_PATCHES
PHASE4_REOPEN_REQUIRED=no
PHASE5_REOPEN_REQUIRED=no
PHASE5_FINAL_HARDENED_CONFIRMED=yes (after 4 patches below)
READY_FOR_LUNA=no (until patches applied)
BLOCKERS=0
ARCHITECTURE_DRIFT_FOUND=no
```

**Smallest patches required before Luna starts (all documentation, < 40 lines total, no architecture change):**

1. **FINAL-001 (79 §I):** Add migration-collision guard sentence naming baseline 41→42 at SHA and requiring live re-inspection + `IMPLEMENTATION_BLOCKED` on collision.

2. **FINAL-002 (79 §E/G):** Add one-line rename ledger: `AcceptedDispatchIdentity` retired → `CapturedModelAttemptIdentity + ThoughtInvocationContext`, no dual identity.

3. **FINAL-003 (81 §J):** Enumerate emitted closed-schema keywords that the C4 oracle supports; all others fail closed.

4. **FINAL-004 (88 matrix):** Add W1 role to `mistral-client.ts` row: "W1 capture of runtime build/capability + wire evidence via completeChat."

After these 4 edits are applied and re-spot-checked, the packet upgrades to:

```text
FINAL_REVIEW=ACCEPT
PHASE4_REOPEN_REQUIRED=no
PHASE5_FINAL_HARDENED_CONFIRMED=yes
READY_FOR_LUNA=yes
READY_FOR_LUNA_AFTER_REVIEW=yes
```

No architecture reopen, no wave reordering, no new dependency, no W9, no source mutation needed to authorize implementation.

---

# Appendix — Evidence provenance

*Reviewed commit:* `573393c3fdb2392a45137d4625635658eb4b5d88` verified via `git rev-parse HEAD` in audit worktree `C:\Users\Xharv\Projects\composer-assistant-audit-573393c`.
*Phase 4 authority:* 55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75 — read in full (spot-depth on 57/58/59/60/61/62/64-72, full on 55/74/75).
*Phase 5 packet:* 77,78,79,80,81,82,83,84,85,86,87,88,89,90,91 — read in full.
*Source inspection:* `core/db.ts:OBSERVED_NUCLEAR_BASELINE_VERSION`, `core/cognition/schema-contract.ts`, `core/cognitive-v021/types.ts`, `thought/parse.ts`, `thought/output-contract.ts`, `thought/projection-allocator/cache.ts`, `retrieval/derived-store.ts`, `retrieval/fts.ts`, `retrieval/discover.ts`, `cycle/inbox.ts`, `mistral-client.ts`, `model-routing/adapters/*`, `package.json`, `sidecar/schema.ts`.
*Cross-check:* `docs/cognitive-rework/v0.2.1/` exists but does NOT override MRI — treated as converged implementation spec (6000 ms turn-deadline constant is packet-local, not MRI freeze).
*Product mutation:* 0 — this review created only `docs/audits/ashley-mri-phase5-573393c/92_PHASE5_FINAL_INDEPENDENT_REVIEW_MUSE-SPARK-1.2.md`.

---

**Answer to central question:**

> Can Luna now implement W0→W8 from the hardened Phase 5 packet against reference SHA 573393c3fdb2392a45137d4625635658eb4b5d88 without inventing architectural semantics, weakening Phase 4, or relying on undocumented assumptions?

**YES — after the 4 documentation patches listed in §9.** Mechanical evidence:

* Every frozen Phase 4 law maps to an exact Phase 5 owner, file, type, SQL/table, and named falsification test (§2).
* All seven hardened deltas C1–C7 are reflected in their owner artifacts plus 89/90, with source identity tied to exact SHA (§3, §5).
* Cross-wave matrix 88 is internally consistent and consistent with 77/78/89/90; migration order 43/44/v2-v5 is serializable and source-grounded (§4).
* C4 oracle boundary is correctly scoped (qualification-only, closed-schema, fail-closed, schema-derived, drift-tested, not a runtime parser) (§3 C4).
* W8 is strictly read-only with `query_only` + authorizer + before/after mutation proof; W9 is block-listed (§4, verification table).
* No Luna decision requires architecture invention (ambiguity audit §7: 0 items).
* Zero blockers; remaining 7 findings are all documentation patches with exact smallest fixes (§6); no Phase 4 reopen required.

Without the 4 patches, Luna could still implement without architecture invention, but would carry a non-zero drift risk on migration-number collision (FINAL-001) and a minor provenance-rename ambiguity — hence `ACCEPT_WITH_PATCHES` rather than `ACCEPT`.
