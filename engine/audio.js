/**
 * Audio player with cascading source resolution.
 *
 * Sources tried in order:
 *   1. Pre-generated MP3:  {basePath}/{lessonId}/seg{n}.mp3
 *   2. Browser speechSynthesis (always available fallback)
 *
 * A generation counter invalidates stale async callbacks so that
 * stop() and rapid play() calls never produce zombie audio.
 */

const MS_PER_CHAR = 65; // ~65ms per character for TTS progress estimation

export function createAudioPlayer({
  basePath = "./audio/lessons",
  lang = "en",
  onStateChange = () => {},
  onProgress = () => {},
} = {}) {
  let state = "IDLE"; // IDLE | LOADING | PLAYING | PAUSED | FINISHED
  let gen = 0; // generation counter
  let audioEl = null; // reusable Audio element (for MP3 / API sources)
  let utterance = null; // current SpeechSynthesisUtterance
  let progress = 0;
  let currentTime = 0;
  let duration = 0;
  let estimatedDur = 0; // for speechSynthesis
  let startedAt = 0; // performance.now() when PLAYING started
  let rafId = null;

  function setState(s) {
    if (s === state) return;
    state = s;
    onStateChange(s);
  }

  function cleanup() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (audioEl) {
      audioEl.onended = null;
      audioEl.onerror = null;
      audioEl.oncanplaythrough = null;
      audioEl.pause();
      audioEl.removeAttribute("src");
      audioEl.load(); // release resources
      audioEl = null;
    }
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      utterance = null;
    }
    speechSynthesis.cancel();
    progress = 0;
    currentTime = 0;
    duration = 0;
  }

  // ── Progress tracking via rAF ──

  function trackProgress() {
    if (state !== "PLAYING") return;

    if (audioEl && !isNaN(audioEl.duration) && audioEl.duration > 0) {
      currentTime = audioEl.currentTime;
      duration = audioEl.duration;
      progress = Math.min(currentTime / duration, 1);
    } else {
      // speechSynthesis — estimate from elapsed time
      const elapsed = (performance.now() - startedAt) / 1000;
      duration = estimatedDur;
      currentTime = Math.min(elapsed, duration);
      progress = estimatedDur > 0 ? Math.min(0.95, elapsed / estimatedDur) : 0;
    }

    onProgress(progress);
    rafId = requestAnimationFrame(trackProgress);
  }

  function beginTracking() {
    startedAt = performance.now();
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

  function tryPregen(thisGen, lessonId, segIdx, text) {
    const url = `${basePath}/${lessonId}/seg${segIdx}.mp3`;
    const el = new Audio(url);
    el.preload = "auto";

    el.oncanplaythrough = () => {
      if (thisGen !== gen) {
        el.pause();
        return;
      }
      audioEl = el;
      el.onended = onEnded(thisGen);
      el.onerror = null; // clear now that we're playing
      beginTracking();
    };

    let fell = false;
    const fallback = () => {
      if (fell) return;
      fell = true;
      el.oncanplaythrough = null;
      el.onended = null;
      el.onerror = null;
      el.pause();
      if (thisGen !== gen) return;
      tryBrowser(thisGen, text);
    };
    el.onerror = fallback;
    el.play().catch(fallback);
  }

  function tryBrowser(thisGen, text) {
    if (thisGen !== gen) return;

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    const voices = speechSynthesis.getVoices();
    const prefs = [
      "Samantha",
      "Daniel",
      "Karen",
      "Google UK English Male",
      "Google US English",
    ];
    let pf = null;
    for (const name of prefs) {
      pf = voices.find((v) => v.name.includes(name) && v.lang.startsWith(lang));
      if (pf) break;
    }
    if (!pf) pf = voices.find((v) => v.lang.startsWith(lang)) || voices[0];
    if (pf) u.voice = pf;

    estimatedDur = (text.length * MS_PER_CHAR) / 1000;
    utterance = u;

    u.onend = onEnded(thisGen);
    u.onerror = () => {
      if (thisGen !== gen) return;
      onEnded(thisGen)();
    };

    speechSynthesis.speak(u);
    audioEl = null; // no Audio element for browser TTS
    beginTracking();

    // Safety timeout: WebKit sometimes never fires onend on speechSynthesis.
    // Allow estimated duration + 5s grace period before force-finishing.
    const safetyMs = (estimatedDur + 5) * 1000;
    setTimeout(() => {
      if (thisGen !== gen || state !== "PLAYING") return;
      onEnded(thisGen)();
    }, safetyMs);
  }

  // ── Public API ──

  function play(lessonId, segIdx, text) {
    cleanup();
    gen++;
    const thisGen = gen;
    progress = 0;
    currentTime = 0;
    duration = 0;
    setState("LOADING");
    tryPregen(thisGen, lessonId, segIdx, text);
  }

  function stop() {
    gen++;
    cleanup();
    setState("IDLE");
  }

  function pause() {
    if (state !== "PLAYING") return;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (audioEl) audioEl.pause();
    if (utterance) speechSynthesis.pause();
    setState("PAUSED");
  }

  function resume() {
    if (state !== "PAUSED") return;
    if (audioEl) audioEl.play();
    if (utterance) speechSynthesis.resume();
    setState("PLAYING");
    rafId = requestAnimationFrame(trackProgress);
  }

  // Eagerly load voices
  speechSynthesis.getVoices();

  return {
    play,
    stop,
    pause,
    resume,
    get state() {
      return state;
    },
    get progress() {
      return progress;
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return duration;
    },
    get isPlaying() {
      return state === "PLAYING";
    },
    get isFinished() {
      return state === "FINISHED";
    },
  };
}
