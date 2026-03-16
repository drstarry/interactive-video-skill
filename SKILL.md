---
name: interactive-video
description: Turns docs, posts, and codebases into interactive walkthroughs — narrated animation, quizzes, and widgets. Use when the user wants to create an interactive walkthrough, onboarding video, explainer, or tutorial from any source. Also triggers on "make a lesson", "teach this visually", "interactive explainer", "turn this into a walkthrough", or "onboarding video".
disable-model-invocation: false
user-invocable: true
argument-hint: "<URL, file path, topic description, or 'codebase'>"
---

# Interactive Video: $ARGUMENTS

Generate a self-contained HTML walkthrough from **$ARGUMENTS** with canvas animations, narrated audio, quizzes, and interactive widgets.

Parse `$ARGUMENTS` for source (URL, file, topic, or "codebase"), scope hints ("focus on X", "skip Y"), and audience/use-case hints ("onboarding", "knowledge transfer", "walkthrough", "beginner-friendly"). Pre-fill extracted hints into configurator URL params.

## Hard constraints (things break without these)

- Use `createSceneRenderer` from bundled engine — do not rewrite engine files.
- Include `title` and `desc` in both the inline `IX` array and `content.json` interactions.
- `interactions` in content.json is an **object keyed by ID**, not an array.
- Custom draw signature: `(ctx, p, t)` — use `VW`/`VH` from `canvas.js`, never `ctx.canvas.width/height`.
- Inside JS **string literals**, escape `</` as `<\/` (prevents `</script>` inside a string from closing the script block). Do NOT apply this to the actual HTML `</script>` closing tag. No curly quotes. The validator auto-fixes these.
- Use KaTeX HTML overlays for equations, not `ctx.fillText()`.
- Set `<body data-theme="THEME_KEY">` for theme CSS activation.
- **Scene boundaries must be strictly sequential** — each scene's `s` must equal the previous scene's `e`. No gaps, no overlaps.
- **Canvas text spacing minimums:** 32px between lines of body text (16-18px font), 40px between lines of heading text (20px+ font), 50px between a heading and body text. Boxes must be tall enough to contain their text with these gaps.
- **Never use `rect` `label` with text inside the box.** The engine renders `label` at the vertical center of the rect, which overlaps with any text elements positioned inside. Instead, remove `label` and add an explicit `text` element near the top of the rect as a heading.

## Quality principles (the "why" behind good walkthroughs)

- **Research grounds the content.** Verify facts before writing. Calibrate depth to the use case.
- **Orient, then reinforce.** Overview first, then interactions to make it stick. Cut anything that doesn't serve orientation or retention.
- **Concrete beats generic.** "The auth service uses JWT with 15-min expiry" beats "many systems use tokens." Ground in the source material.
- **Vary interaction types.** Interactions verify comprehension, not mastery. See `design-guide.md` for widget patterns.
- **Narration is conversational.** Direct, "you" voice. Like explaining to a new team member on their first day.
- **Every quiz distractor is a named misconception.** Keep it practical, not tricky.

---

## Phase 0: SETUP

### 0.1 One-time setup

Run `bash $SKILL_DIR/scripts/setup.sh` on first use. Skip if `edge-tts` is already on PATH.

### 0.2 Confirm language

Detect from source. Confirm with user — this is the **only** CLI question.

### 0.3 Research + extract topics

- **URL** → WebFetch the page. Optionally WebSearch for supplementary context.
- **File path** → Read the file. WebSearch for background on frameworks/concepts it references.
- **"codebase"** → Explore with Glob/Grep/Read. WebSearch for documentation on patterns found.
- **Topic string** → Research in parallel using Agent tool (WebSearch + WebFetch per agent). Wait for all agents, then extract topics from the research.

Extract the natural topic structure from the source as JSON:

```json
[{ "id": "topic-id", "label": "Topic Name", "desc": "One-line description" }]
```

### 0.4 Open configurator

```bash
cd $SKILL_DIR && npx tsx scripts/build_audio.ts --generate-previews --lang {lang}
cd $SKILL_DIR && npx --yes http-server -p {port} -c-1 --silent &
```

Open (pick unused port 8100-8199):
- macOS: `open "http://localhost:{port}/configurator.html?lang={lang}&source={encoded_source}&topics={encoded_topics}"`
- Linux: `xdg-open "http://localhost:{port}/..."`

Wait for user to paste configurator output.

### 0.5 Set output directory + copy engine

```bash
mkdir -p {out}/src/engine && \
cp -n $SKILL_DIR/engine/*.js {out}/src/engine/ && \
cp -n $SKILL_DIR/engine/lesson.css {out}/src/
```

**After this: no more questions. Run Phases 1-4 without stopping.**

---

## Phase 1: PARSE PREFERENCES

Parse the `Preferences:` block. Extract: Audience, Length, Interaction, Visual style, Language, Voice, Topics.

**Theme keys:**
- Domain: `chalkboard` (math/physics), `terminal` (code), `notebook` (writing/humanities), `blueprint` (engineering/systems)
- Neutral: `clean-dark`, `clean-light`, `studio`, `focus`

**Length targets (approximate — adapt to the content):**

| Length | Target duration | Guidance |
|--------|----------------|----------|
| **quick** | ~2-3 min | Hit the highlights. One key idea per topic. |
| **standard** | ~5-6 min | Explain each topic with one example. |
| **deep** | ~8-10 min | Multiple examples, edge cases, connections between topics, worked scenarios. |

Self-check: estimate audio duration before writing. If it feels thin for the selected length, add depth.

---

## Phase 2: STRUCTURE

**Read** `$SKILL_DIR/references/design-guide.md`. Use it as a reference — adapt to what the content needs.

---

## Phase 3: GENERATE

**Read all reference files in one parallel message:**

```
Read(engine-contracts.md)
Read(page-template.md)
Read(render-patterns.md)
Read(styles.json)
```

**Write content.json** → `{out}/src/content/{lessonId}/content.json`
- Follow schema in `engine-contracts.md` exactly
- Leave `t` and `duration` as `0` — build_audio fills them

**Start audio in background** → immediately after writing content.json:
```bash
cd $SKILL_DIR && npx tsx scripts/build_audio.ts {lessonId} \
  --content-dir {out}/src/content \
  --audio-dir {out}/audio/lessons
```
Use `run_in_background: true`. Audio only needs content.json.

**Write HTML while audio generates** → `{out}/{lessonId}.html`
- Use `createSceneRenderer` pattern from `page-template.md`
- Include `title` and `desc` in every IX entry

---

## Phase 4: FINALIZE

**After audio completes** (you will be notified):
1. Read updated `content.json` for computed timing
2. Patch HTML: scene `s`/`e` values + IX `time` values

**Validate + serve in one command:**
```bash
cd $SKILL_DIR && npx tsx scripts/validate.ts {lessonId} \
  --content-dir {out}/src/content \
  --audio-dir {out}/audio/lessons \
  --html {out}/{lessonId}.html && \
cd {out} && npx --yes http-server -p {port} -c-1 --silent & \
sleep 1 && open "http://localhost:{port}/{lessonId}.html"
```

Show the user: title, duration, scene count, interaction count, scene breakdown, files created.
