# Wave 09b Gate Packet

**Wave:** 09b — External agency (implementation)
**Type:** Implementation verification
**Status:** **Wave_accepted** — Doc sign-off recorded 2026-08-04; not **Release_qualified**
**Not authorized:** **Release_qualified**, **Deployed**, Mint user/service install, production broker socket wiring, real network adapters, real credentials, `apply`, commit, push, or deploy

---

## Preflight

| Check | Result |
|-------|--------|
| Wave 06 **Wave_accepted** | Yes — 2026-08-04 |
| Wave 07b **Wave_accepted** | Yes — 2026-08-04 |
| Wave 08b **Wave_accepted** | Yes — 2026-08-04 |
| Wave 09 **Design_accepted** | Yes — 2026-08-04 |
| `VISION.md` unchanged | Yes |
| Exec broker frozen (`source_*` only; credential-free) | Yes |

---

## Command transcript

| Command | Exit code | Result |
|---------|-----------|--------|
| `npm test --prefix apps/external-broker` | 0 | **PASS** — 5 files, 21 tests |
| `npm run build --prefix apps/external-broker` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/sandbox-broker` | 0 | **PASS** — 14 files, 52 tests |
| `npm run build --prefix apps/sandbox-broker` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/agent-service` | 0 | **PASS** — 45 files, 228 tests |
| `npm run build --prefix apps/agent-service` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/discord-bot` | 0 | **PASS** — 71 tests |
| `npm run build --prefix apps/discord-bot` | 0 | **PASS** — `tsc` clean |
| `npm run phase0:offline` | 0 | **PASS** — "OK offline tier" |
| `git diff --check` | 0 | **PASS** — CRLF normalization warnings only |

**Skipped platform checks:** real `SO_PEERCRED`, systemd socket units, PGID process-group kill, `ashley-external` user creation, live Mistral, Discord gateway, Mint SSH, production vault paths.

---

## Changed files (Wave 09b scope)

### apps/external-broker — new package

| Path | Role |
|------|------|
| `src/crypto/` | `ASHLEY-EXTERNAL-POLICY-v1` + `ASHLEY-EXTERNAL-DISPATCH-v1` Ed25519 verify; forget tombstones |
| `src/vault/store.ts` | AES-256-GCM ciphertext store; operator-only ingest; session handles |
| `src/adapters/fake-local-v1.ts` | No-network fake adapter (read/draft/send_private/send_public + failure/reconcile scenarios) |
| `src/adapters/registry.ts` | `fake-local-v1` qualified; real adapters `unavailable` |
| `src/policy/evaluator.ts` | Deterministic policy re-eval; hard deny `password_change` / `account_delete` |
| `src/dispatch/fsm.ts` | Dispatch FSM including `reconciliation_required`, `outcome_unknown` |
| `src/broker.ts`, `src/index.ts` | Dispatcher, `createBroker`, `MemoryTransport` |
| `*.test.ts` | Policy, dispatch, vault, fake adapter, integration (21 tests) |

### agent-service — MIGRATION_17 + external-agency module

| Path | Role |
|------|------|
| `src/core/external-agency/migration-17.ts` | `external_actions`, `external_action_events`, `external_entity_notes`, `vault_credential_index`, `external_agency_state` DDL |
| `src/core/external-agency/types.ts` | Risk classes, action kinds, FSM states, allowed event payload keys |
| `src/core/external-agency/store.ts` | CRUD + append-only metadata-only events |
| `src/core/external-agency/lifecycle.ts` | FSM transitions; cancel from `reserved`; reconcile outcomes |
| `src/core/external-agency/policy.ts` | Policy engine, hard denies, emergency stop, capability gate |
| `src/core/external-agency/disclosure-gate.ts` | Pre-dispatch public privacy via `privacy/disclosure` |
| `src/core/external-agency/signing.ts` | Policy authorize envelope builder |
| `src/core/external-agency/broker-client.ts` | Transport boundary (`BrokerClientTransport`) |
| `src/core/external-agency/entity-notes.ts` | ETH-EXT untrusted entity notes |
| `src/core/external-agency/emergency-stop.ts` | SC-EMG owner-scoped stop state |
| `src/core/external-agency/events.ts` | Metadata-only payload sanitization |
| `src/core/external-agency/wave09b.test.ts` | Migration, targeting, policy, lifecycle, disclosure, emergency stop (12 tests) |
| `src/core/db.ts` | MIGRATION_17 block; `NUCLEAR_SUPPORTED_VERSION = 17`; external capability seed |
| `src/core/continuity/nuclear-targetable.ts` | Register four v17 targetable tables (not `external_agency_state`) |
| `src/core/rollout/capabilities.ts` | `external_observe`, `external_prepare`, `external_private`, `external_public` |
| `src/core/runtime.ts` | Owner-scoped external action/account/cancel/reconcile/revoke/emergency-stop methods |
| `src/server.ts` | Owner HTTP `/nuclear/external/*` surfaces |
| `src/core/db.test.ts` | v17 schema + external table inventory |
| `src/core/change-proposal/wave08b.test.ts` | Schema version expectation → 17 |
| `src/core/continuity/wave05-migration.test.ts` | Version bump to 17 |
| `src/core/continuity/wave06-migration.test.ts` | Version bump to 17 |

---

## Migration and lifecycle evidence

- Fresh `nuclear.db` migrates to **v17** with five new tables.
- **Four** tables registered for exact forget targeting: `external_actions`, `external_action_events`, `external_entity_notes`, `vault_credential_index`. `external_agency_state` is owner-scoped operational state and is **not** targetable (per `wave09b.test.ts`).
- Targetable tables receive `entity_uuid` + `data_classification` via registry.
- Four external capabilities seeded at `observe`: `external_observe`, `external_prepare`, `external_private`, `external_public`.
- FSM: `drafted → policy_checked → reserved → dispatching → receipt_received → committed|partially_delivered|aborted|…|reconciliation_required|outcome_unknown`.
- Immutable metadata-only events; forbidden payload keys rejected.
- `docDecisionAuthorizesExternalDispatch` → always false.

---

## External broker invariants (design §13)

| Invariant | Evidence |
|-----------|----------|
| Unsigned `observe`/`prepare` rejected | `external-broker` policy/dispatch tests; `wave09b.test.ts` unsigned policy rejection |
| Private/public/irreversible need owner + policy auth | `broker.integration.test.ts`; dispatch crypto tests |
| `password_change` / `account_delete` hard deny | `policy/evaluator.ts`; policy tests |
| `doc_decision` never dispatches | `policy.ts` `docDecisionAuthorizesExternalDispatch` |
| Fake adapter ≠ real adapter availability | `adapters/registry.ts` returns `unavailable` for non-fake adapters |
| No plaintext secrets in model/IPC/HTTP/events/logs | Metadata-only events; vault errors do not echo secrets |
| No vault in sandbox-broker | Package isolation; sandbox-broker unchanged for vault |
| Emergency stop blocks new dispatch | `emergency-stop.ts` + `wave09b.test.ts` |
| Exec-broker isolation | Separate packages; no vault import from sandbox-broker |

**Deferred (not blocking Locally_verified):** `RevokeEnvelope` / `ReconcileEnvelope` broker handlers (types exist; no handlers yet).

---

## Owner HTTP surfaces

| Endpoint | Purpose |
|----------|---------|
| `GET /nuclear/external/actions?owner_id=` | List actions + emergency-stop flag |
| `GET /nuclear/external/actions/:entityUuid?owner_id=` | Action record + events |
| `GET /nuclear/external/accounts?owner_id=` | Vault credential metadata index |
| `POST /nuclear/external/actions/:entityUuid/cancel` | Cancel reserved action |
| `POST /nuclear/external/actions/:entityUuid/reconcile` | Reconcile outcome |
| `POST /nuclear/external/credentials/:credentialRef/revoke` | Revoke credential ref |
| `POST /nuclear/external/emergency-stop` | Set/clear emergency stop |

Routes use existing `requireOwner` pattern. Responses are metadata-only — no raw payload bytes, credentials, or outbound content text.

---

## Guarantees (this wave)

1. Separate `apps/external-broker` package with fake-local-v1 adapter only; real adapters unavailable.
2. MIGRATION_17 is `nuclear.db` only — no `continuity.db` schema changes.
3. Dual authorization boundary: policy envelope + owner dispatch envelope verified in broker.
4. Public disclosure gate runs before public dispatch; `ALL_ETH_PUB_PROTECTED` enforced in tests.
5. Sandbox-broker remains credential-free and frozen — no vault or external dispatch scopes added.
6. External capabilities default to `observe`; no `apply` promotion performed.

## Non-guarantees

- **HTTP route authentication** — routes are wired with `requireOwner`, but no supertest/HTTP integration tests were run; owner-auth on `/nuclear/external/*` is **not verified** at this gate.
- Production `ashley-external` user, systemd units, or socket paths.
- Real network adapters, live destinations, or operator vault ingress on Mint.
- Cross-package agent↔broker `MemoryTransport` round-trip from agent-service (broker package has its own integration tests; agent uses `BrokerClientTransport` interface).
- `RevokeEnvelope` / `ReconcileEnvelope` broker handlers.
- Auto-dispatch from model output or `doc_decision` alone.
- Discord commands for external actions.

---

## Sign-off

- Doc sign-off phrase: **"Accept Wave 09b"**
- Signed by: Doc
- Date: **2026-08-04**
- Result: Wave 09b is **Wave_accepted**, not **Release_qualified**.
- This sign-off does not authorize Mint installation, production broker wiring, real credentials, `apply`, commit, push, or deploy.
