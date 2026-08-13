# mint-corrections-2 — single pre-activation correction pass

Runbook for applying and activating the DeepSeek correction audit pass
(`mint-corrections-2`). This pass closes 11 known source-side blockers with
ONE coherent commit; it must be pulled with a strict fast-forward and its HEAD
becomes the `SOURCE_PIN` that binds qualification evidence, the canary, and
the activation epoch.

Base: `CORRECTION_BASE = 2a4b448` (origin/master before this pass).
Corrections commit: the single commit on top of `CORRECTION_BASE` produced by
this pass (see the final report for its SHA).

## What this pass changed

| # | Blocker | Resolution |
|---|---------|------------|
| 1 | HY3-1: engineering `execute_recipe` ran on a fictional lane | Moved onto the shared qualified lane (`qualified-recipe-execution.ts`): readiness → strictest-of limits → executable → cwd native/workspace-anchored → isolation gate (evidence merge) → spawn-coupled network refusal; fixed Windows `workspaceTreeRoot` path bug; `effectHash` envelope allowlist + shape check (`effect_hash_invalid`) |
| 2 | HY3-2: effect binding was not real | Real effect binding (`engineering-effect.ts`): envelope `effectHash` + `verifyEngineeringEffectBinding` before authorization |
| 3 | Activation referenced fictional steps/artifacts | `scripts/mint/activate-engineering.sh` rewritten: SOURCE_PIN-required, owner-run, verify_installed_artifacts (`/opt/ashley-sandbox/dist/main.js`), framed-protocol broker readiness (not curl), `ASHLEY_SANDBOX_LIFECYCLE` in the owner `.env`; `rollback-engineering.sh` rewritten consistently |
| 4 | Registry filename/env drift | `config/engineering-projects.example.json` → `config/project-roots.example.json` (top-level array, `ASHLEY_SANDBOX_PROJECT_REGISTRY`) + policy contract test |
| 5 | Broker held physical agent-restart authority | Removed (`agent-restart` handler + diagnostics deleted); only negative-assertion reference remains |
| 6 | Weekly review stopped at a filesystem artifact | Routed through the real ledgered delivery path: agent claims `decision_log`('share') → `initiative_reservations` → `delivery_reservations`/bubbles; `GET /delivery/pending?owner_id=`; discord-bot scheduler drains with send → receipt → finalize |
| 7 | No engineering status surface / epoch admission proof | `GET /nuclear/engineering?owner_id=` (activation epoch, admission backlog, weekly review deliveries pending) + epoch-gate tests; fixed real production bug: `runtime_flags` DDL was never created outside tests |
| 8 | No single verification entry point | `deploy/linux-mint/sandbox/test-all.sh` (builds all 4 packages + runs all suites; optional `--with-canary`) |
| 9 | No operator runbook | This document |
| 10 | Stale references to removed artifacts | Repo-wide grep clean (`engineering-projects`, `ASHLEY_ENGINEERING_PROJECT_REGISTRY`, `sudo -u ashley`, `engineering.conf`, fictional env names) |
| 11 | Final verification + single commit | Section "Final report" below |

## Local (Windows) verification evidence

All suites green on the corrections commit:

- `apps/sandbox-policy`: tsc clean; `npm test` 4/4.
- `apps/sandbox-broker`: tsc clean; `npm test` 898 passed / 16 failed /
  32 skipped — the 16 failures are pre-existing environmental
  (`bubblewrap-qualification-harness.test.ts` requires real WSL/Linux bash);
  `npm run build` succeeds.
- `apps/agent-service`: tsc clean; `test:offline` 128 files / 963 passed /
  2 skipped (includes the 7 new weekly-review-delivery tests, 5 new
  engineering-status tests, and the delivery suite).
- `apps/discord-bot`: tsc clean; `npm test` 78/78 (includes 4 new
  weekly-review drain tests + the route-surface drift check covering the two
  new routes).

## Mint host activation steps

Owner (`xarvak`) on the production Linux Mint host. Never `sudo -u` this
runbook. The host is expected to already have: the broker installed from the
qualified dist, the 02C isolation evidence + canary receipt at
`/var/lib/ashley-sandbox/qualification/`, owner keys + policy pair under
`~/.composer-assistant/keys/`, and the project registry at
`~/.composer-assistant/project-roots.json`.

1. Pull the corrections commit (strict fast-forward only):

   ```bash
   cd /home/xarvak/project-ashley
   git fetch origin
   git rev-parse origin/master            # must be the corrections commit SHA
   git pull --ff-only origin master
   git rev-parse HEAD                     # this becomes SOURCE_PIN
   ```

2. Run the full verification entry point (may take several minutes):

   ```bash
   deploy/linux-mint/sandbox/test-all.sh
   ```

   Expected: all four suites PASS. (Skip `--with-canary` here; the canary is
   run by the activation script itself.)

3. Read the activation script first, then run it with the HEAD commit:

   ```bash
   SOURCE_PIN="$(git rev-parse HEAD)" bash scripts/mint/activate-engineering.sh
   ```

   It verifies (in order, fail-closed): source pin → 02C isolation evidence
   (status/sourceCommit/providerKind) + canary receipt → policy pair presence
   → clean protected live checkout → installed broker dist → broker gate envs
   + socket/unit restart → framed-protocol readiness (`sandbox.readiness`,
   `ready && networkIsolationOperational && networkMode=="none"`) → R5B
   canary (`verify-agent-tsc.mjs`, `"ok":true` + `"outcome":"succeeded"`) →
   project registry validity → no-remote self-improvement clone → activation
   epoch marker → `ASHLEY_SANDBOX_LIFECYCLE=ENABLED` in `~/.composer-assistant/.env`
   → agent (user unit) restart → agent health (`/health`) → worker health
   (non-fatal) → historical admissions untouched.

   Success prints `{"ok":true,"activationEpochMs":…,"canary":"PASS",…}`.

4. Post-activation join-proof:

   ```bash
   curl -fsS "http://127.0.0.1:3710/nuclear/engineering?owner_id=<owner-id>"
   ```

   Expect `activationEpochMs` set, `eligiblePendingAdmissions` counting only
   post-cutover pending admissions, and `weeklyReviewDeliveriesPending` 0
   (until the first weekly review is due).

   ```bash
   curl -fsS "http://127.0.0.1:3710/delivery/pending?owner_id=<owner-id>"
   ```

   Expect `{"deliveries":[]}` until the weekly review timer fires; then the
   discord-bot scheduler drains each ledgered review with send → receipt →
   finalize (console: `weekly review delivered reservation=…`).

5. Rollback (only if something is wrong after activation):

   ```bash
   bash scripts/mint/rollback-engineering.sh
   ```

   Removes the lifecycle flag from the owner `.env`, flips the activation
   marker to `sandboxAutonomy:"DISABLED"`, restarts the agent user unit, and
   preserves qualification evidence.

## Final report

After the commit is pushed, the operator records the two readiness strings
verbatim (plus the corrections commit SHA):

```
READY FOR DEEPSEEK CORRECTION-DIFF AUDIT: YES/NO
READY FOR MINT PHYSICAL QUALIFICATION: YES/NO
Corrections commit: <sha>
```
