# Cognitive Maturation C1–C5 — Production Deployment and Acceptance

**Document class:** `EVIDENCE / HANDOFF`

This file records the 2026-08-27 production deployment and bounded acceptance
of C1–C5 at exact SHA `09b73fbb180234a2ac7056756fc339083735f40e`. It is not
architecture, not a promotion decision, and not a living dashboard. Do not
silently rewrite its evidence claims.

Date: 2026-08-27

## Final status

`PRODUCTION_DEPLOYED_AND_ACCEPTED: YES`

`DEPLOYED_SHA: 09b73fbb180234a2ac7056756fc339083735f40e`

All five maturation capabilities remain `observe`, unpromoted, and
non-live. No provider call, activation, promotion, or Model Fabric routing
change was performed.

## Deployment identity

| Item | Evidence |
|---|---|
| Host | `QXY` |
| SSH principal | `xarvak@qxy` |
| Production checkout | `/home/xarvak/project-ashley` |
| Production nuclear database | `/home/xarvak/.composer-assistant/conversations/nuclear.db` |
| Production continuity sidecar | `/home/xarvak/.composer-assistant/continuity.db` |
| Original pre-C1 production base | `968787d1a5261aef4bf266091b8cf044eddbfdb2` |
| Deployed candidate | `09b73fbb180234a2ac7056756fc339083735f40e` |
| Production source state | detached at exact deployed SHA; clean at acceptance |
| Candidate ancestry | `968787d1a5261aef4bf266091b8cf044eddbfdb2` is an ancestor of the deployed SHA |

The exact candidate object was transferred with a fetch of that object only.
No branch movement, push, merge, or new candidate was performed.

## Predeploy freeze and rollback unit

Before mutation, production was at `968787d1a5261aef4bf266091b8cf044eddbfdb2`
on `model-fabric-m2-act-autopilot`, with a clean source worktree,
`git diff --check` passing, both services active, nuclear schema v35, and
both databases passing integrity and foreign-key checks.

Rollback material was captured at:

`/home/xarvak/.composer-assistant/backups/cognitive-maturation-09b73fbb-predeploy-20260827T085639Z`

| Snapshot | Schema | Size | SHA-256 |
|---|---:|---:|---|
| `nuclear.db` | v35 | 15,679,488 bytes | `e9d0d90926ca67dd6b803c6f5c25de6455415c5741a42f51771e194067d6cb29` |
| `continuity.db` | v1 | 212,992 bytes | `a0473126fc3d2197c4dbbe3030d852440fb79382da17aaabb509b8c7f7cf1828` |

The rollback manifest records the source SHA, database snapshots, lineage,
unit snapshots, and the fact that credentials were not copied. Unit snapshot
SHA-256 values were:

- `ashley-agent.service`: `319441e384a949a623bacc2e8e425b274d38e5f34149273cd02a4c7981389f38`
- `ashley-discord.service`: `9b749d9d469df1ca332771031e9418ed2d14ed964c2134ee3c4eff25c49e8779`

## Source transition and build

- Services were stopped cleanly before source and database transition.
- Production was switched to the exact detached candidate SHA.
- Installed systemd units already matched the candidate unit files byte-for-byte.
- The candidate package build completed in the qualified order for the
  sandbox packages, `agent-service`, and `discord-bot`.
- Runtime builds passed for `agent-service` and `discord-bot`.
- Runtime artifacts were present at service start.
- No source, host, SSH, credential, or unit-file edit was made.

## Migration

The normal production data-plane path was used with migration enabled. No
manual SQL migration was used.

```text
v35 -> v36 -> v37 -> v38 -> v39 -> v40
```

Continuity migration events `256` through `270` record, for each transition,
`pending`, `nuclear_committed`, and `success`, all with build identity
`09b73fbb180234a2ac7056756fc339083735f40e`. After migration:

- nuclear schema: v40;
- continuity schema: v1;
- nuclear integrity: `ok`;
- continuity integrity: `ok`;
- nuclear foreign-key violations: `0`;
- continuity foreign-key violations: `0`;
- pending migration: none;
- lineage mirror ID remained `663a29de-3af9-4644-99f5-2dfc646d1b13`.

## Service and bounded acceptance

Both services started successfully.

The agent health endpoint returned:

```json
{"ok":true,"ready":true,"state":"ready","providerState":"configured"}
```

At the final bounded service check:

- `ashley-agent.service`: active/running, `NRestarts=0`, `ExecMainStatus=0`,
  `Result=success`;
- `ashley-discord.service`: active/running, `NRestarts=0`,
  `ExecMainStatus=0`, `Result=success`;
- error-priority journal entries since deployment: `0` for each service;
- both installed unit hashes matched the candidate unit hashes.

The production `.env` already contained `ASHLEY_COGNITION_MODE=apply`. That
host setting was not changed. Normal runtime initialization created one
authority row for each new capability under the existing contract. A
read-only acceptance check found the following for every C1–C5 capability:

- `state=observe`;
- `eval_seed_count=0`;
- `qualified_at=NULL`;
- `promoted_at=NULL`;
- `rolled_back_at=NULL`;
- no activation or promotion events;
- `capabilityCanInfluenceReadOnly=false`.

An isolated pre-start status witness also resolved all five capabilities to
`observe`, `effective=false`, `promotionEligible=false`, with no contract
mismatch. Therefore the pre-existing global mode did not activate the newly
deployed capabilities.

## Identity, continuity, and authority boundaries

The v35 rollback snapshot and post-migration v40 database had identical
identity fingerprints:

- `identity_entries`: 8 rows, SHA-256
  `bef49a42e72a409d3831c34e70e6e0d95d155c496c583cccd9b84f49f8c1ba71`;
- `opinions`: 6 rows, SHA-256
  `223539c900b060e323ed3fdc87d21fc9b8c4335946a0de54db4f4ed172a28898`.

The lineage ID remained unchanged. The continuity sidecar now records schema
version 40 and the deployed build identity. No Ashley Identity mutation was
observed.

The exact candidate's physical qualification had already passed on Linux Mint
for startup, offline HTTP readiness, Bubblewrap Sandbox V2 execution, and the
C1–C5 observe ceiling. Production acceptance performed no sandbox effectful
canary and no provider smoke. The deployed runtime is healthy and its
qualified sandbox source is present.

## Explicit exclusions and remaining debt

- Provider calls: `0`.
- Provider smoke: not run.
- Capability activation or promotion: not performed.
- Model Fabric activation or route change: not performed.
- Identity change: not performed.
- Push, merge, deployment of any other SHA, and production mutation outside
  the authorized source transition, normal migration, and normal observe-row
  initialization: not performed.
- The known stale test-literal and historical fixture maintenance debt remains
  unmodified by this deployment. It does not affect the exact qualified
  candidate or the bounded production acceptance evidence.
- Independent review remains recommended for the complete deployment evidence.

## Verdict

`PRODUCTION_ACCEPTANCE: PASS`

`C1_C5_CAPABILITY_CEILING: OBSERVE / UNPROMOTED / NON-LIVE`

`ROLLBACK: NOT USED`

`PROVIDER_CALLS: 0`

`FORBIDDEN_ACTIONS: NONE`
