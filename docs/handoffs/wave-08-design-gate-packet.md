# Wave 08 Design Gate Packet

**Wave:** 08 — Self-inspection and change proposals
**Type:** Design only (no implementation)
**Status:** **Design_accepted** — Doc sign-off recorded 2026-08-04
**Not authorized:** **Wave_accepted**, **Release_qualified**, **Deployed**, Mint broker install, auto-commit/deploy, `apply`, commit, push, or deploy

---

## Scope

Design document [`Self_Modification_Design.md`](../Self_Modification_Design.md) specifying:

- Change-proposal record schema (`change_proposals`, `change_proposal_events`)
- Consultation and routing matrix (advisory vs organic learning vs identity review)
- Source isolation workflow consuming Wave 07b broker IPC
- Broker-owned verification recipes (`source_edit`, `source_verify`, `source_diff`)
- Owner-authenticated review HTTP surfaces
- Provenance, classification, retention, and exact forget behavior
- Wave 08b test matrix (spec)

**Out of scope:** MIGRATION_16 runtime code, agent-service module, Mint broker install, auto-commit/deploy, Wave 09 vault.

---

## Doc review conditions (carry into 08b)

Recorded 2026-08-04 — design recommended for acceptance subject to:

| # | Constraint |
|---|------------|
| 1 | **No overclaimed broker capability** — safe `source_prepare` extraction or honest `unsupported`; never bypass 07b deferral |
| 2 | **Frozen broker boundary** — `source_edit` / `source_verify` / `source_diff` use broker-owned recipes only; repo `package.json`/npm/lifecycle hooks untrusted |
| 3 | **Routing distinctions preserved** — ordinary identity → `learning_revisions`; foundational → `identity_reviews` link; proposal approval never mutates identity, capabilities, live repo, or deployment |
| 4 | **MIGRATION_16 disciplined** — `nuclear.db` only; entity UUID, classification, retention, targetable registration, sidecar lineage hooks, exact forget; **no continuity schema changes** |
| 5 | **System-derived evidence** — `verified` from broker receipts + hash match only; model cannot certify tests |
| 6 | **Owner-scoped and secret-safe** — no raw patches, credentials, source, or test output in events/logs/default HTTP |
| 7 | **Explicit limit/unsupported states** — `archive_too_large`, `unsupported`, `stale_base`, `quarantine` are real outcomes, not hidden failures |

Full text: [`Self_Modification_Design.md` §13](../Self_Modification_Design.md).

---

## Design checklist

| Requirement | Present in design doc |
|-------------|----------------------|
| Three-path separation (revisions / identity reviews / change proposals) | Yes — §2 |
| MIGRATION_16 schema spec (not implemented) | Yes — §3 |
| Lifecycle state machine + immutable events | Yes — §3, §10 |
| Consultation routing matrix | Yes — §4 |
| Source isolation via broker; live checkout read-only on agent side | Yes — §5 |
| Broker scopes: `source_prepare`, `source_edit`, `source_verify`, `source_diff` | Yes — §6 |
| Broker-owned recipes; untrusted repo scripts | Yes — §6.1 |
| `verified` system-derived from receipts only | Yes — §6.1 |
| Owner HTTP review surfaces | Yes — §8 |
| Classification, retention, forget (entity_uuid) | Yes — §9 |
| Wave 08b gated on Wave 07b **Wave_accepted** | Yes — Wave 07b accepted 2026-08-04 |

---

## Cross-link verification

| Source | Links to `Self_Modification_Design.md` |
|--------|----------------------------------------|
| [`Sandbox_Design.md`](../Sandbox_Design.md) | Yes — `source_prepare` addendum |
| [`Vision_Implementation_Map.md`](../Vision_Implementation_Map.md) | Yes — Wave 08 section |
| [`Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md) | Yes — sequencing |
| [`External_Agency_Design.md`](../External_Agency_Design.md) | Yes — vault deferred |

---

## Guarantees (design phase)

- Advisory change proposals are architecturally separated from organic learning and foundational identity review.
- Broker authorization is envelope-only; `doc_decision: approve` records intent, not execution.
- Secret scan, stale-base, and patch-safety policies are specified fail-closed.
- Wave 07b **Wave_accepted** satisfies the broker predecessor gate for 08b planning.

## Non-guarantees (design phase)

- No MIGRATION_16, runtime module, HTTP routes, or tests at design phase — implementation is Wave 08b.
- No claim that 07b `source_prepare` extraction is production-ready (07b defers extraction).
- **Design_accepted** authorizes Wave 08b implementation planning and local testing only — not **Wave_accepted**, Mint install, or production wiring.

---

## Doc sign-off

| Field | Value |
|-------|-------|
| Phrase | **Accept Wave 08 design** |
| Date | 2026-08-04 |
| Conditions | §13 constraints in [`Self_Modification_Design.md`](../Self_Modification_Design.md) carry into 08b |
| Result | Wave 08 is **Design_accepted** only — Wave 08b may proceed under hard locks |

**Next gate:** Wave 08b implementation → **Locally_verified** gate packet → Doc **Accept Wave 08b** for **Wave_accepted**.
