# P-01 Foundation Selection Evidence

**Decision date:** 2026-08-09

## DECISION

**KEEP CURRENT**

Current Ashley remains the production foundation. Neither comparator earned a
future production integration proposal. This decision authorizes no production
change.

## CURRENT evidence

- Semantic/failure contract: PASS, 10/10 characterization scenarios.
- Committed Ashley semantic materialization remains exactly once.
- One authoritative SQLite store and no derived workflow store.
- Zero incremental workflow dependencies and zero adapter code.
- Sampled ready-boundary RSS: maximum 111,939,584 bytes.
- Recovery: startup blindly returns all `running` work to `pending`; there is no
  lease/claim token or persisted callback-result checkpoint.
- Callback/model work may repeat after crash, but committed semantic effects do
  not replay.

## MASTRA evidence

- Real pinned packages: `@mastra/core@1.57.0`, `@mastra/libsql@1.19.0`,
  `zod@4.4.3`.
- Semantic/failure contract: PASS, 10/10 candidate tests.
- Real persisted suspended-snapshot restart: PASS.
- Semantic replay safety with Ashley reconciliation: PASS.
- Dependency cost: 252 transitive entries and 118,557,618 installed bytes.
- Sampled ready-boundary RSS: maximum 225,619,968 bytes.
- Code burden: 187 adapter LOC and 532 proof/test LOC.
- Store burden: a second local LibSQL technical store.
- Proven production Ashley LOC retirement: 0.

## LANGGRAPH evidence

- Real pinned packages: `@langchain/core@1.2.5`,
  `@langchain/langgraph@1.4.9`,
  `@langchain/langgraph-checkpoint-sqlite@1.0.3`, `zod@4.4.3`, and transitive
  `better-sqlite3@12.11.1`.
- The original run correctly stopped with lifecycle scripts disabled. Under the
  later narrow authorization, `npm rebuild better-sqlite3` succeeded and the
  real `SqliteSaver` setup probe passed without lockfile changes.
- Semantic/failure contract: PASS, all 15 clauses covered by 12 candidate tests.
- Real child-process checkpoint restart: PASS.
- Explicit old-checkpoint replay repeated callback work once while the Ashley
  semantic commit count stayed exactly one.
- Dependency cost: 60 transitive entries and 61,250,518 installed bytes after
  native rebuild.
- Sampled ready-boundary RSS: maximum 153,743,360 bytes.
- Code burden: 155 adapter LOC and 358 proof/test LOC, reusing the shared
  257-line synthetic Ashley authority fixture without double-counting it.
- Store burden: a second local SQLite checkpoint store plus native binary/ABI
  lifecycle.
- Proven production Ashley LOC retirement: 0.

## Recovery comparison

CURRENT has the coarsest recovery: restart resets every running job and may
repeat callback work. Mastra resumes a suspended persisted snapshot. LangGraph
resumes a persisted node checkpoint and can retain a completed callback result
across later materializer attempts.

Both comparators demonstrate a genuine recovery improvement at the technical
workflow layer. LangGraph also proves the architecture document's warning that
explicit replay can re-execute callback/model work. Ashley-side outcome
reconciliation prevents that replay from repeating a committed semantic
materializer.

## Failure comparison

All three preserve the decisive semantic invariant: an Ashley transaction
failure produces no semantic outcome, and an Ashley commit remains
authoritative if the caller or technical workflow fails afterward.

CURRENT achieves this with one SQLite transaction and coarse job recovery.
Mastra and LangGraph require explicit adapter-side reconciliation across two
stores. LangGraph's direct replay evidence is stronger than a documentation
claim, but it does not remove Ashley's idempotency or transaction burden.

## Host/dependency comparison

| Metric | CURRENT | MASTRA | LANGGRAPH |
|---|---:|---:|---:|
| Workflow dependency entries | 0 | 252 | 60 |
| Installed workflow footprint | 0 | 118,557,618 B | 61,250,518 B |
| Maximum sampled ready-boundary RSS | 111,939,584 B | 225,619,968 B | 153,743,360 B |
| Extra technical store | none | LibSQL | SQLite checkpoint DB |
| Native package lifecycle | none incremental | none observed | `better-sqlite3` required |
| External service/control plane | none | none | none |

LangGraph is materially lighter than Mastra in this spike, but both cost more
than CURRENT on the known modest Mint host. The Windows native rebuild does not
qualify a Mint binary or production installation path.

## Adapter/proof burden

| Candidate | Adapter LOC | Proof/test LOC | Shared fixture LOC |
|---|---:|---:|---:|
| MASTRA | 187 | 532 | 257 included in its proof figure |
| LANGGRAPH | 155 | 358 | 257 reused, not double-counted |

These are physical line counts, not maintenance forecasts. Both adapters must
continue to own ID mapping, failure reconciliation, store lifecycle, package
upgrade proof, and restart/replay tests.

## Exact proven retirement opportunity

**MASTRA: 0 production Ashley LOC proven retireable.**

**LANGGRAPH: 0 production Ashley LOC proven retireable.**

The current 456-line cognition orchestration ceiling includes Ashley semantic
materialization that no framework may own. No integration diff exists, so
claiming any exact retirement within that ceiling would be speculation.

## Operational complexity

CURRENT needs the existing Node process and authoritative SQLite only. Mastra
adds framework/LibSQL compatibility and a second store. LangGraph adds graph and
checkpoint compatibility, a second store, and a native `better-sqlite3`
binary/Node-ABI lifecycle. Backup, migration, corruption, restart, cleanup, and
upgrade handling for either candidate remain new production obligations.

## Semantic risk

Neither comparator showed an authority, provenance, non-interference, or
atomicity regression in the isolated fixture. Their remaining risk is
structural: technical completion can be mistaken for Ashley completion, and
replay can repeat callback/model work. The adapters successfully guard those
risks, but the guards are additional code rather than retired Ashley semantics.

## WINNER

**CURRENT ASHLEY**

## Reason

The accepted default-winner rule requires semantic parity plus a material net
reliability or maintenance gain, acceptable host/dependency cost, a concrete
retirement target, and lower net complexity. Mastra and LangGraph pass semantic
parity and improve technical restart precision. Neither proves any Ashley code
retirement or maintenance reduction, and both add a second store, adapter/proof
surface, package upgrades, and host operations. Therefore neither clears the
net-complexity threshold. A finer checkpoint alone is not a foundation win.

## Confidence

**HIGH** for KEEP CURRENT under the accepted criteria. The package behavior,
failure paths, restart, replay, resource samples, and code burden were measured
locally with pinned packages. Confidence does not extend to future package
versions or production Mint integration, neither of which was tested.

## Rejected alternatives

### MASTRA - ACCEPT FOR FUTURE PRODUCTION INTEGRATION PROPOSAL

Rejected because its recovery improvement comes with the largest dependency,
memory, proof, and second-store burden, with zero proven Ashley retirement.

### LANGGRAPH - ACCEPT FOR FUTURE PRODUCTION INTEGRATION PROPOSAL

Rejected despite better cost than Mastra and stronger explicit replay evidence.
It still adds native-package and checkpoint-store operations, retains Ashley's
idempotency/materialization duties, and proves zero production retirement.

## Current limitations worth separate hardening

The following remain valid candidates for separately authorized, bounded work:

- lease/token ownership rather than blind running-job reset;
- persisted callback-result checkpointing without a general workflow framework;
- more precise restart recovery and worker ownership observability.

This record does not implement or prioritize those changes.

## NEXT GATE

Close the S14 foundation investigation and retain the current cognition loop.
Any specific recovery weakness may be proposed as its own separately authorized
hardening task. Do not design or integrate a workflow framework under P-01.
