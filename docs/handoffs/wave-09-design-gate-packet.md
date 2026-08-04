# Wave 09 Design Gate Packet

**Wave:** 09 — Account and External-Action Broker
**Type:** Design only (no implementation)
**Status:** **Design_accepted** — Doc sign-off recorded 2026-08-04
**Not authorized:** Wave 09b implementation, vault, policy engine, fake adapter, network adapters, **Wave_accepted**, **Release_qualified**, **Deployed**, or `apply`

---

## Scope

Design document [`External_Agency_Design.md`](../External_Agency_Design.md) specifying:

- Separate external-action broker trust domain (`/var/lib/ashley-external/`)
- Dual authorization (`external_policy_authorize` + `external_dispatch`)
- Immutable content binding (`payloadRef`/`payloadHash`, `policyDecisionToken`, `evaluatorBuildId`)
- Operator-only local vault ingress (`vault.ingest.operator`)
- Public-privacy pre-dispatch (wired to existing `privacy/classification.ts`, `privacy/disclosure.ts`)
- Dispatch FSM with `reconciliation_required` (non-terminal), `reconciliation_expired`, `outcome_unknown`
- Fake adapter only in v1 (`fake-local-v1`)
- External-entity contract (`ETH-EXT-*`)
- Owner-only surfaces + emergency stop (`SC-EMG-*`)
- MIGRATION_17 spec (design only)

**Out of scope:** vault code, MIGRATION_17, capabilities, real credentials, network adapters, fake-adapter implementation, `apply`, deploy.

---

## Design checklist

| Requirement | Present in design doc |
|-------------|----------------------|
| Separate trust domain (external vs exec sandbox) | Yes — §1 |
| Policy auth required for all risk classes including observe/prepare | Yes — §3, §4 |
| Owner `external_dispatch` for private/public/irreversible | Yes — §4.2 |
| `policyDecisionToken` + `evaluatorBuildId`; broker re-run, no `nuclear.db` | Yes — §4.1 |
| Operator-only vault ingress; no HTTP middleware | Yes — §5.1 |
| Broker-internal session handles only | Yes — §5.2–5.3 |
| Public-privacy pre-dispatch gate | Yes — §6 |
| Reconciliation FSM; not falsely `aborted` | Yes — §7 |
| Fake adapter only; real adapters unavailable | Yes — §8 |
| External-entity note schema | Yes — §9 |
| Owner-authenticated endpoints | Yes — §10 |
| Wave 09b requires Wave 06, Wave 07b, and Wave 08b **Wave_accepted** (done), plus Wave 07 and Wave 09 **Design_accepted** | Yes — Scope and gates |

---

## Cross-link verification

All links verified present at packet creation:

| Source | Links to |
|--------|----------|
| [`AGENTS.md`](../../AGENTS.md) | `Sandbox_Design`, `Self_Modification_Design`, `External_Agency_Design` |
| [`Vision_Implementation_Map.md`](../Vision_Implementation_Map.md) | Waves 07–09 sections + program map rows |
| [`Architecture_Index.md`](../Architecture_Index.md) | Governance table + sandbox/self-mod/external sections |
| [`Sandbox_Design.md`](../Sandbox_Design.md) | `Self_Modification_Design`, `External_Agency_Design` back-links |
| [`Self_Modification_Design.md`](../Self_Modification_Design.md) | `Sandbox_Design`, `External_Agency_Design` back-links |
| [`External_Agency_Design.md`](../External_Agency_Design.md) | `Sandbox_Design`, `Self_Modification_Design`, ethics/stewardship |

Design files confirmed to exist:

- [`docs/Sandbox_Design.md`](../Sandbox_Design.md)
- [`docs/Self_Modification_Design.md`](../Self_Modification_Design.md)
- [`docs/External_Agency_Design.md`](../External_Agency_Design.md)

---

## Guarantees (design phase)

- Authority boundaries between exec broker, external broker, and agent-service are specified.
- Every dispatch requires signed policy authorization; higher-risk actions additionally require owner signature.
- Vault plaintext cannot enter via agent IPC, HTTP middleware, or exec workspace.
- Uncertain external outcomes use honest reconciliation states, not false success/failure claims.
- Wave 09b implementation is explicitly gated behind Wave 06, Wave 07b, and Wave 08b **Wave_accepted**, plus Wave 07 and Wave 09 **Design_accepted**.

## Non-guarantees (design phase)

- No runtime enforcement — design only.
- No vault, policy engine, fake adapter, or MIGRATION_17 implementation.
- No real network adapters or credential storage.
- Design acceptance does not authorize implementation, `apply`, Mint action, release qualification, or deploy.
- Wave 09 design is **Design_accepted**; Wave 06, Wave 07b, and Wave 08b implementation gates still govern any 09b work.

## Deferrals

| Item | When |
|------|------|
| MIGRATION_17, vault, policy engine, fake adapter | Wave 09b after Wave 06, Wave 07b, and Wave 08b **Wave_accepted** (Wave 07 and Wave 09 **Design_accepted** may already be done) |
| Real adapters | Post-09b when Doc names destination |
| Vault in exec sandbox | Never |

---

## Sign-off

- Doc sign-off phrase: **"Accept Wave 09 design"**
- Signed by: Doc
- Date: **2026-08-04**
- Result: Wave 09 is **Design_accepted** only.
- This sign-off does not authorize Wave 09b implementation, vault, policy engine, fake adapter, network adapters, `apply`, Mint action, release qualification, or deploy.
