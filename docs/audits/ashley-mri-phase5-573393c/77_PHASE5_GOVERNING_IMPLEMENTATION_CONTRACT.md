# 77 — Phase 5 Governing Implementation Contract

## Status

```text
REFERENCE_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
MODE=READ_ONLY_SOURCE_INSPECTION_AND_DOCUMENTATION_AUTHORING
PRODUCT_IMPLEMENTATION_AUTHORITY=NONE
PHASE4_ARCHITECTURE_REOPENED=no
```

## Authority

`docs/audits/ashley-mri-phase4-573393c/55_PHASE4_GOVERNING_CONTRACT.md` through `75_PHASE4_FINAL_SYNTHESIS.md` own architecture. Phase 5 compiles mechanical consequences. It MUST NOT choose a different design.

If exact source conflicts with Phase 4, stop the affected wave and record:

```text
PHASE5_ARCHITECTURE_BLOCKER=<exact contradiction>
```

## Global implementation invariants

```text
G1=Thought is the sole semantic author.
G2=Settlement is the sole semantic publication boundary.
G3=Kernel Envelope attaches mechanics and never invents semantic content.
G4=Thought explicitly selects settlement, observation_intent, effect_intent, or abstain.
G5=Kernel never infers a semantic branch from prose, absence, or field shape.
G6=Actual invocation provenance is captured by value before or atomically with dispatch.
G7=Current route, cycle, generation, or Authority state never reconstructs historical provenance.
G8=Publication performs a second currentness fence inside the authoritative transaction.
G9=Every provider attempt receives a fresh invocation identity.
G10=Allocation identity and actual invocation identity remain linked and distinct.
G11=Model-created durable identity is forbidden.
G12=Thought-selected existing references must come from the captured allowlist.
G13=Output-local aliases are pass/output-scoped, unique, ephemeral, and atomically resolved.
G14=Strict semantic parsing is mandatory; coercive or tolerant semantic repair is prohibited.
G15=Structural correction preserves semantic projection/cycle/generation/pass and receives a fresh invocation identity.
G16=Authority revision creates a new semantic pass; correction does not.
G17=revisionCount and objection presentation history are kernel facts; objection resolution is Authority truth.
G18=Semantic abstain never represents provider, parser, deadline, cancellation, revision, or pass failure.
G19=Thought owns observation/effect intent; kernel owns durable operation mechanics.
G20=Effect completion comes only from receipt/reconciliation.
G21=Authoritative redaction immediately removes semantic eligibility from superseded lexical material.
G22=Physical stale derived rows may remain pending reconciliation but never return as current evidence.
G23=Derived failure does not roll back a valid canonical source mutation.
G24=Transport readiness, Thought-contract qualification, Release Truth, and production acceptance are distinct states.
G25=Qualification evidence is immutable and bound to exact executable capability identity.
G26=Logical structured-output intent and actual wire enforcement are separate evidence.
G27=Primary and fallback occupants require independent qualification.
G28=One durable wake identity authorizes at most one cycle and one consequence chain.
G29=Retry resumes durable identity; it does not mint semantic authority.
G30=Outcome-unknown external effects are never blindly replayed.
G31=Durable retry is typed, bounded, fair, and reconcilable.
G32=Private Thought budget authority is durable, atomic, process-safe, restart-safe, and clock-rollback-safe.
G33=Hot-path resource work must not grow with unbounded lifetime history.
G34=Legacy semantic writers remain inert under fallback, restart, migration, and configuration drift.
G35=R6 Phase 5 work is read-only measurement and preservation only.
G36=W9 retention, archive, compaction, and deletion source work is prohibited.
G37=Tests never promote a capability.
G38=Release Truth is an acceptance predecessor; it is not a false universal source predecessor.
G39=JSON syntax, closed-schema conformance, strict parse, and semantic validity are separate evidence dimensions.
G40=Qualification must prove logical request, emitted wire binding, and empirical enforcement separately; unavailable provider declarations remain unavailable, never inferred.
G41=Every retry-governed adapter proves hidden retries disabled or one Ashley attempt maps to at most one physical dispatch.
```

## Frozen resource policy

```text
ORDINARY_THOUGHT_BUDGET_MS=30000
INTERACTIVE_THOUGHT_MAX_OUTPUT=4096
DURABLE_PROACTIVE_THOUGHT_MAX_OUTPUT=4096
STRUCTURAL_RETRY_MAX_OUTPUT=2048
STRUCTURAL_RETRIES_MAX=2_PER_SEMANTIC_PASS
```

The deadline is one absolute whole-Thought wall clock across allocation, primary invocation, structural correction, operation interaction, and Authority revision. No substage may reset or extend it.

## Wave set and authority

| Wave | Phase 5 authority | Prohibited extension |
|---|---|---|
| W0 | Mechanical source plan | Provider requalification or activation |
| W1 | Mechanical source/evidence substrate plan | Online health probe as readiness authority |
| W2 | Qualification plan | Silent model substitution |
| W3 | Qualification closure plan | Context allocator redesign or pre-evidence fuse choice |
| W4 | Mechanical source plan | New semantic writer or synchronous-derived authority |
| W5 | Mechanical source plan | Second wake/cycle path |
| W6 | Mechanical source plan | Hidden provider/SDK retry authority |
| W7 | Mechanical source plan | In-memory or optimistic budget release authority |
| W8 | Read-only measurement plan | Retention/archive/compaction/deletion implementation |
| W9 | BLOCKED | Any plan or implementation instruction |

## Source-inspection law

- Verify exact files, functions, types, tables, migrations, config keys, tests, and commands from `573393c`.
- Use current line numbers only as inspection evidence. Mechanical plans identify symbols because line numbers drift during implementation.
- Mark a source location `VERIFY_AT_EXECUTION` if generated or runtime-dependent.
- Never infer deployed state from worktree source.
- Do not write product, tests, configuration, schema, fixtures, runtime state, or evidence packets during Phase 5.

## Test-first execution law for Luna

Every source wave later follows:

```text
write focused behavioral failure
-> prove RED
-> implement smallest compliant production change
-> prove focused GREEN
-> run affected integration/concurrency/restart/crash gates
-> run settlement build/typecheck where required
-> freeze candidate only after review
```

Full-corpus testing occurs only at candidate freeze under `docs/Wave_Acceptance_Protocol.md`. Physical Linux/Mint claims require physical qualification. Production claims require exact-candidate production evidence.

## Existing-work safety

Luna MUST inspect `git status --short`, `git diff`, and exact HEAD before each wave. It MUST preserve owner work, stage only named paths when later authorized, and MUST NOT reset, clean, discard, overwrite, commit, push, deploy, activate, or promote without explicit authority.

## Evidence classes

| Class | Proves | Does not prove |
|---|---|---|
| Source/unit/integration | Candidate source behavior | Deployment or production acceptance |
| Build/typecheck | Candidate settlement coherence | Physical runtime behavior |
| Qualification | Exact capability under bound inputs | Different occupant/binding/release |
| Release Truth | Active release contains qualified capability | Behavioral acceptance |
| Physical qualification | Host-dependent claim | Production acceptance unless contract says so |
| Production witness | Exact observed active behavior | Broader claims outside the witness |

## Stop conditions

Luna MUST stop if:

- a required owner, identity, transaction, terminal, retry, or migration rule is absent;
- exact source contradicts Phase 4;
- required predecessor evidence is missing;
- a planned migration cannot preserve existing user data;
- an external effect may be outcome-unknown;
- a test would require production mutation or provider cost not explicitly authorized;
- implementation would touch W9 or maturation scope;
- the working tree cannot be isolated without discarding owner work.

## Blocker return schema

```text
IMPLEMENTATION_BLOCKED=<exact contradiction or missing predecessor>
WAVE_ID=<W0-W8>
REFERENCE_SHA=<observed SHA>
SOURCE_EVIDENCE=<file:symbol or evidence packet>
PHASE4_CONTRACT=<artifact:section>
SAFE_WORK_COMPLETED=<none or exact completed steps>
NEXT_OWNER_DECISION=<exact decision, or NONE>
PRODUCT_MUTATION_AFTER_BLOCKER=0
```
