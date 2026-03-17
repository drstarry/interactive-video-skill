#!/usr/bin/env npx tsx
/**
 * Post-generation evaluator: checks a generated lesson against expected properties.
 *
 * Usage: npx tsx eval_check.ts <lesson-id> --out <output-dir> [--case <case-id>]
 *
 * Without --case, runs all applicable checks. With --case, validates against
 * a specific test case from eval_cases.json.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseScenes, parseInteractions } from '../scripts/parse_html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const lessonId = args[0];
const outIdx = args.indexOf('--out');
const caseIdx = args.indexOf('--case');
const outDir = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : resolve('.');
const caseId = caseIdx >= 0 ? args[caseIdx + 1] : null;

if (!lessonId) {
  console.error('Usage: npx tsx eval_check.ts <lesson-id> --out <output-dir> [--case <case-id>]');
  process.exit(1);
}

// Load test cases
const casesPath = join(__dirname, 'eval_cases.json');
let allCases: any[];
try {
  allCases = JSON.parse(readFileSync(casesPath, 'utf-8'));
} catch (e) {
  console.error(`Failed to parse ${casesPath}: ${e}`);
  process.exit(1);
}

const testCase = caseId ? allCases.find(c => c.id === caseId) : null;

const expect = testCase?.expect ?? {
  html_exists: true,
  content_json_exists: true,
  audio_exists: true,
  min_scenes: 2,
  min_interactions: 1,
  has_footer: true,
  has_data_theme: true,
  no_validation_errors: true,
};

// ── Result tracking ──
interface Result { name: string; passed: boolean; detail: string; }
const results: Result[] = [];
const startTime = Date.now();

function check(name: string, passed: boolean, detail: string = '') {
  results.push({ name, passed, detail });
  const icon = passed ? '✅' : '❌';
  const msg = detail ? `${name}: ${detail}` : name;
  console.log(`  ${icon} ${msg}`);
}

function writeReport() {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n━━━ Results: ${passed} passed, ${failed} failed (${elapsed}s) ━━━\n`);

  const report = {
    lessonId,
    caseId: testCase?.id ?? 'default',
    date: new Date().toISOString(),
    elapsed_seconds: parseFloat(elapsed),
    passed,
    failed,
    total: results.length,
    pass_rate: results.length > 0 ? (passed / results.length * 100).toFixed(1) + '%' : '0%',
    checks: results,
  };

  const reportPath = join(outDir, `eval-${lessonId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved: ${reportPath}\n`);
  return failed;
}

console.log(`\n━━━ Eval: ${lessonId} ${testCase ? `(case: ${testCase.id})` : '(default checks)'} ━━━\n`);

// ── File existence ──
const htmlPath = join(outDir, `${lessonId}.html`);
const contentPath = join(outDir, 'src', 'content', lessonId, 'content.json');
const audioDir = join(outDir, 'audio', 'lessons', lessonId);

if (expect.html_exists !== undefined) {
  check('HTML file exists', existsSync(htmlPath), htmlPath);
}
if (expect.content_json_exists !== undefined) {
  check('content.json exists', existsSync(contentPath), contentPath);
}
if (expect.audio_exists !== undefined) {
  const hasAudio = existsSync(audioDir) && existsSync(join(audioDir, 'seg0.mp3'));
  check('Audio files exist', hasAudio, audioDir);
}

// Stop early if core files missing — still write report
if (!existsSync(htmlPath) || !existsSync(contentPath)) {
  console.log('\n  ⛔ Core files missing — cannot run further checks.');
  const failed = writeReport();
  process.exit(failed > 0 ? 1 : 0);
}

// ── Parse content ──
const html = readFileSync(htmlPath, 'utf-8');
let content: any;
try {
  content = JSON.parse(readFileSync(contentPath, 'utf-8'));
} catch (e) {
  check('content.json valid JSON', false, String(e));
  const failed = writeReport();
  process.exit(failed > 0 ? 1 : 0);
}

const { meta, narration, interactions } = content;

// ── Duration checks ──
const duration = meta?.duration ?? 0;
if (expect.min_duration_seconds !== undefined) {
  check('Duration ≥ minimum', duration >= expect.min_duration_seconds,
    `${duration}s (min: ${expect.min_duration_seconds}s)`);
}
if (expect.max_duration_seconds !== undefined) {
  check('Duration ≤ maximum', duration <= expect.max_duration_seconds,
    `${duration}s (max: ${expect.max_duration_seconds}s)`);
}

// ── Scene checks (using shared parser) ──
const scenes = parseScenes(html);
const sceneCount = scenes?.starts.length ?? 0;

if (expect.min_scenes !== undefined) {
  check('Scene count ≥ minimum', sceneCount >= expect.min_scenes,
    `${sceneCount} (min: ${expect.min_scenes})`);
}
if (expect.max_scenes !== undefined) {
  check('Scene count ≤ maximum', sceneCount <= expect.max_scenes,
    `${sceneCount} (max: ${expect.max_scenes})`);
}

// ── Interaction checks (using shared parser) ──
const ixKeys = Object.keys(interactions || {});
if (expect.min_interactions !== undefined) {
  check('Interaction count ≥ minimum', ixKeys.length >= expect.min_interactions,
    `${ixKeys.length} (min: ${expect.min_interactions})`);
}

if (expect.interaction_types_varied) {
  const ixData = parseInteractions(html);
  const cats = [...new Set(ixData.map(ix => ix.cat))];
  check('Interaction types varied', cats.length >= 2,
    `${cats.length} types: ${cats.join(', ')}`);
}

// ── HTML structure checks ──
if (expect.has_footer) {
  check('Attribution footer present', html.includes('site-footer'));
}
if (expect.has_data_theme) {
  check('data-theme attribute set', /data-theme="[a-z-]+"/.test(html));
}
if (expect.has_custom_draw) {
  check('Custom draw functions present',
    html.includes('const customDraw') && !/const customDraw\s*=\s*\{\s*\}/.test(html));
}

// ── Theme color check ──
if (expect.theme_colors_from_palette) {
  const rootVars = html.match(/:root\s*\{([^}]+)\}/);
  const paletteColors: string[] = rootVars
    ? [...rootVars[1].matchAll(/#[0-9a-fA-F]{3,8}/g)].map(m => m[0].toLowerCase())
    : [];
  const elemSection = html.match(/const sceneElements\s*=\s*\{([\s\S]*?)\};/);
  let offPalette = 0;
  if (elemSection && paletteColors.length > 0) {
    const usedColors = [...elemSection[1].matchAll(/#[0-9a-fA-F]{3,8}/g)].map(m => m[0].toLowerCase());
    for (const c of usedColors) {
      if (!paletteColors.includes(c)) offPalette++;
    }
  }
  check('Colors from theme palette', offPalette <= 2,
    offPalette > 0 ? `${offPalette} off-palette colors` : 'all on-palette');
}

// ── Structural validation via validate.ts ──
// Delegates scene boundaries, feedback checks, audio files, and content safety
// to validate.ts rather than duplicating that logic here.
if (expect.no_validation_errors) {
  const skillDir = resolve(__dirname, '..');
  const validateScript = join(skillDir, 'scripts', 'validate.ts');
  try {
    const output = execFileSync('npx', [
      'tsx', validateScript, lessonId,
      '--content-dir', join(outDir, 'src/content'),
      '--audio-dir', join(outDir, 'audio/lessons'),
      '--html', htmlPath,
    ], { encoding: 'utf-8', timeout: 30000, cwd: skillDir });
    const hasErrors = /❌/.test(output) || (/\d+ errors/.test(output) && !/0 errors/.test(output));
    check('Validator passes (0 errors)', !hasErrors,
      hasErrors ? 'see validate.ts output' : 'clean');
  } catch (e: any) {
    check('Validator passes (0 errors)', false, `exit code ${e.status}`);
  }
}

// ── Lesson ID consistency ──
const htmlLessonId = html.match(/lessonId:\s*["']([^"']+)["']/)?.[1];
const jsonLessonId = meta?.lessonId;
check('Lesson ID consistent (HTML ↔ JSON)', htmlLessonId === jsonLessonId,
  `HTML: "${htmlLessonId}", JSON: "${jsonLessonId}"`);

// ── Summary ──
const failed = writeReport();
process.exit(failed > 0 ? 1 : 0);
