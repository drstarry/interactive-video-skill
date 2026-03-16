/**
 * Pre-generate narration audio and compute exact timing.
 *
 * Usage:
 *   npx tsx build_audio.ts <lesson-id>
 *   npx tsx build_audio.ts <lesson-id> --force
 *   npx tsx build_audio.ts --all
 *   npx tsx build_audio.ts <lesson-id> --content-dir ./src/content --audio-dir ./audio/lessons
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
// Max parallel edge-tts calls. Increase for faster builds on good connections.
const CONCURRENCY = 5;

// ── Defaults (overridden per-lesson via meta.voice / meta.rate / meta.gap in content.json) ──

// Default TTS voice. Must be a valid edge-tts voice name.
// Run: npx tsx build_audio.ts --list-voices --lang en  to see options.
const DEFAULT_VOICE = "en-US-AndrewMultilingualNeural";
// TTS speaking rate. "+5%" slightly speeds up default English pace.
// Use "+0%" for natural rate. Override per-lesson via meta.rate.
const DEFAULT_RATE = "+5%";
// Silence gap between narration segments in seconds.
// 1.5s feels natural for English at +5% rate. Increase for slower languages.
const DEFAULT_GAP = 1.5;

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const DEFAULT_CONTENT_DIR = join(SCRIPT_DIR, "..", "src", "content");
const DEFAULT_AUDIO_DIR = join(SCRIPT_DIR, "..", "audio", "lessons");

// ── MP3 duration parser (replaces ffprobe) ──

const BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];
const SAMPLE_RATES_V1 = [44100, 48000, 32000];
const SAMPLE_RATES_V2 = [22050, 24000, 16000];
const SAMPLE_RATES_V25 = [11025, 12000, 8000];

function getMp3Duration(filePath: string): number {
  const buf = readFileSync(filePath);
  let offset = 0;

  // Skip ID3v2 tag
  if (
    buf.length > 10 &&
    buf[0] === 0x49 &&
    buf[1] === 0x44 &&
    buf[2] === 0x33
  ) {
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    offset = 10 + size;
    if (buf[5] & 0x10) offset += 10; // footer
  }

  // Find first valid frame
  while (offset < buf.length - 4) {
    if (buf[offset] === 0xff && (buf[offset + 1] & 0xe0) === 0xe0) break;
    offset++;
  }
  if (offset >= buf.length - 4) return 0;

  const header = buf.readUInt32BE(offset);
  const versionBits = (header >> 19) & 3; // 3=v1, 2=v2, 0=v2.5
  const srIndex = (header >> 10) & 3;
  const channelMode = (header >> 6) & 3; // 3=mono

  const isV1 = versionBits === 3;
  const sampleRate = isV1
    ? SAMPLE_RATES_V1[srIndex]
    : versionBits === 2
      ? SAMPLE_RATES_V2[srIndex]
      : SAMPLE_RATES_V25[srIndex];

  if (!sampleRate) return 0;

  // Check for Xing/Info header (VBR)
  const sideInfoSize = isV1
    ? channelMode === 3
      ? 17
      : 32
    : channelMode === 3
      ? 9
      : 17;
  const xingOffset = offset + 4 + sideInfoSize;

  if (xingOffset + 12 < buf.length) {
    const tag = buf.subarray(xingOffset, xingOffset + 4).toString("ascii");
    if (tag === "Xing" || tag === "Info") {
      const flags = buf.readUInt32BE(xingOffset + 4);
      if (flags & 1) {
        // frames field present
        const frames = buf.readUInt32BE(xingOffset + 8);
        return (frames * 1152) / sampleRate;
      }
    }
  }

  // CBR fallback: estimate from file size and first frame bitrate
  const bitrateIndex = (header >> 12) & 0xf;
  const bitrate =
    (isV1 ? BITRATES_V1_L3[bitrateIndex] : BITRATES_V2_L3[bitrateIndex]) * 1000;
  if (!bitrate) return 0;

  const audioBytes = buf.length - offset;
  return (audioBytes * 8) / bitrate;
}

// ── TTS generation ──

async function generateAudio(
  text: string,
  outputPath: string,
  voice: string,
  rate: string,
  retries = 2,
): Promise<void> {
  // Write text to temp file to avoid shell injection
  const tmpText = join(tmpdir(), `iv-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(tmpText, text);
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await execFileAsync("edge-tts", ["--file", tmpText, "--voice", voice, `--rate=${rate}`, "--write-media", outputPath]);
        return;
      } catch (e: any) {
        if (attempt < retries) {
          const wait = (attempt + 1) * 1000;
          console.log(`    retry ${attempt + 1}/${retries} in ${wait}ms...`);
          await new Promise((r) => setTimeout(r, wait));
        } else {
          throw e;
        }
      }
    }
  } finally {
    if (existsSync(tmpText)) unlinkSync(tmpText);
  }
}

// Run promises with concurrency limit, collecting errors instead of failing fast
async function parallel(tasks: (() => Promise<void>)[], limit: number): Promise<string[]> {
  const errors: string[] = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        await tasks[idx]();
      } catch (e: any) {
        errors.push(`task ${idx}: ${e?.message || e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return errors;
}

// ── Build lesson ──

interface NarrationSegment {
  t: number;
  text: string;
  endsBeforeIx?: string;
}

interface LessonData {
  meta: Record<string, any>;
  narration: (string | NarrationSegment)[];
  interactions?: Record<string, any> | any[];
}

async function buildLesson(
  lessonId: string,
  contentDir: string,
  audioDir: string,
  force: boolean,
): Promise<void> {
  const contentPath = join(contentDir, lessonId, "content.json");
  if (!existsSync(contentPath)) {
    console.log(`ERROR: ${contentPath} not found`);
    return;
  }

  const data: LessonData = JSON.parse(readFileSync(contentPath, "utf-8"));
  const meta = data.meta || {};
  const audioId = meta.lessonId || lessonId;
  const voice = meta.voice || DEFAULT_VOICE;
  const rate = meta.rate || DEFAULT_RATE;
  const gap: number = meta.gap ?? DEFAULT_GAP;

  const narration = data.narration || [];
  if (!narration.length) {
    console.log(`ERROR: no narration in ${contentPath}`);
    return;
  }

  // Normalize to [{text, endsBeforeIx?}, ...]
  const segments = narration.map((item) => {
    if (typeof item === "string") return { text: item };
    return {
      text: item.text || "",
      ...(item.endsBeforeIx ? { endsBeforeIx: item.endsBeforeIx } : {}),
    };
  });

  // Create output directory
  const outDir = join(audioDir, audioId);
  mkdirSync(outDir, { recursive: true });

  // Generate audio (parallel) + measure durations
  const durations: number[] = new Array(segments.length).fill(0);
  const tasks: (() => Promise<void>)[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const mp3Path = join(outDir, `seg${i}.mp3`);

    if (!seg.text) {
      console.log(`  seg${i}: [empty text, skipping]`);
      continue;
    }

    if (existsSync(mp3Path) && !force) {
      const dur = getMp3Duration(mp3Path);
      console.log(`  seg${i}: ${dur.toFixed(2)}s (cached)`);
      durations[i] = dur;
      continue;
    }

    const idx = i;
    tasks.push(async () => {
      const start = Date.now();
      await generateAudio(seg.text, mp3Path, voice, rate);
      const dur = getMp3Duration(mp3Path);
      durations[idx] = dur;
      console.log(`  seg${idx}: ${dur.toFixed(2)}s (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    });
  }

  if (tasks.length > 0) {
    console.log(`  Generating ${tasks.length} segments (${CONCURRENCY} concurrent)...`);
    const errors = await parallel(tasks, CONCURRENCY);
    if (errors.length > 0) {
      console.error(`\n  ${errors.length} segment(s) failed:`);
      errors.forEach((e) => console.error(`    ${e}`));
      console.error(`  Re-run with --force to retry failed segments.\n`);
    }
  }

  // Compute timing
  const times: number[] = [];
  let t = gap;
  for (const dur of durations) {
    times.push(Math.round(t * 100) / 100);
    t += dur + gap;
  }

  // Extra seconds after last segment — gives the final scene animation time to
  // complete before the player reaches "finished" state.
  const TAIL_PADDING_S = 5;
  const totalDuration = Math.round(t + TAIL_PADDING_S);

  // Compute interaction times from linked narrations
  const ixTimes: Record<string, number> = {};
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.endsBeforeIx) {
      ixTimes[seg.endsBeforeIx] =
        Math.round((times[i] + durations[i]) * 100) / 100;
    }
  }

  // Update narration with computed times
  data.narration = segments.map((seg, i) => ({
    t: times[i],
    text: seg.text,
    ...(seg.endsBeforeIx ? { endsBeforeIx: seg.endsBeforeIx } : {}),
  }));

  data.meta = data.meta || {};
  data.meta.duration = totalDuration;
  data.meta.audioGenerated = true;

  // Update interaction times
  if (data.interactions) {
    if (Array.isArray(data.interactions)) {
      for (const ix of data.interactions) {
        if (ix.id && ixTimes[ix.id] !== undefined) ix.time = ixTimes[ix.id];
      }
    } else {
      for (const [id, ix] of Object.entries(
        data.interactions as Record<string, any>,
      )) {
        if (ixTimes[id] !== undefined) ix.time = ixTimes[id];
      }
    }
  }

  // Write updated JSON
  writeFileSync(contentPath, JSON.stringify(data, null, 2) + "\n");

  // Print summary
  console.log(`\n  Timeline for ${lessonId}:`);
  console.log(
    `  ${"Seg".padStart(4)}  ${"Start".padStart(7)}  ${"Dur".padStart(6)}  ${"End".padStart(7)}  Link`,
  );
  console.log(
    `  ${"─".repeat(4)}  ${"─".repeat(7)}  ${"─".repeat(6)}  ${"─".repeat(7)}  ${"─".repeat(20)}`,
  );
  for (let i = 0; i < segments.length; i++) {
    const end = Math.round((times[i] + durations[i]) * 100) / 100;
    const link = segments[i].endsBeforeIx || "";
    const quizT = link ? ` → quiz@${ixTimes[link].toFixed(1)}s` : "";
    console.log(
      `  ${String(i).padStart(4)}  ${times[i].toFixed(2).padStart(7)}  ${durations[i].toFixed(2).padStart(6)}  ${end.toFixed(2).padStart(7)}  ${link}${quizT}`,
    );
  }

  console.log(`\n  Total duration: ${totalDuration}s`);
  console.log(`  Linked quiz times:`, ixTimes);
  console.log(`  Updated: ${contentPath}`);
  console.log(`  Audio:   ${outDir}/seg*.mp3`);
}

// ── List voices ──

function getVoices(lang: string) {
  const raw = execFileSync("edge-tts", ["--list-voices"], { encoding: "utf-8" });
  const voices: { ShortName: string; Gender: string; Locale: string; FriendlyName: string }[] = [];
  const lines = raw.split("\n").filter((l) => l.trim());
  const isTable = lines[0]?.startsWith("Name");

  if (isTable) {
    for (const line of lines.slice(2)) {
      const match = line.match(/^(\S+)\s+(Male|Female)\s/);
      if (match) {
        const shortName = match[1];
        const gender = match[2];
        const parts = shortName.split("-");
        const locale = parts.length >= 2 ? parts[0] + "-" + parts[1] : parts[0];
        voices.push({ ShortName: shortName, Gender: gender, Locale: locale, FriendlyName: shortName });
      }
    }
  } else {
    let current: any = {};
    for (const line of raw.split("\n")) {
      if (line.startsWith("Name: ")) {
        if (current.ShortName) voices.push(current);
        current = { ShortName: line.slice(6).trim() };
      } else if (line.startsWith("Gender: ")) {
        current.Gender = line.slice(8).trim();
      } else if (line.startsWith("Locale: ")) {
        current.Locale = line.slice(8).trim();
      }
    }
    if (current.ShortName) voices.push(current);
  }

  // Sanity check: if we parsed zero voices total, the output format probably changed again.
  // edge-tts always has 400+ voices. Zero means our parser is broken, not that voices don't exist.
  if (voices.length === 0) {
    console.error(
      `\n  ⚠️  Failed to parse edge-tts voice list (0 voices parsed).` +
      `\n     The output format may have changed. First 3 lines of output:` +
      `\n     ${lines.slice(0, 3).join("\n     ")}` +
      `\n     Please report this at the project's issue tracker.\n`
    );
  }

  return voices.filter(
    (v) =>
      v.Locale?.toLowerCase().startsWith(lang.toLowerCase()) ||
      v.ShortName?.toLowerCase().startsWith(lang.toLowerCase()),
  );
}

async function listVoices(lang: string): Promise<void> {
  const filtered = getVoices(lang);
  if (!filtered.length) {
    console.log(`No voices found for locale "${lang}". Try: en, ja, zh, es, ko, fr, de, pt`);
    return;
  }

  const byLocale = new Map<string, any[]>();
  for (const v of filtered) {
    if (!byLocale.has(v.Locale)) byLocale.set(v.Locale, []);
    byLocale.get(v.Locale)!.push(v);
  }

  for (const [locale, voices] of [...byLocale.entries()].sort()) {
    console.log(`\n  ${locale}:`);
    console.log(`  ${"Voice ID".padEnd(42)} ${"Gender".padEnd(8)}`);
    console.log(`  ${"─".repeat(42)} ${"─".repeat(8)}`);
    for (const v of voices.sort((a: any, b: any) => a.ShortName.localeCompare(b.ShortName))) {
      const gender = v.Gender === "Female" ? "F" : "M";
      console.log(`  ${v.ShortName.padEnd(42)} ${gender.padEnd(8)}`);
    }
  }
}

// ── Generate voice previews ──

const PREVIEW_TEXTS: Record<string, string> = {
  en: "Hi there. Let me walk you through this concept, step by step.",
  ja: "こんにちは。この概念を一歩ずつ説明させてください。",
  zh: "你好。让我一步一步地为你讲解这个概念。",
  ko: "안녕하세요. 이 개념을 단계별로 설명해 드리겠습니다.",
  es: "Hola. Permíteme explicarte este concepto paso a paso.",
  fr: "Bonjour. Laissez-moi vous expliquer ce concept étape par étape.",
  de: "Hallo. Lassen Sie mich Ihnen dieses Konzept Schritt für Schritt erklären.",
  pt: "Olá. Deixe-me explicar este conceito passo a passo.",
  it: "Ciao. Permettimi di spiegarti questo concetto passo dopo passo.",
  ar: "مرحبا. دعني أشرح لك هذا المفهوم خطوة بخطوة.",
  hi: "नमस्ते। मुझे इस अवधारणा को चरण दर चरण समझाने दीजिए।",
  ru: "Здравствуйте. Позвольте мне объяснить эту концепцию шаг за шагом.",
  th: "สวัสดีครับ ผมจะอธิบายแนวคิดนี้ทีละขั้นตอน",
  vi: "Xin chào. Hãy để tôi giải thích khái niệm này từng bước một.",
  id: "Halo. Izinkan saya menjelaskan konsep ini langkah demi langkah.",
};

async function generatePreviews(lang: string, force: boolean): Promise<void> {
  const outDir = join(SCRIPT_DIR, "..", "audio", "previews");
  mkdirSync(outDir, { recursive: true });

  const voices = getVoices(lang);

  if (!voices.length) {
    console.log(`No voices found for locale "${lang}".`);
    return;
  }

  const text = PREVIEW_TEXTS[lang] || PREVIEW_TEXTS.en;
  const manifest: {
    id: string;
    name: string;
    gender: string;
    locale: string;
  }[] = [];

  for (const v of voices) {
    const mp3Path = join(outDir, `${v.ShortName}.mp3`);
    if (existsSync(mp3Path) && !force) {
      console.log(`  ${v.ShortName}: (cached)`);
    } else {
      process.stdout.write(`  ${v.ShortName}: generating... `);
      try {
        await generateAudio(text, mp3Path, v.ShortName, DEFAULT_RATE);
        const dur = getMp3Duration(mp3Path);
        console.log(`${dur.toFixed(1)}s`);
      } catch (e: any) {
        console.log(`FAILED: ${e?.message || e}`);
        continue;
      }
    }
    manifest.push({
      id: v.ShortName,
      name:
        v.FriendlyName?.replace(/^Microsoft\s+/, "").replace(
          /\s+Online.*$/,
          "",
        ) || v.ShortName,
      gender: v.Gender === "Female" ? "F" : "M",
      locale: v.Locale,
    });
  }

  // Write manifest so the configurator knows what's available
  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\n  Generated ${manifest.length} previews for "${lang}"`);
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Audio:    ${outDir}/`);
}

// ── CLI ──

const args = process.argv.slice(2);
const force = args.includes("--force");
const all = args.includes("--all");
const listVoicesFlag = args.includes("--list-voices");
const generatePreviewsFlag = args.includes("--generate-previews");
const langIdx = args.indexOf("--lang");
const contentDirIdx = args.indexOf("--content-dir");
const audioDirIdx = args.indexOf("--audio-dir");

const contentDir =
  contentDirIdx >= 0 ? args[contentDirIdx + 1] : DEFAULT_CONTENT_DIR;
const audioDir = audioDirIdx >= 0 ? args[audioDirIdx + 1] : DEFAULT_AUDIO_DIR;

// Collect positional args (skip flag values)
const flagValueIndices = new Set<number>();
for (const flag of ["--content-dir", "--audio-dir", "--lang"]) {
  const idx = args.indexOf(flag);
  if (idx >= 0) flagValueIndices.add(idx + 1);
}
const lessons = args.filter(
  (a, i) => !a.startsWith("--") && !flagValueIndices.has(i),
);

async function main() {
  if (generatePreviewsFlag) {
    const lang = langIdx >= 0 ? args[langIdx + 1] : "en";
    console.log(`\n=== Generating voice previews for "${lang}" ===`);
    await generatePreviews(lang, force);
    return;
  }

  if (listVoicesFlag) {
    const lang = langIdx >= 0 ? args[langIdx + 1] : "en";
    await listVoices(lang);
    return;
  }

  let targets: string[];

  if (all) {
    targets = readdirSync(contentDir)
      .filter((d) => statSync(join(contentDir, d)).isDirectory())
      .sort();
  } else if (lessons.length) {
    targets = lessons;
  } else {
    console.log(
      "Usage:\n" +
        "  npx tsx build_audio.ts <lesson-id> [--force] [--content-dir <dir>] [--audio-dir <dir>]\n" +
        "  npx tsx build_audio.ts --all\n" +
        "  npx tsx build_audio.ts --list-voices --lang <locale>\n" +
        "  npx tsx build_audio.ts --generate-previews [--force]",
    );
    process.exit(1);
  }

  for (const lessonId of targets) {
    console.log(`\n=== Building: ${lessonId} ===`);
    await buildLesson(lessonId, contentDir, audioDir, force);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
