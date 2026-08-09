# Autonomy Plumbing 01 Initiative Design

## Goal

Make the local proactive path retry-safe and owner-observable without changing
Identity, Mind State, Thought, Agency, capability rollout, Recall, or delivery
authority.

## Design

`AshleyCore.tickProactive` remains the owner of the initiative transaction
boundary. The initiative reservation and its `delivery_reservations` row will
be inserted inside one existing SQLite `BEGIN IMMEDIATE` transaction. The
delivery row will carry the already-recorded `decision_id`, so centralized
delivery finalization can resolve the correct decision outcome. No new semantic
store or delivery authority is introduced.

The existing delivery store will expose a clearly named insert helper that
requires an already-open transaction. Its current standalone proactive claim
API remains transaction-owning for callers that need it. Runtime code will use
the transaction-scoped helper only after inserting the initiative row.

Owner-only proactive status will expose one bounded `lastDiagnostic` record
persisted in the existing `kv` table: timestamp, closed stage, and closed code.
It will never contain model text, chain-of-thought, motivation summaries, or
provider errors. Eligibility returns classify gate refusals; Thought/Agency,
Expression, reservation, and delivery transitions classify the remaining local
path. `evaluateProactive` remains read-only and does not write diagnostics.

## Invariants

- Expected capability and observe-only gates remain unchanged.
- A failed delivery claim leaves no uncommitted initiative reservation.
- A retry after a failed claim can select the same grounded material.
- Delivery receipts/finalization retain the originating decision ID.
- Diagnostics are metadata-only and owner-protected.

## Verification

Use disposable SQLite tests for claim failure/retry, status diagnostics for
pause/cap/silence/material failure, and the existing proactive qualification
tests. Run the agent-service build and relevant offline suite after the focused
tests pass.
