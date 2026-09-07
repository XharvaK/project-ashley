# Task 1 Fix 1 Independent Review Package

BASE=3f5d8b8b7ff6561e005b378336df098680b1be5f
HEAD=cf3613b1b36adccd97fb37c5355abf0f7ae65f08
PATCH_ID=9fd58ab97983e5bf4896b78b1d3fa2548497d800
REPORT=.superpowers/sdd/ashley-stabilization-overnight/task-1-fix1-report.md
PARENT_REVIEW=Task 1 independent review REQUEST_CHANGES with two findings

Inspect the immutable BASE..HEAD range directly. It passes `git diff --check`
and changes only the seven listed fix source/test files. Verify that the two
review findings are closed without scope expansion:

1. dangling local refs, duplicate aliases, and target mismatches must be
   classified through the bounded malformed Thought failure path, with no
   provider-unavailable misclassification or escaping cycle promise;
2. existing opaque refs must reject positively-known wrong target domains while
   remaining allowlist-only when the current input cannot prove a target type.

Review against the current Sparse VNext design, current committed source, and
Task 1 brief. Historical freeze/acceptance documents are not current authority.
Do not modify files, run providers, redesign, or fix findings in the review.

