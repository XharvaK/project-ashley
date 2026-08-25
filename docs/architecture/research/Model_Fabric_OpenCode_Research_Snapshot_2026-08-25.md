# OpenCode / Zen research snapshot

**Status:** `EPHEMERAL RESEARCH APPENDIX` — not architecture, not a route table,
not authorization.

**Captured:** 2026-08-25 (UTC+3 documentation pass)

**HEAD at capture:** `04beaf1c21c9f7e0c9580692f57ed533d822f61e`
(historical documentation snapshot; MF-M1 source baseline is `8eedad8…`)

This file will go stale. Architecture in
[`../Model_Fabric_Architecture.md`](../Model_Fabric_Architecture.md) must remain
valid if every row below changes.

Evidence classes: `CONFIRMED FROM OFFICIAL PUBLIC DOCUMENTATION`,
`OBSERVED CURRENT CATALOG`, `SECONDARY (GitHub issues)`, `UNKNOWN`.

## 1. Official capability notes (2026-08-25)

Sources: `https://opencode.ai/docs/`, CLI, server, SDK, permissions, agents,
config, Zen, `https://opencode.ai/legal/terms-of-service`.

| Topic | Finding | Class |
|---|---|---|
| Non-interactive | `opencode run [message]` | Official docs |
| JSON events | `--format json` | Official docs |
| Headless HTTP | `opencode serve` default `127.0.0.1:4096` | Official docs |
| Auth on serve | `OPENCODE_SERVER_PASSWORD` basic auth | Official docs |
| SDK | `@opencode-ai/sdk`; can spawn or attach | Official docs |
| Model enum | `opencode models`; `GET /config/providers` | Official docs |
| Structured output | `format: json_schema` via StructuredOutput **tool** | Official docs |
| New session | `session.create` | Official docs |
| Continue session | `--continue` / `--session` | Official docs |
| Abort | `POST /session/:id/abort` | Official docs |
| Stream | SSE `/event`, `/global/event` | Official docs |
| Permissions | `allow` / `ask` / `deny`; `*` wildcard | Official docs |
| Default permissions | Most tools **allow**; `doom_loop` and `external_directory` default **ask** | Official docs |
| Custom agents | JSON or markdown; custom prompt | Official docs |
| Default prompt | Coding-agent ontology in `default.txt` | Official GitHub source |
| Environment injection | cwd, worktree, git, platform, date | Official GitHub source |
| Hidden agents | compaction, title, summary | Official docs |
| Disable compact | `OPENCODE_DISABLE_AUTOCOMPACT` | Official docs |
| MCP / skills / plugins | Supported; can be denied/disabled | Official docs |
| Project AGENTS.md | `/init` writes project instructions | Official docs |
| ACP | `opencode acp` stdio JSON-RPC | Official docs |
| GitHub Action | `opencode github run` | Official docs |
| Zen "any agent" | Zen HTTP usable outside TUI | Official Zen docs |
| Free remaining quota API | Not documented | UNKNOWN |
| Unattended free-tier ToS | Owner 2026-08-25: **non-blocking for architecture**. Privacy/data-class still applies. | OWNER CLOSED (architecture blocker) |

## 2. Zen catalog snapshot

`GET https://opencode.ai/zen/v1/models` on 2026-08-25 returned 64 IDs
(`object: list`, `owned_by: opencode`). That endpoint did **not** include
context window, tools, vision, or quota fields.

Free / $0 rows from official Zen **pricing table** the same day (names as
published; IDs where known from `/zen/v1/models`):

| Display (Zen docs) | API id if seen | Price | Privacy / notes from Zen docs |
|---|---|---|---|
| Big Pickle | `big-pickle` | Free | Free-period data may improve the model |
| Ox Alpha Free | `x-preview-f-free` | Free | Docs: provider zero-retention / no training |
| MiMo-V2.5 Free | `mimo-v2.5-free` | Free | Limited time; data may improve model |
| Hy3 Free | `hy3-free` | Free | Limited time; data may improve model |
| Nemotron 3 Ultra Free | `nemotron-3-ultra-free` | Free | NVIDIA trial; do not submit personal/confidential data; logged |
| Nemotron 3.5 Lightning Free | `nemotron-3.5-lightning-free` | Free | Same NVIDIA trial terms |
| Muse Spark 1.2 Contributor Free | `muse-spark-1.2-contributor-free` | Free | Prompts/completions may train future Meta models |
| DeepSeek V4 Flash Free | `deepseek-v4-flash-free` | listed on `/models` | Quota/privacy not fully specified on the models list |
| Laguna S 2.1 Free | `laguna-s-2.1-free` | listed on `/models` | Not in the pricing-table excerpt fetched |

Paid Zen rows exist for Claude, GPT, Gemini, Grok, GLM, Kimi, MiniMax, Qwen,
DeepSeek paid, etc. They are **not** copied here as a routing plan.

**Context size, output cap, tools, reasoning, vision, JSON mode, daily
allowance:** not present on `/zen/v1/models`. Treat as `UNKNOWN` until a
verbose `opencode models` or Models.dev card is captured under an authenticated
CLI.

**GitHub issues (secondary, not official limits):** users report opaque free
caps, `FreeUsageLimitError` / 429, possible IP pooling, paid balance not always
bypassing free-model caps. Remaining quota headers are **not** a documented
stable API.

## 3. Historical Ashley OpenCode pin

OC-M0 packet (`oc-m0 result packet.json`): OpenCode **v1.18.18**, linux-x64
tarball from GitHub releases, SHA256
`0cddc222418b8553669905a8980c0cda7088f00da24d83d6ac76b01c9fdb2aaf`.

That pin is **historical worker-harness evidence**, not a Model Fabric runtime
pin. Packets also record: no in-tree harness; `permission: { "*": "deny" }`
empirically strips all tools on v1.18.18 (the `tools` config block was
ignored); openai adapter required `POST /v1/responses`; host pathname Unix
socket + in-sandbox TCP forwarder; master keys never in the sandbox.

## 4. Terms excerpt (do not treat as legal advice)

Hosted Services terms (`https://opencode.ai/legal/terms-of-service`, page
fetched 2026-08-25) include restrictions against:

- automatically or programmatically extracting data or Output;
- processes that run or are activated while you are not logged into the
  Services;
- unpaid-account Content used to develop and improve Services.

OSS that is not hosted is described as governed by the repository license.

**Unattended Ashley using Zen free models:** owner 2026-08-25 treats
service-use / unattended-agent terms as **non-blocking for architecture**.
Privacy classification still applies. NVIDIA trial “no confidential data”
remains a data-boundary constraint. This snapshot is not legal advice.

## 5. What this snapshot must never become

- A hardcoded Model Fabric roster
- Proof that a model is qualified
- Proof that a model may serve Thought or Expression
- Proof that free quota is large enough for production cognition
