# Ashley External Architecture Primitive Review

**Status:** Architecture research and freeze refinement only. This document
does not authorize implementation, installation, activation, credential use,
Discord send, Sandbox M5, Git effects, deployment, promotion, adoption of an
external product, an event bus, schema migration, or any external effect.

**Date:** 2026-08-23

**Predecessors (separate change sets, not required in this tree):**

- `docs/handoffs/ashley-architecture-completeness-audit.md`
  — no additional Authority-class kernel; self-change is a future lifecycle
  chokepoint, not a peer kernel.
- `docs/handoffs/ashley-functional-layer-completeness-research.md`
  — no new cognitive functional layer before later named phases.
- `docs/handoffs/ashley-event-fabric-and-architecture-freeze.md`
  — typed event spine is **Design later**, an OS primitive, not a brain.

**Question asked here:** do these four external projects expose *primitives*
that would strengthen Ashley's existing owners, substrates, or later named
phases — without expanding the architecture?

**Question not asked here:** whether Ashley should integrate Buzz, Mintlify,
Orgo, or Bezalel as products; whether another kernel, faculty, or layer is
missing; whether Event Fabric should be built now.

**Live evidence for this pass**

| Fact | Authority | Value in this pass |
|---|---|---|
| Repository HEAD | Git | `9e930db2e55770657063ceae9a6766eab2e687b7` (`origin/master`) |
| Event-spine freeze | predecessor freeze | Design later. Owner ledger is authoritative. Spine observes. `EVENT != TRUTH / PERMISSION / MEMORY ASSERTION / EFFECT WITNESS / INSTRUCTION` |
| Observability identities | `docs/architecture/Ashley_Observability_Plane.md` §4 | Distinct correlation IDs already exist. Propagation envelope is bounded. Correlation is not permission |
| Memory / Evidence | `docs/architecture/Ashley_Memory_Evidence_Architecture.md` | Source ≠ assertion ≠ retrieval. Retrieval hit ≠ belief |
| Computer Use contract | `docs/architecture/Computer_Use_Architecture.md` | Planned mechanism. Connector/procedure/semantic UI before visual fallback. Not generic agency |
| Cross-phase effect laws | `docs/architecture/Ashley_Cross_Phase_Architecture.md` | `RECEIPT IS NOT EFFECT WITNESS`. `PREPARE -> REVALIDATE -> COMMIT FOR CONSEQUENTIAL EFFECTS`. Tool present ≠ authority |
| Buzz (inspected) | [block/buzz](https://github.com/block/buzz) README, ARCHITECTURE.md, engineering post | Signed Nostr events, Schnorr identity, hash-chain audit, relay as workspace SoT |
| Mintlify (inspected) | mintlify.com, docs on `llms.txt` / Markdown negotiation / assistant | Agent-readable documentation projection, not a memory store |
| Orgo (inspected) | orgo.ai docs/`llms.txt`, OpenAPI | Cloud Linux desktops for agents; snapshots/clone; not an agent and not authority |
| Bezalel (inspected) | bezalel.sh / `docs.md` / `llms.txt` | Hosted personal capability plane over one MCP URL (memory, mail, money, computer, sandboxes, connectors) |

Architecture status is not delivery status. Inspecting an external project is
not adopting it.

---

## 0. Method

A primitive is worth borrowing only if it names a *mechanism* Ashley already
needs, or a constraint that makes an existing owner more honest.

| Keep / ignore | Adapt internally | Adopt / integrate |
|---|---|---|
| Marketing surface, vendor runtime, collapsed “do everything” plane | Envelope, audit, projection, isolation *ideas* under Ashley laws | Almost never. Ashley owns meaning and permission |

This pass prefers **internal equivalents under Ashley's laws** over product
adoption. Compatibility with Buzz, if any, means “build a small local analog
later,” not “run Buzz.”

Recommendation vocabulary:

| Word | Meaning |
|---|---|
| **Adopt** | Take the product or protocol as an Ashley subsystem |
| **Adapt** | Steal a mechanism idea; implement later under existing owners |
| **Monitor** | Relevant to a named later phase; do not design now |
| **Reject** | Wrong owner, wrong shape, or would collapse a freeze |

---

## 1. External primitive map

```text
Project
  -> Primitive
    -> Ashley subsystem
      -> Recommendation
```

| Project | Underlying problem | Primitive | Ashley home | Recommendation |
|---|---|---|---|---|
| Block Buzz | Human–agent coordination with a shared, attributable history | Signed event log + Schnorr identity + hash-chain audit | Future Event Spine (observe) + Observability (correlation) + Stewardship (human vs agent authorship). **Not** Agency, Memory, or Authority | **Adapt** envelope/audit/authorship ideas later. **Reject** Buzz-the-product, relay-as-SoT, hive-of-peers, event-derived workspace state |
| Mintlify | Making durable written knowledge ingestible by models without becoming the knowledge | Documentation-as-context projection (`llms.txt`, Markdown negotiation, cited retrieval) | Context Budget (projection) + Honesty (what may be claimed) + Identity (stable self-description *content*). **Not** Memory / Evidence | **Adapt** projection pattern when Context Budget is designed. **Reject** a Knowledge layer and Mintlify-as-memory |
| Orgo | Isolated, snapshottable computer the agent does not own | Cloud desktop / VM execution environment (clone, snapshot, input API) | Computer Use mechanism (later) behind Authority → Capability → Sandbox/effect. **Not** Authority | **Monitor** until Computer Use. **Adapt** isolation/snapshot ideas then. **Reject** “computer available ⇒ computer authorized” |
| Bezalel | One socket for all personal capabilities | Capability plane / MCP aggregator (memory + mail + money + computer + connectors) | Anti-pattern relative to Capability, Authority, Memory, Sandbox, Continuity | **Reject** as architecture. **Monitor** only as a reminder that inbound events ≠ instructions and token scopes ≠ authority |

No candidate is a cognitive owner. None is a missing kernel.

---

## 2. Block Buzz — deep analysis

### 2.1 Problem it actually solves

Not “AI chat.” Coordination: humans and agents sharing one attributable
history so work does not die inside private sessions.

Block's own diagnosis: models can do the work; teams still need somewhere to
do it together. The bottleneck moved from intelligence to coordination.

### 2.2 Primitive

A **signed event log as the workspace**:

- every action is a Nostr event (`id`, `pubkey`, `kind`, `tags`, `content`,
  `sig`);
- Schnorr verification before persist;
- identity is a keypair (human and agent same shape);
- agent keys are delegated, not borrowed human credentials — authorization
  does not erase authorship;
- `buzz-audit` hash-chain (`prev_hash`, `verify_chain()`);
- relay is the single source of truth; collaboration state is the log plus
  projections (channels, search, workflows, git announcements).

Important Buzz sentence (Git storage): workspace events *announce* a pointer
advance; they do *not* define Git reality. That split is the useful part.

### 2.3 Fit against Ashley's freeze

Buzz:

```text
Event
  -> collaboration state
```

Ashley freeze:

```text
Owner commits transition
  -> authoritative owner ledger
  -> optional typed event spine
        -> observation
        -> reconstruction
```

Buzz inverts Ashley. The log *is* the room. Ashley's spine must not become
the room.

Ashley is also not a multi-agent hive. She is one subject. Doc is the human
counterpart (Stewardship / Discord), not a peer agent in a swarm. Buzz's
“agents are members” is a *team product* primitive, not an Ashley cognitive
primitive.

| Buzz idea | Borrow? | Ashley constraint |
|---|---|---|
| Immutable signed transition records | Adapt later | Spine records that an owner committed; it is not the commit |
| Schnorr / signatures | Adapt only if a later audit requirement needs tamper-evidence of the spine itself | Single-host SQLite does not need Nostr. Signature ≠ permission |
| Provenance (who authored vs who authorized) | Adapt into Observability + Stewardship / self-change composition | Authorizer ≠ author is already the self-change lesson |
| Human–agent collaboration room | Reject as Ashley runtime | Discord + Stewardship already own Doc↔Ashley. Do not import a hive |
| Workspace state from events | Reject | Owner ledgers own state. Spine does not |
| Workflow engine on the log | Reject | Agency decides; Operational Continuity owns durable work; YAML automation is not Thought |
| Hash-chain audit | Adapt later as optional spine integrity | Tamper-evidence of the observation log ≠ truth of the world |
| Git: events announce, objects define | Adapt as a law | `SPINE ANNOUNCES. OWNER LEDGER DEFINES.` |
| Relay as SoT | Reject | Each semantic owner is SoT in its domain |
| Adopt Buzz | Reject | Wrong product, wrong subject model, wrong SoT |

### 2.4 Recommendation

**Adapt, do not adopt.**

If Buzz is the closest cousin, the outcome is still: Ashley later builds a
*small internal equivalent of the useful primitive under her own laws* — a
typed, optional, observe-only spine with an envelope and maybe a hash-chain —
not a Buzz relay, not a hive, not a second brain.

Compatible pieces for a later spine design note (not a build ticket):

- envelope: `eventId`, `kind`, `committedAt`, `ownerId`, `sourceOwner`
  (Identity, Agency, Sandbox, …), `correlationIds` (existing Observability
  set), `payloadRef` or bounded digest — not a dump of semantic truth;
- provenance: who committed; optional who authorized;
- reconstruction: join owner ledgers via IDs; never replay effects;
- integrity: optional hash-chain over spine rows.

Preserve:

```text
EVENT != TRUTH
EVENT != PERMISSION
EVENT != MEMORY ASSERTION
EVENT != EFFECT WITNESS
EVENT != INSTRUCTION
SPINE ANNOUNCES. OWNER LEDGER DEFINES.
```

---

## 3. Mintlify — deep analysis

### 3.1 Problem it actually solves

Durable documentation is useless to models if it is only HTML for humans.
Mintlify's real primitive is **knowledge projection**: the same canonical
docs become Markdown, `llms.txt` indexes, and cited retrieval for agents.

It does not solve belief, memory, or identity. It solves *ingestibility and
citation of already-owned writing*.

### 3.2 Primitive

Documentation-as-context:

- `llms.txt` / `llms-full.txt` as a catalog of pages;
- content negotiation (`Accept: text/markdown` or `.md`);
- assistant that searches published docs and cites, and refuses when the
  corpus does not contain the answer.

### 3.3 Would Ashley need an “Ashley Knowledge Surface”?

A structured self-description *document* (Identity, principles, architecture,
capabilities, known limits, decisions, contracts) is already how this
repository works. That is **canonical writing**, not a new owner.

| Proposed surface | Already owned by |
|---|---|
| Identity, principles | Identity + Constitution / Core Principles |
| Architecture, contracts | Architecture docs (this corpus) |
| Capabilities, known limits | Capability + Honesty + capability-self-model |
| Decisions, lessons | Memory / Evidence (episodes, revisions) *or* architecture decision records — do not mix |
| “What may enter a turn” | Context Budget |

Mintlify is:

- a useful **documentation pattern** (yes, for humans and for future
  Context Budget projections of *architecture/identity text*);
- a **context projection pattern** (yes — bounded, citable, not the source);
- not a **self-model mechanism** (Identity + Honesty already own that);
- not Memory / Evidence (lived episodes, provenance, contradiction).

Do **not** create a Knowledge layer. Memory / Evidence owns what happened and
what is asserted. Context Budget owns which bounded projection is in
attention. Honesty owns what must not be claimed. A docs site is a
projection target, not an owner.

Cognitive Graduation may later *cite* durable self-description and lessons.
It still must not read Mintlify (or `llms-full.txt`) as belief.

### 3.4 Recommendation

**Adapt** the projection pattern when Context Budget is designed (typed,
inspectable projection of persistent *documents*, distinct from Recall).

**Reject** Mintlify as a product dependency, as memory, and as a new box.

---

## 4. Orgo — deep analysis

### 4.1 Problem it actually solves

Agents often need a *computer they do not own*: a disposable or persistent
Linux desktop with screenshot/click/type/bash, snapshots, clone, and an API.

Orgo's own non-claims are correct and useful: it is not a browser-only
sandbox, not an AI agent, not a general cloud. It is an execution substrate.

### 4.2 Primitive

Isolated **execution environment**: VM lifecycle, golden snapshots/templates,
clone (disk state), input API, optional MCP wrapping of the same API.

### 4.3 Where it may sit later

```text
Authority          (may this exact effect happen now?)
  -> Capability    (may this faculty execute?)
    -> Computer Use adapter
      -> Orgo-like environment   (mechanism only)
```

Ashley already owns the left side. Sandbox V2 is the *engineering workshop*
(Bubblewrap, named M-series). Computer Use is a *later* semantic-UI /
visual-fallback mechanism on External Effect. Orgo is a possible *host* for
that later mechanism, analogous to how a cloud VM is not Agency.

| Borrow later | Remain Ashley-owned | Violation if collapsed |
|---|---|---|
| Snapshot / clone / isolate a desktop | Whether to act (Agency) | Computer exists ⇒ may use it |
| Action API as untrusted I/O | Exact-effect permission (Authority) | Screenshot success ⇒ effect witness |
| Template as environment profile | Capability gates | MCP tool list ⇒ capability |
| Persistence of a VM disk | Continuity of *Ashley*, not of a rented desktop | VM snapshot ⇒ Memory |

`COMPUTER AVAILABLE != COMPUTER AUTHORIZED` is the same family as
`TOOL PRESENT IS NOT AUTHORITY TO USE IT`.

Do not route Computer Use through Sandbox as if they were one isolation
story. Sandbox is named engineering borders. Computer Use is application
surface control. Orgo-like VMs are a mechanism for the latter, not a merge
of the two.

### 4.4 Recommendation

**Monitor** until Computer Use is the owner-selected phase.

**Adapt** isolation/snapshot/clone ideas then, possibly as a vendor or as an
internal VM profile — still behind Authority.

**Reject** as current work, as Authority, as Sandbox replacement, and as
any implication that availability is permission.

---

## 5. Bezalel — deep analysis

### 5.1 Classification first

Bezalel is primarily a **hosted personal capability plane**: one MCP URL +
bearer token exposing memory, email, money, texting, a cloud computer,
sandboxes, and third-party connectors, plus inbound event wake-ups.

It is **not** primarily:

- an agent runtime / model host (it says so);
- a workflow engine;
- Computer Use (computer is one domain among many);
- developer docs tooling;
- orchestration of Ashley's Thought/Agency.

It is a **collapsed capability + memory + I/O + payment** socket.

### 5.2 Primitive after classification

Token-scoped tool multiplexor + shared durable memory + inbound event
router.

Useful reminder, dangerous product shape:

- inbound text/email as *wake* ≠ instruction (Ashley already:
  `EVENT != INSTRUCTION` in Operational Continuity recon);
- token scopes as *capability labels* ≠ Authority;
- one URL for everything trains the wrong instinct: whatever is plugged in
  is allowed.

### 5.3 Recommendation

**Reject** as architecture. Ashley must not grow a Bezalel-shaped superplane.

**Monitor** only as a negative example and as a reminder that later
connectors (mail, payments, computer) each need their own Authority policy
and Memory/Evidence provenance — never a shared “plane owns the person.”

Do not extract a “memory primitive” from Bezalel. Ashley's Memory / Evidence
is the opposite of “session transcripts banked and distilled into facts in
the background.”

---

## 6. Event Spine refinement

External examples refine the *later* spine. They do not justify building it
now, and they do not add a box.

### 6.1 What improves the later design

| Addition | Source | Ashley use |
|---|---|---|
| Event envelope | Buzz NIP-01 shape | Typed fields on an observation record |
| Provenance | Buzz authorship vs authorization | `committedBy` / optional `authorizedBy`; never a grant |
| Signatures / hash-chain | Buzz Schnorr + `buzz-audit` | Optional integrity of the spine, not world truth |
| Correlation IDs | Already in Observability §4 | Spine *carries* them; it does not invent a second identity system |
| Reconstruction model | Buzz search-the-room vs Ashley join | Reconstruct by joining owner ledgers; spine is the index |
| Replay restrictions | Buzz workflows vs Ashley effect law | No subscriber re-execution. No `PREPARE` from a log read |
| Announce vs define | Buzz Git pointer vs events | Spine announces; owner ledger defines |

### 6.2 What Buzz must not teach

- The log is the workspace.
- Subscribers are how work happens.
- Humans and agents are interchangeable members of Ashley.
- A workflow engine on events is Agency.

### 6.3 Laws (unchanged, restated)

```text
EVENT != TRUTH
EVENT != PERMISSION
EVENT != MEMORY ASSERTION
EVENT != EFFECT WITNESS
EVENT != INSTRUCTION
SPINE ANNOUNCES. OWNER LEDGER DEFINES.
LOG PRESENCE IS NOT EVENT AUTHORITY
RECONSTRUCT != REPLAY
```

Correlation IDs remain Observability's set. Do not collapse `decisionId`,
`effectWitnessId`, `workConcernId`, etc. into one “Buzz event id.”

---

## 7. Architecture impact

**Did any project reveal a missing infrastructure primitive?** No.

Event envelope / audit-chain ideas belong on the already-frozen **later
Event Spine**. Isolation/snapshot belongs on already-named **Computer Use**.
Doc projection belongs on already-named **Context Budget**.

**Did any project reveal a missing boundary?** No.

Authority, Capability, Sandbox, Honesty, External Effect already cover
permission vs availability vs isolation vs claim. Bezalel is a warning
against collapsing them. Orgo is a warning against availability-as-permission.

**Did any project reveal a missing cognitive owner?** No.

Buzz's hive is not a faculty. Mintlify's docs are not Thought. Bezalel's
shared memory is not Memory / Evidence.

**Explicit:** after this review, the architecture does not gain a box.

---

## 8. Updated Ashley architecture

Unchanged from the Event Fabric freeze. No new owners.

### Cognitive owners

Identity · Mind State · Thought · Agency · Reflection · Relationship ·
Curiosity

(Perception, open cognitive items, Expression → Rendering remain supporting
mechanisms, not peers.)

### Boundary / control owners

Authority · Capability · Sandbox · Honesty · Evaluation / Qualification ·
Stewardship · External Effect · Attention (resource, not salience)

Self-change remains a composed lifecycle chokepoint, not a kernel.

### Persistence / evidence

Memory / Evidence · Continuity

### Infrastructure

Operational Continuity · Context Budget · Model Fabric · Observability ·
future typed Event Spine (design later; OS primitive)

Computer Use remains a **named later phase / mechanism**, not a new
cognitive or authority owner. An Orgo-like VM would sit under it, never
beside Authority.

---

## 9. Roadmap impact after Sandbox

**No reorder.** The previous freeze stands:

Before advanced autonomy:

1. Memory / Evidence maturation
2. Self-change lifecycle specification (before apply-to-Ashley; M5
   authorship still unblocked)
3. Context Budget
4. Operational Continuity
5. Event Spine design later, when recovery/correlation actually require a
   join — now with a slightly sharper envelope/announce-vs-define note,
   still not a build

Model Fabric remains mechanism work, not cognitive advancement.

Computer Use / Orgo-like environments stay deferred with voice, broad
tools, and self-modification execution.

Mintlify-style doc projection is a Context Budget design detail, not a
phase.

Do not insert “adopt Buzz” or “stand up Bezalel” anywhere.

---

## 10. Final decision

After reviewing these external architectures, **Ashley does not need
anything new.**

These projects mainly provide **implementation inspiration for
already-defined subsystems**:

- Buzz → later Event Spine envelope, provenance, optional integrity, and
  the announce/define split — built internally, tiny, under Ashley law;
- Mintlify → Context Budget / docs projection, not Memory;
- Orgo → Computer Use execution substrate, later, behind Authority;
- Bezalel → negative example of a collapsed capability plane.

The objective remains ownership clarity that can survive long-term
autonomy, not a larger diagram.
