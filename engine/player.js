/**
 * Unified playback engine for interactive video lessons.
 *
 * Quiz timing:
 *   - Linked quizzes: narration has `endsBeforeIx: 'quiz-id'`. The quiz fires
 *     when that narration's audio finishes — no hardcoded time needed.
 *   - Unlinked quizzes: fire at `ix.time` (clock-based fallback) when audio
 *     is idle. These are "try" / "explore" moments between narrations.
 *
 * The canvas animation clock always advances. Quiz display pauses the clock.
 * Narration is sequential — each segment plays when the clock reaches its `t`.
 */

import { createAudioPlayer } from "./audio.js";

export function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Safe DOM element builder — no innerHTML, no XSS surface.
// Equivalent to hyperscript's h() — kept inline to avoid runtime dependencies
// in this zero-build, file-copy architecture. See: https://github.com/hyperhype/hyperscript
// Usage: el("h3", { className: "title" }, "Hello")
//        el("div", {}, el("span", { className: "ok" }, "A"), "Option text")
export function el(tag, attrs = {}, ...children) {
  const e = tag.includes(":")
    ? document.createElementNS("http://www.w3.org/2000/svg", tag.split(":")[1])
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") e.className = v;
    else if (k === "style" && typeof v === "string") e.style.cssText = v;
    else if (k.startsWith("data")) e.setAttribute(k.replace(/([A-Z])/g, "-$1").toLowerCase(), v);
    else if (k === "disabled") e.disabled = v;
    else e.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    e.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return e;
}

export function createPlayer({
  canvas,
  progressBar,
  progressFill,
  scrubber,
  playBtn,
  playIcon,
  timeLabel,
  durationLabel,
  sceneLabel,
  chapterList,

  lessonId,
  duration,
  narration, // [{t, text, endsBeforeIx?}, ...]
  interactions, // [{id, time, ...}, ...]
  scenes,

  render,
  onShow,
  onHide,
  onComplete,
  onNarrationChange,
  formatTime,
} = {}) {
  // ── Precompute lookup tables ──

  // narration index → interaction object (for linked quizzes)
  const narToIx = new Map();
  // interaction id → true (quiz is linked to a narration via endsBeforeIx)
  const linkedIx = new Set();

  if (interactions && narration) {
    const ixById = new Map(interactions.map((ix) => [ix.id, ix]));
    narration.forEach((seg, i) => {
      if (seg.endsBeforeIx) {
        const ix = ixById.get(seg.endsBeforeIx);
        if (ix) {
          narToIx.set(i, ix);
          linkedIx.add(ix.id);
        }
      }
    });
  }

  // ── State ──
  let time = 0,
    playing = false,
    lastTs = null,
    lastSpoke = -1;
  let narrationEnabled = true;
  const done = new Set();
  let waitingForAudio = false,
    activeIx = null;
  let currentNarIdx = -1; // which narration segment is currently playing
  let ctx = canvas.getContext("2d");
  const fmt =
    formatTime ||
    ((s) => `${(s / 60) | 0}:${((s % 60) | 0).toString().padStart(2, "0")}`);

  // ── Audio ──
  const audio = createAudioPlayer({
    onStateChange(state) {
      if (state === "FINISHED") {
        waitingForAudio = false;

        // Check if the narration that just finished is linked to a quiz
        if (currentNarIdx >= 0 && narToIx.has(currentNarIdx)) {
          const ix = narToIx.get(currentNarIdx);
          if (!done.has(ix.id)) {
            showIx(ix);
            return;
          }
        }
      }
    },
  });

  // ── Core: tick loop ──

  function tick(ts) {
    if (!playing) return;
    if (!lastTs) {
      lastTs = ts;
      requestAnimationFrame(tick);
      return;
    }
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) {
      requestAnimationFrame(tick);
      return;
    }

    const prev = time;
    time = Math.min(time + dt, duration);

    // ── Unlinked interaction triggers ──
    // Only when audio is idle — never interrupt narration mid-sentence.
    // Linked quizzes fire from the audio FINISHED callback, not here.
    if (interactions && !waitingForAudio) {
      for (const ix of interactions) {
        if (linkedIx.has(ix.id)) continue;
        if (!done.has(ix.id) && prev < ix.time && time >= ix.time - 0.15) {
          time = ix.time;
          showIx(ix);
          break;
        }
      }
    }

    // ── Narration — trigger on segment boundary ──
    if (narrationEnabled && !activeIx && !waitingForAudio) {
      const ni = getNI(time);
      if (
        ni >= 0 &&
        ni !== lastSpoke &&
        !audio.isPlaying &&
        audio.state !== "LOADING"
      ) {
        lastSpoke = ni;
        currentNarIdx = ni;
        const text = narration[ni].text;
        if (text) {
          waitingForAudio = true;
          audio.play(lessonId, ni, text);
          if (onNarrationChange) onNarrationChange(ni);
        } else if (narToIx.has(ni) && !done.has(narToIx.get(ni).id)) {
          showIx(narToIx.get(ni));
        }
      }
    }

    renderFrame();
    updateUI();

    if (time >= duration) {
      playing = false;
      updatePlayIcon(false);
      if (onComplete) onComplete();
      return;
    }
    requestAnimationFrame(tick);
  }

  function getNI(t) {
    let idx = -1;
    for (let i = 0; i < narration.length; i++) {
      if (t >= narration[i].t) idx = i;
      else break;
    }
    return idx;
  }

  // ── Interactions ──

  function showIx(ix) {
    if (activeIx) return;
    done.add(ix.id);
    activeIx = ix;
    playing = false;
    updatePlayIcon(false);
    stopAudio();

    const marker = document.querySelector(`.tm[data-id="${ix.id}"]`);
    if (marker) marker.classList.add("done");
    const chItem = document.querySelector(`.ch-item[data-id="${ix.id}"]`);
    if (chItem) chItem.classList.add("active");

    if (onShow) onShow(ix, continuePlay);
    else continuePlay();
  }

  function continuePlay() {
    const id = activeIx ? activeIx.id : null;
    activeIx = null;
    if (onHide) onHide();

    if (id) {
      const ch = document.querySelector(`.ch-item[data-id="${id}"]`);
      if (ch) {
        ch.classList.remove("active");
        ch.classList.add("done");
      }
    }

    // Resume narration from current position after quiz dismiss.
    triggerNarrationAt(time);

    playing = true;
    lastTs = null;
    updatePlayIcon(true);
    requestAnimationFrame(tick);
  }

  // ── Narration trigger helper ──
  // Used by seek(), continuePlay(), and play() to start audio for
  // the narration segment at a given time, with correct offset.

  function triggerNarrationAt(t, withOffset = true) {
    const ni = getNI(t);
    currentNarIdx = -1;
    waitingForAudio = false;

    if (narrationEnabled && ni >= 0 && narration[ni].text) {
      lastSpoke = ni;
      currentNarIdx = ni;
      waitingForAudio = true;
      const offset = withOffset ? Math.max(0, t - narration[ni].t) : 0;
      audio.play(lessonId, ni, narration[ni].text, offset || undefined);
      if (onNarrationChange) onNarrationChange(ni);
    } else {
      lastSpoke = ni;
    }
  }

  // ── Play / Pause / Seek ──

  function play() {
    if (playing || activeIx) return;
    if (time >= duration) {
      time = 0;
      lastSpoke = -1;
      currentNarIdx = -1;
    }
    playing = true;
    lastTs = null;
    updatePlayIcon(true);
    if (audio.state === "PAUSED") {
      audio.resume();
    } else if (!waitingForAudio && audio.state === "IDLE") {
      triggerNarrationAt(time, false);
    }
    requestAnimationFrame(tick);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    updatePlayIcon(false);
    audio.pause();
  }

  function toggle() {
    playing ? pause() : play();
  }

  function seek(pct) {
    if (activeIx) return;

    const wasPlaying = playing;
    if (playing) { playing = false; updatePlayIcon(false); }
    stopAudio();

    time = Math.max(0, Math.min(pct * duration, duration));

    // Check for interaction at this position
    const ix = findInteractionAt(time);
    if (ix) {
      lastSpoke = getNI(time);
      renderFrame();
      updateUI();
      showIx(ix);
      return;
    }

    // Play the current narration segment from the correct offset
    if (wasPlaying) triggerNarrationAt(time);
    else lastSpoke = getNI(time);

    renderFrame();
    updateUI();
    if (wasPlaying) play();
  }

  // Find the nearest undone interaction within ±1s of the given time
  function findInteractionAt(t) {
    if (!interactions) return null;
    // Check linked interactions (narration → quiz)
    const ni = getNI(t);
    if (ni >= 0 && narToIx.has(ni) && !done.has(narToIx.get(ni).id)) {
      return narToIx.get(ni);
    }
    // Check unlinked interactions
    for (const ix of interactions) {
      if (linkedIx.has(ix.id)) continue;
      if (!done.has(ix.id) && t >= ix.time - 0.5 && t <= ix.time + 1) {
        return ix;
      }
    }
    return null;
  }

  function setMuted(muted) {
    audio.setVolume(muted ? 0 : 1);
    // Keep narration enabled so audio keeps playing in sync — just silent.
    // No stopAudio(), no lastSpoke reset. Audio stays in lockstep with timeline.
  }

  // ── Rendering ──

  let cachedW = 0, cachedH = 0;

  function renderFrame() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const physW = Math.round(r.width * dpr);
    const physH = Math.round(r.height * dpr);
    if (physW !== cachedW || physH !== cachedH) {
      canvas.width = physW;
      canvas.height = physH;
      cachedW = physW;
      cachedH = physH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(time, ctx, r.width, r.height);

    if (scenes && sceneLabel) {
      const s = scenes.find((sc) => time >= sc.s && time < sc.e);
      if (s) {
        sceneLabel.textContent = s.label;
        sceneLabel.classList.add("visible");
      }
    }
  }

  // ── UI helpers ──

  function updateUI() {
    const pct = (time / duration) * 100;
    progressFill.style.width = pct + "%";
    if (scrubber) scrubber.style.left = pct + "%";
    timeLabel.textContent = fmt(time);
  }

  function updatePlayIcon(isPlaying) {
    if (!playIcon) return;
    while (playIcon.firstChild) playIcon.removeChild(playIcon.firstChild);
    if (isPlaying) {
      playIcon.appendChild(el("svg:rect", { x:"5", y:"3", width:"4", height:"18", rx:"1" }));
      playIcon.appendChild(el("svg:rect", { x:"15", y:"3", width:"4", height:"18", rx:"1" }));
    } else {
      playIcon.appendChild(el("svg:polygon", { points:"5,3 19,12 5,21" }));
    }
  }

  function stopAudio() {
    audio.stop();
    waitingForAudio = false;
    currentNarIdx = -1;
  }

  // ── Timeline markers + chapter list ──

  function seekToIx(ix, mt, e) {
    if (e) e.stopPropagation();
    if (activeIx) return;
    pause(); stopAudio();
    time = mt;
    lastSpoke = getNI(time);
    renderFrame(); updateUI();
    if (!done.has(ix.id)) showIx(ix);
  }

  if (interactions) {
    interactions.forEach((ix) => {
      const mt = ix.time;

      const m = document.createElement("div");
      m.className = `tm ${ix.cat || ""}`;
      m.dataset.id = ix.id;
      m.style.left = (mt / duration) * 100 + "%";
      m.appendChild(el("div", { className: "tip" }, ix.title || ix.id));
      m.addEventListener("click", (e) => seekToIx(ix, mt, e));
      progressBar.appendChild(m);

      if (chapterList) {
        const desc = ix.desc || "";
        const item = el("div", { className: "ch-item", "data-id": ix.id },
          el("div", { className: "ch-time" }, fmt(mt)),
          el("div", { className: "ch-info" },
            el("h4", {}, ix.title || ix.id),
            el("p", {}, desc.length > 60 ? desc.substring(0, 60) + "..." : desc)
          )
        );
        item.addEventListener("click", () => seekToIx(ix, mt));
        chapterList.appendChild(item);
      }
    });
  }

  // ── DOM events ──
  playBtn.addEventListener("click", toggle);
  progressBar.addEventListener("click", (e) => {
    const r = progressBar.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width);
  });
  function onResize() { renderFrame(); }
  function onKeydown(e) {
    if (e.code === "Space" && !e.target.closest("input,textarea,button")) { e.preventDefault(); toggle(); }
    if (e.code === "ArrowRight") { seek(Math.min(1, time / duration + 0.02)); }
    if (e.code === "ArrowLeft") { seek(Math.max(0, time / duration - 0.02)); }
  }
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKeydown);

  // ── Initial render ──
  if (durationLabel) durationLabel.textContent = fmt(duration);
  renderFrame();
  updateUI();

  return {
    play,
    pause,
    toggle,
    seek,
    setMuted,
    continue: continuePlay,
    renderFrame,
    updateUI,
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
    get done() {
      return done;
    },
    get activeIx() {
      return activeIx;
    },
    audio,
    destroy() {
      audio.stop();
      playing = false;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeydown);
    },
  };
}
