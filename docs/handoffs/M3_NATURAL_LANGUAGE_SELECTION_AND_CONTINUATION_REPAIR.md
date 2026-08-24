# Project Ashley — M3 Natural-Language Operation Selection & Continuation Repair

---

## 1. Executive Summary

This handoff documents the root causes and architectural resolutions for two reproducible issues identified in the Sandbox V2 M3 natural-language interaction surface with the `openai/gpt-oss-20b` Thought model:

1. **Thought Operation Selection Ambiguity (`THOUGHT_SELECTION_FAILURE`):**
   - **Symptom:** When given natural-language requests containing phrasing like *"Create a harmless smoke file in the Project Ashley candidate workspace called `ashley-m5-smoke.txt`..."*, the model consistently selected `workspace.create_directory` on target path `"candidate_workspace"` or `"candidate-ashley"` rather than `workspace.write_file`.
   - **Root Cause:** In `composeInitialThoughtMessages`, `workspace.create_directory` was listed in the operations union without semantic explanation. The model conflated directory creation with candidate workspace environment initialization.
   - **Resolution:** Updated the prompt ontology in `thought.ts` to explicitly separate candidate workspace lifecycle (runtime-managed, automatic upon omitting `workspaceId`) from in-workspace mutation operations (`workspace.write_file` for file creation with content vs `workspace.create_directory` for creating empty folders inside the workspace).

2. **Continuation Validation Failure (`payload_invalid`):**
   - **Symptom:** Both Turn 151 and Turn 152 encountered `continuation_structural_failure` with `errorCode: "payload_invalid"`, resulting in long turn latency (~23s) and fallback to deterministic Thought.
   - **Root Cause:** `buildContinuationMessages` advertised `delayClass` in the general schema definition, prompting the model to emit `"delayClass": "none"` (or `"standard"`). `validateContinuationProposal` strictly rejected any non-delay proposal with `parsed.delayClass != null`, causing structural failure.
   - **Resolution:** Updated `validateContinuationProposal` and `validateThoughtProposal` to normalize `delayClass` to `null` for all non-delay decisions, and updated `buildContinuationMessages` to specify `delayClass?` only applies to delay decisions.

3. **Operational Claim License Preservation:**
   - Preserved the invariant that an issued, verified `OperationalClaimLicense` remains attached to the turn and is never erased if continuation encounters a cognitive/structural failure.

---

## 2. Modified Files

- [`apps/agent-service/src/core/agency/thought.ts`](file:///C:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/agency/thought.ts):
  - Made M3 capability guidance unambiguous regarding workspace lifecycle vs `workspace.write_file` vs `workspace.create_directory`.
  - Normalized `delayClass` handling across Pass 1 and Pass 2 continuation validations.
  - Clarified schema in `buildContinuationMessages`.
- [`apps/agent-service/src/core/agency/thought.test.ts`](file:///C:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/agency/thought.test.ts):
  - Added deterministic test verifying unambiguous M3 capability guidance in `composeInitialThoughtMessages`.
- [`apps/agent-service/src/core/agency/thought-continuation-repair.test.ts`](file:///C:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/agency/thought-continuation-repair.test.ts):
  - Added test verifying `validateContinuationProposal` normalizes `delayClass` on `speak` decisions.
  - Added test verifying verified `OperationalClaimLicense` retention on continuation failure.

---

## 3. Live-Provider Preflight Matrix Results

Evaluated live against NVIDIA NIM `openai/gpt-oss-20b` across representative utterances:

| Utterance | Expected Operation | Actual Operation | Path | Content Emitted? |
|---|---|---|---|---|
| *"Create file notes.txt containing hello."* | `workspace.write_file` | `workspace.write_file` | `notes.txt` | Yes (`"hello"`) |
| *"Write hello to notes.txt in the candidate workspace."* | `workspace.write_file` | `workspace.write_file` | `notes.txt` | Yes (`"hello"`) |
| *"Add a harmless text file named smoke.txt with content test."* | `workspace.write_file` | `workspace.write_file` | `smoke.txt` | Yes (`"test"`) |
| *"In the Project Ashley candidate, create foo.json containing {}."* | `workspace.write_file` | `workspace.write_file` | `foo.json` | Yes (`"{}"`) |
| *"Create a harmless smoke file in the Project Ashley candidate workspace called ashley-m5-smoke.txt containing M5 candidate authorship smoke test. Do not touch the live repository. Tell me what you actually did."* | `workspace.write_file` | `workspace.write_file` | `ashley-m5-smoke.txt` | Yes (`"M5 candidate authorship smoke test"`) |
| *"Start a fresh candidate workspace for Project Ashley from the current repository state. In that fresh candidate only, create a harmless file called ashley-m5-smoke.txt containing M5 candidate authorship smoke test. Do not modify the live repository. Tell me what you actually created and where."* | `workspace.write_file` | `workspace.write_file` | `ashley-m5-smoke.txt` | Yes (`"M5 candidate authorship smoke test"`) |
| *"Create a directory called fixtures."* | `workspace.create_directory` | `workspace.create_directory` | `fixtures` | None |
| *"Make a folder named scratch inside the candidate workspace."* | `workspace.create_directory` | `workspace.create_directory` | `scratch` | None |
| *"Add an empty directory docs/generated."* | `workspace.create_directory` | `workspace.create_directory` | `docs/generated` | None |
| *"Delete temp.txt from the candidate workspace."* | `workspace.delete_file` | `workspace.delete_file` | `temp.txt` | None |

---

## 4. Verification

- All focused vitest tests pass (33/33 tests).
- Clean `tsc` compilation with 0 errors across `agent-service` and `discord-bot`.
