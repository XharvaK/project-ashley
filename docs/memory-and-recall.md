# Memory and recall — ops playbook

Ashley memory lives in `~/.composer-assistant/conversations/index.db` (SQLite). The agent assembles context per turn: standing facts → thread summary → retrieval snippets (normal chat only).

## Debug

With agent-service running (dev, localhost only):

```powershell
curl "http://127.0.0.1:3710/debug/memory-context?owner_id=YOUR_DISCORD_ID&message=neler%20hatırlıyorsun"
```

Returns `queryMode`, `memoryBlockPreview`, `hotMessageCount`.

## Health

```powershell
curl http://127.0.0.1:3710/health
```

Check `memory.jobsPending`, `memory.jobsPendingByType`, `memory.jobsStuck`, `memory.jobsFailed`, `proactive.enabled`.

`memory.ok` is false when jobs are stuck, any failed jobs, or pending queue exceeds threshold (default 50, env `MEMORY_JOBS_PENDING_ALERT`).

## Auto-remember (consolidator)

Facts are extracted automatically — `/remember` is optional:

| Path | When |
|------|------|
| **Fast-path** | `bunu hatırla: …`, explicit project/identity phrases |
| **Consolidator** | Every N assistant turns (default `MEMORY_FACT_EVERY_N=4`) |
| **Manual** | `/remember` for instant pin or private facts |

Consolidator jobs: `summary` > `facts` > `embed` priority; one coalesced facts job per thread.

Env: `AUTO_REMEMBER_ENABLED` (default true).

- Inline forget requires explicit `unut: topic` or `forget: topic` (no substring auto-delete)
- Guild channels: memory digest only in DM; use `/remember private:true` or `bunu hatırla özel: …` for sensitive pins

## Tests

### Offline (no API cost)

```powershell
cd C:\Users\Xharv\Projects\composer-assistant
npm test
# or
powershell -File scripts/phase0/run-all.ps1 -Tier offline
```

Includes Vitest unit tests + recall pattern script.

### Agent integration (Mistral + running agent)

```powershell
npm run dev:agent
powershell -File scripts/phase0/run-all.ps1 -Tier agent
```

Scripts: `test-memory-recall.mjs`, `test-recall-diversity.mjs`, `verify-dm-recall.mjs`, `test-correction-guard.mjs`, `test-voice-recall.mjs`, `test-initiative.mjs`, `test-auto-remember.mjs`.

### Full stack (GPU / Orpheus)

```powershell
powershell -File scripts/phase0/run-all.ps1 -Tier full
```

## Manual Discord verification

1. `/new` for a fresh thread
2. `neler hatırlıyorsun` twice — short, different wording, no bullets
3. `hafızanda neler var` — recall mode, no confabulation
4. After denying a fabricated fact (`uydurmuşsun`, `içmedim`) — blocked topics should not return
5. Say `Website Factory'de çalışıyorum` then `/memory` — project fact without `/remember`
6. `bunu hatırla: test fact` — instant pin + digest message

## Backup and restore

```powershell
.\scripts\backup-memory.ps1
```

Copies `index.db` (+ WAL/SHM) to `~/.composer-assistant/backups/{timestamp}/`.

Restore: stop agent-service, replace `index.db`, restart.

## Proactive initiative

- Atomic tick: `POST /initiative/tick` (evaluate + lease + draft)
- Commit after DM send: `POST /initiative/commit`
- Pause persists in DB: `POST /initiative/pause` / `resume`

See also `docs/proactive-initiative.md`.
