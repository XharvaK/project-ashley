# Wave 10a Gate Packet

**Wave:** 10a — Stabilization manifest and status verification
**Type:** Implementation subwave
**Status:** **Wave_accepted** — Doc sign-off recorded 2026-08-04
**Date:** 2026-08-04
**Base SHA:** `6507cb08822b0a1dc075cf567790f20b7176d1c3`
**Worktree:** `master` with pre-existing Wave 00–09b changes preserved

**Not authorized:** 10c implementation, release qualification, Mint or systemd
work, live Mistral or Discord, credentials,
network adapters, production dispatch, `apply`, commit, push, or deploy.

## Scope completed

Wave 10a turns the accepted stabilization design into a check-only local
assurance layer. It adds:

- a clause and structural traceability manifest at
  [`docs/stabilization/clause-manifest.json`](../stabilization/clause-manifest.json);
- a reviewed machine-readable status baseline at
  [`docs/stabilization/status-baseline.json`](../stabilization/status-baseline.json);
- the check-only verifier at
  [`scripts/stabilization/verify-status.mjs`](../../scripts/stabilization/verify-status.mjs);
- an agent route registry and runtime method/path drift assertion;
- a Discord command registry used by command definitions; and
- a deterministic single-worker test setting appropriate for the dual-core,
  4 GB host.

The verifier discovers status from bounded, machine-readable sources and
compares them with the reviewed baseline. It does not rewrite the baseline or
infer acceptance from prose.

## Preflight

| Check | Result |
|---|---|
| Wave 10 design | **Design_accepted** — 2026-08-04 |
| Waves 06, 07b, 08b, 09b | **Wave_accepted** — prior gates |
| Waves 07, 08, 09 | **Design_accepted** — prior gates |
| Waves 00–05 | `legacy_local`; no retroactive formal acceptance |
| `VISION.md` | unchanged |
| Scope lock | 10a only; no 10c or production work |

## Verification transcript

| Check | Result |
|---|---|
| `npm run build --prefix apps/agent-service` | Pass |
| `npm test --prefix apps/agent-service` | Pass — **231 tests** |
| `npm run build --prefix apps/discord-bot` | Pass |
| `npm test --prefix apps/discord-bot` | Pass — **71 tests** |
| `npm run verify:status` | Pass — **90 manifest entries, 72 routes, 20 capabilities, 9 commands** |
| `npm run phase0:offline` | Pass — **231 agent tests**, offline tier green |
| `git diff --check` | Pass (CRLF warnings only) |
| `git diff --quiet -- VISION.md` | Pass — no diff |

The agent test command now uses one Vitest worker and a bounded 20-second test
timeout. This makes the default command deterministic on the constrained host;
the final default invocation passed in full.

## Evidence and invariants

| Invariant | Evidence |
|---|---|
| Governance clauses are uniquely represented | 78 `SC-*`/`ETH-*` definitions plus 12 structural entries; duplicate IDs fail verification |
| Structural commitments have runtime/status anchors | Delivery, Thought, attention, perception, continuity, relationship, change-proposal, external-agency, capability, sandbox, and assurance entries are present |
| Route surface cannot silently drift | `route-surface.json` is checked against the running Express registration; server construction fails on method/path drift or duplicates |
| Command surface is explicit | `command-surface.json` is validated and supplies names used by Discord command definitions |
| Status is reproducible | The verifier discovers schema, capabilities, routes, commands, prompts, probes, and Mint service names, then compares them with the reviewed baseline |
| Evidence is safe to review | Manifest evidence is relative/reference-only and rejects absolute paths and secret-like filenames |
| Acceptance is not inferred | Accepted manifest entries require a matching gate packet reference and status; the verifier has only `--check` |

## Changed-file inventory

| Area | Files |
|---|---|
| Status assurance | `docs/stabilization/clause-manifest.json`, `docs/stabilization/status-baseline.json`, `scripts/stabilization/verify-status.mjs` |
| Agent route surface | `apps/agent-service/route-surface.json`, `apps/agent-service/src/route-surface.ts`, `apps/agent-service/src/route-surface.test.ts`, `apps/agent-service/src/server.ts` |
| Discord command surface | `apps/discord-bot/command-surface.json`, `apps/discord-bot/src/command-surface.ts`, `apps/discord-bot/src/commands/definitions.ts` |
| Constrained verification | `apps/agent-service/package.json`, `apps/agent-service/vitest.config.ts`, root `package.json` |

## Non-guarantees and deferrals

- This is **Locally_verified**, not `Wave_accepted`, `Release_qualified`, or
  `Deployed`.
- 10b deterministic evaluator/scenario closure is not implemented.
- 10c health/readiness, resource, backup/restore, and check-only Mint audits
  were outside the 10a scope; see the current 10c gate packet.
- The baseline is reviewed and check-only; no baseline regeneration workflow
  is authorized by this packet.
- Route owner-scope metadata is a reviewed registry. The runtime assertion
  verifies method/path registration, not semantic authorization behavior.
- No live Mistral, Discord gateway, Mint host, network adapter, credential, or
  production socket was used.
- Waves 00–05 remain `legacy_local` in the living protocol and are not made
  formally accepted by this packet.

## Sign-off

- Doc sign-off phrase: **"Accept Wave 10a"**
- Signed by: Doc
- Date: **2026-08-04**
- Result: Wave 10a is **Wave_accepted**; 10b implementation is authorized.

This acceptance does not authorize 10c, release qualification, Mint or live
work, `apply`, commit, push, or deploy.

## Next gate

Wave 10b must stop at `Locally_verified` pending the exact phrase:

**Accept Wave 10b**

That acceptance authorized 10b only. Wave 10c requires separate 10b
acceptance. It did not authorize release qualification, Mint or live work,
`apply`, commit, push, or deploy.
