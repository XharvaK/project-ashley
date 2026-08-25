# Ashley OpenCode Worker — future track (not Model Fabric)

**Status:** `BOUNDED OFF-TREE FOUNDATION PROVEN; REPOSITORY INTEGRATION FUTURE; NON-NORMATIVE FOR MODEL FABRIC IMPLEMENTATION`

**Date:** 2026-08-25

This appendix exists so Model Fabric does not block a later engineering worker
and so the worker is **not** pulled into MF-M1, MF-M2, MF-M3, or MF-M4.

Current evidence boundary:

- OC-M0 physically passed the ephemeral OpenCode transport/isolation spike on
  Linux Mint.
- OC-M1 physically passed one synthetic bugfix with a temporary standalone
  Groq upstream.
- The harness was off-tree. There is no OpenCode package under `apps/`, no
  Ashley repository integration, no Model Fabric qualification, no production
  route, and no worker activation.

Track B may later request Fabric routes with `logicalRole = engineering` and a
`SpecialistRequirement` (review vs implementation). That is not a 25-purpose
enum and is not Model Fabric implementation.

```text
OPENCODE WORKER OUTPUT
  != ASHLEY TRUTH
  != AUTHORITY TO APPLY
```

The worker produces candidate work and evidence. Ashley remains the cognitive
and authority owner.

## 1. Two architectures

| Track | Purpose | Owner |
|---|---|---|
| A — Model Fabric backend | Elastic inference | Model Fabric |
| B — OpenCode Worker | Controlled repository/code work | Agency, Authority, Durable Work, Sandbox |

Track B uses models (possibly via Fabric). It does not become Fabric.

## 2. Historical assets (`CONFIRMED FROM SOURCE` / packets)

Reusable later, **frozen now**:

- `ASHLEY_OPENCODE_HARNESS_FINAL_PRE-OC-M0_ADR.md` — fail-closed Bubblewrap,
  host gateway holds secrets, OpenCode is untrusted payload, per-task
  ephemeral process, managed `opencode.json`, project-config neutralization.
- `oc-m0 result packet.json` — pin OpenCode v1.18.18, pathname socket gateway,
  filtered copy of project instruction files, `OPENCODE_DISABLE_PROJECT_CONFIG`
  and related disable flags.
- `oc-m1-groq-PASS packet.json` — one synthetic bugfix in Bubblewrap with a
  **tool-enabled** coding agent (bash+write), Groq `openai/gpt-oss-20b`,
  protocol adaptations. This is worker evidence, not inference-only evidence.

What to keep frozen: V1 broker resurrection; expanding OC-M1 tools into
production Mint; treating PASS packets as Model Fabric qualification.

What belongs to Track B: Bubblewrap profile, gateway, candidate workspace,
verification sandbox, NDJSON result model, secret exclusion.

What is useful to Track A: pin/gateway/isolation/`permission: { "*": "deny" }`
and the `POST /v1/responses` surface for that pin — **ideas and packet facts,
not copy-paste source**. The harness implementation is **off-tree** (Mint
temp + `orchestrate.js`); there is no OpenCode package under `apps/`.

Do **not** reuse for Track A: bash/write toolset, Groq TPM clamps, synthetic
tool-call interceptor, verification sandbox, candidate mutation.

## 3. Future relationship to Model Fabric

After Fabric can name a qualified coding/review model, Track B may request:

```text
logicalRole: engineering
specialistRequirement:
  seat: accepted_spec_implementation | engineering_review | ...
```

Fabric returns a route. The worker still cannot apply to Ashley's repository
without existing Sandbox / M7 / Authority gates.

## 4. Long-term story (future only)

Ashley notices a problem → Reflection / Curiosity investigates → Authority
permits inspection → durable engineering investigation → OpenCode Worker
receives a bounded task in a candidate workspace → verification evidence →
Ashley evaluates → Ashley tells the owner → optional later controlled effect
profile.

Model Fabric must not encode this as a runtime path now. It must not invent
worker authority either.

## 5. Invariants

- CandidateChangeSet / verification receipts are not truth.
- M7 `patch_export` and future effect profiles remain Sandbox/Authority.
- Durable Work owns job lifecycle; Fabric owns model delivery for model-backed
  steps.
- Tools, filesystem, and network are **required** for a worker and **denied**
  for Track A inference. Do not share one OpenCode profile.
