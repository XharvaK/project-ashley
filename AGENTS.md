# Project Ashley

Discord-only companion runtime with nuclear Identity → Mind State → Thought →
Agency architecture, local SQLite (`nuclear.db`), and explicit multi-provider
model routing. The production Discord host is **Linux Mint only**.

## Cold start

This file is navigation and repository operations. It is not an architecture
owner. Verification lifecycle semantics are owned by
[`docs/Wave_Acceptance_Protocol.md`](docs/Wave_Acceptance_Protocol.md).

### Required reading order

1. [`VISION.md`](VISION.md)
2. [`docs/Ashley_Core_Principles.md`](docs/Ashley_Core_Principles.md)
3. [`docs/Ashley_Constitution.md`](docs/Ashley_Constitution.md)
4. [`docs/Ashley_Stewardship_Compact.md`](docs/Ashley_Stewardship_Compact.md) and [`docs/Ashley_Ethics.md`](docs/Ashley_Ethics.md)
5. [`docs/Ashley_Hierarchy.md`](docs/Ashley_Hierarchy.md)
6. [`docs/architecture/Ashley_Architecture_Roadmap.md`](docs/architecture/Ashley_Architecture_Roadmap.md)
7. [`docs/architecture/Ashley_Cross_Phase_Architecture.md`](docs/architecture/Ashley_Cross_Phase_Architecture.md)
8. task-specific focused contract
9. live state resolution from Git / source / exact-candidate evidence / production observation

Do not skip Constitution, Stewardship Compact, or Ethics. Steps 1–7 are
architecture / governance authority. Step 8 is the task contract. Step 9
resolves volatile facts from their actual owners. Architecture documents are
not current-state dashboards.

### Live state resolution

Resolve volatile truth from its real authority when needed. Do not infer
current maturity from source presence, architecture, or historical packets.

| Fact | Authority |
|---|---|
| Repository HEAD | Git / `git rev-parse HEAD` |
| Worktree state | Git / `git status --short` |
| Supported schema | source (`apps/agent-service/src/core/db.ts`) |
| Current route bindings | routing source + explicitly audited [`docs/Routing_Status.md`](docs/Routing_Status.md) |
| Qualification / release state | exact-candidate evidence packet |
| Deployed SHA | production observation |
| Promoted capabilities | production observation |
| Architectural prerequisites | canonical roadmap / focused contract |
| Owner-selected current task | owner / current working context; do not infer |

If current truth cannot be established from permitted evidence: `UNKNOWN`.

Document status: [`docs/architecture/Ashley_Architecture_Document_Index.md`](docs/architecture/Ashley_Architecture_Document_Index.md).
Glossary (governing vocabulary): [`docs/Ashley_Glossary.md`](docs/Ashley_Glossary.md).

### Do / do not

| Do | Do not |
|---|---|
| Resolve volatile facts live from Git, source, packets, or production evidence | Resurrect Sandbox V1 broker architecture |
| Follow the focused contract for the task | Treat worktree source as deployed |
| Use risk-based verification (matrix below; semantics in Wave Acceptance) | Treat a passed test as capability promotion |
| Treat architecture predecessor rules as architecture | Treat `RELEASE_QUALIFIED` as `PRODUCTION_ACCEPTED` |
| | Copy schema or model IDs into timeless architecture |
| | Infer self-change authority from Sandbox M5/M7 |
| | Run full generic CI for docs-only edits |
| | Implement a later milestone while its documented predecessor gate is unmet |
| | Infer current maturity from source presence, architecture, or historical packets |

Today’s pending gate is not a sentence in this file. Resolve it live. If it
cannot be established from permitted evidence: `UNKNOWN`.

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

Current roadmap direction: [`docs/architecture/Ashley_Architecture_Roadmap.md`](docs/architecture/Ashley_Architecture_Roadmap.md).
Cross-phase laws: [`docs/architecture/Ashley_Cross_Phase_Architecture.md`](docs/architecture/Ashley_Cross_Phase_Architecture.md).
Document authority and history: [`docs/architecture/Ashley_Architecture_Document_Index.md`](docs/architecture/Ashley_Architecture_Document_Index.md).

Current Sandbox V2 M-series authority and milestone order:
[`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md).
V2 uses direct, unprivileged Bubblewrap. The retained Wave 07 broker design and
source are historical V1 and MUST NOT be reintroduced into V2 by implication.
Historical V1 OS-boundary broker design and Wave 07c provenance:
[`docs/Sandbox_Design.md`](docs/Sandbox_Design.md),
[`docs/handoffs/wave-07c-gate-packet.md`](docs/handoffs/wave-07c-gate-packet.md).
Historical V1 self-inspection design; selected change-set semantics are
reference input for V2 M5/M7:
[`docs/Self_Modification_Design.md`](docs/Self_Modification_Design.md).
Current external-effect authority: [`docs/architecture/External_Effect_and_Authority_Architecture.md`](docs/architecture/External_Effect_and_Authority_Architecture.md).
Historical Wave 09 account-broker design, salvageable for policy and credential
semantics only: [`docs/External_Agency_Design.md`](docs/External_Agency_Design.md).
Wave 10 stabilization and assurance design plus accepted local 10c assurance:
[`docs/Stabilization_Design.md`](docs/Stabilization_Design.md).
Wave acceptance ladder and gate packets: [`docs/Wave_Acceptance_Protocol.md`](docs/Wave_Acceptance_Protocol.md).
Pre-activation correction pass runbook: [`docs/handoffs/mint-corrections-2.md`](docs/handoffs/mint-corrections-2.md).

## Quick start

```powershell
# ~/.composer-assistant/.env — see config/env.example
cd C:\Users\Xharv\Projects\composer-assistant

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
| `~/.composer-assistant/conversations/nuclear.db` | Nuclear Identity, Mind State, Thought, Agency, delivery, cognition, and capability SQLite |
| `~/.composer-assistant/continuity.db` | Authoritative continuity sidecar (lineage, forget, sessions) |
| `workspace/prompts/nuclear/` | Thin nuclear identity prompts |

Legacy `index.db` is archival for chat memory (nuclear does not read it). ConversationLogger may still append audit session rows there.

## Architecture

```
Discord DM → POST /chat/text → Identity + Mind State + Recall → Thought → Agency / Expression → delivery
Proactive tick → Agency.decide → draft → reserve → send → receipt / reconcile → commit / finalize
Curiosity feed → nuclear.db takes → Agency motivations
Committed proactive reaction → Reflection → bounded future Thought calibration
Completed exchange → cognitive job → grounded episode → Mind State / affect / bounded growth
Urgent grounded concern → immediate Agency evaluation → reserve → send → receipt / reconcile → commit / finalize
Grounded engineering intent → admission → direct unprivileged Bubblewrap → receipt / reconcile
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
| Thought | Effort allocation, evidence selection, prioritization, reasoning, completion, and intended-outcome formation |
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
influence. Historical nuclear migrations (schema v9–v21 and later) added the
cognition, continuity, relationship, perception, and provenance contracts
summarized below. Those version numbers are migration history, not the current
supported schema integer. Current schema is source-derived from
`apps/agent-service/src/core/db.ts`. Schema v9 integrates each cognition job atomically, requires exact user-message
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
Schema v21 adds write-time `provenance` labels (`shadow`/`live`) to
`cur_takes`, `cur_reads`, `episodes`, `learning_revisions`, and
`cur_source_candidates`: `live` is written only while the governing capability
holds behavioral influence authority, and every influence materializer
(motivations takes reader, own-time report, evidence resolution,
`attachAuthorizedClaims`, revision auto-apply, evidence eligibility counts,
`processSourceProbation`) requires `live`. Pre-v21 rows backfill to `shadow`;
that backfill is a conservative authority classification, not proof of
historical observe generation. Observe-era evidence can never time-shift into
influence. Only owner-authorized identity-review flows may pass `allowShadow`
to `applyEligibleRevisions`, and only with exact `revisionIds` from the
reviewed identity_revisions row — a broad `allowShadow` scan is refused.

Current nuclear schema is source-derived from
`apps/agent-service/src/core/db.ts` (`NUCLEAR_SUPPORTED_VERSION` and later
migrations). Do not copy the integer into architecture contracts. Later
migrations add durable open cognitive items and their model
continuity, accepted dispatch-contract ordering, Recall qualification epochs,
Sandbox task admissions, bounded Thought validation telemetry, and delivery
phase-lifecycle evidence. Runtime-session metadata still contains a legacy
`nuclearSchemaVersion` value; that field is not current schema authority.
Source and migrations win over copied schema numbers in documentation. Living
route facts belong in [`docs/Routing_Status.md`](docs/Routing_Status.md).

Curiosity follows `scan -> rank -> choose -> fetch -> extract -> record -> form
take -> consolidate -> motivate -> Thought`. Network retrieval is public
HTTP(S) only, redirect- and DNS-revalidated, bounded to five redirects, twenty
seconds, and two megabytes. Reading never sends directly.

Diagnostic plane: `GET /health` exposes minimal public readiness. Owner-scoped
metadata diagnostics include
`GET /nuclear/health?owner_id=` (owner-only metadata diagnostics),
`GET /nuclear/decisions?owner_id=`,
`GET /nuclear/reflections?owner_id=`, `GET /nuclear/episodes?owner_id=`,
`GET /nuclear/cognition?owner_id=`, `GET /nuclear/revisions?owner_id=`,
`GET /nuclear/continuity?owner_id=` (sidecar lineage/events),
`GET /nuclear/relationship?owner_id=`, `GET /nuclear/status?owner_id=`,
`GET /nuclear/engineering?owner_id=` (activation epoch, admission backlog,
weekly review deliveries pending), and the other owner-authenticated GET
projections implemented in `server.ts`.
Capability rollout: `GET /nuclear/capabilities?owner_id=`.
Foundational identity review: `GET /nuclear/identity/reviews?owner_id=`.

Control plane: owner-authenticated POST endpoints for evaluation, promotion,
rollback, cutover, identity decisions, approvals, delivery receipts, and
effect preparation or finalization change state. They are not observability.
`GET /delivery/pending?owner_id=` is a ledgered delivery/work-queue projection,
not a pure diagnostic and not proof of delivery.

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

Authoritative verification lifecycle:
[`docs/Wave_Acceptance_Protocol.md`](docs/Wave_Acceptance_Protocol.md).

Verification is selected by the claim being made, not by ritual. More tests
are not automatically more evidence. This matrix is worker-facing selection
only. Wave Acceptance owns the semantics.

| Change / claim | Default verification |
|---|---|
| Docs-only | Documentation verification only. No Bubblewrap. No full corpus. |
| Pure / local logic | Focused falsification tests during `ITERATION` |
| Schema / migration / data-plane | Targeted authority and migration regressions plus `SETTLEMENT` build/typecheck where relevant. No production database. |
| Settled code candidate | `SETTLEMENT`: affected regression plus build/typecheck where relevant |
| Candidate freeze | One full corpus gate |
| Linux / Bubblewrap / process / filesystem / timing claims | `PHYSICAL QUALIFICATION` on the real host/environment where the claim depends on it |
| Capability promotion | `PRODUCTION`: exact-candidate production witness. Tests never promote. |

Available corpus commands (use only at the stage Wave Acceptance requires):

```powershell
npm test
npm run phase0:offline
npm run eval:full -- -Baseline baseline-w0 -Label wave5
```

## Cursor Cloud specific instructions

The Cursor Cloud VM is Linux, so the root `package.json` scripts (`npm run dev`,
`dev:agent`, `dev:discord`, `test`, `phase0:*`, `eval:*`, `start:ashley`) do
**not** run here — they all shell out to Windows PowerShell (`scripts/*.ps1`).
On Linux, drive each app directly with its own npm scripts.

- **Node with SQLite FTS5 is mandatory.** The nuclear core (`nuclear.db`, schema
  v9) creates FTS5 virtual tables during migration, so agent-service tests and
  the running service need a Node build compiled with SQLite FTS5. The VM's
  default `node` (`/exec-daemon/node`) is **missing FTS5** — symptom is
  `Error: no such module: fts5` on ~half the vitest suite or at service boot.
  Use the nvm-managed Node 22 instead, which has FTS5. Login/interactive shells
  already prefer it (a line in `~/.bashrc` prepends it). For a non-login shell,
  run `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` (or
  `nvm use 22`) before building/testing/running agent-service. `node --version`
  should read `v22.22.2`, not `v22.14.0`. discord-bot tests do not touch SQLite
  and pass under either Node.
- **Per-app commands** (run from repo root):
  `apps/agent-service` — build `npm run build --prefix apps/agent-service`,
  test `npm test --prefix apps/agent-service` (vitest), run
  `npm run dev --prefix apps/agent-service` (tsx watch, listens on
  `http://127.0.0.1:3710`). `apps/discord-bot` — build/test/`dev` mirror the
  same, test is the Node built-in runner. There is no lint tooling in the repo.
- **Config lives outside the repo.** Both apps read `~/.composer-assistant/.env`
  (template: `config/env.example`); override the path with `COMPOSER_ENV_FILE`.
  SQLite DBs auto-create under `~/.composer-assistant/conversations/`.
- **Offline mode is expected without a Mistral key.** With `MISTRAL_API_KEY`
  blank the agent boots in `state: offline`: `POST /chat/text` returns 503, but
  the SQLite nuclear core still works end to end — `GET /health`, `POST
  /memory/pin`, `GET /memory/summary`, and   the `GET /nuclear/*` observability
  endpoints. Owner-scoped endpoints require the `owner_id`/`userId` to equal
  `DISCORD_OWNER_ID` (or `MEMORY_OWNER_ID`). To exercise real LLM responses or
  the live Discord gateway, supply `MISTRAL_API_KEY` and (for discord-bot)
  `DISCORD_BOT_TOKEN` + `DISCORD_OWNER_ID` as secrets.
- **Secrets inject into new VMs only.** Cloud secrets arrive as real env vars at
  process spawn on the *next* agent run, not the run they were added on. The env
  loader only fills variables that are currently `undefined`, so injected
  secrets win over `~/.composer-assistant/.env`. Do **not** hardcode a secret's
  value in that file, and do **not** set `MEMORY_OWNER_ID=` there — agent-service
  resolves it as `MEMORY_OWNER_ID ?? DISCORD_OWNER_ID`, and an empty string is
  not nullish, so a blank entry would break the fallback to the injected owner
  ID. Leave `MEMORY_OWNER_ID` unset to inherit `DISCORD_OWNER_ID`.
- **`apps/desktop`** (Tauri 2 + Vite) is peripheral to the Discord product and
  needs a Rust/Tauri toolchain; it is not required for core setup.
