const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const core = require("../dictionary-core.js");

class TextNode {
  constructor(text) { this.nodeType = 3; this.textContent = text; this.parentElement = null; }
  get previousSibling() {
    if (!this.parentElement) return null;
    return this.parentElement.childNodes[this.parentElement.childNodes.indexOf(this) - 1] || null;
  }
}

class Element {
  constructor(tagName = "div") {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this._className = "";
    this.childNodes = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.parentElement = null;
    this.style = {
      setProperty(name, value) { this[name] = value; },
      removeProperty(name) { delete this[name]; },
    };
    this.classList = {
      add: (...names) => { this._className = [...new Set([...this._className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this._className = this._className.split(/\s+/).filter((name) => name && !names.includes(name)).join(" "); },
      contains: (name) => this._className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const has = this.classList.contains(name);
        if (force === true || (!has && force !== false)) this.classList.add(name);
        else this.classList.remove(name);
        return this.classList.contains(name);
      },
    };
  }
  get className() { return this._className; }
  set className(value) { this._className = String(value); }
  get children() { return this.childNodes.filter((node) => node instanceof Element); }
  get textContent() { return this.childNodes.map((node) => node.textContent).join(""); }
  set textContent(value) { this.replaceChildren(String(value)); }
  get previousSibling() {
    if (!this.parentElement) return null;
    return this.parentElement.childNodes[this.parentElement.childNodes.indexOf(this) - 1] || null;
  }
  get previousElementSibling() {
    let sibling = this.previousSibling;
    while (sibling && !(sibling instanceof Element)) sibling = sibling.previousSibling;
    return sibling;
  }
  append(...nodes) {
    for (let node of nodes) {
      if (!(node instanceof Element) && !(node instanceof TextNode)) node = new TextNode(String(node));
      node.parentElement = this;
      this.childNodes.push(node);
    }
  }
  replaceChildren(...nodes) { this.childNodes.forEach((node) => { node.parentElement = null; }); this.childNodes = []; this.append(...nodes); }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  emit(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  matches(selector) { return selector.startsWith(".") && this.classList.contains(selector.slice(1)); }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector.startsWith(".") && node.classList.contains(selector.slice(1))) return node;
      if (selector === "button" && node.tagName === "BUTTON") return node;
    }
    return null;
  }
  contains(other) { for (let node = other; node; node = node.parentElement) if (node === this) return true; return false; }
  getBoundingClientRect() { return this.rect || { left: 0, right: 320, top: 0, bottom: 280, width: 320, height: 280 }; }
  setPointerCapture() {}
}

class Document {
  constructor() { this.elements = new Map(); this.listeners = new Map(); }
  querySelector(selector) {
    if (!this.elements.has(selector)) this.elements.set(selector, new Element(selector === "#flashcard" ? "button" : "div"));
    return this.elements.get(selector);
  }
  querySelectorAll() { return []; }
  createElement(tagName) { return new Element(tagName); }
  createTextNode(text) { return new TextNode(text); }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  emit(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
}

function pointer(target, pointerType, x, y) {
  return {
    target, pointerType, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, cancelable: true,
    defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

function makeSession() {
  const document = new Document();
  const flashcard = document.querySelector("#flashcard");
  const prompt = document.querySelector("#prompt-word");
  const answer = document.querySelector("#answer-word");
  document.querySelector("#word-translation-popup").rect = { left: 0, right: 120, top: 0, bottom: 40, width: 120, height: 40 };
  flashcard.append(prompt, answer);
  const window = {
    JapaneseCardsCore: core,
    JapaneseWordFormLookup: { findWordMeanings: (key, _data, previous) => [`${key}:${previous || "none"}`] },
    innerWidth: 400,
    setTimeout: () => 1,
    clearTimeout() {},
  };
  const context = vm.createContext({
    document, window, Element, Set, Node: { TEXT_NODE: 3 }, HTMLInputElement: Element,
    localStorage: { getItem: () => null, setItem() {} }, console,
  });
  vm.runInContext(appSource, context, { filename: "app.js" });
  vm.runInContext("romajiLookup = { format: 3 }; practiceTarget = 1; practiceIndex = 0; answerRevealed = true", context);
  const card = {
    japanese: "shita", hiragana: "した", meanings: ["did"],
    examples: [{ romaji: "benkyou shita.", hiragana: "べんきょうした。", english: "I studied." }],
  };
  context.card = card;
  vm.runInContext("practiceDeck = [card]; renderPracticeCard()", context);
  return { context, document, window, flashcard, prompt, answer, popup: document.querySelector("#word-translation-popup") };
}

async function settlePopup() { await Promise.resolve(); await Promise.resolve(); }

test("a revealed card preserves romaji spacing and makes each word a separate target", () => {
  const { answer, prompt } = makeSession();
  const example = answer.children[0].children.find((child) => child.classList.contains("practice-example"));
  const romaji = example.children[0];
  assert.equal(prompt.children[0].textContent, "shita");
  assert.equal(romaji.textContent, "benkyou shita.");
  assert.deepEqual(romaji.children.map((child) => child.textContent), ["benkyou", "shita"]);
  assert.equal(romaji.children[1].previousSibling.textContent, " ");
});

test("desktop hover follows the pointer within an 8px margin and closes beyond it", async () => {
  const { context, document, flashcard, answer, popup } = makeSession();
  const token = answer.children[0].children[1].children[0].children[1];
  token.rect = { left: 100, right: 150, top: 180, bottom: 205, width: 50, height: 25 };
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  await settlePopup();
  assert.equal(popup.hidden, false);
  assert.equal(popup.textContent, "shita:benkyou");
  const firstLeft = popup.style.left;
  document.emit("pointermove", pointer(flashcard, "mouse", 154, 190));
  assert.notEqual(popup.style.left, firstLeft);
  assert.equal(popup.hidden, false);
  document.emit("pointermove", pointer(flashcard, "mouse", 159, 190));
  assert.equal(popup.hidden, true);
  assert.equal(vm.runInContext("activeRomajiToken", context), null);
});

test("mobile tap anchors the popup above the word without advancing the card", async () => {
  const { context, document, flashcard, answer, popup } = makeSession();
  const token = answer.children[0].children[1].children[0].children[1];
  token.rect = { left: 110, right: 160, top: 180, bottom: 205, width: 50, height: 25 };
  const down = pointer(token, "touch", 130, 193);
  flashcard.emit("pointerdown", down);
  document.emit("pointerdown", down);
  flashcard.emit("pointerup", pointer(flashcard, "touch", 130, 193));
  const click = pointer(flashcard, "touch", 130, 193);
  flashcard.emit("click", click);
  await settlePopup();
  assert.equal(popup.hidden, false);
  assert.equal(popup.textContent, "shita:benkyou");
  assert.equal(popup.style.left, "135px");
  assert.equal(click.defaultPrevented, true);
  assert.equal(click.propagationStopped, true);
  assert.equal(vm.runInContext("advancingPractice", context), false);
  assert.equal(vm.runInContext("answerRevealed", context), true);
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(css, /\.flashcard, \.flashcard \* \{[^}]*-webkit-user-select: none; user-select: none/);
});

test("an outside tap and a new card each dismiss the popup", async () => {
  const { context, document, flashcard, prompt, popup } = makeSession();
  const token = prompt.children[0].children[0];
  token.rect = { left: 100, right: 150, top: 180, bottom: 205, width: 50, height: 25 };
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  await settlePopup();
  assert.equal(popup.hidden, false);
  document.emit("pointerdown", pointer(new Element(), "touch", 180, 260));
  assert.equal(popup.hidden, true);
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  await settlePopup();
  assert.equal(popup.hidden, false);
  vm.runInContext("practiceDeck = [{ ...card, japanese: 'taberu' }]; renderPracticeCard()", context);
  assert.equal(popup.hidden, true);
  assert.equal(prompt.children[0].textContent, "taberu");
});

test("a word on an unrevealed card reveals the answer before lookup is available", async () => {
  const { context, flashcard, prompt, popup } = makeSession();
  const token = prompt.children[0].children[0];
  vm.runInContext("answerRevealed = false", context);
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  await settlePopup();
  assert.equal(popup.hidden, true);
  flashcard.emit("click", pointer(token, "mouse", 120, 190));
  assert.equal(vm.runInContext("answerRevealed", context), true);
  assert.equal(popup.hidden, true);
});

test("a lookup that finishes after the pointer leaves does not reopen the popup", async () => {
  const { context, document, flashcard, prompt, popup } = makeSession();
  const token = prompt.children[0].children[0];
  token.rect = { left: 100, right: 150, top: 180, bottom: 205, width: 50, height: 25 };
  let release;
  context.pendingLookup = new Promise((resolve) => { release = resolve; });
  vm.runInContext("romajiLookup = null; romajiLookupPromise = pendingLookup", context);
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  document.emit("pointermove", pointer(flashcard, "mouse", 180, 190));
  release({ format: 3 });
  await settlePopup();
  assert.equal(popup.hidden, true);
});

test("PWA precache paths point to files that exist", () => {
  const source = fs.readFileSync(path.join(ROOT, "android-pwa/sw.js"), "utf8");
  const literal = /const APP_FILES = (\[[\s\S]*?\]);/.exec(source)?.[1];
  assert(literal, "service worker should declare APP_FILES");
  const files = vm.runInNewContext(literal);
  for (const file of files) {
    assert(fs.existsSync(path.resolve(ROOT, "android-pwa", file)), `missing precache asset: ${file}`);
  }
});
