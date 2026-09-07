# Wave 4 — Controlled NVIDIA current-vs-sparse diagnostic

Status: `NVIDIA_DIAGNOSTIC=COMPLETE`

Conclusion: `PROVIDER_RELIABILITY_CONCERN`

This diagnostic executed 15 synthetic scenarios in two sequential conditions
(30 provider invocations total). The conditions used the same provider, model,
messages, temperature, reasoning policy and budget, output limit, deadline, and
single-attempt policy. The only intended variable was the structured-output
contract sent to NIM:

- `current_v1`: historical baseline contract from the exact `7bae7ea` source
  baseline, `ashley.thought.semantic.v1.schema`.
- `sparse_v2`: current committed Sparse VNext contract,
  `ashley.thought.semantic.v2.schema`.

The current committed portfolio is the authority for the provider controls. The
stale `docs/Routing_Status.md` v1 route description was not used; its conflict
with `config/model-fabric/portfolios/current-compatibility.v2.json` is recorded
as historical drift in the stabilization ledger.

## Fixed controls

| Control | Value |
|---|---|
| Provider | NIM (`nim`) |
| Model | `nvidia/nemotron-3-super-120b-a12b` |
| Temperature | `1.0` |
| Semantic/effective reasoning | `high` |
| Wire reasoning control | `reasoning_effort=high` |
| NIM reasoning budget | `1024` tokens |
| `max_tokens` | `8192` |
| Deadline | `60000` ms |
| Retry policy | `single_attempt` |
| Structured-output binding | `compat_thought_nim_nemotron_super_native_json_schema_v1` |
| Wire format | `nim_response_format_json_schema` |

The unconstrained semantic schema fingerprints were different and source-bound:

- V1: `sha256:cd174d9f8cd57fd452c21ebc93f72aa22d1940019425cbf8d97cb2b6c44bb824`
- V2: `sha256:e96d2a20feea442da2fbfacfa02bc9b0383836e0e531af3c089c67c436a35ace`

Per-scenario namespace-constrained schema and sanitized wire fingerprints are
recorded in the JSON artifact. No prompt, provider text, or hidden reasoning
text is retained. Only content hashes, bounded byte lengths, structural shape,
parser outcome, token counts, finish class, and timing are retained.

## Per-scenario bounded outcome

`domains` is the number of optional settlement domain names present in a parsed
root object. `empty` is the number of those present domains that were empty
arrays/objects. `ERR` is a mapped provider failure or the fixed deadline abort.

| Scenario | V1 result | V2 result | V1 shape / parse | V2 shape / parse |
|---|---|---|---|---|
| Q1 ordinary | response, stop, 1352 tok, 1023 B | `ERR provider_unavailable` (615 ms) | 9 domains, 6 empty, ok | unavailable |
| Q2 longer speech | response, stop, 1168 tok, 1524 B | `ERR provider_unavailable` (6693 ms) | 9 domains, 6 empty, ok | unavailable |
| Q3 intentional silence | `ERR deadline_or_abort` (60002 ms) | `ERR provider_unavailable` (553 ms) | no response | unavailable |
| Q4 silence + delta | `ERR deadline_or_abort` (60002 ms) | `ERR provider_unavailable` (892 ms) | no response | unavailable |
| Q5 working context | response, stop, 1731 tok, 2341 B | `ERR provider_unavailable` (627 ms) | 9 domains, 5 empty, `wrong_type` | unavailable |
| Q6 concern | `ERR deadline_or_abort` (60010 ms) | `ERR provider_unavailable` (647 ms) | no response | unavailable |
| Q7 future trigger | response, **length**, 8192 tok, 7244 B | `ERR provider_unavailable` (570 ms) | runaway; `invalid_json` | unavailable |
| Q8 durable nomination | `ERR deadline_or_abort` (60003 ms) | `ERR provider_unavailable` (662 ms) | no response | unavailable |
| Q9 evidence reliance | response, stop, 982 tok, 926 B | response, stop, 428 tok, 137 B | 9 domains, 6 empty, ok | 1 domain, 0 empty, ok |
| Q10 currentness | response, stop, 1086 tok, 1332 B | response, stop, 522 tok, 139 B | 9 domains, 6 empty, ok | 1 domain, 0 empty, ok |
| Q11 operational claim | response, stop, 1457 tok, 1371 B | response, stop, 412 tok, 201 B | 9 domains, 6 empty, ok | 0 domains, 0 empty, ok; operational commitment absent |
| Q12 correction | response, stop, 1420 tok, 1525 B | response, stop, 543 tok, 206 B | 9 domains, 6 empty, `wrong_type` | 0 domains, 0 empty, ok; interpretation absent |
| Q13 observation intent | response, stop, 389 tok, 267 B | `ERR provider_unavailable` (647 ms) | intent branch, ok | unavailable |
| Q14 effect intent | response, stop, 474 tok, 324 B | `ERR provider_unavailable` (688 ms) | intent branch, ok | unavailable |
| Q15 abstain | response, stop, 186 tok, 222 B | `ERR provider_unavailable` (572 ms) | abstain branch, ok | unavailable |

## Aggregate evidence

- V1: 11/15 responses; 4/15 fixed-deadline/provider failures. One V1 response
  reached the 8192-token limit and was invalid JSON (Q7).
- V2: 4/15 responses; 11/15 mapped `provider_unavailable` failures. The four
  responses were Q9–Q12.
- Successful V2 responses were materially smaller in the paired cases:
  Q9–Q12 averaged 171 B and 476 output tokens versus V1's 1390 B and 1236
  output tokens. This is a conditional size observation, not a causal claim.
- In the four paired successful cases, V2 omitted unused domains reliably. V2
  also omitted the requested operational commitment in Q11 and the requested
  correction interpretation in Q12; the parser correctly accepted those as
  semantically sparse speech-only settlements, so consequential-domain
  authoring was not demonstrated.
- V1 ordinary responses showed the mandatory-domain burden directly: nine
  optional-domain names were present, with five or six empty domains.
- V2 intent, silence, working-context, concern, trigger, nomination, and
  abstain coverage was not available because those invocations failed at the
  provider boundary. Runaway behavior cannot be adjudicated for V2 from this
  sample.

The high V2 provider-failure rate means this run cannot support
`SPARSITY_IMPROVES_BEHAVIOR` or `SPARSITY_DOES_NOT_MATERIALLY_IMPROVE_BEHAVIOR`
as an end-to-end claim. The observed result is therefore
`PROVIDER_RELIABILITY_CONCERN`. The artifact records the mapped failure class
and timing; no provider-side root cause is asserted.

## Artifact and provenance

- Results: `.superpowers/sdd/ashley-stabilization-overnight/diagnostics/wave4-nvidia-results.json`
- Results SHA-256: `4A076ECA75AC2C07CCBA3439702D2617D3A9D3049B144F9E1D86CC5E5019DB69`
- Diagnostic source: `.superpowers/sdd/ashley-stabilization-overnight/diagnostics/wave4-nvidia-diagnostic.ts`
- Start HEAD: `5162ff0aeb866fc7cab733240bc01fee43c441f6`
- Start tree: `5c046ca43bf3db80a6d340dde7f3989d2f959f0c`
- Baseline V1 source: detached worktree at `7bae7eaafedc2e7e859218d340920ea3958b1515`

No production service, database, deployment, activation, or shutdown action
was performed.
