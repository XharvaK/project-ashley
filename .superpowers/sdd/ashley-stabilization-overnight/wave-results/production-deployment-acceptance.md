# Project Ashley Sparse VNext — Wave 8/9 Production Deployment and Acceptance

## Result

`PRODUCTION_DEPLOYMENT=PASS`

`PRODUCTION_ACCEPTANCE=DEGRADED_NOT_ACCEPTED`

`STABILITY_WINDOW=NOT_STARTED`

The exact source candidate was deployed to the Linux Mint production host and
the bounded r5-to-r6 sidecar transition completed. The host is ready and both
services are active. A single bounded live Thought witness reached the current
NIM route and returned `provider_unavailable`; the kernel correctly produced
intentional silence and a durable system notice. An ordinary successful Sparse
VNext settlement was therefore not proven, so the production acceptance gate
is not marked accepted and the stability window is not entered.

## Authority and exact identity

The current committed source and the current 2026-09-06 Sparse VNext design
were used. Older freeze/acceptance documents were not treated as current
architecture.

The immutable source candidate remains:

| Field | Value |
|---|---|
| Source candidate SHA | `bbd3657eb0f590f30ddb582b3d73b51fa2f5f20e` |
| Source candidate tree | `c1adc90c107941b87784fa5c9aa747bab67c325b` |
| Source candidate parent | `5ad74718be5827cfb9471eb7aa05540f548c4f7c` |
| Evidence branch | `codex/stabilization-sparse-vnext-overnight-20260906` |
| Production host | `XQX` via SSH alias `mint` |
| Production checkout | `/home/xarvak/project-ashley` |

Later branch commits contain only qualification/deployment evidence. They do
not change the source candidate identity.

## Production deployment

Pre-deployment state was verified on `master` at
`7bae7eaafedc2e7e859218d340920ea3958b1515`, tree
`5a1fd8c04ced30f1fd0764ea7b7b667285ce4170`, with a clean tracked worktree and
both services active.

The deployment sequence was:

1. Stop the agent and Discord writers and verify they were inactive.
2. Fast-forward production to the exact source candidate.
3. Build `apps/agent-service` and `apps/discord-bot`; both builds passed.
4. Synchronize user units and reload the user manager.
5. Execute `scripts/stabilization/sidecar-meta-transition.mjs --direction forward`
   against `/home/xarvak/.composer-assistant/cognitive-v021.db` while writers
   were quiesced.
6. Start the agent, wait for readiness, then start Discord.
7. Atomically write and verify the activated SHA marker.

The sidecar transition changed exactly one field and one row:

| Field | Before | After |
|---|---|---|
| `schema_version` | `8` | `8` |
| `architecture_epoch` | `v0.2.1` | `v0.2.1` |
| `implementation_spec_version` | `0.2.1.r5` | `0.2.1.r6` |
| `thought_contract_version` | `2` | `2` |
| `authority_epoch` | `1` | `1` |
| `projection_state` | `current` | `current` |
| changed rows | — | `1` |

Post-deployment identity was verified as checkout SHA
`bbd3657eb0f590f30ddb582b3d73b51fa2f5f20e`, tree
`c1adc90c107941b87784fa5c9aa747bab67c325b`, clean tracked worktree, and
activated marker equal to the candidate SHA. The deployed build reported
implementation spec `0.2.1.r6`, settlement schema `2`, architecture epoch
`v0.2.1`, Thought contract `ashley.thought.semantic.v2`, schema
`ashley.thought.semantic.v2.schema`, and semantic fingerprint
`sha256:e96d2a20feea442da2fbfacfa02bc9b0383836e0e531af3c089c67c436a35ace`.

`/health` returned ready with cognitive kernel `v021` and sidecar schema `8`.
`ashley-agent.service` and `ashley-discord.service` were active after start.
Sidecar, nuclear, and continuity quick checks returned `ok`.

## Bounded production witness

One owner-authenticated `/chat/ingress` request was admitted at
`2026-09-07T03:51:53.627Z` with cycle
`cycle:24f1049c62f932c179f2e005e8dc8a8583938d8f223429490ea9dc5a9e7d1895`,
generation `31`, and inbox event
`f9134989-d2b5-4585-a552-f78ddab1c800`.

The request used a synthetic `threadId` in the witness payload. Normal Discord
ingress does not provide that field and uses the active conversation. The
synthetic value was detected when finalization hit the existing foreign-key
boundary; it was not retained as a production thread.

The single Thought attempt was recorded as attention request `2111`:

- provider: `nim`
- model/occupant: `nvidia/nemotron-3-super-120b-a12b` /
  `mfo_nim_nemotron_3_super_high`
- wire binding: `compat_thought_nim_nemotron_super_native_json_schema_v1`
- outcome: `error`
- error class: `provider_unavailable`
- estimated input/output: `9619` / `8192` tokens
- actual input/output: unavailable
- no fallback or retry campaign

The resulting sidecar facts were:

- inbox status `consumed`, terminal reason `completed`, attempt count `1`;
- cycle state `silent`, trigger `owner_message`;
- causal ledger `id=27`, `thought_unavailable=1`;
- no settlement row and no speech-outbox row for the witness cycle;
- one durable system notice, with no semantic settlement or operational effect.

This is a passing intentional-silence and failure-honesty witness. It is not a
successful ordinary Thought settlement witness.

## Bounded witness recovery

The already-sent system notice used one real Discord receipt:
`1546367398016327720`.

The receipt was not resent. A transaction changed only reservation `234`'s
invalid synthetic `thread_id` and notice `19`'s matching delivery intent to
the verified active conversation
`2d445d64-ca17-4fd7-91e3-9f3578062a16`. The existing active `mem_threads` row
was verified before the update.

The existing finalize endpoint then returned:

```text
state=committed
finalizationReason=all_bubbles_delivered
receiptCount=1
plannedCount=1
```

The final nuclear reservation is `committed`; the receipt-backed system event
is present in `conversation_evidence_log`; and the sidecar notice is
`delivered`. Counts remained speech outbox `8`, settlements `8`, causal ledger
`27`, inbox events `36`, and cycles `31` after reconciliation.

The sidecar `system_notice_outbox.discord_message_id` remains null. This is a
pre-existing current-source projection gap: the projector reads a
`delivery_reservations.discord_message_id` field that is not present in the
current nuclear schema, while the authoritative bubble and conversation
evidence rows retain the real Discord ID. It was not broadened into this
candidate; it is recorded for a separate bounded repair.

## Acceptance matrix

| Criterion | Result | Evidence |
|---|---|---|
| Exact deployed SHA/tree and marker | PASS | Candidate checkout, tree, clean tracked worktree, marker |
| r5-to-r6 sidecar transition | PASS | Exact identity checks, one-row update, read-back, schema 8 |
| Agent/Discord readiness | PASS | Both user services active; `/health` ready |
| Database integrity/continuity | PASS | Quick checks `ok`; continuity available; no schema rewrite |
| Intentional silence on Thought failure | PASS | Silent cycle, no settlement/speech, `thought_unavailable=1` |
| Receipt-backed system notice delivery | PASS with projection-gap note | Committed reservation, real Discord bubble receipt, delivered evidence |
| Ordinary Sparse VNext settlement | NOT PROVEN | The sole live Thought attempt was `provider_unavailable` |
| Provider behavior | DEGRADED | Current `thought` route is degraded after the bounded NIM failure |
| Production outbox recovery | NOT PROVEN | No live pending speech row was available in this witness |
| Future-trigger/evidence-reliance production witness | NOT PROVEN | No settlement reached those domains; local exact-candidate witnesses passed |
| Stability window | NOT STARTED | Acceptance is degraded/not accepted |

## Operator effects and non-claims

The first manually constructed finalize request had shell-quoting-corrupted
JSON and returned HTTP `400`; it did not mutate state. The corrected request
returned HTTP `200` and finalized the existing receipt.

Two broad read-only database inspection passes held SQLite read transactions
long enough to exercise the service's existing lock failure path. The agent
service restarted twice under systemd (`NRestarts=2`) and returned to ready;
the Discord service remained active. This is recorded as operator-induced
verification impact, not as a candidate semantic failure. No further broad
database reads were made after the service returned ready.

No rollback was warranted. The provider failure also occurred in the prior
controlled diagnostic, and reverting the Sparse VNext binary would not repair
that provider availability condition. No capability promotion or meta
rollback was performed.

`SHUTDOWN_AUTHORITY=NO`.

`SHUTDOWN_ACTION=PROHIBITED`.

The multi-day stability window is not claimed complete. The next owner action
is to adjudicate the provider reliability concern and the system-notice
Discord-ID projection gap before any stable-use acceptance or follow-on
programme decision.
