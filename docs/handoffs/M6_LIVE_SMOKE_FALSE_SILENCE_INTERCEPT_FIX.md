# M6 Live Smoke False Silence Intercept Repair

## 1. Incident Summary

During the initial Project Ashley M6 Bounded Operation live owner smoke turn, the owner sent:

> "Using the bounded operation capability, perform this finite Project Ashley candidate-only sequence: create a fresh candidate file called `ashley-m6-smoke.txt` containing `M6 bounded operation smoke test`, mechanically verify that candidate using the available verification capability, then seal the resulting candidate work as an advisory change-set. Do not touch the live repository. Do not apply, merge, commit, push, export, deploy, restart, install anything, or use network access. Stop after the advisory change-set is sealed, and tell me what actually happened at each step."

No Discord reply was delivered to the user.

---

## 2. Exact Forensic Trace

- **Host Running SHA:** `16ef2beae0aa887bb99d862b2146bbcaa213eab5`
- **Inbound Message ID:** `355` (`1541433572836245585`)
- **Delivery Reservation ID:** `155` (`entity_uuid: 4a75e4c6-942a-48ce-80e5-20dade1d2694`)
- **Decision ID:** `1338` (`decision_kind: "silence"`, `reason: "The user asked for space."`, `thought_source: "deterministic"`)
- **Attention / Model Calls:** 0 (initial thought not dispatched)
- **Bounded Operation Children:** 0 (no M3, M4, or M5 child tasks started)
- **Workspaces / Change-Sets:** Untouched (0 child effects occurred)
- **Turn Latency:** 255ms (aborted immediately as deterministic silence)

---

## 3. Root Cause Analysis

In `apps/agent-service/src/core/agency/motivations.ts` and `apps/agent-service/src/core/agency/decide.ts`, `isSilenceRequest` and `isSilenceSummary` used loose regular expressions:
```typescript
/\b(?:stop(?: messaging| pinging)?|busy|later|not now|leave me alone|don't ping|do not ping)\b/i
```
The bare word boundary `\bstop\b` matched procedural task control language (*"Stop after the advisory change-set is sealed..."*).

This caused:
1. `generateMotivations` to classify the user's message as a `silence_signal` with score 100.
2. Deterministic Agency (`decide.ts`) to immediately short-circuit with `silence` prior to Thought dispatch.
3. Total suppression of cognition and response.

---

## 4. Semantic Repair

Replaced loose regex matching with a conservative conversational silence grammar:
1. **Explicit qualified conversational silence phrases** (`stop messaging`, `stop pinging`, `stop talking`, `don't message me`, `leave me alone`, `give me space`, etc.).
2. **Standalone / near-standalone space directives** (`stop`, `please stop`, `not now`, `busy`, `talk later`, etc. as standalone utterances or very short directives).
3. **Procedural continuations invalidate silence** (`stop after...`, `stop when...`, `stop once...`, `stop before...`, `stop on...`).

Exported canonical `isSilenceRequest` from `motivations.ts` and used it directly in `decide.ts`, eliminating duplicate divergent regexes.

---

## 5. Verification & Tests

Created `apps/agent-service/src/core/agency/silence-intent.test.ts` (41 tests):
- Regression test for exact owner M6 utterance (`isSilenceRequest = false`, Agency decision = `speak`).
- Positive silence regressions (20 cases: `"stop"`, `"please stop"`, `"stop messaging me"`, `"leave me alone"`, `"not now"`, `"busy"`, etc.).
- Procedural `stop` regressions (13 cases: `"Stop after..."`, `"Stop when..."`, `"Stop once..."`, `"Stop before..."`, `"Run at most three attempts and stop"`, etc.).
- Negation and discussion cases (6 cases: `"The word 'stop' is causing a bug"`, `"Why did Ashley stop responding?"`, etc.).

---

## 6. Durable Owner Timing Policy Note

> **Owner Runtime Policy for Bounded Work:**
> For bounded background / engineering work, latency from free/public API endpoints is expected and acceptable. Success is defined by completion with bounded execution, truthful settlement, and eventual reporting—not ordinary chat-response latency ("SLOW != FAILED").
>
> *Note on Governance:* This is an operational timing tolerance, not an expansion of capability authority or permission for unbounded execution. Future timing designs must preserve bounded total work, bounded child counts, explicit settlement, durable evidence, and no orphaned effects.
