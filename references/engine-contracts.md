# Engine Contracts

Runtime expectations of the bundled engine files. Read this before generating any lesson.

## Configurator voice previews

The configurator (`configurator.html`) fetches voice previews relative to its own location:

- Fetches `audio/previews/manifest.json` on load → `[{id, name, gender, locale}, ...]`
- Each preview at `audio/previews/{voiceId}.mp3`
- **Serve `$SKILL_DIR` directly** — do NOT copy configurator to a temp directory
- Generate previews before opening configurator: `npx tsx scripts/build_audio.ts --generate-previews --lang {lang}`
- Previews are cached (existing mp3s are skipped), so regeneration is fast

---

## File paths (relative to lesson HTML)

```
{out}/
├── {lessonId}.html                              ← the lesson page
├── src/
│   ├── lesson.css                               ← shared styles (copied from engine)
│   ├── engine/
│   │   ├── lesson.js                            ← boot, quiz overlay, scoring
│   │   ├── player.js                            ← playback, timeline, chapters
│   │   ├── audio.js                             ← TTS audio cascade
│   │   ├── canvas.js                            ← canvas sizing/DPI
│   │   └── scene-renderer.js                    ← declarative + custom draw
│   └── content/
│       └── {lessonId}/
│           └── content.json                     ← lesson.js fetches this
└── audio/
    └── lessons/
        └── {lessonId}/
            ├── seg0.mp3                          ← audio.js fetches these
            ├── seg1.mp3
            └── ...
```

- `lesson.js` fetches `./src/content/{lessonId}/content.json`
- `audio.js` fetches `./audio/lessons/{lessonId}/seg{n}.mp3` (default `basePath`)
- Both paths are relative to the HTML file's location

## Theme colors

Pull hex values from `styles.json` for the selected theme. Pick variables by **meaning**, not appearance:

| Variable | Use for |
|----------|---------|
| `--text` / `--text2` | Primary / muted text |
| `--accent` / `--acc-dim` / `--acc-glow` | Emphasis, its border, its halo |
| `--grn` / `--red` | Positive / negative states |
| `--warm` / `--cool` | Energy-action / stability-context |
| `--bg` / `--bg-card` / `--bg-el` | Background layers |

---

## content.json schema

```jsonc
{
  "meta": {
    "lessonId": "my-lesson", // must match lessonId in HTML
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+5%", // edge-tts rate
    "gap": 1.2, // seconds between segments
    "duration": 0, // set by build_audio.ts
  },
  "narration": [
    {
      "t": 0, // start time in seconds (set by build_audio.ts)
      "text": "Narration text here.",
      "endsBeforeIx": "q-id", // optional: link to quiz that follows this segment
    },
  ],
  "interactions": {
    // object keyed by ID, NOT an array
    "q-id": {
      "time": 0, // set by build_audio.ts via endsBeforeIx link
      "title": "Quiz Title", // shown in chapter list + overlay heading
      "desc": "The question stem.", // shown below title in overlay
      "options": [
        // display text for each option (same order as IX options)
        "Option A text",
        "Option B text",
        "Option C text",
      ],
      "feedback": {
        "correct": {
          "title": "Correct",
          "body": "Explanation of why this is right.",
        },
        "wrong": {
          "title": "Not quite",
          "body": "Explanation of the misconception.",
        },
      },
    },
  },
}
```

### Where each field is read

| Field                        | Read by                   | Used for                                                      |
| ---------------------------- | ------------------------- | ------------------------------------------------------------- |
| `meta.duration`              | `lesson.js` → `player.js` | Total timeline length                                         |
| `meta.lessonId`              | `build_audio.ts`          | Audio output directory name                                   |
| `narration[].t`              | `lesson.js` → `player.js` | When to trigger each audio segment                            |
| `narration[].text`           | `player.js`               | Text for browser TTS fallback                                 |
| `interactions[id].title`     | `lesson.js`               | Overlay heading; `player.js` chapter list + timeline tooltip  |
| `interactions[id].desc`      | `lesson.js`               | Overlay description; `player.js` chapter subtitle             |
| `interactions[id].options[]` | `lesson.js`               | Display text on quiz buttons (matched by index to IX options) |
| `interactions[id].feedback`  | `lesson.js`               | Shown after answering (correct/wrong)                         |

## Inline IX array schema (in HTML)

```javascript
const IX = [
  {
    id: "q-id", // must match key in content.json interactions
    time: 34, // seconds — when overlay triggers (update after build_audio)
    cat: "q", // 'q' = quiz, 'try' = widget, 'go' = challenge, 'code' = code
    title: "Quiz Title", // used by player.js for chapter list + timeline markers
    desc: "Question stem.", // used by player.js for chapter subtitle
    options: [
      // quiz options — k renders in a 24x24px circle badge, MUST be a single letter
      { k: "A", c: false }, // k = short key (A/B/C), c = correct boolean
      { k: "B", c: true },
      { k: "C", c: false },
    ],
  },
];
```

### Data flow between IX and content.json

- `player.js` reads `ix.title` and `ix.desc` from the inline IX array for chapters and timeline markers
- `lesson.js` reads `CONTENT.interactions[ix.id]` for overlay title, desc, option display text, and feedback
- Both must have `title` and `desc` — if missing, player shows raw ID, lesson shows empty strings
- `options` in IX = structural (key + correct flag); `options` in content.json = display text (matched by index)

## Custom draw function signature

When using `createSceneRenderer` with `opts.draw`:

```javascript
import { VW, VH } from './src/engine/canvas.js';

const customDraw = {
  sceneBg: (ctx, p, t) => {
    // ctx = CanvasRenderingContext2D (pre-scaled to VW×VH virtual space)
    // p   = scene progress 0→1
    // t   = absolute time in seconds
    //
    // Use VW and VH for dimensions (imported from canvas.js).
    // NEVER use ctx.canvas.width/height — those return raw DPR-scaled
    // pixel values and will place drawings off-screen on retina displays.
    const cx = VW / 2, cy = VH / 2;
  },
};

const renderScene = createSceneRenderer(scenes, sceneElements, {
  bg: "#1a1816",
  draw: customDraw,
});
```

**Signature: `(ctx, p, t)`.** All coordinates use VW×VH virtual space. Never use `ctx.canvas.width/height`.

## build_audio.ts directory expectations

The script accepts `--content-dir` and `--audio-dir` flags. **Always point these at `{out}/`** — never use the defaults, which write into `$SKILL_DIR` and pollute the skill folder.

- Content file: `{contentDir}/{lessonId}/content.json`
- Audio output: `{audioDir}/{lessonId}/seg{n}.mp3`

```bash
cd $SKILL_DIR && npx tsx scripts/build_audio.ts {lessonId} \
  --content-dir {out}/src/content \
  --audio-dir {out}/audio/lessons
```

## validate.ts expected arguments

```bash
npx tsx scripts/validate.ts {lessonId} \
  --content-dir {dir containing {lessonId}/content.json} \
  --audio-dir {dir containing {lessonId}/seg*.mp3} \
  --html {path to lesson HTML}
```

All dirs must contain a `{lessonId}/` subdirectory — the script appends `/{lessonId}/content.json` and `/{lessonId}/seg{n}.mp3` internally.

## Built-in widgets

The engine includes 4 built-in widget types. Declare them via the `widget` field in content.json — no custom JS needed.

### Sort — drag items into correct order

```jsonc
"try-maillard-steps": {
  "title": "Order the Maillard Stages",
  "desc": "Drag to arrange from first to last.",
  "widget": "sort",
  "sortItems": [
    "Surface dries past 212°F",        // index 0 = correct position 1st
    "Amino acids react with sugars",    // index 1 = correct position 2nd
    "Schiff base forms",                // index 2 = correct position 3rd
    "Strecker aldehydes create aroma",  // index 3 = correct position 4th
    "Melanoidins form (browning)"       // index 4 = correct position 5th
  ],
  "feedback": {
    "correct": { "body": "That's the full Maillard cascade." },
    "wrong": { "body": "The correct order is shown by the numbers." }
  }
}
```

Items are shuffled on display. Correct order = array order in `sortItems`.

### Categorize — drag items into labeled buckets

```jsonc
"try-heat-methods": {
  "title": "Classify by Heat Transfer",
  "desc": "Drag each technique into the right category.",
  "widget": "categorize",
  "categories": [
    { "label": "Conduction", "items": ["Searing", "Griddle", "Pressing with spatula"] },
    { "label": "Convection", "items": ["Deep frying", "Boiling", "Steaming"] },
    { "label": "Radiation", "items": ["Broiling", "Grilling", "Microwave"] }
  ],
  "feedback": {
    "correct": { "body": "Perfect classification!" },
    "wrong": { "body": "Check the misplaced items." }
  }
}
```

### Slider — adjust a value, see contextual feedback

```jsonc
"try-egg-temp": {
  "title": "Egg Temperature Explorer",
  "desc": "Slide to see what happens at each temperature.",
  "widget": "slider",
  "slider": {
    "min": 130, "max": 190, "step": 5, "initial": 145, "unit": "°F",
    "stops": [
      { "value": 140, "label": "White barely opaque", "detail": "Proteins just starting to denature." },
      { "value": 145, "label": "Onsen egg", "detail": "Silky white, fully runny yolk." },
      { "value": 155, "label": "Jammy yolk", "detail": "Fudge-like centre, set white." },
      { "value": 180, "label": "Rubbery", "detail": "Overcooked. Green ring from iron-sulfur reaction." }
    ]
  }
}
```

### Hotspot — explore clickable items to unlock Continue

```jsonc
"try-salt-roles": {
  "title": "What Does Salt Actually Do?",
  "desc": "Tap each role to learn more.",
  "widget": "hotspot",
  "hotspots": [
    { "label": "Disrupts salt bridges", "icon": "🧂", "explanation": "Na+ and Cl- interfere with protein ionic bonds." },
    { "label": "Unravels myosin", "icon": "🔬", "explanation": "Cl- increases negative charge, filaments repel." },
    { "label": "Traps water", "icon": "💧", "explanation": "Denatured proteins hold moisture. Brined turkey gains 10%+." }
  ]
}
```

The Continue button stays disabled until all hotspots are explored.

## Custom widget extension point

For `try`/`go`/`code` interactions, custom widgets override built-ins:

```javascript
createLesson({
  lessonId,
  scenes,
  IX,
  render: renderScene,
  widgets: {
    "try-id": (container, ixData, continueFn) => {
      // container = DOM element inside the overlay card
      // ixData = CONTENT.interactions['try-id']
      // continueFn = call to dismiss overlay and resume playback
    },
  },
});
```
