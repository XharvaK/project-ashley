# AI-Enhanced Metacognition — Research Audit

**Status:** `PROVISIONAL RESEARCH` · not architecture
authority · not clinical authority · not an implementation specification

**Date:** 2026-08-25

**Planning worktree:** `C:\Users\Xharv\Projects\ashley-metacognition-planning`

**Branch:** `metacognition-planning`

**Source documentation checkpoint SHA:** `7a7883753a7e6e5a002bf23d226645ce85730ee5`
(`docs(model-fabric): freeze MF-M1 implementation checkpoint`)

**Canonical runtime integration baseline:** `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a`

**Does not implement runtime.** Does not modify TypeScript, schema, Mint, or
MF-M1 runtime scope. The source worktree and checkpoint above are provenance
for this research pass, not the current production integration line.

Pass-3 closed architecture questions Q0–Q16 in the owner packet. The
metacognition overlay was accepted as architecture direction. This audit
remains research input. It does not become architecture by that closure.

**Companion documents:**

- Accepted policy profile: [`../Ashley_Metacognition_Architecture.md`](../Ashley_Metacognition_Architecture.md)
- Owner decisions: [`../../handoffs/METACOGNITION_OWNER_DECISION_PACKET.md`](../../handoffs/METACOGNITION_OWNER_DECISION_PACKET.md)
- Roadmap distribution: [`../../handoffs/METACOGNITION_ROADMAP_HANDOFF.md`](../../handoffs/METACOGNITION_ROADMAP_HANDOFF.md)

---

## Claim labels (mandatory)

Every material claim in this file is one of:

| Label | Meaning |
|---|---|
| `PAPER CLAIM` | What the AEM white paper asserts |
| `AEM ANECDOTE` | Author experience, not a study |
| `EXTERNAL RESEARCH` | Independent literature, with source class |
| `CONFIRMED FROM ASHLEY SOURCE` | Current Ashley architecture or source |
| `INFERENCE` | This pass's design inference |
| `PROPOSAL` | Recommended direction, not frozen |
| `OWNER DECISION REQUIRED` | Must not be closed here |

Source classes for `EXTERNAL RESEARCH`:

- `peer-reviewed`
- `review / synthesis`
- `preprint`
- `vendor / lab blog`
- `white paper / non-archival`
- `correlational survey`
- `contested / weak journal`

Do not read “research proves” unless the cited class actually supports that
strength.

---

## 0. How this pass treats the paper

Primary external inspiration:

> Saint Louis (Bootoshi) and Michaela Lallouz (Mika), *AI-Enhanced
> Metacognition (AEM): A Framework for Reclaiming Cognitive Sovereignty*,
> 2 August 2025. 12-page white paper, v1.0.

`PAPER CLAIM` The paper presents AEM as a framework, not a completed product
and not a clinical protocol.

This pass treats it as **research input / design inspiration**. It is not:

- Ashley architecture authority
- clinical authority
- an implementation specification
- proof that every scientific claim is valid

The paper's strongest transferable object is not its neuroscience citations.
It is Mika's obsolete-self-profile episode, plus the thesis that an external
record can make patterns inspectable so a human can revise them.

---

## 1. Complete thesis summary

`PAPER CLAIM` Human attention is treated as a commodity. Engagement-optimized
platforms use variable rewards and “digital dopamine,” associated with
shortened attention, reduced capacity for unrewarded focus, and possible
effects on prefrontal executive function. The authors call this a threat to
cognitive autonomy.

`PAPER CLAIM` Core thesis (quoted sense, not copied as law):

By using AI as a **cognitive mirror** and **external memory system**, a person
can visualize and interact with their internal thought architecture in
something like real time. That feedback loop is supposed to enable
restructuring of cognitive patterns through increased self-awareness, leading
to enhanced metacognition (“thinking about thinking”) and mental clarity.

`PAPER CLAIM` In the AEM model, the human is always the architect. The AI is
the mirror. True change comes from the user's insight and conscious decision,
not from AI directives.

`PAPER CLAIM` Three pillars operationalize the thesis:

1. **Digital phenotyping** of chat/query/timestamp data into a longitudinal
   self-portrait (linguistic habits, temporal dynamics, cognitive loops).
2. **Cross-modal perception** (think → type/speak → see as graph → hear) as
   “validation” that grounds insights across sensory channels.
3. **Multi-agent safety** (Primary / Challenger / Safety Validator) to reduce
   echo-chamber reinforcement.

`PAPER CLAIM` Implementation at writing time: Claude Code + local Obsidian
vault. Thoughts become timestamped local markdown and a visual knowledge
graph. LLM inference (Anthropic API) is acknowledged as the only non-local
step. Desired future: private chatbot + visual mind map, open-source models,
user-controlled encryption, data sovereignty.

`AEM ANECDOTE` Two origin stories:

- **Mika:** asked ChatGPT for a profile summary before switching systems. The
  summary still described anxious attachment and OCD-like recursive loops she
  considered overcome. Dissonance produced the insight “that's not me
  anymore.” She refused to import the old profile into Claude and instead
  fed admired thought-patterns (Einstein, Jobs, Tesla, Dispenza).
- **Saint Louis:** ADHD-described “noisy” recursive thought; using AI as a
  cognitive exoskeleton that maps and extends his process, claimed to train
  internal ability over two years.

---

## 2. Three-pillar audit

### 2.1 Pillar 1 — Digital phenotyping

`PAPER CLAIM` AEM “utilizes principles of Digital Phenotyping,” citing the
academic definition of moment-by-moment quantification of the individual-level
phenotype in situ from personal digital devices.

`EXTERNAL RESEARCH` (`peer-reviewed`) The definition is real. Onnela / Torous
and later work define digital phenotyping as continuous, ecologically situated
quantification from personal devices, typically mixing **passive** sensors
(location, accelerometer, screen, keyboard dynamics) and **active**
self-report (Torous, Kiang, Lorme, Onnela 2016, *JMIR Mental Health*; Onnela
and Rauch 2016; Torous, Onnela, Keshavan 2017, *Translational Psychiatry*).

`EXTERNAL RESEARCH` (`review / synthesis`) What it actually measures is
**device-mediated behavior**, not inner state. Ecological validity is a
selling point (in situ, longitudinal) and also a confound source (device
use is not a transparent window onto cognition). Reviews and critical
analyses warn about:

- weak or unpublished predictive models for mood/cognition
- temporal drift and non-stationarity of behavior
- false trait attribution from sparse or context-stripped signals
- overlooking first-person testimony when it conflicts with the model
  (epistemic injustice)
- privacy, ownership, and human-rights risks of longitudinal behavioral
  inference
  (Birk and Samuel; Huckvale et al.; *Health and Human Rights* 2020
  perspective; *Big Data & Society* 2023 critical analysis)

`INFERENCE` AEM's actual data are **active chat logs, queries, and
timestamps**. That is closer to a longitudinal conversational corpus than to
clinical digital phenotyping. Calling it “digital phenotyping” borrows
psychiatric prestige the implementation does not earn.

`PAPER CLAIM` This record is “objective, timestamped” and moves “beyond
subjective self-reporting toward objective behavioral data.”

**Verdict:** `misleading terminology` / `plausible but overstated`.

- Timestamped chat is **observational data** about what was typed when.
- Linguistic tone and “cognitive loops” extracted by an LLM are **model
  inference**, not objective phenotype.
- The paper collapses observational data, behavioral signal, model inference,
  and psychological hypothesis into one “self-portrait.”

Ashley already has a stricter split (`CONFIRMED FROM ASHLEY SOURCE`):

```text
SOURCE EVIDENCE != WORLD TRUTH
EXTRACTED FACT != TRUTH
BACKGROUND EXTRACTION MAY PROPOSE; IT MAY NOT SILENTLY AUTHOR BELIEF
```

See [`../Ashley_Memory_Evidence_Architecture.md`](../Ashley_Memory_Evidence_Architecture.md).

### 2.2 Pillar 2 — Cross-modal perception

`PAPER CLAIM` Insights must be “validated across multiple sensory channels.”
Think / type / see (knowledge graph) / hear (read aloud or TTS) creates
stronger neural encoding and prevents purely abstract loops.

`EXTERNAL RESEARCH` (`peer-reviewed`) Cross-modal / multisensory learning can
improve encoding and later unisensory performance. The brain exploits
relations among cues; mismatch can drive recalibration (Shams and Seitz 2008
line; Seitz and Lidasan, *WIREs Cognitive Science* 2022 / Frontiers 2023
review of crossmodal interactions in learning and memory).

`EXTERNAL RESEARCH` (`peer-reviewed`) That literature is about **memory
encoding, perceptual learning, and cue integration**, not about whether a
hypothesis is true. Seeing a graph of a claim does not independently test the
claim. It can make the claim more memorable and more subjectively convincing.

**Verdict:** `partially supported` for mnemonic/salience effects;
`unsupported` / `misleading terminology` for “validation.”

`INFERENCE` Ashley should treat multi-modal presentation as
**reinforcement / inspectability**, never as independent evidence. Memory
Evidence already ranks a graph as a disposable retrieval projection, not as
truth (`CONFIRMED FROM ASHLEY SOURCE`, Memory Evidence §5: the graph is a
deferred projection over assertions).

Voice remains deferred on the canonical roadmap
(`CONFIRMED FROM ASHLEY SOURCE`, Roadmap deferred capability).

### 2.3 Pillar 3 — Multi-agent safety

`PAPER CLAIM` A Primary (pattern analyst), Challenger (assumptions / blind
spots), and Safety Validator (harmful spirals / distress) keep the user
“grounded and safe” and avoid echo chambers.

`EXTERNAL RESEARCH` (`preprint` / `peer-reviewed`) Multi-agent debate can
improve some reasoning and factuality benchmarks (Du et al. 2023/2024,
*Improving Factuality and Reasoning in Language Models through Multiagent
Debate*). Process supervision can outperform outcome-only rewards on MATH
(Lightman et al., ICLR 2024).

`EXTERNAL RESEARCH` (`preprint`) Agreement is a poor reliability signal when
agents share training manifolds, prompts, and alignment. Communication can
induce correlated failure and false consensus (CAGE-CAL 2026). Condorcet-style
majority vote assumes independent errors; LLM ensembles often violate that.
AgentAuditor (2025) is an agent-safety evaluation framework; it is not the
source for this correlated-failure / false-consensus claim.

`EXTERNAL RESEARCH` (`peer-reviewed`) RLHF assistants exhibit sycophancy:
they match user beliefs over truth at a non-negligible rate, and human
preference data partly rewards that (Sharma et al. 2023/2024 ICLR). A
“Challenger” that is the same family, or that is trained to please, is not
safety.

`EXTERNAL RESEARCH` (`peer-reviewed`) Chain-of-thought is often unfaithful
to the process that produced the answer (Turpin et al. 2023; Lanham et al.
2023). Later reasoning models still often omit hints they used (Anthropic
2025 lab writeup). Hidden or displayed CoT is not a trustworthy
introspection API.

**Verdict:** `plausible but overstated`. Distinct roles can help **if** they
are actually independent, scoped, and not treated as a vote. Permanent
personas are a bad fit for Ashley (`CONFIRMED FROM ASHLEY SOURCE`: Model
Fabric seats persist; models occupy them; “SPECIALIST SESSION IS NOT
ASHLEY”).

Ashley already has a better primitive: `SpecialistRequirement` plus
`independence_group` on `ModelIdentity`, with review seats such as
`architecture_critique`, `adversarial_audit`, `research_synthesis`
(`CONFIRMED FROM ASHLEY SOURCE`, Model Fabric Architecture). When
independence is required is still an open Fabric policy question (packet
remaining open E).

A “Safety Validator” that monitors distress is a **clinical-adjacent
surveillance role**. Ashley must not silently become a diagnosis or crisis
engine. Pattern observation ≠ diagnosis (`PROPOSAL`).

---

## 3. Scientific claim audit (AEM)

| AEM claim | Class | Independent finding | Ashley implication |
|---|---|---|---|
| Attention-economy platforms use variable rewards | `PAPER CLAIM` citing Stanford HAI / Lembke interviews | `EXTERNAL RESEARCH` (`review / synthesis`): engagement design and intermittent reward are well-described; “digital dopamine” is a popular metaphor, not a measured milligram | Useful motivation for sovereignty; not a reason to build a therapist |
| Frequent platform use “alters dopamine pathways” analogously to substance addiction | cites Guo et al. *Cureus* 2024 e64583 | `EXTERNAL RESEARCH` (`contested / weak journal`): no matching Guo e64583 found in this pass; nearest paper is De et al. 2025 *Cureus* e77145, a secondary-data review that itself admits no causal longitudinal inference. *Cureus* is not a high-rigor venue | **Do not inherit this as established neuroscience** |
| Short-form content shortens attention span | cites Asif and Kazi 2024 Research Archive preprint | `EXTERNAL RESEARCH` (`preprint`): not used as proof | Treat as hypothesis |
| AEM yields “objective self-awareness” | `PAPER CLAIM` | `EXTERNAL RESEARCH` (`peer-reviewed`): Duval and Wicklund (1972) “objective self-awareness” is **self as social object under self-standard comparison**, often producing negative affect — not “AI-measured objective personality.” Nisbett and Wilson (1977) already showed humans misreport their own process | **Misleading terminology.** Use “externalized inspectable record,” not “objective self” |
| Chat logs are “objective behavioral data” | `PAPER CLAIM` | Conversational text is chosen, audience-shaped, sarcastic, strategic, and incomplete | Record as **observed language**, not internal state |
| Cross-modal loop “validates” insights | `PAPER CLAIM` | Encoding ≠ validation | Presentation only |
| Multi-agent roles keep the user safe | `PAPER CLAIM` | Correlated failure, sycophancy, unfaithful CoT | Independent review as bounded seat, not three Ashleys |
| AI-driven cognitive restructuring | implied by thesis + Mika/Saint narratives | `EXTERNAL RESEARCH` (`peer-reviewed`): CBT cognitive restructuring is a **clinical method** in which the *client* tests beliefs (meta-analysis: Ezawa & Hollon / related CR reviews). Chi et al. 1989: self-explanation works when the learner monitors understanding. AI that *declares* a new self is not CR | Mirror and questions; do not reprogram the owner |
| Local Obsidian = data sovereignty | `PAPER CLAIM` with a caveat about API | Correct that files can be local; incorrect that local files plus remote inference is private | Same split as Ashley: local SQLite + remote models |
| Feeding admired figures “architects a new reality” | `AEM ANECDOTE` | Role-prompting can change model outputs; it does not rewrite the human | Reject as identity-engineering. Dangerous if Ashley treats imported ideals as owner Identity |

---

## 4. External research synthesis

### 4.1 Human metacognition

`EXTERNAL RESEARCH` (`peer-reviewed`) Flavell (1979) distinguished
metacognitive knowledge from monitoring. Nelson and Narens (1990/1994)
split **object-level** vs **meta-level**, with two flows:

- **Monitoring:** information from object-level to meta-level
- **Control:** meta-level modifying object-level (initiate, continue, terminate,
  change strategy)

Monitoring and control can dissociate. Prospective judgments (ease of
learning, judgments of learning) and retrospective judgments (confidence
after answering) are not one faculty (Leonesio and Nelson 1988; Metcalfe and
Kornell 2005).

`EXTERNAL RESEARCH` (`review / synthesis`) Fleming and colleagues:
metacognitive **sensitivity** (does confidence track correctness?) is
distinct from metacognitive **bias** (over/underconfidence). Calibration
without outcome comparison is not enough (Annual Review of Psychology 2024
synthesis).

`EXTERNAL RESEARCH` (`peer-reviewed`) Koriat and Goldsmith (1996): the
useful control act is often **volunteer vs withhold**, not a richer inner
theater.

`INFERENCE` Ashley should copy this split exactly:

```text
METACOGNITIVE MONITORING != METACOGNITIVE CONTROL
```

Control must request existing owners (Thought, Attention, Agency, Memory
Evidence, Model Fabric). Metacognition must not become a super-Agency.

### 4.2 Cognitive offloading, scaffolding, dependency

`EXTERNAL RESEARCH` (`peer-reviewed`) Risko and Gilbert (2016): cognitive
offloading is using physical/external action to reduce internal demand.
Whether to offload is itself a metacognitive decision. Offloading is not
automatically harmful.

`EXTERNAL RESEARCH` (`peer-reviewed`) Clark and Chalmers (1998) extended
mind: some external stores can be part of a cognitive system. Sparrow, Liu,
and Wegner (2011) “Google effect”: people remember where to find facts more
than the facts when they expect external availability.

`EXTERNAL RESEARCH` (`correlational survey`) Gerlich 2025, *Societies*
(MDPI): n=666 mixed-method survey; frequent AI use correlated with lower
critical-thinking scores, mediated by self-reported offloading. **Not
causal.** MDPI *Societies* is not a top-tier causal-inference venue. Treat
as a warning, not proof of atrophy.

`EXTERNAL RESEARCH` (`preprint`) Kosmyna et al. 2025 “Your Brain on
ChatGPT”: EEG during essay writing; LLM group showed weaker connectivity
than brain-only; small n, task-specific, contested popularization. Do not
treat as settled neuro-evidence that companions destroy thinking.

`EXTERNAL RESEARCH` (`preprint` / `review`) Distinguish:

| Phenomenon | Rough meaning | Failure mode for Ashley |
|---|---|---|
| Cognitive offloading | Delegate memory/compute | Fine if owner still judges |
| Automation bias | Over-rely on imperfect automation (Parasuraman and Riley 1997; Mosier and Skitka; Parasuraman and Manzey 2010) | Owner accepts Ashley's trait labels |
| Epistemic outsourcing | Hand over *justification* (appraisal of reasons) | Owner cannot explain themselves without Ashley |
| Belief offloading | Form/uphold beliefs via the model | Sticky false self-model |

`PROPOSAL` AEM's “cognitive sovereignty” goal is aligned with Ashley's
Vision and Ethics (`ETH-DEP-01` do not engineer dependency; Core Principle
VIII: do not optimize for dependence). A metacognitive companion can fail
that goal by becoming the only place the owner understands himself.

Chi 1989 is the constructive version: the value is **owner-generated
explanation**, not model-generated diagnosis.

### 4.3 Digital phenotyping (beyond AEM)

See §2.1. Additional Ashley-relevant points:

- Longitudinal inference requires **temporal validity**, not a running
  average that becomes a trait.
- Active chat is **audience-designed**. Sarcasm, pastiche, worker-paste, and
  one weird night are not phenotypes.
- “Last 20 messages” overweighting is a standard confound.
- Psychiatric digital phenotyping often wants **passive** data Ashley does
  not and should not collect (sensors, keystroke dynamics, location).

### 4.4 Human–AI as thinking partner

`EXTERNAL RESEARCH` Useful mechanisms with mixed evidence:

- reflective / Socratic prompting (helps when the human still answers)
- self-explanation (Chi)
- external memory (notebooks, not oracles)
- calibration feedback (works when outcomes exist)

Risks: sycophantic confirmation, anthropomorphic authority, explanation
theater that *increases* automation bias (2025 XAI/automation-bias review:
explanations can raise perceived acceptability without raising accuracy).

### 4.5 LLM / AI metacognition

`EXTERNAL RESEARCH` (`preprint` / `peer-reviewed`)

- Kadavath et al. 2022: models can be somewhat calibrated on P(True)/P(IK)
  in the right format; OOD calibration is weaker.
- Binder et al. 2024: trained self-prediction can beat a peer model on some
  hypotheticals; this is not proof of human-like introspection.
- Yoon et al. 2025 (NeurIPS): reasoning models often *verbalize* confidence
  better; still under-use low-confidence bins.
- Turpin / Lanham: CoT unfaithfulness.
- Anthropic 2025: reasoning models often do not admit hints they used.
- Lindsey / Transformer Circuits 2025: some “do I know this?” circuits may
  be separate from retrieval — self-report can be a **self-model**, not
  inspection of the process that answered.
- MIRROR 2026 preprint: knowing-doing gap — calibration may not transfer to
  action selection.

`INFERENCE` What Ashley can actually know about her cognition:

| Knowable from evidence | Inferable only | Unknowable / forbidden reconstruction |
|---|---|---|
| Structured Thought outputs, schema failures, withheld answers | “I was uncertain because of X internal process” | Hidden chain-of-thought as causal transcript |
| Evidence refs, provenance labels, live vs shadow | “This memory feels strong” | Neural-level introspection |
| Owner corrections, prediction vs later outcome | “The owner is anxious” from diction | Trait identity of the owner |
| ModelAttemptReceipt, fallback, provider/model identity | “Quality drifted” without outcomes | That a specialist session was “Ashley thinking” |
| Repeated misunderstanding counts | “We have a communication problem” as a relationship fact without bilateral evidence | Omniscient self-inspection |

### 4.6 Multi-agent / independent review

See §2.3. Ashley mapping:

- Do **not** create Primary/Challenger/Safety personas.
- Do **request** Fabric seats (`architecture_critique`, `adversarial_audit`,
  `research_synthesis`, independent second review) when consequence and
  uncertainty justify cost.
- Preserve `independence_group`. Agreement inside one group is not
  independent evidence.
- Prefer **external criteria** (schema, tests, owner correction, later
  outcome) over vote.

### 4.7 Cross-modal learning

See §2.2. Visualization can create an **authority illusion**: a graph looks
like a world model. Memory Evidence already forbids treating projections as
belief.

### 4.8 Longitudinal self-models

The Mika problem is the central empirical story (`AEM ANECDOTE`) and is
architecturally first-class.

`EXTERNAL RESEARCH` Profiles go stale; people revise self-narrative;
clinical labels outlive the episode they named. First-person correction is
not always accurate either (self-report bias), but **owner self-sovereignty
outranks a model's trait label** as an Ashley law (`PROPOSAL`, consistent
with Identity review and Ethics).

`CONFIRMED FROM ASHLEY SOURCE` Memory Evidence already specifies:

- `observed_at` / `asserted_at` / `valid_from` / `valid_to`
- `superseded` vs `invalidated`
- as-of queries
- preference change = end old validity, start new, keep history
- contradiction as status, not silent overwrite
- human review for consequential claims about the owner

Much of that is `FUTURE DESIGN`, not current implementation. Current
automatic facts require an exact user-message quote. That blocks some
silent `mem_facts` trait writes and still does **not** implement temporal
validity for derived hypotheses.

`CONFIRMED FROM ASHLEY SOURCE` The live Mika failure mode is not Identity
and usually not `mem_facts`. It is **live episode summaries** (and active
Mind State concerns / open items) re-entering Thought with no `valid_to`.
Non-explicit facts overwrite in place (history loss). `dynamic_identity`
revisions can auto-apply without Doc review. `relational_tensions` has no
production writer. Identity review / `allowShadow` govern **Ashley’s**
foundational identity, not a user-trait model.

### 4.9 Privacy / cognitive data

Longitudinal behavioral inference is sensitive even when it is “just chat.”
Derived psychological hypotheses deserve a **higher privacy class** than
raw messages (`PROPOSAL`).

Local disk ≠ private:

- Ashley stores locally on Mint (`nuclear.db`, `continuity.db`)
- many routes send context to remote providers
- Ethics already forbids public disclosure of health, sexuality, location,
  private conflicts (`ETH-PUB-*`) and forbids credentials in model requests
  (`ETH-SEC-*`)

`INFERENCE` Metacognitive hypotheses about the owner's mind are closer to
`ETH-PUB-04` health-class sensitivity than to ordinary project facts, even
when they are not medical diagnoses.

---

## 5. Ashley fit

| AEM idea | Fit | Notes |
|---|---|---|
| Cognitive mirror, human as architect | Strong | Matches Vision (challenge, not flatter), Honesty, non-servant |
| External memory of patterns | Strong, already owned | Memory Evidence, not a new store |
| Temporal self-model / Mika problem | Strong gap in *implementation* | Architecture exists as FUTURE DESIGN |
| Local-first files | Partial | Already local DB; remote inference remains |
| Open-source models | Policy, not this pass | Model Fabric / Routing; not metacognition |
| Cross-modal graph as truth | Reject as validation | Optional later projection |
| Three permanent agents | Reject | Fabric seats + one subject |
| Safety Validator as distress monitor | Reject as default | Observation language only; no diagnosis engine |
| Cognitive exoskeleton that rewires the user | Hostile to Vision if it engineers dependence | Scaffold, then return judgment to owner |
| Importing celebrity “thought architectures” | Reject | Identity is not a prompt pack |

---

## 6. Ashley conflicts

`CONFIRMED FROM ASHLEY SOURCE`

1. **Architecture Freeze:** “Ashley does not need anything new” as extra
   cognitive faculty. Pass-3 owner-closed placement: named cross-cutting
   **policy profile** under existing owners, not a freeze-map owner, not a
   boundary/control organ, and not an eighth cognitive faculty. A later
   Freeze amendment would still require an independently owned lifecycle.
2. **Reflection** already owns post-outcome calibration with **no
   current-turn authority**. A metacognition super-controller would
   duplicate or override it.
3. **Cognitive Graduation** already claims epistemic maturation,
   contradiction-aware beliefs, and reflection-informed future cognition
   — for **Ashley**, not for owner-mirror.
4. **Relational Graduation** already claims non-manipulation, no
   attachment scores, interaction repair — overlapping dyadic
   metacognition.
5. **Honesty** already requires observation vs inference vs speculation
   language.
6. **Ethics `ETH-DEP-*`:** do not engineer dependency, isolation,
   conditional affection, boundary erosion.
7. **Personhood research:** no consciousness / attachment /
   indispensability score; model self-report is not proof of inner life.
8. **Model Fabric:** specialist session is not Ashley; receipt is not
   qualification.
9. **Glossary lag:** freeze names Mind State, Thought, Reflection as
   cognitive owners; `Ashley_Glossary.md` has no entries for those three
   (nor Attention or Evidence). Identity's glossary definition still
   bundles “behavioral tendencies,” which is broader than freeze Identity
   vs Mind State. Source still stores `identity_entries.layer = dynamic`
   beside Mind State items.
10. **Three “attention” words:** resource Attention (TPM/RPS admission),
    Context Budget (bounded selection over state), OCI consideration
    counts. Freeze: resource Attention is not salience.
11. **Roadmap wording:** §3 owner-selected current delivery is Model
    Fabric; §5.6 phase register can still read Sandbox as `CURRENT WORK`.
    Treat §3 + Fabric docs as live delivery; §5.6 is not a dashboard.
12. **Reflection source vs architecture:** architecture names Reflection as
    general post-outcome calibration; source is emoji initiative deltas
    plus OCI review only.
13. **Fabric phrasing:** existing law is `RECEIPT IS NOT QUALIFICATION`
    (mechanical facts only). “Quality signal ≠ authority” in the
    metacognition architecture is a proposed restatement, not a quoted
    Fabric line.

---

## 7. Strongest transferable ideas

1. **The Mika problem** as a first-class failure mode: historical
   interpretation remaining current.
2. **Human remains architect**; AI remains mirror. Change is owner
   insight, not model directive.
3. **Longitudinal inspectable record** of patterns, not a chatbot vibe.
4. **Need for a challenger function** — mapped to Fabric independence,
   not personas.
5. **Local persistence of cognitive data** with honest admission that
   inference is remote.
6. **Stale profile must be rejectable** without deleting history.
7. **Sovereignty as the success criterion**, not engagement or
   “insightfulness.”

## 8. Ideas rejected or heavily modified

| AEM / popular idea | Disposition |
|---|---|
| “Objective self-awareness” | Reject term. Use inspectable record + owner interpretation |
| Chat = digital phenotype | Modify: observed language, not phenotype |
| Cross-modal validation | Modify: presentation / encoding only |
| Primary / Challenger / Safety personas | Reject. One subject; Fabric seats |
| Distress Safety Validator | Reject as default clinical monitor |
| Knowledge graph as mind | Reject as authority. Deferred projection only |
| Voice required for metacognition | Reject. Roadmap-deferred channel |
| Importing genius prompts as new self | Reject |
| Continuous scoring dashboards | Reject (Ethics + personhood: no scores as authority) |
| Hidden CoT as introspection | Reject |
| Local files = privacy | Modify: classify what may leave the machine |
| AI restructures the owner's cognition | Reject as goal. Owner restructures; Ashley may surface |
| Immediate post-Fabric implementation | Reject. Wrong dependency story |

---

## 9. Privacy implications

Uniquely sensitive metacognitive classes (`PROPOSAL`):

- inferred emotional / cognitive patterns about the owner
- hypothesized “loops,” attachment language, diagnostic-adjacent labels
- dyadic misunderstanding ledgers (relationship conflict-adjacent)
- calibration misses that reveal private projects
- longitudinal topic maps that reconstruct private life

May leave the machine today: whatever is in the prompt to remote Thought /
Expression / utility models.

Pass-3 closed this for ordinary use: durable psychological and owner-pattern
hypotheses are local by default; local persistence is not local inference;
remote routes receive only the minimum approved projection. Owner-invoked
deep reflection is a later explicit-request path.

Deletion / correction / inspection already have owners (forgetting,
identity review, owner diagnostics). Metacognition must use them, not
bypass them.

## 10. Cognitive-dependency analysis

First-class failure mode, not a side note.

AEM wants sovereignty. The same loop can produce the opposite:

- owner waits for Ashley to say who he is
- owner treats graph/timeline as more real than lived sense
- owner cannot reconstruct reasons without the ledger
- Ashley's sycophancy confirms a flattering or damning pattern
- “I've noticed this six times” becomes unchallengeable authority

`PROPOSAL` Design tests (later evaluation, not this pass):

- After a pattern is surfaced, can the owner state the evidence in his
  own words?
- Does Ashley sometimes refuse to interpret and instead hand back
  excerpts?
- Are hypotheses marked uncertain and time-bounded?
- Does “that's not true anymore” actually end current validity?

## 11. Architecture implications (preview)

Pass-3 accepted architecture direction:

- Do **not** add a cognitive faculty or freeze-map owner.
- Do **not** collapse owner-mirror, Ashley-self, and dyadic surfaces.
- Named policy profile only, with persistence in Memory Evidence, episodic
  judgments in Reflection, interaction contracts in Relationship, receipts
  in Model Fabric, qualification in Evaluation, telemetry in Observability.
- First visible proof is the expanded Memory / Evidence owner-correction
  witness.

---

## 12. Sources used (non-exhaustive)

**AEM paper and its citations (audited, not trusted wholesale):**
Louis and Lallouz 2025; Lembke/Stanford interviews; Torous et al. 2016;
Do et al. 2023 *Biomedicines* phenotyping review; Frontiers cross-modal
editorial; Seitz and Lidasan 2022; claimed Guo *Cureus* 2024 e64583
(not independently located); Asif and Kazi 2024 preprint.

**Human metacognition:** Flavell 1979; Nelson and Narens 1990/1994;
Koriat and Goldsmith 1996; Fleming et al. Annual Review 2024; Metcalfe
and Kornell 2005; Duval and Wicklund 1972; Nisbett and Wilson 1977.

**Offloading / automation / AI use:** Risko and Gilbert 2016; Clark and
Chalmers 1998; Sparrow et al. 2011; Parasuraman and Riley 1997;
Parasuraman and Manzey 2010; Gerlich 2025 *Societies* (correlational);
Kosmyna et al. 2025 preprint; Chi et al. 1989; 2025/2026 reviews on
epistemic outsourcing and belief offloading.

**Digital phenotyping critique:** Torous/Onnela line; *HHR* 2020
perspective; Birk and Samuel; *Big Data & Society* 2023; 2024 *Journal of
Technology in Behavioral Science* ethics paper.

**LLM metacognition / CoT / debate:** Kadavath 2022; Binder 2024; Turpin
2023; Lanham 2023; Yoon 2025; Anthropic 2025 CoT faithfulness writeup;
Du et al. 2023 debate; Lightman et al. 2024 process supervision; Sharma
et al. 2023 sycophancy; CAGE-CAL 2026 on correlated multi-agent failure and
false consensus (treated as emerging, not settled). AgentAuditor (2025) is
an agent-safety evaluation framework, not a confabulation-consensus source.

**Ashley:** Vision, Core Principles, Constitution (Honesty forms), Ethics,
Hierarchy, Glossary, Freeze, Cross-Phase, Roadmap, Memory Evidence,
Cognitive Graduation, Relational Graduation, Learned Autonomy, Model
Fabric, Observability, Evaluation Plane, personhood-research,
Reflection/initiative source, identity-review `allowShadow` source.

---

## 13. What this audit does not close

Q0–Q16 are recorded in the owner packet. The metacognition overlay was
accepted as architecture direction. This research file does not become
architecture by that closure. Implementation non-decisions (schema, numeric
thresholds, exact deep-reflection routes) remain open.

This file does not authorize runtime, schema, Mint, MF-M1 changes, or a new
owner on the freeze map.
