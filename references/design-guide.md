# Design Guide

Read during Phase 2 (structuring scenes and interactions).

## Step 1: Extract & classify knowledge from source

Read each paragraph/section and understand its structural role. Classify by what the content **is**, not by surface keywords:

| Type | Structure | Treatment |
|------|-----------|-----------|
| **Fact/Definition** | A named thing with a fixed value. Learner memorizes, doesn't derive. | Narrate only. Don't quiz unless counterintuitive. |
| **Procedure** | A sequence of actions where order matters. Skipping or reordering breaks the result. | Animate step-by-step. Quiz the ordering. |
| **Concept/Model** | A mental model with internal structure. Has parts, relationships, and boundaries. | Animate building the model. Quiz predictions about its behavior. |
| **Relationship** | Two or more things compared or contrasted. The insight is in how they differ. | A/B toggle or comparison interaction. |
| **Transformation** | An input changes to become an output. There are parameters that affect the mapping. | Animate the change. Slider for parameters. |
| **Edge case** | A condition where expected behavior breaks. The learner's default assumption is wrong. | Prediction quiz — ask before revealing. |

A single paragraph can contain multiple types. A formula derivation is a **procedure** that produces a **transformation**. Classify by the dominant teaching purpose.

## Step 2: Filter — what to include

For each extracted piece, apply in order:

1. **Core-idea test:** remove it — does the main point still make sense? YES → cut it.
2. **One-idea-per-scene:** new concept → new scene. Same concept → merge into current scene.
3. **Depth calibration:** too deep → summarize. Too shallow → expand. For orientation-focused content, bias toward brevity.

## Step 3: Sequence

1. **Epitomize** — show the whole thing simply first (wide-angle view)
2. **Elaborate** — zoom into each part, one scene per concept
3. **Summarize** — pull back to the whole, now enriched

Choose per scene:
- **Inductive** (example → rule): beginner audience, counterintuitive concept, good concrete example
- **Deductive** (rule → example): audience has prerequisites, rule is simple, complexity lives in examples

## Step 4: Assign modality

Apply the first matching rule:

| If the content... | Then use... |
|---|---|
| Contains a misconception the learner likely holds | Prediction quiz BEFORE narration |
| Has a formula with tunable parameters | Slider + live visualization |
| Describes a continuous variable relationship | Slider with real-time feedback |
| Is a sequence where order matters | Animate steps + quiz ordering |
| Contrasts two states or approaches | Comparison toggle |
| Has spatial structure with meaningful parts | Labeling / hotspot |
| Is factual recall with no misconception to exploit | Post-narration MCQ (use sparingly) |
| None of the above | Narrate + static visual. No interaction. |

## Step 5: Gate — should this interaction exist?

Before adding any interaction, pass all three:

1. **Static test:** would a static image teach this equally well? YES → skip.
2. **Narration test:** does hearing the explanation once produce understanding? YES → skip.
3. **Retrievability test:** should the learner recall/apply this after the walkthrough? NO → skip.

## Interaction pacing

- Give the learner time to absorb before testing — don't quiz immediately after introducing a concept.
- Vary interaction types. Multiple quizzes in a row feels like an exam. Break them up with widgets, narration, or a different question format.
- End with a synthesis interaction that ties multiple concepts together.

## Scene structure

Each scene follows four beats:

1. **Activate** — connect to prior knowledge ("You already know X...")
2. **Demonstrate** — show it (animate, narrate simultaneously)
3. **Apply** — learner does something (quiz/interaction, if warranted by Step 5)
4. **Integrate** — connect forward ("This is why...")

## Prefer "produce" over "pick"

Pick the highest row that fits the content:

| Task | Widget | Use when |
|------|--------|----------|
| **Predict** | Prediction quiz (ask *before* reveal) | Outcome is surprising and learner can reason about it |
| **Order** | Sort | Sequence matters |
| **Categorize** | Categorize | Things look similar but differ in one critical way |
| **Adjust & observe** | Slider | Continuous variable with non-obvious effects |
| **Explore** | Hotspot | System with parts to map |
| **Recall** | Post-narration MCQ | No misconception to exploit (use sparingly) |

**Stem rewrite test:** "What is X?" → try "Why does X?" or "What happens if X?". If the rewrite doesn't work, the content may not need an interaction.

## Canvas text spacing

Minimum distances between text elements on canvas:

| Between | Min gap |
|---------|---------|
| Body text lines (16-18px font) | 32px |
| Heading text lines (20px+ font) | 40px |
| Heading → body text | 50px |

Boxes (`rect`) must be tall enough to contain their text with these gaps. Example: 4 lines of 18px text at 32px spacing = `4×32 + 40 = 168px` height minimum.

**Never use `rect` `label` with text inside the box.** The engine renders `label` at the vertical center of the rect, which overlaps with any text elements positioned inside. Instead, remove `label` and add an explicit `text` element near the top of the rect as a heading.

## Length targets

| Length | Duration | Guidance |
|--------|----------|----------|
| **quick** | ~2-3 min | Hit the highlights. One key idea per topic. |
| **standard** | ~5-6 min | Explain each topic with one example. |
| **deep** | ~8-10 min | Multiple examples, edge cases, connections between topics. |

Self-check: estimate audio duration before writing. If it feels thin for the selected length, add depth.

## Spatial-temporal alignment

**Visual reveal order must match narration order.** The eye and the ear must agree on sequence.

When the narration describes a list, stack, or hierarchy, decide the **narration order first**, then arrange the layout to match:

| Narration order | Layout rule |
|-----------------|-------------|
| Top-to-bottom (surface → foundation) | Place first-described item at the top, reveal downward |
| Bottom-to-top (foundation → surface) | Place first-described item at the bottom, reveal upward — OR flip the layout so foundation is at the top |
| Left-to-right (input → output) | Place first-described item on the left, reveal rightward |
| Arbitrary (no spatial meaning) | Layout doesn't matter — just match `revealAt` to narration timing |

**The test:** at any moment, the most recently revealed element should be the thing the narration is currently talking about. If the eye has to jump backwards to find what the ear just heard, the layout is wrong.

**Common failure:** a layer stack (Types at top, UI at bottom) where the narration describes from bottom-up but the visual reveals top-down. Fix: either reverse the reveal order (`revealAt` lowest for bottom elements) or flip the layout so the first-described layer is at the top.

## Alive vs dead scenes

A dead scene is a slide — elements fade in and sit there. A living scene breathes. The difference is **continuous motion**: something on screen that moves every frame, even subtly.

**Every scene should have at least one source of visual pulse.** This is what makes a walkthrough feel like a video, not a slideshow.

| Technique | Code pattern | Feels like |
|-----------|-------------|------------|
| Flowing dashed lines | `ctx.setLineDash([8,6]); ctx.lineDashOffset = -t * 30;` | Energy flowing through connections |
| Pulsing glow | `opacity = 0.5 + 0.3 * Math.sin(t * 2)` | Breathing, alive |
| Gentle drift | `y = baseY + Math.sin(t * 0.5) * 3` | Floating, weightless |
| Flickering emphasis | `opacity = 0.8 + 0.2 * Math.sin(t * 8)` | Urgency, attention |
| Rotating element | `ctx.rotate(t * 0.3)` | Process, cycle |
| Growing/shrinking | `r = base + Math.sin(t) * 4` | Heartbeat, importance |

**When to use declarative-only (no custom draw):**
- The scene is a title card or intro (< 15 seconds)
- All elements are text/labels that reveal and hold

**When to add custom draw:**
- The scene has relationships between elements (arrows, flows, connections)
- The scene shows a process, sequence, or transformation
- The scene is >20 seconds and would feel frozen without motion
- The narration describes something dynamic ("flows through", "passes to", "builds up")

**The test:** pause the scene at 50% progress. If every element is fully visible and nothing is moving, the scene is dead. Add a flowing arrow, a pulsing glow, or a gentle drift.

## Animation rules

- **One focal point per beat.** Dim non-active areas to 40-60% opacity.
- **Transform, don't replace.** Morph A→B, don't fade-out/fade-in.
- **Ghost previous states** at 20-30% opacity for comparison.
- **Pause on insight.** Hold 1-2s after key transform completes.
- **Color = meaning.** Same object = same color across all scenes.
- **Stagger reveals:** 50-80ms per item, max 8 per group.
- **Cut test:** remove the animation — is the concept harder to understand? NO → cut it.

| Timing tier | Duration | Use for |
|-------------|----------|---------|
| Micro | 100-200ms | Highlights, feedback |
| Standard | 250-400ms | Enter/exit, reposition |
| Emphasis | 500-800ms | Key transforms |
| Sequence | 800-1500ms | Multi-step reveals |

## Quiz rules (cat: "q")

- **3 options, not 4-5.**
- **Write distractors FIRST.** Each = a named misconception.
- **Wrong feedback:** name the misconception, then show correct answer.
- **Right feedback:** confirm briefly + connect forward.
- **Prediction quiz** only when: answer is genuinely surprising AND learner has basis to predict.

## Interactive widget rules (cat: "try" / "go")

**Use widgets when the concept is better learned by DOING than by answering.** The engine supports custom widgets rendered inside the quiz overlay via the `widgets` parameter in `createLesson()`.

**When to use each interaction type:**

| If the content... | Use cat | Built-in widget | content.json `widget` field |
|---|---|---|---|
| Has a continuous variable / tunable parameter | `try` | **Slider** — adjust value, see contextual feedback | `"slider"` |
| Requires ordering steps correctly | `try` | **Sort** — drag items into correct sequence | `"sort"` |
| Has items that belong in distinct groups | `try` | **Categorize** — drag chips into labeled buckets | `"categorize"` |
| Has parts/roles the learner should explore | `try` | **Hotspot** — tap items to reveal explanations | `"hotspot"` |
| Asks the learner to make a decision given data | `go` | Decision panel (custom widget) | — |
| Shows code the learner should study | `code` | Code block (built-in) | — |

**Built-in widgets** require zero JS — just set `"widget": "sort"` (etc.) in content.json with the appropriate data fields. See `engine-contracts.md` for full schemas.

**Custom widgets** can still be passed via the `widgets` parameter in `createLesson()` for anything beyond the 4 built-ins. Custom widgets take precedence over built-ins.

**Widget design principles:**
- Simple: one input, one visible result. Not a full app.
- Theme-compatible: use CSS variables (var(--accent), var(--text), etc.).
- Self-explanatory: if the title/desc alone is not enough to use it, simplify.
- The "Continue" button is added automatically by the engine.
- **Sort** works best for 4-7 items. More than 8 becomes tedious.
- **Categorize** works best for 2-3 buckets with 3-5 items each.
- **Hotspot** gates progress — the learner must explore all items before continuing.
- **Slider** needs at least 3 stops with distinct descriptions to feel worthwhile.

## Code reference rules (cat: "code")

Use sparingly. Shows a code snippet the learner can study. The engine shows just a "Finish" button. Provide the code as part of the scene narration or in the interaction desc field.
