# Wave 07 Design Gate Packet

**Wave:** 07 — Sandbox OS Boundary (exec broker)
**Type:** Design only (no implementation)
**Status:** **Design_accepted** — Doc sign-off recorded 2026-08-04
**Not authorized:** Wave 07b Mint install, `ashley-sandbox` user creation, network, **Wave_accepted**, **Release_qualified**, **Deployed**, `apply`, commit, push, or deploy

---

## Scope

Design document [`Sandbox_Design.md`](../Sandbox_Design.md) specifying:

- Threat model and trust boundaries (`ashley-sandbox` UID separation)
- Approval-signer path and owner Ed25519 envelope governance
- Continuity tombstone signing and exact `{entityUuid, artifactRef}` forget targeting
- IPC authority matrix (chunked artifacts, signed scopes, safety exceptions)
- Broker execution policy (allowlisted interpreters, PGID isolation)
- Resource enforcement (1 concurrent task, 384M service cap, no auto-reexecute)
- systemd/socket/tmpfiles ACL spec (`ProtectProc=invisible`, `RestrictNamespaces=yes`)
- `source_prepare` addendum for Wave 08 consumer scopes

**Out of scope:** broker code, fake-broker tests, Mint user/service install, execution capability name (TBD), vault/credentials (Wave 09).

---

## Design checklist

| Requirement | Present in design doc |
|-------------|----------------------|
| Separate exec broker trust domain (`ashley-sandbox`) | Yes — §1, §7 |
| Signed owner approval; no inferred authorization | Yes — §2 |
| Canonical envelope + replay/expiry/revocation | Yes — §2.1, §2.3 |
| Continuity tombstone exact targeting | Yes — §2.2, §5 |
| IPC matrix; chunked artifact upload/download | Yes — §3 |
| Path/symlink/executable/network denial | Yes — §4, §7 |
| Cancellation, timeout, OOM, restart recovery | Yes — §6 |
| No auto-reexecution after crash | Yes — §6 |
| Credential-free; vault deferred to Wave 09 | Yes — §8 |
| Wave 07b gated on Wave 06 **Wave_accepted** + Wave 07 **Design_accepted** | Yes — Scope and gates |

---

## Cross-link verification

| Source | Links to `Sandbox_Design.md` |
|--------|------------------------------|
| [`AGENTS.md`](../../AGENTS.md) | Yes |
| [`Vision_Implementation_Map.md`](../Vision_Implementation_Map.md) | Yes — Wave 07 section + program map |
| [`Architecture_Index.md`](../Architecture_Index.md) | Yes — Sandbox section |
| [`Self_Modification_Design.md`](../Self_Modification_Design.md) | Yes — back-link |
| [`External_Agency_Design.md`](../External_Agency_Design.md) | Yes — exec broker separation |

---

## Guarantees (design phase)

- OS-boundary execution is specified as a dedicated broker UID with Unix socket IPC.
- Every mutating operation requires signed owner approval except documented safety/cleanup exceptions.
- Forget applies exact tombstone targets only; no topic inference at broker.
- Wave 07b may proceed as implementation only (fake broker / temp roots); Mint install remains separately authorized.

## Non-guarantees (design phase)

- No runtime broker, schema, or tests — design only.
- No `ashley-sandbox` user, systemd install, or live Mint validation.
- Design acceptance does not authorize **Wave_accepted**, release qualification, deploy, or `apply`.
- Wave 08b and Wave 09b remain blocked until Wave 07b is **Wave_accepted** (and other predecessor gates).

## Deferrals

| Item | When |
|------|------|
| Broker code, schema, fake-broker tests | Wave 07b — fake broker and temporary roots only |
| Mint user, socket/service units, install | Separate operator authorization |
| `source_prepare` scope + toolchain manifest | Wave 07b (Wave 08 consumer) |
| Vault / external dispatch | Wave 09 — separate broker |

---

## Sign-off

- Doc sign-off phrase: **"Accept Wave 07 design"**
- Signed by: Doc
- Date: **2026-08-04**
- Result: Wave 07 is **Design_accepted** only.
- This sign-off authorizes Wave 07b **implementation planning and local testing** (fake broker / temp roots). It does not authorize Mint user/service install, network, commit, push, deploy, `apply`, or **Wave_accepted**.
