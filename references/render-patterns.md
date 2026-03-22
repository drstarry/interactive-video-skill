# Canvas Render Patterns

Custom draw functions use signature `(ctx, p, t)` — see `engine-contracts.md` for full contract.

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

## Correctness rules

1. Always set `ctx.globalAlpha = 1` at the end of each draw function
2. Use `ctx.save()` / `ctx.restore()` for rotations or clips
3. Scene progress `p` goes 0→1 — stagger reveals with `(p - delay) / duration`
4. Absolute time `t` drives continuous animations (flowing dashes, pulsing, sine waves)
5. `createSceneRenderer` handles background clearing — don't clear in your draw function
6. Use fonts from the selected theme in `styles.json` — don't hardcode font families
