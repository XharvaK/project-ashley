# Project Ashley — Incident Repair Checkpoint
# Mind-State Authority & Speech-Grounding Repair

============================================================
1. INCIDENT EVIDENCE & IDENTIFIERS
============================================================

- **Incident Turn Timestamp**: 2026-08-25T19:07:37.491Z
- **Owner Turn**: `"Hey Ashley, what are you thinking about tonight?"`
- **Ashley Erroneous Output**: `"0.2.0"`
- **Decision ID**: `1331` (Decision Kind: `speak`, Operational Request: `project_inspection` on `package.json`)
- **Motivation IDs**: `[19590, 19588]`
  - `19590`: `user_message` (`"Hey Ashley, what are you thinking about tonight?"`)
  - `19588`: `callback` (`"inspect package.json and provide version"`)

============================================================
2. PRIMARY ROOT CAUSE & MODEL FABRIC NON-CAUSALITY
============================================================

- **Model Fabric Non-Causality**:
  - Model Fabric machinery was verified non-causal.
  - CURRENT Thought route ran (`qwen-2.5-32b-instruct` on Groq).
  - CURRENT Expression route ran (`mistral-small-latest` on Mistral).
  - TARGET route remained dark (no `ActivationRef` or `OwnerApprovalRef` existed).
- **Primary Root Cause**:
  - A stale Mind State concern from an earlier smoke interaction (`"inspect package.json and provide version"`) was included as motivation `19588` alongside user message `19590`.
  - Thought selected both motivations and emitted a `project_inspection` operational request.
  - The resulting observation (`"0.2.0"`) was rendered by Expression without any current conversational context anchoring the operational authority.

============================================================
3. INDEPENDENT REVIEW OF ed3b975
============================================================

Independent implementation review of `ed3b975e61dcf69cdc1484407699b91af60716b8`:

`MIND STATE / SPEECH INCIDENT REPAIR INDEPENDENT REVIEW = REPAIR REQUIRED`

Accepted blocker **B1**: `operationalBasisMotivationId` was derived telemetry, not an execution license. Reactive admission used a broad noun/verb detector, so a turn such as `"Did you get the file?"` plus a stale package.json goal could still admit `project_inspection`.

Accepted nonblocking:
- **N1**: `unsupported_operation` was overloaded for unauthorized continuation.
- **N2**: Test 13 collided unique Mind State provenance (`sourceType=custom`, `sourceId=1`).
- **N4 / dispositions**: `MindStateDisposition` types and `applyMindStateDispositions` existed, but Thought never authored dispositions. End-to-end lifecycle was not implemented.

============================================================
4. REPAIR ON TOP OF ed3b975 (this candidate)
============================================================

Frozen laws remain:

1. **PERSISTED MIND STATE != CURRENT TURN AUTHORITY**
2. **BACKGROUND MIND STATE MAY SURFACE != MAY EXECUTE**
3. **UNRESOLVED INTENTION != CURRENT OPERATIONAL AUTHORITY**
4. **MODEL-CLAIMED BASIS ID != VALIDATED ADMISSION**
5. **REACTIVE OWNER-TURN AUTHORITY != PROACTIVE INITIATIVE AUTHORITY**
6. **THOUGHT OWNS COGNITION, EXPRESSION OWNS REALIZATION**

### Trusted admission

Single evaluator: `evaluateReactiveOperationalAdmission` in
`apps/agent-service/src/core/sandbox/reactive-operational-admission.ts`.

Thought structural validation calls it. Runtime `authorizeReactiveOperationalExecution`
requires a trusted `Decision.reactiveOperationalAdmission` and re-invokes the same
evaluator immediately before side effect.

`operationalBasisMotivationId` remains model-claimed / omitted provenance only.
The host never treats writing that ID as authority.

Admission classes:
- `current_owner_request` — the current owner utterance materially requests THIS operation (kind + target identity where present).
- `explicit_resumption` — the owner resumes THIS historical motivation, uniquely, with matching request identity.

Omitted claimed basis defaults to the current-turn `user_message` (even if Thought selected a related question ID). An invalid claimed ID is rejected; it is not replaced with a convenient stale ID.

Unauthorized reactive operations fail closed with `unauthorized_task_continuation` before execution. Retry feedback tells the model to stay conversational / surface the matter, not to pick another supported operation.

Proactive execution is unchanged: this gate is reactive-only.

### MindStateDisposition

**DEFERRED.** Automatic Thought-authored lifecycle resolution is not part of this candidate.

Persistence helpers (`resolveMindStateItem`, `cancelMindStateItem`, `resolveMindStateBySource`, `applyMindStateDispositions`) remain for explicit operator/test use. Runtime no longer applies decision-authored dispositions. Production cleanup of stale rows remains a governed operator action after acceptance.

### `updated_at`

Wake operations still do not refresh semantic `updated_at`. No age-decay policy was added.

============================================================
5. EXACT AFFECTED SOURCE
============================================================

Prior ed3b975 files plus this delta:

- `apps/agent-service/src/core/sandbox/reactive-operational-admission.ts` (new)
- `apps/agent-service/src/core/types.ts`
- `apps/agent-service/src/core/agency/thought.ts`
- `apps/agent-service/src/core/runtime.ts`
- `apps/agent-service/src/core/sandbox/durable-cognition.ts`
- `apps/agent-service/src/core/agency/mind-state-authority.test.ts`
- `docs/handoffs/MIND_STATE_SPEECH_INCIDENT_REPAIR.md`

Model Fabric paths were not modified.

============================================================
6. VERIFICATION
============================================================

Focused verification (not the full corpus):

- `mind-state-authority.test.ts` including Tests 18–20 and adversarial A–L
- thought / continuation / structured-output
- mind-items, candidate-selection, decide
- m4-phase-e, m5-phase-e, reactive-sandbox, durable-cognition

`thought-delay.test.ts` still has two pre-existing failures (`payload_invalid` vs missing `evidenceDisposition`); they are proactive fixtures without `evidenceDisposition` and were not part of this repair.

============================================================
7. PRODUCTION POSTURE
============================================================

- **Production requalification**: not started.
- **Production cleanup**: stale `nuclear.db` rows have NOT been mutated.
- **Mint**: no SSH / deploy.
- **Push**: none.
- **Model Fabric TARGET**: still dark. No ActivationRef / OwnerApprovalRef created.
- **Model Fabric**: production compatibility pass; non-causal for this incident.
