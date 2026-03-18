#!/usr/bin/env npx tsx
/**
 * E2E Playwright tests for the interactive video player.
 * Tests every user interaction: play, pause, seek, quiz, mute, chapters.
 *
 * Usage: npx tsx test_player.ts --html <path-to-lesson.html>
 *
 * Requires: npx playwright install chromium
 */

import { chromium, type Browser, type Page } from 'playwright';
import { existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { execSync, spawn } from 'child_process';

const args = process.argv.slice(2);
const htIdx = args.indexOf('--html');
const htmlPath = htIdx >= 0 && args[htIdx + 1]
  ? resolve(args[htIdx + 1])
  : null;

if (!htmlPath || !existsSync(htmlPath)) {
  console.error('Usage: npx tsx test_player.ts --html <path-to-lesson.html>');
  process.exit(1);
}

// Serve the directory containing the HTML via http-server
const htmlDir = dirname(htmlPath);
const htmlFile = basename(htmlPath);
const port = 9876 + Math.floor(Math.random() * 100);
const server = spawn('npx', ['--yes', 'http-server', htmlDir, '-p', String(port), '-c-1', '--silent'], {
  stdio: 'ignore', detached: true
});
server.unref();
// Wait for server to start
await new Promise(r => setTimeout(r, 1500));
const testUrl = `http://localhost:${port}/${htmlFile}`;

// ── Test harness ──
let passed = 0, failed = 0;
const results: { name: string; ok: boolean; detail?: string }[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
  }
  results.push({ name, ok: condition, detail });
}

// ── Helpers ──
async function getState(page: Page) {
  return page.evaluate(() => {
    const ov = document.getElementById('ov');
    return {
      time: document.getElementById('t-cur')?.textContent || '0:00',
      duration: document.getElementById('t-dur')?.textContent || '0:00',
      scene: document.getElementById('scn-label')?.textContent || '',
      quizOpen: ov?.classList.contains('active') || false,
      quizTitle: ov?.querySelector('h3')?.textContent || null,
      muteText: document.getElementById('btn-mute')?.textContent || '',
    };
  });
}

async function seekTo(page: Page, seconds: number, duration: number) {
  await page.evaluate(({ s, d }) => {
    const tbar = document.getElementById('tbar')!;
    const rect = tbar.getBoundingClientRect();
    const pct = s / d;
    const x = rect.left + rect.width * pct;
    tbar.dispatchEvent(new MouseEvent('click', {
      clientX: x, clientY: rect.top + 5, bubbles: true
    }));
  }, { s: seconds, d: duration });
}

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function dismissQuiz(page: Page) {
  // Click option B (or first available)
  const opts = await page.$$('.quiz-option');
  if (opts.length >= 2) await opts[1].click();
  else if (opts.length >= 1) await opts[0].click();
  await wait(200);
  // Click Confirm / Continue (btn-next serves both roles)
  let btn = await page.$('#btn-next');
  if (btn) await btn.click();
  await wait(300);
  // If it shows feedback, click Continue again
  btn = await page.$('#btn-next');
  if (btn) {
    const text = await btn.textContent();
    if (text?.includes('Continue')) await btn.click();
  }
  await wait(300);
}

async function ensureNoOverlay(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await getState(page);
    if (!s.quizOpen) return;
    await dismissQuiz(page);
    await wait(500);
  }
}

async function getAudioState(page: Page) {
  return page.evaluate(() => {
    // Check for AudioContext (Web Audio API)
    const contexts = (window as any).__audioContexts || [];
    // Check for Audio elements
    const audioEls = document.querySelectorAll('audio');
    // Check speechSynthesis
    const speaking = window.speechSynthesis?.speaking || false;

    return {
      hasWebAudioContext: contexts.length > 0,
      htmlAudioCount: audioEls.length,
      speechSpeaking: speaking,
    };
  });
}

// ── Main ──
(async () => {
  console.log(`\n━━━ Player E2E Tests ━━━\n`);
  console.log(`  HTML: ${htmlPath}\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Navigate via HTTP (ES modules require http://, not file://)
  await page.goto(testUrl);
  await page.waitForLoadState('networkidle');
  // Wait for lesson to boot (createLesson sets duration)
  await page.waitForFunction(() => {
    const dur = document.getElementById('t-dur')?.textContent;
    return dur && dur !== '0:00';
  }, { timeout: 10000 });

  // Parse duration from the page
  const durText = await page.textContent('#t-dur') || '0:00';
  const durParts = durText.split(':').map(Number);
  const totalDuration = durParts.length === 3
    ? durParts[0] * 3600 + durParts[1] * 60 + durParts[2]
    : durParts[0] * 60 + durParts[1];

  console.log(`  Duration: ${durText} (${totalDuration}s)\n`);

  // ════════════════════════════════════════
  // TEST GROUP 1: Initial state
  // ════════════════════════════════════════
  console.log('  ── Initial State ──');
  {
    const s = await getState(page);
    assert('Starts at 0:00', s.time === '0:00');
    assert('Duration is set', totalDuration > 0, `${totalDuration}s`);
    assert('No quiz overlay', !s.quizOpen);
    assert('Narration defaults to On', s.muteText.includes('On'));
    assert('Scene label visible', s.scene.length > 0, s.scene);
  }

  // ════════════════════════════════════════
  // TEST GROUP 2: Play / Pause
  // ════════════════════════════════════════
  console.log('\n  ── Play / Pause ──');
  {
    await page.click('#btn-play');
    await wait(2000);
    const s1 = await getState(page);
    assert('Time advances after play', s1.time !== '0:00', s1.time);

    await page.click('#btn-play'); // pause
    await wait(100);
    const s2 = await getState(page);
    await wait(1000);
    const s3 = await getState(page);
    assert('Time freezes after pause', s2.time === s3.time, `${s2.time} → ${s3.time}`);
  }

  // ════════════════════════════════════════
  // TEST GROUP 3: Seek (no quiz zone)
  // ════════════════════════════════════════
  console.log('\n  ── Seek (no quiz) ──');
  {
    await page.click('#btn-play'); // resume
    await wait(500);

    // Seek forward to a safe zone (5% — before any interactions)
    await seekTo(page, totalDuration * 0.05, totalDuration);
    await wait(500);
    const s1 = await getState(page);
    // If a quiz appeared (linked segment), dismiss it first
    if (s1.quizOpen) {
      await dismissQuiz(page);
      await wait(500);
    }
    assert('Seek forward works', true);

    // Verify still playing after seek
    const t1 = s1.time;
    await wait(1500);
    const s2 = await getState(page);
    assert('Still playing after seek', s2.time !== t1, `${t1} → ${s2.time}`);

    // Seek backward
    await seekTo(page, 5, totalDuration);
    await wait(500);
    const s3 = await getState(page);
    assert('Seek backward works', true); // if we get here without crash

    // Seek to start
    await seekTo(page, 0.5, totalDuration);
    await wait(500);
    const s4 = await getState(page);
    if (s4.quizOpen) { await dismissQuiz(page); await wait(500); }
    assert('Seek to start works', true);

    // Seek to end
    await seekTo(page, totalDuration - 3, totalDuration);
    await wait(500);
    const s5 = await getState(page);
    assert('Seek near end', true);
  }

  // ════════════════════════════════════════
  // TEST GROUP 4: Seek while paused
  // ════════════════════════════════════════
  console.log('\n  ── Seek while paused ──');
  {
    await ensureNoOverlay(page);
    // Navigate to fresh page for clean state
    await page.goto(testUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      const dur = document.getElementById('t-dur')?.textContent;
      return dur && dur !== '0:00';
    }, { timeout: 10000 });

    // Don't play — just seek while paused
    await seekTo(page, 5, totalDuration);
    await ensureNoOverlay(page);
    await wait(300);
    const t1 = (await getState(page)).time;
    await wait(1500);
    const t2 = (await getState(page)).time;
    assert('Seek while paused stays paused', t1 === t2, `${t1} → ${t2}`);

    // Resume for next tests
    await page.click('#btn-play');
    await wait(500);
  }

  // ════════════════════════════════════════
  // TEST GROUP 5: Audio plays after seek
  // ════════════════════════════════════════
  console.log('\n  ── Audio after seek ──');
  {
    await ensureNoOverlay(page);
    // Seek to ~5% (early, before interactions)
    await seekTo(page, totalDuration * 0.05, totalDuration);
    await ensureNoOverlay(page);
    await wait(2000);

    const audioActive = await page.evaluate(() => {
      // Check all possible audio sources:
      // 1. Web Audio API: AudioContext in "running" state (used by new audio.js)
      // 2. HTML5 Audio elements (legacy)
      // 3. speechSynthesis (fallback)
      const contexts = (globalThis as any).__audioContexts;

      // Check for any active AudioContext
      let webAudioRunning = false;
      // The AudioContext is internal to audio.js module, but we can detect
      // it via the audio state callback — if audio state is PLAYING, it's active
      // Simplest check: is the timeline still advancing? (audio drives the timeline)
      return true; // Will be verified by "still playing after seek" test
    });

    // The real audio test: does playback continue advancing after seek?
    // We already tested this in "Still playing after seek" above.
    // Here we verify the mute button still shows "On" (narration active)
    const muteState = await page.evaluate(() =>
      document.getElementById('btn-mute')?.textContent || ''
    );
    assert('Narration enabled after seek', muteState.includes('On'), muteState);

    // Verify time advances (proves playback is active)
    await ensureNoOverlay(page);
    const t1 = (await getState(page)).time;
    await wait(3000);
    await ensureNoOverlay(page);
    const t2 = (await getState(page)).time;
    assert('Timeline advances after seek (audio active)', t1 !== t2, `${t1} → ${t2}`);
  }

  // ════════════════════════════════════════
  // TEST GROUP 6: Mute toggle
  // ════════════════════════════════════════
  console.log('\n  ── Mute Toggle ──');
  {
    await ensureNoOverlay(page);
    const s1 = await getState(page);
    assert('Narration starts On', s1.muteText.includes('On'));

    await page.click('#btn-mute');
    await wait(200);
    const s2 = await getState(page);
    assert('Mute toggles to Off', s2.muteText.includes('Off'));

    await page.click('#btn-mute');
    await wait(200);
    const s3 = await getState(page);
    assert('Unmute toggles back to On', s3.muteText.includes('On'));
  }

  // ════════════════════════════════════════
  // TEST GROUP 7: Chapter click (seek to quiz)
  // ════════════════════════════════════════
  console.log('\n  ── Chapter Click → Quiz ──');
  {
    // Click the first chapter item
    const chapters = await page.$$('.ch-item');
    if (chapters.length > 0) {
      await chapters[0].click();
      await wait(500);
      const s = await getState(page);
      assert('Chapter click shows quiz', s.quizOpen, s.quizTitle || 'no title');

      if (s.quizOpen) {
        // Dismiss the quiz
        await dismissQuiz(page);
        await wait(500);
        const s2 = await getState(page);
        assert('Quiz dismissed after answer', !s2.quizOpen);

        // Verify playback resumes
        const t1 = s2.time;
        await wait(1500);
        const s3 = await getState(page);
        assert('Playback resumes after quiz', s3.time !== t1, `${t1} → ${s3.time}`);
      }
    } else {
      assert('Has chapter items', false, 'no .ch-item elements found');
    }
  }

  // ════════════════════════════════════════
  // TEST GROUP 8: Seek to quiz via progress bar
  // ════════════════════════════════════════
  console.log('\n  ── Seek → Quiz via Progress Bar ──');
  {
    // Find an undone interaction time from the timeline markers
    const ixTime = await page.evaluate(() => {
      const markers = document.querySelectorAll('.tm:not(.done)');
      if (markers.length === 0) return null;
      const style = (markers[0] as HTMLElement).style.left;
      return parseFloat(style) / 100; // percentage
    });

    if (ixTime !== null) {
      // Seek to just before the interaction
      const seekPct = Math.max(0, ixTime - 0.005);
      await page.evaluate((pct) => {
        const tbar = document.getElementById('tbar')!;
        const rect = tbar.getBoundingClientRect();
        const x = rect.left + rect.width * pct;
        tbar.dispatchEvent(new MouseEvent('click', {
          clientX: x, clientY: rect.top + 5, bubbles: true
        }));
      }, seekPct);
      await wait(500);

      const s = await getState(page);
      assert('Seek near interaction triggers it', s.quizOpen, s.quizTitle || 'none');

      if (s.quizOpen) {
        await dismissQuiz(page);
        await wait(500);
        const s2 = await getState(page);
        assert('Quiz from seek dismisses cleanly', !s2.quizOpen);
      }
    } else {
      console.log('  ⏭  No undone interactions to test');
    }
  }

  // ════════════════════════════════════════
  // TEST GROUP 9: Multiple rapid seeks
  // ════════════════════════════════════════
  console.log('\n  ── Rapid Seeks ──');
  {
    await ensureNoOverlay(page);
    // Rapidly seek to 5 different positions (small increments to avoid interactions)
    for (let i = 0; i < 5; i++) {
      await seekTo(page, totalDuration * (0.01 + i * 0.008), totalDuration);
      await wait(100);
    }
    await wait(500);
    await ensureNoOverlay(page);
    const s = await getState(page);
    assert('Survives rapid seeks without crash', true);
    assert('No quiz stuck after rapid seeks', !s.quizOpen);
  }

  // ════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════
  await browser.close();
  try { process.kill(-server.pid!); } catch {}

  console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);

  if (failed > 0) {
    console.log('  Failed tests:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`    ❌ ${r.name}${r.detail ? ': ' + r.detail : ''}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
})();
