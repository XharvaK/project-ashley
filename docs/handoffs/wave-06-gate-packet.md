# Wave 06 Gate Packet

**Wave:** 06 — Perception (v15 / contract v3)
**Type:** Implementation verification
**Status:** **Wave_accepted** — Doc sign-off recorded 2026-08-04; not **Release_qualified**
**Not authorized:** **Release_qualified**, **Deployed**, Mint deployment, live Mistral/Discord validation, `apply`, commit, push, or production migration

---

## Git state

| Field | Value |
|-------|-------|
| SHA (base) | `6507cb08822b0a1dc075cf567790f20b7176d1c3` |
| Worktree | Dirty — uncommitted Wave 04–09 implementation and design docs |
| Branch | (detached or feature worktree; not committed as part of this packet) |
| `VISION.md` diff | None (`git diff -- VISION.md` empty) |

Verification ran against the dirty worktree containing Wave 06 implementation files.

---

## Command transcript

| Command | Exit code | Result |
|---------|-----------|--------|
| `npm test` | 0 | **PASS** — 43 files, 202 tests |
| `npm run build --prefix apps/agent-service` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/discord-bot` | 0 | **PASS** — 71 tests |
| `npm run build --prefix apps/discord-bot` | 0 | **PASS** — `tsc` clean |
| `npm run phase0:offline` | 0 | **PASS** — "OK offline tier" |
| `git diff --check` | 0 | **PASS** — no conflict markers or whitespace errors (CRLF normalization warnings only) |
| `git diff -- VISION.md` | 0 | **PASS** — no diff |

**Skipped checks:** None.

**Scrubbed output summary:**

- Agent tests: 202 passed, 0 failed (8.71s)
- Discord tests: 71 passed, 0 failed (2.4s)
- phase0:offline re-ran agent test suite; OK offline tier
- No secrets or credentials in command output

---

## Evidence matrix

Paths verified to exist at packet creation.

| Claim | Evidence source |
|-------|-----------------|
| v15 migration + continuity sidecar protocol | [`wave06-migration.test.ts`](../../apps/agent-service/src/core/continuity/wave06-migration.test.ts), [`db.test.ts`](../../apps/agent-service/src/core/db.test.ts) |
| Contract v3 lineage; v3 caps default `observe` | [`wave06-migration.test.ts`](../../apps/agent-service/src/core/continuity/wave06-migration.test.ts), [`capabilities.test.ts`](../../apps/agent-service/src/core/rollout/capabilities.test.ts) |
| Perception turn / research intent / inline image | [`wave06-migration.test.ts`](../../apps/agent-service/src/core/continuity/wave06-migration.test.ts) (`usableFetchMs`, `classifyResearchIntent`, `buildInlineDataUri`); [`perception/`](../../apps/agent-service/src/core/perception/), [`runtime.ts`](../../apps/agent-service/src/core/runtime.ts) |
| Attachment intake (Discord) | [`attachments.ts`](../../apps/discord-bot/src/chat/attachments.ts), [`attachments.test.ts`](../../apps/discord-bot/src/chat/attachments.test.ts) (verified present) |
| 6s Thought cutoff / 10s delivery ceiling | [`turn-budget.ts`](../../apps/agent-service/src/core/perception/turn-budget.ts), [`env.ts`](../../apps/agent-service/src/env.ts) (`thoughtExpressionGuardMs` default 4000), [`delivery/types.ts`](../../apps/agent-service/src/core/delivery/types.ts) (`HARD_FIRST_BUBBLE_MS = 10_000`), [`messageCreate.ts`](../../apps/discord-bot/src/handlers/messageCreate.ts) |
| 25k TPM conservative accounting | [`env.ts`](../../apps/agent-service/src/env.ts) (`mistralTokensPerMinute` default 25_000); [`estimate.ts`](../../apps/agent-service/src/core/attention/estimate.ts), [`ledger.ts`](../../apps/agent-service/src/core/attention/ledger.ts), [`governor.ts`](../../apps/agent-service/src/core/attention/governor.ts), [`estimate.test.ts`](../../apps/agent-service/src/core/attention/estimate.test.ts), [`attention.test.ts`](../../apps/agent-service/src/core/attention/attention.test.ts) |
| Provenance, forget, privacy, honesty | [`perception/forget.ts`](../../apps/agent-service/src/core/perception/forget.ts), [`privacy/`](../../apps/agent-service/src/core/privacy/), [`honesty/finalize.test.ts`](../../apps/agent-service/src/core/honesty/finalize.test.ts) |
| Agent + Discord builds | `npm run build --prefix apps/agent-service`, `npm run build --prefix apps/discord-bot` (both exit 0) |

**Not cited:** `research-intent.test.ts` (does not exist; coverage in `wave06-migration.test.ts`). [`mistral-limiter.ts`](../../apps/agent-service/src/mistral-limiter.ts) is **retired** (`@deprecated`; throws on use).

---

## Guarantees (locally verified)

- Fresh DB migrates to nuclear schema v15 with continuity sidecar sync.
- Capability contract v3 activates; legacy v2 row preserved inactive; v3 capabilities (`vision`, `attachment_text`, `conversational_read`, `web_search`) seed as `observe`.
- `perception_artifacts` and `conversational_reads` tables exist; registered in targetable forget registry.
- Perception fetch budget bounded by thought deadline minus dispatch safety (default 300ms).
- Research intent requires explicit conversational read phrasing (not bare URLs).
- Inline image payloads use `data:image/...;base64` format.
- Discord attachment intake produces structured refs; tests cover limits and MIME handling.
- Thought deadline = first-bubble deadline minus `thoughtExpressionGuardMs` (default 4s guard on 10s ceiling → ~6s Thought window).
- Attention governor uses durable ledger with 25k TPM default; estimate and admission tests pass.
- Agent-service and discord-bot TypeScript builds compile cleanly.
- Offline phase0 tier passes (202 agent tests).
- No `VISION.md` modifications in worktree.

## Non-guarantees

- **Release_qualified** — not claimed; no Mint/live validation performed.
- **Deployed** — not authorized.
- Live Mistral tokenizer accuracy vs conservative TPM estimates.
- Production quota headroom under real Discord load.
- Capability promotion beyond `observe` (requires separate rollout gates).
- End-to-end vision/page-read behavior against live Mistral API (offline verification only).
- Dirty worktree not committed; SHA above is pre-packet base, not a release tag.

## Open risks / follow-ups

- Worktree is large and uncommitted; acceptance should reference a future commit SHA once Doc requests one.
- CRLF normalization warnings on `git diff --check` (Windows); no content errors detected.
- Live shadow events and three-seed evaluation not run as part of this packet.
- Wave 07b/08b/09b remain blocked until respective verification and Doc sign-off; Wave 07 **Design_accepted** and Wave 06 **Wave_accepted** are recorded; Wave 07b is the next implementation gate.

---

## Sign-off

- Doc sign-off phrase: **"Accept Wave 06"**
- Signed by: Doc
- Date: **2026-08-04**
- Accepted verification SHA: `6507cb08822b0a1dc075cf567790f20b7176d1c3`
- Result: Wave 06 is **Wave_accepted**, not **Release_qualified**.
- This sign-off does not authorize Mint deployment, live Mistral/Discord validation, `apply`, commit, push, or production migration.
