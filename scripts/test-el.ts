#!/usr/bin/env npx tsx
/**
 * Tests for the el() DOM builder in player.js.
 * Uses a minimal DOM mock — no jsdom dependency needed.
 *
 * Usage: npx tsx scripts/test-el.ts
 */

// === Minimal DOM mock (just enough to test el()) ===

class MockNode {
  nodeType = 1;
  childNodes: MockNode[] = [];
  children: MockElement[] = [];
  textContent = "";
  parentNode: MockNode | null = null;
  firstChild: MockNode | null = null;

  appendChild(child: MockNode) {
    this.childNodes.push(child);
    if (child instanceof MockElement) this.children.push(child);
    child.parentNode = this;
    this.firstChild = this.childNodes[0] || null;
    this._updateText();
    return child;
  }

  removeChild(child: MockNode) {
    this.childNodes = this.childNodes.filter(c => c !== child);
    this.children = this.children.filter(c => c !== child);
    this.firstChild = this.childNodes[0] || null;
    this._updateText();
    return child;
  }

  _updateText() {
    this.textContent = this.childNodes.map(c => c.textContent).join("");
  }
}

class MockTextNode extends MockNode {
  nodeType = 3;
  constructor(public textContent: string) { super(); }
}

class MockElement extends MockNode {
  tagName: string;
  namespaceURI: string;
  className = "";
  id = "";
  disabled = false;
  style: any = { cssText: "", color: "", fontSize: "" };
  private attrs: Record<string, string> = {};

  constructor(tag: string, ns = "http://www.w3.org/1999/xhtml") {
    super();
    this.tagName = tag.toUpperCase();
    this.namespaceURI = ns;
  }

  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }

  querySelector(sel: string): MockElement | null {
    const match = sel.startsWith(".") ? sel.slice(1) : sel;
    for (const child of this.children) {
      if (sel.startsWith(".") && child.className.includes(match)) return child;
      if (child.tagName === match.toUpperCase()) return child;
      const deep = child.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
}

// Mock document
const mockDocument = {
  createElement(tag: string) { return new MockElement(tag); },
  createElementNS(ns: string, tag: string) { return new MockElement(tag, ns); },
  createTextNode(text: string) { return new MockTextNode(text); },
};
(globalThis as any).document = mockDocument;

// === The function under test (copied from player.js) ===

function el(tag: string, attrs: Record<string, any> = {}, ...children: any[]) {
  const e = tag.includes(":")
    ? document.createElementNS("http://www.w3.org/2000/svg", tag.split(":")[1])
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") (e as any).className = v;
    else if (k === "style" && typeof v === "string") (e as any).style.cssText = v;
    else if (k.startsWith("data")) e.setAttribute(k.replace(/([A-Z])/g, "-$1").toLowerCase(), v);
    else if (k === "disabled") (e as any).disabled = v;
    else e.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    (e as any).appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return e;
}

// === Test runner ===

let passed = 0, failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); passed++; }
  catch (e: any) { console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${e.message}`); failed++; }
}

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log("\nTesting el() DOM builder\n");

// === Basic creation ===

test("creates a div", () => {
  const e = el("div") as any;
  assert(e.tagName === "DIV", `Expected DIV, got ${e.tagName}`);
});

test("creates h3 with text", () => {
  const e = el("h3", {}, "Hello") as any;
  assert(e.tagName === "H3", `Expected H3`);
  assert(e.textContent === "Hello", `Expected Hello`);
});

// === Attributes ===

test("sets className", () => {
  const e = el("div", { className: "quiz-option selected" }) as any;
  assert(e.className === "quiz-option selected", `Expected class`);
});

test("sets id", () => {
  const e = el("div", { id: "fb-slot" }) as any;
  assert(e.getAttribute("id") === "fb-slot", `Expected id`);
});

test("sets data attributes", () => {
  const e = el("button", { "data-k": "A", "data-c": "true" }) as any;
  assert(e.getAttribute("data-k") === "A", `Expected data-k=A`);
  assert(e.getAttribute("data-c") === "true", `Expected data-c=true`);
});

test("sets disabled", () => {
  const e = el("button", { disabled: true }) as any;
  assert(e.disabled === true, `Expected disabled`);
});

test("sets style as string", () => {
  const e = el("div", { style: "color:red;font-size:14px" }) as any;
  assert(e.style.cssText === "color:red;font-size:14px", `Expected cssText`);
});

// === Children ===

test("appends text children", () => {
  const e = el("p", {}, "Hello ", "World") as any;
  assert(e.textContent === "Hello World", `Expected Hello World`);
});

test("appends element children", () => {
  const e = el("div", {},
    el("span", { className: "ok" }, "A"),
    "Option text"
  ) as any;
  assert(e.children.length === 1, `Expected 1 element child`);
  assert(e.childNodes.length === 2, `Expected 2 nodes`);
  assert(e.textContent === "AOption text", `Expected full text`);
});

test("skips null/undefined children", () => {
  const e = el("div", {}, null, "text", undefined) as any;
  assert(e.childNodes.length === 1, `Expected 1 child`);
});

test("deeply nested elements", () => {
  const e = el("div", { className: "ch-item" },
    el("div", { className: "ch-time" }, "1:20"),
    el("div", { className: "ch-info" },
      el("h4", {}, "Quiz Title"),
      el("p", {}, "Description")
    )
  ) as any;
  assert(e.children.length === 2, `Expected 2 children`);
  assert(e.querySelector("h4")?.textContent === "Quiz Title", `Expected h4`);
  assert(e.querySelector("p")?.textContent === "Description", `Expected p`);
});

// === SVG ===

test("creates SVG polygon with svg: prefix", () => {
  const e = el("svg:polygon", { points: "5,3 19,12 5,21" }) as any;
  assert(e.namespaceURI === "http://www.w3.org/2000/svg", `Expected SVG ns`);
  assert(e.getAttribute("points") === "5,3 19,12 5,21", `Expected points`);
});

test("creates SVG rect", () => {
  const e = el("svg:rect", { x: "5", y: "3", width: "4", height: "18" }) as any;
  assert(e.namespaceURI === "http://www.w3.org/2000/svg", `Expected SVG ns`);
  assert(e.getAttribute("width") === "4", `Expected width`);
});

// === Real engine patterns ===

test("quiz option button (lesson.js)", () => {
  const btn = el("button", { className: "quiz-option", "data-k": "B", "data-c": "true" },
    el("span", { className: "ok" }, "B"),
    "The correct answer"
  ) as any;
  assert(btn.getAttribute("data-k") === "B", `Expected data-k`);
  assert(btn.querySelector(".ok")?.textContent === "B", `Expected ok span`);
  assert(btn.textContent === "BThe correct answer", `Expected text`);
});

test("feedback panel (lesson.js)", () => {
  const p = el("div", { className: "feedback-panel correct" },
    el("div", { className: "fb-title" }, "Exactly right"),
    el("div", { className: "fb-body" }, "Explanation.")
  ) as any;
  assert(p.className === "feedback-panel correct", `Expected class`);
  assert(p.querySelector(".fb-title")?.textContent === "Exactly right", `Expected title`);
});

test("score display (lesson.js)", () => {
  const s = el("span", {}, "Quiz: ", el("b", {}, "3/5")) as any;
  assert(s.textContent === "Quiz: 3/5", `Expected Quiz: 3/5`);
});

test("chapter item (player.js)", () => {
  const item = el("div", { className: "ch-item", "data-id": "q-test" },
    el("div", { className: "ch-time" }, "2:30"),
    el("div", { className: "ch-info" },
      el("h4", {}, "Understanding XSS"),
      el("p", {}, "What happens when code is submitted?")
    )
  ) as any;
  assert(item.getAttribute("data-id") === "q-test", `Expected data-id`);
  assert(item.querySelector(".ch-time")?.textContent === "2:30", `Expected time`);
  assert(item.querySelector("h4")?.textContent === "Understanding XSS", `Expected h4`);
});

// === XSS safety ===

test("text children never parsed as HTML", () => {
  const e = el("div", {}, "<script>alert(1)<\/script>") as any;
  assert(e.childNodes.length === 1, `Expected 1 node`);
  assert(e.childNodes[0].nodeType === 3, `Expected TEXT_NODE`);
  assert(e.children.length === 0, `Expected 0 element children`);
});

// === Summary ===

console.log(`\n${"─".repeat(40)}`);
console.log(`  ${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
