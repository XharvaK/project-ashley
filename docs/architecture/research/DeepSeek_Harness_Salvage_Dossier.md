# DeepSeek Harness Salvage Dossier

Status: architecture research and documentation only

Date: 2026-08-13

Ashley base: <code>7963d2d235b66f34f4dedfb47fa6bd1b0c1f5edf</code>

DeepSeek Harness source: <code>deepseek-ai/deepseek-harness</code> at <code>47f943859bef60e4160492346772ded9b24f765a</code> on <code>master</code>

Canonical effect law: <code>PREPARE -&gt; REVALIDATE -&gt; COMMIT</code>

Canonical ambiguity result: <code>OUTCOME_UNKNOWN</code>

This dossier is evidence for later architecture and implementation goals. It is
not an acceptance packet, qualification result, implementation plan, dependency
approval, deployment authorization, or capability-promotion record.

The requested location is used. <code>docs/architecture/</code> is the current
home of Ashley's canonical architecture record. The new
<code>docs/architecture/research/</code> subdirectory keeps a source-specific
research dossier distinct from accepted canonical documents and from executable
spike reports under <code>docs/architecture/spikes/</code>.

## Evidence protocol

- **Observed — DeepSeek source** means the claim was traced in the pinned
  DeepSeek checkout.
- **Observed — Ashley source** means the claim was checked against the Ashley
  base SHA above.
- **Current external source** means the claim was checked against official
  documentation on 2026-08-13.
- **Inference** means an architecture conclusion from the observed facts.
- **Recommendation** means proposed future work. It changes no current
  contract, roadmap phase, source, deployment, or activation state.

Planning-effort estimates in this dossier are comparative estimates. They are
not measured implementation results.

## 1. Executive verdict

**Recommendation:** salvage mechanisms, not the harness.

DeepSeek Harness contains high-value lifecycle work. Its strongest contribution
to Ashley is the distinction between a durable child Session and a disposable,
process-local Activation. Its continuable-subagent evolution also provides a
well-tested account of exact-live-parent checks, one inbox as the only FIFO,
child-first teardown, cold reconstruction, and quiescent ownership release.

Those mechanisms fit **above or beside** a durable execution substrate. They
should not force Restate, Temporal, or DBOS to become Ashley's worker identity,
conversation, authority, cognition, or memory system. The durable engine, when
one is justified, should own durable orchestration mechanics. Ashley should own
the WorkerSession identity, WorkloadPrincipal, authority attenuation,
continuation admission, effect meaning, and cognitive admission.

One narrow source-level candidate clears the direct-port bar:
<code>disposeAcpChild()</code>, the cooperative-EOF then
whole-process-tree termination ladder. It should be extracted, not imported as
the containing DeepSeek package.

The primary structural adaptations are:

1. durable WorkerSession plus at-most-one process-local WorkerActivation;
2. live control capability distinct from persisted lineage;
3. one ordering authority for accepted worker input;
4. durable reconstruction descriptor plus fresh resume authorization;
5. child-first quiescence and memoized disposal;
6. strict schedule event folds and persistence barriers;
7. closed approval outcomes and paired audit events without confusing approval
   with authorization.

The primary spikes are:

1. an Ashley-owned ACP WorkerProvider using the official ACP SDK directly;
2. a cross-process Activation lease and durable inbox-ticket model;
3. a crash-matrix comparison of event-record-only continuity against Restate,
   Temporal, and DBOS;
4. effect-boundary tests for enqueue, dispatch, execution, observation, and
   ambiguous commit.

The primary rejects are:

- DeepSeek Session log as Ashley Recall, continuity, or cognitive authority;
- DeepSeek goal meaning or goal-round policy;
- ACP session identity or ACP permission as Ashley authority;
- a scheduler as Ashley Agency;
- Cordis as Ashley's semantic kernel;
- direct dependency on the DeepSeek ACP, subagent, schedule, goal, compaction,
  or approval packages;
- mapping <code>end_turn</code> to Ashley semantic completion;
- retrying an effect because a receipt, dispatch marker, or success observation
  is absent.

Context compaction is useful research for CONTEXT-BUDGET-01. It remains deferred
to roadmap phase 7.

## 2. Repository snapshot

### 2.1 Exact source

| Field | Observed value |
|---|---|
| Upstream | [https://github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |
| Inspected branch | <code>master</code> |
| Inspected commit | [47f943859bef60e4160492346772ded9b24f765a](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a) |
| Local source state | Clean checkout at the exact commit |
| Product status | Developer preview; the root README explicitly warns of compatibility-breaking changes |
| Package manager | <code>pnpm@11.7.0</code> |
| Node range | <code>^22.19.0 || &gt;=24.0.0</code> |
| Package families | 49 directories under <code>packages/</code> |
| Package manifests | 226 under <code>packages/</code> |
| Applications | <code>apps/cli</code> and <code>apps/web</code> |

**Observed — DeepSeek source:** the repository describes an “everything is a
plugin” architecture over a source-vendored Cordis framework. Session events
are durable facts. Agent events concern live work. The Session log is the
source of DeepSeek model-visible history. See <code>README.md</code> and
<code>docs/architecture.md</code>.

Major families relevant to this dossier are:

- <code>packages/core/session</code> and <code>packages/session/*</code>;
- <code>packages/core/agent</code>;
- <code>packages/subagent/*</code>;
- <code>packages/acp/acp</code>;
- <code>packages/sdk/protocol</code>, <code>packages/sdk/server</code>, and
  <code>packages/sdk/client</code>;
- <code>packages/schedule/schedule</code>;
- <code>packages/goal/goal</code> and
  <code>packages/goal/goal-round-driver</code>;
- <code>packages/compaction/*</code>;
- <code>packages/interaction/user-approval</code>;
- <code>vendor/cordis</code>.

### 2.2 License and dependency evidence

**Observed — DeepSeek source:**

- The repository root <code>LICENSE</code> is the MIT License, copyright 2026
  DeepSeek.
- The relevant DeepSeek packages in this dossier declare
  <code>"license": "MIT"</code>.
- A repository-wide scan of 248 <code>package.json</code> manifests found 231
  MIT declarations.
- Four Landlock manifests under
  <code>native/landlock-run</code> declare BSD-3-Clause. They are not
  dependencies of the proposed direct-port candidate.
- Thirteen example, fixture, Python-support, or website manifests have no
  <code>license</code> field. That absence is not a package-level license
  declaration. The root license remains repository-level evidence, but a
  copied file still needs its own source and dependency closure checked.
- <code>THIRD_PARTY_NOTICES.md</code> records direct dependencies. It identifies
  <code>@agentclientprotocol/sdk</code> as Apache-2.0; the vendored Cordis,
  Schemastery, and CosmoKit packages as MIT; <code>zod</code> as MIT; and
  <code>@standard-schema/spec</code> as MIT.
- <code>vendor/README.md</code> records pinned upstream Cordis-family commits
  and an extensive DeepSeek-local modification log. The vendored
  <code>@deepseek-ai/cordis</code> is therefore not merely an unmodified npm
  dependency.

**Evidence-bounded license conclusion:** MIT-licensed DeepSeek source can
reasonably be copied and modified for Ashley if the applicable copyright and
permission notice is preserved in copies or substantial portions. Copying code
that embeds or distributes Apache-2.0 or another dependency requires retaining
that dependency's applicable notices and terms. This is not a legal opinion.

**Dependency conclusion:** importing the DeepSeek packages would pull a large
peer graph tied to Cordis, DeepSeek Session, Agent, LLM, projection,
persistence, scope, invariant, and tool contracts. Copying a small, isolated
MIT function can avoid that lock-in. Direct package adoption does not.

## 3. Ashley fit map

The current Ashley source of truth is
[Ashley_Architecture_Roadmap.md](../Ashley_Architecture_Roadmap.md). The frozen
order remains:

1. Sandbox Autonomy
2. MODEL-FABRIC-01
3. OPERATIONAL-CONTINUITY-01
4. PROCEDURAL-SKILL-GRADUATION
5. COMPUTER-USE-01
6. LEARNED-AUTONOMY-01
7. CONTEXT-BUDGET-01
8. Experience / Cognitive Graduation and System-wide Hardening

Evaluation / Qualification and Observability remain cross-cutting planes.

Every mapping below preserves <code>ONE ASHLEY WITH BOUNDED WORKERS</code> and
<code>CHILD AUTHORITY &sub; PARENT AUTHORITY</code>. A worker, provider,
credential, protocol session, installed tool, available skill, or engine
workflow cannot enlarge the authority admitted by Ashley.

| Ashley concern | DeepSeek mechanism | Boundary that Ashley MUST retain | Disposition | Frozen phase |
|---|---|---|---|---|
| Bounded specialist work | Durable Session identity | <code>SpecialistSession</code> is a Model Fabric work/budget contract, not a worker process, scheduler, or authority | ADAPT as a separate WorkerSession concept | OPERATIONAL-CONTINUITY-01 after MODEL-FABRIC-01 |
| Process residency | Process-local Activation and retained <code>AgentHandle</code> | Residency is not identity, lineage, cognition, or authority | ADAPT | OPERATIONAL-CONTINUITY-01 |
| Delegation lineage | <code>parentSession</code>, <code>delegationDepth</code> | Persisted lineage is data; exact live authority is re-established at admission | ADAPT | OPERATIONAL-CONTINUITY-01 |
| Worker transport | Official ACP SDK behind an Ashley-owned adapter | ACP session id and permission outcomes are not Ashley authority | SPIKE | OPERATIONAL-CONTINUITY-01 |
| Durable scheduling | Event fold plus reconstructable timer | A due record is not Agency intent, execution success, or delivery truth | ADAPT | OPERATIONAL-CONTINUITY-01 |
| Durable operational state | Session descriptors and schedule events | Durable work state is not durable cognitive concern | ADAPT | OPERATIONAL-CONTINUITY-01 |
| Goal persistence | Revision/CAS, tombstone, replay | Ashley owns wanting, intending, prioritizing, pursuing, and abandoning | ADAPT mechanics only | LEARNED-AUTONOMY-01 / phase 8 semantics |
| Context projection | Surface replacement and compaction bracket | Projection is not Recall mutation; eviction is not forgetting | DEFER | CONTEXT-BUDGET-01 |
| Plugin lifetime | Cordis effects and service seams | Availability is not capability; a plugin framework is not semantic authority | REFERENCE | Cross-cutting implementation practice |
| Human approval | Closed outcomes and paired asked/decided events | Approval, policy, capability, and execution admission remain distinct | ADAPT mechanics only | Existing authority/effect planes |
| Crash repair | “not started” versus “outcome unknown” repair events | Only a pre-execution certainty can be refused; possible execution remains <code>OUTCOME_UNKNOWN</code> | ADAPT vocabulary carefully | OPERATIONAL-CONTINUITY-01 |
| Existing Sandbox work | DeepSeek worker/workspace analogues | Graduate proven Ashley task, session, workspace, artifact, receipt, and reconciliation machinery; do not rewrite it for DeepSeek | REFERENCE | Sandbox then OPERATIONAL-CONTINUITY-01 |

**Observed — Ashley source:** current Sandbox source already has bounded
<code>SandboxTask</code>, broker-owned <code>BrokerSandboxSession</code>,
monotonic revisions, owner-authorized transitions, workspace manifests,
workspace revalidation, capability-use records, execution receipts, artifact
hash verification, and broker reconciliation. Relevant paths include:

- <code>apps/agent-service/src/core/sandbox/task.ts</code>;
- <code>apps/sandbox-broker/src/sessions/session-types.ts</code>;
- <code>apps/sandbox-broker/src/sessions/session-transitions.ts</code>;
- <code>apps/sandbox-broker/src/sessions/session-reconcile.ts</code>;
- <code>apps/sandbox-broker/src/workspace/workspace-manifest.ts</code>;
- <code>apps/sandbox-broker/src/execution/receipt.ts</code>.

DeepSeek should refine the graduation boundary. It should not displace these
current Ashley mechanisms.

## 4. Candidate salvage matrix

Engineering savings are **inferences** relative to designing the same negative
cases without the DeepSeek evidence and tests.

| Candidate | DeepSeek source path | Ashley target | Classification | Expected engineering savings | Semantic risk | Authority risk | Dependency risk | Recommendation |
|---|---|---|---|---|---|---|---|---|
| Cooperative EOF then whole-tree process teardown | <code>packages/subagent/subagent-acp/src/run.ts</code>; <code>packages/subagent/subagent-acp/tests/subagent-acp.spec.ts</code> | ACP WorkerProvider process owner | **PORT** | 2–4 engineer-days of edge-case and test design | Low | Low if kept below control admission | Low when extracted; high if package-imported | Extract only <code>disposeAcpChild()</code> and focused tests behind an Ashley process-handle adapter |
| Durable Session / process-local Activation split | <code>packages/core/session/src/types.ts</code>; <code>packages/subagent/subagent/src/continuation.ts</code> | WorkerSessionRecord / WorkerActivation | **ADAPT** | 5–10 days of lifecycle design | Medium if confused with SpecialistSession | Medium | High for package import | Reimplement in Ashley contracts |
| Exact-live-parent reauthorization and child ownership graph | <code>packages/subagent/subagent/src/continuation.ts</code> | Worker control capability and descendant drain | **ADAPT** | 4–8 days | Low | High if lineage is accepted as authority | High for package import | Preserve final no-await authority check and child-first release |
| Durable descriptor and provider-independent cold resume | <code>packages/subagent/subagent/src/descriptor.ts</code>; <code>packages/subagent/subagent/src/continuation.ts</code> | Worker reconstruction descriptor and ResumeGuard input | **ADAPT** | 3–6 days | Medium | High if current policy is not revalidated | High | Snapshot only mechanical reconstruction inputs; never snapshot authority as a permanent grant |
| Session persistence flush barriers and crash repair classification | <code>packages/session/session-persistence/src/coordinator.ts</code>; <code>packages/session/session-persistence/src/write-behind.ts</code>; JSONL and SQLite providers | Durable work record and recovery diagnostics | **REFERENCE** | 3–6 days of failure-matrix design | Medium because DSH Session owns model history | Medium | High | Borrow tests and failure distinctions, not the Session authority model |
| ACP bridge algorithms: multi-session isolation, one in-flight prompt, committed output, cancellation, drain | <code>packages/acp/acp/src/index.ts</code>; <code>packages/acp/acp/tests/*.spec.ts</code> | Ashley ACP WorkerProvider | **ADAPT** | 5–10 days | Medium | High | High | Reimplement over official ACP SDK and Ashley lifecycle contracts |
| Direct import or wrapping of <code>@deepseek-ai/dsh-acp</code> | <code>packages/acp/acp/package.json</code>; <code>packages/acp/acp/src/index.ts</code> | ACP WorkerProvider | **REJECT** | Negative savings after integration | High | High | Very high | Cordis, Agent, Session, and approval coupling is the wrong boundary |
| Official <code>@agentclientprotocol/sdk@0.25.1</code> used directly | <code>packages/acp/acp/package.json</code>; <code>packages/subagent/subagent-acp/src/run.ts</code> | ACP wire adapter | **SPIKE** | Could avoid protocol reimplementation | Low | Medium until auth/admission is designed | Medium; Apache-2.0 | Build a fixture-only adapter spike with no provider call |
| DeepSeek SDK NDJSON JSON-RPC transport | <code>packages/sdk/protocol/src/transport.ts</code>; <code>packages/sdk/protocol/tests/transport.spec.ts</code> | Generic worker transport | **REFERENCE** | 1–2 days | Low | Medium | Low | Use as a negative checklist; it lacks production bounds, cancellation protocol, runtime schema validation, and version negotiation |
| Strict schedule event fold, recurrence math, reconstructable timers, persistence barriers | <code>packages/schedule/schedule/src/domain.ts</code>; <code>packages/schedule/schedule/src/runtime.ts</code>; schedule tests | Routine Registry and timer projection | **ADAPT** | 5–9 days | Medium | Medium | High for package import | Reimplement only after Ashley routine and effect contracts define the semantics |
| DeepSeek followup-then-dispatch marker as an effect commit boundary | <code>packages/schedule/schedule/src/runtime.ts</code> | Proactive delivery/effect execution | **REJECT** | None | High | High | High | It has an explicit crash ambiguity window and no independent Effect Witness |
| Goal revision/CAS, strict replay, tombstone, block-code shape, activation separation | <code>packages/goal/goal/src/types.ts</code>; <code>packages/goal/goal/src/fold.ts</code> | Neutral Ashley-owned goal record mechanics | **ADAPT** | 3–6 days | High if labels leak meaning | Medium | High | Borrow concurrency mechanics only in the later owning phase |
| DeepSeek goal lifecycle and automatic goal-round driver | <code>packages/goal/goal/src/runtime.ts</code>; <code>packages/goal/goal-round-driver/src/index.ts</code> | Ashley goals / Agency | **REJECT** | None | Critical | High | High | Ashley retains all goal and continuation meaning |
| Compaction transaction markers, surface replacement, tool pairing, token seams | <code>packages/compaction/compaction/src/types.ts</code>; <code>packages/compaction/compaction/src/tool-pairing.ts</code>; <code>packages/compaction/compaction-basic/src/region.ts</code> | Context projection and budget | **DEFER** | 5–10 days when phase 7 starts | High if summary becomes truth | Low | High | Preserve as phase-7 research; do not move the phase |
| Cordis reversible effects and Definition/Provider/Consumer role split | <code>vendor/cordis/src/fiber.ts</code>; <code>vendor/cordis/src/service.ts</code>; <code>docs/architecture.md</code> | Service lifetime patterns | **REFERENCE** | 2–5 days of lifecycle design | Medium | Medium | High | Copy patterns and tests, not the framework |
| Cordis as Ashley's kernel or broad plugin runtime | <code>vendor/cordis</code>; <code>vendor/README.md</code> | AshleyRuntime | **REJECT** | Negative savings | Critical | High | Critical | Would relocate architecture and availability semantics into a modified external framework |
| Approval closed outcomes and asked/decided pairing | <code>packages/interaction/user-approval/src/types.ts</code>; <code>packages/interaction/user-approval/src/index.ts</code>; approval tests | ApprovalProjection and audit vocabulary | **ADAPT** | 2–4 days | Medium | High if approval grants capability | High for package import | Adapt vocabulary and invariant tests under Ashley policy |
| DeepSeek permission presets or ACP permission choice as Ashley authorization | <code>packages/interaction/permission-presets</code>; <code>packages/subagent/subagent-acp/src/run.ts</code> | Authorization and delegated capability | **REJECT** | None | High | Critical | High for package import | Preserve four separate Ashley stages |
| Earlier Task-per-Activation design and its replacement | <code>.agents/notes/implemented/feature/2026-07-21-continuable-background-subagents.md</code>; newer 2026-07-28 note | Worker lifecycle design rationale | **REFERENCE** | 3–5 days of avoiding duplicate lifecycle machinery | Low | Medium | None | Retain the evolution as a design and test checklist |
| DeepSeek Session log as Recall, forgetting, continuity, or cognitive authority | <code>packages/core/session</code>; <code>docs/architecture.md</code> | Recall / continuity sidecar | **REJECT** | None | Critical | Critical | High for package import | Session projection may be operational input only |
| Layered worker identity above/beside an optional durable engine | DeepSeek continuation sources plus official engine docs | OPERATIONAL-CONTINUITY-01 substrate boundary | **SPIKE** | High architecture-risk reduction | Low | High | Engine-dependent | Test exact workloads and crashes, not aesthetic preferences |

## 5. Durable Session / Activation analysis

### 5.1 Observed source model

The durable identity is a Session. The live residency is an Activation.

The Session header in <code>packages/core/session/src/types.ts</code> includes:

- stable <code>SessionId</code>;
- optional <code>parentSession</code>;
- optional <code>seedLength</code>;
- optional <code>delegationDepth</code>;
- creation and composition metadata.

<code>seedLength</code> distinguishes inherited prefix from child-owned suffix.
<code>delegationDepth</code> remains durable so a restart cannot restore a child
as a top-level delegator.

<code>AgentHandle</code> in
<code>packages/core/agent/src/index.ts</code> contains the exact live Agent plus
an asynchronous disposer. DeepSeek's own comment calls the disposer a
capability. Registry collision is the process-local single-residency boundary.

The current continuable manager is implemented in
<code>packages/subagent/subagent/src/continuation.ts</code>. It defines:

- a process-local map from child Session id to at most one Activation;
- a retained <code>AgentHandle</code>;
- exact live ancestry captured at materialization;
- a set of owned child Activations;
- accepted waking message ids not yet observed leaving the inbox;
- a memoized disposal transaction;
- fresh creation and cold-resume materialization;
- exact direct-parent authorization before final inbox admission;
- top-down cancellation with child-first handle release;
- best-effort final Session flush.

The durable reconstruction descriptor is in
<code>packages/subagent/subagent/src/descriptor.ts</code>. It records mode,
provider identity, selected model/provider composition, persona, and tool
filter. It deliberately does not make the initial provider the continuing
owner. Cold resume is performed by the manager through the generic Agent
registry.

The Session persistence contract adds a useful crash distinction. A cold load
preserves every complete committed event from an interrupted final turn. It
drops only an incomplete torn-tail record. It then appends synthetic closers so
the recovered transcript is structurally balanced. An assistant tool request
that never acquired a durable call record becomes <code>TOOL_NOT_STARTED</code>.
A durable call without a result becomes <code>TOOL_OUTCOME_UNKNOWN</code>. The
latter tells the next model loop not to retry a possibly side-effecting action
blindly. A live open turn is not rewritten as interrupted, and HMR adoption
truncates a torn physical tail without fabricating interruption closers. These
behaviors are stated in
<code>packages/session/session-persistence/README.md</code> and exercised in
<code>packages/session/session-persistence/tests/contract.ts</code> and
<code>packages/session/session-persistence/tests/coordinator-contract.ts</code>.

### 5.2 The central invariant

> Persisted lineage is evidence about ancestry. It is not a live control
> capability.

DeepSeek enforces this twice:

1. cold resume checks that the loaded child header names the requesting parent;
2. after any await and immediately before inbox admission, it checks the exact
   live parent Agent again.

Ashley should preserve the principle and strengthen it for cross-process use:

- <code>parentWorkerSessionId</code> records lineage;
- <code>WorkloadPrincipal</code> records the bounded principal at creation;
- a live, unforgeable WorkerControl capability authorizes this control action;
- a current Activation lease prevents concurrent materialization;
- <code>ResumeGuard</code> rechecks environment compatibility;
- authorization policy and owner state are revalidated immediately before
  admission or consequence.

No persisted id, descriptor, environment fingerprint, engine workflow id, ACP
session id, or model-provided field can replace that check.

### 5.3 Mapping to Ashley contracts

| DeepSeek concept | Ashley mapping | Required separation |
|---|---|---|
| Session | Proposed <code>WorkerSessionRecord</code> for durable operational worker identity | Not Recall, Thought, Agency, a Model Fabric SpecialistSession, or durable cognitive concern |
| Activation | Proposed <code>WorkerActivation</code> | Process-local residency only |
| AgentHandle | Proposed process-local <code>WorkerActivationHandle</code> | Control resource; never cognitive identity |
| Session header lineage | <code>parentWorkerSessionId</code> plus delegation depth | Data only; not authorization |
| Descriptor | <code>WorkerReconstructionDescriptor</code> | Mechanical inputs only; current authority is not snapshotted as timeless |
| Agent inbox | One <code>WorkerInbox</code> ordering authority | Acceptance must acquire a durable ticket if restart survival is claimed |
| Owned children | Process-local Activation forest plus durable lineage | Ownership must not be inferred from lineage |
| Session flush | Persistence barrier evidence | Barrier participation is not proof of the intended store or effect |

The existing Model Fabric
[contract draft](../Model_Fabric_01_Contract_Draft.md) states that
<code>SpecialistSession</code> is bounded specialist work, not an agent,
process, scheduler, tool runner, or authority container. Operational Continuity
must not silently widen it. A SpecialistSession may correlate model work inside
a WorkerActivation. It should not become the Activation.

### 5.4 Crash and concurrency boundaries

| Failure point | DeepSeek observed result | Ashley requirement |
|---|---|---|
| Before Session publication | No durable child | Return a pre-commit refusal/failure; no identity claim |
| After descriptor durability but before message acceptance | Durable idle child may exist | Record exact phase; do not claim work was accepted |
| After inbox acceptance but before Session-log admission | Accepted input may be lost on crash | Do not claim restart-safe enqueue without a durable inbox ticket |
| After Session-log admission but before model work | Input is reconstructable in DeepSeek | Model execution must have a separate stage-valid receipt |
| Assistant requested a tool but no durable call exists | DeepSeek repairs the transcript with <code>TOOL_NOT_STARTED</code> | This is the only class that may support a definite non-execution result, and only when the Ashley Effect Witness contract independently establishes the same pre-send boundary |
| Durable tool call exists but no result exists | DeepSeek repairs the transcript with <code>TOOL_OUTCOME_UNKNOWN</code> and warns against blind side-effect retry | Preserve <code>OUTCOME_UNKNOWN</code>; verify external state or obtain new owner direction before any non-idempotent retry |
| During model or tool execution | Session/turn events may be partial but complete committed events are preserved | Any possible external effect remains <code>OUTCOME_UNKNOWN</code> |
| Cold final turn is incomplete | DeepSeek appends synthetic closers and drops only a torn physical record | Treat closers as recovery bookkeeping, not evidence that work or effects completed |
| Two processes resume one child | DeepSeek has no cross-process lease | Ashley needs a durable lease/fencing token or single-host proof |
| Final flush fails | DeepSeek logs and releases ownership | Ashley must distinguish stale persistence from lifecycle release and surface repair need |
| Parent disappears while child remains | Process-local graph is drained child-first | Durable continuation needs explicit orphan policy; ancestry alone cannot adopt the child |

**Classification:** ADAPT.

## 6. ACP WorkerProvider analysis

### 6.1 Actual DeepSeek ACP surfaces

There are three distinct transports. They MUST NOT be conflated.

1. <code>packages/acp/acp</code> is an ACP automation server over official ACP
   SDK NDJSON stdio.
2. <code>packages/subagent/subagent-acp</code> starts one fresh child process and
   drives it as an ACP client.
3. <code>packages/sdk/protocol</code> is a separate DeepSeek-specific NDJSON
   JSON-RPC protocol. It is not ACP.

The ACP packages depend on
<code>@agentclientprotocol/sdk@0.25.1</code>. The SDK is Apache-2.0 according
to the pinned repository's <code>THIRD_PARTY_NOTICES.md</code>.

### 6.2 Server behavior

**Observed — DeepSeek source:** <code>packages/acp/acp/src/index.ts</code> and
its tests implement:

- protocol initialize with baseline text/resource-link prompt capability only;
- no advertised authentication method; <code>authenticate</code> is a no-op;
- fresh sessions only;
- absolute primary cwd;
- rejection of non-empty additional directories and MCP servers;
- several connection-owned sessions;
- one in-flight prompt per session;
- per-session cancellation;
- exact Agent identity checks when routing;
- only committed <code>assistant/message</code> text on the wire;
- no raw deltas, reasoning, tool calls, or plans;
- one-shot permission offers;
- memoized teardown that closes admission, settles prompts, drains exact
  descendants, and attempts every session disposal before reporting failures.

Prompt completion waits for whole-Agent idle. It is not a causal,
prompt-specific result. Other injected or steered work may contribute before
idle. Therefore the ACP stop reason cannot prove Ashley task completion.

Relevant tests:

- <code>packages/acp/acp/tests/multi-session.spec.ts</code>;
- <code>packages/acp/acp/tests/approval.spec.ts</code>;
- <code>packages/acp/acp/tests/dispose.spec.ts</code>;
- <code>packages/acp/acp/tests/bridge.spec.ts</code>;
- <code>packages/acp/acp/tests/turns.spec.ts</code>;
- <code>packages/acp/acp/tests/edges.spec.ts</code>.

### 6.3 Client/subagent behavior

**Observed — DeepSeek source:**
<code>packages/subagent/subagent-acp/src/run.ts</code> performs:

<pre>
spawn -&gt; initialize -&gt; newSession -&gt; publish run -&gt; prompt -&gt; collect committed text
</pre>

The parent mints its own run identity. The remote ACP session id remains
private to the child connection. This is a good identity boundary.

Each run uses a fresh process. The child's workspace is a local cwd. The
provider advertises no enforcement for delegation depth, persona, tool filter,
or structured output. It reports <code>inheritsParentContext: false</code>.
Permission requests are auto-answered by configuration, with reject as the
default. There is no continuable remote-session support.

The teardown ladder closes stdin, waits a dedicated EOF grace for cooperative
flush and descendant shutdown, then invokes the process owner's
SIGTERM-to-SIGKILL or platform-equivalent escalation and awaits whole-tree exit
proof. This is the direct-port candidate detailed in section 14.

### 6.4 Remote-worker suitability

The DeepSeek ACP server is not a remote-worker substrate:

- transport is local stdio;
- it advertises no authentication;
- workspaces are local paths;
- sessions are fresh-only;
- no resumable remote Activation handle exists;
- no durable control lease exists;
- no authority attenuation is expressed on the wire;
- no tool-surface or environment fingerprint is negotiated;
- permission offers do not carry Ashley authorization semantics;
- committed text is returned without an independent completion evaluator.

The implementation remains valuable as a lifecycle and negative-test
reference.

### 6.5 Ashley-owned ACP boundary

An Ashley ACP WorkerProvider should use the official ACP SDK directly. It should
not import <code>@deepseek-ai/dsh-acp</code>.

Proposed boundary:

1. **PREPARE**
   - allocate Ashley WorkerSession id;
   - bind WorkloadPrincipal and attenuated authority;
   - create or bind ExecutionWorkspace;
   - record expected environment and tool-surface fingerprints;
   - create a stage-valid launch attempt.
2. **CONNECT / INITIALIZE**
   - establish an authenticated or explicitly local process channel;
   - negotiate actual ACP capabilities;
   - store the external session id as transport data only.
3. **REVALIDATE**
   - verify live WorkerControl capability;
   - verify parent authority, current policy, workspace, lease, deadline,
     budget, environment, and tool surface;
   - reject unsupported requested capabilities.
4. **COMMIT ADMISSION**
   - durably accept one worker inbox ticket before claiming restart-safe
     delivery;
   - correlate ACP prompt admission separately from task completion.
5. **OBSERVE / RECONCILE**
   - accept committed output as candidate worker output;
   - keep effect receipts and independent Effect Witnesses separate;
   - never map cancellation, EOF, or absent output to proof that execution did
     not happen.

The adapter needs separate identifiers:

- Ashley WorkerSession id;
- WorkerActivation id and fencing token;
- external ACP connection/session id;
- prompt/admission ticket id;
- model/effect attempt ids;
- output candidate id.

### 6.6 Direct package decision

Importing <code>@deepseek-ai/dsh-acp</code> would also import DeepSeek Agent,
Session, approval, invariant, Schemastery, and Cordis assumptions. Wrapping the
package cannot remove those semantics.

**Direct package classification:** REJECT.

**Bridge-algorithm classification:** ADAPT.

**Official ACP SDK integration classification:** SPIKE.

## 7. Durable scheduling analysis

### 7.1 Observed implementation

The schedule package is <code>@deepseek-ai/dsh-schedule</code>. Its direct
implementation is split across:

- <code>packages/schedule/schedule/src/types.ts</code>;
- <code>packages/schedule/schedule/src/domain.ts</code>;
- <code>packages/schedule/schedule/src/persistence.ts</code>;
- <code>packages/schedule/schedule/src/transaction.ts</code>;
- <code>packages/schedule/schedule/src/runtime.ts</code>;
- <code>packages/schedule/schedule/src/tools.ts</code>.

**Observed — DeepSeek source:**

- Durable state is derived from version-1 <code>schedule/change</code> events.
- Operations are create, delete, and dispatch.
- The decoder rejects unknown keys, unsupported versions, invalid types, and
  invalid transitions.
- Schedule ids are never reused inside the owned Session suffix.
- A fork folds only events after <code>seedLength</code>. Parent reminders do
  not become child reminders.
- Rules support after, absolute-at, and fixed-rate every schedules.
- Fixed-rate schedules have a five-minute minimum.
- Local absolute time requires an explicit time zone.
- DST gaps reject. DST overlaps choose the first matching instant.
- Recurrence remains anchored to creation time.
- When several occurrences were missed, the runtime selects the latest missed
  occurrence rather than replaying a backlog.
- Long waits are segmented around the Node timer limit.
- The runtime rechecks wall time after waking and after maintenance admission.
- A forward clock jump makes a target overdue.
- A backward clock jump does not fire early.
- A cold Session has no timer until the Agent is resumed.
- Management and dispatch share an exact-Agent transaction queue.
- Management performs a persistence preflight and a post-append barrier.
- An unconfirmed management mutation returns
  <code>persistence_uncertain</code>.

The due-dispatch path in <code>runtime.ts</code> is:

<pre>
flush preflight
  -&gt; verify exact live root Agent
  -&gt; claim maintenance while idle
  -&gt; refold durable state
  -&gt; resample wall clock
  -&gt; frame reminder
  -&gt; Agent.followup(message)
  -&gt; append dispatch event
  -&gt; release maintenance
  -&gt; flush barrier
</pre>

Tests cover the actual boundaries:

- <code>packages/schedule/schedule/tests/domain.spec.ts</code>;
- <code>packages/schedule/schedule/tests/recurrence.spec.ts</code>;
- <code>packages/schedule/schedule/tests/runtime.spec.ts</code>;
- <code>packages/schedule/schedule/tests/jsonl-restart.spec.ts</code>;
- <code>packages/schedule/schedule/tests/tools.spec.ts</code>;
- <code>packages/schedule/schedule/tests/invariant.spec.ts</code>.

The restart test proves one reminder under the clean tested restart sequence.
The package README explicitly declines an exactly-once model-completion or
user-acknowledgement claim.

### 7.2 Crash ambiguity

There is a narrow but material interval:

<pre>
Agent.followup accepted
  -&gt; process crashes
  -&gt; schedule dispatch event was not appended
</pre>

The reminder may already be accepted by the live inbox, but durable schedule
state still says it is due. DeepSeek faults the owner after an append failure
to avoid repeating the already-queued message in the same process. That does
not resolve a process crash between acceptance and the dispatch record.

This is not a criticism of the package's stated contract. It is a boundary
Ashley must not silently widen. The observed dispatch marker is not:

- proof that a model ran;
- proof that Agency admitted the reminder;
- proof that a Discord message was sent;
- proof that the user received it;
- an independent Effect Witness.

### 7.3 Ashley mapping

A durable routine should produce a **due observation**, not an instruction.
The future owning contract should separate:

1. Routine definition.
2. Durable next-due calculation.
3. Wake/admission proposal.
4. Agency decision.
5. Effect preparation.
6. Immediate authority and environment revalidation.
7. Effect commit attempt.
8. Receipt.
9. Independent observation when required.
10. Reconciliation.

<code>persistence_uncertain</code> is a useful term for an unconfirmed schedule
record. It is not sufficient for a possibly executed external effect. A
possibly executed effect remains <code>OUTCOME_UNKNOWN</code>.

The useful scheduling mechanics are:

- strict versioned event decoding;
- replay invariants;
- fork-suffix ownership;
- non-reused ids;
- reconstructable timers;
- clock-jump tests;
- fixed-rate anchoring;
- missed-backlog bounding;
- persistence barriers;
- exact live owner checks;
- teardown that prevents post-disposal work.

The DeepSeek delivery order is not Ashley's effect contract.

**State/timer mechanics classification:** ADAPT.

**DeepSeek dispatch boundary classification:** REJECT.

## 8. Continuable worker/subagent lifecycle analysis

### 8.1 The design evolution

DeepSeek preserves both the superseded and current design records:

- earlier:
  <code>.agents/notes/implemented/feature/2026-07-21-continuable-background-subagents.md</code>;
- current:
  <code>.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md</code>.

| Concern | Earlier Task-backed design | Current Activation design | Reusable lesson |
|---|---|---|---|
| Durable identity | Child Session | Child Session | Durable identity outlives live execution |
| Live unit | Task + SubagentRun + AgentHandle per turn | One Activation per residency epoch with retained AgentHandle | Align lifetime with the actual owned resource |
| Input ordering | Task association plus Agent paths | Agent inbox only | One FIFO must own execution order |
| Result | Per-Task result | No per-message result | Do not invent a result boundary that the underlying system cannot correlate |
| Cancellation | Task/activation cancellation | Caller cancellation only before inbox acceptance; later interrupt is separate | Acceptance changes cancellation ownership |
| Cold resume | Provider resume path and fresh Task | Manager reconstructs generic Agent from descriptor | Provider should not become durable owner |
| Parent lifetime | Exact live parent in Task ownership | Activation owns child ids; parent waits while children drain | Parent/child teardown is a graph, not a counter |
| Settlement | Task terminal after run disposal | Quiescence, descendants, final flush, handle disposal, ownership release | Terminal publication must follow resource settlement |

The current implementation removed Task-per-Activation because Task status,
result, cancellation, and its queue duplicated the Agent loop and inbox. The
manager now treats Activation as one residency epoch. It does not create a
second execution FIFO.

### 8.2 What Ashley should take

Ashley should take these principles:

- A durable worker conversation and its live residency have different
  lifetimes.
- One component owns input ordering.
- A live handle is retained only while unfinished work or descendants require
  it.
- Child release is child-first.
- Cancellation can propagate top-down while resource release remains
  child-first.
- Disposal converges on one memoized transaction.
- A racing delivery either reaches the exact live Activation or waits for
  disposal and cold-resumes. It must not adopt an untracked handle.
- A provider prepares mechanics. The owner of worker lifecycle materializes and
  owns the handle.
- The direct live parent is checked at the final synchronous admission span.
- Sender identity on a message records provenance. It does not authorize the
  send.

Ashley should not copy the removal of Task semantics without a workload test.
Operational Continuity needs durable job status, effect reconciliation,
artifacts, and owner-visible recovery. Those are independent product
requirements. If Ashley needs per-request result, cancellation, or SLA
semantics, it should add a durable inbox ticket or operation record without
creating a second execution queue.

### 8.3 Explicit limitations that remain open for Ashley

DeepSeek explicitly has no:

- durable inbox;
- restart guarantee for an accepted but unlogged message;
- cross-process Activation lease;
- automatic replay of interrupted inbox work;
- remote continuable Activation;
- public residency query;
- general authenticated host or workflow authority.

These are not small omissions for Ashley. They define the highest-value
Operational Continuity spikes.

**Superseded Task-backed design classification:** REFERENCE.

**Current Activation lifecycle-mechanics classification:** ADAPT.

## 9. Goal mechanics analysis

### 9.1 Neutral mechanisms observed

The goal service is implemented in:

- <code>packages/goal/goal/src/types.ts</code>;
- <code>packages/goal/goal/src/domain.ts</code>;
- <code>packages/goal/goal/src/fold.ts</code>;
- <code>packages/goal/goal/src/runtime.ts</code>;
- <code>packages/goal/goal/src/invariant.ts</code>.

The automatic continuation consumer is:

- <code>packages/goal/goal-round-driver/src/index.ts</code>;
- <code>packages/goal/goal-round-driver/src/prompt.ts</code>.

Relevant tests include:

- <code>packages/goal/goal/tests/goal.spec.ts</code>;
- <code>packages/goal/goal/tests/invariant.spec.ts</code>;
- <code>packages/goal/goal/tests/projection.spec.ts</code>;
- <code>packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts</code>.

**Observed — DeepSeek source:**

- <code>GoalId</code> is stable across revisions.
- <code>GoalRef</code> is an id/revision CAS fence.
- Every mutation writes the complete post-mutation snapshot.
- Clear writes a revisioned tombstone.
- Durable phases are active, paused, blocked, and complete.
- Block reasons combine a lower-kebab-case code and normalized human message.
- Strict replay rejects malformed shapes, revision discontinuity, illegal
  transitions, timestamp regressions, id reuse, and nonsequential round
  admission.
- The admitted-round count advances only from attributed durable user messages.
- Activation is process-local and never inherited on load, resume, or fork.
- The driver disarms on uncertainty and requires explicit later resume.
- At most one current goal exists.
- The package has no independent completion evaluator.

### 9.2 Transfer boundary

The following mechanics are neutral enough to adapt later:

- stable id plus revision;
- CAS mutation;
- full snapshots or explicit patches under a versioned schema;
- tombstones;
- closed durable lifecycle vocabulary;
- typed block codes;
- strict replay;
- attributed accounting;
- persisted state distinct from current execution activation.

The following meanings MUST NOT transfer:

- one current goal;
- the phase names as Ashley's internal semantics;
- round count as Ashley effort or commitment;
- the model or driver as completion authority;
- automatic continuation because a durable record is active;
- goal state in a Session log as Ashley Mind State authority.

Ashley owns the distinction between a request, intention, commitment,
OpenConcern, motivation, plan, and completed obligation. A neutral CAS record
cannot decide which concept exists.

**Neutral mechanics classification:** ADAPT, in the later owning phase.

**Goal semantics and round driver classification:** REJECT.

## 10. Context compaction analysis

### 10.1 Observed transaction

The capability definition and mechanics are in:

- <code>packages/compaction/compaction/src/types.ts</code>;
- <code>packages/compaction/compaction/src/checkpoint.ts</code>;
- <code>packages/compaction/compaction/src/tool-pairing.ts</code>;
- <code>packages/compaction/compaction/src/invariant.ts</code>;
- <code>packages/compaction/compaction-basic/src/region.ts</code>;
- <code>packages/compaction/compaction-basic/src/summarizer.ts</code>;
- <code>packages/compaction/compaction-tool-result-pruner/src/index.ts</code>.

DeepSeek keeps an append-only raw Session log and a replaceable model-visible
surface. A successful summarizing compaction writes:

<pre>
compaction/start
  -&gt; summary generation
  -&gt; compaction/summary
  -&gt; one replacement user/message with correlated provenance
  -&gt; compaction/end
</pre>

The raw shadowed events remain. The surface projection replaces them with the
checkpoint. The marker pair is a durable lock. A crash after start and before
end leaves a visible orphan rather than a false completion marker.

The implementation:

- revalidates the selected surface span after summary generation;
- rejects a summary that is not smaller than the source;
- keeps summary provider/model and optional usage/output facts;
- excludes reasoning and tool calls from checkpoint output;
- uses tool-call/result boundary helpers so a call is not split from its
  result;
- supports model-free pruning of oversized tool results;
- retries bounded compaction under pressure;
- allows provider-confirmed overflow recovery;
- distinguishes a log-only transaction from the one surface mutation;
- preserves cancellation after cleanup;
- treats a failed closing append as an intentional blocking orphan.

Tests include:

- <code>packages/compaction/compaction/tests/compaction.spec.ts</code>;
- <code>packages/compaction/compaction/tests/tool-pairing.spec.ts</code>;
- <code>packages/compaction/compaction-basic/tests/compaction-basic.spec.ts</code>;
- <code>packages/compaction/compaction-basic/tests/compaction-loop-repro.spec.ts</code>;
- <code>packages/compaction/compaction-tool-result-pruner/tests/tool-result-pruner.spec.ts</code>.

### 10.2 Ashley fit

The valuable future mechanisms are:

- raw durable history distinct from current model projection;
- correlated begin/summary/replacement/end facts;
- crash-visible incomplete compaction;
- exact source-range provenance;
- balanced tool-call/result cuts;
- deterministic model-free pruning before model summary;
- token measurement as a separate seam;
- provider/model attribution for generated summaries;
- revalidation before projection replacement.

Ashley must add stronger semantic constraints:

- a summary is a lossy projection, not truth;
- a summary cannot become Recall authority merely because it is durable;
- projection removal is not forgetting;
- forgetting and lineage remain controlled by Ashley's continuity sidecar;
- model-generated summary claims need provenance and epistemic treatment;
- hidden source remains governed by retention and user-forgetting policy;
- context overflow recovery cannot bypass routing, budget, or authorization.

This work belongs to CONTEXT-BUDGET-01 after the worker and operational topology
is real.

**Classification:** DEFER.

## 11. Cordis and effect-lifecycle analysis

### 11.1 Useful patterns

DeepSeek vendors <code>@deepseek-ai/cordis</code> version 4.0.1 at
<code>vendor/cordis</code>. Relevant sources are:

- <code>vendor/cordis/src/fiber.ts</code>;
- <code>vendor/cordis/src/events.ts</code>;
- <code>vendor/cordis/src/reflect.ts</code>;
- <code>vendor/cordis/src/registry.ts</code>;
- <code>vendor/cordis/src/service.ts</code>.

Useful mechanism patterns are:

- service definition separate from provider and consumer;
- explicit dependency injection;
- scoped registrations;
- registrations that return disposers;
- reverse-order cleanup;
- async cleanup that remains owner-visible;
- rejection of new effects while the owner is unloading;
- rollback when setup fails;
- child fiber ownership;
- listener disposal with the owning lifetime;
- exact service provider ownership.

DeepSeek uses the pattern consistently. Schedule tools, provider registries,
Agent handles, approval listeners, and other registrations unwind with their
plugin fiber.

### 11.2 Why Cordis should not become Ashley's kernel

Direct adoption would create several kinds of drift:

1. DeepSeek places nearly every product behavior in a shared plugin context.
   Ashley uses an explicit Identity → Mind State → Thought → Expression →
   Rendering ownership model and separate effect/authority planes.
2. Cordis service availability is a mechanism. It cannot express delegated
   capability, owner authorization, or current execution admission by itself.
3. Cordis event extensibility can make “listener exists” look like authority.
   Ashley requires typed admission and attenuation.
4. DeepSeek Session and Agent types are embedded throughout the useful
   packages. Importing Cordis would not isolate those contracts.
5. The vendored framework contains extensive DeepSeek-specific hardening and
   local changes. Adopting it creates a framework maintenance obligation.
6. HMR and reversible plugin loading do not prove durable work recovery,
   effect outcome, or qualification.
7. A broad plugin kernel would compete with current AshleyRuntime and Sandbox
   mechanisms.

No individual Cordis-family library was found that provides enough neutral
value, with a thin enough Ashley adapter, to clear the direct-port bar.

**Pattern classification:** REFERENCE.

**Framework adoption classification:** REJECT.

## 12. Approval seam analysis

### 12.1 Observed contract

Relevant sources and tests:

- <code>packages/interaction/user-approval/src/types.ts</code>;
- <code>packages/interaction/user-approval/src/index.ts</code>;
- <code>packages/interaction/user-approval/src/invariant.ts</code>;
- <code>packages/interaction/user-approval/tests/approval.spec.ts</code>;
- <code>packages/interaction/user-approval/tests/invariant.spec.ts</code>;
- <code>packages/interaction/permission-presets/src/index.ts</code>.

The outcome vocabulary is closed:

- <code>allowed-once</code>;
- <code>rejected</code>;
- <code>cancelled</code>;
- <code>unavailable</code>.

Missing, throwing, rejecting, or rogue-vocabulary answerers normalize to
<code>unavailable</code>. Policy <code>never</code> rejects without consulting
answerers. Abort returns <code>cancelled</code> and ignores late answers.

Each request appends paired <code>approval/asked</code> and
<code>approval/decided</code> records. Invariants reject duplicate, unmatched,
unknown, or out-of-turn audit events. A failure before the audit append commits
rejects rather than returning an unlogged decision.

Limitations are material:

- approval is valid only inside an open Agent turn;
- grants are one-shot only;
- the request carries tool name, reason, and optional call id, but no tool
  arguments;
- there is no built-in human answerer;
- ACP supplies machine choices for bridge-owned sessions;
- permission presets combine DeepSeek sandbox mode and approval policy.

### 12.2 Ashley separation

Ashley needs four distinct records:

| Layer | Question | Example result |
|---|---|---|
| Human approval | What did the owner explicitly approve or reject? | approved scope, rejected, expired, withdrawn |
| Authorization policy | Is this action allowed under current policy? | allow, deny, needs approval |
| Delegated capability | What bounded authority was granted to this principal? | capability id, scope, ceiling, expiry |
| Execution admission | May this exact prepared operation proceed now? | admitted, refused, stale, uncertain |

An <code>allowed-once</code> answer is only human/machine approval evidence. It
does not mint a capability unless an Ashley-owned policy explicitly does so.
It does not bypass final revalidation. It does not prove execution.

Useful adaptations are:

- closed outcomes;
- fail-closed absence;
- asked/decided correlation;
- late-answer suppression;
- append-before-return audit discipline;
- invariant tests for unmatched or duplicate decisions;
- explicit <code>unavailable</code> distinct from rejection.

DeepSeek's permission presets, tool-name-only request, and ACP auto-answer
policy should not be imported.

**Audit/outcome mechanics classification:** ADAPT.

**Authorization semantics classification:** REJECT.

## 13. Durable workflow substrate interaction

### 13.1 Hypothesis verdict

**Verdict: yes.** DeepSeek-inspired WorkerSession, WorkerActivation, and ACP
mechanisms can sit above or beside Restate, Temporal, or DBOS.

They answer different questions:

- The worker/session layer answers **who/what is this bounded worker instance,
  what is its lineage, who controls it now, where may it run, and how does its
  process lifetime settle?**
- A durable execution engine answers **which mechanical step is pending, how
  is it resumed, when does a timer fire, how are retries/checkpoints stored,
  and which worker should receive the next orchestration task?**
- Ashley answers **what the work means, whether it is authorized, whether an
  output is admitted, whether an effect occurred, and whether it changes
  cognition or relationship state.**

~~~mermaid
flowchart TB
  A["Ashley semantic and authority plane<br/>Identity, Thought, Agency, policy, outcome meaning"] --> W
  W["Ashley worker plane<br/>WorkerSession, WorkloadPrincipal, WorkerActivation, inbox, ACP adapter"] --> D
  D["Optional durable execution substrate<br/>Restate or Temporal or DBOS"] --> E
  W --> E
  E["Ashley effect and resource plane<br/>Sandbox Broker, ExecutionWorkspace, artifacts, connectors, Effect Witness"]
  E --> R["Receipts, observations, reconciliation"]
  R --> A
~~~

The engine is optional per workload. It is not a lower constitutional
authority.

### 13.2 Current external substrate facts

The following facts were checked against official documentation on 2026-08-13.
They are not qualification results.

| Substrate | Current official mechanism | Natural complementary role | Main Ashley collision risk |
|---|---|---|---|
| Restate | Journals durable actions; supports services, keyed Virtual Objects, Workflows, durable timers, durable promises, and replay/recovery. Virtual Objects provide single-writer state per key. Sources: [key concepts](https://docs.restate.dev/foundations/key-concepts), [actions](https://docs.restate.dev/foundations/actions), [workflows](https://docs.restate.dev/tour/workflows), [service types](https://docs.restate.dev/foundations/services). | Keyed WorkerSession coordinator, long waits, signals, durable calls, timers | Restate K/V or Workflow identity could become a second authority/continuity store; journaled effects could be overstated as Effect Witnesses |
| Temporal | Durable Event History drives Workflow replay. Workflow code must be deterministic. Non-deterministic work, including LLM/API/database calls, belongs in Activities; Activity code should be idempotent. Sources: [Workflow definition](https://docs.temporal.io/workflow-definition), [Activities](https://docs.temporal.io/activities), [Event History](https://docs.temporal.io/encyclopedia/event-history), [timers](https://docs.temporal.io/workflow-execution/timers-delays). | Distributed orchestration, durable timers, signals, child workflows, long-running cross-service work | Workflow replay/versioning could duplicate or misclassify model/effect calls; Workflow id could be confused with WorkerSession id |
| DBOS | Library-based durable workflows checkpoint workflow inputs and step outputs in Postgres. Single-node startup scans pending work; distributed recovery needs coordination. Queues and schedules also persist in Postgres. Sources: [why DBOS](https://docs.dbos.dev/why-dbos), [architecture](https://docs.dbos.dev/architecture), [workflow recovery](https://docs.dbos.dev/production/workflow-recovery), [transactional outbox example](https://docs.dbos.dev/python/examples/outbox). | SQL-centered workflow steps, transactional enqueue, local-to-distributed evolution | Postgres workflow state could become a second operational authority; nontransactional external steps remain retry/idempotency concerns |

Restate, Temporal, and DBOS all provide stronger durable execution machinery
than the DeepSeek Session/Activation layer. None should define Ashley's
Identity, cognition, authorization, effect meaning, or forgetting.

### 13.3 Complementary versus redundant responsibility

| Responsibility | Ashley worker/session layer | Durable engine | Ashley semantic/effect layer |
|---|---:|---:|---:|
| Stable worker identity and lineage | **Owns** | Carries correlation only | Interprets provenance |
| WorkloadPrincipal and authority attenuation | **Owns record** | Carries opaque snapshot/id | **Owns policy and revalidation** |
| Process-local Activation and handle | **Owns** | Schedules work to a process | Observes only |
| Cross-process single-Activation lease | May own behind SPI | May implement mechanism | Decides admission meaning |
| Durable inbox ordering | Owns logical order | May persist/deliver tickets | Decides whether event is instruction |
| Durable timers and long waits | Small local cases | **Owns when selected** | Decides what a wake means |
| Workflow step replay | No | **Owns** | Constrains which steps are replay-safe |
| Model invocation | Correlates session/budget | Activity/run mechanism only | Model Fabric owns route, attempt, receipt, and output admission |
| External effect | Correlates work | May invoke an activity/step | **Owns PREPARE, REVALIDATE, COMMIT, witness, reconciliation** |
| Conversation/model projection | May provide worker-local transcript | Must not own | Ashley controls cognitive/context admission |
| Recall, forgetting, Identity, Mind State | No | No | **Ashley only** |
| Artifact storage/transport | Binds workspace/artifact ids | May orchestrate | Ashley Artifact Registry and provenance policy own meaning |

### 13.4 Workloads that may not need a heavyweight engine

An event-sourced durable record plus reconstructed disposable Activation is
likely sufficient when all of these are true:

- one trusted host owns execution;
- a single durable store and a process-start reconciliation pass are enough;
- work has few steps;
- no distributed wait/signal is needed;
- accepted input is durably ticketed before restart survival is claimed;
- external effects are absent or separately governed by idempotency,
  <code>OUTCOME_UNKNOWN</code>, and reconciliation;
- operational visibility can be implemented over the record;
- timer scale and recovery latency are modest.

Candidate workloads:

| Workload | Minimal record + Activation | Engine threshold |
|---|---|---|
| Local bounded coding/review worker | Usually sufficient after durable inbox and lease | Add engine for distributed workers, multi-day waits, or cross-service fan-out |
| Continuable child conversation on one Mint host | Usually sufficient | Add engine when remote continuation or HA is required |
| A few owner reminders/routines | Schedule record and reconstructable timer may suffice | Add engine for large timer volume, distributed firing, or strict failover |
| Workspace preparation and local artifact checks | Existing Sandbox records may suffice | Add engine when steps span services or must resume on another node |
| One model call with no tools | Model Fabric attempt record is sufficient | Engine adds little unless embedded in a longer workflow |
| Short deterministic projection/reconciliation pass | Durable queue/lease may suffice | Engine for parallel scale or durable dependencies |

“Sufficient” here means mechanically sufficient after the missing durable inbox
and cross-process lease are solved. It does not mean qualified or activated.

### 13.5 Workloads that favor an engine

| Workload | Why an engine helps | Ashley boundary that remains |
|---|---|---|
| Human approval or external event waits lasting hours/days | Durable suspend/signal/timer | Approval does not itself mint capability |
| Multi-service operational workflow | Durable step graph, retries, visibility | Effect semantics and ambiguous commit remain Ashley-owned |
| Remote worker fleet | Durable scheduling, routing, failover, leases | Worker identity and current authority remain Ashley-owned |
| Large recurring schedule fleet | Durable timers and recovery | Due event remains data, not Agency |
| Long artifact pipeline | Step checkpoints and fan-out | Artifact meaning, integrity, provenance, and admission remain Ashley-owned |
| Connector synchronization | Durable polling/backoff and job state | Connected account is not delegated capability |
| Recovery that must move between hosts | Engine-owned durable progress | ResumeGuard, environment identity, and authority revalidation remain Ashley-owned |

### 13.6 Failure modes of layering

| Failure mode | Consequence | Required control |
|---|---|---|
| Two sources of truth for worker state | Engine and Ashley disagree about running/completed | One Ashley-owned WorkerSession state machine; engine state is correlated mechanism evidence |
| Workflow id treated as WorkerSession id | Engine identity becomes authority | Separate ids and typed mappings |
| Workflow replay performs model/tool calls inline | Duplicate calls or nondeterminism | Put calls behind stage-valid Activities/actions/steps and Ashley attempt records |
| Engine retry hides a post-send ambiguity | Duplicate external consequence | No blind retry after possible commit; reconcile first |
| Resume uses creation-time authority | Stale or amplified authority | Fresh REVALIDATE with current policy and owner state |
| Engine queue and WorkerInbox both order input | Nondeterministic conversation/work order | One logical inbox; engine transports tickets, not a second semantic FIFO |
| Ashley DB and engine store update independently | Orphaned or contradictory state | Transactional outbox where possible; otherwise explicit reconciliation states |
| Two processes materialize one Activation | Concurrent tools and divergent history | Lease with fencing token plus exact live ownership check |
| Engine cancellation reported as “not executed” | False refusal claim | Cancellation only reports control outcome; possible effect remains <code>OUTCOME_UNKNOWN</code> |
| Workflow code changes while histories exist | Replay failure or wrong step mapping | Versioned workflow definitions and compatibility tests |
| Engine retention deletes state | Mistaken forgetting | Engine retention is operational retention, never Ashley forgetting |
| Operational engine outage | Ashley loses work execution path | Fail closed, surface unavailable, preserve durable records, no semantic fallback |
| Engine observability treated as qualification | Unsafe promotion | Evaluation/Qualification Plane remains independent |

### 13.7 Substrate decision shape

The Restate/Temporal/DBOS spike should compare two architectures for the same
crash corpus:

1. **Minimal:** Ashley WorkerSession store + durable inbox tickets + Activation
   lease + process-start reconciliation.
2. **Layered:** the same Ashley contracts, with one engine implementing the
   durable execution provider.

The winner may differ by workload. OPERATIONAL-CONTINUITY-01 does not need one
engine to own every class of work.

**Layering hypothesis classification:** SPIKE, with a positive architectural
presumption and no substrate selection yet.

## 14. Direct source reuse candidates

### 14.1 PORT-01: cooperative ACP child teardown ladder

This is the only candidate that currently clears the PORT definition.

#### Exact source

- implementation:
  <code>packages/subagent/subagent-acp/src/run.ts</code>;
- focused unit and process tests:
  <code>packages/subagent/subagent-acp/tests/subagent-acp.spec.ts</code>;
- process-seam dependency contract:
  <code>packages/subprocess/subprocess/src/index.ts</code>;
- package manifest:
  <code>packages/subagent/subagent-acp/package.json</code>.

The source to extract is:

- private helper <code>treeExitsWithin()</code>;
- exported <code>disposeAcpChild()</code>;
- bounded defaults only if Ashley's owning contract adopts the same policy.

Do not copy the whole <code>run.ts</code> module. The module also imports the
ACP SDK and DeepSeek LLM, Session, Subagent, and Subprocess contracts.

#### Exported source signature and package API status

<code>disposeAcpChild()</code> is exported from <code>src/run.ts</code> and used
by source-level tests. The package root <code>src/index.ts</code> imports it but
does not re-export it. It is therefore not a stable package-root API. This is
another reason to extract the small implementation under the MIT terms instead
of depending on the package.

The observed source signature is:

<pre>
disposeAcpChild(child: SubprocessHandle, eofGraceMs: number): Promise&lt;void&gt;
</pre>

The function:

1. observes a failed/unpublished child so disposal cannot create an unhandled
   rejection;
2. closes stdin;
3. waits a bounded EOF grace for whole-tree natural exit;
4. invokes the process handle's termination escalation;
5. waits without a second derived timeout for the process owner's whole-tree
   exit proof.

The separation between EOF grace and SIGTERM grace is important. A real child
may need more time to flush persistence and stop its own descendants than the
parent should give a signal-ignoring process after SIGTERM.

#### Dependencies

The extracted algorithm needs:

- <code>AbortController</code>;
- <code>setTimeout</code> and <code>clearTimeout</code>;
- a structural process handle with:
  - process-publication state or pid;
  - optional writable stdin;
  - a spawn-completion promise;
  - <code>waitForExit(signal?)</code> that proves whole-tree exit;
  - <code>terminate()</code> whose owner performs platform-correct escalation.

It does not need Cordis, DeepSeek Session, DeepSeek Agent, DeepSeek approval,
or the ACP SDK after extraction.

#### Required Ashley wrapper

Use an Ashley-owned interface, for example:

<pre>
interface WorkerProcessHandle {
  readonly published: boolean;
  readonly input: { close(): void } | null;
  readonly done: Promise&lt;void&gt;;
  waitForTreeExit(signal?: AbortSignal): Promise&lt;boolean&gt;;
  terminateTree(): void;
}
</pre>

The exact name is provisional. The wrapper MUST be backed by the already
qualified or separately qualified Ashley process owner. The port must not
create a second subprocess implementation beside Sandbox.

#### Semantics that MUST NOT cross the wrapper

- DeepSeek Session or Agent identity;
- DeepSeek <code>SubagentRun</code> lifetime;
- ACP session id as authority;
- DeepSeek auto-approval policy;
- DeepSeek stop-reason mapping;
- local cwd inheritance as workspace authorization;
- a claim that EOF or cancellation proves no work occurred;
- a claim that process exit proves external effects did not occur;
- the default grace values as unreviewed policy.

The function proves process-tree quiescence only to the strength of the
underlying handle. It is not an Effect Witness for prior child effects.

#### Likely adaptation size

- 30–60 lines for the algorithm and Ashley handle adapter;
- 150–300 lines of focused tests, depending on reuse of the existing process
  fixtures;
- 0.5–1.5 engineer-days for code;
- 1–3 additional days for cross-platform and failure-injection verification.

These are planning estimates.

#### Test assets to port

The DeepSeek tests cover:

- cooperative exit after stdin EOF without a signal;
- EOF-deaf child reaching normal termination;
- SIGTERM-trapping child reaching SIGKILL;
- failed spawn disposal;
- idempotent run disposal;
- startup rollback allowing EOF flush;
- EOF grace longer than termination grace;
- bounded return when the child ignores EOF and SIGTERM;
- platform-specific termination expectations;
- invalid grace bounds.

Ashley should port the test scenarios, not fixture paths or DeepSeek process
semantics.

#### Licensing

The implementation is in an MIT-licensed DeepSeek package under the repository
MIT license. Preserve the applicable DeepSeek copyright and MIT permission
notice in copied or substantial source. Extracting this function avoids the
Apache-2.0 ACP SDK dependency because the function itself does not use the SDK.

#### Port gate

PORT means “credible direct source candidate.” It does not mean accepted,
qualified, installed, activated, or deployed. The port should occur only inside
an authorized OPERATIONAL-CONTINUITY-01 implementation spike and must use the
existing Ashley process boundary.

### 14.2 Near-port candidates that do not clear PORT

| Source | Why it looks portable | Why it is not PORT | Classification |
|---|---|---|---|
| <code>packages/schedule/schedule/src/domain.ts</code> recurrence functions | Pure integer anchoring and strong tests | Encodes policy for latest-only recurrence, IANA/DST treatment, event types, and DeepSeek Session ownership; Ashley Routine semantics are not settled | ADAPT |
| <code>packages/sdk/protocol/src/transport.ts</code> | Small Node-only JSON-RPC line transport | Unbounded input buffer, no frame-size limit, no backpressure contract, malformed-frame silence, no cancellation method, no protocol negotiation, no runtime schema validation | REFERENCE |
| <code>packages/subagent/subagent-acp/src/run.ts</code> stop-reason mapping | Closed switch with unknown-fails-error | Maps <code>end_turn</code> to completed and ACP cancellation to aborted; those are not Ashley semantic/effect results | REJECT |
| <code>packages/compaction/compaction/src/tool-pairing.ts</code> | Pure-looking balanced boundary helper | Depends on DeepSeek Session surface semantics and belongs to phase 7 | DEFER |
| <code>packages/compaction/compaction/src/checkpoint.ts</code> | Small correlated provenance constructor | DeepSeek message-source vocabulary is not Ashley context/Recall provenance | DEFER |
| <code>packages/interaction/user-approval/src/types.ts</code> outcome union | Small closed vocabulary | Ashley needs different layer ownership and richer scope; retyping it is safer than importing its Session/Cordis contract | ADAPT |
| <code>packages/goal/goal/src/fold.ts</code> | Strict decoder and replay fold | Goal labels, Session events, and model-round accounting are semantically coupled | ADAPT |

## 15. Architecture traps and explicit rejects

1. **Harness replacement.** DeepSeek Harness is not an AshleyRuntime
   replacement.
2. **Developer-preview coupling.** Direct package imports accept breaking API
   changes and a 226-package family surface.
3. **Session-log authority.** DeepSeek's rule that model-visible content is
   logged is useful for reconstruction. It does not make the log Ashley Recall,
   truth, Identity, Mind State, forgetting, or continuity authority.
4. **Persisted-parent authority.** <code>parentSession</code> is lineage. It
   cannot authorize current control.
5. **Handle-as-identity.** A live handle is a process resource, not Ashley or a
   durable worker identity.
6. **ACP identity collapse.** ACP session ids are transport-scoped data.
7. **ACP permission collapse.** An ACP option selection is not owner
   authorization, delegated capability, or execution admission.
8. **Unauthenticated remote use.** DeepSeek's no-auth stdio bridge cannot be
   promoted into a remote worker channel.
9. **Stop-reason overclaim.** <code>end_turn</code> is not semantic completion.
   <code>cancelled</code> is not proof of non-execution.
10. **Scheduler-as-Agency.** A due timer proposes attention. It does not decide
    whether Ashley should act.
11. **Dispatch-as-delivery.** Inbox enqueue, dispatch record, model completion,
    platform send, and human receipt are distinct.
12. **Goal import.** DeepSeek goal phases and round driver do not define Ashley
    goals, commitments, or concerns.
13. **Worker-to-cognition write.** Worker output remains candidate input.
14. **Cordis kernel.** Extensible plugin machinery cannot become Ashley's
    semantic or authority core.
15. **Service-presence authority.** A registered provider or tool is not
    capability or permission.
16. **Compaction-as-forgetting.** Projection replacement is not forgetting.
17. **Summary-as-truth.** A generated checkpoint is a lossy attributed
    projection.
18. **Receipt-as-witness.** A DeepSeek Session event, flush result, schedule
    marker, engine checkpoint, or executor receipt is not automatically an
    independent Effect Witness.
19. **Blind engine retry.** A workflow retry must not repeat a possibly
    committed Ashley effect.
20. **Engine-state cognition.** A queued workflow is not an OpenConcern or
    motivation.
21. **Environment-as-authority.** cwd, workspace id, environment fingerprint,
    tool surface, and model route describe mechanics. They do not grant
    authority.
22. **Test-as-qualification.** DeepSeek tests and a future local Ashley spike
    provide evidence. They do not qualify, promote, activate, or deploy a
    capability.

## 16. Proposed changes to OPERATIONAL-CONTINUITY-01

These are proposed content refinements. This dossier does not edit the canonical
roadmap.

### 16.1 Additions

Add the following concepts to the OPERATIONAL-CONTINUITY-01 investigation:

1. **WorkerSessionRecord**
   - durable operational worker identity;
   - stable lineage and delegation depth;
   - engine and ACP ids stored only as mappings;
   - distinct from SpecialistSession and cognitive state.
2. **WorkerActivation**
   - at-most-one live residency per WorkerSession;
   - process-local handle;
   - memoized disposal;
   - explicit state such as materializing, resident, draining, and released.
3. **WorkerActivationLease**
   - cross-process lease with fencing token;
   - required when single-host ownership cannot be proven;
   - never a capability grant.
4. **WorkerControlCapability**
   - unforgeable current control right;
   - attenuated from the parent operation;
   - revalidated at final admission.
5. **WorkerReconstructionDescriptor**
   - versioned mechanical inputs;
   - provider-independent where possible;
   - no timeless authorization snapshot.
6. **WorkerInboxTicket**
   - durable acceptance identity;
   - one logical FIFO;
   - distinct queued, claimed, admitted, executed, and settled states;
   - crash recovery and deduplication rules.
7. **Activation ownership forest**
   - child ids rather than a count;
   - top-down cancellation;
   - child-first handle release;
   - no adoption from durable lineage alone.
8. **Committed worker-output boundary**
   - partial deltas remain telemetry;
   - committed output becomes candidate input;
   - result correlation and semantic completion remain separate.
9. **Worker process quiescence contract**
   - cooperative EOF window;
   - platform termination escalation;
   - whole-tree exit proof;
   - independent effect reconciliation after exit when required.
10. **DurableExecutionProvider**
    - optional SPI implemented by a minimal local record, Restate, Temporal, or
      DBOS per workload;
    - cannot own Ashley semantics.

### 16.2 Modified spike questions

Modify the existing durable-substrate and ACP questions to ask:

1. Which store is authoritative for WorkerSession state?
2. Is the engine workflow id a one-to-one mapping, one-to-many run mapping, or
   absent for this workload?
3. Which state transition commits a durable inbox acceptance?
4. What prevents two processes from materializing the same WorkerSession?
5. What fencing token reaches tools and effects?
6. What survives a crash after inbox acceptance but before model-log admission?
7. Can the engine retry a model call? If so, how is the attempt id and
   stage-valid receipt preserved?
8. Which operations are safe to replay automatically?
9. Which failures produce REFUSED, FAILED, CANCELLED, or
   <code>OUTCOME_UNKNOWN</code>?
10. How is current parent authority revalidated after a long wait or cold
    resume?
11. Does the ACP peer authenticate? What exact capability does the channel
    receive?
12. How are remote workspace, tool surface, provider/model route, and
    environment fingerprints negotiated?
13. What does ACP prompt settlement correlate to: enqueue, one turn, whole
    Agent idle, task completion, or only transport response?
14. Can a connection drop after remote commit but before local observation?
15. How are child-first drain and process-tree quiescence proven across a
    remote boundary?
16. Can a minimal record/lease implementation meet the workload without an
    engine?
17. What operational burden does the engine add on Linux Mint?
18. How are workflow code changes applied to in-flight durable histories?

### 16.3 Implementation spikes

These spikes are proposed. None were executed in this documentation task.

1. **WORKER-LIFECYCLE-01**
   - pure TypeScript state machine;
   - WorkerSession, Activation, lease/fence, inbox ticket, parent control;
   - adversarial interleavings;
   - no process spawn or provider.
2. **ACP-WORKER-01**
   - official ACP SDK only;
   - scripted local stdio fixture;
   - initialize, capability negotiation, multi-session isolation, cancellation,
     committed output, and disconnect ambiguity;
   - no model/provider calls.
3. **ACP-TEARDOWN-PORT-01**
   - port the section-14 teardown ladder behind the existing Ashley process
     seam;
   - fixture-only cross-platform tests;
   - no activation.
4. **DURABLE-INBOX-01**
   - durable ticket plus one logical FIFO;
   - crash at every boundary;
   - cross-process lease and fencing;
   - no external effect.
5. **DURABLE-SUBSTRATE-COMPARISON-01**
   - same workload and crash corpus on minimal record, Restate, Temporal, and
     DBOS;
   - measure recovery, operational footprint, versioning, store consistency,
     and failure transparency.
6. **SCHEDULE-AMBIGUITY-01**
   - create/due/admit/dispatch/execute/observe matrix;
   - inject crashes between every pair;
   - require <code>OUTCOME_UNKNOWN</code> after possible consequence.
7. **WORKER-DRAIN-01**
   - nested Activation forest;
   - concurrent materialization;
   - parent-scoped and global drain;
   - sibling failure containment;
   - child-first exit proof.
8. **ENGINE-EFFECT-BOUNDARY-01**
   - one intentionally ambiguous external fixture;
   - prove the engine cannot blind-retry after possible commit;
   - test reconciliation before retry.

### 16.4 No-change confirmations

- Sandbox Autonomy remains phase 1.
- MODEL-FABRIC-01 remains phase 2.
- OPERATIONAL-CONTINUITY-01 remains phase 3.
- The Restate versus Temporal versus DBOS comparison remains open.
- <code>SemanticEnvironmentFingerprint</code> describes. It does not
  authorize.
- <code>ResumeGuard</code> decides safe continuation. It does not grant
  authority.
- ACP remains a worker protocol candidate.
- CloudEvents remains an envelope reference, not instruction authority.
- Graphiti remains a derived, rebuildable candidate, never memory authority.
- ORAS and in-toto remain artifact/provenance mechanisms.
- The Composio versus Nango comparison remains open and unaffected.
- <code>ExecutionWorkspace</code> and <code>WorkloadPrincipal</code> remain
  Ashley-owned contracts.
- Existing Sandbox durable task, session, workspace, artifact, receipt, and
  recovery work should be graduated where proven.
- <code>PREPARE -&gt; REVALIDATE -&gt; COMMIT</code> remains controlling.
- Possible execution or delivery remains <code>OUTCOME_UNKNOWN</code> until
  reconciled.
- Receipt remains distinct from Effect Witness.
- Evaluation / Qualification and Observability remain separate cross-cutting
  planes.

### 16.5 Explicit rejects

- no DeepSeek package family as the Operational Continuity core;
- no DeepSeek Session as WorkerSession storage without an Ashley contract;
- no Task-per-Activation duplicate queue;
- no process-local-only design presented as cross-process durable;
- no engine workflow id as authority;
- no ACP session id as authority;
- no ACP permission as authorization;
- no provider output as task completion;
- no scheduler wake as Agency;
- no Context Budget implementation in this phase;
- no automatic cognitive write from operational work.

### 16.6 Content-change verdict

**OPERATIONAL-CONTINUITY-01 content should change: YES.**

The roadmap should eventually record the durable WorkerSession / process-local
WorkerActivation split, exact-live control revalidation, durable inbox and
lease questions, child-first quiescence, and the explicit layered-engine
hypothesis. These additions clarify the current plan. They do not reorder it or
replace existing Sandbox machinery.

## 17. Deferred notes

### 17.1 CONTEXT-BUDGET-01

Keep these DeepSeek findings for phase 7:

- append-only raw history distinct from model-visible surface;
- versioned compaction begin/summary/replacement/end facts;
- crash-visible incomplete compaction;
- strict tool-call/result pairing;
- deterministic model-free pruning;
- separate token-meter seam;
- source-range and summarizer provenance;
- overflow recovery that requires actual projection progress;
- summary shrink checks;
- revalidation before replacement.

Add future Ashley questions:

1. Which durable store owns the source history?
2. How does projection source cite Recall and continuity lineage?
3. How are user-forgetting tombstones applied to hidden source and derived
   summaries?
4. Which claims in a generated summary remain epistemically eligible?
5. Can a summary be regenerated deterministically enough for audit?
6. How is model/profile identity attached without making the summary truth?
7. What context unit preserves tool/effect causal pairing?
8. How does the budget distinguish stable Identity, dynamic Mind State, active
   work, receipts, and optional background?

No Context Budget implementation or phase-order change is recommended now.

### 17.2 LEARNED-AUTONOMY-01

Keep only neutral goal-record mechanics:

- stable id plus revision;
- CAS updates;
- tombstones;
- typed blocked reasons;
- strict replay;
- attributed resource accounting;
- durable state separate from current execution activation.

Reject DeepSeek's goal meaning, automatic goal-round loop, model completion
authority, and one-current-goal policy.

Add future questions:

1. Which Ashley-owned cognitive type exists: goal, intention, commitment,
   concern, motivation, or plan?
2. What evidence can revise it?
3. Which transition requires owner action?
4. How does an operational workflow relate without becoming cognitive
   authority?
5. How does an unfinished worker create candidate evidence for an OpenConcern
   without creating one automatically?
6. What evaluator or deterministic rule can support completion?

No LEARNED-AUTONOMY-01 implementation or phase-order change is recommended now.

## 18. Recommended next experiments

Ordered by expected information value, not by authorization or roadmap
priority. Execution still follows the frozen roadmap and needs a fresh scoped
task.

1. **WORKER-LIFECYCLE-01**
   - Highest value because every engine and ACP decision depends on the missing
     Ashley state boundary.
   - Exit evidence: deterministic transition table and adversarial tests for
     leases, inbox acceptance, exact parent control, crash, and drain.
2. **DURABLE-INBOX-01**
   - Resolves the largest known DeepSeek limitation.
   - Exit evidence: accepted input is either durably recoverable or explicitly
     not accepted; concurrent resume is fenced.
3. **ACP-WORKER-01**
   - Tests the planned WorkerProvider against the real official SDK without
     taking DeepSeek package dependencies.
   - Exit evidence: truthful capabilities, local authentication assumption,
     separate ids, committed-output handling, cancellation ambiguity, and
     teardown.
4. **SCHEDULE-AMBIGUITY-01**
   - Cheap way to validate Ashley effect vocabulary across a concrete crash
     gap.
   - Exit evidence: no blind repeat after possible dispatch/execution.
5. **DURABLE-SUBSTRATE-COMPARISON-01**
   - Run only after the Ashley state machine and crash corpus exist.
   - Exit evidence: comparable Restate, Temporal, DBOS, and minimal-record
     measurements for the same workloads.
6. **ACP-TEARDOWN-PORT-01**
   - Low architecture uncertainty, useful concrete salvage.
   - Exit evidence: existing Ashley process owner proves cooperative flush,
     escalation, whole-tree exit, and idempotent disposal on supported hosts.
7. **WORKER-DRAIN-01**
   - Validates nested bounded workers after the base Activation contract.
   - Exit evidence: parent-scoped/global drain, sibling containment, and no
     orphan live handles.
8. **ENGINE-EFFECT-BOUNDARY-01**
   - Run against the leading engine only after the comparison narrows.
   - Exit evidence: ambiguous commit remains observable and unretried pending
     reconciliation.
9. **Future CONTEXT-COMPACTION-01**
   - Defer until phase 7.
   - Exit evidence: projection replacement cannot alter Recall, forgetting, or
     truth authority.

No experiment should use a live provider, deploy a service, activate Sandbox,
mutate Recall, or promote a capability unless a later task explicitly
authorizes it.

## 19. Final salvage verdict

DeepSeek Harness is a strong implementation reference for operational
lifecycle mechanics. It is a poor candidate for direct architectural adoption.

The high-confidence salvage is:

- **PORT:** one narrow ACP child process teardown ladder.
- **ADAPT:** durable Session / live Activation separation, exact-live-parent
  admission, child-first ownership, durable reconstruction descriptor, strict
  schedule folds, neutral goal CAS/tombstones, and approval audit invariants.
- **SPIKE:** official ACP WorkerProvider, durable inbox/lease, and layered
  engine comparison.
- **REFERENCE:** Session persistence failure tests, the Task-backed evolution,
  Cordis effect lifetimes, and the DeepSeek JSON-RPC transport as a negative
  checklist.
- **DEFER:** compaction and context projection to CONTEXT-BUDGET-01.
- **REJECT:** DeepSeek semantic authority, Session as memory, goal meaning,
  scheduler Agency, ACP authority, Cordis kernel adoption, and direct package
  coupling.

The important architecture result is not “choose DeepSeek instead of a durable
engine.” It is:

> Ashley should define worker identity, control, authority, and Activation
> lifecycle above the substrate. Then each workload can use either a minimal
> durable record or a selected durable engine without asking that mechanism to
> become Ashley.

The canonical phase order remains unchanged.

## Appendix A. Code-level trace inventory

### A.1 Durable Session and persistence

<pre>
Session API and header
  packages/core/session/src/types.ts
  packages/core/session/src/index.ts
    -&gt; persistence seam and coordinator
       packages/session/session-persistence/src/index.ts
       packages/session/session-persistence/src/coordinator.ts
       packages/session/session-persistence/src/write-behind.ts
         -&gt; JSONL provider
            packages/session/session-persistence-jsonl/src/index.ts
            packages/session/session-persistence-jsonl/src/format.ts
         -&gt; SQLite provider
            packages/session/session-persistence-sqlite/src/index.ts
            packages/session/session-persistence-sqlite/src/schema.ts
              -&gt; tests
                 packages/session/session-persistence/tests/coordinator-contract.ts
                 packages/session/session-persistence/tests/write-behind.spec.ts
                 packages/session/session-persistence-jsonl/tests/jsonl.spec.ts
                 packages/session/session-persistence-sqlite/tests/sqlite.spec.ts
</pre>

### A.2 Continuable subagent

<pre>
consumer
  packages/subagent/tool-subagent-control
    -&gt; service/types
       packages/subagent/subagent/src/types.ts
       packages/subagent/subagent/src/index.ts
         -&gt; durable descriptor and projection
            packages/subagent/subagent/src/descriptor.ts
            packages/subagent/subagent/src/projection.ts
         -&gt; lifecycle implementation
            packages/subagent/subagent/src/continuation.ts
            packages/subagent/subagent/src/lifecycle.ts
            packages/subagent/subagent/src/activation-setup-registry.ts
              -&gt; tests
                 packages/subagent/subagent/tests/continuation.spec.ts
                 packages/subagent/subagent/tests/continuation-inheritance.spec.ts
                 packages/subagent/subagent/tests/list-children.spec.ts
                 packages/subagent/subagent/tests/activation-setup-registry.spec.ts
</pre>

### A.3 ACP

<pre>
automation server
  packages/acp/acp/src/index.ts
  packages/acp/acp/src/codec.ts
    -&gt; official @agentclientprotocol/sdk
      -&gt; tests
         packages/acp/acp/tests/bridge.spec.ts
         packages/acp/acp/tests/multi-session.spec.ts
         packages/acp/acp/tests/approval.spec.ts
         packages/acp/acp/tests/dispose.spec.ts

subagent consumer/provider
  packages/subagent/subagent-acp/src/index.ts
    -&gt; client/process implementation
       packages/subagent/subagent-acp/src/run.ts
         -&gt; subprocess seam
            packages/subprocess/subprocess/src/index.ts
              -&gt; tests
                 packages/subagent/subagent-acp/tests/subagent-acp.spec.ts
                 packages/subagent/subagent-acp/tests/subagent-acp.e2e.ts

separate non-ACP SDK protocol
  packages/sdk/protocol/src/types.ts
  packages/sdk/protocol/src/transport.ts
    -&gt; packages/sdk/server/src/server.ts
    -&gt; packages/sdk/client/src/client.ts
      -&gt; packages/sdk/protocol/tests/transport.spec.ts
</pre>

### A.4 Schedule

<pre>
consumer
  packages/schedule/schedule/src/tools.ts
    -&gt; domain/types
       packages/schedule/schedule/src/types.ts
       packages/schedule/schedule/src/domain.ts
    -&gt; transaction/persistence
       packages/schedule/schedule/src/transaction.ts
       packages/schedule/schedule/src/persistence.ts
    -&gt; timer and dispatch
       packages/schedule/schedule/src/runtime.ts
         -&gt; tests
            packages/schedule/schedule/tests/domain.spec.ts
            packages/schedule/schedule/tests/recurrence.spec.ts
            packages/schedule/schedule/tests/runtime.spec.ts
            packages/schedule/schedule/tests/jsonl-restart.spec.ts
            packages/schedule/schedule/tests/tools.spec.ts
</pre>

### A.5 Goals

<pre>
goal service
  packages/goal/goal/src/types.ts
  packages/goal/goal/src/domain.ts
  packages/goal/goal/src/fold.ts
  packages/goal/goal/src/runtime.ts
    -&gt; continuation consumer
       packages/goal/goal-round-driver/src/index.ts
       packages/goal/goal-round-driver/src/prompt.ts
         -&gt; tests
            packages/goal/goal/tests/goal.spec.ts
            packages/goal/goal/tests/invariant.spec.ts
            packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts
</pre>

### A.6 Compaction

<pre>
service definition
  packages/compaction/compaction/src/types.ts
  packages/compaction/compaction/src/checkpoint.ts
  packages/compaction/compaction/src/tool-pairing.ts
    -&gt; provider
       packages/compaction/compaction-basic/src/index.ts
       packages/compaction/compaction-basic/src/region.ts
       packages/compaction/compaction-basic/src/summarizer.ts
    -&gt; optional pruner
       packages/compaction/compaction-tool-result-pruner/src/index.ts
         -&gt; tests
            packages/compaction/compaction/tests/tool-pairing.spec.ts
            packages/compaction/compaction-basic/tests/compaction-basic.spec.ts
            packages/compaction/compaction-basic/tests/compaction-loop-repro.spec.ts
            packages/compaction/compaction-tool-result-pruner/tests/tool-result-pruner.spec.ts
</pre>

### A.7 Approval and Cordis

<pre>
approval consumer/service
  packages/interaction/user-approval/src/types.ts
  packages/interaction/user-approval/src/index.ts
  packages/interaction/user-approval/src/invariant.ts
    -&gt; permission composition
       packages/interaction/permission-presets/src/index.ts
      -&gt; tests
         packages/interaction/user-approval/tests/approval.spec.ts
         packages/interaction/user-approval/tests/invariant.spec.ts

Cordis ownership mechanism
  vendor/cordis/src/fiber.ts
  vendor/cordis/src/events.ts
  vendor/cordis/src/reflect.ts
  vendor/cordis/src/registry.ts
  vendor/cordis/src/service.ts
</pre>

## Appendix B. Authority and evidence invariants applied

| Observed mechanism fact | What it supports | What it does not support |
|---|---|---|
| Durable Session header names parent | Lineage reconstruction | Current control authority |
| Exact live Agent owns handle | Process-local ownership | Durable authority after restart |
| Inbox accepted a message | Live ordering acceptance | Restart survival before durable ticket/log |
| Session event exists | DeepSeek durable fact | Ashley truth, Recall, or cognitive admission |
| Persistence flush resolves | Barrier participation/settlement | Independent effect observation |
| ACP committed text arrives | Candidate worker output | Semantic task completion |
| ACP cancellation succeeds | Control request result | Proof that no tool/effect happened |
| Schedule dispatch event exists | Schedule fold advanced | Model run, platform delivery, or human receipt |
| Engine step checkpoint exists | Engine recorded its step result | Ashley Effect Witness or authorization |
| Process tree exits | Process quiescence | Reversal or non-occurrence of external effects |
| Approval says allowed-once | Approval evidence | Delegated capability without Ashley policy |
| Compaction checkpoint replaces surface | Model projection changed | Forgetting or Recall deletion |
| Goal revision is complete | DeepSeek goal state | Ashley intention/commitment completion |

## Appendix C. Static verification record

This record covers documentation verification only. It is not runtime,
integration, Evaluation Plane, release, or capability qualification evidence.

| Check | Result |
|---|---|
| Upstream identity | Clean <code>master</code> checkout of <code>https://github.com/deepseek-ai/deepseek-harness.git</code> at <code>47f943859bef60e4160492346772ded9b24f765a</code> |
| Ashley identity | Isolated worktree <code>C:\Users\Xharv\Projects\composer-assistant-deepseek-salvage</code>, branch <code>codex/deepseek-harness-salvage-dossier</code>, base <code>7963d2d235b66f34f4dedfb47fa6bd1b0c1f5edf</code> |
| License source | Root <code>LICENSE</code> reads “MIT License” and “Copyright (c) 2026 DeepSeek”; package scan recorded separately in section 2.2 |
| DeepSeek path resolution | All 118 unique DeepSeek path expressions cited by the dossier resolve against the pinned checkout |
| Ashley links and source paths | Both relative Markdown links and all explicitly cited Ashley source paths resolve against the Ashley base |
| Required structure | All 19 requested numbered sections are present |
| Candidate matrix | 21 candidate rows; every row has all nine requested fields and exactly one of PORT, ADAPT, SPIKE, REFERENCE, REJECT, or DEFER |
| Architecture drift | The roadmap remains Sandbox Autonomy, MODEL-FABRIC-01, OPERATIONAL-CONTINUITY-01, PROCEDURAL-SKILL-GRADUATION, COMPUTER-USE-01, LEARNED-AUTONOMY-01, CONTEXT-BUDGET-01, then Experience / Cognitive Graduation and System-wide Hardening |
| Worktree scope | Git status contains only the untracked dossier path; no production, Sandbox, Model Fabric, or Evaluation source is modified |
| Whitespace | <code>git diff --check</code> exits 0 for tracked state; a supplemental no-index check of the untracked dossier reports no whitespace errors |
| Execution scope | No build, test suite, dependency install, provider call, deployment, activation, commit, or push was performed |

The supplemental no-index Git check exits 1 because it compares a new file to
<code>NUL</code>. Git also reports the configured LF-to-CRLF working-copy
normalization warning. Neither message is a whitespace-error diagnostic.
