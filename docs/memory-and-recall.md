# Memory and recall (nuclear)

Ashley memory lives in `~/.composer-assistant/conversations/nuclear.db` (SQLite).

Per turn, nuclear assembles relevant grounded episodes, standing facts, recent
thread messages, identity, Mind State, and opinions after Thought selects the
evidence. Episodes never replace their source messages.

## Facts and threads

- Pins: Discord `/remember`, or chat `remember:` / `bunu hatırla:`
- List: `/memory`
- Forget: `/forget`
- Fresh thread: `/new`

Facts categories: `project`, `preference`, `person`, `ongoing`, `pinned`.

## Episodic continuity

Completed exchanges queue a durable consolidation job. The job links its
episode to exact message IDs, stores salience and unresolved status, and indexes
the summary with local SQLite FTS5. In `observe` mode episodes are inspectable
but excluded from live context. In `apply` mode relevant episodes can support a
callback, active concern, commitment, or grounded affect update.

Message loading and model analysis happen before integration. Episode creation,
message links, verified facts, Mind State, affect, revision proposals, the
successful run, and job completion are then committed atomically. Automatic
facts are accepted only when the model cites a stored user message and an exact
literal quote from it. Manual pins are preserved separately from automatic and
legacy facts.

Forgetting uses literal topic matching, so `%` and `_` are ordinary characters.
Confirmation runs as one transaction: matching source messages are emptied and
marked with a content-free receipt; matching episodes and FTS entries are
forgotten; evidence links, episode-sourced Mind State, affect, unsupported facts
and growth leaves are reconciled; and linked model output is redacted. Redacted
messages are excluded from hot context, consolidation, and cadence queries.
Seeded and unrelated manual identity remain immutable. Completed cognition
history is retained for 90 days and failed history for 180 days; pending or
running work is never pruned.

## Backup

```powershell
powershell -File scripts/backup-memory.ps1
```

Copies `nuclear.db` (+ WAL/SHM) to `~/.composer-assistant/backups/{timestamp}/`.

Restore: stop agent-service, replace `nuclear.db`, restart.

## Architecture

See [Architecture_Index.md](Architecture_Index.md). Legacy `index.db` is archival (audit logger may still append session rows there; nuclear does not read it for chat).
