
# Research gaps and contradictions

**Research date:** 2026-08-09  
**Baseline:** 0efb0250989e2b67a9b0b3d7e8fce81568ae0975  
**Purpose:** Preserve uncertainty and resolve conflicts before any human approves
implementation. A gap is not a reason to invent a framework answer.

## Contradiction ledger

| ID | Claim A / source | Claim B / source | Current truth | Action |
|---|---|---|---|---|
| C-01 | Earlier research/handoff language treated Mastra as a cognitive brain and AgentFS as Ashley memory. | Current source: core/memory, core/agency, core/rollout, schema v22, and the overnight goal explicitly make Recall/Thought/capability authority Ashley-owned. | Framework memory/workflow state is generic support; Ashley semantic state remains authoritative. | Supersede broad framework role; test only narrow seams P-01/P-03. |
| C-02 | Earlier OpenHands proposals treated direct executor or warmed containers as the execution path. | docs/Sandbox_Design.md and current sandbox code require agent proposal, signed scope, separate broker UID/socket, owner approval, and no model/secrets in the broker workspace. | OpenHands, if used, is a broker-contained optional guest; it never becomes the executor authority. | Keep broker; fake-guest test only in P-03. |
| C-03 | A wave can be described as accepted in docs/Wave_Acceptance_Protocol.md. | The same protocol distinguishes design, implementation, local verification, Wave_accepted, release qualification, and deployed. | Wave acceptance is not release qualification, installation, restart, opt-in, or deployment. | Use exact release-state terms in every report. |
| C-04 | ASHLEY_COGNITION_MODE=observe records cognition outputs. | Capability/provenance docs and schema v21/v22 require live authority at artifact creation; observe rows cannot time-shift into influence. | Observe is shadow evidence, not behavioral influence. | P-01 must assert non-interference; no live evidence. |
| C-05 | A framework workflow checkpoint is durable state. | Capability authority, Recall, continuity, and delivery ledgers carry different semantics and sources of truth. | Workflow state is not behavioral authority, Recall, continuity, or delivery truth. | Require separate Ashley-owned IDs, contracts, provenance, and receipts. |
| C-06 | Prompt files describe Ashley expression and constraints. | Core architecture says Identity/Mind State -> Thought -> Expression -> Rendering and ContextComposer owns turn assembly. | Prompts are thin expression guidance; they cannot reconstruct Thought or authority. | No candidate prompt/agent loop may replace semantic layers. |
| C-07 | Generic model routers can choose providers. | docs/Routing_Status.md and current model-routing code state smart routing is complete and Ashley-owned. | Provider selection is not reopened by salvage research. | Exclude routing from candidate replacement. |
| C-08 | Local sandbox/broker tests demonstrate capability. | Governance and acceptance docs distinguish local verification from Mint release qualification/deployment. | Local tests prove local behavior only. | No Mint/SSH/install/deploy or production claim. |
| C-09 | Agent Plugins v1 can package a skill and MCP server. | The official spec is v1.0.0 Working Draft and explicitly leaves authorization/credentials client-managed. | Packaging is useful; authority/security remains Ashley-owned. | Parser/quarantine only; no execution in P-02. |
| C-10 | MCP authorization can protect a remote server. | The official MCP authorization spec is transport-level and warns about token storage/caching/logging; it does not define Ashley capability consent. | MCP auth is not Ashley policy authorization. | Wrap with AshleyToolRuntime and classification. |
| C-11 | AgentFS presents a single SQLite file containing agent filesystem/audit state. | Ashley's nuclear.db and continuity.db have governed semantic and lineage schemas; arbitrary filesystem state is untrusted artifact data. | AgentFS may be workspace substrate only. | P-03 must prohibit memory/identity substitution. |
| C-12 | “Monoma” was supplied as a candidate foundation name. | Current official search located CORDIS Monoma as a 2016–2017 modular sensor/therapy feasibility project, not an AI foundation. | Candidate identity is unresolved. | Mark Research Next/Reference Only; request exact project before scoring. |
| C-13 | Framework traces may say a run completed. | Ashley delivery ledger requires a Discord receipt before “committed” and cognition depends on actual outcome. | Trace completion is not delivery. | Preserve AshleyDeliveryLedger; P-04 tests receipts. |
| C-14 | Relationships can be represented as engagement/attachment or agent memory. | docs/Ashley_Ethics.md and relationship migration/state define explicit commitments, tensions, withdrawals, and no scalar relationship shortcut. | Relationship semantics are Ashley-owned. | Keep relationship tables and coercion gates. |

## Research gap ledger

| ID | Gap | Why it matters | Next evidence | Status |
|---|---|---|---|---|
| G-01 | Exact Mastra package/version and storage adapter needed for a fair spike. | Current docs/releases drift; imports and license boundaries matter. | Human-approved pin, release/source review, isolated fixture. | Open |
| G-02 | Exact LangGraph.js package/version and checkpointer behavior in the chosen Node runtime. | JS API and persistence details drift. | Human-approved pin, official API/source review, isolated fixture. | Open |
| G-03 | Mastra/LangGraph interaction with Ashley atomic SQLite transactions. | Framework snapshots may create a second transaction boundary. | P-01 synthetic transaction fixture. | Open |
| G-04 | Agent Plugins client adoption and compatibility beyond v1 Working Draft. | Early spec can change; support maturity is unclear. | Official repo/changelog and parser fixture; no registry assumption. | Open |
| G-05 | MCP server admission trust/attestation policy for Ashley. | Protocol transport does not establish tool trust. | Ashley-specific threat model and ToolRuntime policy, not MCP marketing. | Open |
| G-06 | OpenHands SDK version/language boundary for a Node service. | Official architecture is Python-first and has V0/V1 terminology. | P-03 fake interface first; official SDK source review only later. | Open |
| G-07 | AgentFS platform behavior on Linux Mint and within the fixed broker recipe. | FUSE/NFS/mount/runtime choices affect the OS boundary. | P-03 fake workspace first; no Mint action in this goal. | Open |
| G-08 | Exact intended Monoma project. | Name collision makes evidence unsafe. | User-provided URL/repository or authoritative citation. | Blocked on identity, not a goal blocker |
| G-09 | Residual retired legacy files and exact deletable LOC. | DELETE direction is clear but exact scope is not. | Separate read-only rg/package/config/test audit. | Open |
| G-10 | Whether generic attention/HTTP/scheduler plumbing is worth extraction. | Mixed policy/mechanics make LOC claims uncertain. | P-01/P-04 fixture and file-level measurement. | Open |
| G-11 | Candidate-maintenance and release evidence at the exact future pin date. | Current external versions are drift-prone. | Recheck immediately before a real spike. | Open |
| G-12 | Whether OTel/trace exporters can be added without duplicating Ashley event truth. | Observability is useful but not authority. | Read-only trace-contract design review. | Open |

## Official-source research record

- [Agent Plugins Specification](https://agent-plugins.org/specification):
  v1.0.0 Working Draft; package root, manifest, fixed skills/MCP locations,
  containment, versioning, component failure boundaries, client-managed auth.
- [Mastra repository](https://github.com/mastra-ai/mastra) and [Mastra
  snapshots reference](https://mastra.ai/en/reference/workflows/snapshots):
  TypeScript workflow/storage/HITL features; snapshot persistence and retries;
  repository licensing notes.
- [Mastra releases](https://github.com/mastra-ai/mastra/releases): current
  durable-agent, workflow, schedule, event, retry, and observability changes.
- [LangGraph.js persistence guide](https://langchain-ai.github.io/langgraphjs/how-tos/subgraph-persistence/),
  [interrupts](https://langchain-ai.github.io/langgraph/concepts/breakpoints/),
  [checkpoint API](https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph-checkpoint.html),
  and [MIT license](https://github.com/langchain-ai/langgraph/blob/main/LICENSE):
  checkpointers/stores, interrupt/replay semantics, pending writes, license.
- [OpenHands SDK architecture](https://docs.openhands.dev/sdk/arch/overview),
  [runtime architecture](https://docs.openhands.dev/openhands/usage/architecture/runtime),
  and [sandbox overview](https://docs.openhands.dev/openhands/usage/sandboxes/overview):
  Python SDK, agent/tool/event/workspace boundaries, sandbox choices.
- [AgentFS site](https://www.agentfs.ai/) and [official repository](https://github.com/tursodatabase/agentfs):
  SQLite filesystem, copy-on-write, snapshots, audit, Beta status, MIT license.
- [Letta docs](https://docs.letta.com/) and [repository](https://github.com/letta-ai/letta):
  stateful memory-agent platform and SDK/server scope.
- [MCP specification](https://modelcontextprotocol.io/specification) and
  [authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization):
  protocol and transport-level auth, not Ashley authority.
- [Microsoft Agent Framework docs](https://learn.microsoft.com/en-us/agent-framework/)
  and [agent resources](https://microsoft.github.io/agent-resources/develop-agents/):
  workflow/durable-extension and graph/multi-agent public preview scope.
- [elizaOS repository](https://github.com/elizaos/eliza): TypeScript runtime,
  plugin, memory/state, and multi-agent scope.
- [OpenClaw repository](https://github.com/openclaw/openclaw): personal
  assistant/application scope.
- [Poke recipes](https://poke.com/docs/creating-recipes) and [MCP
  servers](https://poke.com/docs/mcp-servers): hosted recipe/integration and
  credential/tunnel scope.
- [CORDIS Monoma record](https://cordis.europa.eu/project/id/736384) and
  [reporting record](https://cordis.europa.eu/project/id/736384/reporting):
  modular sensor/therapy feasibility project; not the hypothesized AI foundation.

## Superseded research dispositions

| Earlier idea | Disposition | Reason |
|---|---|---|
| Mastra as Ashley's cognitive brain | Superseded | Current Thought/Agency/Recall/capability authority already exist and are governed. |
| Mastra AgentFS as Ashley memory | Superseded | AgentFS is a filesystem/audit substrate; Recall has exact provenance and authority semantics. |
| Direct OpenHands executor | Superseded | Sandbox design requires Ashley proposal plus separate signed broker authority. |
| Warmed OpenHands containers as core runtime | Superseded | Deployment and execution boundary are not authorized and would import a second runtime owner. |
| Letta as Ashley memory/agent state | Rejected as central foundation | Duplicates semantic memory/Thought authority. |
| Multi-framework stack | Rejected | Framework accretion and overlapping authority are not reversible simplicity. |
| Monoma as assumed AI candidate | Unresolved | Current authoritative result is a different modular hardware project. |

## Stop conditions for future work

Pause and report rather than improvising if:

- baseline SHA or tracked-source cleanliness changes;
- a spike needs a production source change, package install, credential,
  network call, live model, database, Mint, deployment, or broker use;
- candidate behavior cannot be verified from official material;
- a framework requires Ashley semantics to be represented only in framework
  state;
- a material contradiction appears between current source and governance;
- a proposed LOC retirement cannot identify real current files and tests;
- a plugin/tool path cannot be kept untrusted and broker-mediated.

