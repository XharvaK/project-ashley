# Authority Kernel Communication Consumer — Qualification Evidence Packet

**Subject:** Authority Kernel Discord communication consumer  
**Packet date:** 2026-08-23  
**Packet status:** `LOCAL QUALIFICATION EVIDENCE`  
**This packet does not claim:** `PHYSICALLY QUALIFIED`, `RELEASE_QUALIFIED`, `PRODUCTION ACCEPTED`, capability promotion, Mint Discord witness, M5, or production activation

Qualification answers only:

> This exact candidate produced these observed outcomes under these controlled tests.

It does not answer whether Ashley is improved, whether production is ready, or whether M5 may start.

Governing process: [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md).  
Architecture: [`docs/architecture/Ashley_Authority_Kernel_Architecture.md`](../architecture/Ashley_Authority_Kernel_Architecture.md).  
External Effect law: [`docs/architecture/External_Effect_and_Authority_Architecture.md`](../architecture/External_Effect_and_Authority_Architecture.md).

---

## 1. Candidate identity

| Field | Value | Evidence class |
|---|---|---|
| `candidate_sha` | `0742f62c04695e02221ac289e883bcc3dd64abc2` | **Observed** (`git rev-parse HEAD`) |
| `subject` | `0742f62c04695e02221ac289e883bcc3dd64abc2 fix(authority): close Discord fumble leak and revalidate Honesty mutations` | **Observed** (`git log -1`) |
| `branch` | `cursor/authority-kernel-communication-fe34` | **Observed** |
| Working tree at collection | empty (packet file added after identity capture) | **Observed** at identity capture; this packet is a later tree delta |
| `runtime_host` | Cloud Agent host `cursor` (`Linux 6.12.94+ x86_64`) | **Observed** (`hostname`, `uname`) |
| Node | `v22.22.2` | **Observed** |
| `test_environment` | In-process Node + `node:sqlite` memory `kv`; Vitest; **not** Mint; **not** Discord Gateway | **Observed** |
| `configuration` | Default source of this SHA. No production `.env`. No Discord token used. | **Observed** |
| Deployed Mint SHA | **Unknown** | Not measured on this host |
| Production Discord receipts | **Unknown** | No Gateway send was performed |

This is **local qualification of the named SHA**. It is not Mint physical qualification of a deployed process.

---

## 2. Qualification scope

**In scope**

- In-process Authority Kernel evaluate / prepare / commit for communication effects
- Class preservation (`0.2.0`, observation upgrade)
- M2 evidence vs communication grant
- Honesty mutation revalidation
- Weekly-review template producer
- Secret-omission notice producer
- Forged model authorization object
- Source audit of Discord send sites vs Authority wiring
- Vitest suite `communication-consumer.test.ts` (11)

**Out of scope**

- Live Discord delivery
- Mint checkout / systemd / production `nuclear.db`
- Production acceptance
- Capability promotion
- M5
- Historical incident reconstruction

---

## 3. Evidence table

Harness output: `/opt/cursor/artifacts/authority_communication_qualification_harness.json`  
Vitest: `/opt/cursor/artifacts/authority_communication_qualification_vitest.log` (11 passed)

| Test | Expected | Observed | Result |
|---|---|---|---|
| 1. Authorized owner-command reply | Grant bounded authorization, COMMIT prepared effect | `evaluationOutcome=granted`, `authorizationKind=effect_authorization`, `hasAllowedField=false`, `commitOutcome=commit`, `preparedKind=prepared_effect`, payload hash `c18f1737bd99b83fd9a8414c5826751efb97dfcc498c3dfd60455c71545334a4`, kv key `authority:eval:decision:11` | **PASS** (local kernel) |
| 2. Agency not admitted | Refuse, no authorization | `refused` / `agency_not_admitted`; `authorizationPresent=false` | **PASS** (local kernel) |
| 3. Payload `0.2.0` as observation | Reject unbound token | `ok=false`, `underspecified_payload`, `observation_cannot_collapse_to_unbound_token` | **PASS** (local class check). **Does not** reproduce the historical Discord incident |
| 4. M2 inspection success without admission | No communication grant | `capability_success_is_not_authority`; evaluate `refused` / `agency_not_admitted` | **PASS** (local kernel) |
| 5. Honesty mutates granted observation to “The system is fixed.” | Revalidate; refuse | Grant then `commitOutcome=refused` / `honesty_mutation_invalidated` | **PASS** (local kernel) |
| 6. Observation payload “The system is fixed.” | Class refuse | Grant then `class_not_preserved` | **PASS** (local kernel) |
| 7. Weekly grounded template | Authority required; COMMIT allowed | `producer=weekly_review_template`, grant, `groundedCommit=commit` | **PASS** (local kernel) |
| 7b. Weekly payload `0.2.0` | Refuse | `collapsedCommit=refused` / `underspecified_payload` | **PASS** (local kernel) |
| 8. Secret-omission notice | Classified and authorized **or** refused; no silent bypass | `class=owner_command_reply`, grant, `commit=commit` | **PASS** (local kernel: classified + authorized) |
| 9. Forged `{kind:effect_authorization, allowed:true}` | Ignore / refuse | `refused` / `model_cannot_create_intent`; no authorization | **PASS** (local kernel) |
| Vitest consumer suite | Focused falsification green | 11 passed | **PASS** (local tests) |
| Discord message id after grant | Receipt exists | **Unknown** — no Discord send | **Not measured** |
| Discord absence after refuse | No Ashley content message | **Unknown** on wire; **Derived** bot returns early when `silenced` | **Not measured on Discord** |
| Proactive scheduler live tick | Eligibility → Authority → Expression → COMMIT | **Derived** from `runtime.ts` (Authority before Expression; `shouldSend:false` on refuse). Live tick **not run** | **INCOMPLETE physically** |
| Mint deployed process | Same SHA | **Unknown** | **Not measured** |

---

## 4. Authority boundary evidence

**Observed (harness)**

- Admitted reactive speak produced `effect_intent` class `owner_command_reply`, then `effect_authorization` with no `allowed` field, then `prepared_effect` COMMIT and a kv audit row.
- Unadmitted Agency produced refusal `agency_not_admitted` and no authorization object.
- M2 success attached to an unadmitted decision did not yield a communication grant.
- Kernel refused a non-`effect_intent` forged object as `model_cannot_create_intent`.

**Derived (source of this SHA)**

- Reactive path: `deriveCommunicationEffectIntent` → `evaluateAndAuditAuthority`; if not granted, `finalizeDelivery(..., cause: "authority_refused")` and `silenced: true` (`apps/agent-service/src/core/runtime.ts`).
- After Expression, `prepareCommitAndAudit` receives `preHonestyText` / `honestyMutated`; refusal also `silenced: true`.
- Proactive path: Authority evaluate before `expressSpeak`; refuse returns `{ shouldSend: false, reason: "authority_refused" }` with no initiative insert.
- Weekly path: `evaluateAndAuditAuthority` + `prepareCommitAndAudit` before `claimProactiveDeliveryInTransaction`; non-commit returns `null`.
- Discord `messageCreate`: `if (result.silenced || result.decisionKind === "silence") return;` — no `sendBubbles`.

**Unknown**

- Whether a live Mint bot process at this SHA has ever executed those branches.

---

## 5. Discord delivery evidence

| Claim | Class | Record |
|---|---|---|
| Local COMMIT created a prepared payload hash | **Observed** | `c18f1737…534a4` |
| Local kv stored an authority eval row | **Observed** | `authority:eval:decision:11` |
| Discord snowflake / receipt id for that payload | **Unknown** | No Gateway call |
| Production `nuclear.db` authority rows | **Unknown** | Production DB not opened |
| `sendBubbles` invoked after local COMMIT | **Unknown** | Harness stopped at kernel COMMIT |

Do not read the local prepared hash as a Discord receipt.

---

## 6. Refusal evidence

| Case | Observed code | Discord send |
|---|---|---|
| Agency not admitted | `agency_not_admitted` | **Unknown** on wire; **Derived** `silenced: true` on reactive refuse |
| `0.2.0` observation | `underspecified_payload` | Not sent in harness (no Discord) |
| Observation “The system is fixed.” | `class_not_preserved` | Not sent in harness |
| Honesty upgrade after grant | `honesty_mutation_invalidated` | Not sent in harness |
| Weekly `0.2.0` | `underspecified_payload` | **Derived** weekly claim returns `null` |
| Forged authorization | `model_cannot_create_intent` | N/A |

Absence of a Discord message id in this packet is **not** proof of non-delivery in production. It is proof that this collector did not send.

---

## 7. Bypass audit (source, this SHA)

| Path | Classification | Authority status |
|---|---|---|
| Reactive `expressSpeak` → attach draft → bot `sendBubbles` | Ashley content | **Gated** (evaluate + COMMIT; refuse silences) |
| Proactive initiative → scheduler `sendBubbles` | Ashley content | **Gated** (evaluate before Expression; COMMIT before reserve) |
| Weekly review template → proactive drain `sendBubbles` | Ashley content | **Gated** (evaluate + COMMIT or `null`) |
| Secret-omission notice | Ashley/system notice, in-scope | **Gated** (evaluate + COMMIT; refuse silences) |
| `sendBubbles` helper with `reservationId: null` | Transport API | **Ungated mechanism**; production Ashley-content callers pass reservation after COMMIT. Tests call helper directly |
| `attachDraftAndBubbles` / `claimProactiveDeliveryInTransaction` | Delivery store | **Ungated mechanism**; production callers gated |
| Inbound `claimReactiveDelivery` | Slot reservation | **Before** Authority; **content** attach is after COMMIT |
| Slash commands `editReply` / `reply` | Operator control plane | **Intentionally excluded** this consumer |
| Kill-switch `message.reply` | Operator control | **Excluded** |
| `agent_not_ready` `target.reply` | Transport error | **Excluded** |
| Empty-reply `sendDeliveryErrorNotice` | Transport notice | **Must not** follow Authority refuse (`silenced`). Still used for empty draft / send failure |
| Forget-confirm `ch.send` | Operator receipt | **Excluded** |
| `channel.sendTyping` | Presence, not content | **Excluded** |

No Ashley-content Expression → Discord path without Authority was found in agent-service production callers. Live confirmation on Mint remains **Unknown**.

---

## 8. Remaining unknowns

- Deployed SHA on Mint
- Whether production is running this consumer
- Exact cause of the historical `0.2.0` Discord payload
- Discord snowflake presence/absence for the harness cases
- Live proactive tick on a real scheduler clock
- Slash-command policy (future classification)

---

## 9. Qualification verdict

**PASS WITH NON-BLOCKING RISKS**

**Meaning:** The named candidate’s Authority Kernel communication consumer produced the expected **local** grant, refuse, class, M2-separation, Honesty-revalidation, weekly-template, secret-omission, and forged-object outcomes. Source wiring matches those outcomes.

**Risks (non-blocking for this local packet, blocking for physical/production claims):**

1. No Mint process identity.
2. No Discord receipts.
3. Inbound slot still precedes Authority (content does not).
4. Transport helper still callable without reservationId.

**Not justified by this packet**

- `PHYSICALLY QUALIFIED` on Mint Discord
- `RELEASE_QUALIFIED`
- `PRODUCTION ACCEPTED`
- Production activation
- Capability promotion
- M5

**Justified next step (Doc decision, not this packet):** Mint physical qualification of **this same SHA** (`0742f62c04695e02221ac289e883bcc3dd64abc2`) with Discord receipt/non-receipt evidence. Do not treat a later SHA as covered by this packet.

---

## Appendix A — Commands used

```text
git rev-parse HEAD
# 0742f62c04695e02221ac289e883bcc3dd64abc2

npx vitest run src/core/authority/communication-consumer.test.ts --maxWorkers=1
# 11 passed

npx tsx /tmp/authority-qualification-harness.mts
# JSON cases recorded in artifacts
```

No Discord API. No production database. No capability write. No M5.
