
# Ashley porting and research spike backlog

**Status:** research-only backlog prepared 2026-08-09. These are not approved
implementation tasks. Human approval is required before any spike touches code,
dependencies, packages, or third-party runtimes.

## Global rules for every spike

- Work from a temporary fixture or isolated review branch approved by the human;
  do not touch production TypeScript, package files, lockfiles, schema,
  migrations, config, live databases, secrets, Mint, deployment, or Discord.
- Do not install packages, execute third-party code, launch a plugin/MCP server,
  call a live model, make a network request, or record capability evidence in
  the first research pass.
- Keep masterMode and all capability releases unchanged. No promotion,
  cutover, rollback, apply, or live/shadow evidence is allowed.
- A framework run ID, checkpoint, trace, plugin manifest, or filesystem
  artifact is not Ashley authority, identity, Recall, delivery, or consent.
- Each spike must end with an explicit ACCEPT, REJECT, or KEEP-CURRENT decision
  and a file/LOC measurement based on the actual fixture.

## P-01 — Durable cognition adapter parity

**QUESTION:** Can a replaceable workflow substrate provide generic job
claim/lease/recovery, suspend/resume, retry, inspection, and trace mechanics
for one Ashley cognition job without owning semantic materialization or
behavioral authority?

**HYPOTHESIS:** Mastra and LangGraph.js can both host a synthetic
consolidate_thread execution envelope, but an AshleyWorkflowRuntime adapter
must retain exact provenance, idempotency, capability snapshots, atomic
materialization, and observe-only non-interference. One candidate may reduce
generic lifecycle code, but neither can replace the semantic worker.

**WHY:** core/cognition/jobs.ts and worker.ts mix generic lifecycle with
Ashley-specific episode/Mind State/Affect/learning decisions. This is the
highest-value and highest-risk salvage seam.

**CURRENT MODULES:** core/cognition/jobs.ts (159 LOC); core/cognition/worker.ts
(644 LOC); core/attention/ledger.ts (599 LOC); core/rollout/capabilities.ts;
core/provenance; core/memory/episodes.ts; core/runtime.ts; relevant tests.

**CANDIDATE:** Mastra workflow snapshots and steps versus LangGraph.js
checkpointers, interrupts, retry policies, and state history. Use pinned
versions only after human approval; current turn installs neither.

**BOUNDED SCOPE:** A standalone in-memory/temp SQLite fixture with one
non-authoritative consolidation job. Model output is a fixed fixture, not a
live call. Implement only a throwaway adapter or test harness in an isolated
spike location. Exercise claim, fail, retry, suspend, restart, resume,
duplicate delivery, and completed-run inspection.

**FORBIDDEN:** No production import, package.json/lockfile change, real
nuclear.db or continuity.db, current capability event, live model, real
Discord, sandbox/external broker, framework memory replacing Ashley tables, or
promotion of any result.

**SEAM:** AshleyWorkflowRuntime accepts an Ashley-owned job envelope:
jobId/entity UUID, source message IDs, capability contract hash, model epoch,
provenance mode, idempotency key, deadline, and semantic callback. The
foundation returns lifecycle events only. AshleyMemoryAuthority and
AshleyCapabilityAuthority decide what may be written.

**FIXTURE:** One completed Discord exchange with exact user message/source ID;
one shadow consolidation output containing an episode, Mind State delta,
Affect delta, and learning revision; one malformed model output; one retry;
one process-restart point; one duplicate resume; capability mode observe.

**ACCEPTANCE:** (1) restart/resume does not duplicate semantic rows; (2)
replayed node/step is idempotent; (3) a malformed output cannot write; (4)
shadow mode cannot create live influence; (5) exact provenance survives; (6)
capability contract/epoch mismatch fails closed; (7) no foundation state is
treated as Recall or authority; (8) run inspection can explain failure and
retry; (9) output can be discarded without changing current Ashley state.

**REJECTION:** Reject a candidate if it requires semantic state in framework
storage, cannot bound/replay retries, repeats side effects without Ashley
idempotency, hides the authority snapshot, requires live provider calls, or
forces Thought/Recall into a graph/agent object.

**EXPECTED FILES:** Temporary fixture/test files, a spike report, and a
candidate comparison table. No production files or dependency manifests.

**EVENTUAL RETIREMENT:** If accepted later, only generic claim/lease/recovery
parts of jobs.ts and selected worker/attention plumbing may retire. The
semantic worker/materializers, capability gates, provenance, and SQLite
transaction remain.

**ROLLBACK:** Delete the isolated spike branch/artifacts; restore no production
state; keep current runtime unchanged. No destructive repository command is
authorized by this backlog.

**ESTIMATE:** Research design 2–4 hours; isolated fixture 1–2 days after
approval; review 0.5–1 day. Uncertainty is high because transaction boundaries
are mixed.

**DEPENDENCIES:** Human approval; pinned official candidate versions; a
temporary test harness; no credentials; no production DB.

**DECISION:** Human chooses Mastra, LangGraph.js, KEEP-CURRENT, or a further
research gap. No overnight winner.

## P-02 — Agent Plugins and MCP quarantine

**QUESTION:** Can Ashley inspect and admit a portable plugin package or MCP
configuration while preserving package containment, version checks, untrusted
data handling, and zero implicit authority?

**HYPOTHESIS:** Agent Plugins v1 can reduce discovery/manifest duplication and
MCP can provide transport interoperability, but only an AshleyPluginRuntime
and AshleyToolRuntime can make the result safe for Ashley. A skills-only parser
may be useful even if MCP/process launch is rejected.

**WHY:** Agent Plugins is a high-leverage packaging seam, but the specification
is a Working Draft and deliberately does not define Ashley's trust or
capability model. A parser-only proof is cheap and reveals the security gap.

**CURRENT MODULES:** No plugin implementation. Relevant Ashley modules are
core/privacy, core/perception, core/sandbox, core/rollout, model-routing, and
owner diagnostics.

**CANDIDATE:** Agent Plugins v1 manifest/skills/mcp.json format and official MCP
schemas/wire concepts. Do not pull a remote schema at runtime or connect to a
server.

**BOUNDED SCOPE:** Pure parser/validator over local fixtures. Discover root
plugin.json, fixed skills/SKILL.md, and mcp.json; validate version matching,
closed fields, root containment, unsupported components, component-level
failures, literal command token, and placeholder handling. Produce a
quarantine/admission report only.

**FORBIDDEN:** No npm install, no plugin registry, no network, no MCP
connection, no stdio launch, no SKILL.md script, no env/credential expansion
against real values, no tool call, no package write, no capability release,
and no execution broker call.

**SEAM:** AshleyPluginRuntime returns metadata, validation errors, and isolated
component descriptors. AshleyToolRuntime maps a manually approved tool to a
capability/classification but returns all fixture output as untrusted data.
ExecutionBroker is the only future mutation path.

**FIXTURE:** (a) valid skills-only package; (b) valid MCP package; (c) unknown
manifest field; (d) unsupported version; (e) mcp.json version mismatch; (f)
skill path escape; (g) command/cwd escape; (h) malformed one server with one
valid server; (i) unsupported transport; (j) literal placeholder strings; (k)
manifest that attempts to claim authority in description/skill text.

**ACCEPTANCE:** Correct fixed-location discovery; no path escape; version
failure is explicit; independent component failures are isolated; unsupported
components are ignored safely; no process/network side effect occurs; plugin
text never becomes authority; report is deterministic and auditable.

**REJECTION:** Reject adoption if the parser cannot enforce root containment,
if the package format requires execution to validate, if unknown metadata is
treated as permission, if MCP auth is treated as Ashley consent, or if a
skills-only mode cannot be cleanly quarantined.

**EXPECTED FILES:** Local fixture corpus, pure validation test, and a research
report. No runtime loader or package manifest.

**EVENTUAL RETIREMENT:** Only future bespoke package-discovery code, if any, may
retire. Privacy, capability, broker, evidence, and execution code stays.

**ROLLBACK:** Delete isolated fixtures/report or leave them as research; no
production state exists.

**ESTIMATE:** 0.5–1 day fixture/spec mapping; 0.5–1 day review. Low coding risk,
high policy review value.

**DEPENDENCIES:** Agent Plugins v1 specification, MCP official spec, local
filesystem only, human approval.

**DECISION:** KEEP-CURRENT, skills-only adapter, full package adapter later,
or reject until the specification matures.

## P-03 — OpenHands and AgentFS broker seam

**QUESTION:** Can an optional coding specialist and a filesystem snapshot/audit
layer operate behind Ashley's existing execution broker without becoming a
second Thought, memory, or authority system?

**HYPOTHESIS:** OpenHands is useful only as a narrow coding-agent guest and
AgentFS only as an isolated workspace filesystem. The broker can enforce
recipe, path, UID, secret, and artifact policy if the guest interfaces remain
small and explicit.

**WHY:** Earlier research proposed OpenHands as a direct executor and AgentFS
as memory. Current architecture rejects both broad roles but leaves a
potentially valuable narrow coding/workspace seam.

**CURRENT MODULES:** core/sandbox; apps/sandbox-broker/src; apps/sandbox-policy;
core/change-proposal; core/privacy; core/continuity; docs/Sandbox_Design.md and
docs/Self_Modification_Design.md.

**CANDIDATE:** OpenHands SDK/runtime architecture and AgentFS SDK/filesystem
concepts. Use fake interfaces and no third-party runtime.

**BOUNDED SCOPE:** Model a proposal envelope, fixed recipe, fake coding action,
fake observation, workspace artifact, AgentFS-like snapshot/diff, classification
decision, and broker receipt. Use temporary files and deterministic fake
implementations. Verify the guest cannot call the host, write nuclear/sidecar
databases, access secrets, or publish directly.

**FORBIDDEN:** No OpenHands/AgentFS install, import, process, Docker, FUSE/NFS,
network, model, real sandbox broker, SSH/Mint, key generation, real credentials,
or artifact promotion.

**SEAM:** AshleyExecutionBroker remains sole execution authority. A future
CodingSpecialistAdapter receives a Thought-authorized proposal and returns
untrusted observations/artifacts. A WorkspaceSnapshotAdapter returns diffs and
audit references, not memory facts.

**FIXTURE:** Read-only command; bounded file write; denied path; denied secret
path; denied network request; artifact classification ordinary/sensitive/secret;
snapshot before/after; malformed action; expired approval; duplicate receipt;
continuity tombstone.

**ACCEPTANCE:** All denied operations fail closed; only fixed recipe/path scope
is visible; fake guest has no authority; artifacts are classified; snapshot
diff is reviewable; duplicate/expired receipts are idempotent; no artifact
enters Recall or identity without explicit Ashley-owned evidence resolution.

**REJECTION:** Reject if the candidate needs direct host access, broad shell
authority, plugin self-registration, model-provided approval, unsandboxed
process execution, or a filesystem database as Ashley memory.

**EXPECTED FILES:** Isolated fake broker fixture, interface matrix, threat/
boundary report, and LOC measurement. No production adapter.

**EVENTUAL RETIREMENT:** At most selected workspace copy/diff helpers after a
security-equivalent implementation; never signed policy, approval, continuity,
vault, or delivery authority.

**ROLLBACK:** Remove isolated fake fixture; current broker remains unchanged.

**ESTIMATE:** 1–2 days design/fixture after approval; 1 day security review.
Platform risk is high because Linux Mint deployment is intentionally out of
scope.

**DEPENDENCIES:** Human approval, existing broker protocol documentation,
temporary files only, no keys or third-party execution.

**DECISION:** KEEP-CURRENT, OpenHands guest, AgentFS workspace, both as
complementary guests, or reject.

## P-04 — Durable wake and delivery truth wrapper

**QUESTION:** Can generic scheduling and workflow wake mechanics replace timer/
poll plumbing without allowing stale or duplicated proactive sends?

**HYPOTHESIS:** A durable schedule can wake Ashley, but Agency eligibility,
pause/withdrawal, reservation, and receipt-backed delivery must remain outside
the scheduler. The current scheduler may be simple enough to KEEP.

**WHY:** Scheduling is generic at the timer level but semantically dangerous
because initiative must be motivated, bounded, paused, and receipt-backed.

**CURRENT MODULES:** discord-bot/src/initiative/scheduler.ts (191 LOC);
core/runtime.ts tickProactive; agency eligibility/motivations; initiative
reservations; delivery ledger and Discord client.

**CANDIDATE:** Mastra schedules/events or a host scheduler, compared against the
current jittered timer plus urgent poll. This spike may use a fake scheduler
only; it does not require either candidate package.

**BOUNDED SCOPE:** Synthetic owner pause, relationship withdrawal, urgent wake,
deadline expiry, process restart, duplicate wake, stale schedule, reservation
conflict, send failure, partial send, and receipt commit. Use a fake clock and
fake Discord sender.

**FORBIDDEN:** No real timer change, Discord gateway, outgoing message, model
call, capability change, package installation, deployment, or production
scheduler state.

**SEAM:** ScheduleWake emits a bounded wake event. Ashley Agency rechecks all
eligibility and capability conditions, creates a delivery reservation, and the
delivery ledger decides commit. A stale wake is harmless.

**FIXTURE:** One proactive motivation, one paused owner, one withdrawn
relationship, one urgent grounded concern, one duplicate wake, one process
restart, one partial Discord send.

**ACCEPTANCE:** Stale/duplicate wakes cannot reserve twice or send; pause and
withdrawal win over queued wakes; urgent wake remains bounded; every committed
message has receipt evidence; no scheduler payload becomes a Thought decision.

**REJECTION:** Reject a candidate if it schedules/sends directly, stores
initiative authority outside Ashley, loses pause/withdrawal state, or cannot
reconcile duplicate/restarted wakes.

**EXPECTED FILES:** Fake-clock fixture, event contract, comparison report, and
retirement estimate. No production scheduler changes.

**EVENTUAL RETIREMENT:** 80–140 timer/poll LOC may be replaceable; Agency,
reservations, delivery, and Discord boundary remain.

**ROLLBACK:** Delete isolated fixture; current scheduler is untouched.

**ESTIMATE:** 0.5–1 day fixture and review. This is lower priority than P-01.

**DEPENDENCIES:** Existing initiative/delivery tests and human approval; no
candidate install required.

**DECISION:** KEEP-CURRENT unless the fixture proves durable wake value with
negligible semantic coupling.

