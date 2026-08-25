# Model Fabric Autopilot — MF-M1 implementation plan

> **Execution note:** Follow the TDD and verification workflows while executing this plan. Keep the worktree isolated from the exact integrated baseline and do not push, deploy, or production-activate Model Fabric.

## Scope

Implement the currently implementation-ready Model Fabric milestone, MF-M1, from the canonical owner contract in `docs/architecture/Model_Fabric_Architecture.md` §31. Preserve all current provider, route, model, reasoning, failover, fallback, admission, and authority behavior. Re-evaluate MF-M2 through MF-M6 after MF-M1; implement a later milestone only if its implementation contract is owner-closed and complete in the canonical documentation.

## Tasks

1. Confirm `HEAD` is `5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6`, the worktree is isolated and clean, and record the current source facts.
2. Inventory every production `completeChat` caller and map its explicit logical role, requested purpose, configured route, dispatched route, specialist requirement, and current fallback behavior.
3. Run the untouched baseline build and relevant test suites. Record failures as baseline facts without changing source to make them pass.
4. Add failing contract tests for immutable route identity, capability profiles, reasoning normalization, inference-policy fingerprints, bounded `ContextProjection`, existing-compatibility admission, explicit role stamping, configured-versus-dispatched observation, stage-valid attempt receipts, invocation receipts, and caller-owned fallback chains.
5. Add failing characterization tests that preserve current Thought NIM `openai/gpt-oss-20b` low-reasoning to Groq same-model failover, Expression Mistral to Groq Qwen fallback, shared Groq 20B quota identity, no hidden retry, and the current thought-observation mismatch.
6. Implement only the smallest Ashley-owned typed seam required by those tests. Keep provider wire conversion in the existing adapters, Attention as the admission owner, Evaluation as qualification owner, and callers as semantic/result owners. Do not add a provider package, schema migration, catalog, OpenCode route, Lightning route, new fallback, or target-route activation.
7. Migrate each current production caller to provide its logical role and any descriptive specialist requirement, including `engineering` with `complex_orchestration` recorded but not selected. Keep test doubles and compatibility entry points backward-compatible where they are not production callers.
8. Run focused MF-M1 tests, the complete agent-service test suite, and the agent-service TypeScript build. Repair only validated defects caused by the implementation. Run a cold internal second-pass review against the MF-M1 witness and the explicit out-of-scope list.
9. Update the canonical MF-M1 status/checkpoint and living route status with exact source/commit/test evidence. Preserve separate states for local implementation, verification, review, qualification, release, deployment, and promotion.
10. Stage only named MF-M1 source, tests, and documentation paths; run `git diff --cached --check`; commit locally; verify the final SHA, clean status, and absence of push/deploy/activation.
11. Re-evaluate the milestone matrix. Continue only if a subsequent milestone has a complete owner-closed implementation contract. Otherwise finish with MF-M1 checkpointed and the remaining later work explicitly classified as owner-open, deferred, qualification-gated, activation-gated, or production-only.

## Done criteria

- MF-M1 has a local implementation commit from the exact requested baseline.
- Current routes and fallback behavior are characterized and unchanged by intent.
- Every receipt is stage-valid and preserves `not_sent`, `sent_outcome_unknown`, and `response_received` truth without hidden retries.
- No production promotion, deployment, or activation occurs.
- The final report states the exact commit chain, verification evidence, review result, remaining gates, and final Model Fabric program state.
