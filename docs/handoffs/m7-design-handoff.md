# Sandbox V2 M7 — Design Handoff

**Status:** Design handoff only. This file does not authorize M7 implementation
by itself, physical qualification, capability promotion, deployment, or
production acceptance. Canonical authority is roadmap §15 plus External Effect
and Authority. This handoff restates those contracts. It does not redesign M7.

**Date:** 2026-08-23

**Predecessor:** M6 local settlement recorded in
[`m6-local-settlement.md`](m6-local-settlement.md). Implementation-track entry
is M6 `INDEPENDENTLY REVIEWED`. Production-acceptance predecessor remains M6
`PRODUCTION ACCEPTED` plus accepted design for the named profile.

**Authority:**
[`ASHLEY_SANDBOX_V2_ROADMAP.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md)
§15 and
[`External_Effect_and_Authority_Architecture.md`](../architecture/External_Effect_and_Authority_Architecture.md).

There is no dedicated `ASHLEY_SANDBOX_V2_M7_DESIGN.md`. If implementation would
require a new effect class, destination host, Git mutation, network, credential,
or apply semantics not already named below: stop. Do not invent them.

---

## Frozen M7 question

> Can Ashley cross one named engineering border by exporting a sealed M5
> candidate artifact to an operator-controlled review location, under
> independently authorized destination and artifact scope, with receipt and
> effect witness kept distinct?

```text
NAMED EFFECT != GENERAL AUTHORITY
CAPABILITY != AUTHORITY
REQUEST != EFFECT
RECEIPT != EFFECT WITNESS
M5 SEALED ARTIFACT != ASHLEY
PATCH EXPORT != APPLY
```

---

## First named effect profile

The first M7 slice is **`patch_export` only**.

Roadmap §15.5: export one sealed M5 patch to an operator-controlled review
destination. Bind source and artifact identity. Prove no live repository, Git
ref, remote, service, account, or deployment was changed.

Later profiles (`live_apply`, `git_branch_create`, `git_commit`, `git_push`,
`git_pr`, `package_acquire`, `package_install`, `artifact_publish`, `deploy`,
`restart`) remain independently unauthorized. Accepting `patch_export` does
not authorize any of them.

---

## What M6 remains responsible for

- One finite admitted sequence of already-accepted M3/M4/M5 operations.
- Independent `bounded_operation` / `operationAllowed` authority.
- Border state fixed to `none`.
- No export, apply, Git write, deploy, restart, network, or credentials.

M6 cannot manufacture M7 authority. Completing a bounded sequence does not
export a patch.

---

## What M7 newly authorizes

Exactly one named border crossing:

```text
sealed CandidateChangeSet artifact
  -> PREPARE patch_export
    -> REVALIDATE artifact identity + destination grant + authority
      -> COMMIT copy to the operator-controlled review location
        -> Receipt (mechanism copy facts)
          -> Effect Witness (read-back of the exported bytes/digest)
```

The model names the sealed artifact identity (`changesetId`) and the already
allowlisted project. It must not supply an arbitrary host destination path,
command, Git operation, network destination, or executable.

The operator binds the review location (canonical destination root) the same
way project roots are bound: host configuration, not model input.

---

## Independent authority requirements

Do not reuse M5 `candidate_authorship`, M6 `bounded_operation`,
`authorshipAllowed`, `operationAllowed`, or `engineeringAllowed` as export
authority.

`patch_export` needs:

- its own capability grant
- project destination grant (`patchExportAllowed` plus an operator-bound
  export destination root)
- exact sealed artifact identity that already exists as advisory M5 work
- current authority snapshot at PREPARE and again at REVALIDATE
- no network, credentials, Git, live-tree write, deploy, or restart

Child M5 existence of a sealed patch is artifact scope, not export permission.

---

## Effect witness requirements

A copy `Receipt` records mechanism facts (bytes written, destination
relative name, hashes, executor identity). It is not the witness.

The `EffectWitness` for this profile is claim-scoped: the file at the operator
destination contains digest X matching the sealed `patchSha256`. Read-back is
required. Transport success is not that claim.

If COMMIT may have occurred and read-back is missing or conflicts, the outcome
is `OUTCOME_UNKNOWN`. Do not repeat. Reconcile the destination.

---

## What remains forbidden after M7 first slice

- apply the patch to live or candidate trees
- merge, commit, push, branch, or open a pull request
- deploy, restart, package acquire/install
- network or credentials
- Computer Use, email, browser, purchases, accounts
- apply-to-Ashley / self-change execution
- model-selected host paths or shell argv
- treating export as promotion of Ashley
- treating M6 completion as an automatic export

---

## Relationship to M5 artifacts

M5's sealed `CandidateChangeSet` remains advisory candidate work. M7 may copy
that sealed artifact across the named border. It does not change the
change-set into Ashley, approve it, or apply it.

Stale, quarantined, or missing artifacts refuse. A receipt from M4 or M6 is
not export approval.

---

## Relationship to self-change governance

Historical Wave 08 / Self-Modification Design remains reference input for
change-set identity and approval-is-not-effect. V1 broker topology stays
retired. S1 remains specification. Exporting a patch is not self-change
execution.

---

## Relationship to later Mint qualification

M7 local settlement will mean design accepted, implemented, locally verified,
and independently reviewed. It will not mean `PHYSICALLY QUALIFIED` or
`PRODUCTION ACCEPTED`. Physical qualification of the real destination and
read-back witness remains required per profile and is batched with the later
M-series Mint campaign. Production acceptance still requires M6
`PRODUCTION ACCEPTED` plus this named profile's own ladder.
