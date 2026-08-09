# ASHLEY INIT-03 — PERSISTENT COGNITIVE CONTINUITY

PASS

This is a repository-local implementation and deterministic offline qualification result. It is not production, Mint, Recall-promotion, Discord, provider, or human-behavior evidence.

## BASELINE

starting HEAD: 7d686f4d384da97b1d4d00fb26dedf95b82bbdce
starting origin/master: 7d686f4d384da97b1d4d00fb26dedf95b82bbdce
branch: master
pre-existing dirty paths: `AGENTS.md` only

## WAVE RESULTS

Wave 0 — PASS — contract and implementation plan: `cf3bcf0`; lifecycle status alignment: `f198f6e`.

Wave 1 — PASS — schema v23, OCI tables, indexes, targetable registration, and migration tests: `7db389d`.

Wave 2 — PASS — owner-scoped OCI store, deterministic identity, and bounded materializer foundation: `99a650c`; grounded materialization validation: `e3b1bf6`.

Wave 3 — PASS — cognition worker proposals and safe source projections into transient motivations: `0295417`; `c72546a`.

Wave 4 — PASS — bounded relationship source producers: `441c2c1`.

Wave 5 — PASS — bounded candidate selection and Thought influence: `56e05bf`.

Wave 6 — PASS — fixed host delay mapping, reconsideration, Reflection review requests, restart persistence, and resolution: `2be2926`.

Wave 7 — PASS — provenance, stale-source, redaction, forget, and model/build continuity boundaries: `e80aec2`.

Wave 8 — PASS — owner-only bounded diagnostics and closed reason codes: `d73f086`.

Wave 9 — PASS — deterministic offline behavioral and counterfactual qualification: `f9f7b7f`.

Wave 10 — PASS — adversarial, retry, concurrency, restart, withdrawal, and fail-closed qualification: `e0f60df`.

Wave 11 — PASS — regression, focused domains, agent/Discord builds, and guarded offline qualification; stale v22 assertions were aligned to actual schema v23: `c7cbab6`.

Wave 12 — PASS — bounded wake reads, performance qualification, as-built contract, and this report: source hardening `9bf88d6`; documentation commit created after that source commit.

## FINAL ARCHITECTURE

OCI kinds: exactly `question`, `revisit`, `concern`.

OCI statuses: exactly `OPEN`, `RESOLVED`, `WITHDRAWN`, `SUPERSEDED`.

Delay is attention metadata. `DEFERRED` is not an OCI status.

Schema: nuclear schema v23 with `open_cognitive_items`, `open_cognitive_item_attention`, and `open_cognitive_item_transitions`.

Authority: source records remain authoritative for source truth. The deterministic SQLite materializer owns persisted OCI rows. Attention Governor state owns operational scheduling. Motivation rows are transient projections. Thought and model output are advisory and cannot write semantic state directly.

Identity: the materializer validates owner, exact kind, bounded summary, source existence and ownership, entity correspondence, capability, contract, provenance, source revision, build/model continuity, and deterministic owner-scoped semantic identity. The summary limit is 512 characters. Raw source text, prompt fragments, chain-of-thought, raw model reasoning, and sensitive key material are not stored in OCI.

Selection: proactive OCI projection is capped at 8 rows; reactive candidate selection remains capped at 12 candidates, with at most 3 candidates per source. One proactive candidate is selected per wake. The score floor/material floor remains 25.

Relationship: self commitments, mutual commitments, and relational tensions are read-only bounded projections. A mutual OCI does not assert fulfillment. Withdrawal suppresses relationship initiative. Only explicit repair eligibility permits a bounded tension candidate.

## SOURCE PRODUCER MATRIX

| source | authority | status before | status after | behavioral influence | capability gate | resolution owner |
| --- | --- | --- | --- | --- | --- | --- |
| questions | question store | open questions already read by motivations | existing question path remains; grounded OCI linkage is allowed | existing question motivation plus deduplicated OCI candidate | question/source validation and existing material gate | question state owner; OCI transition validates current source |
| curiosity takes | curiosity feed | recent/decaying takes already read | unchanged source path; no duplicate OCI authority | existing curiosity motivation | curiosity capability and source freshness | curiosity source owner |
| facts and opinions | memory and identity stores | active facts/opinions already read | unchanged; not copied into OCI as authority | existing fact/opinion motivation | existing source and classification gates | fact/opinion owners |
| ordinary unfinished | Mind State store | active unfinished/commitment items already read | unchanged source path | existing unfinished motivation | Mind State activation/urgency and existing gates | Mind State owner |
| Mind State items | Mind State store | active state rows | unchanged; worker can ground cognition through existing episode seam | existing activation/urgency-based motivation | `mind_state` capability and source checks | Mind State owner |
| Identity boundaries | Identity and boundary relevance | boundary source exists as a gate | gate only; no invented OCI producer | refusal/boundary behavior | identity/boundary authority | Identity/boundary owner |
| Identity curiosity | Identity source | no complete proactive OCI reader | gate/partial only; no unsupported producer | no new influence without a verified owning source | identity capability and source contract | Identity owner |
| document reminders | relationship reminder store | pending/due reader exists | unchanged due reader; no duplicate OCI authority | existing due reminder motivation | relationship capability and due gate | reminder source owner |
| callbacks | grounded callback/runtime seams | partial existing grounded seam | partial; only verified grounded callbacks may influence | bounded callback behavior | callback/source capability | callback source owner |
| own-time grounded report | own-time/reactive runtime seam | reactive and grounded only | unchanged; no manufactured unattended continuity | reactive report only | own-time and provenance gates | own-time source owner |
| Ashley self-commitments | relationship store | active rows existed without proactive reader | bounded read-only proactive projection | low bounded unfinished candidate | relationship apply capability and withdrawal gate | self-commitment source; OCI transition validates source |
| mutual commitments | relationship store | active rows existed without proactive reader | bounded bilateral projection, never fulfillment | bounded unfinished candidate | relationship apply capability and withdrawal gate | mutual commitment source; OCI cannot fulfill it |
| relational tensions | relationship store | open rows lacked proactive reader | at most one bounded concern projection | low-band bounded concern only | relationship capability, repair status, classification, withdrawal gate | relationship repair owner |
| withdrawal records | relationship repair/withdrawal store | existing gate | unchanged and applied to OCI influence | suppresses relationship initiative; not fuel | withdrawal authority | relationship repair owner |
| reconnection | relationship source | no verified dedicated producer | gate-only/partial; no invented producer | no automatic contact or pressure | relationship and consent/withdrawal gates | relationship source owner |
| scheduled_proactive_messages | scheduler schema | schema-only source | remains schema-only; never OCI or motivation storage | no INIT-03 semantic influence | scheduler authority only | scheduler owner |
| Attention Governor | attention subsystem | operational scheduler | remains operational; not OCI semantic authority | controls wake/resource scheduling only | existing governor gates | Attention Governor owner |
| existing motivations | motivations table and agency projection | transient/projection and learning behavior | remains transient; OCI inventory is separate | candidate surface only | Thought/Agency material and capability gates | Agency/Thought owners |

## DELAY / RECONSIDERATION

Host-owned fixed durations are `brief=15 minutes`, `standard=24 hours`, `long=7 days`, and `reflection_review=24 hours`. Thought returns only a delay class; it cannot supply a timestamp or duration. The host persists `defer_until`, delay class, last outcome, and consideration count.

After three considerations, or an explicit `reflection_review`, the item requests bounded Reflection review. Restart preserves the attention row. Repeated delay does not expire, delete, demote, or reinterpret the unresolved OCI. Resolution is limited to validated local transitions and revalidates source ownership, source identity, withdrawal, redaction, provenance, and current source state.

## PROVENANCE / FORGET

Shadow evidence remains `shadow`. Time, delivery, or local processing does not promote it to `live`. Model-derived continuity carries model epoch and build identity and is rejected when the source continuity contract is stale.

Forget discovers linked OCI rows through owner-scoped source/entity mappings, atomically changes open forgotten-source rows to `WITHDRAWN`, writes a transition reason, clears attention scheduling, replaces the semantic summary with `[redacted]`, and records `redacted_at` and `source_forgotten`. Cross-owner and source-mismatched operations fail closed. OCI resolution cannot rewrite source truth, relationship truth, Identity, Recall, provenance, capability state, or external truth.

## BEHAVIORAL EVALUATION

The deterministic offline harness matched capability ON/OFF behavior across the A–M scenario matrix and exercised source-only and OCI-only ablations. It covered callback/question/self/mutual/forgotten/shadow/withdrawal/flood/own-time/defer/restart/wrong-owner cases. No provider call was needed.

The adversarial harness covered malformed kinds, oversize summaries, unsupported identity sources, injected status/redaction/defer fields, proposed mutual commitments, concurrent duplicate retries, distinct semantic conclusions, cross-owner hashes, stale source mutation, demotion/shadow transitions, fixed delay duration, relationship source immutability, and diagnostic non-leakage.

Do NOT claim production-human success from fixtures.

## TESTS

Focused: 6 INIT-03/runtime files, 30 tests passed after Wave 12 bounded-read hardening; the Wave 11 focused domain run passed 43 files and 192 tests.

Migration: schema v23 migration tests passed within the guarded offline tier; four stale v22 assertions were aligned to the current schema in `c7cbab6`.

Concurrency/restart: concurrent duplicate creation, retry idempotency, cross-connection convergence, stale restart checks, and deferred OCI restart persistence passed in `init03-adversarial.test.ts` and `init03-evaluation.test.ts`.

Forget/provenance: redaction, forgotten-source withdrawal, shadow/live separation, source revision, build identity, model epoch, owner, and capability checks passed in the cognition/memory qualification suites.

Behavioral/counterfactual: capability ON/OFF, OCI-only, source-only, withdrawal, own-time, delay, restart, and no-raw-text metrics passed in `init03-evaluation.test.ts`.

Builds: `npm run build:agent` and `npm run build:discord` passed after Wave 12.

Full `npm test`: 112 test files, 797 passed, 1 skipped.

phase0:offline: 112 test files, 797 passed, 1 skipped; `OK offline tier`. The full guarded run passed after the bounded-read source commit.

external network attempts: 0

## PERFORMANCE

additional queries: one indexed owner/status OCI read capped with `LIMIT 8` for motivation projection; one indexed review-due count on the wake path; entity-targeted OCI lookup for selected-candidate revalidation; full owner status enumeration is deferred to owner diagnostics or the no-material diagnostic path.

candidate max: 8 proactive OCI rows, 12 total reactive candidates, 3 per source, and 8 model-proposed open items per cognition pass.

expected OCI steady state: source-driven materialization converges repeated semantic proposals to one owner-scoped row per semantic key. No scheduler-generated OCI rows and no automatic expiration are used. Per-wake work is bounded, but total retained OCI storage still requires source resolution, forget, and future governance.

prompt growth bound: OCI adds at most 8 bounded summaries to the proactive motivation projection. Each summary is at most 512 characters. Thought receives the existing bounded candidate surface. Raw source text, raw reasoning, and prompt fragments are not persisted.

## ROLLOUT OPTIONS

A — WAIT FOR RECALL: retain the implementation as local, observe-only qualified source until Recall evidence and any promotion decision are separately reviewed.

B — DEPLOY + EXPLICIT REBASE: only after a new baseline check, production migration plan, capability/Recall evidence, explicit authorization, and a separate release qualification.

C — OBSERVE-ONLY DEPLOY: only after a separate production-safe observation contract authorizes the required instrumentation and rollout boundary.

Recommended option based on implemented source: A — WAIT FOR RECALL.

NO ACTION TAKEN.

## PRODUCTION

Mint: UNTOUCHED
Recall: UNTOUCHED
sandbox: UNTOUCHED
providers: NO LIVE CALLS
Discord: NO LIVE TRAFFIC
deploy: NO
push: NO

## LOCAL COMMITS

List in order:

1. `cf3bcf0` — `docs(initiative): define INIT-03 cognitive continuity contract`
2. `f198f6e` — `docs(initiative): align OCI lifecycle status contract`
3. `7db389d` — `feat(cognition): add open cognitive item foundation`
4. `99a650c` — `feat(cognition): add open cognitive item store`
5. `e3b1bf6` — `feat(cognition): materialize grounded open cognitive items`
6. `0295417` — `feat(cognition): connect grounded continuity proposals`
7. `c72546a` — `feat(initiative): project cognitive continuity into motivations`
8. `441c2c1` — `feat(initiative): connect bounded relationship motivations`
9. `56e05bf` — `feat(initiative): bound persistent motivation selection`
10. `2be2926` — `feat(cognition): add durable reconsideration lifecycle`
11. `e80aec2` — `fix(cognition): harden cognitive continuity provenance`
12. `d73f086` — `feat(initiative): expose cognitive continuity diagnostics`
13. `f9f7b7f` — `test(initiative): qualify persistent cognitive continuity`
14. `e0f60df` — `test(cognition): harden INIT-03 continuity boundaries`
15. `c7cbab6` — `test(qualification): align migration assertions with schema v23`
16. `9bf88d6` — `perf(cognition): bound continuity wake reads`
17. `980ba9c` — `docs(initiative): publish INIT-03 qualification report`
18. Wave 12 documentation correction — this commit.

## PRESERVED UNRELATED WORK

AGENTS.md staged: NO
AGENTS.md modified/reverted: NO
final worktree: `AGENTS.md` remains the only modified path; no staged or untracked initiative files.

## HUMAN NEXT GATE

Review this local evidence package and separately decide whether INIT-03 should remain local until Recall evidence is reviewed; no production authorization is implied.

STOP.
