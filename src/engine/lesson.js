/**
 * Lesson bootstrap — handles quiz/widget UI, scoring, and player creation.
 * Lessons only need to provide: scenes, IX, renderScene, and optional widget renderers.
 *
 * Usage:
 *   import { createLesson } from './src/engine/lesson.js';
 *   createLesson({ lessonId, scenes, IX, render, widgets, math });
 */

import { createPlayer, esc, el } from "./player.js";

// ── Shared helpers ──

function feedbackPanel(isCorrect, title, body) {
  return el("div", { className: "feedback-panel " + (isCorrect ? "correct" : "wrong") },
    el("div", { className: "fb-title" }, title),
    el("div", { className: "fb-body" }, body)
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Built-in widget renderers ──
// Detected via `widget` field in content.json interaction data.
// Custom widgets passed via `widgets` parameter take precedence.

const builtinWidgets = {

  // ── Sort: drag items into correct order ──
  sort(container, ixData) {
    const items = (ixData.sortItems || []).map((text, i) => ({ text, correctIndex: i }));
    let order = shuffle(items);
    let checked = false;

    const list = el("div", { className: "widget-sort-list" });
    const fbSlot = el("div", {});
    container.appendChild(list);
    container.appendChild(fbSlot);

    function renderList() {
      list.textContent = "";
      order.forEach((item, i) => {
        const row = el("div", {
          className: "sort-item" + (checked ? (item.correctIndex === i ? " correct" : " wrong") : ""),
          draggable: checked ? "false" : "true",
          "data-idx": String(i),
        },
          el("span", { className: "sort-handle" }, "\u2261"),
          el("span", { className: "sort-text" }, item.text),
          checked ? el("span", { className: "sort-badge" }, item.correctIndex === i ? "\u2713" : String(item.correctIndex + 1)) : null
        );
        if (!checked) {
          row.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", String(i));
            row.classList.add("dragging");
          });
          row.addEventListener("dragend", () => row.classList.remove("dragging"));
          row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("drag-over"); });
          row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
          row.addEventListener("drop", (e) => {
            e.preventDefault();
            row.classList.remove("drag-over");
            const from = parseInt(e.dataTransfer.getData("text/plain"));
            const to = i;
            if (from !== to) {
              const moved = order.splice(from, 1)[0];
              order.splice(to, 0, moved);
              renderList();
            }
          });
          // Touch support
          let touchIdx = -1;
          row.addEventListener("touchstart", (e) => {
            touchIdx = i;
            row.classList.add("dragging");
          }, { passive: true });
          row.addEventListener("touchmove", (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.(".sort-item");
            list.querySelectorAll(".sort-item").forEach(r => r.classList.remove("drag-over"));
            if (target) target.classList.add("drag-over");
          });
          row.addEventListener("touchend", (e) => {
            row.classList.remove("dragging");
            const touch = e.changedTouches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.(".sort-item");
            list.querySelectorAll(".sort-item").forEach(r => r.classList.remove("drag-over"));
            if (target) {
              const to = parseInt(target.dataset.idx);
              if (touchIdx !== to) {
                const moved = order.splice(touchIdx, 1)[0];
                order.splice(to, 0, moved);
                renderList();
              }
            }
          });
        }
        list.appendChild(row);
      });
    }

    renderList();

    // Wire the Check/Continue button
    const btn = document.getElementById("btn-next");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Check order";
      btn.addEventListener("click", (e) => {
        if (!checked) {
          e.stopImmediatePropagation(); // prevent wire() finish handler from closing overlay
          checked = true;
          const count = order.filter((item, i) => item.correctIndex === i).length;
          const allRight = count === order.length;
          fbSlot.textContent = "";
          fbSlot.appendChild(feedbackPanel(allRight,
            allRight ? "Perfect order!" : count + " of " + order.length + " in the right place",
            allRight ? (ixData.feedback?.correct?.body || "") : (ixData.feedback?.wrong?.body || "The correct order is shown by the numbers.")
          ));
          renderList();
          const b = document.getElementById("btn-next");
          if (b) b.textContent = "Continue";
        }
      }, { once: true });
    }
  },

  // ── Categorize: drag items into labeled buckets ──
  categorize(container, ixData) {
    const categories = ixData.categories || [];  // [{ label, items: [...] }]
    const allItems = [];
    categories.forEach((cat, ci) => {
      (cat.items || []).forEach(text => allItems.push({ text, correctCat: ci }));
    });
    const shuffled = shuffle(allItems);
    let checked = false;

    // Source pool
    const pool = el("div", { className: "cat-pool" });
    const buckets = el("div", { className: "cat-buckets" });
    const fbSlot = el("div", {});

    const bucketEls = categories.map((cat, ci) => {
      const bucket = el("div", { className: "cat-bucket", "data-cat": String(ci) },
        el("div", { className: "cat-label" }, cat.label),
        el("div", { className: "cat-items", "data-cat": String(ci) })
      );
      bucket.addEventListener("dragover", (e) => { e.preventDefault(); bucket.classList.add("drag-over"); });
      bucket.addEventListener("dragleave", () => bucket.classList.remove("drag-over"));
      bucket.addEventListener("drop", (e) => {
        e.preventDefault();
        bucket.classList.remove("drag-over");
        const itemIdx = e.dataTransfer.getData("text/plain");
        const chip = container.querySelector('[data-item-idx="' + itemIdx + '"]');
        if (chip) bucket.querySelector(".cat-items").appendChild(chip);
      });
      return bucket;
    });

    // Pool also accepts drops (return items)
    pool.addEventListener("dragover", (e) => e.preventDefault());
    pool.addEventListener("drop", (e) => {
      e.preventDefault();
      const itemIdx = e.dataTransfer.getData("text/plain");
      const chip = container.querySelector('[data-item-idx="' + itemIdx + '"]');
      if (chip) pool.appendChild(chip);
    });

    shuffled.forEach((item, idx) => {
      const chip = el("div", {
        className: "cat-chip",
        draggable: "true",
        "data-item-idx": String(idx),
        "data-correct-cat": String(item.correctCat),
      }, item.text);
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(idx));
        chip.classList.add("dragging");
      });
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
      pool.appendChild(chip);
    });

    container.appendChild(pool);
    bucketEls.forEach(b => buckets.appendChild(b));
    container.appendChild(buckets);
    container.appendChild(fbSlot);

    const btn = document.getElementById("btn-next");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Check";
      btn.addEventListener("click", (e) => {
        if (!checked) {
          e.stopImmediatePropagation(); // prevent wire() finish handler from closing overlay
          checked = true;
          let correct = 0;
          container.querySelectorAll(".cat-chip").forEach(chip => {
            chip.setAttribute("draggable", "false");
            const parent = chip.closest(".cat-bucket");
            const inCat = parent ? parent.dataset.cat : "-1";
            if (inCat === chip.dataset.correctCat) { chip.classList.add("correct"); correct++; }
            else { chip.classList.add("wrong"); }
          });
          const allRight = correct === allItems.length;
          fbSlot.textContent = "";
          fbSlot.appendChild(feedbackPanel(allRight,
            allRight ? "All correct!" : correct + " of " + allItems.length + " placed correctly",
            allRight ? (ixData.feedback?.correct?.body || "") : (ixData.feedback?.wrong?.body || "")
          ));
          const b = document.getElementById("btn-next");
          if (b) b.textContent = "Continue";
        }
      }, { once: true });
    }
  },

  // ── Slider: adjust a value and see live result ──
  slider(container, ixData) {
    const cfg = ixData.slider || {};
    const min = cfg.min ?? 0;
    const max = cfg.max ?? 100;
    const step = cfg.step ?? 1;
    const initial = cfg.initial ?? Math.round((min + max) / 2);
    const unit = cfg.unit || "";
    const stops = cfg.stops || []; // [{ value, label, detail }]

    const valueDisplay = el("div", { className: "slider-value" }, String(initial) + unit);
    const slider = el("input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(initial),
      className: "widget-range",
    });
    const detail = el("div", { className: "slider-detail" });
    const marks = el("div", { className: "slider-marks" });

    function update(val) {
      valueDisplay.textContent = val + unit;
      // Find closest stop
      let best = null;
      let bestDist = Infinity;
      for (const s of stops) {
        const d = Math.abs(s.value - val);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      if (best) {
        detail.textContent = "";
        detail.appendChild(el("div", { className: "slider-stop-label" }, best.label));
        if (best.detail) detail.appendChild(el("div", { className: "slider-stop-detail" }, best.detail));
      }
    }

    slider.addEventListener("input", () => update(parseFloat(slider.value)));

    // Render stop markers
    if (stops.length) {
      stops.forEach(s => {
        const pct = ((s.value - min) / (max - min)) * 100;
        marks.appendChild(el("div", {
          className: "slider-mark",
          style: "left:" + pct + "%",
        }, el("span", { className: "slider-mark-label" }, String(s.value) + unit)));
      });
    }

    container.appendChild(valueDisplay);
    container.appendChild(slider);
    container.appendChild(marks);
    container.appendChild(detail);

    update(initial);

    const btn = document.getElementById("btn-next");
    if (btn) { btn.disabled = false; btn.textContent = "Continue"; }
  },

  // ── Hotspot: clickable regions that reveal explanations ──
  hotspot(container, ixData) {
    const spots = ixData.hotspots || []; // [{ label, explanation, icon }]
    let revealed = 0;
    const total = spots.length;

    const progress = el("div", { className: "hotspot-progress" }, "Tap each item to explore (" + revealed + "/" + total + ")");
    const grid = el("div", { className: "hotspot-grid" });
    const detailBox = el("div", { className: "hotspot-detail" });

    spots.forEach((spot, i) => {
      const btn = el("button", { className: "hotspot-btn", "data-idx": String(i) },
        el("span", { className: "hotspot-icon" }, spot.icon || "\u25CF"),
        el("span", { className: "hotspot-label" }, spot.label)
      );
      btn.addEventListener("click", () => {
        if (!btn.classList.contains("revealed")) {
          btn.classList.add("revealed");
          revealed++;
          progress.textContent = "Tap each item to explore (" + revealed + "/" + total + ")";
          if (revealed === total) {
            progress.textContent = "All explored!";
            const b = document.getElementById("btn-next");
            if (b) { b.disabled = false; b.textContent = "Continue"; }
          }
        }
        // Show detail
        detailBox.textContent = "";
        detailBox.appendChild(el("div", { className: "hotspot-detail-title" }, spot.label));
        detailBox.appendChild(el("div", { className: "hotspot-detail-body" }, spot.explanation));
        detailBox.classList.add("visible");
      });
      grid.appendChild(btn);
    });

    container.appendChild(progress);
    container.appendChild(grid);
    container.appendChild(detailBox);

    const btn = document.getElementById("btn-next");
    if (btn) { btn.disabled = total > 0; btn.textContent = total > 0 ? "Explore all items first" : "Continue"; }
  },
};

export function createLesson({
  lessonId,
  scenes,
  IX,
  render,
  widgets, // optional: { 'try-id': (container, ixData, continueFn) => {} }
  math,    // optional: { 'sceneBg': [{ id, latex, x, y, fontSize, color, displayMode, revealAt }] }
} = {}) {
  let CONTENT = null;
  let scores = { q: 0, c: 0 };
  let player = null;

  const ov = document.getElementById("ov");
  const card = document.getElementById("card");
  const bdg = document.getElementById("badge");

  fetch(`./src/content/${lessonId}/content.json`)
    .then((r) => r.json())
    .then((data) => {
      CONTENT = data;
      boot();
    })
    .catch((e) => {
      console.warn("JSON load failed:", e);
      boot();
    });

  // ── Show interaction overlay ──
  function showInteraction(ix, continueFn) {
    const ixData = CONTENT?.interactions?.[ix.id] || {};
    const title = ixData.title || ix.id;
    const desc = ixData.desc || "";
    const optionTexts = ixData.options || [];

    bdg.className = `top-badge ${ix.cat} visible`;
    bdg.textContent =
      ix.cat === "q"
        ? "Question"
        : ix.cat === "try"
          ? "Your turn"
          : ix.cat === "go"
            ? "Challenge"
            : "Reference";

    // Build card content using el() helper — safe DOM construction, no innerHTML
    card.textContent = "";
    card.appendChild(el("h3", {}, title));
    card.appendChild(el("p", { className: "desc" }, desc));

    if (ix.cat === "q") {
      const qopts = el("div", { className: "widget-quiz", id: "qopts" });
      ix.options.forEach((o, i) => {
        const btn = el("button", { className: "quiz-option", "data-k": o.k, "data-c": String(o.c) },
          el("span", { className: "ok" }, o.k),
          optionTexts[i] || o.k
        );
        qopts.appendChild(btn);
      });
      card.appendChild(qopts);
      card.appendChild(el("div", { id: "fb-slot" }));
      card.appendChild(el("button", { className: "btn-primary", id: "btn-next", disabled: true }, "Choose an answer"));
    } else if (ix.cat === "try" || ix.cat === "go") {
      card.appendChild(el("div", { id: "widget-container" }));
      const hasCustom = widgets && widgets[ix.id];
      const hasBuiltin = ixData.widget && builtinWidgets[ixData.widget];
      if (!hasCustom && !hasBuiltin) {
        card.appendChild(el("textarea", {
          id: "reflection-input",
          rows: "3",
          placeholder: "Type your thoughts...",
          className: "widget-reflection",
        }));
      }
      card.appendChild(el("button", { className: "btn-primary", id: "btn-next" }, "Continue"));
    } else if (ix.cat === "code") {
      card.appendChild(el("button", { className: "btn-primary", id: "btn-next" }, "Finish"));
    }
    ov.classList.add("active");
    requestAnimationFrame(() => {
      if (ix.cat === "try" || ix.cat === "go") {
        const container = document.getElementById("widget-container");
        if (widgets && widgets[ix.id]) {
          // Custom widget renderer takes precedence
          widgets[ix.id](container, ixData, continueFn);
        } else if (ixData.widget && builtinWidgets[ixData.widget]) {
          // Built-in widget detected from content.json
          builtinWidgets[ixData.widget](container, ixData, continueFn);
        }
      }
      wire(ix, ixData, continueFn);
    });
  }

  // ── Wire interaction events ──
  function wire(ix, ixData, continueFn) {
    const btnNext = document.getElementById("btn-next");

    function finish() {
      ov.classList.remove("active");
      bdg.classList.remove("visible");
      continueFn();
    }

    if (ix.cat === "q") {
      let sel = null;
      const options = card.querySelectorAll(".quiz-option");
      options.forEach((o) => {
        o.addEventListener("click", () => {
          if (o.classList.contains("locked")) return;
          options.forEach((x) => x.classList.remove("selected"));
          o.classList.add("selected");
          sel = o;
          btnNext.disabled = false;
          btnNext.textContent = "Confirm";
        });
      });
      btnNext.addEventListener("click", () => {
        if (!sel) return;
        if (!sel.classList.contains("locked")) {
          const ok = sel.dataset.c === "true";
          options.forEach((o) => {
            o.classList.add("locked");
            if (o.dataset.c === "true") o.classList.add("correct");
          });
          if (!ok) sel.classList.add("wrong");
          scores.q++;
          if (ok) scores.c++;
          updateScores();
          const fb = ok
            ? ixData.feedback?.correct
            : ixData.feedback?.wrong;
          const fbTitle = fb?.title || (ok ? "Correct" : "Wrong");
          const fbBody = fb?.body || "";
          const fbSlot = document.getElementById("fb-slot");
          fbSlot.textContent = "";
          fbSlot.appendChild(feedbackPanel(ok, fbTitle, fbBody));
          btnNext.textContent = "Continue";
        } else {
          finish();
        }
      });
    }

    if (ix.cat === "try" || ix.cat === "go" || ix.cat === "code") {
      btnNext.addEventListener("click", () => finish());
    }
  }

  function updateScores() {
    const scEl = document.getElementById("scores");
    if (scEl && scores.q > 0) {
      scEl.textContent = "";
      scEl.appendChild(el("span", {}, "Quiz: ", el("b", {}, scores.c + "/" + scores.q)));
    }
  }

  // ── KaTeX math layer ──
  let mathEls = [];

  function initMathLayer() {
    if (!math) return;
    const layer = document.getElementById("math-layer");
    if (!layer) return;
    const katexAvailable = typeof katex !== "undefined";
    if (!katexAvailable) {
      console.warn("KaTeX not loaded — math overlays disabled. Add KaTeX CDN to <head>.");
      return;
    }
    for (const [sceneKey, elements] of Object.entries(math)) {
      for (const mathDef of elements) {
        const div = document.createElement("div");
        div.className = "math-el";
        div.dataset.scene = sceneKey;
        div.dataset.revealAt = mathDef.revealAt || 0;
        div.style.left = `${mathDef.x}%`;
        div.style.top = `${mathDef.y}%`;
        div.style.transform = "translate(-50%, -50%)";
        div.style.fontSize = `${mathDef.fontSize || 16}px`;
        div.style.color = mathDef.color || "#e8e0d0";
        katex.render(mathDef.latex, div, {
          displayMode: mathDef.displayMode !== false,
          throwOnError: false,
        });
        layer.appendChild(div);
      }
    }
    mathEls = Array.from(layer.querySelectorAll(".math-el"));
  }

  function updateMathLayer(sceneBg, sceneProgress) {
    if (!math) return;
    for (const mathEl of mathEls) {
      const match =
        mathEl.dataset.scene === sceneBg &&
        sceneProgress >= parseFloat(mathEl.dataset.revealAt);
      mathEl.classList.toggle("visible", match);
    }
  }

  // ── Boot ──
  function boot() {
    const narration = CONTENT?.narration || [];
    const interactions = CONTENT?.interactions || {};

    IX.forEach((ix) => {
      const ixData = interactions[ix.id] || {};
      ix.title = ixData.title || ix.id;
      ix.desc = ixData.desc || "";
      if (ixData.time) ix.time = ixData.time;
    });

    const muteBtn = document.getElementById("btn-mute");
    let muted = false;

    // Wrap render to auto-update math layer after each frame
    const wrappedRender = math
      ? (t, ctx, w, h) => {
          render(t, ctx, w, h);
          const sc = scenes.find((s) => t >= s.s && t < s.e) || scenes[scenes.length - 1];
          if (sc) {
            const p = Math.min(1, (t - sc.s) / (sc.e - sc.s));
            updateMathLayer(sc.bg, p);
          }
        }
      : render;

    initMathLayer();

    // ?scene=sceneBg — jump directly to a scene for preview
    const urlScene = new URLSearchParams(location.search).get("scene");

    player = createPlayer({
      canvas: document.getElementById("cvs"),
      progressBar: document.getElementById("tbar"),
      progressFill: document.getElementById("tprog"),
      scrubber: document.getElementById("tscrub"),
      playBtn: document.getElementById("btn-play"),
      playIcon: document.getElementById("play-icon"),
      timeLabel: document.getElementById("t-cur"),
      durationLabel: document.getElementById("t-dur"),
      sceneLabel: document.getElementById("scn-label"),
      chapterList: document.getElementById("chapters"),
      lessonId,
      duration: CONTENT?.meta?.duration || 60,
      narration,
      interactions: IX,
      scenes,
      render: wrappedRender,
      onShow: showInteraction,
    });

    if (muteBtn) {
      muteBtn.addEventListener("click", () => {
        muted = !muted;
        player.setMuted(muted);
        muteBtn.textContent = muted ? "Narration: Off" : "Narration: On";
      });
    }

    const fsBtn = document.getElementById("btn-fs");
    const vidWrap = document.querySelector(".vid-wrap");
    if (fsBtn && vidWrap) {
      fsBtn.addEventListener("click", () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          vidWrap.requestFullscreen().catch(() => {});
        }
      });
      document.addEventListener("fullscreenchange", () => {
        fsBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
      });
    }

    // Jump to scene if ?scene= param is set
    if (urlScene) {
      const target = scenes.find((s) => s.bg === urlScene);
      if (target) {
        player.seek(target.s / (CONTENT?.meta?.duration || 60));
      }
    }
  }

  return { get player() { return player; }, get scores() { return scores; } };
}
