# Design Guide

Read during Phase 2 (structuring scenes and interactions).

## 1. Classify knowledge

Read each section and classify by what the content **is**, not by surface keywords:

| Type | Treatment |
|------|-----------|
| **Fact/Definition** | Narrate only. Don't quiz unless counterintuitive. |
| **Procedure** | Animate step-by-step. Quiz the ordering. |
| **Concept/Model** | Animate building the model. Quiz predictions. |
| **Relationship** | A/B comparison or toggle. |
| **Transformation** | Animate the change. Slider for parameters. |
| **Edge case** | Prediction quiz BEFORE revealing. |

Classify by dominant teaching purpose. A formula derivation is a procedure that produces a transformation.

## 2. Filter

1. **Core-idea test:** remove it — does the main point still make sense? YES → cut.
2. **One-idea-per-scene:** new concept → new scene. Same concept → merge.
3. **Depth calibration:** too deep → summarize. Too shallow → expand.

## 3. Sequence

1. **Epitomize** — show the whole thing simply first
2. **Elaborate** — zoom into each part, one scene per concept
3. **Summarize** — pull back to the whole, now enriched

Per scene: **inductive** (example → rule) for beginners and counterintuitive concepts. **Deductive** (rule → example) when the audience has prerequisites.

## 4. Assign interaction

Pick the highest row that fits:

| Task | Widget | Use when |
|------|--------|----------|
| **Predict** | Prediction quiz (before reveal) | Outcome is surprising AND learner can reason about it |
| **Order** | Sort | Sequence matters |
| **Categorize** | Categorize | Things look similar but differ in one critical way |
| **Adjust & observe** | Slider | Continuous variable with non-obvious effects |
| **Explore** | Hotspot | System with parts to map |
| **Recall** | Post-narration MCQ | No misconception to exploit (use sparingly) |
| None | Narrate + visual only | Static image teaches equally well |

**Stem rewrite test:** "What is X?" → try "Why does X?" or "What happens if X?". If the rewrite doesn't work, the content may not need an interaction.

## 5. Gate — should this interaction exist?

All three must pass:

1. **Static test:** would a static image teach equally well? YES → skip.
2. **Narration test:** does hearing once produce understanding? YES → skip.
3. **Retrievability test:** should the learner recall this later? NO → skip.

Pacing: don't quiz immediately after introducing a concept. Vary types — multiple quizzes in a row feels like an exam. End with a synthesis interaction.

---

## Narration voice

A warm, patient voice explaining something you genuinely find interesting. You respect the listener — no lecturing, no condescension, no performing expertise. You explain because you want them to get it, not because you want to sound smart.

Model narration on these:

"Your browser fires a DNS query. The stub resolver doesn't know the answer, so it forwards to a recursive resolver — typically 8.8.8.8 or your ISP's server."

"Ownership transfers on assignment. After `let s2 = s1`, s1 is gone. The compiler enforces this — try to use s1 and you get error E0382."

"Memory cells recognize the antigen's shape. Second exposure triggers antibody production in hours. The infection clears before symptoms appear."

**Rules:**
1. Start with the subject. No throat-clearing, no transitions.
2. One claim per sentence. Split on "and."
3. Name the specific — 8.8.8.8, E0382, .com TLD, 15-minute expiry.
4. Ear extends eye — narrate what the visual can't show: causation, "why", edge cases.
5. Say what it IS. Never frame through what it isn't.

**Banned** (the most common AI slop):
- "Let's dive into / explore / take a look at"
- "In the world of X..." / "In today's landscape"
- "Essentially / basically / fundamentally"
- "It's not X, it's Y" / "Not A, not B — it's C"
- "You might think X, but actually Y"
- "The answer might surprise you"
- "And that's all there is to it!"

---

## Scene rules

**Spatial-temporal alignment:** visual reveal order must match narration order. The most recently revealed element should be what the narration is currently describing.

| Narration order | Layout rule |
|-----------------|-------------|
| Top-to-bottom | Reveal downward |
| Bottom-to-top | Reveal upward or flip layout |
| Left-to-right | Reveal rightward |
| No spatial meaning | Match `revealAt` to narration timing |

**Scene arc:** activate (connect to prior knowledge) → demonstrate (animate + narrate) → apply (interaction if warranted) → integrate (connect forward). Not every scene needs all four — short intros can skip activate/integrate.

**Alive vs dead:** every scene >20s needs at least one source of continuous motion — flowing dashes, pulsing glow, gentle drift. Pause at 50% progress: if nothing moves, the scene is dead.

**Animation taste:**
- One focal point per beat. Dim non-active areas to 40-60% opacity.
- Transform, don't replace. Morph A→B, don't fade-out/fade-in.
- Color = meaning. Same object = same color across all scenes.
- Stagger reveals: 50-80ms per item, max 8 per group.
- **Cut test:** remove the animation — is the concept harder to understand? NO → cut it.

---

## Quiz rules

- **3 options, not 4-5.**
- **Write distractors FIRST.** Each = a named misconception.
- **Question stems must be specific.** "Which of the following is correct?" is slop. Ground in a scenario: "The client sends a query to 8.8.8.8. What responds first?"

**Feedback anti-slop:**

```
SLOP correct:  "Great job! You got it right."
SLOP wrong:    "Not quite. The correct answer is B."

CLEAN correct: "Right — the resolver checks its cache before any network call."
CLEAN wrong:   "That's the recursive step. The resolver checks local cache first."
```

- **Wrong feedback:** name the misconception ("That's the recursive step"), then state the correct answer with *why*.
- **Right feedback:** confirm what they understood + connect forward. No "Great job!" — the green checkmark already says that.

## Widget rules

- Simple: one input, one visible result. Not a full app.
- Self-explanatory: if title/desc isn't enough to use it, simplify.
- **Sort** → 4-7 items. **Categorize** → 2-3 buckets, 3-5 items each. **Slider** → 3+ stops. **Hotspot** → all must be explored.

## Length targets

| Length | Duration | Guidance |
|--------|----------|----------|
| **quick** | ~2-3 min | One key idea per topic |
| **standard** | ~5-6 min | Each topic + one example |
| **deep** | ~8-10 min | Multiple examples, edge cases, connections |

## Canvas text spacing

| Between | Min gap |
|---------|---------|
| Body text lines (16-18px) | 32px |
| Heading lines (20px+) | 40px |
| Heading → body | 50px |

Never use `rect` `label` with text inside the box — engine renders label at vertical center, overlapping internal text. Use a separate `text` element instead.
