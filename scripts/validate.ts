#!/usr/bin/env npx tsx
/**
 * Validates a generated lesson for common errors.
 * Usage: npx tsx validate.ts <lesson-id> --content-dir <path> --audio-dir <path> --html <path>
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseScenes } from './parse_html.js';

const args = process.argv.slice(2);
const lessonId = args[0];
const cdIdx = args.indexOf('--content-dir');
const adIdx = args.indexOf('--audio-dir');
const htIdx = args.indexOf('--html');
const contentDir = cdIdx >= 0 ? args[cdIdx + 1] : './src/content';
const audioDir = adIdx >= 0 ? args[adIdx + 1] : './audio/lessons';
const htmlPath = htIdx >= 0 ? args[htIdx + 1] : `./${lessonId}.html`;

if (!lessonId) {
  console.error('Usage: npx tsx validate.ts <lesson-id> [--content-dir <path>] [--audio-dir <path>] [--html <path>]');
  process.exit(1);
}

let errors = 0;
let warnings = 0;

function err(msg: string) { console.error(`  ❌ ${msg}`); errors++; }
function warn(msg: string) { console.warn(`  ⚠  ${msg}`); warnings++; }
function ok(msg: string) { console.log(`  ✓  ${msg}`); }

console.log(`\nValidating: ${lessonId}\n`);

// ── 1. Content JSON ──
const jsonPath = join(contentDir, lessonId, 'content.json');
if (!existsSync(jsonPath)) {
  err(`content.json not found: ${jsonPath}`);
  process.exit(1);
}

const content = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const { meta, narration, interactions } = content;

// Meta
if (!meta?.duration || meta.duration <= 0) err('meta.duration is missing or zero — run build_audio.ts');
else ok(`duration: ${meta.duration}s`);

if (!meta?.lessonId) err('meta.lessonId is missing');
if (!meta?.voice) warn('meta.voice is missing — will use browser speech fallback');

// Narration
if (!narration?.length) err('narration array is empty');
else ok(`${narration.length} narration segments`);

// Check t values
const tValues = narration.map((s: any) => s.t);
const hasDuplicateT = new Set(tValues).size !== tValues.length;
if (hasDuplicateT) err('Duplicate t values in narration — segments will be skipped');

const allZero = tValues.every((t: number) => t === 0);
if (allZero && narration.length > 1) err('All narration t values are 0 — run build_audio.ts');

// endsBeforeIx references
for (const seg of narration) {
  if (seg.endsBeforeIx && !interactions?.[seg.endsBeforeIx]) {
    err(`endsBeforeIx "${seg.endsBeforeIx}" not found in interactions`);
  }
}
ok('endsBeforeIx references checked');

// Interactions
const ixKeys = Object.keys(interactions || {});
if (ixKeys.length === 0) warn('No interactions defined');
else ok(`${ixKeys.length} interactions`);

for (const [id, ix] of Object.entries(interactions || {}) as [string, any][]) {
  if (ix.options) {
    if (ix.options.length < 2) {
      err(`interaction "${id}": only ${ix.options.length} option(s)`);
    }
    if (!ix.feedback?.correct) err(`interaction "${id}": missing feedback.correct`);
    if (!ix.feedback?.wrong) err(`interaction "${id}": missing feedback.wrong`);
  }
}

// ── 2. Audio files ──
const lessonAudioDir = join(audioDir, lessonId);
if (!existsSync(lessonAudioDir)) {
  err(`Audio directory not found: ${lessonAudioDir}`);
} else {
  let missing = 0;
  for (let i = 0; i < narration.length; i++) {
    if (!existsSync(join(lessonAudioDir, `seg${i}.mp3`))) missing++;
  }
  if (missing > 0) err(`${missing} audio files missing (expected seg0.mp3 - seg${narration.length - 1}.mp3)`);
  else ok(`${narration.length} audio files present`);
}

// ── 3. HTML file ──
let html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : null;
let htmlDirty = false;
let scenes = html ? parseScenes(html) : null;

if (!html) {
  warn(`HTML file not found: ${htmlPath} — skipping HTML checks`);
} else {
  // Scene boundaries
  if (!scenes) {
    warn('Could not parse scenes array from HTML');
  } else {
    const sBounds = scenes.starts;
    const eBounds = scenes.ends;

    if (sBounds.length !== eBounds.length) {
      err('Scene s/e count mismatch');
    } else {
      // Check contiguity and overlaps
      for (let i = 1; i < sBounds.length; i++) {
        if (sBounds[i] < eBounds[i - 1] - 0.01) {
          err(`Scene ${i} (starts ${sBounds[i]}) overlaps with scene ${i - 1} (ends ${eBounds[i - 1]}). Scenes must be strictly sequential.`);
        } else if (Math.abs(sBounds[i] - eBounds[i - 1]) > 0.5) {
          warn(`Gap between scene ${i - 1} (ends ${eBounds[i - 1]}) and scene ${i} (starts ${sBounds[i]})`);
        }
      }
      // Check no scene has e <= s
      for (let i = 0; i < sBounds.length; i++) {
        if (eBounds[i] <= sBounds[i]) {
          err(`Scene ${i} has zero or negative duration (s=${sBounds[i]}, e=${eBounds[i]})`);
        }
      }
      // Check last scene matches duration
      const lastE = eBounds[eBounds.length - 1];
      if (meta?.duration && Math.abs(lastE - meta.duration) > 1) {
        err(`Last scene ends at ${lastE}s but duration is ${meta.duration}s`);
      }
      // Check max scene duration
      for (let i = 0; i < sBounds.length; i++) {
        const dur = eBounds[i] - sBounds[i];
        if (dur > 45) {
          warn(`Scene ${i} is ${dur.toFixed(1)}s (max recommended: ~40s) — consider splitting`);
        }
      }

      ok(`${sBounds.length} scenes, boundaries checked`);
    }
  }

  // Attribution footer
  if (!html.includes('site-footer')) {
    err('Attribution footer missing — add <footer class="site-footer"> before <script>');
  }

  // data-theme attribute
  if (!/data-theme="[a-z-]+"/.test(html)) {
    err('Missing data-theme attribute on <body> — theme CSS will not activate');
  }

  // Lesson ID consistency between HTML and content.json
  const htmlLessonId = html.match(/lessonId:\s*["']([^"']+)["']/)?.[1];
  if (htmlLessonId && meta?.lessonId && htmlLessonId !== meta.lessonId) {
    err(`Lesson ID mismatch: HTML has "${htmlLessonId}", content.json has "${meta.lessonId}"`);
  }

  // KaTeX check
  if (html.includes('math:') || html.includes('const math')) {
    if (!html.includes('katex')) {
      err('Math object defined but KaTeX CDN not included in <head>');
    }
  }

  // Check for createLesson usage
  if (html.includes('createLesson')) ok('Uses createLesson (engine boilerplate)');
  else if (html.includes('createPlayer')) warn('Uses createPlayer directly — consider migrating to createLesson');

  // ── Content safety: characters that break HTML/JS parsing ──
  const scriptStart = html.indexOf('<script');
  if (scriptStart >= 0) {
    const scriptBody = html.slice(scriptStart);
    let contentErrors = 0;

    // 0. Missing </script>
    const hasClosingScript = /<\/script>/i.test(html);
    if (!hasClosingScript) {
      const hasEscapedClose = /<\\\/script>/i.test(html);
      if (hasEscapedClose) {
        err('Closing </script> tag is escaped as <\\/script> — browser cannot find end of script block. Auto-fixing.');
        html = html.replace(/<\\\/script>\s*$/im, '</script>');
        htmlDirty = true;
        ok('Auto-fixed: restored </script> closing tag');
        contentErrors++;
      } else {
        err('No closing </script> tag found');
      }
    }

    // 1. Multiple </script> tags
    const scriptCloses = (scriptBody.match(/<\/script>/gi) || []).length;
    if (scriptCloses > 1) {
      err(`Found ${scriptCloses} </script> tags — one is inside a string literal. Auto-fixing.`);
      html = html.replace(/<script([^>]*)>([\s\S]*)<\/script>/i, (_match, attrs, body) => {
        const safeBody = body.replace(/<\//g, '<\\/');
        return `<script${attrs}>${safeBody}</script>`;
      });
      htmlDirty = true;
      ok('Auto-fixed: </ escaped to <\\/ in script body');
      contentErrors++;
    }

    // 2. Curly double quotes
    if (scriptBody.includes('\u201c') || scriptBody.includes('\u201d')) {
      err('Found curly double quotes in script. Auto-fixing.');
      html = html.replace(/[\u201c\u201d]/g, '"');
      htmlDirty = true;
      ok('Auto-fixed: curly double quotes replaced with straight quotes');
      contentErrors++;
    }

    // 3. Curly single quotes
    const curlyApos = (scriptBody.match(/[\u2018\u2019]/g) || []).length;
    if (curlyApos > 0) {
      warn(`Found ${curlyApos} curly apostrophes in script. Auto-fixing.`);
      html = html.replace(/[\u2018\u2019]/g, "'");
      htmlDirty = true;
      ok('Auto-fixed: curly apostrophes replaced with straight apostrophes');
      contentErrors++;
    }

    if (contentErrors === 0) ok('Content safety checks passed');
  }
}

// ── 4. Align revealAt to narration timing ──
if (html && scenes && narration?.length && meta?.duration > 0) {
  let patchCount = 0;

  for (let si = 0; si < scenes.starts.length; si++) {
    const s = scenes.starts[si];
    const e = scenes.ends[si];
    const bg = scenes.bgKeys[si];
    const dur = e - s;
    if (dur <= 0 || !bg) continue;

    // Find narration segments in this scene
    const segsInScene = narration
      .filter((seg: any) => seg.t >= s && seg.t < e)
      .map((seg: any) => seg.t as number)
      .sort((a: number, b: number) => a - b);

    if (segsInScene.length === 0) continue;

    // Compute narration time range as revealAt values (0-1 within scene)
    const firstNarr = (segsInScene[0] - s) / dur;
    const lastNarr = (segsInScene[segsInScene.length - 1] - s) / dur;
    // End of reveal range: extend past last narration start to ~90% of scene
    // (last segment needs time to play before scene ends)
    const revealEnd = Math.min(0.92, lastNarr + (lastNarr - firstNarr) / Math.max(1, segsInScene.length - 1));

    // Find this scene's block in sceneElements — require quotes to prevent substring matches
    const bgEsc = bg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockPattern = new RegExp(
      `(["']${bgEsc}["']\\s*:\\s*\\[)([\\s\\S]*?)(\\]\\s*,?)`
    );
    // Use lastIndex tracking to handle duplicate bg keys
    let searchFrom = 0;
    let blockMatch: RegExpExecArray | null = null;
    for (let attempt = 0; attempt <= si; attempt++) {
      blockMatch = blockPattern.exec(html.slice(searchFrom));
      if (!blockMatch) break;
      if (attempt < si) {
        searchFrom += blockMatch.index + blockMatch[0].length;
        blockMatch = null;
      }
    }
    // Also try unquoted key (some generators omit quotes on simple keys)
    if (!blockMatch) {
      const unquotedPattern = new RegExp(
        `(${bgEsc}\\s*:\\s*\\[)([\\s\\S]*?)(\\]\\s*,?)`
      );
      blockMatch = unquotedPattern.exec(html);
    }
    if (!blockMatch) continue;

    const block = blockMatch[2];
    const revealMatches = [...block.matchAll(/revealAt:\s*([\d.]+)/g)];
    if (revealMatches.length === 0) continue;

    // Interpolate linearly: each element gets a unique time across the narration range
    const nElements = revealMatches.length;
    const mapped: number[] = [];

    for (let i = 0; i < nElements; i++) {
      const t = nElements === 1 ? firstNarr :
        firstNarr + (i / (nElements - 1)) * (revealEnd - firstNarr);
      mapped.push(Math.round(Math.max(0, Math.min(1, t)) * 1000) / 1000);
    }

    // Check if any values actually changed
    const oldVals = revealMatches.map(m => parseFloat(m[1]));
    const needsPatch = oldVals.some((v, i) => Math.abs(v - mapped[i]) > 0.01);
    if (!needsPatch) continue;

    // Apply replacements in reverse order
    let newBlock = block;
    for (let i = revealMatches.length - 1; i >= 0; i--) {
      const m = revealMatches[i];
      const newVal = mapped[i] === 0 ? '0' : mapped[i] === 1 ? '1' :
        mapped[i].toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
      const start = (m.index ?? 0) + m[0].indexOf(m[1]);
      const end = start + m[1].length;
      newBlock = newBlock.slice(0, start) + newVal + newBlock.slice(end);
    }

    const fullOld = blockMatch[1] + block + blockMatch[3];
    const fullNew = blockMatch[1] + newBlock + blockMatch[3];
    html = html.replace(fullOld, fullNew);
    htmlDirty = true;
    patchCount++;
  }

  if (patchCount > 0) {
    ok(`Aligned revealAt in ${patchCount} scenes to match narration timing`);
  } else {
    ok('revealAt values already aligned with narration');
  }
}

// Write HTML once if any fixes were applied
if (html && htmlDirty) {
  writeFileSync(htmlPath, html);
}

// ── 5. Instruction compliance checks ──
// These encode findings from the ablation study (2026-03-22).
// Each check maps to a specific skill instruction that was found
// to be BROKEN or WEAK without mechanical enforcement.

const lengthArg = args.indexOf('--length');
const lengthSetting = lengthArg >= 0 ? args[lengthArg + 1] : 'standard';

// T5: Word count targets
const wordFloors: Record<string, [number, number]> = {
  quick: [200, 350],
  standard: [550, 700],
  deep: [800, 1100],
};
if (narration?.length) {
  const totalWords = narration
    .map((s: any) => (s.text || '').split(/\s+/).filter(Boolean).length)
    .reduce((a: number, b: number) => a + b, 0);
  const [floor, ceiling] = wordFloors[lengthSetting] || wordFloors.standard;
  if (totalWords < floor) {
    err(`Narration word count ${totalWords} is below ${lengthSetting} floor (${floor}). Expand existing segments with examples, edge cases, or "why" explanations.`);
  } else if (totalWords > ceiling * 1.2) {
    warn(`Narration word count ${totalWords} exceeds ${lengthSetting} ceiling (${ceiling}) by >20%. Consider trimming.`);
  } else {
    ok(`Narration: ${totalWords} words (${lengthSetting} target: ${floor}-${ceiling})`);
  }
}

// I7: Feedback anti-slop — banned titles
const BANNED_FEEDBACK_TITLES = [
  'not quite', 'incorrect', 'great job', 'well done',
  'nice work', 'good job', 'try again', 'oops',
];
if (interactions) {
  let slopCount = 0;
  for (const [id, ix] of Object.entries(interactions) as [string, any][]) {
    for (const key of ['correct', 'wrong'] as const) {
      const title = ix.feedback?.[key]?.title?.toLowerCase()?.trim();
      if (title && BANNED_FEEDBACK_TITLES.some(b => title === b || title.startsWith(b))) {
        err(`interaction "${id}": feedback.${key}.title "${ix.feedback[key].title}" is generic slop. Name the specific misconception or insight instead.`);
        slopCount++;
      }
    }
  }
  if (slopCount === 0) ok('Feedback titles: no banned phrases');
}

// I4: Quiz option count — exactly 3
if (interactions) {
  for (const [id, ix] of Object.entries(interactions) as [string, any][]) {
    if (ix.options && ix.options.length !== 3) {
      warn(`interaction "${id}": has ${ix.options.length} options (should be exactly 3)`);
    }
  }
}

// G3: Theme color validation
const dataThemeMatch = html?.match(/data-theme="([a-z-]+)"/);
if (dataThemeMatch && html) {
  const themeName = dataThemeMatch[1];
  try {
    const stylesPath = join(__dirname, '..', 'references', 'styles.json');
    if (existsSync(stylesPath)) {
      const styles = JSON.parse(readFileSync(stylesPath, 'utf-8'));
      const theme = styles[themeName];
      if (!theme) {
        err(`Theme "${themeName}" not found in styles.json`);
      } else {
        // Extract all hex colors from the script section
        const scriptSection = html.slice(html.indexOf('<script'));
        const hexColors = [...new Set(
          [...scriptSection.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0].toLowerCase())
        )];
        const themeColors = new Set(
          Object.values(theme.vars as Record<string, string>)
            .filter(v => typeof v === 'string' && v.startsWith('#'))
            .map(v => v.toLowerCase())
        );
        const offPalette = hexColors.filter(c => !themeColors.has(c));
        if (offPalette.length > 0) {
          warn(`${offPalette.length} hex color(s) not in ${themeName} palette: ${offPalette.slice(0, 3).join(', ')}${offPalette.length > 3 ? '...' : ''}`);
        } else if (hexColors.length > 0) {
          ok(`All ${hexColors.length} hex colors match ${themeName} theme`);
        }
      }
    }
  } catch { /* styles.json not available — skip */ }
}

// S6: Stagger interval range check (HTML only)
if (html) {
  const scriptSection = html.slice(html.indexOf('<script'));
  // Check revealAt sequences in sceneElements blocks
  const elementBlocks = [...scriptSection.matchAll(/\[\s*\{[\s\S]*?\}\s*\]/g)];
  let staggerIssues = 0;
  for (const block of elementBlocks) {
    const reveals = [...block[0].matchAll(/revealAt:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
    if (reveals.length < 2) continue;
    for (let i = 1; i < reveals.length; i++) {
      const interval = reveals[i] - reveals[i - 1];
      if (interval > 0 && (interval < 0.03 || interval > 0.25)) {
        staggerIssues++;
      }
    }
  }
  if (staggerIssues > 0) {
    warn(`${staggerIssues} stagger interval(s) outside 0.03-0.25 range — check revealAt spacing`);
  } else if (elementBlocks.length > 0) {
    ok('Stagger intervals within expected range');
  }
}

// ── 6. Content JSON safety (curly quotes) ──
const jsonRaw = readFileSync(jsonPath, 'utf-8');
let jsonContentIssues = 0;
if (jsonRaw.includes('\u201c') || jsonRaw.includes('\u201d')) {
  err('content.json contains curly double quotes. Auto-fixing: replacing with corner brackets');
  let fixed = jsonRaw.replace(/\u201c/g, '\u300c').replace(/\u201d/g, '\u300d');
  writeFileSync(jsonPath, fixed);
  ok('Auto-fixed: curly quotes replaced with corner brackets in content.json');
  jsonContentIssues++;
}
if (jsonContentIssues === 0) ok('content.json text safety checked');

// ── Summary ──
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${errors === 0 ? '✅' : '❌'} ${errors} errors, ${warnings} warnings`);
if (errors > 0) console.log('  Fix errors before presenting the lesson.');
console.log('');

process.exit(errors > 0 ? 1 : 0);
