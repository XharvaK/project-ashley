# Model Fabric MF-M2 through MF-ACT implementation plan

> Execute from the frozen baseline `12b6b022c56321c8104d556fdd8a35a95419a51c` in the isolated `model-fabric-m2-act-autopilot` worktree. Keep all target routing, owner artifacts, Mint qualification, deployment, promotion, and push out of scope.

## Contract and verification rules

- Follow `docs/architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md` in order: SLICE 0, MF-M2, MF-M3, MF-M4, MF-M5, MF-M6, MF-ACT.
- Use test-first characterization and falsification for each new behavior. Add or modify a focused test, observe the failure, then implement the smallest coherent change.
- Use focused differential verification only: directly changed tests, Model Fabric, routing/adapters, exact contract regressions, touched-package builds, and `git diff --check`.
- Preserve current behavior and all role/route/occupant distinctions. Treat `target-12-9` as declared data only. Do not create production `OwnerApprovalRef` or `ActivationRef` artifacts.
- Commit each completed slice locally. Stage only named paths. Do not push, deploy, restart Mint, or mutate the original checkout.

## Execution steps

1. Preserve the clean frozen worktree and record current source facts, caller inventory, focused baseline results, and known unrelated baseline failures.
2. **SLICE 0:** add R1/R2 regression tests; repair failure-finalize fallback class, transport truth, and Mistral SDK retry configuration. Verify Thought failover, Expression fallback eligibility, SDK-shaped HTTP failures, fetch connection failures, one request per attempt, and receipt stage validity.
3. **MF-M2:** add the complete versioned `config/model-fabric/` CURRENT portfolio, target declaration, reasoning translation, and immutable snapshot hashing. Add a typed resolver that selects current rows by logical role and occupancy, records explicit route/model overrides, preserves observation/reflection/engineering scars, and never loads target data on dispatch. Route Attention/admission and `completeChat` through the CURRENT snapshot without changing occupants or failover semantics. Extend routing status with portfolio, row, occupant, admission, health, and configured/dispatched facts.
4. **MF-M3:** add catalog data and typed lifecycle/binding/qualification readers under `config/model-fabric/catalog/` and local control-artifact support. Enforce discovered → unqualified only for discovery, immutable qualification citations, fingerprint/epoch/invalidated checks, independence groups, ordered-versus-unordered occupants, and non-user-visible evaluation seats. Keep all target rows unroutable.
5. **MF-M4:** add the raw OpenCode Zen chat-completions adapter with exactly one POST per attempt, no tools/MCP/worker behavior, capability/privacy fail-closed checks, environment-key absence tolerance, and dark registration. Prove core Thought/Expression compatibility and Groq Thought failover remain unchanged.
6. **MF-M5:** add process-local health predicates and cooldown state, approved ordered-chain walking, coupling-aware status projections, and fail-closed behavior for missing/unqualified/unhealthy occupants. Never shop arbitrary cheaper models, rewrite policy files, or route compatibility Thought/Expression through target rows.
7. **MF-M6:** add the generic specialist-seat catalog/resolver and executed-session boundary. Resolve only approved active occupants for explicit specialist requirements; keep `routine_validation` / Nemotron Lightning dark without owner artifacts; never fabricate a specialist session; keep engineering direct cognition on its existing Expression-quota path.
8. **MF-ACT:** add immutable artifact schemas/readers, validation, atomic active-pointer replace, coupling preflight, stale/revoked fail-closed fallback, rollback provenance, and an owner-authenticated writer boundary. Test only clearly non-production fixtures. Ensure missing/unreadable pointers select CURRENT compatibility and no target row can become active without both owner acts.
9. After every slice, run the focused differential pack for the touched modules, the agent-service build, and `git diff --check`; classify failures as implementation regressions, baseline defects, environment limitations, or scope blockers before changing code.
10. Perform a cold second-pass review against the frozen contract, inspect the final diff and staged scope, update the Model Fabric checkpoint/status documents with exact local evidence, commit each slice, and finish with zero target activation and no production claims.

## Completion criteria

- All seven slices are locally implemented, focused-tested, built, reviewed, and checkpointed.
- The CURRENT portfolio is the only production dispatch authority and preserves the frozen live occupants and scars.
- Target catalog/portfolio, Zen, health, specialist, and activation machinery are present but dark unless separately owner-qualified and activated.
- No production `OwnerApprovalRef`, `ActivationRef`, Mint qualification, deployment, promotion, or push is performed.
- Final reporting includes exact commit SHAs, focused test totals, build/diff evidence, baseline classifications, review result, open qualification/activation gates, and the required Model Fabric completion state.
