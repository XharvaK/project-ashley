# Model Fabric policy data

These files are versioned policy snapshots. They are not owner approval,
qualification, activation, deployment, or production evidence.

- `portfolios/current-compatibility.v1.json` is the only dispatchable
  portfolio in the autonomous MF-M2 through MF-ACT candidate.
- `portfolios/target-12-9.v1.json` is declared candidate data and MUST remain
  dark until later qualification, owner approval, activation, and production
  acceptance.
- `catalog/` contains model-family, seat, coupling, and lifecycle data. It
  does not grant routability.
- `translation/` contains provider wire mappings. It does not grant semantic
  authority.

Secrets and owner artifacts MUST NOT be committed here.
