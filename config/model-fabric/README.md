# Model Fabric policy data

These files are versioned policy snapshots. They are not owner approval,
qualification, activation, deployment, or production evidence.

- `portfolios/current-compatibility.v1.json` is the only dispatchable
  portfolio in the autonomous MF-M2 through MF-ACT candidate.
- `portfolios/target-12-9.v2.json` is the current declared candidate TARGET
  (`mfp_target_12_9_v2`). It remains dark until later qualification, owner
  approval, activation, and production acceptance.
- `portfolios/target-12-9.v1.json` is the historical declared TARGET
  (`mfp_target_12_9_v1`). It is preserved and is not loaded by
  `loadTargetPortfolio()`.
- `catalog/` contains model-family, seat, coupling, and lifecycle data. It
  does not grant routability.
- `translation/` contains provider wire mappings. It does not grant semantic
  authority.

Secrets and owner artifacts MUST NOT be committed here.
