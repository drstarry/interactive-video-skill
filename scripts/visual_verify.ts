#!/usr/bin/env npx tsx
/**
 * Visual verification: opens a lesson in Playwright, plays through scenes,
 * and captures a screenshot at each scene + interaction point.
 *
 * Usage: npx tsx visual_verify.ts <lesson-id> --html <path> --out <screenshot-dir>
 *
 * Requires: npx playwright install chromium (one-time)
 */

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseScenes, parseInteractions } from './parse_html.js';

let chromium: any;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('⚠  Playwright not installed — skipping visual verification.');
  console.log('   Install with: npx playwright install chromium');
  process.exit(0);
}

const args = process.argv.slice(2);
const lessonId = args[0];
const htIdx = args.indexOf('--html');
const outIdx = args.indexOf('--out');
const htmlPath = htIdx >= 0 && args[htIdx + 1] ? resolve(args[htIdx + 1]) : resolve(`./${lessonId}.html`);
const outDir = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : resolve(`./verify-${lessonId}`);

if (!lessonId) {
  console.error('Usage: npx tsx visual_verify.ts <lesson-id> [--html <path>] [--out <dir>]');
  process.exit(1);
}

if (!existsSync(htmlPath)) {
  console.error(`HTML not found: ${htmlPath}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const html = readFileSync(htmlPath, 'utf-8');
const scenes = parseScenes(html);
if (!scenes) {
  console.error('Could not parse scenes array from HTML');
  process.exit(1);
}

const ixTimes = parseInteractions(html);

console.log(`\nVisual verification: ${lessonId}`);
console.log(`  ${scenes.starts.length} scenes, ${ixTimes.length} interactions`);
console.log(`  Screenshots → ${outDir}\n`);

/** Seek the lesson player to a specific time by clicking the progress bar. */
async function seekTo(page: any, time: number): Promise<void> {
  await page.evaluate((t: number) => {
    const tbar = document.getElementById('tbar');
    if (!tbar) return;
    const rect = tbar.getBoundingClientRect();
    const durText = document.getElementById('t-dur')?.textContent || '0:00';
    const parts = durText.split(':').map(Number);
    const dur = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
    if (dur > 0) {
      const x = rect.left + rect.width * (t / dur);
      tbar.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: rect.top + rect.height / 2, bubbles: true }));
    }
  }, time);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(`file://${htmlPath}`);
  await page.waitForLoadState('networkidle');

  // Screenshot the initial state
  await page.screenshot({ path: join(outDir, '00-initial.png') });
  console.log('  📸 00-initial.png');

  // Click play
  const playBtn = page.locator('#btn-play');
  if (await playBtn.isVisible()) {
    await playBtn.click();
    await page.waitForTimeout(500);
  }

  // Mute narration to speed through
  const muteBtn = page.locator('#btn-mute');
  if (await muteBtn.isVisible()) {
    await muteBtn.click();
  }

  // Capture at the midpoint of each scene
  for (let i = 0; i < scenes.starts.length; i++) {
    const mid = (scenes.starts[i] + scenes.ends[i]) / 2;
    const label = scenes.labels[i] || `scene-${i}`;
    const safeName = label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    await seekTo(page, mid);
    await page.waitForTimeout(800);

    const filename = `${String(i + 1).padStart(2, '0')}-${safeName}.png`;
    await page.screenshot({ path: join(outDir, filename) });
    console.log(`  📸 ${filename} (t=${mid.toFixed(1)}s)`);
  }

  // Capture at each interaction point
  for (const ix of ixTimes) {
    await seekTo(page, ix.time);
    await page.waitForTimeout(1200);

    const filename = `ix-${ix.id}.png`;
    await page.screenshot({ path: join(outDir, filename) });
    console.log(`  📸 ${filename} (t=${ix.time.toFixed(1)}s)`);
  }

  console.log(`\n✅ ${scenes.starts.length + ixTimes.length + 1} screenshots saved to ${outDir}\n`);
} finally {
  await browser.close();
}
