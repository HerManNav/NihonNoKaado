const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { gunzipSync } = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const core = require("../deck-core.js");

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
  constructor() { this.elements = new Map(); this.listeners = new Map(); this.documentElement = new Element("html"); }
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

function makeSession({ realLookup = false, fetchLookup = false, savedCards = null, legacySavedCards = null, contextDeck = null } = {}) {
  const document = new Document();
  const flashcard = document.querySelector("#flashcard");
  const prompt = document.querySelector("#prompt-word");
  const answer = document.querySelector("#answer-word");
  document.querySelector("#word-translation-popup").rect = { left: 0, right: 120, top: 0, bottom: 40, width: 120, height: 40 };
  flashcard.append(prompt, answer);
  const window = {
    JapaneseCardsCore: core,
    JapaneseWordFormLookup: realLookup ? require("../word-form-lookup.js")
      : { findWordMeanings: (key, _data, previous) => [`${key}:${previous || "none"}`] },
    innerWidth: 400,
    setTimeout: () => 1,
    clearTimeout() {},
    addEventListener() {},
  };
  const persistedValues = new Map();
  if (savedCards) persistedValues.set("japanese-cards.deck.v1", JSON.stringify(savedCards));
  if (legacySavedCards) persistedValues.set("japanese-cards.dictionary.v1", JSON.stringify(legacySavedCards));
  const context = vm.createContext({
    document, window, Element, Set, Node: { TEXT_NODE: 3 }, HTMLInputElement: Element,
    localStorage: {
      getItem: (key) => persistedValues.get(key) ?? null,
      setItem: (key, value) => persistedValues.set(key, value),
      removeItem: (key) => persistedValues.delete(key),
    }, console,
    Blob, Response, DecompressionStream,
    fetch: fetchLookup ? async (url) => {
      assert.match(url, /romaji-english-jmdict-2026-11-02\.json\.gz\?v=6$/);
      return new Response(fs.readFileSync(path.join(ROOT, "decks/romaji-english-jmdict-2026-11-02.json.gz")));
    } : contextDeck ? async (url) => {
      assert.equal(url, "decks/english/most-common-2000.json");
      return { ok: true, json: async () => contextDeck };
    } : undefined,
  });
  vm.runInContext(appSource, context, { filename: "app.js" });
  context.lookupData = fetchLookup ? null : realLookup
    ? JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT, "decks/romaji-english-jmdict-2026-11-02.json.gz"))))
    : { format: 5 };
  vm.runInContext("romajiLookup = lookupData; practiceTarget = 1; practiceIndex = 0; answerRevealed = true", context);
  const card = {
    japanese: "shita", hiragana: "した", meanings: ["did"],
    examples: [{ romaji: "benkyou shita.", hiragana: "べんきょうした。", english: "I studied." }],
  };
  context.card = card;
  vm.runInContext("practiceDeck = [card]; renderPracticeCard()", context);
  return { context, document, window, flashcard, prompt, answer, popup: document.querySelector("#word-translation-popup"), persistedValues };
}

async function settlePopup() { await Promise.resolve(); await Promise.resolve(); }

test("saved dictionaries migrate to the deck storage key without losing cards", () => {
  const { context, persistedValues } = makeSession({ legacySavedCards: [{ japanese: "neko", english: "cat" }] });
  assert.equal(vm.runInContext("cards[0].japanese", context), "neko");
  assert.equal(JSON.parse(persistedValues.get("japanese-cards.deck.v1"))[0].japanese, "neko");
  assert.equal(persistedValues.has("japanese-cards.dictionary.v1"), false);
});

test("system back follows the active screen and cancels confirmations and forms", () => {
  const { context, window } = makeSession();
  const back = () => window.JapaneseCardsHandleBack();
  vm.runInContext('showScreen("defaults")', context);
  assert.equal(back(), true);
  assert.equal(vm.runInContext('screens.home.hidden', context), false);
  vm.runInContext('showScreen("defaultConfirm"); defaultDeckLoadInProgress = true', context);
  assert.equal(back(), true);
  assert.equal(vm.runInContext('screens.defaultConfirm.hidden', context), false);
  vm.runInContext('defaultDeckLoadInProgress = false', context);
  assert.equal(back(), true);
  assert.equal(vm.runInContext('screens.defaults.hidden', context), false);
  vm.runInContext('formReturnScreen = "deck"; showScreen("add")', context);
  assert.equal(back(), true);
  assert.equal(vm.runInContext('screens.deck.hidden', context), false);
  assert.equal(back(), true);
  assert.equal(vm.runInContext('screens.home.hidden', context), false);
  assert.equal(back(), false);
});

test("system back dismisses an open word popup before leaving practice", () => {
  const { context, window, popup } = makeSession();
  vm.runInContext('showScreen("practice")', context);
  popup.hidden = false;
  assert.equal(window.JapaneseCardsHandleBack(), true);
  assert.equal(popup.hidden, true);
  assert.equal(vm.runInContext('screens.practice.hidden', context), false);
  assert.equal(window.JapaneseCardsHandleBack(), true);
  assert.equal(vm.runInContext('screens.home.hidden', context), false);
});

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

test("annotated example words show one context meaning without loading the global lookup", async () => {
  const { context, flashcard, answer, popup } = makeSession();
  context.card.examples[0].wordMeanings = [
    { romaji: "benkyou", meaning: "study", entryId: "00527_benkyousuru" },
    { romaji: "shita", meaning: "did" },
  ];
  vm.runInContext("romajiLookup = null; renderPracticeCard()", context);
  context.fetch = () => { throw new Error("The annotated popup should not fetch the global deck"); };
  const tokens = answer.children[0].children[1].children[0].children;
  flashcard.emit("pointerover", pointer(tokens[0], "mouse", 120, 190));
  await settlePopup();
  assert.equal(popup.hidden, false);
  assert.deepEqual(popup.children.map((line) => line.textContent), ["study"]);
  flashcard.emit("pointerover", pointer(tokens[1], "mouse", 145, 190));
  await settlePopup();
  assert.deepEqual(popup.children.map((line) => line.textContent), ["did"]);
  assert.equal(vm.runInContext("romajiLookup", context), null);
});

test("annotation positions distinguish repeated romaji words", async () => {
  const { context, flashcard, answer, popup } = makeSession();
  context.card.examples[0] = {
    romaji: "to to.", hiragana: "とと。", english: "And with.",
    wordMeanings: [{ romaji: "to", meaning: "and" }, { romaji: "to", meaning: "with" }],
  };
  vm.runInContext("renderPracticeCard()", context);
  const tokens = answer.children[0].children[1].children[0].children;
  flashcard.emit("pointerover", pointer(tokens[0], "mouse", 120, 190));
  await settlePopup();
  assert.equal(popup.textContent, "and");
  flashcard.emit("pointerover", pointer(tokens[1], "mouse", 145, 190));
  await settlePopup();
  assert.equal(popup.textContent, "with");
});

test("a stale annotation falls back to the ordinary lookup", async () => {
  const { context, flashcard, answer, popup } = makeSession();
  context.card.examples[0].wordMeanings = [
    { romaji: "shita", meaning: "wrong word" },
    { romaji: "benkyou", meaning: "wrong word" },
  ];
  vm.runInContext("renderPracticeCard()", context);
  const token = answer.children[0].children[1].children[0].children[0];
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  await settlePopup();
  assert.equal(popup.textContent, "benkyou:none");
});

test("context meanings survive a saved deck reload", () => {
  const wordMeanings = [
    { romaji: "benkyou", meaning: "study", entryId: "00527_benkyousuru" },
    { romaji: "shita", meaning: "did" },
  ];
  const savedCards = [{
    japanese: "shita", english: "did",
    examples: [{ romaji: "benkyou shita.", hiragana: "べんきょうした。", english: "I studied.", wordMeanings }],
  }];
  const { context } = makeSession({ savedCards });
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("cards[0].examples[0].wordMeanings", context))), wordMeanings);
});

test("legacy saved examples restore contextual meanings from the default deck", async () => {
  const wordMeanings = [
    { romaji: "benkyou", meaning: "study", entryId: "00527_benkyousuru" },
    { romaji: "shita", meaning: "did" },
  ];
  const example = { romaji: "benkyou shita.", hiragana: "べんきょうした。", english: "I studied." };
  const savedCards = [{ japanese: "shita", hiragana: "した", english: "did", examples: [example] }];
  const contextDeck = {
    cards: [{ japanese: "shita", hiragana: "した", english: "did", examples: [{ ...example, wordMeanings }] }],
  };
  const { context, persistedValues } = makeSession({ savedCards, contextDeck });
  await vm.runInContext("restoreContextMeaningsForSavedCards()", context);

  const restored = JSON.parse(JSON.stringify(vm.runInContext("cards[0].examples[0].wordMeanings", context)));
  const savedAgain = JSON.parse(persistedValues.get("japanese-cards.deck.v1"));
  assert.deepEqual(restored, wordMeanings);
  assert.deepEqual(savedAgain[0].examples[0].wordMeanings, wordMeanings);
});

test("a revealed single-meaning headword shows its card meaning on one line", async () => {
  const { context, flashcard, prompt, popup } = makeSession();
  vm.runInContext("romajiLookup = null", context);
  context.fetch = () => { throw new Error("A single-meaning headword should not fetch the global deck"); };
  const token = prompt.children[0].children[0];
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  await settlePopup();
  assert.deepEqual(popup.children.map((line) => line.textContent), ["did"]);
  assert.equal(vm.runInContext("romajiLookup", context), null);
});

test("a suru headword uses its example's base-compound explanation", async () => {
  const { context, flashcard, prompt, popup } = makeSession();
  context.card.japanese = "sankasuru";
  context.card.meanings = ["to participate"];
  context.card.examples[0].wordMeanings = [{romaji:"sankashita", meaning:"participated. Base compound: sanka (participation) + suru (to do)."}];
  vm.runInContext("renderPracticeCard()", context);
  flashcard.emit("pointerover", pointer(prompt.children[0].children[0], "mouse", 120, 190));
  await settlePopup();
  assert.match(popup.children[0].textContent, /sanka \(participation\) \+ suru \(to do\)/);
});

test("a revealed card fetches and opens the real lookup for a common particle sense", async () => {
  const { context, flashcard, prompt, popup } = makeSession({ realLookup: true, fetchLookup: true });
  vm.runInContext("practiceDeck = [{ ...card, japanese: 'to', meanings: ['and', 'if'] }]; renderPracticeCard()", context);
  const token = prompt.children[0].children[0];
  flashcard.emit("pointerover", pointer(token, "mouse", 120, 190));
  const loaded = await vm.runInContext("romajiLookupPromise", context);
  assert.equal(loaded.format, 5);
  await settlePopup();
  assert.equal(popup.hidden, false);
  assert(popup.children.some((line) => line.textContent === "and"));
  assert.equal(popup.children.length, 1, "only the best-ranked meaning should be shown");
});

test("mobile tap anchors the popup above the word without advancing the card", async () => {
  const { context, document, flashcard, answer, popup } = makeSession();
  context.card.examples[0].wordMeanings = [
    { romaji: "benkyou", meaning: "study" }, { romaji: "shita", meaning: "did" },
  ];
  vm.runInContext("renderPracticeCard()", context);
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
  assert.deepEqual(popup.children.map((line) => line.textContent), ["did"]);
  assert.equal(popup.style.left, "135px");
  assert.equal(click.defaultPrevented, true);
  assert.equal(click.propagationStopped, true);
  assert.equal(vm.runInContext("advancingPractice", context), false);
  assert.equal(vm.runInContext("answerRevealed", context), true);
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(css, /\.flashcard, \.flashcard \* \{[^}]*-webkit-user-select: none; user-select: none/);
  assert.match(css, /\.flashcard\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/);
});

test("mobile word taps use the fallback token, dismiss before advancing, and keep another word locked", async () => {
  const { context, document, flashcard, answer, popup } = makeSession();
  context.card.examples[0].wordMeanings = [
    { romaji: "benkyou", meaning: "study" }, { romaji: "shita", meaning: "did" },
  ];
  vm.runInContext("renderPracticeCard()", context);
  const [firstToken, secondToken] = answer.children[0].children[1].children[0].children;

  function mobileTap(startTarget) {
    const down = pointer(startTarget, "touch", 130, 193);
    flashcard.emit("pointerdown", down);
    document.emit("pointerdown", down);
    flashcard.emit("pointerup", pointer(flashcard, "touch", 130, 193));
    // Some mobile WebViews retarget the synthesized click to the card itself.
    const click = pointer(flashcard, "touch", 130, 193);
    flashcard.emit("click", click);
    return click;
  }

  mobileTap(firstToken);
  await settlePopup();
  assert.equal(popup.textContent, "study");
  assert.equal(vm.runInContext("wordPopupBlocksCardAdvance", context), true);
  assert.equal(vm.runInContext("practiceIndex", context), 0);

  mobileTap(secondToken);
  await settlePopup();
  assert.equal(popup.textContent, "did");
  assert.equal(vm.runInContext("wordPopupBlocksCardAdvance", context), true);
  assert.equal(vm.runInContext("practiceIndex", context), 0);

  const dismissClick = mobileTap(flashcard);
  assert.equal(dismissClick.defaultPrevented, true);
  assert.equal(popup.hidden, true);
  assert.equal(vm.runInContext("wordPopupBlocksCardAdvance", context), false);
  assert.equal(vm.runInContext("advancingPractice", context), false);
  assert.equal(vm.runInContext("practiceIndex", context), 0);

  const advanceClick = mobileTap(flashcard);
  assert.equal(advanceClick.defaultPrevented, false);
  assert.equal(vm.runInContext("advancingPractice", context), true);
  assert.equal(vm.runInContext("practiceIndex", context), 0, "the transition callback has not run yet");
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
  vm.runInContext("practiceDeck = [{ ...card, meanings: ['did', 'below'] }]; renderPracticeCard()", context);
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
