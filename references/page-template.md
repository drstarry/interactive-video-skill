# HTML Page Template

Generated lessons use `lesson.css` for all shared styles. The only inline CSS is the `:root` variables from `styles.json`.

## Template

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'self';
      script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
      font-src https://fonts.gstatic.com;
      media-src 'self';
      img-src 'self' data:;
    " />
    <title>LESSON_TITLE — Interactive Tutorial</title>
    <link rel="stylesheet" href="src/lesson.css" />
    <!-- Fonts: non-blocking load. Lessons work offline with system font fallbacks. -->
    <!-- FONTS_LINK_HERE: use the fonts URL from styles.json for the selected theme -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <style>
      /* Only CSS variables from styles.json go here */
      :root {
        /* STYLE_VARS_HERE */
      }
      /* Any lesson-specific overrides (rare) */
    </style>
  </head>
  <body data-theme="THEME_KEY">
    <!-- Navigation -->
    <nav class="site-nav">
      <a class="site-nav-brand" href="index.html">Interactive Learning</a>
      <div class="site-nav-links">
        <a href="LESSON_ID.html" class="active">LESSON_TITLE</a>
      </div>
    </nav>

    <!-- Page Content -->
    <div class="wrap">
      <div class="hdr">
        <h1>LESSON_TITLE</h1>
        <p class="sub">LESSON_SUBTITLE</p>
      </div>

      <div class="vid-wrap">
        <canvas id="cvs"></canvas>
        <div class="scn-label" id="scn-label"></div>
        <div class="math-layer" id="math-layer"></div>
        <!-- Overlay inside vid-wrap so it's visible in fullscreen -->
        <div class="ov" id="ov">
          <div class="top-badge" id="badge"></div>
          <div class="card" id="card"></div>
        </div>
      </div>

      <div class="ctl">
        <button id="btn-play">
          <svg id="play-icon" viewBox="0 0 24 24">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
        <span class="tl" id="t-cur">0:00</span>
        <span class="sep">/</span>
        <span class="tl" id="t-dur">0:00</span>
        <div class="tbar" id="tbar">
          <div class="fill" id="tprog"></div>
          <div class="scrub" id="tscrub"></div>
        </div>
        <button class="mute" id="btn-mute">Narration: On</button>
        <button class="fs" id="btn-fs">Fullscreen</button>
      </div>

      <div class="scores" id="scores"></div>
      <div class="chapters-header">Chapters</div>
      <div id="chapters"></div>
    </div>

    <footer class="site-footer">
      <a href="https://github.com/drstarry/interactive-video-skill" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Generated with Interactive Video Skill
      </a>
    </footer>

    <script type="module">
      import { createLesson } from "./src/engine/lesson.js";
      import { createSceneRenderer } from "./src/engine/scene-renderer.js";
      import { VW, VH } from "./src/engine/canvas.js";

      // ===== SCENE DATA =====
      const scenes = [
        // { s: 0, e: 20, label: 'Scene 1', bg: 'scene1' },
      ];

      const IX = [
        // { id: 'q-example', time: 15, cat: 'q', title: 'Quiz Title', desc: 'Question?',
        //   options: [{ k: 'A', c: false }, { k: 'B', c: true }, { k: 'C', c: false }] },
      ];

      // ===== DECLARATIVE ELEMENTS =====
      const sceneElements = {
        // 'scene1': [
        //   { type: 'text', x: 360, y: 200, text: 'Title', font: '400 32px "DM Sans"', color: '#2a2420' },
        //   { type: 'rule', x1: 320, y1: 230, x2: 400, y2: 230, color: '#c0392b', revealAt: 0.3 },
        // ],
      };

      // ===== CUSTOM DRAW (only for scenes needing animation beyond declarative) =====
      const customDraw = {
        // 'scene1': (ctx, p, t) => {
        //   // Use VW and VH for dimensions (imported from canvas.js)
        //   const cx = VW / 2, cy = VH / 2;
        //   // ... custom canvas animation
        // },
      };

      // ===== RENDERER =====
      const renderScene = createSceneRenderer(scenes, sceneElements, {
        bg: "#06060a", // background color from styles.json theme
        // paperGrain: 0.012,   // optional: subtle paper texture
        draw: customDraw,
      });

      // ===== BOOT =====
      createLesson({
        lessonId: "LESSON_ID",
        scenes,
        IX,
        render: renderScene,
        // widgets: { 'try-id': (container, ixData, continueFn) => { ... } },
      });
    </script>
  </body>
</html>
```

## Key points

1. **`lesson.css`** — all shared styles. Only `:root` vars are inlined per lesson.
2. **`lesson.js`** — quiz overlay, wiring, scoring, boot. Lessons never rewrite this.
3. **`LESSON_ID`** — appears in: title, nav link, `lessonId` param.
4. **Custom widgets** — `widgets: { 'try-id': (container, ixData) => {} }`
5. **`math-layer`** div inside `.vid-wrap` — for KaTeX overlays (see `math-rendering.md`)
6. **Attribution footer** — `<footer class="site-footer">` goes after the closing `</div>` of `.wrap` and before `<script>`. Always include it — links to the project repo.

## Worked example: complete lesson script

A 3-scene lesson showing the hybrid pattern — declarative elements + custom draw functions:

```javascript
import { createLesson } from "./src/engine/lesson.js";
import { createSceneRenderer } from "./src/engine/scene-renderer.js";
import { VW, VH } from "./src/engine/canvas.js";

const scenes = [
  { s: 0, e: 15, label: "Introduction", bg: "intro" },
  { s: 15, e: 35, label: "Core Concept", bg: "concept" },
  { s: 35, e: 50, label: "In Practice", bg: "practice" },
];

const IX = [
  {
    id: "q-concept",
    time: 34,
    cat: "q",
    title: "Check Understanding",
    desc: "What happens when the core concept is applied?",
    options: [
      { k: "A", c: true },
      { k: "B", c: false },
      { k: "C", c: false },
    ],
  },
];

// Declarative elements for simple scenes
// All x/y/w/h coordinates are in VW×VH virtual space (1920×1080).
// Center = (960, 540). Use VW/VH in custom draw functions.
const sceneElements = {
  intro: [
    {
      type: "glow",
      x: 960,
      y: 540,
      radius: 400,
      color: "rgba(212,160,84,0.06)",
    },
    {
      type: "text",
      x: 960,
      y: 440,
      text: "Lesson Title",
      font: 'italic 400 48px "Instrument Serif"',
      color: "#2a2420",
    },
    {
      type: "text",
      x: 960,
      y: 500,
      text: "A subtitle",
      font: '400 20px "DM Sans"',
      color: "#8a8070",
      revealAt: 0.2,
    },
    {
      type: "rule",
      x1: 860,
      y1: 530,
      x2: 1060,
      y2: 530,
      color: "#c0392b",
      revealAt: 0.3,
    },
  ],
  // 'concept' has no declarative elements — uses custom draw only
  practice: [
    {
      type: "rect",
      x: 460,
      y: 290,
      w: 1000,
      h: 500,
      fill: "rgba(192,57,43,0.06)",
      stroke: "#c0392b",
      label: "Result",
    },
    {
      type: "text",
      x: 960,
      y: 880,
      text: "Key takeaway here",
      font: 'italic 400 20px "Instrument Serif"',
      color: "#8a8070",
      revealAt: 0.5,
    },
  ],
};

// Custom draw functions for scenes that need animation/geometry
const customDraw = {
  concept: (ctx, p, t) => {
    // Custom animation with flicker, gradients, geometry, etc.
    const r = Math.max(0, Math.min(1, p / 0.2));
    ctx.globalAlpha = r;
    // ... complex canvas drawing here
    ctx.globalAlpha = 1;
  },
};

const renderScene = createSceneRenderer(scenes, sceneElements, {
  bg: "#faf6ee",
  paperGrain: 0.012,
  draw: customDraw,
});

createLesson({ lessonId: "my-lesson", scenes, IX, render: renderScene });
```

This lets you use declarative for simple scenes (titles, text reveals, basic diagrams) and imperative for complex animations (flickering candles, geometry, physics), in the same lesson.
