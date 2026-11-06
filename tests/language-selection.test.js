const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const languageSource = fs.readFileSync(path.join(ROOT, "language.js"), "utf8");

class FakeElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.hidden = false;
    this.textContent = "";
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  click() { for (const listener of this.listeners.get("click") || []) listener({ target: this }); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class FakeTextNode {
  constructor(value) { this.nodeType = 3; this.nodeValue = value; }
}

function makeLanguageRuntime() {
  const gate = new FakeElement();
  const app = new FakeElement();
  app.hidden = true;
  const options = new FakeElement();
  const loading = new FakeElement();
  loading.hidden = true;
  const loadingLabel = new FakeElement();
  const loadingFootnote = new FakeElement();
  const loadingPercent = new FakeElement();
  const loadingTrack = new FakeElement();
  const loadingFill = new FakeElement();
  const backButton = new FakeElement();
  const gateChildren = new Map([
    [".language-options", options],
    [".language-loading", loading],
    ["[data-loading-label]", loadingLabel],
    ["[data-loading-footnote]", loadingFootnote],
    ["[data-loading-percent]", loadingPercent],
    ["[role='progressbar']", loadingTrack],
    [".loading-fill", loadingFill],
  ]);
  gate.querySelector = (selector) => gateChildren.get(selector);
  const buttons = [new FakeElement({ language: "en" }), new FakeElement({ language: "es" })];
  const nodes = [new FakeTextNode("Start session"), new FakeTextNode("Tap to reveal translation")];
  const body = new FakeElement();
  const document = {
    title: "Japanese Cards",
    documentElement: { lang: "en" },
    body,
    querySelector(selector) {
      return new Map([
        ["#language-gate", gate],
        [".app-shell", app],
        ["#language-back-button", backButton],
      ]).get(selector);
    },
    querySelectorAll(selector) { return selector === "[data-language]" ? buttons : []; },
    createTreeWalker() {
      let index = -1;
      return { nextNode() { index += 1; return index < nodes.length ? nodes[index] : null; }, get currentNode() { return nodes[index]; } };
    },
  };
  const frames = [];
  const timers = [];
  const percentages = [];
  const stored = new Map();
  const observer = { observe() {}, disconnect() {} };
  class FakeMutationObserver { constructor(callback) { this.callback = callback; } observe() { observer.observe(); } disconnect() { observer.disconnect(); } }
  const window = {
    alert(message) { return message; },
    confirm(message) { return message; },
    prompt(message) { return message; },
    location: { reload() {} },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
  };
  const sessionStorage = {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, value); },
    removeItem(key) { stored.delete(key); },
  };
  loadingTrack.setAttribute = (name, value) => {
    FakeElement.prototype.setAttribute.call(loadingTrack, name, value);
    if (name === "aria-valuenow") percentages.push(Number(value));
  };
  const context = vm.createContext({
    document, window, sessionStorage, MutationObserver: FakeMutationObserver,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 }, NodeFilter: { SHOW_TEXT: 4 },
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { frames.push(callback); },
  });
  vm.runInContext(languageSource, context, { filename: "language.js" });
  return {
    gate, app, options, loading, loadingLabel, loadingFootnote, loadingPercent, loadingTrack,
    loadingFill, backButton, buttons, nodes, frames, timers, percentages, document,
    runFrames(times) {
      for (const time of times) {
        const frame = frames.shift();
        assert.equal(typeof frame, "function", `expected a scheduled animation frame at ${time}ms`);
        frame(time);
      }
    },
    runTimers() {
      while (timers.length) timers.shift().callback();
    },
  };
}

test("language options show flags and the language button lives only on the home screen", () => {
  const homeStart = html.indexOf('<section id="home-screen"');
  const homeEnd = html.indexOf("</section>", homeStart);
  const languageButton = html.indexOf('id="language-back-button"');
  const practiceStart = html.indexOf('<section id="practice-screen"');
  assert(homeStart >= 0 && languageButton > homeStart && languageButton < homeEnd);
  assert(practiceStart > homeEnd && !html.slice(practiceStart).includes('id="language-back-button"'));
  assert.match(html, /data-language="en"[\s\S]*?class="language-flag"[\s\S]*?<svg/);
  assert.match(html, /data-language="es"[\s\S]*?class="language-flag"[\s\S]*?<svg/);
  assert.doesNotMatch(html, /A little Japanese, every day\.|Small steps\. Stronger memory\./);
});

test("the staged selector takes 1.5 seconds, then fades into the selected language", () => {
  const runtime = makeLanguageRuntime();
  runtime.buttons[1].click();
  assert.equal(runtime.options.hidden, true);
  assert.equal(runtime.loading.hidden, false);
  assert.equal(runtime.app.hidden, true, "the app shell stays hidden during the progress phase");
  assert.equal(runtime.loadingLabel.textContent, "Preparando todo");
  assert.equal(runtime.loadingFootnote.textContent, "Preparando tu espacio de estudio");

  runtime.runFrames([0, 165, 337.5, 540, 750, 892.5, 1125, 1297.5, 1500]);
  assert.deepEqual(runtime.percentages, [0, 10, 23, 24, 42, 46, 66, 67, 80]);
  assert.equal(runtime.loadingPercent.textContent, "80%");
  assert.equal(runtime.loadingFill.style.width, "80%");
  assert.equal(runtime.gate.hidden, false, "the gate stays visible through the progress phase");
  runtime.runTimers();

  assert.equal(runtime.gate.hidden, true);
  assert.equal(runtime.app.hidden, false);
  assert.equal(runtime.document.documentElement.lang, "es");
  assert.equal(runtime.document.title, "Japanese Cards — Aprende japonés");
  assert.equal(runtime.app.hidden, false);
  assert.deepEqual(runtime.nodes.map((node) => node.nodeValue), ["Empezar sesión", "Toca para ver la traducción"]);
});

test("English remains unchanged and the home-page button returns to language choice", () => {
  const runtime = makeLanguageRuntime();
  runtime.buttons[0].click();
  assert.equal(runtime.loadingLabel.textContent, "Getting things ready");
  runtime.runFrames([0, 165, 337.5, 540, 750, 892.5, 1125, 1297.5, 1500]);
  runtime.runTimers();
  assert.equal(runtime.document.documentElement.lang, "en");
  assert.deepEqual(runtime.nodes.map((node) => node.nodeValue), ["Start session", "Tap to reveal translation"]);
  assert.equal(runtime.gate.hidden, true);
  assert.equal(runtime.app.hidden, false);

  runtime.backButton.click();
  runtime.runTimers();
  assert.equal(runtime.gate.hidden, false);
  assert.equal(runtime.app.hidden, true);
  assert.equal(runtime.options.hidden, false);
  assert.equal(runtime.loading.hidden, true);
  assert.equal(runtime.loadingPercent.textContent, "0%");
});
