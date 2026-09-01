# W2 Schema / Strict Parser Contract Matrix

Sources:

- `apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts`
  (`THOUGHT_OUTPUT_SCHEMA`)
- `apps/agent-service/src/core/cognitive-v021/thought/parse.ts`
  (`parseThoughtSemanticOutput`)
- `apps/agent-service/src/core/cognitive-v021/thought/semantic-output-contract.test.ts`
- `docs/audits/ashley-mri-phase5-573393c/79_W0_THOUGHT_CONTROL_BOUNDARY_MECHANICAL_PLAN.md`

The native schema is the provider-facing closed structural contract. The
strict parser is the live semantic boundary. Dynamic reference allowlists and
host context cannot be frozen into the static schema. The parser MUST remain
strict and MUST NOT coerce, repair, infer, or read thinking content.

## Rule matrix

| RULE | FROZEN_CONTRACT_SOURCE | ENFORCED_BY_JSON_SCHEMA | REPRESENTABLE_IN_JSON_SCHEMA | ENFORCED_BY_PARSER | SEMANTIC_NOT_STRUCTURAL | HOST_CONTEXT_DEPENDENT | OWNER |
|---|---|---:|---:|---:|---:|---:|---|
| Root is an object | `THOUGHT_OUTPUT_SCHEMA`; parser root check | yes | yes | yes | no | no | schema + parser |
| Root has exactly one registered `kind` branch | schema root `oneOf`; parser branch dispatch | yes | yes | yes | no | no | schema + parser |
| Settlement has only the declared top-level fields | settlement strict object; `exactRecord` | yes | yes | yes | no | no | schema + parser |
| Operation intent has only the declared top-level fields | operation strict object; `exactRecord` | yes | yes | yes | no | no | schema + parser |
| Abstain has only `kind`, `reason`, `explanation`, `evidenceRefs` | abstain strict object; `exactRecord` | yes | yes | yes | no | no | schema + parser |
| Unknown nested keys are rejected in declared semantic records | `additionalProperties:false`; `exactRecord` | yes for declared records | yes | yes | no | no | schema + parser |
| Model cannot author cycle/generation/request/occupant/authority/route fields | forbidden output-field contract and strict records | yes for declared records | yes | yes | no | no | schema + parser |
| Branch enum values are exact lowercase values | `const`/`enum`; exact comparisons | yes | yes | yes | no | no | schema + parser |
| Registered operation kind is one of the closed operation kinds | operation `enum`; `REGISTERED_OPERATION_KINDS` | yes | yes | yes | no | no | schema + parser |
| Operation request is a JSON object | `type:object`, open payload; `jsonObject` | yes | yes | yes | no | no | schema + parser |
| Existing reference is a non-empty allowlisted reference | schema string/minimum; `existingRef` | type only in schema; non-empty is schema | yes | yes | no | yes | parser for runtime allowlist; schema for non-empty |
| Local alias matches the declared ASCII identifier pattern | `pattern`; `localAlias` | yes | yes | yes | no | no | schema + parser |
| Semantic reference is exactly existing-ref or local-alias shape | `oneOf`; `semanticRef` | shape only | yes | yes | no | existing ref yes | schema + parser |
| Existing-reference arrays contain only existing refs | array item string shape; `refArray` | only string shape | yes | yes | no | yes | parser |
| Interpretation referent source refs use the allowlist | string array shape; `validInterpretation` | no | no, because allowlist is runtime | yes | no | yes | parser |
| Evidence-use refs use the allowlist | string arrays; `validEvidenceUse` | no | no, because allowlist is runtime | yes | no | yes | parser |
| Interpretation nested records use exact fields | nested strict objects; `validInterpretation` | yes for declared schema fields | yes | yes | no | partly refs | schema + parser |
| Commitments nested records use exact enums and fields | nested strict objects; `validCommitments` | yes for declared structure | yes | yes | no | no | schema + parser |
| Speech mode is `none` or `draft` | `oneOf`/`const`; `validSpeech` | yes | yes | yes | no | no | schema + parser |
| Draft `surfaceDraft` is optional string | settlement speech branch; `validSpeech` | yes | yes | yes | no | no | schema + parser |
| `none` speech has empty `mustSay` and `acceptableRealizations` | parser `validSpeech`; schema array shape only | no | yes | yes | yes | no | parser |
| Working-context, concern, occupancy, future, subscription, nomination deltas use exact operations | nested schemas; validators | yes for declared shapes | yes | yes | partly | refs yes | schema + parser |
| Occupancy priority is an integer | `type:integer`; parser was finite-number-only on base candidate | yes | yes | yes, after alignment repair | no | no | schema + parser |
| Future `dueAtMs` is an integer | `type:integer`; parser was finite-number-only on base candidate | yes | yes | yes, after alignment repair | no | no | schema + parser |
| Subscription `expiresAtMs` is integer or null | schema integer/null; parser was finite-number/null-only on base candidate | yes | yes | yes, after alignment repair | no | no | schema + parser |
| Operation purpose/evidenceNeed/expectedOutcome are non-empty strings | schema `minLength:1`; parser was string-only on base candidate | yes | yes | yes, after alignment repair | no | no | schema + parser |
| Abstain explanation is non-empty | schema `minLength:1`; parser was string-only on base candidate | yes | yes | yes, after alignment repair | no | no | schema + parser |
| Arbitrary operation request/payload is JSON-only | open schema object; `jsonObject` finite JSON check | object shape only | yes | yes | no | no | schema + parser |
| Arbitrary nested request/payload keys cannot contain published-only settlement fields | schema intentionally open for operation payloads; runtime settlement validator recursively checks published fields | no | not without closing every operation payload | no | yes | no | semantic validator / fencing |
| Settlement surface draft must be non-empty when speech mode is draft | schema permits empty string; qualification `plausibleSemanticOutput` checks it | no | yes | parser accepts empty string; qualification checks it | yes | no | semantic validator / qualification |
| Operation purpose/evidence need satisfy the expected operation | not encoded in schema | no | not generally | no | yes | yes | semantic validator |
| Evidence is relevant and supports a commitment | not encoded in schema | no | not generally | allowlist only | yes | yes | semantic validator / Authority |
| Currentness claims have a consumed observed source | not encoded in schema | no | no, requires live state | no | yes | Authority |
| Authority epoch/currentness is current at evaluation/publication | not encoded in schema | no | no, host state | no | yes | Authority / fencing |
| Generation/cycle/occupant/attempt identity matches | deliberately host-owned and absent from semantic schema | no | no, must not be model-authored | kernel/fence only | no | yes | Kernel / fencing |
| Thinking chunks never become semantic text | no provider-body schema rule | no | no | adapter separates them before parser | no | no | adapter |
| Invalid JSON cannot be repaired or extracted from prose | parser requires JSON; no repair path | no | parser path is the owner | yes | no | no | parser |

## Difference adjudication

### Schema language versus parser language

The schema and parser are not identical languages for two different reasons:

1. The parser uses runtime context that the static schema cannot know. An
   allowlisted reference, current operation registry, and host-owned context
   are intentionally checked by the parser or later deterministic layers.
2. The base candidate parser accepted some primitive shapes that the schema
   rejected: empty required operation/explanation strings, fractional
   occupancy priority, fractional future due time, and fractional subscription
   expiry. These are representable structural constraints, so accepting them
   in the parser was an implementation mismatch. The closure repair aligns
   these parser checks with the frozen schema. It does not loosen the parser.

After that alignment, the remaining schema/parser difference is intentional
layering: the schema closes provider-visible structure, while the parser
re-checks the structure and applies runtime reference/context rules. Semantic,
Authority, and fencing rules remain later because they depend on host state or
meaning, not only JSON shape.

```text
JSON_SCHEMA_LANGUAGE=broader for runtime allowlist/context and later semantic state
JSON_SCHEMA_LANGUAGE=narrower than the base parser for fixed minLength/integer rules
BASE_CANDIDATE_RESULT=MISMATCH_PROVEN
POST_ALIGNMENT_RESULT=INTENTIONAL_LAYERING_PROVEN
```

This matrix does not explain the two historical live parser failures by itself.
Their bodies were not retained. A new captured payload or a necessarily
applicable structural mismatch is required before assigning those cases to A
or B.

## Structural correction consequence

The schema/parser distinction does not authorize a retry after a parser-valid
semantic failure. The W2 harness must use the source-defined bounded
structural-correction path only for malformed output, and must report the
final executed attempt with its own attempt identity. Thinking content remains
metadata-only and cannot be fed into this parser.
