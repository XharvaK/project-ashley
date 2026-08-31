# Phase 5 W3 Implementation Evidence

`WAVE_ID=W3`

`STATE=COMPLETE_WITH_NEGATIVE_STAGE_A_AND_PASS_STAGE_H`

`CANDIDATE_SHA=573393c3fdb2392a45137d4625635658eb4b5d88`

## Scope completed

W3 implemented the F011 qualification-closure harness and evidence bundle
without changing production state, the production checkout, the source
dataset, or the retrieval allocator. The implementation includes:

- frozen Incident C dataset-manifest and label validation;
- declared Stage A retrieval thresholds and deterministic metric evaluation;
- fail-closed handling for missing, duplicate, private, or empty labels;
- evidence-derived Fuse-gate decision recording;
- dedicated Stage H runtime qualification for Linux/Mint, FTS5, startup
  crash-gap reconciliation, derived rebuild, valid-read source-scan count,
  query latency, bounded projection, and process memory;
- aggregate qualification-result assembly with candidate and evidence identity.

The implementation tests passed:

```text
node --test scripts/snapshot-incident-c.test.mjs scripts/cognitive-v021/f011-evidence.test.mjs scripts/cognitive-v021/f011-stage-h.test.mjs
11 tests passed

npm test --prefix apps/agent-service -- src/core/cognitive-v021/acceptance/thought-context-optimization.qualification.test.ts src/core/cognitive-v021/retrieval/__tests__/derived-store.test.ts src/core/cognitive-v021/thought/projection-allocator/__tests__/allocator.test.ts src/core/cognitive-v021/thought/projection-allocator/__tests__/estimate-shared.test.ts
4 files, 15 tests passed

npm run build:agent
passed
```

## Stage A result

Stage A was run once against the checked-in Incident C synthetic fixture. Its
labels are frozen and contain 92 `irrelevant` labels and zero `relevant`
labels. The harness therefore failed closed. The result was not repaired by
tuning labels after measurement.

Observed result:

```text
precisionAtK=0
recallAtK=null
mrr=null
requiredQueryCoverage=0
falseCurrentEvidenceCount=0
```

Failure codes:

```text
no_relevant_labels
query_relevance_set_empty
threshold_precision_at_k
threshold_recall_at_k
threshold_mrr
threshold_required_query_coverage
```

The runtime retrieval state was ready and returned seven ranked keys. The
negative result is an evidence result, not permission to claim retrieval
qualification.

The Fuse evidence-derived gate recorded:

```text
needed=true
decision=OWNER_DECISION_REQUIRED
package=null
version=null
license=null
```

No Fuse package or dependency was added.

## Stage H Mint result

Stage H was executed once on the authorized Linux Mint host using an isolated
temporary root and the exact candidate SHA. The production checkout at
`/home/xarvak/project-ashley` remained unchanged and clean.

```text
runId=f011-stage-h-9be262da-5db6-42e4-a718-fbb6e445c2b5
environment=Linux Mint 22.3 (Zena)
node=v22.23.2
sqlite=3.51.3
pass=true
```

All nine Stage H checks passed:

- candidate build identity;
- Linux environment;
- FTS5 availability;
- startup crash-gap reconciliation;
- derived rebuild bound: `22.741457 ms <= 2000 ms`;
- valid-read source scans: `0`;
- query p95: `4.605518 ms <= 250 ms`;
- bounded projection: `9.607298 ms`, demand `8716 <= 16000`, no required
  overflow;
- process memory: `88895488 <= 1610612736` bytes.

The Stage H output was produced from the isolated qualification root. It is
not a production-acceptance witness.

## Immutable evidence references

```text
work/phase5-w3-stage-a-20260831/f011-dataset-manifest.json
SHA256=9659120246A2369476D3E598F8429BB5009FF40D094C6943C90F58EA178361EC

work/phase5-w3-final-20260831/f011-stage-a.json
SHA256=190A8D79D6850374417AD0C376294903877BF47F79C35FCD99E4B1D4DE3C1389

work/phase5-w3-final-20260831/f011-qualification.json
SHA256=FE5573D13B855DC26556DEC6FA0769939C3C32A36D66FCDBF46E73AA2C7C3FDB

work/phase5-w3-stage-h-20260831/f011-stage-h.json
SHA256=7109F75EC69AFD39D2063C232294081434FED2AF19E09293A4F2B8C0AC13C013
```

The aggregate qualification result is `verdict=FAIL` because Stage A failed.
Stage H is independently `pass=true`. No provider call, production mutation,
activation, promotion, or W9 action was performed for W3. Under the owner’s
corrected continuous-run instruction, execution continues to W4 with this
negative Stage A result preserved as evidence.
