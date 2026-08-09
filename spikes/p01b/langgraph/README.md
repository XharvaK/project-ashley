# P-01B LangGraph candidate stop record

This isolated candidate was pinned and installed with lifecycle scripts disabled,
as required by P-01B. The real SQLite checkpointer could not initialize because
its `better-sqlite3` native binding was absent.

Install command:

```text
npm install --ignore-scripts --audit=false --fund=false
```

Initialization probe:

```js
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const saver = SqliteSaver.fromConnString(":memory:");
await saver.setup();
```

Observed result on Node `v24.14.1`, Windows x64:

```text
Could not locate the bindings file.
...
node_modules/better-sqlite3/lib/binding/node-v137-win32-x64/better_sqlite3.node
```

The installed `better-sqlite3@12.11.1` package declares this install script:

```text
prebuild-install || node-gyp rebuild --release
```

P-01B explicitly says to stop a candidate that cannot run without lifecycle
scripts. No lifecycle script was executed, no alternate checkpointer was
substituted, and no adapter or parity suite was fabricated. The candidate
verdict is therefore `STOP / FAIL` for this run.

## Authorized continuation - 2026-08-09

The continuation explicitly authorized only the pinned
`better-sqlite3@12.11.1` lifecycle inside this isolated workspace.

Commands:

```text
npm ci --ignore-scripts --audit=false --fund=false
npm rebuild better-sqlite3
```

The rebuild succeeded without changing the lockfile. The resulting native
binding loaded from `better-sqlite3/build/Release/better_sqlite3.node`, and the
real `SqliteSaver.fromConnString(":memory:")` plus `setup()` probe passed.

The retained continuation harness uses real `StateGraph` and `SqliteSaver`
APIs, a sibling shared synthetic Ashley authority fixture, fixed callback data,
and disposable databases. It makes no provider, Discord, sandbox, production,
or external-service call.

Continuation test result:

```text
npm test
12 tests, 12 passed, 0 failed
```

The suite covers the unchanged fifteen-clause P-01A acceptance contract,
including a genuine child-process restart, direct checkpoint replay, both
asymmetric store/semantic failures, unavailable/deleted candidate state, and
exact provenance. The continuation candidate verdict is `PASS`; the original
stop remains recorded above as historical context.
