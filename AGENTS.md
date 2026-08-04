# Project Ashley

Discord companion with nuclear Identity → State → Agency architecture, local SQLite (`nuclear.db`), and Mistral API. Production Discord host is **Linux Mint only**.

## Governing authority

Read [`VISION.md`](VISION.md) before the Core Principles or Constitution. The
Vision explains why Ashley exists. The Core Principles are the highest
constitutional constraints beneath it, and lower documents and implementations
derive authority through that chain. The Vision is not a runtime prompt.

After the Constitution, read the peer specialized governance documents
[`docs/Ashley_Stewardship_Compact.md`](docs/Ashley_Stewardship_Compact.md) and
[`docs/Ashley_Ethics.md`](docs/Ashley_Ethics.md), then
[`docs/Ashley_Hierarchy.md`](docs/Ashley_Hierarchy.md). They clarify
operational and ethical constraints; they do not override higher authority.

OS-boundary execution design (design only, not deployed): [`docs/Sandbox_Design.md`](docs/Sandbox_Design.md).
Self-inspection and change-proposal design (design only): [`docs/Self_Modification_Design.md`](docs/Self_Modification_Design.md).
External account and action-broker design (design only): [`docs/External_Agency_Design.md`](docs/External_Agency_Design.md).
Wave 10 stabilization and assurance design plus accepted local 10c assurance:
[`docs/Stabilization_Design.md`](docs/Stabilization_Design.md).
Wave acceptance ladder and gate packets: [`docs/Wave_Acceptance_Protocol.md`](docs/Wave_Acceptance_Protocol.md).

## Quick start

```powershell
# ~/.composer-assistant/.env — see config/env.example
cd C:\Users\Xharv\Projects\project-ashley

npm run start:ashley   # SSH to Mint: git pull + rebuild + restart systemd
npm run stop:ashley    # stops accidental Windows pids only
npm run dev:agent      # agent only (no Discord gateway)
npm run dev:discord    # agent + discord bot (conflicts with Mint)
```

## Services

| Service | Port | Path |
|---------|------|------|
| agent-service | 3710 | `apps/agent-service/` |
| discord-bot | gateway | `apps/discord-bot/` |

## Data

| Path | Purpose |
|------|---------|
| `~/.composer-assistant/.env` | Secrets and config |
| `~/.composer-assistant/conversations/nuclear.db` | Nuclear Identity/State/Agency SQLite |
| `~/.composer-assistant/continuity.db` | Authoritative continuity sidecar (lineage, forget, sessions) |
| `workspace/prompts/nuclear/` | Thin nuclear identity prompts |

Legacy `index.db` is archival for chat memory (nuclear does not read it). ConversationLogger may still append audit session rows there.

## Architecture

```
Discord DM → POST /chat/text → AshleyCore (Identity → State → Agency → Conversation)
Proactive tick → Agency.decide → draft → reserve / send / commit
Curiosity feed → nuclear.db takes → Agency motivations
Committed proactive reaction → Reflection → bounded future Thought calibration
Completed exchange → cognitive job → grounded episode → Mind State / affect / bounded growth
Urgent grounded concern → immediate Agency evaluation → reserve / send / commit
```

Conceptual stack (Identity and Mind State are joint inputs to Thought — neither produces the other):

```
Identity (stable) ──┐
                    ├──→ Thought → Expression → Rendering
Mind State (dynamic)┘
```

| Layer | Owns |
|-------|------|
| Identity | Stable who she is (values, boundaries, tastes, opinions) |
| Mind State | Dynamic condition, active goals/concerns/commitments, and grounded digital affect |
| Thought | Effort allocation, evidence selection, prioritization, reasoning, completion, and authorization |
| Reflection | Post-outcome interpretation and bounded future Thought calibration; no current-turn authority |
| Expression | Intentional language (`workspace/prompts/nuclear/`) |
| Rendering | Platform mechanics only (typography, bubbles, pacing) |

### Architectural ownership

Every new behavior should be implemented at the lowest layer that naturally owns it.

When adding a behavior, ask these questions in order:

1. Is this part of Ashley's stable identity?
2. Is this part of her current mind state?
3. Is this a reasoning or effort-allocation decision?
4. Is this merely an expression choice?
5. Is this only a rendering concern?

Implement it at the first layer that answers yes.

Avoid solving problems in higher layers that naturally belong lower in the stack. Do not solve cognitive problems in Rendering. Do not solve rendering problems in Identity.

Continuous cognition is event-driven and defaults to `ASHLEY_COGNITION_MODE=observe`.
`apply` is only a master ceiling; per-capability release gates still control
influence. Schema v9 integrates each cognition job atomically, requires exact user-message
provenance for automatic facts, uses leased edge-triggered urgent wakes, adds
grounded refusal, and adds read-record provenance plus receipt-backed message
redaction. Schema v10 adds `own_time_sessions` for owner absence/return Mind State.
Schema v11 adds ledgered Discord delivery. Schema v12 adds durable attention
admission, model-continuity epochs, and capability contract lineage.
Schema v13 adds classification + immutable `entity_uuid` on targetable tables;
authoritative continuity lives in `~/.composer-assistant/continuity.db` (sidecar v1)
for forget previews/tombstones, lineage, sessions, and backup watermarks.
Schema v14 adds six relationship tables (`doc_reminders`, `ashley_self_commitments`,
`mutual_commitments`, `scheduled_proactive_messages`, `relational_tensions`,
`withdrawal_records`), `relationship_motivation_claims`, capability contract v2
(`relationship_state` defaults to `observe`), and typed hold/silence decision codes.
Schema v15 adds `perception_artifacts` and `conversational_reads`, capability
contract v3 (`vision`, `attachment_text`, `conversational_read`, `web_search` —
all default `observe`), Thought-deadline attachment fetch with inline base64
Mistral payloads only, and quote-aware perception honesty.
Relationship influence requires `relationship_state` apply plus relevant gates;
recording/query works in observe. Reminders surface as Agency motivations only
(never auto-sent).
Gated `own_time_report` (deps: thought, curiosity_consolidation) can share ≤3
grounded own-time takes on ask when active under master `apply`.

Curiosity follows `scan -> rank -> choose -> fetch -> extract -> record -> form
take -> consolidate -> motivate -> Thought`. Network retrieval is public
HTTP(S) only, redirect- and DNS-revalidated, bounded to five redirects, twenty
seconds, and two megabytes. Reading never sends directly.

Observability: `GET /health` (minimal public readiness),
`GET /nuclear/health?owner_id=` (owner-only metadata diagnostics),
`GET /nuclear/decisions?owner_id=`,
`GET /nuclear/reflections?owner_id=`, `GET /nuclear/episodes?owner_id=`,
`GET /nuclear/cognition?owner_id=`, `GET /nuclear/revisions?owner_id=`,
`GET /nuclear/continuity?owner_id=` (sidecar lineage/events),
`GET /nuclear/relationship?owner_id=`, `GET /nuclear/status?owner_id=`.
Capability rollout: `GET /nuclear/capabilities?owner_id=`.
Foundational identity review: `GET /nuclear/identity/reviews?owner_id=`.

Voice, Telegram, habits, Moltbook, and skills were retired — Discord only.

## Slash commands

| Command | Action |
|---------|--------|
| `/remember` | Pin fact |
| `/memory` | Show memory |
| `/new` | Fresh thread |
| `/forget` | Forget by topic |
| `/proactive` | Initiative status / pause / resume |
| `/identity` | Owner-only foundational review / approve / reject / defer |
| `/commitments` | Relationship summary (owner-only, ephemeral) |
| `/continuity` | Continuity lineage snapshot |
| `/status` | Nuclear health + initiative + relationship_state |

## Tests

```powershell
npm test
npm run phase0:offline
npm run eval:full -- -Baseline baseline-w0 -Label wave5
```
