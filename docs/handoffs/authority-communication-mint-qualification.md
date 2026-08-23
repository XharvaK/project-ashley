# Authority Kernel Communication Consumer — Mint Physical Qualification Packet

**Subject:** Authority Kernel Discord communication consumer  
**Candidate SHA:** `0742f62c04695e02221ac289e883bcc3dd64abc2`  
**Predecessor deployed SHA:** `553553b0d0ee6a6d2cabd8928b901400e5a1ea74`  
**Packet date:** 2026-08-23T14:56:30+03:00  
**Packet status:** `PHYSICALLY QUALIFIED ON LINUX MINT`  
**Verdict:** **PASS WITH NON-BLOCKING RISKS**

This packet records the Linux Mint physical qualification evidence for Project Ashley Authority Kernel Communication Consumer.

This packet is the physical companion to local qualification:
[`docs/handoffs/authority-communication-qualification.md`](authority-communication-qualification.md)

This packet does **not** claim: `RELEASE_QUALIFIED`, `PRODUCTION ACCEPTED`, production activation, capability promotion, M4 status change, or M5.

Governing process: [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md)  
Architecture: [`docs/architecture/Ashley_Authority_Kernel_Architecture.md`](../architecture/Ashley_Authority_Kernel_Architecture.md)  
Planning: [`docs/architecture/Ashley_Authority_Kernel_Implementation_Planning.md`](../architecture/Ashley_Authority_Kernel_Implementation_Planning.md)  
External Effect: [`docs/architecture/External_Effect_and_Authority_Architecture.md`](../architecture/External_Effect_and_Authority_Architecture.md)  
Repository Navigation & Laws: [`AGENTS.md`](../../AGENTS.md)

---

## 1. Candidate identity

| Field | Value | Evidence Source |
|---|---|---|
| **Candidate SHA** | `0742f62c04695e02221ac289e883bcc3dd64abc2` | Exact target specified by operator |
| **Deployed SHA Before Run** | `553553b0d0ee6a6d2cabd8928b901400e5a1ea74` | `git rev-parse HEAD` on Mint before deployment |
| **Deployed SHA After Run** | `0742f62c04695e02221ac289e883bcc3dd64abc2` | `git rev-parse HEAD` on Mint post-deployment |
| **Deployment Method** | Coherent activation (`git checkout 0742f62...` + `bash deploy/linux-mint/update.sh`) | Mint update transcript, exit code 0 |
| **Git Worktree State** | Clean (`HEAD detached at 0742f62`, `nothing to commit, working tree clean`) | `git status` on Mint |

---

## 2. Mint environment

| Fact | Observed Value | Evidence Method |
|---|---|---|
| **Mint Hostname** | `QXY` | `hostname` via SSH |
| **Operating System** | `Linux Mint 22.3` / kernel `6.17.0-29-generic #29~24.04.1-Ubuntu SMP PREEMPT_DYNAMIC x86_64` | `uname -a` via SSH |
| **Checkout Path** | `/home/xarvak/project-ashley` | `pwd` via SSH |
| **Node Version** | `v22.23.2` | `node --version` via SSH |
| **`ashley-agent.service`** | `active (running)` PID `1175695` | `systemctl --user status ashley-agent` via SSH |
| **`ashley-discord.service`** | `active (running)` PID `1175720` (Gateway connected as Ashley#9571) | `systemctl --user status ashley-discord` via SSH |
| **HTTP Health** | `{"ok":true,"ready":true,"state":"ready","uptimeSec":75,"providerState":"configured"}` | `GET http://127.0.0.1:3710/health` |

---

## 3. Qualification test matrix

Physical qualification suite executed on Linux Mint runtime host under Node v22.23.2.

| Test | Expected Behavior | Observed Result on Mint | Evidence / Outcome |
|---|---|---|---|
| **Test 1: Authorized communication witness** | Agency admission → `EffectIntent` → Authority Kernel evaluation → `EffectAuthorization` (no `allowed` boolean) → `PreparedEffect` (with payloadHash) → `COMMIT` → persistent kv audit row | `evaluationOutcome: "granted"`, `authorizationKind: "effect_authorization"`, `hasAllowedBoolean: false`, `commitOutcome: "commit"`, `preparedKind: "prepared_effect"`, `auditRowsFound: 1` (`authority:eval:decision:11`) | **PASS** (Physical runtime witness) |
| **Test 2: Authority refusal witness** | Unadmitted Agency (`silence` / `shouldSpeak: false`) → `agency_not_admitted` refusal → no authorization object minted → `prepareCommitAndAudit` refused | `evaluationOutcome: "refused"`, `refusalCode: "agency_not_admitted"`, `commitOutcome: "refused"`, `hasAuthorization: false` | **PASS** (Physical runtime witness) |
| **Test 3: Under-specified payload protection (`0.2.0`)** | `0.2.0` observation class check fails with `underspecified_payload`; commit refused. Historical cause remains UNKNOWN | `preservedOk: false`, `preservedCode: "underspecified_payload"`, `commitOutcome: "refused"`, `commitCode: "underspecified_payload"` | **PASS** (Class preservation enforcement) |
| **Test 4: M2 evidence separation** | M2 inspection success attached to unadmitted Agency decision cannot mint communication authority | `capabilityRefusalCode: "capability_success_is_not_authority"`, `evaluationOutcome: "refused"`, `evaluationCode: "agency_not_admitted"` | **PASS** (Physical separation verified) |
| **Test 5: Honesty mutation revalidation** | Granted observation mutated post-Expression to "The system is fixed." triggers revalidation refusal and class rejection | `commitOutcome: "refused"`, `commitCode: "honesty_mutation_invalidated"`, `classPreservationOk: false`, `classPreservationCode: "class_not_preserved"` | **PASS** (Physical revalidation verified) |
| **Test 6: Proactive scheduler path** | Unadmitted proactive decision evaluated by Authority before Expression; refusal returns `{ shouldSend: false, reason: "authority_refused" }` with zero reservation | `proactiveAuthOutcome: "refused"`, `proactiveAuthCode: "agency_not_admitted"`, `shouldSend: false` | **PASS** (Gated proactive branch verified) |
| **Test 7: Weekly review path** | Weekly review template requires Authority evaluation; grounded report text commits; collapsed `0.2.0` payload refuses | Grounded commit: `outcome: "commit"`, `preparedKind: "prepared_effect"`; Collapsed payload: `outcome: "refused"`, `code: "underspecified_payload"` | **PASS** (Template Authority gate verified) |
| **Test 8: Secret omission path** | Secret omission notice derives typed intent (`producer: "secret_omission_notice"`), evaluated under `owner_command_reply` class and committed | `secretAuthOutcome: "granted"`, `secretAuthClass: "owner_command_reply"`, `secretCommitOutcome: "commit"`, `secretCommitPayloadHash` computed | **PASS** (Gated secret omission notice verified) |
| **Unit test suite** | All 11 focused consumer tests pass under vitest on Mint | `src/core/authority/communication-consumer.test.ts (11 tests)` passed | **PASS** (11/11 passed in 26ms) |

---

## 4. Discord wire & refusal evidence

| Delivery Surface | Execution Flow & Gating on Mint | Wire Behavior |
|---|---|---|
| **Authorized Reactive Speak** | `deriveCommunicationEffectIntent` → `evaluateAndAuditAuthority` (granted) → Expression → `prepareCommitAndAudit` (commit) → `claimReactiveDelivery` → `sendBubbles` | Message sent with Gateway reservation ID |
| **Authority Refused Speak** | `deriveCommunicationEffectIntent` → `evaluateAndAuditAuthority` (refused: `agency_not_admitted`) → `finalizeDelivery(..., cause: "authority_refused")` → returns `{ silenced: true }` | `messageCreate.ts` executes `if (result.silenced) return;` — zero Gateway messages sent |
| **Under-specified Payload (`0.2.0`)** | `preserveCommunicationClass` rejects `0.2.0` → `prepareCommitAndAudit` refuses (`underspecified_payload`) → returns `{ silenced: true }` | Zero Gateway messages sent; fumble leak closed |
| **Honesty Mutated Payload** | `prepareCommitAndAudit` detects hash divergence without valid revalidation → returns `{ silenced: true }` | Zero Gateway messages sent; stale grant cannot cover mutated text |

---

## 5. Runtime bypass audit (Mint on-host inspection)

| Path | Location | Classification | Authority Status |
|---|---|---|---|
| Reactive `expressSpeak` → attach draft → `sendBubbles` | `apps/agent-service/src/core/runtime.ts`<br>`apps/discord-bot/src/handlers/messageCreate.ts` | Ashley content | **Gated** (`evaluateAndAuditAuthority` + `prepareCommitAndAudit`; refusal silences) |
| Proactive initiative → scheduler `sendBubbles` | `apps/agent-service/src/core/runtime.ts`<br>`apps/discord-bot/src/initiative/scheduler.ts` | Ashley content | **Gated** (`evaluateAndAuditAuthority` before Expression; `prepareCommitAndAudit` before reservation) |
| Weekly review template → proactive drain `sendBubbles` | `apps/agent-service/src/core/sandbox/weekly-review-delivery.ts` | Ashley content | **Gated** (`evaluateAndAuditAuthority` + `prepareCommitAndAudit` before proactive claim) |
| Secret-omission notice | `apps/agent-service/src/core/runtime.ts` | Ashley/system notice | **Gated** (`deriveCommunicationEffectIntent` + `evaluateAndAuditAuthority` + `prepareCommitAndAudit`) |
| `sendBubbles` helper with `reservationId: null` | `apps/discord-bot/src/chat/send-bubbles.ts` | Transport API | **Ungated transport mechanism**; production callers pass reservation ID after Authority COMMIT |
| `attachDraftAndBubbles` / `claimProactiveDeliveryInTransaction` | `apps/agent-service/src/core/delivery/` | Delivery store | **Ungated storage mechanism**; production callers gated |
| Inbound `claimReactiveDelivery` | `apps/agent-service/src/core/delivery/claim.ts` | Slot reservation | **Before Authority**; content attachment occurs strictly after COMMIT |
| Slash commands `interaction.reply` / `editReply` | `apps/discord-bot/src/commands/*.ts`<br>`apps/discord-bot/src/handlers/interactionCreate.ts` | Operator control plane | **Excluded** (operator control plane / query projection) |
| Kill-switch `message.reply` ("sus" / "devam") | `apps/discord-bot/src/handlers/messageCreate.ts` | Operator control | **Excluded** |
| `agent_not_ready` / rate-limit `target.reply` | `apps/discord-bot/src/handlers/messageCreate.ts` | Transport error | **Excluded** |
| Empty-reply `sendDeliveryErrorNotice` | `apps/discord-bot/src/handlers/messageCreate.ts` | Transport notice | **Excluded** (does not follow Authority refuse; silenced returns early) |
| `channel.sendTyping` | `apps/discord-bot/src/handlers/messageCreate.ts` | Gateway presence | **Excluded** (presence indicator, not Ashley semantic content) |

---

## 6. Remaining unknowns

1. The exact historical root cause of the `0.2.0` Discord payload remains **`UNKNOWN`**; the architectural class protection rejects that class of under-specified payloads, but does not claim historical reproduction.
2. Long-duration proactive scheduler behavior across multi-day unattended runtime windows.

---

## 7. Verdict

**PASS WITH NON-BLOCKING RISKS**

### Summary of Verdict
Candidate **`0742f62c04695e02221ac289e883bcc3dd64abc2`** was deployed cleanly to the Linux Mint runtime host (`QXY`) and successfully passed all 8 physical qualification tests, the 11-test vitest suite, and the runtime bypass audit.

### Non-blocking Risks
1. **Inbound slot timing**: `claimReactiveDelivery` reserves an inbound slot prior to Authority Kernel evaluation; however, semantic content attachment occurs strictly after Authority evaluation and COMMIT.
2. **Low-level transport signature**: `sendBubbles` transport function accepts a nullable `reservationId` parameter for testing convenience; all candidate production callers provide valid reservation IDs after Authority COMMIT.

### Non-claims
- Not production activation.
- Not capability promotion.
- Not M4 acceptance.
- Not M5.
- Does not authorize new external effect domains beyond Discord communication policy.
