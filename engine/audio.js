/**
 * Audio player using Web Audio API for sample-accurate seeking.
 *
 * Sources tried in order:
 *   1. Pre-generated MP3 → decoded to AudioBuffer via decodeAudioData()
 *   2. Browser speechSynthesis (always available fallback)
 *
 * MP3 is frame-based (~26ms frames with byte reservoir). Seeking with
 * el.currentTime lands on a frame boundary with missing context, producing
 * clicks. decodeAudioData() fully decodes to PCM samples — seeking is
 * just reading from a different array index. No frames, no clicks.
 *
 * A generation counter invalidates stale async callbacks so that
 * stop() and rapid play() calls never produce zombie audio.
 */

const MS_PER_CHAR = 65;
const FADE_TC = 0.015; // 15ms exponential fade time constant
const FADE_WAIT = 30; // ms to wait for fade to complete

export function createAudioPlayer({
  basePath = "./audio/lessons",
  lang = "en",
  onStateChange = () => {},
  onProgress = () => {},
} = {}) {
  let state = "IDLE";
  let gen = 0;

  // Web Audio API
  let ctx = null;
  let gainNode = null;
  let source = null;
  let buffer = null;
  let scratchBuffer = null; // Safari memory leak workaround
  const bufferCache = new Map(); // url → decoded AudioBuffer

  // Playback tracking (AudioBufferSourceNode has no currentTime)
  let ctxStartedAt = 0;
  let bufferOffset = 0;
  let progress = 0;
  let currentTime = 0;
  let duration = 0;
  let rafId = null;

  // speechSynthesis fallback
  let utterance = null;
  let estimatedDur = 0;
  let perfStartedAt = 0;

  let volume = 1;

  function setState(s) {
    if (s === state) return;
    state = s;
    onStateChange(s);
  }

  function ensureContext() {
    if (!ctx) {
      ctx = new AudioContext();
      gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      scratchBuffer = ctx.createBuffer(1, 1, 22050);
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  // ── Source lifecycle helpers ──

  function killSource(src) {
    if (!src) return;
    src.onended = null;
    try { src.stop(0); } catch {}
    src.disconnect();
    try { src.buffer = scratchBuffer; } catch {}
  }

  function fadeOutAndKill(src, callback) {
    if (!src || !ctx) { if (callback) callback(); return; }
    gainNode.gain.setTargetAtTime(0, ctx.currentTime, FADE_TC);
    setTimeout(() => {
      killSource(src);
      if (ctx) gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      if (callback) callback();
    }, FADE_WAIT);
  }

  function createSource(buf, offset, thisGen) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gainNode);
    src.onended = onEnded(thisGen);
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    bufferOffset = offset;
    ctxStartedAt = ctx.currentTime;
    src.start(0, offset);
    return src;
  }

  function cleanup() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    killSource(source);
    source = null;
    buffer = null;
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      utterance = null;
    }
    speechSynthesis.cancel();
    progress = 0;
    currentTime = 0;
    duration = 0;
    bufferOffset = 0;
  }

  // ── Progress tracking ──

  function trackProgress() {
    if (state !== "PLAYING") return;
    if (buffer && ctx) {
      currentTime = bufferOffset + (ctx.currentTime - ctxStartedAt);
      duration = buffer.duration;
      progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
    } else if (utterance) {
      const elapsed = (performance.now() - perfStartedAt) / 1000;
      duration = estimatedDur;
      currentTime = Math.min(elapsed, duration);
      progress = estimatedDur > 0 ? Math.min(0.95, elapsed / estimatedDur) : 0;
    }
    onProgress(progress);
    rafId = requestAnimationFrame(trackProgress);
  }

  function beginTracking() {
    setState("PLAYING");
    rafId = requestAnimationFrame(trackProgress);
  }

  function onEnded(thisGen) {
    return () => {
      if (thisGen !== gen) return;
      progress = 1;
      currentTime = duration;
      onProgress(1);
      cleanup();
      setState("FINISHED");
    };
  }

  // ── Source resolution cascade ──

  async function tryPregen(thisGen, lessonId, segIdx, text, seekOffset) {
    const url = `${basePath}/${lessonId}/seg${segIdx}.mp3`;
    try {
      let decoded = bufferCache.get(url);
      if (!decoded) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(resp.status + "");
        const arrayBuffer = await resp.arrayBuffer();
        if (thisGen !== gen) return;
        ensureContext();
        decoded = await ctx.decodeAudioData(arrayBuffer);
        if (thisGen !== gen) return;
        bufferCache.set(url, decoded);
      } else {
        ensureContext();
      }

      buffer = decoded;
      duration = decoded.duration;
      const offset = Math.max(0, Math.min(seekOffset || 0, duration - 0.01));

      source = createSource(decoded, offset, thisGen);
      beginTracking();
    } catch (e) {
      if (thisGen !== gen) return;
      tryBrowser(thisGen, text);
    }
  }

  function tryBrowser(thisGen, text) {
    if (thisGen !== gen) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    const voices = speechSynthesis.getVoices();
    const prefs = ["Samantha", "Daniel", "Karen", "Google UK English Male", "Google US English"];
    let pf = null;
    for (const name of prefs) {
      pf = voices.find((v) => v.name.includes(name) && v.lang.startsWith(lang));
      if (pf) break;
    }
    if (!pf) pf = voices.find((v) => v.lang.startsWith(lang)) || voices[0];
    if (pf) u.voice = pf;

    u.volume = volume;
    estimatedDur = (text.length * MS_PER_CHAR) / 1000;
    utterance = u;

    u.onend = onEnded(thisGen);
    u.onerror = () => { if (thisGen !== gen) return; onEnded(thisGen)(); };

    speechSynthesis.speak(u);
    perfStartedAt = performance.now();
    buffer = null;
    beginTracking();

    const safetyMs = (estimatedDur + 5) * 1000;
    setTimeout(() => {
      if (thisGen !== gen || state !== "PLAYING") return;
      onEnded(thisGen)();
    }, safetyMs);
  }

  // ── Public API ──

  function play(lessonId, segIdx, text, seekOffset) {
    cleanup();
    gen++;
    const thisGen = gen;
    progress = 0;
    currentTime = 0;
    duration = 0;
    setState("LOADING");
    ensureContext();
    tryPregen(thisGen, lessonId, segIdx, text, seekOffset);
  }

  function stop() {
    const oldSource = source;
    source = null;
    gen++;
    // Fade out before killing — cleanup() no longer has a source to kill
    fadeOutAndKill(oldSource);
    cleanup();
    setState("IDLE");
  }

  function pause() {
    if (state !== "PLAYING") return;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    if (buffer && ctx && source) {
      bufferOffset += ctx.currentTime - ctxStartedAt;
      const oldSource = source;
      source = null;
      fadeOutAndKill(oldSource);
    }
    if (utterance) speechSynthesis.pause();
    setState("PAUSED");
  }

  function resume() {
    if (state !== "PAUSED") return;
    if (buffer && ctx) {
      source = createSource(buffer, bufferOffset, gen);
    }
    if (utterance) speechSynthesis.resume();
    setState("PLAYING");
    rafId = requestAnimationFrame(trackProgress);
  }

  speechSynthesis.getVoices();

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (ctx && gainNode) gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    if (utterance) utterance.volume = volume;
  }

  return {
    play, stop, pause, resume, setVolume,
    get state() { return state; },
    get progress() { return progress; },
    get currentTime() { return currentTime; },
    get duration() { return duration; },
    get isPlaying() { return state === "PLAYING"; },
    get isFinished() { return state === "FINISHED"; },
    get volume() { return volume; },
  };
}
