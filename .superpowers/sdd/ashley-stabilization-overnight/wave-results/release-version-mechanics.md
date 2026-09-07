# Project Ashley Sparse VNext — Wave6 Release/Version Mechanics

## Exact identities

The current source owners now expose:

- `SETTLEMENT_SCHEMA_VERSION = 2` in
  `apps/agent-service/src/core/cognitive-v021/types.ts`;
- `IMPLEMENTATION_SPEC_VERSION = "0.2.1.r6"` in the same source owner;
- `THOUGHT_OUTPUT_CONTRACT_ID = "ashley.thought.semantic.v2"` and
  `THOUGHT_OUTPUT_SCHEMA_ID = "ashley.thought.semantic.v2.schema"` in the
  current Model Fabric dispatch-contract owner.

Thought materialization writes the settlement schema marker from the constant.
Current test fixtures use the current release identity. Historical r5 values
remain represented only in the bounded transition witness and historical
documentation.

## Bounded sidecar transition

`scripts/stabilization/sidecar-meta-transition.mjs` is deployment-only. It is
not called by application startup and does not add a runtime migration path.
For both `forward` (`r5 → r6`) and `rollback` (`r6 → r5`) it:

1. begins `BEGIN IMMEDIATE`;
2. verifies the singleton row and all four expected identity fields;
3. updates only `implementation_spec_version` with an exact old-value `WHERE`;
4. requires `changes() === 1`;
5. reads back the requested new value; and
6. commits only after every assertion passes, otherwise rolling back and
   failing closed.

The caller remains responsible for quiescing writers and proving rollback
compatibility before invoking the utility.

## SW-5/SW-6 witnesses

`scripts/stabilization/sidecar-meta-transition.test.mjs` passed 5/5:

- exact forward transition changes one row and preserves every other meta
  field;
- exact reverse rollback succeeds;
- unexpected identity fails closed without mutation;
- a zero-row conditional update fails closed and rolls back; and
- a read-back mismatch fails closed and rolls back.

## Verification

- `node --test scripts/stabilization/sidecar-meta-transition.test.mjs`: 5 passed.
- Release-identity and sidecar/migration/Thought targeted suites: 7 files,
  75 tests passed.
- `npm run build --prefix apps/agent-service`: passed.
- Full cognitive sweep: 134 files, 641 passed, 19 failed. The failures are
  confined to four pre-existing qualification/scale files and report the
  known current-route/fixture or TPM-baseline conditions; no Wave6 transition
  test failed.
- `git diff --check`: passed.

## Gate result

`BEFORE_PRODUCTION_DEPLOYMENT=PASS_LOCAL_MECHANICS`

No sidecar transition was run against production. No deployment, restart,
production database mutation, or production acceptance is claimed by this
wave. The exact immutable candidate gate remains outstanding.
