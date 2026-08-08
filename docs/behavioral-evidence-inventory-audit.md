# Behavioral Evidence Inventory Audit

Scope: every read and write of behavioral evidence in `apps/agent-service` that
can influence Ashley's behavior, and the influence gate (or lack of gate) on
each. Verified against source on 2026-08-08. Related: `rollout-execution-influence-audit.md`.

## Reading model

The active read path is the "influence gate" of the system: recordings land in
observe mode, but a recorded table only *influences* behavior when the owning
capability can influence (master `apply` + per-capability release). Writers that
persist evidence are mostly ungated; readers that surface evidence into Thought
are gated. The one true writer gate is learning **application** (never
proposal).

## Writers (who writes, and with what gate)

| Writer | Evidence written | Gate |
|--------|------------------|------|
| `cognition/worker.ts` exchange job | `episodes` (always) + `cognitive_runs` | ungated (recall evidence) |
| `cognition/worker.ts` | `learning_revisions` **proposals** | ungated (proposal is observe-safe) |
| `cognition/worker.ts` (`applyEligibleRevisions`) | revisions → `identity_entries` / `opinions` **applied** | `mode === "apply"` AND `canInfluence("learning")` (worker.ts:419-421) |
| `cognition/worker.ts` | `mem_facts` + `evidence_links` | mode apply + `learning` + explicit + confidence ≥ 0.8 + quote containment/overlap (worker.ts:354-387) |
| `cognition/worker.ts` | `mind_state_items` | mode apply + `canInfluence("mind_state")` (worker.ts:388-410) |
| `cognition/worker.ts` | `mutual_commitments` proposal | mode apply + `mind_state` + mutual co-planning + `relationshipCanRecord` (worker.ts:392-402) |
| `cognition/worker.ts` | affect (`applyAffectiveEvent`) | mode apply + `canInfluence("affect")` (worker.ts:411-418) |
| `curiosity/reads.ts` `performGroundedReads` | `cur_reads` + `consolidate_curiosity` job | ungated (curiosity tick; `env.curiosityEnabled`) |
| `curiosity/consolidate.ts` | `cur_takes` (read_record) + `evidence_links` | **ungated** |
| `curiosity/consolidate.ts` | `learning_revisions` interest/opinion proposals, `questions` | `canInfluence("curiosity_consolidation")` (worker.ts:273 → consolidate.ts:157) |
| `curiosity/consolidate.ts` | `cur_source_candidates` (proposed) | **ungated** |
| `curiosity/sources.ts` (`processSourceProbation`) | candidate → active `cur_sources` | `canInfluence("source_discovery")` (tick.ts:158) |
| `writers.ts` `writeFromUserTurn` | pinned `mem_facts`, heuristic `questions` | ungated (explicit user intent) |
| `learning/revisions.ts` `revertRevision` / `reconcileUnsupportedRevisions` | rollback | explicit call sites only |
| relationship tables (schema v14) | `doc_reminders`, commitments, etc. | record in observe; influence needs `relationship_state` apply |

## Readers (who reads, and with what gate)

| Reader | Evidence read | Gate |
|--------|---------------|------|
| `agency/motivations.ts:194-219` | `cur_takes` as take motivations | `canInfluence("reading")` AND `canInfluence("curiosity_consolidation")`; `evidenceKind === "read_record"` only |
| `agency/motivations.ts:242-274` | `mind_state_items` | `canInfluence("mind_state")` |
| `agency/motivations.ts:344-370` | due `doc_reminders` | proactive only + `relationshipCanInfluence(apply, "relational_initiative")` + claim |
| `agency/motivations.ts:142-192` | `questions`, `mem_facts`, `opinions` | **ungated** |
| `agency/motivations.ts:303-342` | stable `boundary.*` identity entries | ungated; relevance-licensed (reactive) / suppress-only (proactive) |
| Thought (decide.ts:174-204 + thought.ts:230-244) | evidenceRef allowlist: message, episode, fact, question, opinion, take, identity, mind_state | refs must already exist as persisted motivation refs; allowlist enforced at both deterministic and model Thought |
| `memory/assemble.ts` `assembleMemoryBlock` | hot conversation + Thought-selected evidence | hot window ungated; evidence refs gated upstream |
| `context-composer.ts:42-59` | stable identity block | **ungated** (always in system prompt) |
| `context-composer.ts:61-86` | mind state + affect blocks | items gated `mind_state`; affect gated `affect` |
| `context-composer.ts:141-143` | open questions | **removed** — no global question dump; questions only via Thought-selected evidence |
| `agency/own-time-report.ts:193-218` | eligible report takes | `read_record` + `evidence_links` + in-window + not already reported; influence gated `own_time_report` (own-time-report.ts:394) |
| `agency/decide.ts:294-331` `attachAuthorizedClaims` | take refs → reading claims | `read_record` + `readId !== null` + kind share/ask |
| `reflection/store.ts:213-232` | `reflection_events` (own) | owner-scoped, self-inspection only |
| `server.ts` `/nuclear/*` | episodes, revisions, decisions… | informational diagnostics only |

## Findings

1. **FIXED — take evidence materialization boundary.** Original finding:
   `agency/resolve-evidence.ts:171-188` previously resolved ANY `cur_takes` row
   by id, including `scan_excerpt` takes. All three take-ref construction
   points (`decide.ts` own-time path, `attachAuthorizedClaims`, and
   `motivations.ts` take motivations) filter to `read_record`, so this was
   unreachable at the time of the audit — but the resolver is the final
   materialization boundary and should not trust a hallucinated ref. The
   resolver now requires both `evidence_kind = 'read_record'` and non-null
   `read_id`, failing closed otherwise. Regression coverage in
   `wave01-thought.test.ts` proves `scan_excerpt` takes do not resolve while
   valid `read_record` takes still do. Targeted suite: 10/10 pass; TypeScript
   build clean.

2. **Design confirmation: takes are write-ungated, read-double-gated.** The
   curiosity pipeline (reads → takes → questions → revisions) records in
   observe; takes only influence behavior when BOTH `reading` and
   `curiosity_consolidation` can influence. This matches "recording/query works
   in observe" — but note the take WRITE has no per-capability gate at all, so
   disabling both capabilities stops influence but not recording.

3. **Design confirmation: learning applies are the only hard writer gate.**
   `applyEligibleRevisions` requires `mode === "apply"` at every call site
   (worker.ts:420, runtime.ts:1840, runtime.ts:1851) plus evidence count/span
   (foundational: ashley affirm + doc approve; stable: 3 evidence + 14 days;
   dynamic/opinion: 2 evidence). Proposals are never applied in observe.

4. **Observation: `mindUrgency` is threaded but never supplied.** `decide.ts`
   `allocateUrgency` uses `options.mindUrgency ?? 0` and no call site passes a
   non-default value (runtime.ts:608-613 and proactive path). Affect currently
   influences behavior only via the gated context-composer affect block.

5. **Observation: heuristic writers are intentional exceptions.** Pinned
   `/remember` facts and open-question heuristics (`writers.ts`) write without
   capability gates by design (explicit user intent), and the questions reader
   is disabled in composeTurnContext — heuristic questions only resurface as
   Thought-selected evidence or motivations.
