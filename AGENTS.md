# Project Ashley

Discord companion with nuclear Identity → State → Agency architecture, local SQLite (`nuclear.db`), and Mistral API. Production Discord host is **Linux Mint only**.

## Governing authority

Read [`VISION.md`](VISION.md) before the Core Principles or Constitution. The
Vision explains why Ashley exists. The Core Principles are the highest
constitutional constraints beneath it, and lower documents and implementations
derive authority through that chain. The Vision is not a runtime prompt.

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
redaction.

Curiosity follows `scan -> rank -> choose -> fetch -> extract -> record -> form
take -> consolidate -> motivate -> Thought`. Network retrieval is public
HTTP(S) only, redirect- and DNS-revalidated, bounded to five redirects, twenty
seconds, and two megabytes. Reading never sends directly.

Observability: `GET /health`, `GET /nuclear/decisions?owner_id=`,
`GET /nuclear/reflections?owner_id=`, `GET /nuclear/episodes?owner_id=`,
`GET /nuclear/cognition?owner_id=`, `GET /nuclear/revisions?owner_id=`.
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

## Tests

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
