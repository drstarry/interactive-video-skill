# Math Rendering

**Rule: Use KaTeX HTML overlays for all equations. Canvas `fillText` only for single-letter geometry labels (f, z, P) attached to diagram elements.**

## Setup

KaTeX CDN in `<head>`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
```

`.math-layer` div inside `.vid-wrap` (already in page template). CSS already in `lesson.css`.

## Define math per scene

Positions use percentage of canvas dimensions:

```javascript
const MATH = {
  'projection': [
    {
      id: 'proj-formula',
      latex: '(u, v) = \\left(\\frac{fx}{z},\\; \\frac{fy}{z}\\right)',
      x: 50, y: 88,       // % of canvas width/height
      fontSize: 18,
      color: '#d4a054',
      displayMode: true,
      revealAt: 0.55,      // scene progress 0→1
    },
  ],
};
```

When source is a blog post or paper, **copy the exact LaTeX from the source**.

## How it works

The engine (`lesson.js`) handles math init and per-frame updates automatically when you pass the `math` option to `createLesson()`. **Do not write your own `initMathLayer`/`updateMathLayer`** — the engine does this internally.

## What goes where

- **Equations, matrices, formulas** → KaTeX HTML overlay
- **Single-letter labels on diagrams** (f, z, P, θ) → canvas `fillText`
- **Arrows, shapes, geometry** → canvas
