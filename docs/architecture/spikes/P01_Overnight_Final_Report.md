# ASHLEY P-01 OVERNIGHT FOUNDATION PROOF

PARTIAL

## BASELINE

starting HEAD: `0c83649c94d9cdffda5c1b2b2d034a1b42a9e767`

origin/master: `0c83649c94d9cdffda5c1b2b2d034a1b42a9e767`

source ancestor: `0efb0250989e2b67a9b0b3d7e8fce81568ae0975`

starting worktree: CLEAN

The starting subject was exactly
`docs(architecture): accept foundation salvage decisions`; the source ancestor
was an ancestor of HEAD, and its diff to HEAD contained architecture
documentation only.

## P-01A

status: PASS

ten scenarios:

1. Duplicate enqueue: PASS; one globally unique Ashley `source_key` job.
2. Claim/process death/restart: PASS; running job recovered to pending.
3. Failure before callback result: PASS; no semantic outcome.
4. Callback result then pre-transaction death: PASS; no semantic outcome.
5. Failure inside materialization: PASS; complete transaction rollback.
6. Ashley commit then unobserved return/restart: PASS; exactly-once outcome.
7. Bounded retry: PASS; 30/60/120/240/480-second backoffs, terminal at five.
8. Contract/model epoch mismatch: PASS; influence fails closed.
9. Observe/shadow time-shift: PASS; shadow never becomes live influence.
10. Exact provenance: PASS; owner/entity/thread/messages/contract/epoch retained.

current guarantees:

- exact duplicate `source_key` deduplication;
- atomic claim and attempt accounting;
- callback outside the semantic transaction;
- atomic episode/fact/Mind State/affect/revision/run/job completion;
- committed semantic effects do not replay;
- visible bounded retry and terminal state;
- fail-closed contract/epoch checks and write-time shadow provenance;
- Ashley IDs remain distinct from technical run identity.

current limitations:

- startup blindly resets every running job; there is no lease or claim token;
- callback/model work can repeat after a crash;
- callback completion has no persisted step checkpoint;
- pre-transaction process loss is visible only after startup recovery;
- global `source_key` namespacing remains a caller responsibility.

validated defect candidates: NONE. No authority, provenance,
non-interference, or atomicity defect was validated.

tests: focused P-01A 10/10 PASS; agent-service suite PASS; root suite PASS;
`phase0:offline` PASS.

artifact:
`docs/architecture/spikes/P01A_Current_Cognition_Characterization.md`

## GATE A

PASS

reason: all ten deterministic scenarios, the focused harness, agent build,
agent-service suite, root suite, and `phase0:offline` passed with no production
data, provider, network, schema, authority, provenance, or non-interference
failure.

## P-01B

executed: YES, PARTIAL

### Mastra

packages/version: `@mastra/core@1.57.0`, `@mastra/libsql@1.19.0`,
`zod@4.4.3`; exact integrities are pinned in the isolated lockfile.

parity: PASS, 10/10 real-package scenarios.

recovery: PASS; a real child process resumed a persisted suspended snapshot
before callback execution.

replay: PASS; Ashley outcome reconciliation prevented repeated semantic
materialization after candidate completion failure.

host cost: 252 transitive package entries, 118,557,618 installed bytes, one
additional local LibSQL store, median 721 ms startup and 225,619,968-byte
maximum ready-boundary RSS across five local observations.

adapter/proof cost: 187 adapter LOC and 532 proof/test LOC.

retirement target: 0 Ashley LOC proven retireable; only part of the current
456-line orchestration ceiling could be considered later, and Ashley semantic
materializers remain Ashley-owned.

verdict: PASS candidate. This is not a selection or integration authorization.

### LangGraph

packages/version: `@langchain/core@1.2.5`,
`@langchain/langgraph@1.4.9`,
`@langchain/langgraph-checkpoint-sqlite@1.0.3`, `zod@4.4.3`; exact
integrities are pinned in the isolated lockfile.

parity: NOT EXECUTED.

recovery: NOT EXECUTED.

replay: NOT EXECUTED.

host cost: the pre-stop install contained 60 transitive package entries and
59,331,030 bytes. Usable startup/RSS could not be measured.

adapter/proof cost: 0/0 LOC; the candidate was stopped before implementation,
with a documentation-only stop record retained.

retirement target: 0 Ashley LOC proven retireable.

verdict: STOP / FAIL for this run. With required lifecycle scripts disabled,
the real SQLite saver could not locate the `better-sqlite3@12.11.1` native
binding. That package declares `prebuild-install || node-gyp rebuild --release`.
No lifecycle script was executed and no substitute/fake implementation was
used. LangGraph persistence semantics therefore remain unmeasured.

artifact:
`docs/architecture/spikes/P01B_Workflow_Parity_Report.md`

## GATE B

FAIL

reason: the P-01A contract was unchanged and the Mastra suite completed, but
the LangGraph suite did not complete. Gate B explicitly requires both suites.
All other checked isolation conditions passed: root manifests unchanged, no
production imports/schema/Recall/sandbox work, disposable stores removed,
candidate `node_modules` removed, and root Ashley verification remained
passing from Gate A.

## P-01C

decision: NOT EXECUTED; Gate B failed.

reason: P-01C is forbidden unless every Gate B condition passes.

confidence: HIGH; the missing LangGraph suite is a direct hard-gate failure.

artifact: NOT CREATED. Specifically,
`docs/architecture/spikes/P01_Foundation_Selection_Evidence.md` does not exist.

## ROOT VERIFICATION

build: PASS - `npm run build:agent` (5.5 s)

focused tests: PASS - P-01A, 10/10 (3.11 s); Mastra, 10/10 (4.65 s)

full tests: PASS - agent-service suite (178.4 s) and root `npm test` (179.1 s)

phase0 offline: PASS - `npm run phase0:offline` (183.7 s)

final git/worktree verification:

- HEAD and `origin/master` remain the starting SHA;
- no tracked file differs from HEAD;
- all work is confined to the P-01A test, spike code, lockfiles, and evidence;
- root `package.json` and `package-lock.json` differ from HEAD by zero bytes;
- no production candidate import was found;
- both candidate `node_modules` directories are absent;
- no P-01 candidate temporary store remains;
- no repository test/build/install process remains;
- `git diff --check` passed;
- all untracked artifacts passed a trailing-whitespace check;
- both package manifests/lockfiles parse as JSON;
- all retained Mastra `.mjs` files pass `node --check`.

The full root suites were run at Gate A. P-01B changed no shared production
source or shared test helper, so they were not repeated after isolated spike
work.

## RECALL QUALIFICATION

production evidence writes: 0

evaluation writes: 0

promotion: 0

cutover: 0

rollback: 0

masterMode changes: 0

## SANDBOX

UNTOUCHED

## PRODUCTION

UNTOUCHED

## ROOT DEPENDENCIES

UNCHANGED

## COMMIT/PUSH

NONE

## NEXT GATE

Separately authorize a new isolated LangGraph P-01B run that permits the pinned
`better-sqlite3` install lifecycle, then execute the full unchanged parity suite
and re-evaluate Gate B. P-01C remains forbidden until Gate B passes.

## FINAL

P-01: INCOMPLETE

PRODUCTION FOUNDATION: UNCHANGED

PRODUCTION INTEGRATION: NOT STARTED

LOCAL WORKSTATION SHUTDOWN: NOT INITIATED

REASON: P-01 is PARTIAL and Gate B failed because the LangGraph suite could not
run under the required lifecycle-script policy.

---

## LANGGRAPH CONTINUATION - 2026-08-09

This section preserves the first overnight run's PARTIAL result above and
records the separately authorized continuation that resolved it.

native lifecycle authorization:

- Scope was limited to pinned `better-sqlite3@12.11.1` inside
  `spikes/p01b/langgraph/`.
- `npm ci --ignore-scripts --audit=false --fund=false` installed the retained
  lockfile with all lifecycle scripts disabled.
- The missing native binding was reproduced exactly.
- `npm rebuild better-sqlite3` ran the package's documented
  `prebuild-install || node-gyp rebuild --release` lifecycle and succeeded.
- No other package lifecycle, global install, remote `npx`, credential,
  elevation, machine configuration, or system-package installation occurred.
- The lockfile and pinned versions remained unchanged.
- Real `SqliteSaver` initialization then passed.

LangGraph result:

- Candidate verdict: PASS.
- Pinned real package APIs: `StateGraph` plus the SQLite `SqliteSaver`.
- Test result: 12/12 PASS in 4.20 seconds.
- All 15 P-01A acceptance clauses are covered.
- A real first child persisted an interrupt before callback; a second child
  resumed it and completed exactly once.
- Direct old-checkpoint replay repeated callback work but left the Ashley
  semantic commit count at one.
- Candidate checkpoint advancement plus Ashley rollback produced no semantic
  outcome.
- Ashley commit plus candidate completion failure preserved completed Ashley
  job/run/outcome state and did not rerun semantic materialization on recovery.
- Deleted/unavailable checkpoint state neither created nor changed an Ashley
  assertion.
- No authority, provenance, non-interference, or atomicity defect was validated.

LangGraph metrics:

- dependency entries: 60;
- installed footprint after native rebuild: 61,250,518 bytes / 5,495 files;
- startup median: 589 ms across five fresh observations (584-593 ms);
- maximum sampled ready-boundary RSS: 153,743,360 bytes;
- adapter source: 155 physical LOC;
- proof/test source: 358 physical LOC, reusing the shared 257-line synthetic
  Ashley authority fixture without double-counting;
- successful checkpoint store sample: 20,480 bytes;
- proven production Ashley LOC retirement: 0.

Gate B: PASS.

Reason: P-01A remains PASS, Mastra remains a real-package PASS candidate,
LangGraph is now a real-package PASS candidate, the P-01A contract is unchanged,
root manifests and production source are unchanged, no production import/schema/
Recall/sandbox work occurred, all candidate dependency trees and generated
stores were removed, and the required continuation verification passed.

P-01C: EXECUTED.

Decision: **KEEP CURRENT**.

Reason: both frameworks improve technical restart precision, but neither proves
any production Ashley LOC retireable or a maintenance reduction. Both add a
second store, adapter/proof code, package upgrade duties, and host operations.
LangGraph is lighter than Mastra but also adds a native binary/ABI lifecycle.
Under the accepted default-winner rule, finer checkpointing without lower net
complexity is not a foundation win.

Confidence: HIGH for the pinned local evidence and accepted selection criteria.

P-01C artifact:
`docs/architecture/spikes/P01_Foundation_Selection_Evidence.md`

continuation root verification:

- focused LangGraph: PASS, 12/12;
- focused P-01A: PASS, 10/10 (3.79 seconds);
- `npm run build:agent`: PASS (5.9 seconds);
- `npm run phase0:offline`: PASS (194.7 seconds);
- full root suite: not repeated because the continuation changed no shared
  root production source or test helper, as required by the continuation brief;
- root `package.json` and `package-lock.json`: UNCHANGED;
- production schema/migrations, routing, sandbox, Recall, and production:
  UNTOUCHED;
- candidate `node_modules`: REMOVED;
- generated candidate stores: REMOVED;
- relevant install/build/test processes: NONE after verification;
- commit/push: NONE.

## CONTINUATION FINAL

FINAL P-01 STATUS: COMPLETE

PRODUCTION FOUNDATION: UNCHANGED

PRODUCTION INTEGRATION: NOT STARTED

RECALL: UNTOUCHED

SANDBOX: UNTOUCHED

ROOT DEPENDENCIES: UNCHANGED

COMMIT/PUSH: NONE

NEXT GATE: close the S14 foundation investigation and retain the current loop;
optionally propose one specific recovery limitation as a separately authorized
bounded hardening task.

## SHUTDOWN

LOCAL WORKSTATION SHUTDOWN: INITIATED

Reason: the continuation made P-01 fully COMPLETE; LangGraph, Gate B, P-01C,
artifact, verification, cleanup, process, dependency, production, Recall, and
sandbox conditions all passed with no blocked or unknown state.

Execution-environment evidence: active `Xharv` console session on Windows 11
Pro, physical MSI MPG Z390 motherboard/AMI BIOS, workstation product type, no
SSH/CI/container/WSL environment, and no remote session. Host Hyper-V/VBS is
present, but the hardware and console evidence identifies this session as the
user's local Windows workstation rather than a guest or remote runner.

The normal native shutdown command is the next and final tool action after this
report is verified and flushed.
