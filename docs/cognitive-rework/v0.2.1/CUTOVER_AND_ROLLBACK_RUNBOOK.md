# Cutover and Rollback Runbook — Cognitive Rework v0.2.1

**Authority:** Doc must explicitly authorize cutover (Owner Gate C). Qualification PASS is necessary and not sufficient.

**Configuration-only:** the SHA being activated must already contain live dispatcher, ingress, health, projector, import tool, shadow/live flags. This runbook must not instruct source edits or commits.

**Production host:** Linux Mint (`ssh mint`, user `xarvak`, repo `~/project-ashley`).  
**Commands from repo:** `npm run start:ashley` = `scripts/mint/remote-update.ps1` → `git pull --ff-only` → `deploy/linux-mint/update.sh`.

**Secrets:** never print `.env` contents, tokens, or API keys.

**SHA law:** refuse to continue if `git rev-parse HEAD != QUALIFIED_SHA` or the deployed artifact does not resolve to `QUALIFIED_SHA`. No “candidate branch latest.”

**Destructive mutations** (shadow semantic dispose, import `--apply`) occur **only** in the maintenance fence after Discord and agent are confirmed inactive. Preconditions are **read-only**.

---

## Pre-cutover read-only precheck (all required; no sidecar mutation)

1. `artifacts/runtime/QUALIFICATION_RESULT.md` `RESULT: PASS` and `QUALIFIED_SHA` set.
2. Local and Mint `git rev-parse HEAD` == `QUALIFIED_SHA` after fetch/checkout of that exact SHA.
3. Untracked `artifacts/runtime/CANDIDATE_FREEZE.md` points to `QUALIFIED_SHA`.
4. Q2 independent review bound to that SHA.
5. Q3–Q6 PASS on that SHA. Q3 means the **bounded** inhabit witness in QUALIFICATION_PROTOCOL, not a live rerun of the Q1 corpus.
6. Backup destination ready: `~/.composer-assistant/backups/cognitive-v021-<utc>/` plus recorded SHA. Do not yet copy (copy is inside the fence). Planned sources:
   - `~/.composer-assistant/conversations/nuclear.db`
   - `~/.composer-assistant/continuity.db`
   - `~/.composer-assistant/cognitive-v021.db`
7. Tools available: import CLI on `QUALIFIED_SHA`; isolated Q4 rehearsal already PASS.
8. **Inspect only:** shadow outbox has zero sendable rows (`pending|projecting|projected|sending` with `origin=shadow`). Do not dispose yet.
9. **Dry-run only:** `import-legacy-semantic-state.mjs --mode dry-run` on **copies**, expected counts recorded. Do not `--mode apply`.
10. Outbox projector idempotency already proven in freeze tests (HARD BLOCKER 14 if not).
11. Service preflight: `bash deploy/linux-mint/status.sh` + `curl -s http://127.0.0.1:3710/health`.
12. In-flight: classify every non-terminal operational job. If any cannot be classified as recover-or-leave: HARD BLOCKER 17.
13. Required secrets/config present (prove presence, do not print). HARD BLOCKER 18 if absent.
14. Owner cutover authorization recorded. HARD BLOCKER 19 if absent.
15. Env plan: set `ASHLEY_COGNITIVE_KERNEL=v021` **after stop, before start**. Do not paste secrets into chat. `ASHLEY_COGNITION_MODE` unchanged unless Doc says.

If any precheck fails: **do not cut over**.

---

## Maintenance fence (mutations here only)

1. Stop `ashley-discord.service`; confirm inactive. (No dual answering.)
2. Stop `ashley-agent.service`; confirm inactive.
3. Confirm git SHA on Mint is `QUALIFIED_SHA` (`git fetch` + `git checkout <QUALIFIED_SHA>` — **not** `git pull` to branch tip if tip moved).
4. Backup DBs + `.env` permissions-preserving into the recorded backup directory.
5. Verify **no process** holds write locks on nuclear / continuity / sidecar (agent and discord inactive).
6. Dispose/quarantine **candidate semantic** shadow state (WC, concerns, occupancy, nominations, triggers, subscriptions, candidate outbox). **Preserve** delivery-truth Conversation Evidence (owner + delivered legacy Ashley).
7. Verify zero sendable shadow outbox.
8. Import legacy state `--mode apply` then `--mode verify` (counts, hashes, provenance, conversation-evidence **dedupe**). HARD BLOCKER 15 on mismatch.
9. Set `ASHLEY_COGNITIVE_KERNEL=v021` on Mint `.env` without echoing the file.
10. Build/start exact `QUALIFIED_SHA` (`update.sh` **or** start units after build). Confirm `/health` reports `cognitiveKernel=v021` and schema.
11. Start Discord. Confirm ingress path (new owner message appears in sidecar inbox without waiting on prior Thought — smoke with two rapid messages if Doc agrees).
12. Immediate smoke: one ordinary DM; causal ledger shows Thought settlement; Discord text == `licensedText`; no `decide()` on the path.
13. Record `artifacts/runtime/CUTOVER_RESULT.md` with `DEPLOYED_SHA=QUALIFIED_SHA`.

`update.sh` stops, builds, starts. Because Discord and agent are already stopped in this fence, prefer start-after-build rather than re-running a script that assumes it is the one stopping production for Q4-style isolation. Do not let a shadow candidate write during import.

No candidate semantic write may race the import.

---

## Rollback

Restore DB snapshots. Set `ASHLEY_COGNITIVE_KERNEL=legacy`. Redeploy **the rollback SHA Doc names** (usually pre-cutover production SHA, not a merge of sidecar state into nuclear). **Do not** import v0.2.1 sidecar meaning into legacy stores.

---

## Immediate smoke

- `/health` ready; kernel `v021`
- one owner message; sidecar evidence row; accepted settlement
- no hybrid (legacy Expression must not author that utterance)
- infrastructure notice path not required for smoke success
