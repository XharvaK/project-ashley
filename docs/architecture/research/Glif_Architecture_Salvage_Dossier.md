# Glif Architecture Salvage Dossier

## Status

REFERENCE / RESEARCH

- Research date: 2026-08-14
- Ashley baseline: `bcc185e40f347a0235407896fc809d9de461fd7b`
- Scope: architecture salvage only
- Runtime, Sandbox, Model Fabric implementation, roadmap order, activation, and promotion: unchanged
- Glif account connection, authenticated API calls, paid calls, installation, and integration: not performed

## Executive conclusion

Glif is now a project-first creative-media agent. Its current product uses one agent, dynamically retrieves relevant tools, selects models and tools internally, supports reusable user skills, preserves project assets, runs asynchronous jobs, queues later chat input, exposes cost controls, and offers a hosted MCP/API surface. These are useful mechanism and UX references. They are not a suitable replacement for Ashley's cognition or semantic authority.

The strongest Glif finding is the explicit split between a durable `project_id` and a per-execution `job_id`. This reinforces Ashley's existing distinction between a durable work concern and an execution attempt. It should materially inform `OPERATIONAL-CONTINUITY-01`, but it does not create new architecture.

The next strongest finding is semantic tool retrieval. Glif documents that it loads relevant tools by semantic search instead of putting every tool in context. Ashley should eventually test a stricter two-stage form: authority-scoped candidate discovery, deterministic authorization filtering, then full descriptor or procedure projection. The invariant is `RETRIEVED != AUTHORIZED`.

Glif's conversation-to-skill UX is valuable, but its semantics are too broad for direct adoption. Ashley should treat a useful conversation as evidence for a procedure proposal. It must not become an executable procedure, permission, or Recall entry without separate review, qualification, capability binding, and authorization.

Glif is promising as a replaceable creative-media substrate. Its present integration posture is `PUBLIC PREVIEW / BETA`, `OPTIONAL SUBSTRATE`, and `SPIKE ONLY`. The hosted server is closed-source. The former local MCP server and older workflow API were deprecated. Current documentation does not establish cancellation, idempotency, reconciliation, stable artifact identity, fixed rate limits, exact retention, or a compatibility policy. Its terms also permit broad use of submitted content and transfer inputs to third-party AI services. Ashley must not send Identity, Recall, secrets, private owner context, or authority-bearing instructions to it.

No roadmap reordering is justified. No new phase is justified. No change is justified to the first `MODEL-FABRIC-01` `thought_observation_shadow` slice. Glif can provide bounded mechanisms. It cannot own Ashley Identity, Mind State, Thought, Recall, Agency, goals, authorization, or meaning.

## Source inventory

### Current Glif primary sources

All sources were accessed on 2026-08-14. A page date is included where Glif provides one.

| Source | Source date or live status | Relevance |
|---|---:|---|
| [Glif product](https://glif.app/product) | Current page | Current creative-agent positioning, model/tool selection, project context, and media modalities. Product language is treated as marketing unless another source defines operational behavior. |
| [Glif 2.0 changelog](https://glif.app/changelog/2026-03-24-glif-2) | 2026-03-24 | One-agent architecture, semantic tool retrieval, skill activation, approval modes, credit threshold, old workflow retirement, and one-credit pricing statement. |
| [Queued messages changelog](https://glif.app/changelog/2026-04-17-post-glif-2-polish) | 2026-04-17 | Queue, edit, and cancel of later messages while a turn is running; media library grouping. |
| [Skills and library changelog](https://glif.app/changelog/2026-05-14-customize-and-library-upgrades) | 2026-05-14 | Conversation-to-skill UX, explicit remember/interview UX, skill invocation, media search, and asset references. |
| [Glif changelog](https://glif.app/changelog) | 2026-06-04 and 2026-06-29 entries | Intelligence tiers, per-chat and per-turn cost visibility, approval visibility, connected-app review, document inputs, chat branching, and tool retirement. |
| [Glif API](https://glif.app/api) | Live; labeled beta public preview | Current programmatic entry point, endpoint, JSON-RPC wire format, durable projects, assets, and `tools/list` as the live schema authority. |
| [Glif machine-readable guide](https://glif.app/llms.txt) | Live | Public tool set, project/job definitions, polling lifecycle, status expiry, intelligence tiers, exposed/internal boundary, OAuth/API-token authentication, and programmatic skill limits. |
| [Glif OpenAPI 3.1 document](https://glif.app/openapi.json) | Live; API version `1.0.0` | Endpoint schema, supported MCP methods, bearer authentication, JSON/SSE responses, 401 behavior, and per-credential 429 response. A `1.0.0` document version is not evidence of semantic stability because the product labels the API public preview. |
| [Glif MCP setup](https://glif.app/mcp) | Live; labeled beta | Hosted MCP connection and OAuth setup. No account was connected. |
| [Official `glif-mcp-server` repository](https://github.com/glifxyz/glif-mcp-server) | Current main branch; inspected 2026-08-14 | Confirms the current server is hosted and closed-source, the repository contains registry metadata, and the old local server is deprecated. |
| [MCP registry metadata](https://raw.githubusercontent.com/glifxyz/glif-mcp-server/main/server.json) | Version `1.0.0` | Registers one remote Streamable HTTP endpoint. It does not expose the hosted implementation. |
| [Glif pricing](https://glif.app/pricing) | Current page | Credits/plans and commercial-use positioning. Exact plan amounts were not exposed in the public page text inspected here. |
| [Glif Terms of Service](https://glif.app/legal) | Last updated 2025-02-12 | Credits, submitted-content license, confidentiality warning, third-party AI processing, service change/termination, and liability posture. |
| [Glif Privacy Policy](https://glif.app/privacy) | Last updated 2023-03-01 | Collection, service improvement, vendor sharing, retention criteria, US hosting/processing, and security statements. It predates Glif 2.0 and the current API. |
| [Glif security and bug bounty](https://glif.app/security) | Current page | API in bug-bounty scope. It does not document architecture controls, certifications, data isolation, or a security SLA. |

### Contradictory and historical first-party sources

| Source | Stated status | Reconciliation |
|---|---|---|
| [Glif Docs FAQ](https://docs.glif.app/) | Says the API was deprecated on 2026-05-20 and no API is offered. | This describes the retired workflow-era API. It conflicts with the live project-first API page, live OpenAPI document, live `llms.txt`, and current hosted-MCP repository. The FAQ is editorially stale or insufficiently scoped. It must not be used as the current endpoint contract. |
| [Old workflow API guide](https://docs.glif.app/api/getting-started) | Describes unstable beta `simple-api.glif.app`, workflow IDs, legacy 200-on-error behavior, and credit billing. | Historical only. Its workflow, error, and endpoint semantics do not apply to the new project-first API unless the current documents restate them. |
| [Archived Python client](https://github.com/glifxyz/glif-client-python) | Public repository is archived. | Evidence of the old API ecosystem, not a supported client for the current hosted MCP/API. |

### Current API timeline

| Date | Event | Confidence |
|---|---|---|
| Before 2026-03-24 | Glif offered workflow graphs and a beta workflow API, including `simple-api.glif.app`. | HIGH — historical first-party docs. |
| 2026-03-24 | Glif 2.0 replaced workflow graphs and multi-bot configuration with one chat agent, dynamically selected tools, and skills. Existing workflows stopped running in the new system. | HIGH — dated first-party changelog. |
| 2026-05-20 | Glif's FAQ says the old API was deprecated. | HIGH for the statement; MEDIUM for scope because the FAQ does not distinguish old and new API generations. |
| By 2026-07-30 | The official MCP repository pointed to the hosted `https://glif.app/api/mcp` server and deprecated the prior local server. | HIGH — current repository history and README. |
| 2026-08-14 | `glif.app/api`, `llms.txt`, and OpenAPI expose a new project-first API as beta public preview. | HIGH — live first-party endpoint documentation. |

The current classification is `PUBLIC PREVIEW / BETA`. The dependency posture is `OPTIONAL SUBSTRATE`, `SPIKE ONLY`, and `DO NOT MAKE REQUIRED`. The old deprecation is not evidence that the new endpoint is already deprecated. The unresolved contradiction is itself evidence of documentation and lifecycle risk.

### Ashley authority and codebase basis

This dossier uses the current repository as the authority for Ashley. The most relevant sources are:

- [`VISION.md`](../../../VISION.md)
- [`Ashley_Core_Principles.md`](../../Ashley_Core_Principles.md)
- [`Ashley_Constitution.md`](../../Ashley_Constitution.md)
- [`Ashley_Architecture_Document_Index.md`](../Ashley_Architecture_Document_Index.md)
- [`Ashley_Architecture_Roadmap.md`](../Ashley_Architecture_Roadmap.md)
- [`Ashley_Architecture_Salvage_Map_v2.md`](../Ashley_Architecture_Salvage_Map_v2.md)
- [`Ashley_Foundation_Architecture_Decision_v1.md`](../Ashley_Foundation_Architecture_Decision_v1.md)
- [`Model_Fabric_01_Codebase_Reconnaissance.md`](../Model_Fabric_01_Codebase_Reconnaissance.md)
- [`Model_Fabric_01_Contract_Draft.md`](../Model_Fabric_01_Contract_Draft.md)
- [`Model_Fabric_01_Implementation_Spike.md`](../Model_Fabric_01_Implementation_Spike.md)
- [`Ashley_Evaluation_Qualification_Plane.md`](../Ashley_Evaluation_Qualification_Plane.md)
- [`DeepSeek_Harness_Salvage_Dossier.md`](DeepSeek_Harness_Salvage_Dossier.md)
- [`Autonomous_Work_Semantics_Salvage.md`](Autonomous_Work_Semantics_Salvage.md)
- [`memory-and-recall.md`](../../memory-and-recall.md)
- [`Sandbox_Design.md`](../../Sandbox_Design.md)
- [`External_Agency_Design.md`](../../External_Agency_Design.md)

## Glif capability map

Evidence labels:

- `FACT`: directly documented by a current first-party source.
- `INFERENCE`: a bounded interpretation of documented behavior.
- `MARKETING`: a product claim without a sufficient operational contract.
- `UNKNOWN`: the inspected sources do not establish the behavior.

| Capability | Source | Current status | What it does | User-facing semantics | Likely internal mechanism | Evidence / confidence |
|---|---|---|---|---|---|---|
| One agent selecting many tools | Glif 2.0 changelog; product page | Active UI product | A single creative agent chooses and chains media, code, web, and processing tools. | The user describes an outcome instead of choosing each model or tool. | Agent loop over a private tool runtime. Exact planner and safety layers are not public. | FACT for product behavior; internal details UNKNOWN. HIGH/MEDIUM. |
| Semantic tool retrieval | Glif 2.0 changelog | Active UI product | Loads relevant tools through semantic search instead of placing 100+ tool descriptions in every context. | Faster, narrower tool selection without manual tool choice. | Semantic index over tool metadata or descriptions, followed by dynamic tool binding. Index, ranking, and filters are not public. | FACT for semantic retrieval; INFERENCE for mechanics. HIGH/MEDIUM. |
| Skills | Glif 2.0 and 2026-05-14 changelogs | Active UI; read-only subset in public API | Skills carry workflow, style, persona, or recipe instructions. Users can create one from a conversation, edit/share it, or invoke it with `/`. The agent may activate skills mid-conversation. | Reusable behavior without repeating instructions. | Stored instructional payloads dynamically loaded into the agent. Qualification and authorization semantics are not documented. | FACT. HIGH. |
| Personalization and explicit memory | 2026-05-14 changelog | Active UI; raw writes kept internal to public API | Users can ask Glif to remember facts or interview them. Later chats receive persistent information about work, tools, and response preferences. | Explicit remembering and a visible Customize surface. | User-profile store projected into new chats. Provenance, conflict resolution, deletion, and authority rules are not documented. | FACT for UX; mechanics INFERENCE/UNKNOWN. HIGH/MEDIUM. |
| Durable project | API page; `llms.txt` | Beta public preview | `project_id` identifies the durable container for history, assets, and agent tier across compose calls. | Continue and refine the same body of work. | Provider-side project record. Exact versioning and concurrency control are not public. | FACT. HIGH. |
| Async job | `llms.txt`; OpenAPI; MCP repository | Beta public preview | Every `compose_project` creates a `job_id`, returns immediately, and is polled until `working`, `completed`, or `failed`. Typical duration is documented as one to five minutes. | Long generation does not hold the client tool call open. | Background queue plus status store. | FACT. HIGH. |
| Job/result retention | `llms.txt` | Beta public preview | Job status expires about 30 minutes after completion. Project media remains accessible through the project. | A short-lived polling handle points into longer-lived project work. | Ephemeral job-state store plus durable project/media storage. Exact project retention is unknown. | FACT for stated durations; UNKNOWN for deletion policy. HIGH/LOW. |
| At-creation input and mid-workflow input | `llms.txt` | Partial | Prompt omission can trigger elicitation when the client supports it. Mid-workflow `input_required` is not wired. | The API can ask for initial input but cannot pause a running job for new input. | MCP elicitation at job creation. | FACT. HIGH. |
| Queued owner input | 2026-04-17 changelog | Active UI | A message submitted during a running turn waits until the agent is ready. The user can edit or cancel it before it runs. | The user can prepare the next instruction without interrupting the current turn. | Client/server queue associated with the chat. It is not documented as mutation or cancellation of the active job. | FACT for queue; active-job effects UNKNOWN. HIGH. |
| Asset library and reuse | 2026-04-17 and 2026-05-14 changelogs; API page | Active UI; partial API | Uploads and generations are searchable, grouped, filtered, referenced with `@`, attached to projects, and returned as media links. | Persistent media can be found and reused across chats/projects. | Provider asset store plus search index and project associations. | FACT. HIGH. |
| Artifact reference identity | `llms.txt`; MCP repository | Partial public contract | Completed media is returned in MCP `resource_link` blocks and can be viewed by `project_id`. Upload returns a media URL. | Clients can display or reuse generated media. | CDN object plus provider metadata. Stable object IDs, revisions, digests, mutation bases, and effect witnesses are not documented. | FACT for links; identity semantics UNKNOWN. HIGH/LOW. |
| Chat branching | 2026-06-29 changelog | Active UI | A user branches from a completed assistant turn into a new conversation with prior messages, assets, and context copied to that point. The original stays unchanged. | Explore alternatives without losing the source chat. | Copy-on-write or snapshot lineage over chat context and asset references. Exact storage is not public. | FACT for UX; mechanism INFERENCE. HIGH/MEDIUM. |
| Model/tool selection | Product and changelog; `llms.txt` | Active | Glif selects internal media models and tools. The API is not a raw model picker. | User selects an outcome and optionally an agent intelligence tier. | Private route policy and tool planner. Route evidence and deterministic constraints are not public. | FACT for selection; route semantics UNKNOWN. HIGH/LOW. |
| Intelligence tiers | 2026-06-04 changelog; `llms.txt` | Active, with surface mismatch | UI documents Lite, Flash, Smart, and Genius. Public API documents only `lite`, `smart`, and `genius`; Smart is default and persists on a project. | User trades speed, capability, and credits. | Tier selects an internal model/agent configuration. Exact route bindings can change. | FACT; current UI/API mismatch. HIGH. |
| Tool approval and spend threshold | Glif 2.0 changelog; 2026-06-04/29 entries | Active UI | User can auto-approve, always require approval, or auto-approve tools under a credit threshold. Pending/in-progress calls appear in approval surfaces. | Spending is visible and expensive actions can pause for consent. | Policy gate around internal tool calls using estimated credits. Risk/authority checks are not documented. | FACT for UX; broader semantics UNKNOWN. HIGH/MEDIUM. |
| Cost accounting | Glif 2.0 and 2026-06-29 changelogs; `llms.txt`; MCP repository | Active UI and API telemetry | Shows per-chat totals and per-turn details. API results include billing telemetry. `whoami` includes balance and recent spend. Generation consumes credits; read-only tools are described as free. | The user can see and constrain spending. | Estimate before tool call plus billing receipt after execution. Estimate accuracy and reservations are unknown. | FACT. HIGH/MEDIUM. |
| Hosted MCP/API abstraction | API page; OpenAPI; MCP repository | Beta public preview | One JSON-RPC endpoint exposes a fixed high-level tool set. Raw native tools, memory writes, global skills, and harness state stay internal. | External agents ask Glif to compose media projects without learning its internal model APIs. | Closed hosted service behind Streamable HTTP; current public repository is metadata only. | FACT. HIGH. |
| External-agent authentication | `llms.txt`; OpenAPI; MCP repository | Active preview | MCP uses OAuth 2.1 with PKCE/dynamic registration. Direct HTTP can use a `glif_v1_...` bearer token. | A user links a Glif account or supplies a scoped API token. | Hosted authorization server and bearer access token. Published token scopes and account separation are not documented. | FACT for flows; scopes UNKNOWN. HIGH/LOW. |
| Programmatic skills | `llms.txt`; OpenAPI | Limited | Public tools can list and read the authenticated user's personal skills. Global skills and raw internal mechanisms are hidden. No public create, graduate, invoke, or version tool is documented. | External clients may inspect user skills, not manage the full skill lifecycle. | Read-only projection from user skill storage. | FACT for documented surface; other operations UNKNOWN. HIGH. |
| Cancellation, retry, and idempotency | Current API materials | Not documented | No public cancellation tool, idempotency key, retry contract, or reconciliation endpoint was found. | A client can poll, but cannot rely on documented cancellation or safe replay. | UNKNOWN. | UNKNOWN. HIGH confidence that the public docs inspected do not specify it. |
| Rate limits | OpenAPI | Partial | A per-credential limit can return HTTP 429. No numerical limit or reset contract is documented. | Clients must handle throttling without a published capacity guarantee. | Credential-level limiter. | FACT for 429; limits UNKNOWN. HIGH/LOW. |
| Security, privacy, and content handling | Legal, privacy, security pages | Legally documented but incomplete for current API | Inputs may be passed to third-party AI services. Submitted content receives a broad license. The privacy policy permits service improvement and vendor sharing. | Users receive no general confidentiality guarantee under the published terms. | Multi-provider processing in US-hosted service. Provider-specific retention, training, tenant isolation, and certifications are unknown. | FACT for published terms; operational controls UNKNOWN. HIGH/LOW. |

No authenticated `tools/list`, `resources/list`, or `prompts/list` call was made. Therefore the live authenticated schema and any account-dependent tools were not independently observed. The fixed tools above come from the public current `llms.txt` and OpenAPI materials.

## Ashley overlap analysis

| Glif concept | Ashley already has or plans | Genuine delta | Result |
|---|---|---|---|
| One agent with many dynamically selected tools | `ONE ASHLEY WITH BOUNDED WORKERS`, `AshleyToolRuntime`, `CapabilityAuthority`, specialists as inert workers, and model/provider adapters | Product evidence that a small retrieved tool set is practical at large catalog size | Keep Ashley ownership. Adopt only the retrieval mechanism. |
| Semantic tool loading | `ContextProjection`, capability contracts, authorization, future procedures, and `CONTEXT-BUDGET-01` | Current Ashley documents do not yet freeze an explicit two-stage discovery/full-projection seam | ADAPT and spike inside existing phases. |
| Conversation to skill | `ProcedureDefinition`, `RecordedProcedure`, `CandidateSkill`, Toolkit Graduation, and Agent Skills interchange | Strong UX pattern and an experience-derived proposal source | ADAPT. Do not create a second skill architecture. |
| Project and job IDs | Durable operational state, execution attempts, leases, event fabric, provider handles, effect reconciliation | Glif provides a simple public example and a short-lived-job/long-lived-project retention split | ALREADY COVERED — NO NEW ARCHITECTURE. Make the concern/attempt mapping explicit in Phase 3 contracts. |
| Queued messages | Durable inbox/event fabric and Operational Continuity planning | Explicit owner-input lifecycle during active work is not yet as visible as the execution lifecycle | ACCEPT as a Phase 3 requirement. |
| Cost threshold and telemetry | Model Fabric receipts/budgets, Capability Authority, evaluation evidence, and observability | Clear owner-facing estimate/actual/work-total UX | ADAPT. Cost remains an independent admission dimension, never authority. |
| Searchable asset library | Planned Artifact Registry, ExecutionWorkspace artifacts, remote-object identity, evidence, and Recall separation | Useful search/reference UX and persistent media continuity | ALREADY COVERED semantically. ADAPT UX and provider binding only. |
| Chat branching | Thought alternatives, sandboxed plans, continuity lineage, and bounded context | A concrete copy-to-point interaction pattern | DEFER as plan/context branching. Reject identity or Recall branching. |
| Explicit persistent personalization | Provenance-bound Recall, identity review, Mind State, relationship state, explicit forgetting, and capability gates | Inspectable `remember`/Customize UX | UX inspiration only. Glif memory semantics are too weak for Ashley. |
| Hosted high-level media agent | Provider adapters, external capability design, external artifact identity, and qualification bindings | A possible replaceable multi-model creative substrate behind one endpoint | USE AS SUBSTRATE only after a bounded spike and separate authorization. |
| High-level API hiding raw tools | Ashley's provider-adapter and substrate boundary | Confirms a high-level provider can be useful without becoming semantic owner | ACCEPT as substrate design evidence. Do not accept its opaque tool choice for high-risk effects. |
| UI intelligence tiers | Model Fabric route policy and capability profiles | User-understandable effort classes | DEFER to later Model Fabric migration. The first slice remains unchanged. |

## Salvage decisions

### ACCEPT

#### Durable concern and execution-attempt separation

- **WHAT GLIF DOES:** Keeps durable work in `project_id` and represents one asynchronous run with `job_id`.
- **WHAT PROBLEM IT SOLVES:** A long-lived objective and its assets survive individual runs and short-lived poll handles.
- **ASHLEY ALREADY HAS:** Operational Continuity, worker-provider handles, attempt/effect records, artifact continuity, and reconciliation semantics.
- **WHAT IS ACTUALLY NEW:** A clean external product example and a documented job-status expiry boundary.
- **SALVAGE VERDICT:** ACCEPT as evidence. `ALREADY COVERED — NO NEW ARCHITECTURE`.
- **ROADMAP LOCATION:** `OPERATIONAL-CONTINUITY-01`.
- **ASHLEY OWNERSHIP BOUNDARY:** Ashley owns the concern, constraints, continuation decision, and attempt interpretation. A provider owns only its project/job records.
- **RISK IF COPIED NAIVELY:** Treating a provider project as Ashley's durable cognition or treating a failed/expired job as proof that no effect occurred.
- **SMALLEST NEXT ACTION:** Add concern/attempt/provider-handle cases to the future Phase 3 contract and evaluation set. Do not implement now.

#### Durable queued owner input

- **WHAT GLIF DOES:** Queues a later message while a turn runs and lets the user edit or cancel that queued message before execution.
- **WHAT PROBLEM IT SOLVES:** The owner can continue steering without waiting for the current turn to end.
- **ASHLEY ALREADY HAS:** Durable operational state and event-driven execution, but the owner-input lifecycle is not yet a first-class contract.
- **WHAT IS ACTUALLY NEW:** A concrete requirement for durable, inspectable input disposition during active work.
- **SALVAGE VERDICT:** ACCEPT.
- **ROADMAP LOCATION:** `OPERATIONAL-CONTINUITY-01`; observability is cross-cutting.
- **ASHLEY OWNERSHIP BOUNDARY:** Ashley interprets an authenticated owner event under current authority and current world state. A queue transports data; it does not authorize or apply it.
- **RISK IF COPIED NAIVELY:** Claiming cancellation stopped an effect already sent, or silently replacing an objective without recording the supersession.
- **SMALLEST NEXT ACTION:** Specify queue state, effect-stage interaction, and owner-visible disposition in the Phase 3 design review.

#### Cost and work-status observability

- **WHAT GLIF DOES:** Shows pending/in-progress work, per-turn cost details, per-chat totals, account balance, and recent spend.
- **WHAT PROBLEM IT SOLVES:** The user can see what is running and what it costs.
- **ASHLEY ALREADY HAS:** The Evaluation/Qualification and Observability planes, engineering status, decision records, and Model Fabric receipts.
- **WHAT IS ACTUALLY NEW:** A useful owner-facing grouping: estimate, operation actual, attempt total, and concern total.
- **SALVAGE VERDICT:** ACCEPT as observability guidance.
- **ROADMAP LOCATION:** Observability cross-cutting; later Model Fabric migration and Phase 3 work records.
- **ASHLEY OWNERSHIP BOUNDARY:** Telemetry records transport and billing facts. It does not establish semantic correctness, authority, or Effect Witness truth.
- **RISK IF COPIED NAIVELY:** Treating a rounded estimate as a reservation, an actual charge as proof of successful effect, or low cost as permission.
- **SMALLEST NEXT ACTION:** Add cost-observation fields to future contract proposals without touching the current Model Fabric first slice.

### ADAPT

#### Semantic capability and procedure retrieval

- **WHAT GLIF DOES:** Uses semantic search to load relevant tools and lets the agent activate relevant skills.
- **WHAT PROBLEM IT SOLVES:** Large catalogs do not consume every model context.
- **ASHLEY ALREADY HAS:** Capability authority, ContextProjection, procedure graduation, provider adapters, and context-budget planning.
- **WHAT IS ACTUALLY NEW:** An explicit retrieval seam between catalog visibility and full model projection.
- **SALVAGE VERDICT:** ADAPT with two stages and deterministic gates.
- **ROADMAP LOCATION:** `PROCEDURAL-SKILL-GRADUATION`, `CONTEXT-BUDGET-01`, and later Model Fabric projections.
- **ASHLEY OWNERSHIP BOUNDARY:** Ashley owns discoverability, authorization, ranking constraints, and projection. The retrieval index is machinery and never memory or capability authority.
- **RISK IF COPIED NAIVELY:** Metadata leakage, untrusted procedure injection, model-selected permission, and retrieval scores overriding policy.
- **SMALLEST NEXT ACTION:** Run the semantic capability retrieval spike defined below.

#### Conversation-derived procedure proposals

- **WHAT GLIF DOES:** Lets a user ask the agent to turn a useful chat into a saved skill.
- **WHAT PROBLEM IT SOLVES:** Repeated workflows can be reused without manual restatement.
- **ASHLEY ALREADY HAS:** `ProcedureDefinition`, Toolkit Graduation, Agent Skills interchange, qualification, and authorization boundaries.
- **WHAT IS ACTUALLY NEW:** A high-quality proposal UX and a new evidence source: a provenance-bound interaction trace.
- **SALVAGE VERDICT:** ADAPT.
- **ROADMAP LOCATION:** `PROCEDURAL-SKILL-GRADUATION`; later Experience / Cognitive Graduation for proposal discovery.
- **ASHLEY OWNERSHIP BOUNDARY:** Experience may propose. Ashley's deterministic graduation and owner/system policy decide whether a versioned procedure exists. Invocation remains separately authorized.
- **RISK IF COPIED NAIVELY:** Freezing accidental assumptions, copying secrets, treating one success as generality, or creating executable authority from model-written instructions.
- **SMALLEST NEXT ACTION:** Specify a `ProcedureProposal` evidence packet inside the existing skill architecture.

#### Cost-threshold approvals

- **WHAT GLIF DOES:** Allows auto-approval under a credit threshold and explicit approval above it.
- **WHAT PROBLEM IT SOLVES:** Reduces approval fatigue while bounding spend.
- **ASHLEY ALREADY HAS:** Capability Authority, risk policy, external commitment and representation rules, owner approval, and PREPARE -> REVALIDATE -> COMMIT.
- **WHAT IS ACTUALLY NEW:** Cost can be a separate, owner-configured escalation axis with visible estimates.
- **SALVAGE VERDICT:** ADAPT only as one conjunct in operation admission.
- **ROADMAP LOCATION:** Later Model Fabric migration, Operational Continuity, and Observability.
- **ASHLEY OWNERSHIP BOUNDARY:** Ashley's authorization policy remains decisive. A cost policy can only further restrict an otherwise authorized action.
- **RISK IF COPIED NAIVELY:** `CHEAP == AUTHORIZED`, invisible external commitments, and stale estimates.
- **SMALLEST NEXT ACTION:** Add negative evaluation cases where cheap unauthorized actions and expensive authorized-but-unfunded actions are both refused.

#### Searchable reusable artifact library

- **WHAT GLIF DOES:** Persists, searches, groups, likes, and reuses uploaded or generated media.
- **WHAT PROBLEM IT SOLVES:** Outputs remain available and connected to their source work.
- **ASHLEY ALREADY HAS:** A planned Artifact Registry, immutable local artifact references, external managed-object identity, provenance, evidence, and Recall separation.
- **WHAT IS ACTUALLY NEW:** User-facing search/reference patterns and a provider project binding.
- **SALVAGE VERDICT:** ADAPT UX, not identity semantics.
- **ROADMAP LOCATION:** `OPERATIONAL-CONTINUITY-01` Artifact Registry and external-artifact semantics.
- **ASHLEY OWNERSHIP BOUNDARY:** Ashley owns local artifact identity, classification, admission, provenance, and evidentiary meaning. Glif owns its remote media objects and URLs.
- **RISK IF COPIED NAIVELY:** Treating a CDN URL as identity, a file as Recall, or a generated asset as trusted evidence.
- **SMALLEST NEXT ACTION:** Include remote Glif bindings in the generic Artifact Registry spike, not a Glif-specific store.

#### Work branching

- **WHAT GLIF DOES:** Forks a chat at a completed turn while leaving the original unchanged.
- **WHAT PROBLEM IT SOLVES:** Users compare alternative futures without losing the source history.
- **ASHLEY ALREADY HAS:** One Identity, continuity lineage, Thought alternatives, execution history, and sandboxed planning seams.
- **WHAT IS ACTUALLY NEW:** A clear copy-to-point UX for alternative plans.
- **SALVAGE VERDICT:** ADAPT later as plan/context lineage only.
- **ROADMAP LOCATION:** Experience / Cognitive Graduation and system-wide hardening, after Operational Continuity.
- **ASHLEY OWNERSHIP BOUNDARY:** One Ashley evaluates branches. A branch contains context, plan, or workspace state, never a second Identity or Recall authority.
- **RISK IF COPIED NAIVELY:** Divergent selves, branch-local truth, or duplicate external commitments.
- **SMALLEST NEXT ACTION:** Preserve as a later evaluation scenario. No implementation spike is needed now.

### SPIKE

#### Public-preview connector conformance

- **WHAT GLIF DOES:** Exposes a hosted high-level MCP/API with projects, jobs, assets, billing telemetry, and read-only personal-skill inspection.
- **WHAT PROBLEM IT SOLVES:** One integration can access multiple creative-media providers and workflows.
- **ASHLEY ALREADY HAS:** Provider-adapter, capability, external action, artifact, qualification, and reconciliation boundaries.
- **WHAT IS ACTUALLY NEW:** A specific candidate provider with high-level asynchronous semantics and significant unknowns.
- **SALVAGE VERDICT:** SPIKE the contract only after prerequisites. Do not integrate now.
- **ROADMAP LOCATION:** `OPERATIONAL-CONTINUITY-01`, with Evaluation/Qualification and Observability.
- **ASHLEY OWNERSHIP BOUNDARY:** The adapter may submit a bounded media brief and observe results. It may not receive Ashley cognition, Recall, owner credentials, open-ended representation, or semantic authority.
- **RISK IF COPIED NAIVELY:** Provider lock-in, data leakage, uncontrolled internal tool use, spend, ambiguous replay, and CDN-link identity errors.
- **SMALLEST NEXT ACTION:** A no-network paper/mock conformance spike, followed only later by an explicitly authorized low-value live probe.

### USE AS SUBSTRATE

#### Bounded creative-media production

- **WHAT GLIF DOES:** Orchestrates image, video, audio, code, web, and media-processing tools behind a natural-language project API.
- **WHAT PROBLEM IT SOLVES:** Ashley would not need direct adapters for every creative model or a new media orchestration runtime.
- **ASHLEY ALREADY HAS:** The correct semantic boundary for optional providers and external artifacts.
- **WHAT IS ACTUALLY NEW:** A plausible single provider for multi-model creative production.
- **SALVAGE VERDICT:** USE AS SUBSTRATE only if a future qualification passes. Current posture is `PROMISING`, `OPTIONAL`, and `SPIKE ONLY`.
- **ROADMAP LOCATION:** No new phase. Earliest meaningful work is within `OPERATIONAL-CONTINUITY-01` after the required authority, credential, artifact, and reconciliation seams exist.
- **ASHLEY OWNERSHIP BOUNDARY:** Ashley owns intent, authorization, budget, data classification, acceptance, and artifact admission. Glif supplies a media job and candidate artifacts.
- **RISK IF COPIED NAIVELY:** Glif's agent becomes a hidden cognitive or authority layer; private data enters broad content licenses; opaque model/tool choices create unbounded effects.
- **SMALLEST NEXT ACTION:** Preserve the adapter contract and rejection gates in the proposed spike. Do not connect an account.

### DEFER

#### Inspectable personalization UX

- **WHAT GLIF DOES:** Lets users explicitly ask what is remembered, add facts, and manage memory in a Customize area.
- **WHAT PROBLEM IT SOLVES:** Persistent personalization is understandable and user-directed.
- **ASHLEY ALREADY HAS:** Much stricter Recall, provenance, identity review, forgetting, Mind State, and relationship semantics.
- **WHAT IS ACTUALLY NEW:** A compact UX reference, not a semantic mechanism.
- **SALVAGE VERDICT:** DEFER to Experience / Cognitive Graduation.
- **ROADMAP LOCATION:** Phase 8.
- **ASHLEY OWNERSHIP BOUNDARY:** Only Ashley's Recall and identity-review paths can author durable cognitive meaning.
- **RISK IF COPIED NAIVELY:** Auto-saving model interpretations as facts, identity, or preferences.
- **SMALLEST NEXT ACTION:** Add to later UX research, not current architecture.

#### Programmatic skill portability

- **WHAT GLIF DOES:** The current public API lists and reads personal skills but does not document create, invoke, version, or qualification operations.
- **WHAT PROBLEM IT SOLVES:** External clients can inspect reusable user instructions.
- **ASHLEY ALREADY HAS:** Agent Skills interchange planning and stronger local qualification semantics.
- **WHAT IS ACTUALLY NEW:** A possible import source if Glif later exposes a stable, versioned format.
- **SALVAGE VERDICT:** DEFER.
- **ROADMAP LOCATION:** `PROCEDURAL-SKILL-GRADUATION` after its local contract exists.
- **ASHLEY OWNERSHIP BOUNDARY:** Imported text is an untrusted candidate procedure, never an installed capability or permission.
- **RISK IF COPIED NAIVELY:** External instructions become privileged skills or import provider-specific hidden assumptions.
- **SMALLEST NEXT ACTION:** Recheck the API during Phase 4; do nothing now.

#### Owner-facing effort tiers

- **WHAT GLIF DOES:** Offers easy labels for speed, capability, and cost trade-offs.
- **WHAT PROBLEM IT SOLVES:** Users can choose an effort class without selecting models.
- **ASHLEY ALREADY HAS:** Model Route Policy, Model Capability Profile, SpecialistSession budgets, and route receipts.
- **WHAT IS ACTUALLY NEW:** Simple UX labels.
- **SALVAGE VERDICT:** DEFER.
- **ROADMAP LOCATION:** Later Model Fabric migration, not its first slice.
- **ASHLEY OWNERSHIP BOUNDARY:** Ashley's Thought chooses effort within owner policy and capability contracts. A provider tier is a route hint, not cognition.
- **RISK IF COPIED NAIVELY:** Provider labels become capability truth or cost substitutes for qualification.
- **SMALLEST NEXT ACTION:** Preserve as later route-policy UX research.

### REJECT

The following concepts are rejected even if they are convenient in Glif's product context:

| Rejected concept | What it appears to solve | Ashley already has / what is actually new | Verdict and roadmap | Ownership boundary, naive-copy risk, and smallest action |
|---|---|---|---|---|
| Glif agent as Ashley cognition | One capable agent hides multi-tool complexity. | Ashley already has one Identity, Thought, Agency, bounded workers, and provider/model seams. Glif adds no valid semantic owner. | REJECT; no roadmap location. | Ashley owns cognition. Copying this would outsource Identity, goals, honesty, and authority. Keep Glif behind a capability adapter only. |
| Skill, retrieval, installation, or prior success as authorization | Reduces friction for reuse. | Ashley already separates procedure, capability, qualification, and current invocation authority. | REJECT; negative tests in Phase 4. | A procedure is inert until current authorization. Add tests; create no self-authorizing path. |
| Direct model/provider writes to Recall, Identity, goals, or Mind State | Makes personalization automatic. | Ashley already has provenance-bound Recall, review, explicit forgetting, and layer ownership. The only new item is UX inspiration. | REJECT semantically; UX may be P3 in Phase 8. | Provider output may only propose. Direct writes would fabricate or corrupt durable cognition. Preserve proposal/review gates. |
| Credit threshold as permission | Reduces approval fatigue. | Ashley already has independent authority, risk, budget, representation, and commitment scopes. | REJECT as authority; ADAPT only as restrictive budget policy. | `CHEAP != AUTHORIZED`. Add cheap-but-unauthorized evaluation cases. |
| Whole catalog or secret-bearing metadata in retrieval/context | Makes all tools discoverable. | Ashley has ContextProjection and can maintain a safe discovery catalog. Glif proves full injection is unnecessary. | REJECT; Phase 4/7 retrieval spike uses bounded metadata. | Leaks capabilities, accounts, and procedure secrets and increases injection surface. Split discovery and full projection. |
| Provider project/job as Ashley memory or Thought | Reuses provider persistence. | Ashley already has Work Concern, Attempt, Recall, and cognitive boundaries. Provider IDs add bindings only. | REJECT; Phase 3 stores bindings. | Operational provider state is not cognitive state. Store it under local concern/attempt identity. |
| URL, path, project ID, or response as artifact identity | Avoids a local registry. | Ashley already plans immutable artifact references and remote-object identity. Glif exposes locators but not full identity semantics. | REJECT; Phase 3 Artifact Registry. | Locators rotate and content can change. Create local identity, provider binding, and digest. |
| Provider model/tool choice as Ashley meaning or evidence | Lets one platform choose an effective route. | Ashley has Model Route Policy, receipts, evaluation, provenance, and semantic ownership. | REJECT; Glif route stays internal to a narrow substrate. | Opaque choice cannot define claim meaning, authority, or qualification. Observe and admit results locally. |
| Blind retry after timeout, record expiry, or transport ambiguity | Improves apparent completion rate. | Ashley already has `OUTCOME_UNKNOWN`, Effect Witness, and reconciliation. Glif adds a concrete expiring-handle case. | REJECT; Phase 3 negative tests. | May duplicate costs or effects. Re-observe and reconcile before any new authorized attempt. |
| Billing/status telemetry as Effect Witness | Uses available provider receipts as proof. | Ashley already distinguishes receipt from effect observation and semantic interpretation. | REJECT; Observability only. | A charge or `completed` status does not prove the intended artifact/effect. Materialize, digest, and evaluate separately. |
| Required Glif dependency or Glif nouns in semantic core | Avoids building multiple media adapters. | Ashley already has generic adapter and capability seams. Glif adds one candidate substrate. | REJECT; optional Phase 3 spike only. | Current preview churn would lock Ashley to provider lifecycle. Contain all Glif nouns in the adapter binding. |
| Model-visible credentials | Simplifies tool access. | Ashley already requires operator-owned secret and credential boundaries. | REJECT; no roadmap change. | Credential disclosure creates account, cost, and data compromise. Inject only at transport from a secret broker. |
| Confidential Ashley/owner data sent to Glif | Improves personalization and output relevance. | Ashley owns relevant context and can classify/minimize projections. Glif's public terms do not promise general confidentiality. | REJECT for current posture. | Broad license, third-party processing, and unclear retention create unacceptable leakage. Use only owner-approved low-sensitivity inputs in a future qualified adapter. |
| Branch-specific Ashley Identity or Recall | Makes alternative futures independent. | Ashley already supports one Identity and may later compare plans/context. | REJECT; plan branching may be P2 in Phase 8. | Creates divergent selves and truth. Branch context/workspace only and review any merge. |
| Glif's broad skill category copied into Ashley | Unifies workflow, persona, recipe, and style. | Ashley has more precise layer ownership and one planned Procedure/Toolkit architecture. | REJECT; no second skills architecture. | Collapsing stable identity, expression style, procedure, and capability would erase ownership boundaries. Map each imported idea to its natural Ashley layer. |

## Semantic capability retrieval

Glif confirms the mechanism: a large tool catalog can be semantically searched, and only a relevant subset needs to enter model context. It does not publish its index, ranking, authorization filters, confidentiality controls, or negative-selection behavior. Ashley must supply those semantics.

### Recommended conceptual sequence

```text
Ashley Thought request
    -> principal + tenant + data-classification visibility filter
    -> semantic retrieval over safe discovery metadata
    -> small candidate set with scores and reasons
    -> deterministic capability and policy eligibility filter
    -> fetch full descriptors / procedures only for eligible candidates
    -> bounded SkillProjection / ContextProjection
    -> model reasoning or worker proposal
    -> PREPARE
    -> revalidate authority, budget, environment, and external state
    -> COMMIT or REFUSE
```

Semantic retrieval should occur **both before and after authorization, in distinct forms**:

1. **Before per-operation authorization:** Search only an authority-scoped discovery catalog. The principal must already be allowed to know that the capability exists. Discovery metadata must exclude secrets, credential location, hidden procedures, private account names, sensitive resource identifiers, and instructions that would leak restricted capability details.
2. **After candidate discovery:** Apply deterministic capability, risk, representation, budget, environment, and data-policy filters. A score cannot weaken a denial.
3. **After eligibility:** Retrieve the full descriptor or procedure version required for reasoning. Project only the minimum instructions and schemas into `ContextProjection`.
4. **At effect time:** Revalidate current authority and world state. Retrieval and earlier eligibility do not survive a changed activation epoch, revoked account, expired approval, changed budget, or changed external object.

This preserves four separate meanings:

```text
DISCOVERABLE != CANDIDATE != ELIGIBLE != AUTHORIZED NOW
```

Provisional concepts may help contract work, but names should not be frozen yet:

| Concept | Minimum meaning | Must not mean |
|---|---|---|
| `CapabilityCandidate` | A capability reference returned by bounded discovery, with retrieval score/reason and catalog version | Permission, availability, qualification, or model choice |
| `CapabilityRetrievalResult` | Query, safe catalog scope, candidates, exclusions, index/version, and provenance | Recall, evidence of correctness, or authorization |
| `ProcedureCandidate` | A versioned qualified-or-candidate procedure reference relevant to a task | Executable authority |
| `SkillProjection` | The bounded instructional subset placed into a model/session context | The full skill store, capability binding, credentials, or policy |

### Confidentiality and poisoning controls

- Build the retrieval corpus from Ashley-owned canonical metadata, not model output or arbitrary plugin prose.
- Separate public discovery text from privileged execution instructions.
- Namespace by owner/tenant, capability class, activation epoch, and data classification.
- Bind every result to catalog version, embedding/index version, query provenance, and principal.
- Treat similarity score as ranking telemetry only.
- Refuse candidates whose descriptors are stale, unsigned, quarantined, unqualified, or outside the current authority envelope.
- Evaluate prompt injection in procedure descriptions, cross-tenant leakage, stale index entries, hidden-capability name leakage, and maliciously broad descriptions.
- Do not expose connector account names, balances, private project names, or external resource identifiers in discovery metadata unless the current principal may see them.
- Keep credentials and secret material outside retrieval, model context, Recall, and procedure documents.

Relationship to current phases:

- `PROCEDURAL-SKILL-GRADUATION` owns procedure identity, versions, candidate/graduated status, qualification, and interchange.
- `CONTEXT-BUDGET-01` owns bounded projection and eviction policy.
- Model Fabric consumes caller-built `ContextProjection`; it must not become the capability catalog or authorization owner.
- Capability/authorization services own deterministic eligibility before full projection and at commit revalidation.

## Conversation-to-procedure graduation

Glif's UX confirms that users value extracting reusable instructions from useful work. Ashley's safe interpretation is narrower:

```text
provenance-bound experience
    -> repeated-pattern recognition or explicit owner request
    -> inert procedure proposal
    -> redaction and assumption analysis
    -> deterministic tests and evaluation
    -> qualification for named environments and capabilities
    -> owner/system graduation of a version
    -> separately authorized invocation
```

`SUCCESSFUL CONVERSATION != EXECUTABLE AUTHORITY`.

### Evidence that may justify a proposal

A proposal may be created from one owner-requested trace, but graduation should normally require a broader evidence packet:

- Exact source event and artifact provenance.
- Repeated successful execution, or a justified one-shot procedure class with explicit owner review.
- Stable input/output schema and bounded preconditions.
- Explicit assumptions and known invalidating conditions.
- Named capability requirements and minimum capability versions.
- Side-effect and external-commitment classification.
- Representation requirements and prohibited representations.
- Authorization inputs that must be supplied at invocation time.
- Environment identity and qualification binding.
- Expected artifacts, remote objects, and evidence outputs.
- Failure modes, timeouts, partial success, recovery, and reconciliation behavior.
- Cost and attention estimates with observed variance.
- Negative examples and counterexamples.
- Secret redaction and data-classification review.
- At least one evaluation proving that retrieval or installation does not self-authorize invocation.

### Separation of records

| Record | Belongs here | Must stay elsewhere |
|---|---|---|
| `ProcedureDefinition` | Stable purpose, version, typed inputs/outputs, preconditions, ordered steps or constraints, expected artifacts, declared side effects, failure/recovery contract, required capability classes, environment assumptions | Owner approval, current account authority, credentials, active budget, representation scope, or a claim that current invocation is allowed |
| Authorization policy | Who may request/invoke, which targets, when, risk bounds, owner approval, representation scope, external-commitment limits, revocation and expiry | Procedure instructions or provider implementation details |
| Capability binding | Current provider/tool adapter, supported operation, credential reference, sandbox/host requirements, version, route constraints | Cognitive meaning, permission, or qualification evidence itself |
| Qualification/evaluation evidence | Test cases, environment and provider binding, observed outcomes, regressions, deterministic failures, review status, validity window | Runtime authorization, Recall truth, or promotion by implication |

The current Ashley procedure/skill architecture should remain singular. Glif skills are an external research example, not a new type beside `ProcedureDefinition`, `RecordedProcedure`, `CandidateSkill`, Toolkit Graduation, or Agent Skills interchange.

## Durable concern vs execution attempt

Glif's public contract supplies a useful but incomplete mapping:

| Glif | Ashley interpretation | Boundary |
|---|---|---|
| `project_id` | External provider binding for part of a durable Work Concern | The provider project is not the concern itself and is not cognitive memory. |
| `job_id` | Provider handle attached to one local Execution Attempt | The local attempt ID remains authoritative even if the provider handle expires. |
| Project history/assets/tier | Provider-side observations and artifacts associated with the concern | Ashley decides which observations are admitted, trusted, or promoted. |
| `working` | Provider reports ongoing work | Not proof of progress, lease health, or absence of partial effects. |
| `completed` | Provider reports a completed job result | Requires artifact observation, digesting, policy checks, and acceptance. |
| `failed` | Provider reports job failure | Does not by itself prove no cost, artifact, or external side effect occurred. |
| Job record expiry | Poll handle no longer available | Must not erase local attempt history or authorize retry. |

A durable Work Concern should retain:

- Objective, scope, constraints, priority, and current owner directives.
- Authority and budget envelope references, without embedding credentials.
- Current plan and unresolved questions.
- Local artifacts, remote object bindings, and evidence.
- Attempt lineage and provider handles.
- Partial results and unresolved effects.
- Queued input dispositions.
- Current operational state and next admissible transition.

Each Execution Attempt should retain:

- Local attempt ID and parent concern ID.
- Worker/provider binding and environment fingerprint.
- Exact input snapshot, capability contract version, and authority observation.
- PREPARE and REVALIDATE records.
- Transport receipt and provider `project_id`/`job_id` where applicable.
- Status observations with timestamps and source.
- Cost estimate, actual billing observations, and accumulated totals.
- Artifact observations and content digests.
- Effect intent, witness, reconciliation state, and final disposition.

### Timeout, retry, and ambiguity

Glif's public API does not document cancellation or idempotent replay. Its poll record expires. Therefore an Ashley adapter must assume:

- A pre-send local refusal can be `REFUSED` only when execution was not submitted.
- A transport loss after possible submission is `OUTCOME_UNKNOWN` until reconciled.
- An expired job record is not a retry signal.
- `failed` is a provider observation, not automatically proof that no artifacts or charges exist.
- A retry must be a new attempt after reconciliation and renewed authorization.
- Existing project media and billing observations must be re-read before another compose call.
- Partial artifacts are a first-class result. Fan-out/fan-in must preserve per-child disposition instead of collapsing the aggregate to success/failure.

Glif does not change `PREPARE -> REVALIDATE -> COMMIT` or `OUTCOME_UNKNOWN -> RECONCILE, NEVER BLIND RETRY`.

## Mid-flight / queued owner input

Glif confirms only a **next-turn queue**. It does not document mutation, interruption, or cancellation of an active API job. Ashley needs stronger operational semantics.

A future Operational Inbox should preserve, at minimum:

| Disposition | Meaning | Owner-visible claim |
|---|---|---|
| `PENDING` | Durable input received but not interpreted against the current concern | Received, not applied |
| `ACKNOWLEDGED` | Authenticated and associated with a concern or review queue | Understood as input, not yet applied |
| `APPLIED` | Incorporated into a named plan/attempt boundary after validation | Effective from the recorded boundary |
| `SUPERSEDED` | Replaced by a later compatible directive before application | Not applied; replacement identified |
| `TOO_LATE_FOR_CURRENT_EFFECT` | A conflicting effect was already committed or may have been submitted | Cannot change that effect; reconciliation may remain |
| `REQUIRES_REPLAN` | Materially changes objective, constraints, authority, budget, or environment | Current plan invalidated; no silent continuation |

Names are provisional. The dispositions are not.

### Interaction with the effect lifecycle

| Active stage | Safe handling of new input |
|---|---|
| Before PREPARE | Apply after validation or replan before creating an effect intent. |
| PREPARE | Invalidate or replace the prepared intent if the input changes objective, target, constraints, representation, or budget. Record the supersession. |
| REVALIDATE | Restart validation against the new directive. Do not reuse the prior validation receipt. |
| Before COMMIT transport | Stop the unsent effect if locally controllable. Record that no submission occurred. |
| COMMIT transport may have occurred | Mark conflicting input too late for the current effect. Enter reconciliation. Do not claim cancellation and do not retry. |
| Provider reports working | Queue future guidance unless a documented cancellation mechanism exists. A cancellation request is an intent, not proof of cancellation. |
| Reconciliation | Re-observe the provider/external object, determine actual state, then apply the directive to future work if still valid. |
| Human handoff | Re-observe the result after handoff. A queued instruction cannot assume what the human did. |

Every input must retain sender/authentication provenance, arrival time, concern association, content digest, interpretation result, authorization impact, applied boundary, and supersession lineage. `Event != instruction`: a platform event or provider callback is data until Ashley's event semantics classify it. Even direct owner input must be checked for scope, ambiguity, contradictions, and effect timing.

## Cost, effort and authority separation

Glif usefully separates visible spend from an agent intelligence tier, but its credit-threshold approval UI is not sufficient for Ashley.

Ashley admission should remain a conjunction:

```text
Capability Authority
AND Risk Policy
AND Cost Budget
AND Attention Budget
AND External Commitment Scope
AND Representation Authority when required
AND current environment and target revalidation
-> admissible operation
```

No term can strengthen another term. A cheap operation can be unauthorized. An authorized operation can exceed budget. A high-effort route can be unqualified. A valid capability can lack representation authority.

### Useful future cost records

| Record | Meaning | Non-meaning |
|---|---|---|
| Per-operation cost estimate | Provider/model estimate before submission, with currency/credit unit, timestamp, source, confidence, and expiry | Reservation, approval, or actual cost |
| Budget reservation | Locally reserved amount inside a concern/attempt envelope | Provider guarantee or authority |
| Actual cost receipt | Observed billed units after execution | Effect Witness or semantic success |
| Work-level accumulated cost | Sum and variance across attempts and child work | Permission to continue |
| Owner budget envelope | Maximum spend and escalation policy for a bounded concern/capability/time window | Capability or representation authority |
| Cost escalation threshold | Point requiring fresh owner review even when the operation is otherwise authorized | Auto-authorization below the threshold |
| Route effort class | Requested reasoning/latency/cost trade-off | Provider capability truth or model identity |

Glif documents that one credit equaled USD 0.01 at the 2026-03-24 launch. Its terms allow the credit system and price to change. Therefore that conversion is not a durable contract.

### Model Fabric reconciliation

- The first `MODEL-FABRIC-01` slice remains exactly `thought_observation_shadow`. No Glif finding expands it.
- ModelCapabilityProfile should continue describing relatively stable capability properties. Current price, balance, and transient availability do not belong in its identity.
- Later route policy may consume separate cost estimates, latency observations, effort class, and budget envelopes.
- ContextProjection may later carry a bounded eligible procedure/capability subset. The caller constructs it; the model provider does not discover authority.
- SpecialistSession budgets remain ceilings. They do not grant capabilities or effects.
- Model/result receipts record route and billing facts. They do not waive deterministic qualification failures.

Required evaluation cases include cheap-but-unauthorized, authorized-but-over-budget, estimate-under-actual, billing-with-failed-result, partial fan-out cost, route-tier drift, and revoked authority after estimate but before commit.

## Artifact identity and library semantics

Glif demonstrates the value of a persistent, searchable media library. It does not publish enough identity semantics to use its links as Ashley artifact identity.

Ashley must preserve these separations:

| Concept | Authoritative meaning |
|---|---|
| ExecutionWorkspace artifact | A local materialization scoped to work/execution, with an immutable Ashley reference and content digest |
| External Artifact / Managed Object | A provider-owned object identified by provider, namespace, stable remote ID, observed revision, and mutation base |
| Generated media | A media artifact class; it may have both local materialization and remote provider binding |
| Evidence | An admitted observation used for a specific claim under provenance and qualification rules |
| Recall | Ashley-owned durable cognitive memory under Recall semantics |
| File path or URL | A locator. It is not identity, truth, Recall, or authority. |

A future generic Artifact Registry should support fields equivalent to:

- Ashley immutable artifact UUID.
- Artifact classification and media type.
- Provider and account/tenant namespace.
- Stable provider object ID when available.
- Provider project ID and job ID as origin bindings, not identity substitutes.
- Revision/version, ETag, generation, or explicit `UNKNOWN`.
- Content digest of each observed/materialized version.
- Originating concern and attempt.
- Creator capability and adapter version.
- Input artifact references and transformation lineage.
- Local materialization path and validation state.
- Remote canonical locator and expiry/refresh metadata.
- Mutation base and expected prior revision for writes.
- Effect intent, transport receipt, post-write observation, and Effect Witness reference.
- Provenance, classification, owner visibility, retention, and deletion/tombstone state.

For a future Glif adapter:

- Create the Ashley artifact UUID locally.
- Preserve Glif `project_id` and `job_id` as origin bindings.
- Treat returned `resource_link` or CDN URL as a locator.
- Fetch only when authorized and safe; compute a content digest on materialization.
- Record media type and source observation.
- Quarantine generated content until validation and admission.
- Do not infer stable remote identity, version, mutability, or delete semantics that Glif does not expose.
- Never store an artifact in Recall merely because it was useful or generated by Ashley-directed work.

This strengthens the already planned Artifact Registry. It does not require a new registry architecture or roadmap phase.

## Branching / counterfactual work

Glif branches only from a completed assistant turn and copies messages, assets, and context to a new conversation. This is useful as a product reference for immutable source history and forked future exploration.

Ashley-safe uses are:

- Counterfactual Thought exploration with no effects.
- Alternative work-plan branches before an execution choice.
- Sandboxed comparison of plans or artifacts.
- Retained execution history with a new future plan after an explicit fork point.

Ashley must reject:

- A second Ashley Identity.
- Branch-specific constitutional authority.
- Branch-local Recall truth or forgetting.
- Duplicate owner commitments.
- Implicit replay of external effects.
- Merging a branch by copying model conclusions directly into Mind State or Recall.

A branch should carry lineage to its source context/plan/artifact snapshot, a declared purpose, effect prohibition or explicit capability envelope, and a merge/admission review. Existing Identity, Recall, capability authority, and current external state remain singular and authoritative. This is `LATER`, not `USEFUL NOW`.

## Glif as bounded creative-media substrate

### Required shape

```text
Ashley-owned intent and Thought
    -> deterministic capability / authorization / budget / data checks
    -> GlifConnector capability adapter
    -> local Work Concern + Execution Attempt
    -> Glif project_id + job_id
    -> Glif internal agent/tools/models
    -> untrusted result and remote media locators
    -> Ashley-owned observation, digesting, evaluation, and artifact admission
```

This shape is prohibited:

```text
Ashley -> Glif agent as Ashley cognition, memory, authority, or goal owner
```

### Current contract assessment

| Question | Current answer | Ashley implication |
|---|---|---|
| Authentication model | OAuth 2.1 + PKCE/dynamic registration for MCP; `glif_v1_...` bearer token for direct HTTP | Credential reference must stay in an Ashley-owned secret broker. Never project tokens into models, skills, Recall, artifacts, or logs. Published fine-grained scopes are UNKNOWN. |
| Async job model | Every compose call returns a job immediately; client polls about every five seconds and honors `pollIntervalSeconds` | Fits a provider-handle adapter and durable attempt. Requires local polling state and lease independence. |
| Project identity | `project_id` persists history, assets, and intelligence tier | Store as an external binding. It is not Work Concern identity or cognitive continuity. |
| Job identity | `job_id` identifies one compose call and poll handle | Store under a local attempt ID. Provider status expires after about 30 minutes. |
| Artifact identity | Media arrives as `resource_link`; project inspection exposes generated media; upload returns a media URL | Locator support is confirmed. Stable artifact ID, version, digest, and mutation semantics are UNKNOWN. Create local identity and digest. |
| Status model | `working`, `completed`, `failed`; `get_project` exposes active/latest state | Useful transport observations. Insufficient for Effect Witness or no-effect proof. |
| Cancellation | No current public tool or contract found | Treat cancellation as unsupported. Never claim a request stopped. |
| Retry behavior | No current idempotency key, safe-replay, or reconciliation contract found | Do not automatically retry. Re-observe project/media/billing and obtain renewed authority. |
| Rate limits | Per-credential HTTP 429 documented; numbers and reset semantics not published | Qualify backoff and budget behavior. Do not assume capacity. |
| Cost | Generation spends credits; read helpers are documented as free; intelligence affects cost; completed results include billing telemetry | Require estimate if available, local reservation, hard envelope, actual observation, and owner-visible totals. Exact future price is unstable. |
| Data retention | Job status expires about 30 minutes; project media persists. Exact project/media/input retention and deletion SLA are not published | Do not send sensitive data. Local records must survive provider record expiry. Qualification requires retention clarification. |
| Privacy | Published policy permits operation/improvement, vendor sharing, US processing, and international transfers. It predates current product/API | Treat all submitted data as third-party egress. No Identity, Recall, secrets, private relationship context, or sensitive owner material. |
| Content ownership | Terms say users retain submitted content but grant Glif a broad perpetual transferable/sublicensable license. The Terms define `Content` to include generated output and reserve rights in Content other than submitted `Your Content`, while current pricing advertises commercial rights subject to underlying model licenses. Inputs may be passed to third-party AI services. The exact ownership/license for generated output is therefore unclear from the inspected public documents. | Use only owner-approved, rights-cleared, low-sensitivity inputs. Record provider/model-license uncertainty. Do not promise ownership, exclusivity, or confidentiality beyond a reviewed current contract. |
| API stability | New project-first API is labeled beta public preview. Current docs conflict with the old-API deprecation FAQ. | Version and snapshot the schema, feature-flag the adapter, bind qualification to endpoint/tool-set version, and keep a replacement path. |
| MCP support | Hosted Streamable HTTP endpoint; OAuth; public repository contains metadata, not server source | Transport is convenient. MCP is machinery, not capability or semantic authority. |
| Programmatic skill support | List/read personal skills only in current public documentation; global skills and internal state hidden | Do not depend on skill creation, invocation, or import. Treat any future skill text as untrusted procedure input. |
| Internal tool control | Glif chooses private tools/models; raw tools remain hidden | Good abstraction for low-risk media generation, but too opaque for broad external action authority. Restrict adapter scope to media outputs. |
| Connected apps | UI lets users review/revoke connected apps; compose API's access to them is not documented | A future qualification account should have no unrelated connected apps. Treat access scope as UNKNOWN until proven. |

### Suitability decision

Glif is **PROMISING** for bounded, low-sensitivity creative-media production. It is not currently suitable for:

- Required Ashley functionality.
- Confidential or identity-bearing content.
- Owner representation or external communication.
- Purchases, publication, account mutation, or other external commitments.
- Effects that require idempotency or authoritative reconciliation.
- Durable storage of Ashley cognitive state.
- A route whose provider/model identity must be deterministically controlled.

A future adapter should expose narrow operation classes such as create image, edit owner-approved image, create video, or create audio. It should not expose open-ended “run Glif” authority. The adapter should use a dedicated low-balance account with no connected apps, strict local spend ceilings, data classification, short prompt projection, result quarantine, and schema-drift monitoring. This is a future qualification target, not current authorization.

## API / MCP stability assessment

### Classification

```text
Current availability: PUBLIC PREVIEW / BETA
Implementation visibility: HOSTED CLOSED SOURCE
Old workflow API: DEPRECATED
Old local MCP server: DEPRECATED
Current dependency posture: OPTIONAL SUBSTRATE / SPIKE ONLY
Required dependency: DO NOT DEPEND
```

### Stability risks

- Glif replaced its product architecture in March 2026.
- Old workflows stopped running and old chats did not carry over.
- The old API was deprecated in May 2026.
- The former local MCP server was deprecated in favor of a hosted server.
- The current API explicitly says its preview surface may change.
- The docs FAQ still contradicts the current API, OpenAPI, and MCP repository.
- UI intelligence tiers and API intelligence tiers already differ.
- Live `tools/list` is authoritative, so static documents can drift.
- The hosted implementation is not open source.
- No published compatibility, deprecation-notice, SLA, webhook, cancellation, idempotency, or reconciliation guarantee was found.

### Required replaceability posture

- Bind Ashley to a generic creative-media capability contract, not Glif nouns.
- Keep `project_id`, `job_id`, billing fields, and resource links inside the adapter/provider binding.
- Snapshot OpenAPI, `tools/list`, and tool schemas during each qualification run.
- Fail closed on schema/tool-set drift.
- Bind qualification to endpoint, adapter version, authentication mode, account scope, and observed provider behavior.
- Keep alternate provider adapters possible.
- Never make provider unavailability a reason to weaken authority, privacy, evidence, or outcome semantics.
- Do not infer stability from OpenAPI `1.0.0` or MCP registry `1.0.0` while the product calls itself beta public preview.

## Security / authorization implications

| Review question | Finding | Required Ashley boundary |
|---|---|---|
| What authority does Glif receive? | A compose request lets Glif choose internal tools/models and spend account credits. Other internal effects are not fully enumerated. | Grant only a narrow media-operation capability with explicit output class, data class, spend envelope, and no representation scope. |
| What data leaves Ashley? | Prompt, attachments, project context sent in the call, and provider-visible metadata. Glif may pass inputs to third-party AI services. | Minimize and classify projection. Exclude Identity, Recall, private conversations, relationship data, secrets, credentials, and unrelated context. |
| What credentials are exposed? | OAuth access token or API bearer token reaches the hosted endpoint. | Secret broker owns it. Adapter injects it at transport only. Never make it model-visible. |
| Can it create external commitments? | It creates paid provider jobs and persistent remote media/projects. Connected-app reach is unknown. | Treat submission as a cost-bearing external effect. Use a dedicated account with no connected apps and narrow capability scope. |
| Can it represent the owner? | Media may embody owner-requested content, but no owner-representation contract is documented. | No publication, messaging, endorsement, or identity claim. Communication capability remains separate from representation authority. |
| Can it cause irreversible effects? | Credits are spent; content may persist; broad content license may attach; external providers process inputs. | PREPARE, revalidate data rights/authority/budget, then COMMIT. Expose the data/rights consequence to the owner when material. |
| Can it mutate persistent artifacts? | It continues provider projects and creates media. Version/mutation semantics are not public. | Treat continuation as a provider mutation. Preserve mutation base observation and never overwrite local artifact identity. |
| Can it create costs? | Yes. | Cost is a separate deterministic gate and observable receipt. |
| Can it retain data? | Yes; project media persists, and legal/privacy terms allow service operation/improvement and vendor processing. Exact retention is unknown. | No sensitive inputs. Record retention uncertainty and provide local deletion/tombstone semantics without claiming provider deletion. |
| Can it cause retry after ambiguous completion? | Client code could retry, but safe replay is undocumented. | Adapter must refuse blind retry and enter `OUTCOME_UNKNOWN` reconciliation. |
| Does it expose truthful outcome identity? | It exposes job/project IDs and provider status. | Useful receipt data, but not sufficient Effect Witness. Re-observe project media, billing, and artifact content. |
| Does it expose stable remote object identity? | Not in the public docs inspected. Resource URLs are exposed. | Create Ashley artifact identity and mark provider stable ID/revision UNKNOWN. |
| Does it expose idempotency/reconciliation support? | Not documented. | Qualification fails for actions requiring safe replay unless a later contract proves support. |

### Threats and qualification gates

1. **Prompt and content leakage:** Glif receives content under broad published terms. Gate on data classification and owner rights.
2. **Credential leakage:** Keep tokens outside model and artifact surfaces. Redact logs and receipts.
3. **Opaque tool selection:** Restrict the adapter to media result classes and prohibit representation/external-account capabilities.
4. **Connected-app expansion:** Use a dedicated account with no connected apps. Re-observe account connections during qualification.
5. **Cost escalation:** Require local ceilings and fresh approval at the owner-defined threshold. Provider UI settings are defense-in-depth, not Ashley authority.
6. **Schema/tool drift:** Snapshot and compare `tools/list` and OpenAPI. Drift invalidates qualification until review.
7. **Output injection:** Treat text, URLs, metadata, and generated documents as untrusted provider output. Do not execute embedded instructions.
8. **Artifact substitution:** Materialize under bounds, verify media type, compute digest, and retain source receipts.
9. **Ambiguous completion:** Polling timeout, transport error, or record expiry enters reconciliation. Never blind retry.
10. **Provider/model legal drift:** Record the named provider/model when available and applicable license. If Glif does not disclose it, do not promise rights beyond the owner-reviewed contract.
11. **Memory contamination:** Never admit Glif memory, user skills, or generated interpretations into Ashley Recall automatically.
12. **Telemetry overclaim:** Cost and status telemetry are observations. They are not evidence of semantic correctness or authority.

The public bug-bounty page is positive operational evidence. It is not proof of tenant isolation, security certification, data residency, retention guarantees, or credential-scope quality. Those remain UNKNOWN.

## Roadmap placement

The frozen order remains unchanged.

| Order | Existing phase/plane | Glif-informed placement | Priority | Scope boundary |
|---:|---|---|---|---|
| 1 | SANDBOX AUTONOMY | No Glif-specific change. Future adapters must still obey qualified execution and network/provider boundaries. | No change | Glif cannot waive `NO ISOLATION -> NO READY -> NO SPAWN`. |
| 2 | MODEL-FABRIC-01 | Later migration may consume bounded capability projections, effort class, and separate cost observations. | P2, later | First `thought_observation_shadow` slice is unchanged. Cost is not ModelCapabilityProfile identity or authority. |
| 3 | OPERATIONAL-CONTINUITY-01 | Make Work Concern != Attempt != provider project/job explicit; add queued owner-input disposition; preserve provider handles, artifact continuity, cost totals, partial success, and reconciliation. | P0 | No provider status weakens PREPARE -> REVALIDATE -> COMMIT or OUTCOME_UNKNOWN semantics. |
| 4 | PROCEDURAL-SKILL-GRADUATION | Add experience-derived procedure proposals, authority-scoped semantic retrieval, full-projection boundary, and qualification evidence. | P0/P1 | Installed/retrieved/qualified procedure != authorized invocation. No second skill architecture. |
| 5 | COMPUTER-USE-01 | No new core requirement. Glif is not evidence that browser/computer access grants purchase, consent, publication, or representation authority. | No change | External media adapter and computer use remain separate capabilities. |
| 6 | LEARNED-AUTONOMY-01 | Preference-aware candidate ranking may improve selection after deterministic visibility and policy filters. | P2 | Learned preference may rank allowed candidates; it never creates capability or authority. |
| 7 | CONTEXT-BUDGET-01 | Project only a small eligible set of capability/procedure descriptors. Evaluate retrieval leakage, stale indexes, and bounded context cost. | P1 | Context is attention, not memory authority. Eviction is not forgetting. |
| 8 | EXPERIENCE / COGNITIVE GRADUATION + SYSTEM-WIDE HARDENING | Consider inspectable remembering UX, counterfactual plan branches, and experience-to-procedure proposal discovery. | P2 | One Ashley. No direct provider/model writes to Identity, Recall, or Mind State. |
| Cross-cutting | EVALUATION / QUALIFICATION PLANE | Add route/provider-bound tests for retrieval leakage, cost/authority separation, schema drift, queue disposition, artifact identity, timeout ambiguity, and no-blind-retry. | P0 across affected work | Local test success is not provider/runtime promotion. |
| Cross-cutting | OBSERVABILITY PLANE | Expose concern/attempt/provider status, queued input disposition, cost estimate/actual/total, artifact lineage, and reconciliation state. | P0 across affected work | Telemetry is not evidence by default. |

Artifact Registry and external artifact semantics remain inside Phase 3 operational architecture. They do not require a ninth phase.

## Proposed spikes

These are future spikes inside existing phases. They are proposals only.

### Spike 1: Durable concern / attempt / provider-handle contract

- **SPIKE NAME:** `OPCONT-CONCERN-ATTEMPT-HANDLE-SPIKE` (provisional)
- **ROADMAP PHASE:** `OPERATIONAL-CONTINUITY-01`
- **QUESTION:** Can one local concern retain multiple attempts and short-lived provider handles without losing authority, artifact, cost, or ambiguity state?
- **SCOPE:** Inert contract/types and fixture traces for new attempt, resume, provider poll expiry, partial result, retry refusal, and reconciliation.
- **OUT OF SCOPE:** Live providers, Glif account, runtime activation, Sandbox change, external effect, or UI.
- **ASHLEY CONTRACTS TOUCHING:** Work Concern, Execution Attempt, WorkerProvider, event fabric, EffectCommitRecord, Reconciliation, Artifact Registry.
- **SUBSTRATE:** Local deterministic fixtures modelled on generic provider project/job behavior.
- **TEST / EVALUATION:** Multiple jobs under one concern; transport ambiguity; expired provider status; partial fan-out; changed authority before retry; artifact continuity.
- **SUCCESS:** Concern survives attempt/provider expiry, every effect has one disposition, and no ambiguous case auto-retries.
- **FAILURE / REJECTION CRITERIA:** Provider project becomes concern identity; expired/failed maps to no-effect without evidence; retry occurs without reconciliation.
- **DEPENDENCIES:** Current Sandbox Autonomy and Model Fabric ordering remain prerequisites. Phase 3 contract work only.

### Spike 2: Authority-scoped semantic capability retrieval

- **SPIKE NAME:** `CAPABILITY-RETRIEVAL-BOUNDARY-SPIKE` (provisional)
- **ROADMAP PHASE:** `PROCEDURAL-SKILL-GRADUATION`, with `CONTEXT-BUDGET-01` evaluation
- **QUESTION:** Can Ashley retrieve a small relevant candidate set without leaking restricted metadata or turning retrieval into authorization?
- **SCOPE:** In-memory catalog, safe discovery descriptors, deterministic visibility filter, semantic/lexical retrieval adapter, post-retrieval eligibility, bounded projection, and trace evidence.
- **OUT OF SCOPE:** Production embeddings, model routing changes, connectors, skill invocation, credentials, and current Model Fabric first slice.
- **ASHLEY CONTRACTS TOUCHING:** CapabilityAuthority, ProcedureDefinition/CandidateSkill, ContextProjection, qualification bindings, provenance.
- **SUBSTRATE:** Local fixture catalog with public, private, revoked, quarantined, stale, and cross-owner entries.
- **TEST / EVALUATION:** Relevance, top-k bounds, hidden-name leakage, malicious descriptions, revoked/stale entries, score ties, no-result behavior, and authorization denial after high similarity.
- **SUCCESS:** Only visible metadata is searched; full instructions are projected only after eligibility; every candidate is traceable to catalog/index versions; the model cannot authorize it.
- **FAILURE / REJECTION CRITERIA:** Restricted capability metadata leaks, similarity weakens policy, or the index becomes Recall/capability authority.
- **DEPENDENCIES:** Phase 4 procedure/capability identity and version contract. Phase 7 owns later context-budget tuning.

### Spike 3: Experience-to-procedure proposal packet

- **SPIKE NAME:** `PROCEDURE-PROPOSAL-EVIDENCE-SPIKE` (provisional)
- **ROADMAP PHASE:** `PROCEDURAL-SKILL-GRADUATION`
- **QUESTION:** What minimum trace evidence can produce an inert procedure proposal without producing executable authority?
- **SCOPE:** Proposal schema, source trace references, redaction, assumptions, typed inputs/outputs, capability requirements, side effects, failure/recovery, evaluation plan, and review dispositions.
- **OUT OF SCOPE:** Auto-graduation, autonomous installation, live invocation, model-written authority, or a second skill store.
- **ASHLEY CONTRACTS TOUCHING:** RecordedProcedure, ProcedureDefinition, CandidateSkill, Toolkit Graduation, Agent Skills interchange, evaluation/qualification.
- **SUBSTRATE:** Existing Ashley conversation/execution fixtures and synthetic repeated patterns.
- **TEST / EVALUATION:** One success, repeated success, conflicting results, hidden secret, environment-specific success, authorization-bearing instructions, unsafe retry, and owner-requested one-shot extraction.
- **SUCCESS:** Proposals are useful, versioned, provenance-bound, redacted, and inert until separate graduation and invocation authorization.
- **FAILURE / REJECTION CRITERIA:** A source conversation directly becomes active procedure/capability/Recall or embeds credentials/current permission.
- **DEPENDENCIES:** Phase 4 canonical procedure and qualification contract.

### Spike 4: Durable owner-input inbox semantics

- **SPIKE NAME:** `OPERATIONAL-INBOX-DISPOSITION-SPIKE` (provisional)
- **ROADMAP PHASE:** `OPERATIONAL-CONTINUITY-01`
- **QUESTION:** Can new owner input be durably classified and applied at a truthful boundary while an attempt or external effect is active?
- **SCOPE:** Input record, authentication/provenance, concern association, dispositions, supersession, replan, PREPARE/REVALIDATE/COMMIT interaction, reconciliation, and owner-visible claims.
- **OUT OF SCOPE:** Discord UI polish, provider cancellation implementation, or live external actions.
- **ASHLEY CONTRACTS TOUCHING:** Event fabric, Work Concern, Execution Attempt, Effect Intent, Reconciliation, human handoff.
- **SUBSTRATE:** Deterministic event/attempt fixtures.
- **TEST / EVALUATION:** Refine before prepare; contradict during revalidation; cancel before send; cancel after possible send; superseding messages; unrelated concern; ambiguous owner input; human handoff.
- **SUCCESS:** Every input has an explicit disposition and applied boundary; no message silently mutates committed history; cancellation is never overclaimed.
- **FAILURE / REJECTION CRITERIA:** Queue receipt is reported as application, or a late input triggers blind compensation/retry.
- **DEPENDENCIES:** Phase 3 concern/attempt/effect lifecycle.

### Spike 5: Generic Artifact Registry identity

- **SPIKE NAME:** `ARTIFACT-IDENTITY-REGISTRY-SPIKE` (provisional)
- **ROADMAP PHASE:** `OPERATIONAL-CONTINUITY-01`
- **QUESTION:** Can local, remote, generated, and materialized artifacts share lineage without conflating path, URL, provider object, evidence, or Recall?
- **SCOPE:** Local immutable UUID, provider binding, revision/UNKNOWN, digest, origin concern/attempt, creator capability, local materialization, remote locator, mutation base, effect witness, and provenance.
- **OUT OF SCOPE:** Global media library UI, provider-specific production adapter, Recall admission, and automatic evidence promotion.
- **ASHLEY CONTRACTS TOUCHING:** ExecutionWorkspace, Artifact Registry, external managed objects, Effect Witness, provenance, Recall boundary.
- **SUBSTRATE:** Local files and synthetic expiring CDN/provider references.
- **TEST / EVALUATION:** URL rotation, same bytes/different object, changed bytes/same URL, missing revision, partial download, conflicting media type, deleted remote object, and re-materialization.
- **SUCCESS:** Identity and lineage remain stable; content versions are observable; no path/URL becomes authority or Recall.
- **FAILURE / REJECTION CRITERIA:** Locator equals identity, provider metadata becomes truth, or artifact existence implies evidentiary admission.
- **DEPENDENCIES:** Phase 3 operational schema and existing external-artifact conclusions.

### Spike 6: Glif creative-media adapter conformance

- **SPIKE NAME:** `GLIF-CREATIVE-SUBSTRATE-CONFORMANCE-SPIKE` (provisional)
- **ROADMAP PHASE:** `OPERATIONAL-CONTINUITY-01`, cross-cut by Evaluation/Qualification and Observability
- **QUESTION:** Can the current Glif preview satisfy a narrow replaceable media-provider contract without receiving Ashley cognition or weakening effect semantics?
- **SCOPE:** First paper/mock adapter; schema snapshot; narrow media operations; project/job binding; spend fields; result quarantine; artifact digest; timeout/429/status-expiry handling; no-retry behavior; data-classification gate. A later live probe requires separate explicit authorization.
- **OUT OF SCOPE:** Current account connection, paid calls, production dependency, connected apps, confidential content, publication, representation, Recall/memory integration, skill import, Model Fabric expansion, or activation.
- **ASHLEY CONTRACTS TOUCHING:** Capability adapter, credential broker, Work Concern/Attempt, Artifact Registry, budgets, effect receipt/reconciliation, qualification binding.
- **SUBSTRATE:** Public docs and deterministic mocks first; dedicated low-balance Glif account only in a separately authorized later probe.
- **TEST / EVALUATION:** Schema drift; 401/429; working/completed/failed; poll expiry; transport ambiguity; duplicate submit prevention; cost overrun; malformed/resource-link substitution; provider project reuse; no stable remote ID; prohibited data.
- **SUCCESS:** The adapter is replaceable; no credential or private context reaches model-visible data; costs are bounded; artifacts are locally identified and digested; every ambiguous outcome reconciles or remains `OUTCOME_UNKNOWN`.
- **FAILURE / REJECTION CRITERIA:** Requires open-ended Glif-agent authority, confidential data, blind retry, unbounded spend, connected-app reach, provider-specific core semantics, or a claim that resource links are Effect Witnesses.
- **DEPENDENCIES:** Qualified generic provider/action boundary, credential handling, Phase 3 concern/attempt and artifact contracts, and fresh review of Glif terms/API. No current implementation dependency.

## Rejected architecture drift

Glif does not justify any of the following changes:

- No new roadmap phase.
- No roadmap reordering.
- No expansion of the first `MODEL-FABRIC-01` slice.
- No Sandbox change, dependency, activation, or qualification claim.
- No new cognitive core, agent hierarchy, or second Ashley.
- No new Recall implementation or provider-owned memory authority.
- No second skills architecture beside Procedure/Toolkit Graduation and Agent Skills interchange.
- No provider-specific `GlifProject` or `GlifJob` type in Ashley semantic core. Those are adapter bindings.
- No weakening of child-authority attenuation or deterministic authorization.
- No inference that a connected Glif account delegates any capability, connected-app access, representation scope, or external commitment.
- No conversion of cost threshold, retrieval relevance, skill installation, or past success into permission.
- No replacement of Effect Intent, Effect Witness, reconciliation, or `OUTCOME_UNKNOWN` with provider status.
- No equation of operational state with cognitive concern.
- No equation of telemetry, provenance, or billing with truth.
- No direct ingestion of Glif output, memory, skill text, or asset metadata into Identity, Mind State, Thought, or Recall.
- No required Glif dependency and no provider lock-in.
- No assumption that hosted MCP is safer or more authoritative merely because raw tools are hidden.

## Open questions

These questions are not blocking this dossier. They block or constrain a future live qualification:

1. Does `compose_project` support an idempotency key, client correlation ID, or safe duplicate detection?
2. Is there a supported cancellation endpoint? What does cancellation prove about already-started provider work and charges?
3. Can a client reconcile a timed-out or expired `job_id` through project events, billing events, or stable artifact IDs?
4. Are generated media objects assigned stable IDs independent of CDN URLs? Are revisions, ETags, content digests, or deletion tombstones exposed?
5. What are the numerical rate limits, reset headers, burst limits, concurrency limits, and account-level quotas?
6. What are the exact retention and deletion rules for prompts, attachments, project history, generated media, logs, and backups?
7. Which downstream model/provider receives each input? Is per-run provider disclosure available? What provider-specific training/retention terms apply?
8. Does the current API offer contractual no-training, confidentiality, enterprise retention, regional processing, or data-processing terms?
9. Can `compose_project` access connected apps or any non-media external actions? Can those be disabled or scope-limited at the token/account level?
10. What OAuth scopes and token revocation/audience controls exist? Can a token be restricted to read-only or media-generation-only operations?
11. Is there a preflight cost estimate or budget ceiling accepted by the API, or only post-run billing telemetry and UI approval policy?
12. What is the current exact meaning of `failed`? Can it coexist with partial artifacts or charges?
13. Are callbacks/webhooks/MCP tasks available for durable completion, and what delivery/replay semantics do they provide?
14. What compatibility and deprecation policy applies to the new API, tool names, schemas, project data, and hosted MCP endpoint?
15. Will personal skills gain programmatic create/version/invoke operations? What is their schema and trust model?
16. Does chat branching have an API equivalent for projects, and does it create new stable artifact/project lineage?
17. What ownership attaches to generated output, distinct from submitted input, and how are underlying model licenses surfaced per result?
18. Why does the recently updated Docs FAQ still say no API while the current site exposes a beta public-preview API? Which document has formal lifecycle authority?

## Final prioritized salvage map

| Rank | Finding | Class | Value | Implementation cost | Architecture risk | Dependency risk | Why now / why later |
|---:|---|---|---|---|---|---|---|
| 1 | Durable Work Concern != Execution Attempt != provider project/job | P0 | Very high | Low for contract clarification; medium for later runtime | Low if Ashley IDs remain authoritative | Low | Already planned Phase 3 work. Glif provides concrete async/expiry cases that should shape the contract now. |
| 2 | Durable queued owner-input disposition across effect stages | P0 | High | Medium | Medium because late cancellation claims can be dangerous | Low | Fits Phase 3 and closes an owner-steering gap before long-running work exists. |
| 3 | Cost/status/artifact observability by concern and attempt | P0 | High | Medium | Low if telemetry remains non-authoritative | Medium for provider data | Cross-cutting evidence should be designed with Phase 3 records, not bolted on later. |
| 4 | Authority-scoped semantic capability/procedure retrieval | P1 | High | Medium | High if retrieval leaks or self-authorizes | Medium for index implementation; low if local | Valuable for Phase 4 and Phase 7. Wait for canonical procedure identity, but preserve the two-stage boundary now. |
| 5 | Conversation experience -> inert procedure proposal -> qualification | P1 | High | Medium/high | High if success becomes authority | Low | Directly strengthens planned Procedure/Toolkit Graduation. It needs the Phase 4 contract before implementation. |
| 6 | Generic Artifact Registry with provider bindings and content digests | P1 | High | Medium | Medium | Low | Already planned. Glif shows the UX value and missing provider identity fields. Build generically in Phase 3. |
| 7 | Glif as a bounded creative-media substrate | P1 | Potentially high | Medium for adapter; high for qualification | High if scope or data boundary expands | High due preview, closed source, terms, and churn | Avoids reinventing media orchestration. Start only with a mock/paper conformance spike after prerequisites. |
| 8 | Cost/effort tier in later Model Route Policy | P2 | Medium | Medium | Medium if provider labels become capability truth | Medium | Useful later. The current Model Fabric first slice must remain unchanged. |
| 9 | Preference-aware candidate ranking | P2 | Medium | Medium | High if preference becomes authority | Low | Belongs after deterministic retrieval/authorization and Learned Autonomy contracts. |
| 10 | Inspectable explicit-remembering UX | P3 | Medium | Medium | High if copied semantically | Low | Inspiration only. Ashley already has stronger Recall semantics. Revisit only in Phase 8 UX work. |
| 11 | Plan/context branching | P2 | Medium | Medium/high | High if identity or effects branch | Low | Useful after Operational Continuity and cognitive hardening; not current work. |
| 12 | Glif-specific skills or project semantics in Ashley core | REJECT | Negative | N/A | Very high | Very high | Creates duplicate architecture and provider lock-in. |
| 13 | Glif agent as Ashley cognition or memory | REJECT | Negative | N/A | Existential | Very high | Violates Vision, Constitution, Foundation decision, and `ASHLEY OWNS MEANING`. |

### Top five salvage findings

1. Preserve durable concern identity above every execution attempt and provider job.
2. Make queued owner input a durable, truthful Operational Continuity concern.
3. Retrieve small capability/procedure candidate sets in two stages: safe discovery, then eligibility and full projection.
4. Treat conversation success as procedure-proposal evidence, never executable authority.
5. Keep Glif as a replaceable, low-sensitivity creative-media substrate candidate behind Ashley-owned authorization, budgets, artifact admission, and reconciliation.

## Proposed documentation changes

No current canonical document must change before this dossier is reviewed. If accepted, the following conservative changes may be considered later. This table is proposal-only; none were made.

| Doc | Proposed change | Why | Required now |
|---|---|---|---|
| `Ashley_Architecture_Document_Index.md` | Add this dossier as a reference/research entry after owner acceptance. | Makes the research discoverable without granting canonical authority. | NO |
| `Ashley_Architecture_Roadmap.md` | In Phase 3 contract detail, explicitly state Work Concern != Execution Attempt != provider project/job, and add durable owner-input disposition across effect stages. | The first distinction already exists in substance; the second is a useful operational requirement. | NO |
| Future `OPERATIONAL-CONTINUITY-01` contract | Add provider handle expiry, queued input, partial result, cost accumulation, and no-retry evaluation cases. | Converts Glif observations into provider-neutral acceptance criteria. | NO |
| Future `PROCEDURAL-SKILL-GRADUATION` contract | Add experience-derived inert proposal packets and `DISCOVERABLE != CANDIDATE != ELIGIBLE != AUTHORIZED NOW`. | Prevents retrieval and chat-derived procedures from becoming authority. | NO |
| `Model_Fabric_01_Contract_Draft.md` | No first-slice change. Consider a later note that route policy may consume separate cost/effort observations and eligible procedure projections. | Keeps transient cost out of capability profile identity and preserves caller-owned ContextProjection. | NO |
| `Ashley_Evaluation_Qualification_Plane.md` | Add future test families for retrieval confidentiality, cheap-but-unauthorized operations, provider schema drift, job-status expiry, and ambiguous retry refusal. | Glif exposes concrete failure cases for cross-cutting qualification. | NO |
| `Autonomous_Work_Semantics_Salvage.md` | No semantic change. Optionally cross-reference the Artifact Registry spike when Phase 3 work begins. | Existing external artifact, commitment, representation, choice, and fan-out semantics are already stronger. | NO |

## Final determination

Glif changes Ashley's **mechanism shortlist**, not Ashley's foundation.

- Roadmap order: unchanged.
- New roadmap phase: not required.
- Model Fabric first slice: unchanged.
- Sandbox: unchanged.
- Voice: remains deferred.
- Ashley cognition owner: Ashley.
- Glif role: optional, replaceable creative-media substrate candidate.
- Highest-value future spike: authority-scoped semantic capability retrieval is the strongest new mechanism; durable concern/attempt and queued-input work should first land in their already-planned Phase 3 contract sequence.
- Current live-integration recommendation: do not depend. Perform only the proposed paper/mock conformance spike when the frozen roadmap reaches the relevant work and fresh authorization exists.
