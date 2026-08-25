# Model Fabric policy examples (Pass 2 / 2.1)

These JSON files are **documentation fixtures**, not live Mint state and
not `config/model-fabric/` runtime.

Files marked `incompleteFixture: true` are partial. Luna completes
CURRENT rows from the implementation contract §10.5 and TARGET rows from
Architecture §12.9 during MF-M2 / MF-M3, then places validated snapshots
under `config/model-fabric/`. Dispatch MUST use `current-compatibility`
until an owner `ActivationRef` exists.

Do not copy an incomplete fixture onto Mint and dispatch it.
Do not treat `target-12-9.v1.json` as production routing.

CURRENT Thought fixtures: `economical` / wire `low`.
TARGET Thought fixtures: `high` / wire `high`.

Governing contract:
[`../Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`](../Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md)
