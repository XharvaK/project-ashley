# C3 Implementation-HEAD Audit

Date: 2026-08-26

Audited HEAD: `6f83395fcf859274abfc1e4e92071eb3ddfe5f33`

## Result

`C3 PREDECESSOR AUDIT = PASS`

The C1 baseline is committed and C2 is locally settled and committed. The
current source exposes C1 assertion currentness, provenance labels, deny
barriers, and correction fan-out readers. The C2 projection seam is optional
and does not own learned semantic state.

## Confirmed gaps

- No `learned_influences`, `learned_influence_evidence`, or
  `learned_choice_receipts` tables exist.
- Curiosity `performGroundedReads` ranks feed items from item score and open
  question overlap only.
- Agency `collectMotivations` has no learned-interest admission path.
- Existing `learning_revisions` remain Identity-owned candidates and are not a
  C3 qualification witness.
- No inherited-seed lineage side table exists.
- No C3 shared-culture or third-identity store exists.

## Required C3 seams already available

- `memory/eligibility.ts`: `influenceEligibleAt`,
  `episodeInfluenceEligibleAt`, and deny-barrier readers.
- `memory/assertions.ts`: typed C1 assertion records with subject facets,
  lineage, influence class, currentness, and data classification.
- `memory/corrections.ts` and `memory/fanout.ts`: owner correction and barrier
  lifecycle.
- `rollout/capabilities.ts`: separate `learned_autonomy` capability name,
  default observe state, and existing capability authority predicates.
- `curiosity/reads.ts` and `agency/motivations.ts`: natural ranking and
  motivation consumers for a bounded additive C3 interface.
- `core/model-fabric/projection.ts`: optional C2 bounded projection transport;
  C3 will not make it a semantic authority.

## Scope decision

Implement one typed, first-wave `interest` binding with explicit evidence,
lineage, adjudication, derived eligibility, choice receipts, Curiosity and
Agency dark-apply consumers, rollback/demotion behavior, and owner diagnostics.

Do not modify C1 semantic representation, write C5 shared-culture tables, add
a similarity score, mutate Identity, promote `learned_autonomy`, call a
provider, or use external effects.
