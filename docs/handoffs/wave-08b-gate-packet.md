# Wave 08b Gate Packet

**Wave:** 08b — Self-inspection and change proposals (implementation)
**Type:** Implementation verification
**Status:** **Wave_accepted** — Doc sign-off recorded 2026-08-04; not **Release_qualified**
**Not authorized:** **Release_qualified**, **Deployed**, Mint user/service install, production broker socket wiring, auto-commit/deploy, `apply`, commit, push, or deploy

---

## Preflight

| Check | Result |
|-------|--------|
| Wave 07b **Wave_accepted** | Yes — 2026-08-04 |
| Wave 08 **Design_accepted** | Yes — 2026-08-04 |
| `VISION.md` unchanged | Yes |
| §13 constraints honored | Yes — see guarantees below |

---

## Command transcript

| Command | Exit code | Result |
|---------|-----------|--------|
| `npm test --prefix apps/sandbox-broker` | 0 | **PASS** — 14 files, 52 tests |
| `npm run build --prefix apps/sandbox-broker` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/agent-service` | 0 | **PASS** — 44 files, 216 tests |
| `npm run build --prefix apps/agent-service` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/discord-bot` | 0 | **PASS** — 71 tests |
| `npm run build --prefix apps/discord-bot` | 0 | **PASS** — `tsc` clean |
| `npm run phase0:offline` | 0 | **PASS** — "OK offline tier" |
| `git diff --check` | 0 | **PASS** — CRLF normalization warnings only |

**Skipped platform checks:** real `SO_PEERCRED`, systemd socket units, PGID process-group kill, `ashley-sandbox` user creation, live Mistral, Discord gateway, Mint SSH.

---

## Changed files (Wave 08b scope)

### agent-service — MIGRATION_16 + change-proposal module

| Path | Role |
|------|------|
| `src/core/change-proposal/migration-16.ts` | `change_proposals` + `change_proposal_events` DDL |
| `src/core/change-proposal/types.ts` | Categories, states, receipt refs, allowed event keys |
| `src/core/change-proposal/store.ts` | Create/list/update proposals and append-only events |
| `src/core/change-proposal/lifecycle.ts` | State machine, Ashley/Doc decisions, stale base, quarantine, external outcome |
| `src/core/change-proposal/routing.ts` | Category routing matrix; `docDecisionAuthorizesBroker` always false |
| `src/core/change-proposal/secret-guard.ts` | Fail-closed credential scan on proposal text |
| `src/core/change-proposal/verification.ts` | System-derived `verified` from broker receipt evidence |
| `src/core/change-proposal/events.ts` | Metadata-only payload sanitization |
| `src/core/change-proposal/broker-client.ts` | Transport boundary for artifact/task broker IPC |
| `src/core/change-proposal/source/archive.ts` | Archive size limits and mandatory excludes |
| `src/core/change-proposal/source/patch-guard.ts` | Unsafe patch rejection |
| `src/core/change-proposal/source/stale-base.ts` | Base commit + tree hash comparison |
| `src/core/change-proposal/source/workflow.ts` | Source orchestration (archive manifest, verification batch) |
| `src/core/change-proposal/wave08b.test.ts` | Lifecycle, routing, secrets, stale base, archive, forget registration |
| `src/core/db.ts` | MIGRATION_16 block; `NUCLEAR_SUPPORTED_VERSION = 16` |
| `src/core/continuity/nuclear-targetable.ts` | Register proposal tables for exact forget |
| `src/core/runtime.ts` | Owner-scoped proposal CRUD and decision methods |
| `src/server.ts` | Owner HTTP `/nuclear/change-proposals/*` surfaces |
| `src/core/db.test.ts` | v16 schema expectations |
| `src/core/continuity/wave05-migration.test.ts` | Version bump to 16 |
| `src/core/continuity/wave06-migration.test.ts` | Version bump to 16 |

### sandbox-broker — source scopes

| Path | Role |
|------|------|
| `src/crypto/types.ts` | `source_edit`, `source_verify`, `source_diff` scopes; `recipeId` |
| `src/policy/recipes.ts` | Broker-owned immutable test recipes |
| `src/broker.ts` | `source_verify` / `source_diff` handlers; single approval verify |
| `src/handlers/source-scopes.test.ts` | Unsupported/supported recipe, diff artifact, honest `validated_only` |

---

## Migration and lifecycle evidence

- Fresh `nuclear.db` migrates to **v16** with `change_proposals` and `change_proposal_events`.
- Both tables receive `entity_uuid` + `data_classification` via targetable registry.
- Lifecycle: `draft → proposed → awaiting_ashley_position → awaiting_doc_decision → approved|rejected|deferred|…|stale_base|quarantined`.
- Immutable metadata-only events on every transition; forbidden payload keys rejected.
- `doc_decision: approve` does **not** authorize broker tasks (`docDecisionAuthorizesBroker` → false).
- External outcome recorded only from `approved` state (post-hoc operator note).

---

## Source isolation and broker receipts

- Broker client dispatches only through framed IPC types (`artifact.read`, `task.submit`, `task.receipt`, `task.result.fetch`).
- `source_prepare` returns honest `validated_only` (extraction still deferred per 07b).
- `source_verify` uses broker-owned recipes; unsupported recipe → `unsupported` state.
- `source_diff` produces patch artifact ref through broker store only.
- `verified` is system-derived from receipt state, exit code, and hash match — never from model claims.
- Archive excludes `.git/`, `node_modules/`, `.env`, etc.; aggregate limit enforced (`archive_too_large`).
- Patch guard rejects absolute paths, `..`, binary patches, and live/sensitive paths.

---

## Owner HTTP surfaces

| Endpoint | Purpose |
|----------|---------|
| `GET /nuclear/change-proposals?owner_id=` | List metadata |
| `GET /nuclear/change-proposals/:entityUuid?owner_id=` | Record + events |
| `POST /nuclear/change-proposals/ashley-position` | Ashley position |
| `POST /nuclear/change-proposals/doc-decision` | Doc approve/reject/defer |
| `POST /nuclear/change-proposals/external-outcome` | Post-hoc committed/deployed/abandoned |

All require owner authentication. No raw patch/receipt bytes in default responses.

---

## Guarantees (this wave)

1. No live checkout, identity, capability, or deployment mutation from proposal approval.
2. MIGRATION_16 is `nuclear.db` only — no `continuity.db` schema changes.
3. Broker boundary frozen — repo `package.json`/npm scripts are not execution authority.
4. Honest `unsupported` / `validated_only` when broker capability is unavailable.
5. Secret-shaped proposal text quarantined fail-closed.
6. Stale base blocks verification when commit or tree hash drifts.

## Non-guarantees

- End-to-end archive extraction in broker (`source_prepare` extraction still deferred).
- Production broker socket, Mint install, or live Discord proposal command.
- Auto-commit, auto-deploy, or capability promotion from proposals.
- Wave 09 vault or external-action broker.

---

## Sign-off

- Doc sign-off phrase: **"Accept Wave 08b"**
- Signed by: Doc
- Date: **2026-08-04**
- Result: Wave 08b is **Wave_accepted**, not **Release_qualified**.
- This sign-off does not authorize Mint installation, production broker wiring, auto-commit/deploy, `apply`, commit, push, or deploy.
