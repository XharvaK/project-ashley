# mint-corrections-2  -  source follow-up after cd9586a (not activation-accepted)

This document is the handoff for the **source-only** follow-up on top of
`cd9586a937e60a7cc38bbf693fd32beb5a3673d0`. It is **not** a pull-and-activate
instruction. It does **not** accept the candidate. Do not treat this follow-up
as qualified, installed, or activation-ready.

## SHA / HEAD honesty

| Field | Value |
|---|---|
| Predecessor HEAD | `cd9586a937e60a7cc38bbf693fd32beb5a3673d0` |
| This follow-up | `474e691048e25431a720361d577e092d80c060a1` |
| `origin/master` | this follow-up (`474e691`) |
| Pushed | **yes** (`1a82263..474e691`). Push is not activation and not PASS. |
| `SOURCE_PIN` | **unset / not this SHA** until a later accepted candidate |
| `LIVE_WITNESS_IMPLEMENTED` | **NO** |
| `WORKTREE_CLEAN` | **NO** because untracked `docs/architecture/research/*` remain |

`cd9586a` is not amended. This follow-up was pushed to `origin/master`. Push is
not activation and not PASS. Physical 02C for the new SHA is **NOT RUN**.

## What this follow-up changed

| Item | Change |
|---|---|
| A | `install-provenance.py`: replace the committed extra `broker_root` `startswith(".")` skip. Hidden runtime is included by default (`node_modules/.bin`, `.npmrc`). Production hidden allowlist is an empty frozen set. Unexpected hidden fails closed. `.gitignore` / `.gitattributes` / `.DS_Store` / `.git` are not on a production allowlist. |
| A tests | `install-provenance.test.ts`: `.npmrc` included; unexpected hidden fail-closed; empty-allowlist (no invented exclusion). No "proven metadata excluded" production regression. Test-only exclude name is a fixture, not a production branch. |
| B | `install.sh`: compose EXIT traps (recovery + temp cleanup) so `on_exit` still runs during COMMIT. Move `systemctl daemon-reload` and `systemctl enable --now ashley-exec-broker.socket` into COMMITTING, after publish and before `TX_STATE=COMMITTED`. Never enable/start `ashley-exec-broker.service`. |
| B tests | `install-dirty-source.test.ts`: COMMIT fail-at `during_commit_runtime`, `during_commit_workspace`, `during_commit_keys`, `during_commit_units`, `during_commit_publish`; crash after publish before systemd (still COMMITTING / `INSTALL_RECOVERY_REQUIRED`); crash after systemd before COMMITTED write. No "crash after COMMITTED before systemd" case. |
| C | This document: SHA/HEAD honesty, `WORKTREE_CLEAN`, real verification commands, `LIVE_WITNESS_IMPLEMENTED=NO`, no pull-and-activate as if accepted. |

## Trap addendum

The PREPARE-phase peer-helper EXIT trap previously **replaced** the line-78
`on_exit` trap. A COMMIT crash then left EXIT not writing
`INSTALL_RECOVERY_REQUIRED`.

Traps are now **composed**: `on_exit` still runs during COMMIT and also
removes the peer-helper temp file. The second trap is not a replacement.

`systemctl daemon-reload` and `systemctl enable --now ashley-exec-broker.socket`
run while the journal is still `COMMITTING`, after publish and before the
`COMMITTED` write. The socket may already be live while the journal is still
`COMMITTING` / `INSTALL_RECOVERY_REQUIRED`.

Recovery remains a full `install.sh --apply` re-run. There is **no** `recover`
subcommand. The re-run must be idempotent.

## WORKTREE_CLEAN

`WORKTREE_CLEAN=NO`.

Untracked research documents under `docs/architecture/research/` stay
untracked. They are not part of this follow-up and must not be staged.

## Verification commands that actually exist

Root package.json has no build script and no test:offline script.
Use build:agent and build:discord at the repo root.
test:offline lives under apps/agent-service.
Changed sandbox-broker tests only: install-provenance.test.ts and install-dirty-source.test.ts.
Full suites are UNVERIFIED here. Qualifier will run full suites later.
Do not claim PASS from this document.

## Not done / not accepted

- pushed `474e691` to `origin/master` (not activation, not PASS)
- no amend of cd9586a
- no 02C
- no live installer apply
- no policy issuance
- no engineering activation
- no live witness
- no PASS claim
- no Cursor cloud agents
- no pull-and-activate as if this follow-up is accepted

## Historical predecessor (not this follow-up)

cd9586a is the transactional successor-lifecycle predecessor. Earlier text
in this file that treated a corrections commit as an activation SOURCE_PIN
and instructed a fast-forward pull plus activation is not operative for
this follow-up.

## Installation provenance ownership
Two source-bound subjects: broker-runtime and engineering-workspace.
Hidden runtime is included in the installed identity walk by default.
Config, keys, and qualification evidence remain separate subjects.

## 02C evidence semantics
- Historical 02C PASS predecessor only: 7963d2d235b66f34f4dedfb47fa6bd1b0c1f5edf
- After source correction: fresh qualification REQUIRED.
- PHYSICAL QUALIFICATION FOR NEW SHA: NOT RUN
- LIVE_WITNESS_IMPLEMENTED: NO
- Canonical 02C canary path remains under /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/canary-receipt.json
