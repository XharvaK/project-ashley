# Phase 5 W8 Measurement Evidence

```text
WAVE_ID=W8
STATE=COMPLETE_FOR_OFFLINE_VERIFICATION
CANDIDATE_HEAD=573393c3fdb2392a45137d4625635658eb4b5d88
CHECKOUT_STATE=detached HEAD
HOST_CLASS=passive_local
PRODUCTION_OBSERVED=false
SOURCE_MUTATION_AUTHORIZED=no
DATABASE_MUTATION_AUTHORIZED=no
W9_STATUS=BLOCKED_NOT_AUTHORIZED
```

## Measurement command and identity

The measurement helper was syntax-checked and then run from the authorized
worktree:

```powershell
node --check work/phase5-w8-readonly-measurement.mjs
node work/phase5-w8-readonly-measurement.mjs
```

Result: `measurementState=complete`.

```text
snapshotId=sha256:0a06260626cea41cdb7d3af0d72f510a44d583404086ff1267838dee2093f797
output=work/phase5-w8-readonly-20260831/0a06260626cea41cdb7d3af0d72f510a44d583404086ff1267838dee2093f797.json
auxiliaryDbCount=35
outputSha256=DE90EA0C1F70AC5E96190844585DB5DFB86BB5AAB7F4CB3DB1A81AD0DFE286A6
```

Earlier invalid W8 measurement outputs remain preserved for audit history; they
were not deleted or overwritten. The snapshot above is the final valid capture.

The snapshot manifest includes the candidate identity, normalized store paths,
host and process identity, capture boundaries, file metadata and hashes,
SQLite versions, schema/user versions, data versions, query-bundle identity,
canonical SQL hashes, inclusion/exclusion rules, and concurrency notes.
The evidence contains no raw messages, statements, payloads, claims, or
credentials.

## Known-store results

| Store | Result | Inventory | Aggregate rows / allocated bytes | Integrity |
|---|---|---:|---:|---|
| `nuclear.db` | present | 77 tables | 889 / 548,864 | `ok` |
| `continuity.db` | present | 10 tables | 120 / 61,440 | `ok` |
| cognitive sidecar | missing; no file created | 0 tables | not applicable | not applicable |
| derived FTS DB | present | 13 tables | 7 / 45,056 | `ok` |
| observability DB | present | 2 tables | 0 / 8,192 | `ok` |
| legacy `index.db` | present; historical candidate | 22 tables | 577 / 1,224,704 | `ok` |

The measured `PRAGMA schema_version/user_version` pairs are, respectively,
`345/29`, `16/1`, `UNKNOWN/UNKNOWN` for the missing sidecar, `16/0`,
`5/0`, and `51/9`. These are measurement results, not architecture
constants.

Per-table inventory recorded columns, foreign keys, indexes, status/currentness
fields, owner/conversation fields, reference fields, population/time bounds,
UTC buckets where measurable, JSON reference-token counts, and explicit
`UNKNOWN` values where the current schema could not establish a property.

All seventeen sidecar hot-path query definitions from artifact 87 were emitted
with canonical SQL hashes and `NOT_APPLICABLE_TABLE_MISSING` because the
cognitive sidecar file is absent. No missing store was created. Existing-store
queries and aggregate reads used only the read-only measurement path.

## Zero-mutation proof

For every existing known store:

```text
queryOnlyProvenForExistingStores=true
authorizerInstalledForExistingStores=true
deniedMutationActionCount=0
beforeAfterFileProof=all unchanged
database data_version changes=none
measurementState=complete
```

Existing databases were opened through SQLite read-only URIs. The legacy index
was additionally opened with `immutable=1` because its WAL companion was
mechanically zero bytes; the WAL and shared-memory companions were included in
the before/after checks. The helper issued no startup, reconciliation,
redaction, repair, rebuild, vacuum, checkpoint, or semantic-state operation.

This is a passive Windows-local measurement. It is not a Mint or production
witness. No retention, archive, compaction, deletion, activation, promotion,
deployment, or W9 action occurred.

```text
W8_GATE=COMPLETE_FOR_OFFLINE_VERIFICATION
NEXT_AUTHORIZED_ACTION=STOP
```
