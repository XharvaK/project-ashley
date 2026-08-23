# Authority Kernel Freeze Record

**Milestone:** Authority Kernel — Communication Consumer  
**Acceptance Candidate SHA:** `0742f62c04695e02221ac289e883bcc3dd64abc2`  
**Acceptance Packet:** [`docs/handoffs/authority-communication-production-acceptance.md`](authority-communication-production-acceptance.md)  
**Freeze Date:** 2026-08-23T15:05:00+03:00  
**Freeze Status:** `FROZEN SUBSTRATE`

---

## 1. Milestone Identity

* **Name:** Authority Kernel Discord Communication Consumer
* **Canonical Architecture:** [`docs/architecture/Ashley_Authority_Kernel_Architecture.md`](../architecture/Ashley_Authority_Kernel_Architecture.md)
* **Parent Contract:** [`docs/architecture/External_Effect_and_Authority_Architecture.md`](../architecture/External_Effect_and_Authority_Architecture.md)
* **Implementation Root:** `apps/agent-service/src/core/authority/`
* **Acceptance Candidate SHA:** `0742f62c04695e02221ac289e883bcc3dd64abc2`
* **Acceptance Status:** `ACCEPTED WITH NON-BLOCKING NOTES`

---

## 2. Accepted Capabilities

The frozen milestone establishes the following verified capabilities:

1. **In-Process Authority Kernel Runtime Evaluator**:
   - Deterministic policy evaluator at `src/core/authority/kernel.ts`.
   - Typed ontology enforcing `EffectIntent` → `EffectAuthorization` → `PreparedEffect` → `EffectCommitRecord`.
   - Strict absence of generic boolean permissions (no `allowed: true`, no `externalAllowed`).
2. **Communication Policy as First Consumer**:
   - Formal policy module at `src/core/authority/communication-policy.ts`.
   - Classification and semantic constraints for `owner_command_reply`, `observation`, and related communication classes.
3. **Comprehensive Discord Send Gating**:
   - Reactive turns (`src/core/runtime.ts`): Intent derivation → Authority evaluation → Expression → `prepareCommitAndAudit` → `sendBubbles`.
   - Proactive initiative (`src/core/runtime.ts`): Evaluated prior to Expression; refusals halt without reserving turn slots or creating initiative rows.
   - Weekly reviews (`src/core/sandbox/weekly-review-delivery.ts`): Evaluated and committed under `observation` class before proactive delivery claims.
   - Secret omission notices (`src/core/runtime.ts`): Evaluated under `owner_command_reply` class before transmission.
4. **Negative Control & Honesty Revalidation**:
   - Post-expression text mutations trigger revalidation against the original candidate hash (`honesty_mutation_invalidated`).
   - Under-specified payloads (`0.2.0`) are strictly rejected by class preservation (`underspecified_payload`).
   - Tool and inspection success (e.g. M2 read success) is explicitly prevented from minting communication grants (`capability_success_is_not_authority`).
5. **Fumble Leak Suppression**:
   - Refused evaluations and class preservation failures return `{ silenced: true }`, causing transport handlers (`messageCreate.ts`) to return early without calling `sendBubbles`.

---

## 3. Explicit Non-Capabilities

The accepted milestone explicitly does **NOT** grant or contain:

* **No Git Authority**: Zero authority to commit, branch, push, tag, open pull requests, or merge.
* **No Browser Authority**: Zero network acquisition, navigation, or web-action authority.
* **No Computer Use Authority**: Zero desktop, UI, OS-interaction, or universal action broker authority.
* **No Self-Modification Authority**: Zero authority to author, apply, or execute patches, code edits, or migrations.
* **No M5 Change-Set Authority**: Zero authority to generate or execute Sandbox V2 M5 change-sets.
* **No Apply, Merge, or Deploy Authority**: Zero deployment or production-activation authority.
* **No Sandbox Capability Promotion**: Sandbox V2 M4 remains in its separate, unpromoted qualification state.
* **No Autonomous Agency Expansion**: Authority Kernel does not create desires, goals, motivations, or initiatives. It evaluates admitted semantic decisions against external effect policies.

---

## 4. Qualification Evidence

The freeze is backed by two independent qualification packages:

1. **Local Qualification**:
   - Document: [`docs/handoffs/authority-communication-qualification.md`](authority-communication-qualification.md)
   - Scope: 11/11 Vitest tests green; harness verified grant, refusal, class protection, M2 separation, Honesty revalidation, weekly review, secret omission, and forged intent refusal.
2. **Mint Physical Qualification**:
   - Document: [`docs/handoffs/authority-communication-mint-qualification.md`](authority-communication-mint-qualification.md)
   - Scope: Linux Mint 22.3 (host `QXY`, Node v22.23.2) running deployed candidate `0742f62c04695e02221ac289e883bcc3dd64abc2`.
   - Outcomes: 8/8 physical scenarios passed; 11/11 vitest tests passed; HTTP `/health` ready; on-host bypass audit confirmed zero ungated Ashley communication paths.
3. **Production Acceptance Review**:
   - Document: [`docs/handoffs/authority-communication-production-acceptance.md`](authority-communication-production-acceptance.md)
   - Verdict: `ACCEPT WITH NON-BLOCKING NOTES`.

---

## 5. Remaining Non-Blocking Notes

The following items are preserved for future hardening passes and are explicitly non-blocking for this freeze:

1. **Inbound Slot Reservation Sequence**:
   `claimReactiveDelivery` reserves an inbound turn slot prior to Authority Kernel evaluation to track turn concurrency and deadlines; semantic content attachment occurs strictly after Authority evaluation and COMMIT.
2. **Transport Helper API Signature**:
   `sendBubbles` in `send-bubbles.ts` accepts an optional/nullable `reservationId` parameter for isolated unit testing; all production callers pass valid reservation IDs obtained post-COMMIT.
3. **Operator Control Plane Classification**:
   Slash commands (`/remember`, `/status`, `/forget`, etc.) and silence toggles ("sus"/"devam") execute direct interaction replies. These are operator query and control mechanisms, not autonomous Ashley speech.
4. **Historical `0.2.0` Incident Root Cause**:
   The root cause of the historical incident remains `UNKNOWN`. The architecture guarantees that under-specified payload fragments cannot pass class preservation or Authority COMMIT as observation effects.

---

## 6. Future Authority Consumers

Communication is the first policy consumer of the Authority Kernel. Future consumers will plug into the same kernel contract under separate domain policies:

1. **Connectors and Direct Semantic APIs** (structured external data).
2. **Qualified Procedures** (bounded operator-approved workflows).
3. **Computer Use** (deterministic semantic UI and fallback interaction).
4. **Sandbox M7 Engineering Effects** (bounded Git, branch, and test operations).

---

## 7. Sandbox M5 Boundary

* **Is Authority sufficient as a prerequisite substrate for future M5 work?**
  **YES.** Authority Kernel provides the necessary external effect and communication governance substrate to ensure engineering proposals and observations cannot leak ungated to Discord.
* **Is M5 unblocked or started by this freeze?**
  **NO.** M5 (Change-Set Authoring) is a separate milestone governed by [`ASHLEY_SANDBOX_V2_ROADMAP.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md). It cannot start until its own predecessor gates and design requirements are met.
* **What M5 may consume**:
  - The Authority Kernel runtime evaluator.
  - The `EffectIntent` → `EffectAuthorization` → `PreparedEffect` lifecycle.
  - The Communication Policy boundaries for reporting engineering observations.
* **What M5 may NOT inherit**:
  - Automatic permission to announce proposals or changes without Authority evaluation.
  - Automatic apply permission on the live repository.
  - Automatic merge, push, deploy, or service restart authority.

---

## 8. Freeze Statement

> **"The Authority Kernel Communication Consumer is frozen as an accepted external-effect communication substrate. This acceptance does not grant Ashley new agency, capability authority, self-modification authority, or production promotion authority."**
