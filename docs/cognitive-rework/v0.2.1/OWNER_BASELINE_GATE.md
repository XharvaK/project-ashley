# Owner Gate A — Implementation baseline selection (law / template)

**Status:** `UNSET` — still a later human gate. Packet R5 must pass independent review **before** Doc selects a source baseline.

R5 contract fixes do **not** fill this gate and do **not** choose M / C / Other.

**This tracked file is law and a template only.** Luna must **not** write execution SHAs into it. Doing so after the bind commit would create a new commit whose HEAD is no longer the SHA written in the file (the CANDIDATE_FREEZE self-reference defect).

Actual execution identity is written once, after the bind commit, to the **ignored** file:

`docs/cognitive-rework/v0.2.1/artifacts/runtime/IMPLEMENTATION_IDENTITY.md`

See [`PACKET_BIND_MANIFEST.md`](PACKET_BIND_MANIFEST.md) and [`artifacts/runtime/README.md`](artifacts/runtime/README.md).

**Luna must not begin Phase 00 kernel code until:**

1. R5 independent review has PASSed.
2. Doc supplies `OWNER_SELECTED_SOURCE_BASELINE_SHA` in the Luna goal / explicit owner instruction (this file stays unset).
3. Luna has performed the mechanical packet bind in the manifest and written `IMPLEMENTATION_START_SHA` to the ignored identity artifact.

Luna must not guess the source baseline.

---

## Three identities (never collapse)

| Identity | Owner | Meaning |
|---|---|---|
| `APPROVED_PACKET_REVIEW_SHA` | Independent review PASS, then recorded in the ignored artifact | Exact packet/governance tree that passed review |
| `OWNER_SELECTED_SOURCE_BASELINE_SHA` | Doc (Gate A instruction) | Exact production-line source SHA to implement on |
| `IMPLEMENTATION_START_SHA` | Luna mechanical bind after Gate A | Docs-only commit that places the approved packet onto a branch created from the source baseline |

Later identities (`CANDIDATE_SHA`, `QUALIFIED_SHA`, `DEPLOYED_SHA`) are not this gate.

If Doc selects `9d50740` and Luna checks out **only** that SHA, the accepted packet is **not** in that tree. Do not invent a merge. Follow [`PACKET_BIND_MANIFEST.md`](PACKET_BIND_MANIFEST.md). Blind `git checkout APPROVED_PACKET_REVIEW_SHA --` of pre-existing governing files is forbidden.

---

## Observed git facts (verified 2026-08-29; historical)

Worktree at architecture inspection / packet-branch parent:

| Fact | Value |
|---|---|
| Architecture-reference SHA / `PACKET_BASE_SHA` | `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` |
| Packet R3 (superseded; historical) | `de1f0fab20fd2faa56609ef07630075bf78fad7f` |
| Packet R4 (superseded; historical) | `7d7a3f6bd00dfc03a33a82c7d40550cfd9ffef6d` |
| Recommended production-line tip (at R4 inspect) | `9d50740fb2709d6870e8d521cc8bff0d080cabf4` (`origin/master`) |
| Merge-base (packet parent, master) | `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` |
| Divergence | packet review branch ahead by packet-only docs commits; production line ahead by observer/docs commits |

Cognitive Discord / Thought / delivery / runtime seams (`apps/discord-bot/src/**` chat path, `runtime.ts`, `thought.ts`, `delivery/store.ts`, `mistral-client.ts`) were **unchanged** between `c7c81c4` and `9d50740` except `privacy/secrets.ts` at that inspect. Revalidate after Doc selects.

Architecture-reference SHA `c7c81c4` remains the packet’s **inspected** source map SHA until revalidation against `OWNER_SELECTED_SOURCE_BASELINE_SHA`.

---

## Choices (owner picks exactly one; after R5 PASS)

Doc names the choice in the Luna goal. Luna copies it into the ignored identity artifact. Luna does not edit this file.

### Choice M — `origin/master` / `9d50740fb2709d6870e8d521cc8bff0d080cabf4`

**Relationship to `c7c81c4`:** verified descendant; observer/docs commits.

**Risk of selecting:** production-line history includes the observer exporter and a `secrets.ts` refactor. Source map must be revalidated against `secrets.ts` and any new reserved paths. Lowest risk of implementing off a detached historical SHA.

**Packet note:** R2–R5 packet files are **not** on this SHA. Binding via the manifest is required. Do not checkout whole governing files from the packet branch.

### Choice C — detached architecture SHA `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a`

**Relationship:** architecture-reference inspection SHA. Not current `origin/master`.

**Risk of selecting:** implementing off the production-line tip. Observer pipeline and `secrets.ts` changes are absent. Later merge onto master is required. Forbidden as a silent default.

Binding is still required (packet commits are not *inside* `c7c81c4` either). Overlay against the same `PACKET_BASE_SHA` is a no-op three-way on those governing files if the selected baseline **is** the packet base.

### Choice Other

Owner names a different SHA that **must** be a verified descendant of production-line history (HARD BLOCKER 3 if not). Luna records ancestry in the ignored artifact before binding.

---

## Packet binding (mechanical; after Gate A; docs-only)

Exact commands, path modes, conflict policy, and verification report: [`PACKET_BIND_MANIFEST.md`](PACKET_BIND_MANIFEST.md).

Summary:

1. Create `feat/cognitive-v021-implementation` from `OWNER_SELECTED_SOURCE_BASELINE_SHA`.
2. Materialize `NEW_EXACT_FILE` paths from `APPROVED_PACKET_REVIEW_SHA`.
3. Three-way apply packet deltas for `EXISTING_DOC_OVERLAY` and `IGNORE_RULE_OVERLAY` against `PACKET_BASE_SHA`. Same-hunk conflict → HARD BLOCKER.
4. Commit docs/governance/`.gitignore` only.
5. `IMPLEMENTATION_START_SHA = git rev-parse HEAD`.
6. Write the ignored identity artifact. **No extra commit.**
7. Phase 00 starts. Do not require `HEAD == OWNER_SELECTED_SOURCE_BASELINE_SHA`.

Candidate ancestry must descend from `IMPLEMENTATION_START_SHA` and therefore from `OWNER_SELECTED_SOURCE_BASELINE_SHA`.

---

## Owner record template (do not fill in this tracked file)

The following is documentation of the fields Luna writes to **`artifacts/runtime/IMPLEMENTATION_IDENTITY.md`**. Leave these lines unset here forever.

```text
APPROVED_PACKET_REVIEW_SHA=<unset in this tracked file>
OWNER_SELECTED_SOURCE_BASELINE_SHA=<unset in this tracked file>
OWNER_SELECTED_SOURCE_BRANCH=<unset>
PACKET_BASE_SHA=c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a
IMPLEMENTATION_START_SHA=<unset in this tracked file>
IMPLEMENTATION_BRANCH=<unset>
SELECTED_AT=<unset>
SELECTED_BY=Doc
ANCESTRY_TO_ARCHITECTURE_SHA=<unset>
CLEAN_STATUS_REQUIRED=yes (implementation worktree; untracked junk must not be committed)
REMOTE_STATUS=<unset>
SOURCE_MAP_REVALIDATED_AT=<unset>
SOURCE_MAP_REVALIDATION_RESULT=<unset>
PACKET_BIND_DIFF_OK=<unset>
PRODUCTION_SOURCE_DIFF=NONE (required)
```

Until R5 independent review PASSES, packet **execution** status is `BLOCKED — PACKET R5 AWAITING INDEPENDENT REVIEW`.

After R5 PASSES, if Doc has not supplied the source baseline, execution is `BLOCKED_PENDING_OWNER_BASELINE_SELECTION`. After Doc supplies it, Luna binds the packet; until the ignored artifact records a verified `IMPLEMENTATION_START_SHA`, execution is `BLOCKED_PENDING_PACKET_BIND`. Then Phase 00 may start.

R5 contract fixes do **not** fill this gate and do **not** choose M / C / Other.
