#!/usr/bin/env npx tsx
/**
 * Validates a generated lesson for common errors.
 * Usage: npx tsx validate.ts <lesson-id> --content-dir <path> --audio-dir <path> --html <path>
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

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

for (const [id, ix] of Object.entries(interactions || {}) as any) {
  if (ix.options) {
    if (ix.options.length < 2 || ix.options.length > 4) {
      warn(`interaction "${id}": ${ix.options.length} options (should be 2-4)`);
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
if (!existsSync(htmlPath)) {
  warn(`HTML file not found: ${htmlPath} — skipping HTML checks`);
} else {
  const html = readFileSync(htmlPath, 'utf-8');

  // Scene boundaries
  const scenesMatch = html.match(/const scenes\s*=\s*\[([\s\S]*?)\];/);
  if (!scenesMatch) {
    warn('Could not parse scenes array from HTML');
  } else {
    const sceneText = scenesMatch[1];
    const sBounds = [...sceneText.matchAll(/s:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
    const eBounds = [...sceneText.matchAll(/e:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));

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
      ok(`${sBounds.length} scenes, boundaries checked`);
    }
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
  // Scan from the first <script to end of file — don't rely on regex closing tag
  // (because </script> inside a string IS one of the bugs we're checking for)
  const scriptStart = html.indexOf('<script');
  if (scriptStart >= 0) {
    const scriptBody = html.slice(scriptStart);
    let contentErrors = 0;

    // 0. Missing </script> — the closing tag was escaped as <\/script> (a common AI over-application)
    const hasClosingScript = /<\/script>/i.test(html);
    if (!hasClosingScript) {
      const hasEscapedClose = /<\\\/script>/i.test(html);
      if (hasEscapedClose) {
        err('Closing </script> tag is escaped as <\\/script> — browser cannot find end of script block. Auto-fixing.');
        // Fix the last occurrence (the actual closing tag)
        const fixed = html.replace(/<\\\/script>\s*$/im, '</script>');
        writeFileSync(htmlPath, fixed);
        ok('Auto-fixed: restored </script> closing tag');
        contentErrors++;
      } else {
        err('No closing </script> tag found');
      }
    }

    // 1. Multiple </script> tags — the first closes the block, extras mean one is inside a string
    const scriptCloses = (scriptBody.match(/<\/script>/gi) || []).length;
    if (scriptCloses > 1) {
      err(`Found ${scriptCloses} </script> tags — one is inside a string literal. Auto-fixing: <\\/ replaces </`);
      // Auto-fix: replace </ with <\/ inside string literals (standard HTML escaping)
      const fixed = html.replace(/<script([^>]*)>([\s\S]*)<\/script>/i, (match, attrs, body) => {
        // In the script body, escape all </ sequences except the final closing tag
        const safeBody = body.replace(/<\//g, '<\\/');
        return `<script${attrs}>${safeBody}</script>`;
      });
      writeFileSync(htmlPath, fixed);
      ok('Auto-fixed: </ escaped to <\\/ in script body');
      contentErrors++;
    }

    // 2. Curly double quotes break JS strings
    if (scriptBody.includes('\u201c') || scriptBody.includes('\u201d')) {
      err('Found curly double quotes (\u201c\u201d) in script. Auto-fixing: replacing with straight quotes');
      let fixed = readFileSync(htmlPath, 'utf-8');
      fixed = fixed.replace(/[\u201c\u201d]/g, '"');
      writeFileSync(htmlPath, fixed);
      ok('Auto-fixed: curly double quotes replaced with straight quotes');
      contentErrors++;
    }

    // 3. Curly single quotes / smart apostrophes
    const curlyApos = (scriptBody.match(/[\u2018\u2019]/g) || []).length;
    if (curlyApos > 0) {
      warn(`Found ${curlyApos} curly apostrophes (\u2018\u2019) in script. Auto-fixing: replacing with straight apostrophes`);
      let fixed = readFileSync(htmlPath, 'utf-8');
      fixed = fixed.replace(/[\u2018\u2019]/g, "'");
      writeFileSync(htmlPath, fixed);
      ok('Auto-fixed: curly apostrophes replaced with straight apostrophes');
      contentErrors++;
    }

    if (contentErrors === 0) ok('Content safety checks passed');
  }
}

// ── 4. Content JSON safety ──
// Check narration text for characters that cause problems when embedded in HTML/JS
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
