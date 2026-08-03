# Memory and recall (nuclear)

Ashley memory lives in `~/.composer-assistant/conversations/nuclear.db` (SQLite).

Per turn, nuclear assembles: standing facts → recent thread messages → identity/opinions as Agency motivations decide.

## Facts and threads

- Pins: Discord `/remember`, or chat `remember:` / `bunu hatırla:`
- List: `/memory`
- Forget: `/forget`
- Fresh thread: `/new`

Facts categories: `project`, `preference`, `person`, `ongoing`, `pinned`.

## Backup

```powershell
powershell -File scripts/backup-memory.ps1
```

Copies `nuclear.db` (+ WAL/SHM) to `~/.composer-assistant/backups/{timestamp}/`.

Restore: stop agent-service, replace `nuclear.db`, restart.

## Architecture

See [Architecture_Index.md](Architecture_Index.md). Legacy `index.db` is archival (audit logger may still append session rows there; nuclear does not read it for chat).
