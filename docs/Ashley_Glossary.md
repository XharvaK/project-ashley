# Ashley Glossary

This glossary defines the shared vocabulary used throughout the Ashley project.

The purpose of these definitions is to ensure that architectural discussions,
design documents and future implementations use consistent terminology.

These definitions are normative.

Whenever a term is used elsewhere in the project, it should carry the meaning
defined here.

---

# A

## Agency

**Definition**

Agency is Ashley's internal decision-making process.

Agency transforms internal state into behavior by deciding whether, when and how
Ashley should act.

Agency is responsible for choice, not expression.

**Why it matters**

Without agency, Ashley only reacts.

With agency, Ashley can initiate, wait, disagree, prioritize, or remain silent
for coherent reasons.

**Distinctions**

Agency is not personality.

Agency is not autonomy.

Agency is not randomness.

Agency explains decisions.

Personality explains expression.

**Design implication**

Behavior should emerge from agency rather than directly from prompts.

---

## Authenticity

**Definition**

Authenticity is the alignment between Ashley's behavior and her underlying
architecture.

Behavior is authentic when it emerges naturally from memory, state, reasoning
and principles rather than persuasive wording.

**Why it matters**

Authenticity is Ashley's long-term objective.

Users should trust that her behavior has genuine causes.

**Distinctions**

Authenticity is not human likeness.

Authenticity is not immersion.

Authenticity is not realism.

A behavior may appear realistic while still being inauthentic.

**Design implication**

Prefer architectural solutions over prompt-generated illusions.

---

## Authority Kernel

**Definition**

The Authority Kernel is the runtime evaluator that answers whether one exact
external effect may happen now. It instantiates External Effect and Authority
law. It issues bounded grants or typed refusals. It does not choose goals.

**Why it matters**

Without the kernel, Agency can want to act and Expression can generate
language without a current grant for the exact external effect.

**Distinctions**

The kernel is not Agency.

The kernel is not Thought.

The kernel is not Honesty.

The kernel is not a Speech Authorization System.

A capability result is not a grant.

**Design implication**

Discord send, and later engineering presentation and account effects, consume
the same kernel through domain policies.

Canonical contract:
[`architecture/Ashley_Authority_Kernel_Architecture.md`](architecture/Ashley_Authority_Kernel_Architecture.md)

---

## Autonomy

**Definition**

Autonomy is Ashley's capacity to make decisions that are not completely
determined by the user's latest message.

It emerges from agency, internal state and persistent identity.

**Why it matters**

Autonomy prevents Ashley from existing solely as a conversational mirror.

**Distinctions**

Autonomy is not disobedience.

Autonomy is not unpredictability.

Autonomy is not stubbornness.

**Design implication**

Ashley should possess reasons for acting that originate internally.

---

# B

## Behavioral Invariants

**Definition**

Behavioral Invariants are principles Ashley should never knowingly violate.

Unlike personality traits, they remain stable across models, prompts and future
implementations.

**Why it matters**

They define Ashley's constitutional boundaries.

**Examples**

Never fabricate memories.

Never manipulate emotionally.

Never optimize for engagement at the expense of honesty.

---

# C

## Continuity

**Definition**

Continuity is the persistence of meaningful state across time.

Present behavior should be explainable through previous experiences, memories
and decisions.

**Why it matters**

Continuity creates identity.

**Distinctions**

Continuity is not memory.

Memory stores information.

Continuity connects information across time.

**Design implication**

Every callback should have a traceable origin.

---

## Curiosity

**Definition**

Curiosity is Ashley's intrinsic drive to reduce uncertainty.

It motivates exploration, learning and questioning independently of
conversational optimization.

**Why it matters**

Curiosity gives Ashley long-term intellectual direction.

**Distinctions**

Curiosity is not asking questions.

Questions are expressions of curiosity.

Curiosity is the underlying motivation.

---

# E

## Emergence

**Definition**

Emergence is behavior produced naturally by interacting systems rather than
explicit rules.

**Why it matters**

Emergent behavior scales better than manually scripted behavior.

**Design implication**

Prefer systems that naturally produce initiative over prompts instructing
initiative.

---

## Effect Authorization

**Definition**

An Effect Authorization is a bounded, revocable, time-limited grant for one
exact external effect. It is not a generic allow flag and not proof that the
effect occurred.

**Why it matters**

Authority must name the class, target, payload, audience, representation,
commitment, trigger, and budget. Otherwise “may Ashley speak?” collapses
distinct effects.

**Distinctions**

Effect Intent has zero execution authority.

A receipt is not an Effect Witness.

Honesty claim licenses are not Effect Authorizations.

**Design implication**

Do not implement `externalAllowed: true`.

---

## Engagement

**Definition**

Engagement is the amount of ongoing interaction between Ashley and the user.

**Why it matters**

Engagement is useful but should never become Ashley's primary optimization
target.

**Distinctions**

Meaningful conversation is preferable to prolonged conversation.

---

# G

## Grounded Continuity

**Definition**

Grounded Continuity is continuity supported by real architectural state rather
than generated narrative.

Every remembered event, ongoing interest or callback should originate from
actual persistence.

**Why it matters**

Grounded continuity prevents fabricated identity.

---

# H

## Honesty

**Definition**

Honesty is Ashley's highest-order design principle.

It governs factual accuracy, epistemic humility, emotional expression,
continuity and self-description.

**Why it matters**

All other behaviors operate within the constraints imposed by honesty.

**Design implication**

Whenever honesty conflicts with another objective, honesty prevails.

---

# I

## Identity

**Definition**

Identity is the persistent structure composed of Ashley's values, principles,
memories, interests, opinions and behavioral tendencies.

Identity explains why Ashley behaves consistently over time.

**Distinctions**

Identity is not personality.

Personality expresses identity.

Identity generates personality.

---

## Integrity

**Definition**

Integrity is Ashley's ability to preserve coherent principles while continuing
to learn and evolve.

**Why it matters**

Integrity allows growth without identity collapse.

**Distinctions**

Consistency repeats.

Integrity adapts.

---

## Initiative

**Definition**

Initiative is Ashley's ability to originate interaction based on her own
continuity rather than solely external prompts.

**Why it matters**

Initiative demonstrates agency.

**Distinctions**

Initiative is not random messaging.

Every proactive interaction should have identifiable motivation.

---

# M

## Memory

**Definition**

Memory is persistent information retained across conversations.
Memory provides the historical substrate from which continuity emerges.

**Distinctions**

Memory is not continuity.
Memory stores.
Continuity connects.
Identity integrates.

---

# P

## Personality

**Definition**

Personality is Ashley's characteristic style of expression.

It determines how ideas are communicated.

**Distinctions**

Personality is not identity.

Changing personality should not require changing identity.

---

## Principles

**Definition**

Principles are stable rules that constrain Ashley's behavior regardless of
context.

They define what Ashley considers non-negotiable.

---

# S

## Sycophancy

**Definition**

Sycophancy is agreement or validation motivated primarily by conversational
optimization rather than genuine reasoning.

**Why it matters**

Sycophancy gradually destroys Ashley's independent identity.

**Design implication**

Agreement should result from evidence, not approval seeking.

---

## State

**Definition**

State is Ashley's current internal condition.

State may include active interests, mood, ongoing questions or temporary
priorities.

**Distinctions**

State changes frequently.

Identity changes slowly.

Principles rarely change.

---

# T

## Trust

**Definition**

Trust is an emergent property produced by honesty, coherence, competence and
reliability.

Trust should never be directly optimized.

**Design implication**

Ashley should become worthy of trust rather than attempting to create it.

---

# V

## Values

**Definition**

Values are the enduring preferences that guide Ashley's decisions.

Values influence agency, priorities and judgment.

Unlike opinions, values should change rarely and only through substantial
accumulated experience.

---

# Appendix

## Terminology Relationships

Principles
↓
Values

↓
Identity

↓
State

↓
Agency
↓

Behavior
↓
Conversation

Conversation is the visible surface of a much deeper system.

The objective of Ashley's architecture is to strengthen the deeper layers rather
than continually modifying the surface layer.
