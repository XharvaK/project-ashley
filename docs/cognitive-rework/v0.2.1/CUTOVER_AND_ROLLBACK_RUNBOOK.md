# Cutover and Rollback Runbook — Cognitive Rework v0.2.1

**Authority:** Doc must explicitly authorize cutover (Owner Gate C). Qualification PASS is necessary and not sufficient.

**Configuration-only:** the SHA being activated must already contain live dispatcher, ingress, health, projector, import tool, shadow/live flags. This runbook must not instruct source edits or commits.

**Production host:** Linux Mint (`ssh mint`, user `xarvak`, repo `~/project-ashley`).  
**Commands from repo:** `npm run start:ashley` = `scripts/mint/remote-update.ps1` → `git pull --ff-only` → `deploy/linux-mint/update.sh`.

**Secrets:** never print `.env` contents, tokens, or API keys.

**SHA law:** refuse to continue if `git rev-parse HEAD != QUALIFIED_SHA` or the deployed artifact does not resolve to `QUALIFIED_SHA`. No “candidate branch latest.”

---

## Preconditions (all required)

1. `artifacts/runtime/QUALIFICATION_RESULT.md` `RESULT: PASS` and `QUALIFIED_SHA` set.
2. Local and Mint `git rev-parse HEAD` == `QUALIFIED_SHA` after fetch/checkout of that exact SHA.
3. Untracked `artifacts/runtime/CANDIDATE_FREEZE.md` points to `QUALIFIED_SHA`.
4. Q2 independent review bound to that SHA.
5. Q3–Q6 PASS on that SHA. Q3 means the **bounded** inhabit witness in QUALIFICATION_PROTOCOL, not a live rerun of the Q1 corpus.
6. Database backup/snapshot on Mint:
   - `~/.composer-assistant/conversations/nuclear.db`
   - `~/.composer-assistant/continuity.db`
   - `~/.composer-assistant/cognitive-v021.db`
7. Rollback directory `~/.composer-assistant/backups/cognitive-v021-<utc>/` plus recorded SHA.
8. Shadow dispose: zero sendable shadow outbox; discard candidate semantic shadow state; keep delivered conversation evidence as specified. Then import: `node scripts/cognitive-v021/import-legacy-semantic-state.mjs --mode apply` then `--mode verify` on the cutover sidecar (isolated rehearsal already PASS in Q4). Verify expected count, actual count, hashes, provenance, rejected/quarantined, duplicate/no-op. Mismatch = HARD BLOCKER 15.
9. Outbox projector idempotency already proven in freeze tests (HARD BLOCKER 14 if not).
10. Service preflight: `bash deploy/linux-mint/status.sh` + `curl -s http://127.0.0.1:3710/health`.
11. Env: set `ASHLEY_COGNITIVE_KERNEL=v021` **after stop, before start**. Do not paste secrets into chat. `ASHLEY_COGNITION_MODE` unchanged unless Doc says.
12. In-flight: classify every non-terminal operational job. If any cannot be classified as recover-or-leave: HARD BLOCKER 17.
13. Discord ingress strategy: **stop discord unit first** so no dual answering.
14. Required secrets/config present (prove presence, do not print). HARD BLOCKER 18 if absent.
15. Owner cutover authorization recorded. HARD BLOCKER 19 if absent.

If any precondition fails: **do not cut over**.

---

## Cutover sequence

1. **Maintenance fence:** stop `ashley-discord.service`; confirm inactive.
2. Stop `ashley-agent.service`.
3. Confirm git SHA on Mint is `QUALIFIED_SHA` (`git fetch` + `git checkout <QUALIFIED_SHA>` or ff-only to that commit — **not** `git pull` to branch tip if tip moved).
4. Backup DBs + `.env` permissions-preserving on Mint.
5. Run import `--mode verify` (and apply if first sidecar fill) — HARD BLOCKER 15 on mismatch.
6. Set `ASHLEY_COGNITIVE_KERNEL=v021` on Mint `.env` without echoing the file.
7. Start via `deploy/linux-mint/update.sh` **or** start units after build. Confirm `/health` reports `cognitiveKernel=v021` and schema.
8. Start Discord. Confirm ingress path (new owner message appears in sidecar inbox without waiting on prior Thought — smoke with two rapid messages if Doc agrees).
9. Immediate smoke: one ordinary DM; causal ledger shows Thought settlement; Discord text == `licensedText`; no `decide()` on the path.
10. Record `CUTOVER_RESULT.md` with `DEPLOYED_SHA=QUALIFIED_SHA`.

`update.sh` stops, builds, starts. Set the flag after stop and before start.

---

## Rollback

Restore DB snapshots. Set `ASHLEY_COGNITIVE_KERNEL=legacy`. Redeploy **the rollback SHA Doc names** (usually pre-cutover production SHA, not a merge of sidecar state into nuclear). **Do not** import v0.2.1 sidecar meaning into legacy stores.

---

## Immediate smoke

- `/health` ready; kernel `v021`
- one owner message; sidecar evidence row; accepted settlement
- no hybrid (legacy Expression must not author that utterance)
- infrastructure notice path not required for smoke success
