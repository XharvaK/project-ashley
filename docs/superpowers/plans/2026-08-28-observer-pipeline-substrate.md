# Plan: Observer Pipeline Substrate

## Goal

Implement the accepted non-bot Field Observation substrate from base
`a93471f911cf762d61c0355b7eda6f0e3615890a`: a read-only off-process exporter,
deterministic evidence bundles, a bounded Field Lab publisher, non-intervention
proof, disabled source-controlled scheduling units, and focused documentation.

The implementation MUST NOT deploy, activate, or contact QXY, Ashley
production, the Field Lab remote, or C1.

## Constraints and invariants

- Keep exporter and publisher as separate CLI entrypoints and separate import
  graphs.
- Read approved Ashley evidence only through read-only consistent SQLite
  snapshots and primary conversation JSONL; write only outside the Ashley data
  plane.
- Keep all source credentials and control paths out of the exporter and
  publisher.
- Extract the existing pure credential detector into one tiny shared module so
  observer redaction and agent behavior use the same semantics.
- Preserve `secret` omission, retain ordinary private conversation, and record
  explicit coverage/surface/unknown states.
- Canonicalize semantic bundle content before hashing; never include volatile
  paths, timestamps, process identifiers, or filesystem order in the bundle
  identity.
- Publish only declared artifact types under the six allowed Field Lab vault
  folders. Fail closed on traversal, divergence, conflicts, force flags, and
  owner-file loss.
- Do not implement historical dry-run/C1 rehearsal behavior.
- Preserve unrelated worktree changes and commit only this bounded change.

## Work sequence

1. Add failing tests for:
   - control-credential and forbidden-import authority boundaries;
   - read-only source/nonmutation and WAL-consistent snapshot behavior;
   - output containment and ephemeral snapshot cleanup;
   - every credential detector family, secret omission, private retention, and
     negative controls;
   - field-day boundaries and timezone conversion;
   - transcript ordering, system/tool exclusion, deterministic joins,
     ambiguity, conflict retention, and degraded coverage;
   - identity/currentness/epoch/cutoff unknown semantics;
   - deterministic bundle IDs and revision behavior;
   - local bare-remote publisher idempotency, fast-forward behavior,
     divergence, traversal rejection, and exact write scope.
2. Extract the credential-shape detector to the minimal pure shared package,
   retain the agent compatibility import, and add agent parity regressions.
3. Implement path safety, field-day resolution, SQLite snapshot handling,
   transcript loading/joining, approved evidence projection, identity
   projection, canonicalization, manifest generation, and exporter CLI.
4. Implement the independent Field Lab artifact validator and Git publisher
   CLI with bounded fetch/fast-forward/add/commit/reconcile/push behavior.
5. Add disabled Europe/Istanbul 04:05 systemd source units and documentation
   that links to the canonical protocol and records the no-deploy/C1 gate.
6. Run the focused observer build/tests, shared/agent build and relevant
   privacy regressions, inspect the exact diff and staged scope, then create
   the authorized local commit:
   `feat(observer): add read-only field observation pipeline`.

## Verification and completion criteria

- The observer package builds and tests independently.
- The agent service still builds and its privacy/continuity regressions pass.
- Tests prove no Ashley database mutation, no control HTTP, no secret/control
  credential imports, no out-of-root writes, and no publisher force behavior.
- Bundle IDs are stable for identical semantic inputs and change for changed
  evidence; prior revisions remain untouched.
- No deployment, activation, remote push, C1 start, or production state change
  is performed.
- Final report includes base/head/commit, exact files, proof matrix, tests,
  untouched flags, blockers, and the next deployment step.

## Self-review before implementation

- The requested task supplies the accepted design and authorization, so no
  additional architecture approval is required.
- The isolated worktree is at the exact implementation base and is clean.
- The current Node runtime exposes the named `node:sqlite` backup API; the
  implementation will still fail closed if the target runtime lacks it.
- The plan does not authorize deployment, activation, remote publication, or
  production access.
