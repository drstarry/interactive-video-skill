/**
 * Declarative scene renderer — interprets JSON scene descriptions
 * instead of requiring hand-written canvas draw functions.
 *
 * Usage in lesson HTML:
 *   import { createSceneRenderer } from './src/engine/scene-renderer.js';
 *   const renderScene = createSceneRenderer(scenes, sceneElements, { bg: '#1a1816' });
 *
 * sceneElements maps scene background keys to arrays of drawable elements.
 * All coordinates use the VW×VH virtual space exported from canvas.js.
 * See engine-contracts.md for the full element schema.
 */

import { VW, VH } from './canvas.js';

export const reveal = (p, at, dur) => Math.max(0, Math.min(1, (p - (at || 0)) / (dur || 0.15)));

// ── Element renderers ──

const renderers = {
  // Point with optional label
  point(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    ctx.fillStyle = el.color || '#e8e0d0';
    ctx.beginPath();
    ctx.arc(el.x, el.y, el.r || 13, 0, Math.PI * 2);
    ctx.fill();
    if (el.label) {
      ctx.font = el.font || '400 29px "JetBrains Mono", monospace';
      ctx.textAlign = el.textAlign || 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(el.label, el.x + (el.labelOffsetX || 0), el.y + (el.labelOffsetY || 48));
    }
  },

  // Line or arrow
  line(ctx, el, p, t) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    ctx.strokeStyle = el.color || '#7a7060';
    ctx.lineWidth = el.width || 4;
    if (el.dashed) {
      ctx.setLineDash(el.dashPattern || [16, 11]);
      if (el.flowing) ctx.lineDashOffset = -t * (el.flowSpeed || 20);
    }
    ctx.beginPath();
    ctx.moveTo(el.x1, el.y1);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrowhead
    if (el.arrow) {
      const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
      const hl = el.arrowSize || 21;
      ctx.fillStyle = el.color || '#7a7060';
      ctx.beginPath();
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(el.x2 - hl * Math.cos(angle - 0.4), el.y2 - hl * Math.sin(angle - 0.4));
      ctx.lineTo(el.x2 - hl * Math.cos(angle + 0.4), el.y2 - hl * Math.sin(angle + 0.4));
      ctx.fill();
    }
  },

  // Rectangle (rounded)
  rect(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    // Neutral fallbacks — visible on both light and dark themes.
    // Lesson generators should always provide explicit fill/stroke from the theme.
    ctx.fillStyle = el.fill || 'rgba(128,128,128,0.08)';
    ctx.strokeStyle = el.stroke || 'rgba(128,128,128,0.3)';
    ctx.lineWidth = el.lineWidth || 3;
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.w, el.h, el.radius || 16);
    if (el.fill !== 'none') ctx.fill();
    if (el.stroke !== 'none') ctx.stroke();
    if (el.label) {
      ctx.font = el.font || '500 32px "DM Sans", sans-serif';
      ctx.fillStyle = el.labelColor || el.stroke || '#e8e0d0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label, el.x + el.w / 2, el.y + el.h / 2);
    }
  },

  // Text
  text(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    ctx.font = el.font || '400 37px "DM Sans", sans-serif';
    ctx.fillStyle = el.color || '#e8e0d0';
    ctx.textAlign = el.textAlign || 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(el.text, el.x, el.y);
  },

  // Matrix with brackets
  matrix(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    const rows = el.rows;
    const cellW = el.cellW || 120;
    const cellH = el.cellH || 64;
    const totalW = rows[0].length * cellW;
    const totalH = rows.length * cellH;
    const sx = el.cx - totalW / 2;
    const sy = el.cy - totalH / 2;

    // Brackets
    ctx.strokeStyle = el.color || '#d4a054';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx - 21, sy - 11);
    ctx.lineTo(sx - 37, sy - 11);
    ctx.lineTo(sx - 37, sy + totalH + 11);
    ctx.lineTo(sx - 21, sy + totalH + 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + totalW + 21, sy - 11);
    ctx.lineTo(sx + totalW + 37, sy - 11);
    ctx.lineTo(sx + totalW + 37, sy + totalH + 11);
    ctx.lineTo(sx + totalW + 21, sy + totalH + 11);
    ctx.stroke();

    // Cell values
    ctx.font = el.font || '400 35px "JetBrains Mono", monospace';
    ctx.fillStyle = el.textColor || el.color || '#e8e0d0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    rows.forEach((row, ri) => {
      row.forEach((val, ci) => {
        ctx.fillText(val, sx + ci * cellW + cellW / 2, sy + ri * cellH + cellH / 2);
      });
    });
  },

  // Radial glow background
  glow(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    const g = ctx.createRadialGradient(el.x, el.y, 0, el.x, el.y, el.radius || 665);
    // Neutral fallback — lesson generators should always provide explicit color.
    g.addColorStop(0, el.color || 'rgba(128,128,128,0.06)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  },

  // Arc (for rotation angles, etc.)
  arc(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    ctx.strokeStyle = el.color || '#8ab060';
    ctx.lineWidth = el.width || 4;
    ctx.beginPath();
    ctx.arc(el.x, el.y, el.radius || 107, el.startAngle || 0, el.endAngle || Math.PI / 2);
    ctx.stroke();
  },

  // Group of items revealed with stagger (revealAt precomputed on first render)
  stagger(ctx, el, p, t) {
    if (!el.items) return;
    if (!el._prepared) {
      const delay = el.staggerDelay || 0.08;
      el.items.forEach((item, i) => {
        item.revealAt = (el.revealAt || 0) + i * delay;
      });
      el._prepared = true;
    }
    el.items.forEach((item) => {
      const renderer = renderers[item.type];
      if (renderer) renderer(ctx, item, p, t);
    });
  },

  // Radial flicker glow (candlelight, warmth)
  flicker(ctx, el, p, t) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    const flicker = 0.7 + 0.3 * Math.sin(t * 3.7) * Math.sin(t * 2.3 + 1);
    const radius = (el.radius || 533) * (0.9 + 0.1 * Math.sin(t * 5.1));
    const g = ctx.createRadialGradient(el.x, el.y, 0, el.x, el.y, radius);
    g.addColorStop(0, el.color || 'rgba(255,200,100,0.15)');
    g.addColorStop(0.5, el.colorMid || 'rgba(255,180,80,0.05)');
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = r * (el.alpha || 0.8) * flicker;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  },

  // Linear shadow gradient
  'shadow-gradient'(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    const dir = el.direction || 'right';
    const g = ctx.createLinearGradient(
      dir === 'right' ? el.x : el.x + el.w,
      el.y,
      dir === 'right' ? el.x + el.w : el.x,
      el.y
    );
    g.addColorStop(0, el.colorFrom || 'rgba(26,20,16,0.5)');
    g.addColorStop(el.midStop || 0.4, el.colorMid || 'rgba(26,20,16,0.2)');
    g.addColorStop(1, el.colorTo || 'rgba(26,20,16,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(el.x, el.y, el.w, el.h);
  },

  // Vertical text (East Asian style)
  'vertical-text'(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    ctx.font = el.font || '400 48px "Instrument Serif", Georgia, serif';
    ctx.fillStyle = el.color || '#2a2420';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const chars = el.text.split('');
    const spacing = el.spacing || 75;
    chars.forEach((ch, i) => {
      const charReveal = el.stagger ? reveal(p, (el.revealAt || 0) + i * 0.03) : 1;
      ctx.globalAlpha = r * charReveal;
      ctx.fillText(ch, el.x, el.y + i * spacing);
    });
  },

  // Horizontal line / rule
  rule(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    ctx.strokeStyle = el.color || '#d8d0c4';
    ctx.lineWidth = el.width || 3;
    ctx.beginPath();
    ctx.moveTo(el.x1, el.y1);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
  },

  // Filled background (for scene transitions)
  fill(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r * (el.alpha || 1);
    ctx.fillStyle = el.color || '#1a1410';
    ctx.fillRect(el.x || 0, el.y || 0, el.w || VW, el.h || VH);
  },

  // Multi-line wrapped text (line layout memoized on first render)
  paragraph(ctx, el, p) {
    const r = reveal(p, el.revealAt);
    if (r <= 0) return;
    ctx.globalAlpha = r;
    const font = el.font || '400 37px "DM Sans", sans-serif';
    ctx.font = font;
    ctx.fillStyle = el.color || '#2a2420';
    ctx.textAlign = el.textAlign || 'left';
    ctx.textBaseline = 'alphabetic';
    const lineH = el.lineHeight || 58;
    if (!el._lines) {
      const maxW = el.maxWidth || 1060;
      const words = el.text.split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else { line = test; }
      }
      if (line) lines.push(line);
      el._lines = lines;
    }
    el._lines.forEach((l, i) => {
      ctx.fillText(l, el.x, el.y + i * lineH);
    });
  },

  // Pipeline: boxes connected by arrows
  pipeline(ctx, el, p, t) {
    if (!el.stages) return;
    const stageW = el.stageW || 266;
    const stageH = el.stageH || 133;
    const gap = el.gap || 53;
    const startX = el.x || (VW - (el.stages.length * (stageW + gap) - gap)) / 2;
    const y = el.y || Math.round(VH * 0.4);

    el.stages.forEach((stage, i) => {
      const r = reveal(p, (el.revealAt || 0) + i * 0.1);
      if (r <= 0) return;
      ctx.globalAlpha = r;
      const x = startX + i * (stageW + gap);

      ctx.fillStyle = stage.fill || 'rgba(128,128,128,0.08)';
      ctx.strokeStyle = stage.color || 'rgba(128,128,128,0.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, y, stageW, stageH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = '500 29px "DM Sans", sans-serif';
      ctx.fillStyle = stage.labelColor || stage.color || '#e8e0d0';
      ctx.textAlign = 'center';
      ctx.fillText(stage.label, x + stageW / 2, y + stageH / 2 + 4);

      // Arrow to next
      if (i < el.stages.length - 1) {
        const ar = reveal(p, (el.revealAt || 0) + i * 0.1 + 0.06);
        ctx.globalAlpha = ar;
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 3;
        ctx.setLineDash([11, 8]);
        ctx.lineDashOffset = -t * 20;
        ctx.beginPath();
        ctx.moveTo(x + stageW + 2, y + stageH / 2);
        ctx.lineTo(x + stageW + gap - 2, y + stageH / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  },
};

// ── Main renderer factory ──

export function createSceneRenderer(scenes, sceneElements, opts = {}) {
  const bgColor = opts.bg || '#06060a';
  const customDrawFns = opts.draw || {};

  return function renderScene(t, ctx, w, h) {
    const sc = scenes.find((s) => t >= s.s && t < s.e) || scenes[scenes.length - 1];
    if (!sc) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const p = Math.min(1, (t - sc.s) / (sc.e - sc.s));

    // Scale to VW×VH virtual space (player.js already handles DPR).
    // Uniform scaling prevents distortion if container isn't exactly 16:9.
    // CSS aspect-ratio handles letterboxing; this is defense-in-depth.
    ctx.save();
    const scale = Math.min(w / VW, h / VH);
    const offsetX = (w - VW * scale) / 2;
    const offsetY = (h - VH * scale) / 2;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, VW, VH);

    // Draw declarative elements for this scene
    const elements = sceneElements[sc.bg];
    if (elements) {
      for (const el of elements) {
        const renderer = renderers[el.type];
        if (renderer) {
          renderer(ctx, el, p, t);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Run custom draw function if defined for this scene
    if (customDrawFns[sc.bg]) {
      customDrawFns[sc.bg](ctx, p, t);
      ctx.globalAlpha = 1;
    }

    // Post-effects
    if (opts.scanlines) {
      ctx.fillStyle = 'rgba(0,0,0,0.03)';
      for (let y = 0; y < VH; y += 3) {
        ctx.fillRect(0, y, VW, 1);
      }
    }
    if (opts.paperGrain) {
      ctx.fillStyle = `rgba(42,36,32,${opts.paperGrain})`;
      for (let y = 0; y < VH; y += 4) {
        ctx.fillRect(0, y, VW, 1);
      }
    }

    ctx.restore();
  };
}
