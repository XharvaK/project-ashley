# Wave 3 — Minimal Provider Failure Capture

## Scope

This wave implemented bounded provider-boundary observability only. It did not
call NVIDIA or any other external provider, change provider controls, alter
Thought semantic authority, add prompt retention, or create a new telemetry or
database architecture.

The implementation uses the existing Model Fabric receipt metadata and the
dedicated `thought_dispatch_diagnostics` sidecar. The sidecar receives one
additive `provider_failure_json` column. Serialization is an explicit
allowlist, so raw provider payloads and hidden reasoning text are not retained.

## Evidence mapping

| Requirement | Evidence |
|---|---|
| Healthy calls do not create forensic payload | `diagnostics.test.ts`: healthy `provider_returned` row keeps `provider_failure_json` NULL. |
| Failure metadata is recorded | Parser-malformed Thought fixture records provider, model, correlation IDs, failure class, parser/validator status, and retry status. |
| No full reasoning trace is stored | NIM tests assert hidden reasoning is absent from response diagnostics JSON; sidecar test asserts malformed response text is absent from stored failure JSON. Only bounded reasoning byte length/hash are carried. |
| Schema and wire identities remain truthful | Capture reads the current Thought attempt identity and `WireDispatchEvidence`; the integration fixture asserts canonical and wire fingerprints/binding/digest. |
| Tokens, finish, and timing survive | NIM response diagnostics and Model Fabric boundary tests cover finish class, input/completion/reasoning tokens, request/response timestamps, elapsed time, and deadline. |
| Unavailable fields remain absent | Transport-failover suppression fixture asserts no fabricated input/completion/finish/timing fields when the provider did not supply them. |

## Changed surfaces

- `apps/agent-service/src/core/model-routing/types.ts`: bounded response,
  boundary-control, and boundary-timing types.
- `apps/agent-service/src/core/model-fabric/types.ts`: optional boundary facts
  on Model Fabric dispatch metadata.
- `apps/agent-service/src/mistral-client.ts`: measure the existing adapter
  boundary and preserve controls/timing through success and error metadata.
- `apps/agent-service/src/core/model-routing/adapters/nim-adapter.ts`: capture
  bounded response shape, finish, usage, hidden-reasoning length/hash, and wire
  evidence without returning hidden text.
- `apps/agent-service/src/core/cognitive-v021/thought/run.ts`: project the
  existing receipt, wire, response, parser, validator, and retry facts into
  failure diagnostics.
- `apps/agent-service/src/core/cognitive-v021/thought/diagnostics.ts`: additive
  allowlisted sidecar persistence and guarded readback.
- Targeted tests in the NIM adapter, Thought diagnostics, and Model Fabric
  receipt seams.

## Verification

- NIM adapter + Thought diagnostics + Model Fabric boundary: **40/40 passed**.
- Core D0 + Thought diagnostics: **27/27 passed**.
- Agent-service build/typecheck (`npm run build --prefix apps/agent-service`):
  **passed**.
- `git diff --check`: **passed**.
- Provider calls in this wave: **0**.
- Production database/service/deployment/restart: **0**.

A broader legacy `mistral-client.test.ts` run remains known to have nine
pre-existing route/environment failures because the current route is NIM while
those tests do not configure `env.nimApiKey`; no routing behavior was changed
in this wave. The related Model Fabric M1, M2, and Slice 0 tests passed in that
run. The known Sandbox Broker build defect remains outside this wave.

## Controller self-review

`CONTROLLER_SELF_REVIEW=PASS`.

The review confirmed that the diff is bounded to the provider boundary and
existing Thought diagnostic sidecar, preserves canonical-versus-wire identity,
does not add a Host turn classifier or semantic default, and stores no raw
conversation or hidden reasoning. A duplicate NIM reasoning-length lookup and
an overly strict thinking-chunk diagnostic were corrected before final tests.

## Exit

`PROVIDER_FAILURE_CAPTURE=LOCALLY_VERIFIED_PASS`

The next programme step is the controlled NVIDIA current-vs-sparse diagnostic,
subject to its explicit authority and scenario gate.
