# M4 Live Invocation Binding Regression Fix

**Status:** `M4 CAPABILITY ACCEPTANCE = UNCHANGED`  
**Local repair:** `M4 LIVE INVOCATION REGRESSION = REPAIRED LOCALLY`  
**Owner Discord smoke:** not yet run (this packet does not close live M4 smoke)

---

## Live smoke at incident

```text
M2 LIVE SMOKE = PASS
M3 LIVE SMOKE = PASS
M4 LIVE SMOKE = INVOCATION REGRESSION FOUND
```

M2 and M3 acceptance remain unchanged. M4 substrate and production acceptance remain unchanged. The failure occurred before M4 admission.

---

## Exact SHAs

| Role | SHA |
|---|---|
| Production / incident host | `4addc18785902845e7ee0fd05a855ff24375e987` |
| Repair candidate | the git commit that introduces this file on `cursor/m-series-local-completion-2357` |

---

## Incident turns

Thread `6fffb18c-b1cb-4655-a7c6-ddc51a148e9e`, owner Discord `212123686923272192`.

| Nuclear id | Role | UTC | Notes |
|---|---|---|---|
| 329 | user | 20:46:57 | M3: create `ashley-sandbox-smoke.txt` in the Project Ashley candidate |
| 330 | assistant | 20:47:06 | M3 PASS. Decision **1296**. Workspace `ZZZvUs-K1s43xWw4psdMOw` (`lastUsedAt=2026-08-23T20:47:01.875Z`) |
| 331 | user | 20:47:57 | Verify current candidate; mechanical outcome only; do not modify |
| 332 | assistant | 20:48:02 | FAIL. Decision **1297**, `kind=ask`. No `operationalRequest`. M4 never admitted |

Production facts: `project-ashley` `verificationAllowed=true`, sole recipe `typescript_fixture_compile_v1`, seven Project Ashley workspaces, smoke workspace uniquely newest by `lastUsedAt`.

---

## Causal trace

```text
natural-language verify current candidate
  → Thought completes
  → kind=ask (workspaceId + recipe)
  → NO candidate_verification
  → M4 never reached
```

Not an M4 executor, catalog, or admission-kernel failure.

---

## Root cause

Primary: `CONTEXT_PROJECTION_FAILURE`  
Contributing: `RECIPE_RESOLUTION_FAILURE`, `REQUEST_SCHEMA_ERGONOMICS_FAILURE`

Thought was required to copy two control-plane identities the runtime could already resolve. The owner was asked for magic words. That clarification was erroneous relative to canonical M4 architecture.

---

## Canonical owners (unchanged)

- Durable `workspaceId`: `WorkspaceManager`. M4 resumes; M4 never creates.
- Current workspace: unique newest `lastUsedAt` for the named project. Historical siblings are not owner ambiguity.
- Recipe: operator registry/catalog `allowedRecipeIds`. Thought must not invent recipes, argv, or executables.
- Verification authority: `candidate_verification` capability + `verificationAllowed` + allowlisted recipe + existing valid workspace. Workspace existence is not verification authority.

---

## Resolver semantics

Omitted `workspaceId`:

- unique newest `lastUsedAt` → bind
- none → `no_current_workspace`
- tied newest `lastUsedAt` → `ambiguous_current_workspace`

Omitted `recipeId`:

- exactly one `allowedRecipeIds` entry → bind
- none → `no_allowed_recipe`
- several → `ambiguous_recipe`

Explicit unauthorized `recipeId` → `recipe_not_allowed` (not remapped to the sole allowed recipe).  
Explicit workspace is not replaced by a newer sibling.  
Cross-project / unknown workspace fail closed.  
`listProjectWorkspaces` lists only matching project manifests; it does not create or pick.

---

## Fix

Resolution ergonomics only. No new recipes, no registry mutation, no capability promotion, no hidden default authority.

- `WorkspaceManager.listProjectWorkspaces(projectId)`
- `resolveVerificationBinding` before M4 dispatch
- optional Thought `workspaceId` / `recipeId`
- governed grounding of current workspace + allowlist
- M4 still `resumeExistingWorkspace` only

---

## Tests

Focused local: verification binding, M4 D/E/F, M3 E, WorkspaceManager, Thought parser, Honesty / OperationalTruth, context composer. `apps/agent-service` `tsc --noEmit` clean.

M4 production acceptance is not reopened by these tests.

---

## Production

Do not treat this packet as live M4 PASS. Deploy the repair SHA, then the owner repeats Discord M4 smoke without internal ids.
