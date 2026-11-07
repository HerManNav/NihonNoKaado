const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const languageSource = fs.readFileSync(path.join(ROOT, "language.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

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

function makeLanguageRuntime(savedLanguage = null, previousSessionLanguage = null) {
  const gate = new FakeElement();
  gate.classList.add("is-initial-entry");
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
  const selectorBack = new FakeElement();
  selectorBack.hidden = true;
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
        ["#language-selector-back", selectorBack],
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
  const events = [];
  const percentages = [];
  const stored = new Map();
  if (previousSessionLanguage) stored.set("japanese-cards.current-language", previousSessionLanguage);
  const persistent = new Map(savedLanguage ? [["japanese-cards.current-language", savedLanguage]] : []);
  const observer = { observe() {}, disconnect() {} };
  class FakeMutationObserver { constructor(callback) { this.callback = callback; } observe() { observer.observe(); } disconnect() { observer.disconnect(); } }
  const window = {
    alert(message) { return message; },
    confirm(message) { return message; },
    prompt(message) { return message; },
    location: { reload() {} },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    dispatchEvent(event) { events.push(event.type); },
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
    document, window, sessionStorage, localStorage: {
      getItem(key) { return persistent.get(key) ?? null; },
      setItem(key, value) { persistent.set(key, value); },
    }, MutationObserver: FakeMutationObserver, Event: class Event { constructor(type) { this.type = type; } },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 }, NodeFilter: { SHOW_TEXT: 4 },
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { frames.push(callback); },
  });
  vm.runInContext(languageSource, context, { filename: "language.js" });
  return {
    gate, app, options, loading, loadingLabel, loadingFootnote, loadingPercent, loadingTrack,
    loadingFill, backButton, selectorBack, buttons, nodes, frames, timers, percentages, document, window, persistent, stored, events,
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

test("settings provides language selection and the back arrow", () => {
  assert.match(html, /id="settings-screen"[\s\S]*?id="language-back-button"/);
  assert.match(html, /id="language-selector-back"[^>]*hidden/);
  assert.match(html, /data-language="en"[\s\S]*?class="language-flag"/);
  assert.match(html, /data-language="es"[\s\S]*?class="language-flag"/);
});

test("starter deck instructions have a Spanish translation", () => {
  const instruction = "Choose a starter deck. Loading one will replace the current one.";
  assert.ok(html.includes(instruction));
  const runtime = makeLanguageRuntime();
  const text = new FakeTextNode(instruction);
  runtime.nodes.push(text);
  runtime.buttons[1].click();
  assert.equal(text.nodeValue, "Elige un mazo inicial. Al cargarlo, se reemplazará el actual.");
  assert.ok(!html.includes("Select a deck to replace the one saved in this browser."));
});

test("the initial language selector fades in without repeating its cold-start animation", () => {
  assert.match(html, /class="language-gate is-initial-entry"/);
  assert.match(styles, /\.language-gate\.is-initial-entry\s*\{\s*animation:\s*gate-fade-in\s+420ms/);
  const runtime = makeLanguageRuntime();
  runtime.buttons[0].click();
  assert.equal(runtime.persistent.get("japanese-cards.current-language"), "en");
  assert.equal(runtime.gate.classList.contains("is-initial-entry"), false);
  runtime.runFrames([0, 165, 337.5, 540, 750, 892.5, 1125, 1297.5, 1500]);
  runtime.runTimers();
  runtime.backButton.click();
  assert.equal(runtime.gate.classList.contains("is-initial-entry"), false);
  assert.equal(runtime.gate.classList.contains("is-returning"), true);
});

test("a saved language skips the selector on later launches", () => {
  const runtime = makeLanguageRuntime("es");
  assert.equal(runtime.gate.hidden, true);
  assert.equal(runtime.app.hidden, false);
  assert.equal(runtime.document.documentElement.lang, "es");
  assert.equal(runtime.window.JapaneseCardsLanguageNavigation.isSelectorVisible(), false);
});

test("a language saved by the previous session-only version is migrated", () => {
  const runtime = makeLanguageRuntime(null, "en");
  assert.equal(runtime.gate.hidden, true);
  assert.equal(runtime.app.hidden, false);
  assert.equal(runtime.persistent.get("japanese-cards.current-language"), "en");
});

test("system back from the settings language selector returns to the app", () => {
  const runtime = makeLanguageRuntime();
  const navigation = runtime.window.JapaneseCardsLanguageNavigation;
  assert.equal(navigation.isSelectorVisible(), true);
  assert.equal(navigation.backFromSelector(), false, "initial selector is the root");
  runtime.buttons[0].click();
  runtime.runFrames([0, 165, 337.5, 540, 750, 892.5, 1125, 1297.5, 1500]);
  runtime.runTimers();
  runtime.backButton.click();
  assert.equal(navigation.backFromSelector(), true, "back is consumed during the transition");
  runtime.runTimers();
  assert.equal(navigation.isSelectorVisible(), true);
  assert.equal(navigation.backFromSelector(), true);
  assert.equal(runtime.gate.hidden, true);
  assert.equal(runtime.app.hidden, false);
  assert.equal(runtime.document.documentElement.lang, "en");
});

test("home back stays at the root", () => {
  const runtime = makeLanguageRuntime();
  runtime.buttons[0].click();
  runtime.runFrames([0, 165, 337.5, 540, 750, 892.5, 1125, 1297.5, 1500]);
  runtime.runTimers();
  assert.equal(runtime.window.JapaneseCardsLanguageNavigation.backFromHome(), false);
  assert.equal(runtime.gate.hidden, true);
});

test("settings back arrow returns to app and same language skips loading", () => {
  const runtime = makeLanguageRuntime();
  assert.equal(runtime.selectorBack.hidden, true);
  runtime.buttons[0].click();
  runtime.runFrames([0, 165, 337.5, 540, 750, 892.5, 1125, 1297.5, 1500]);
  runtime.runTimers();
  runtime.backButton.click(); runtime.runTimers();
  assert.equal(runtime.selectorBack.hidden, false);
  runtime.selectorBack.click();
  assert.equal(runtime.gate.hidden, true);
  runtime.backButton.click(); runtime.runTimers();
  runtime.buttons[0].click();
  assert.equal(runtime.gate.hidden, true);
  assert.equal(runtime.loading.hidden, true);
  assert.equal(runtime.frames.length, 0);
});

test("the staged selector takes 1.5 seconds, then fades into the selected language", () => {
  const runtime = makeLanguageRuntime();
  runtime.stored.set("japanese-cards.return-to-settings", "true");
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
  assert.deepEqual(runtime.events, [], "changing language returns to Home instead of reopening Settings");
  assert.equal(runtime.stored.has("japanese-cards.return-to-settings"), false);
});

test("English stays unchanged and the Settings language option returns to language choice", () => {
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
  assert.equal(runtime.options.hidden, false, "language choices appear immediately");
  assert.equal(runtime.loading.hidden, true, "the loading screen stays hidden during the return transition");
  runtime.runTimers();
  assert.equal(runtime.gate.hidden, false);
  assert.equal(runtime.app.hidden, true);
  assert.equal(runtime.options.hidden, false);
  assert.equal(runtime.loading.hidden, true);
  assert.equal(runtime.loadingPercent.textContent, "0%");
});
