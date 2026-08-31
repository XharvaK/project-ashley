# 88 — Cross-Wave Implementation Contract Matrix

## Dependency law

```text
SOURCE / ARCHITECTURE DEPENDENCY
A must exist before B can be implemented correctly.

EVIDENCE / ACCEPTANCE DEPENDENCY
B source work may exist independently, but B cannot be accepted at the named
lifecycle level until A supplies attributable evidence.
```

Release Truth is not a universal source predecessor. W1 is required to qualify W2, to link W3 physical evidence, and to production-accept W4–W8. It does not make every R1/R2/R4/R5 source edit intrinsically impossible.

## Wave matrix

| Wave | Source/architecture predecessors | Evidence/acceptance predecessors | Migration interaction | Shared tables/types/files | Conflicting ownership surface | Qualification dependency | Production-acceptance dependency |
|---|---|---|---|---|---|---|---|
| W0 Thought-Control Boundary | Phase 4 freeze only | None for source; W1/W2 later qualify it | Nuclear migration 43 extends `attention_requests`; sidecar payload/counters only | `thought/*`, `settlement/*`, `authority/*`, `attention/*`, `mistral-client.ts`, Model Fabric receipts | Model semantic output vs kernel identities/provenance/receipts | W2 exact current-route qualification after W1 | W1 exact active release plus W2 occupant evidence |
| W1 Release Truth/Qualification | W0 contract identifiers | W0 offline candidate | No SQLite; immutable Model Fabric artifact schema/version | `model-fabric/*`, adapters, `mistral-client.ts`, `env.ts` | Transport health vs qualification vs release truth vs production acceptance | Self-qualified through focused offline evidence | Runtime process/build/capability match plus governed production witness |
| W2 Current Route | W0 and W1 source | W0/W1 accepted qualification substrate; separate live-call authority | No DB migration; isolated temporary stores only | W0 runner/parser/binder; W1 ledger; NIM adapter/registry | Harness cannot replace routing/owner selection | Exact `nim/openai/gpt-oss-20b` conjunctive result | Later exact-release W0 invocation; W2 call alone is not deployment proof |
| W3 F011 Closure | No allocator redesign; measurement hooks may be independent | W1 for release-linked result; Stage A before Fuse; Stage A/Fuse before Stage H | No production migration | Incident C fixtures, allocator read surfaces, derived store, Stage H scripts | Evaluation may measure but not tune/rewrite allocator | Stage A, Fuse gate if needed, Stage H Mint resource/rebuild | Exact W1 release plus non-mutating boundedness/currentness witness |
| W4 R1/Derived Retraction | W0 for final publication binding | W1 for production acceptance; W3/R6 evidence only for later physical policy, not source | Nuclear 44 after W0 43; cognitive sidecar v2 | Authority, Settlement, idle, forget, derived/retrieval, startup | Semantic writer vs scheduler; canonical truth vs derived mechanism; cross-store barrier is coordination only | Focused migrations, races, crash gaps, redaction ineligibility | Exact W1 release; no destructive production probe |
| W5 R2 Wake Singularity | W4 exclusive publication for final consequence integration | W1 for production acceptance | Cognitive sidecar v3 after W4 v2 | triggers, inbox, cycles, wakes, preemption, effects, Settlement | Trigger producer/inbox/idle must converge; wake ledger does not choose meaning | Duplicate producers/workers, crash/lease/outcome tests | Exact release and natural one-wake/one-cycle/one-chain evidence |
| W6 R4 Retry Authority | W5 identity for wake-bound work; generic ledger policy may be built before final integration | W1 for production acceptance | Cognitive sidecar v4 after W5 v3 | inbox, wake, attempts, effects, receipts, adapters, scheduler | Ledger owns retry; receipts own ambiguity; SDK owns neither | Exact 5/15m, delays, fairness, quarantine, no hidden retries | Attributable exact-release attempt/backlog evidence without induced harm |
| W7 R5 Private Budget | W0 invocation identity; W5 admission identity used when available | W1 for production acceptance | Cognitive sidecar v5 after W6 v4 in conservative sequence | idle, private budget ledger, W5 wake, W0 invocation, Model Fabric receipts | Ledger owns capacity; receipt owns dispatch truth; model/caller owns neither | 12/hour, final-slot multiprocess, restart, clock, ambiguity | Exact-release natural reservation/receipt evidence |
| W8 R6 Measurement | None for read-only local measurement; W4 enriches redaction/currentness interpretation | W1 for production attribution; accepted W8 packet is W9 evidence predecessor | None; MUST NOT migrate | All schemas/stores, derived metadata, receipts, observability | Measurement may classify/report only; no retention/archive/deletion authority | Read-only reproducibility and zero-mutation proof | Separately authorized read-only snapshot; does not accept W9 |
| W9 R6 Source Metabolism | BLOCKED | Accepted W8 evidence plus owner architecture decision | UNKNOWN | UNKNOWN | Retention/archive/deletion authority undecided | NOT AUTHORIZED | NOT AUTHORIZED |

## Conservative source execution order

```text
W0
 -> W1
 -> W2 qualification checkpoint
 -> W3 qualification checkpoint
 -> W4
 -> W5
 -> W6
 -> W7
 -> W8 read-only measurement
 -> STOP
```

This is the Luna long-run order. It is intentionally more conservative than the minimum partial order. W2/W3 gate evidence before the riskier remediation waves. Failure at W2 does not authorize model replacement. Failure at W3 does not authorize allocator redesign. W8 does not authorize W9.

## Migration order and compatibility

| Order | Owner | Planned version | Activation rule | Rollback/recovery rule |
|---|---|---|---|---|
| 1 | Nuclear DB | 43 | W0 provenance columns/indexes exist before W0 activation | Backup/restore; old source MUST reject newer schema |
| 2 | Nuclear DB | 44 | W4 barrier/journal begins `reconciling`, reaches `stable` only after owner/vector classification | Never assert stable after partial migration; reconcile canonical owners |
| 3 | Cognitive sidecar | v2 | W4 projection/vector state begins `reconciling` | v1 source refuses v2 write-open |
| 4 | Cognitive sidecar | v3 | W5 pending legacy trigger/inbox/cycle rows are converted once or quarantined before singularity activation | Never duplicate into legacy and wake paths |
| 5 | Cognitive sidecar | v4 | W6 legacy attempts are conserved or quarantined; no fresh budget | Attempt/age history never reset |
| 6 | Cognitive sidecar | v5 | W7 private admissions remain blocked until legacy usage/epoch is conservative | Restart/rollback cannot refill allowance |

Luna MUST inspect live source version numbers before implementation. A version collision is a stop condition, not permission to renumber without reconciling all plans, fixtures, and predecessor rules.

## Shared ownership boundaries

| Surface | Semantic/authoritative owner | Mechanical owner | Prohibited takeover |
|---|---|---|---|
| Thought branch and content | Thought model | W0 parser/Kernel Envelope binds identity | Kernel inferring branch; model authoring IDs/runtime truth |
| Invocation provenance | Durable Attention/Model Fabric lifecycle linked to Thought | W0 capture/persist/bind/fence | Reconstructing from current state; second competing authority |
| Qualification/release | Immutable W1 evidence and runtime comparison | Model Fabric artifacts/health derivation | Route readiness or `ASHLEY_RELEASE_ID` assertion promoting state |
| Semantic publication | Thought proposal + Authority acceptance + Settlement | W4 barrier/transaction | Idle/scheduler/direct SQL writer |
| Derived retrieval | Canonical store owns eligibility | Derived store provides rebuildable FTS | Physical row becoming current authority |
| Wake | Durable W5 wake ledger | Scheduler/consumer claims | Producer or retry minting a second wake/cycle |
| Retry | Durable W6 work ledger | Worker/provider executes one admitted attempt | SDK/provider hidden retry policy |
| External outcome | Receipt reconciliation | W6 moves work only after proof | Lease expiry implying replay safety |
| Private capacity | W7 reservation ledger | Scheduler requests reservation | In-memory counter, caller, or model declaring remaining budget |
| Metabolism | Future owner-approved W9 architecture | W8 measures only | W8 query/report deleting, archiving, compacting, or retaining by policy |

## File collision matrix

| File/surface | Waves | Required coordination |
|---|---|---|
| `core/db.ts`, `cognition/schema-contract.ts` | W0, W4 | Land 43 then 44; migration tests and observed baseline updated once per migration |
| `cognitive-v021/sidecar/schema.ts`, `sidecar/db.ts` | W4–W7 | One cumulative v1→v5 series; each wave owns one version and upgrade test |
| `cognitive-v021/types.ts` | W0, W5–W7 | Additive contracts; no duplicate identity/state aliases |
| `thought/run.ts` | W0, W2, W7 | W0 owns runtime semantics; W2 uses a seam; W7 binds reservation without forking Thought |
| `mistral-client.ts` | W0, W1, W2, W6, W7 | One invocation/attempt receipt lifecycle; W1 captures runtime capability and actual-wire evidence through the `completeChat()` invocation path; add evidence/hooks once, never parallel wrappers |
| `authority/packs.ts`, `settlement/publish.ts` | W0, W4, W5 | W0 shape then W4 vector fence then W5 wake consequence uniqueness |
| `initiative/idle.ts` | W4, W5, W7 | Remove semantic writer, route wake admission, replace in-memory budget in that order |
| `cycle/inbox*.ts`, recovery | W5, W6 | Wake identity first; retry policy second |
| `retrieval/derived-store.ts` | W3, W4, W8 | W3 qualifies existing behavior; W4 adds semantic invalidation; W8 only measures |

## Gate matrix

| Gate | Stops source continuation? | Repair loop allowed | Requires owner action |
|---|---|---|---|
| Contract/source contradiction | Yes | No architecture reinterpretation | Yes |
| Focused unit/integration/failure gate fails | Yes | Smallest in-contract repair, rerun affected gate | No unless architecture changes |
| Migration/crash/concurrency gate fails | Yes | In-contract source repair | No unless ownership changes |
| W2 current route NOT_QUALIFIED | Yes at selection boundary | Harness defect only; no tolerant parser/model swap | Owner-approved expansion selection |
| W3 Stage A/Fuse/Stage H gate fails | Yes for F011 acceptance | Evidence/harness defect only; no allocator redesign | Owner decision if architecture/package selection changes |
| Physical/production authorization absent | Stops that evidence stage, not completed source | None | Yes |
| W8 evidence incomplete | Stops W9 | New read-only capture if separately authorized | Yes for physical/production and later W9 |

## Cross-wave completion condition

Phase 5 reference planning is coherent only if every implementing agent can determine, without inventing architecture:

- which owner decides each field/state;
- which transaction and identity closes each race;
- which failure class permits retry, reconciliation, or termination;
- which migration precedes another;
- which test establishes source behavior;
- which exact-candidate evidence establishes qualification;
- which production observation remains separately required.

This matrix does not authorize implementation, provider calls, physical qualification, activation, deployment, production mutation, or W9.
