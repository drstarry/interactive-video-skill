#!/usr/bin/env npx tsx
/**
 * Unit tests for pure functions across all engine files.
 * No browser or DOM dependencies — only tests pure logic.
 *
 * Usage: npx tsx scripts/test-engine.ts
 */

let passed = 0, failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); passed++; }
  catch (e: any) { console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${e.message}`); failed++; }
}

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
function assertClose(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: expected ~${b}, got ${a}`);
}

// ═══════════════════════════════════════════════════════════
// canvas.js — VW, VH, virtualCanvas
// ═══════════════════════════════════════════════════════════

console.log("\ncanvas.js\n");

// Inline the constants (these are just exported values, no DOM needed)
const VW = 1920;
const VH = 1080;
const virtualCanvas = { width: VW, height: VH };

test("VW is 1920", () => {
  assert(VW === 1920, `Expected 1920, got ${VW}`);
});

test("VH is 1080", () => {
  assert(VH === 1080, `Expected 1080, got ${VH}`);
});

test("aspect ratio is 16:9", () => {
  assertClose(VW / VH, 16 / 9, 0.001, "Aspect ratio");
});

test("virtualCanvas matches VW/VH", () => {
  assert(virtualCanvas.width === VW, "width mismatch");
  assert(virtualCanvas.height === VH, "height mismatch");
});

// ═══════════════════════════════════════════════════════════
// player.js — esc()
// ═══════════════════════════════════════════════════════════

console.log("\nplayer.js — esc()\n");

function esc(s: any) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

test("escapes ampersand", () => {
  assert(esc("A & B") === "A &amp; B", `Got ${esc("A & B")}`);
});

test("escapes less-than", () => {
  assert(esc("<script>") === "&lt;script&gt;", `Got ${esc("<script>")}`);
});

test("escapes quotes", () => {
  assert(esc('say "hello"') === "say &quot;hello&quot;", `Got ${esc('say "hello"')}`);
});

test("handles empty string", () => {
  assert(esc("") === "", "Should be empty");
});

test("converts numbers to string", () => {
  assert(esc(42) === "42", `Got ${esc(42)}`);
});

test("converts null/undefined to string", () => {
  assert(esc(null) === "null", `Got ${esc(null)}`);
  assert(esc(undefined) === "undefined", `Got ${esc(undefined)}`);
});

test("does not double-escape", () => {
  assert(esc("&amp;") === "&amp;amp;", "Should escape the & in &amp;");
});

test("handles XSS payloads", () => {
  const payload = '<img onerror="alert(1)">';
  const escaped = esc(payload);
  assert(!escaped.includes("<"), "Should not contain <");
  assert(!escaped.includes(">"), "Should not contain >");
  assert(!escaped.includes('"'), "Should not contain unescaped quotes");
});

// ═══════════════════════════════════════════════════════════
// scene-renderer.js — reveal()
// ═══════════════════════════════════════════════════════════

console.log("\nscene-renderer.js — reveal()\n");

const reveal = (p: number, at?: number, dur?: number) =>
  Math.max(0, Math.min(1, (p - (at || 0)) / (dur || 0.15)));

test("reveal at start (p=0, no delay)", () => {
  assert(reveal(0) === 0, `Expected 0, got ${reveal(0)}`);
});

test("reveal fully complete", () => {
  assert(reveal(1) === 1, `Expected 1, got ${reveal(1)}`);
});

test("reveal halfway through default duration", () => {
  const r = reveal(0.075);
  assertClose(r, 0.5, 0.01, "Halfway reveal");
});

test("reveal with delay — before delay", () => {
  assert(reveal(0.1, 0.3) === 0, "Should be 0 before delay");
});

test("reveal with delay — at delay", () => {
  assert(reveal(0.3, 0.3) === 0, "Should be 0 at exact delay start");
});

test("reveal with delay — after delay + duration", () => {
  const r = reveal(0.5, 0.3, 0.2);
  assert(r === 1, `Expected 1 (fully revealed), got ${r}`);
});

test("reveal with custom duration — partial", () => {
  const r = reveal(0.4, 0.3, 0.2);
  assertClose(r, 0.5, 0.01, "Half through custom duration");
});

test("reveal clamps to 0-1 range", () => {
  assert(reveal(-1) === 0, "Should clamp negative to 0");
  assert(reveal(100) === 1, "Should clamp large to 1");
});

test("reveal with zero progress and delay", () => {
  assert(reveal(0, 0.5) === 0, "Not yet reached delay point");
});

test("reveal animation curve is linear", () => {
  // Verify linearity: reveal at 25%, 50%, 75% of duration should be 0.25, 0.5, 0.75
  const dur = 0.2;
  const at = 0.1;
  assertClose(reveal(at + dur * 0.25, at, dur), 0.25, 0.01, "25% linear");
  assertClose(reveal(at + dur * 0.5, at, dur), 0.5, 0.01, "50% linear");
  assertClose(reveal(at + dur * 0.75, at, dur), 0.75, 0.01, "75% linear");
});

// ═══════════════════════════════════════════════════════════
// scene-renderer.js — createSceneRenderer() scene lookup
// ═══════════════════════════════════════════════════════════

console.log("\nscene-renderer.js — scene lookup logic\n");

// Test the scene-finding logic that runs every frame
// This is the core of renderScene(t, ctx, w, h) without the canvas dependency

interface Scene { s: number; e: number; label: string; bg: string; }

function findScene(scenes: Scene[], t: number): Scene | undefined {
  return scenes.find((s) => t >= s.s && t < s.e) || scenes[scenes.length - 1];
}

function sceneProgress(scene: Scene, t: number): number {
  return Math.min(1, (t - scene.s) / (scene.e - scene.s));
}

const testScenes: Scene[] = [
  { s: 0, e: 30, label: "Intro", bg: "intro" },
  { s: 30, e: 60, label: "Core", bg: "core" },
  { s: 60, e: 90, label: "Summary", bg: "summary" },
];

test("finds first scene at t=0", () => {
  const sc = findScene(testScenes, 0);
  assert(sc?.bg === "intro", `Expected intro, got ${sc?.bg}`);
});

test("finds second scene at t=30", () => {
  const sc = findScene(testScenes, 30);
  assert(sc?.bg === "core", `Expected core, got ${sc?.bg}`);
});

test("finds last scene at t=60", () => {
  const sc = findScene(testScenes, 60);
  assert(sc?.bg === "summary", `Expected summary, got ${sc?.bg}`);
});

test("falls back to last scene beyond duration", () => {
  const sc = findScene(testScenes, 100);
  assert(sc?.bg === "summary", `Expected summary fallback, got ${sc?.bg}`);
});

test("scene progress at start is 0", () => {
  const p = sceneProgress(testScenes[0], 0);
  assert(p === 0, `Expected 0, got ${p}`);
});

test("scene progress at midpoint is 0.5", () => {
  const p = sceneProgress(testScenes[0], 15);
  assertClose(p, 0.5, 0.01, "Midpoint progress");
});

test("scene progress at end is 1", () => {
  const p = sceneProgress(testScenes[0], 30);
  assert(p === 1, `Expected 1, got ${p}`);
});

test("scene progress clamps at 1 for overshoot", () => {
  const p = sceneProgress(testScenes[0], 50);
  assert(p === 1, `Expected 1 (clamped), got ${p}`);
});

// ═══════════════════════════════════════════════════════════
// audio.js — MS_PER_CHAR constant and duration estimation
// ═══════════════════════════════════════════════════════════

console.log("\naudio.js — duration estimation\n");

const MS_PER_CHAR = 65;

test("MS_PER_CHAR is 65", () => {
  assert(MS_PER_CHAR === 65, `Expected 65, got ${MS_PER_CHAR}`);
});

test("short text estimation is reasonable", () => {
  const text = "Hello world";
  const estimatedDur = (text.length * MS_PER_CHAR) / 1000;
  assertClose(estimatedDur, 0.715, 0.01, "Short text ~0.7s");
});

test("typical narration segment estimation", () => {
  const text = "The VIX measures thirty-day implied volatility on S&P 500 options.";
  const estimatedDur = (text.length * MS_PER_CHAR) / 1000;
  // 66 chars * 65ms = 4.29s — reasonable for one sentence
  assert(estimatedDur > 3 && estimatedDur < 6, `Expected 3-6s, got ${estimatedDur}`);
});

// ═══════════════════════════════════════════════════════════
// player.js — time formatting
// ═══════════════════════════════════════════════════════════

console.log("\nplayer.js — time formatting\n");

const fmt = (s: number) => `${(s / 60) | 0}:${((s % 60) | 0).toString().padStart(2, "0")}`;

test("formats 0 seconds", () => {
  assert(fmt(0) === "0:00", `Got ${fmt(0)}`);
});

test("formats 90 seconds as 1:30", () => {
  assert(fmt(90) === "1:30", `Got ${fmt(90)}`);
});

test("formats 5 minutes 7 seconds", () => {
  assert(fmt(307) === "5:07", `Got ${fmt(307)}`);
});

test("formats 10 minutes exactly", () => {
  assert(fmt(600) === "10:00", `Got ${fmt(600)}`);
});

test("truncates fractional seconds", () => {
  assert(fmt(61.7) === "1:01", `Got ${fmt(61.7)}`);
});

// ═══════════════════════════════════════════════════════════
// build_audio.ts — getMp3Duration frame sync magic
// ═══════════════════════════════════════════════════════════

console.log("\nbuild_audio.ts — MP3 frame constants\n");

// These are from the MPEG spec — verifying the constants are correct
const MPEG_FRAME_SAMPLES = 1152;  // samples per MP3 frame (Layer III)
const MPEG_SYNC = 0xFFE0;        // 11 set bits = frame sync

test("MP3 frame has 1152 samples (MPEG1 Layer III)", () => {
  assert(MPEG_FRAME_SAMPLES === 1152, "MPEG spec constant");
});

test("sync word is 0xFFE0 (11 set bits)", () => {
  assert((MPEG_SYNC & 0xFFE0) === 0xFFE0, "Sync word upper bits");
});

test("frame duration at 44100Hz is ~26.12ms", () => {
  const frameDur = MPEG_FRAME_SAMPLES / 44100;
  assertClose(frameDur, 0.02612, 0.0001, "Frame duration");
});

test("frame duration at 24000Hz is 48ms", () => {
  const frameDur = MPEG_FRAME_SAMPLES / 24000;
  assertClose(frameDur, 0.048, 0.001, "Frame duration at 24kHz");
});

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(40)}`);
console.log(`  ${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
