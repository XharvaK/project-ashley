# Roadmap Engineering-Milestone Conversion

**Status:** `SUPPORTING` documentation record

**Date:** 2026-08-23

**Kind:** Convert existing roadmap items into dependency-ordered engineering
milestones from current live state. This file does not authorize
implementation, schema change, Sandbox work, promotion, or an Event Spine.

**Canonical map:**
[`../architecture/Ashley_Architecture_Roadmap.md`](../architecture/Ashley_Architecture_Roadmap.md)
§3–§5

**Freeze:**
[`../architecture/Ashley_Architecture_Freeze.md`](../architecture/Ashley_Architecture_Freeze.md)

## 1. What this conversion does

It rebuilds the forward map without adding architecture.

Existing named items are sorted into four classes and given dependency-ordered
engineering IDs. Phase contracts remain in roadmap §6. They are not a
delivery queue.

```text
NO NEW KERNEL
NO NEW FACULTY
NO NEW BOUNDARY
NO NEW INFRASTRUCTURE PRIMITIVE
NO NEW ROADMAP PHASE
```

## 2. Live starting state (`2026-08-23`)

| Fact | Reading |
|---|---|
| Owner-selected current delivery | Sandbox Autonomy |
| `origin/master` | `9e930db` — M4 exact-candidate packet |
| M3 `PRODUCTION ACCEPTED` | `UNKNOWN` here. Cited packet file is absent |
| M4 | Design accepted, source present, packet `PROPOSED FOR ACCEPTANCE`, not production-accepted, not promoted |
| Model Fabric and later named phases | Contracts exist. Not current implementation |

## 3. Work classes

| Class | Existing items |
|---|---|
| Mechanism | Remaining Sandbox M-series; Model Fabric; Operational Continuity; Procedural Skill Graduation; Computer Use (deferred as current work) |
| Cognitive maturation | Memory / Evidence; Context Budget; Learned Autonomy; Cognitive Graduation; Relational Graduation |
| Governance specification | Self-change lifecycle specification. Evaluation remains the promotion plane |
| Deferred | Event Spine design; Computer Use implementation; voice; broad tools; self-modification execution; longitudinal evaluation campaign |

## 4. Forward order

**Now:** G0 establish M3 production acceptance from permitted evidence; G1
close M4 production acceptance; G2 promote M4 only after G1.

**Mechanism (do not reorder owner-selected edges):** M5 → M6 → M7, then F1
Model Fabric first slice, then OC1 Operational Continuity. P1 Procedural
Skill Graduation is an evidence dependency, not a general OC wait.

**Cognitive (parallel except classified deps):** C1 Memory / Evidence is the
hard predecessor of C2 Context Budget, C3 Learned Autonomy, C4 Cognitive
Graduation, and C5 Relational Graduation. C4 and C5 are siblings. Completing
Sandbox or Model Fabric does not unlock this track.

**Governance:** S1 self-change specification before apply-to-Ashley. It does
not block M5 authorship.

**Deferred:** D1–D6 stay named later work. Event Spine is not a phase.

## 5. Sequences that remain uncollapsed

Owner-selected delivery: Sandbox → Model Fabric → Operational Continuity.

Architecture-justified before advanced autonomy: Memory / Evidence
maturation → self-change specification → Context Budget → Operational
Continuity → Event Spine design later if joins require it.

## 6. What was not done

- No code, schema, Sandbox, or promotion work
- No Event Spine phase
- Wave / M-series packets not rewritten
- M3 production acceptance not inferred from M4 source

## 7. Remaining UNKNOWN / open

- M3 `PRODUCTION ACCEPTED` in this worktree
- Whether the Operational Continuity inbox is later a first Event Spine slice
- Event Spine schema and store
- Delivery vs cognitive-track scheduling after the Sandbox gate (both remain
  true; they must not be merged)
