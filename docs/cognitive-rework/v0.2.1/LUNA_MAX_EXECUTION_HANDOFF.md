# Luna Max Execution Handoff — Cognitive Rework v0.2.1

You are implementing Project Ashley Cognitive Architecture v0.2.1 using this packet. You are a strong software engineer with repository access. You must not rediscover the architecture. You must not declare `PRODUCTION_ACCEPTED`.

## Read order

Follow [README.md](README.md). **STOP** if [OWNER_BASELINE_GATE.md](OWNER_BASELINE_GATE.md) is unset.

## Repository / baseline

- Architecture-reference inspection SHA: `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` (may be detached).
- Implementation SHA: **owner-selected only**. Do not implement from a detached historical SHA.
- After selection: revalidate the source map. HARD BLOCKER 4 on material seam drift.
- Do not commit untracked junk at repo root.

## Target architecture

v0.2.1 kernel under `apps/agent-service/src/core/cognitive-v021/`. Thought is sole semantic author. Agency/kernel is executive. Discord ingress is durable and not behind Thought. Production Discord stays legacy until **configuration-only** cutover of `QUALIFIED_SHA`.

## Master phase sequence

00–08 source (08 ends in **candidate freeze**) → 09 qualification operations → 10 config cutover → 11 live witness.

Do not skip. Do not create source in 09–11. Do not start 10 without Doc cutover authority. Do not start Q5 without Doc shadow authority. Do not self-perform Q2 independent review.

## Autonomy policy

While a phase gate can pass after repair: diagnose, repair implementation, add regression, rerun, write `artifacts/PHASE_XX_GATE.md`, continue.

Do not ask Doc for TypeScript, SQL, or test-fix choices the spec resolves.

You **may** decide: test fixture data (not HY3 special cases), file splits under `cognitive-v021/`, fake `completeChat` internals for Q1 **as long as** `attentionDb` remains required, isolated rehearsal paths.

You **must stop** for owner Gates A, R, B, C, D.

## Repair policy

Implementation bugs: repair, new tests, rerun. After freeze: repair means **new SHA** and qualification restart.

**Q3 retry-storm prevention:** first meaningful live-model failure → capture raw/parsed evidence → classify implementation vs occupant → if implementation, repair locally and add a deterministic fixture, then rerun **only** the smallest affected witness family. Do not keep calling the API hoping for a pass. Quota exhaustion from blind retries is an execution defect.

Forbidden: decide()/easy bypass/honesty surgery/Expression-as-brain; HY3 regex; prompt-as-authority; dual-write in shadow; hybrid turns; qualifying Q3 on programmed settlements; sending the Q1 corpus to the live Thought API; model horse races; blind live-API retry storms; replacing Q5 with fixture replay; declaring production accepted.

## HARD BLOCKERS

Master plan list 1–23. Preserve evidence. Do not improvise architecture.

## Thought / speech invariants

- `ThoughtStepOutput` union; operation loop is real.
- `invokeThoughtComplete` uses live `completeChat` + required `attentionDb`.
- Rapid messages: `thoughtModelAttempts` may exceed 1; only accepted generation publishes.
- Published speech is `finalLicensedText` / outbox `licensedText`.
- Sidecar schema version is 1. Authority field is `relational.withdrawalActive`.

## Qualification identity

`QUALIFIED_SHA` must equal freeze SHA, HEAD, and deployed SHA.

**Architecture qualification (Q1)** is exhaustive and deterministic. **Model-inhabitation witnessing (Q3)** is a bounded witness set of the configured `thought` occupant only. Record `artifacts/QUOTA_BUDGET.md` before Q3. First meaningful live-model failure → classify implementation vs occupant → repair locally if implementation → deterministic fixture → smallest affected live family only. Do not retry-storm. Occupant change → OCCUPANT CONTRACT WITNESS, not a live Q1 rerun. Q5 real shadow and Phase 11 live Discord are higher-value real-model evidence than extra synthetic suites.

Report Q1/Q2/Q3/Q4/Q5/Q6 **separately**. No aggregate model score overrides an architecture invariant.

## Live witness

Return only:

`PRODUCTION_WITNESSED / PROPOSED_FOR_ACCEPTANCE` | `WITNESS_INCOMPLETE` | `LIVE_DEFECT_FOUND`

Grounded idle revisit is mandatory for a proposal for acceptance.

## Return format

Implementation phases, freeze SHA, separate Q1–Q6 results (not one “model pass”), quota used/prevented, shadow report, cutover result (if authorized), live witness state. No secrets.

## Objective

Correct causal architecture + software correctness + bounded proof the configured occupant can inhabit the contract + actual live cognitive competence. Automated tests are necessary and not sufficient. Exhaustive live-model benchmarking is forbidden.
