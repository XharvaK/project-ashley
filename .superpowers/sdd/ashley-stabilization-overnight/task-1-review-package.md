# Task 1 Independent Review Package

BASE=7bae7eaafedc2e7e859218d340920ea3958b1515
HEAD=c055642b5f9e3c72bb45c55304b6a390cd7235e4
PATCH_ID=1f8a60b19fc54f9a12a87ee8e481fd070fe0a53f
IMPLEMENTATION_REPORT=.superpowers/sdd/ashley-stabilization-overnight/task-1-report.md
DESIGN=docs/architecture/cognitive/ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md

The exact implementation diff is the immutable BASE..HEAD range above. The
reviewer MUST inspect that range directly in the isolated worktree. The range
passes `git diff --check`; it contains 27 changed source/test paths with 972
insertions and 502 deletions. The implementation commit is separate from the
report commit, so review is scoped to c055642 only.

## Changed-path inventory

The range changes Sparse VNext thought output contract, parser, materializer,
settlement validation/publication, authority, expression/fidelity composition,
structural feedback, cognitive types, qualification fixtures, model-fabric
contract IDs, and focused/regression tests. It does not include provider
capture, NVIDIA calls, later P1 repairs, release meta transition, deployment,
production mutation, or Sandbox code.

## Required review questions

Review against the Task 1 brief and current Sparse VNext design, not older
freeze/acceptance documents. Check omission-versus-empty semantics, strict
present-field validation, speech and abstain boundaries, all seven reference
shape corrections, canonical/wire separation, operational truth, Host semantic
non-authorship, and the stated Task 1 scope exclusions. Confirm that the
focused tests and build claims in the report are reproducible or identify the
first demonstrated defect. Do not redesign or fix the code in the reviewer
turn.

