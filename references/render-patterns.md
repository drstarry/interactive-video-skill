# Canvas Render Patterns

**All patterns below use the `createSceneRenderer` + `opts.draw` signature: `(ctx, p, t)`. Import `{ VW, VH }` from `canvas.js` for dimensions — never use `ctx.canvas.width/height`. See `engine-contracts.md`.**

Use declarative elements (scene-renderer.js) for simple visuals. Use these custom draw patterns only for animations that need imperative canvas logic.

## Core utilities

```javascript
// Progressive reveal — element fades in at a delay within the scene
const reveal = Math.max(0, Math.min(1, (p - delay) / 0.2));
ctx.globalAlpha = reveal;

// Easing
const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Animated dash (flowing lines)
ctx.setLineDash([8, 6]);
ctx.lineDashOffset = -t * 30;

// Pulsing glow
const pulse = 0.7 + 0.3 * Math.sin(t * 2);

// Multi-line text wrapping
function breakLines(ctx, text, maxW) {
  const words = text.split(" "),
    lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
```

## Pattern recipes

Use these as starting points when a scene needs custom animation beyond declarative elements.

**Code block with line highlighting:**

- Dark rounded rect background, monospace font, line numbers on left
- Lines appear progressively: `reveal(p, i * 0.1, 0.15)` per line
- Active line: translucent accent rect behind the current line (`Math.floor(p * lines.length)`)

**Comparison (side by side):**

- Two rounded rects at `w * 0.28` and `w * 0.72`, staggered reveal
- "vs" divider text at center
- Use for before/after, with/without, approach A vs B

**Stacked layers (architecture):**

- N rounded rects stacked vertically, staggered reveal (delay `i * 0.15`)
- Dashed arrows between layers with `lineDashOffset = -t * 20` for flow effect

**Pipeline (horizontal flow):**

- Use the declarative `pipeline` element type instead — it handles boxes, labels, and flowing arrows automatically

**Animated geometry (custom only):**

- Coordinate axes with labeled arrows
- Rotation arcs with `ctx.arc(x, y, radius, startAngle, endAngle)`
- Moving points along bezier curves

## Tips

1. Always set `ctx.globalAlpha = 1` at the end of each draw function
2. Use `ctx.save()` / `ctx.restore()` for rotations or clips
3. Scene progress `p` goes 0→1 — stagger reveals with `(p - delay) / duration`
4. Absolute time `t` drives continuous animations (flowing dashes, pulsing, sine waves)
5. `createSceneRenderer` handles background clearing — don't clear in your draw function
6. Font stack: `"DM Sans"` for body, `"JetBrains Mono"` for code, `"Instrument Serif"` for headings
