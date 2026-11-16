const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { searchDeckCards, romajiToHiragana } = require("../deck-core.js");
const { createController } = require("../example-suggestions.js");

const source = readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");

class FakeElement {
  constructor(tagName = "div", text = "") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this._text = text;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.focused = false;
    this.id = "";
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(" "); },
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !this.classList.contains(name) : force;
        this.classList[shouldAdd ? "add" : "remove"](name);
        return shouldAdd;
      },
    };
  }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get isConnected() { return this._connected || Boolean(this.parentNode?.isConnected); }
  get childElementCount() { return this.children.filter((child) => child.tagName !== "#text").length; }
  get innerHTML() { return ""; }
  set innerHTML(_value) { throw new Error("innerHTML must not be used"); }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  insertBefore(node, before) {
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    const index = this.children.indexOf(before);
    node.parentNode = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    return node;
  }
  before(node) {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    node.parentNode = this.parentNode;
    this.parentNode.children.splice(index, 0, node);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  fire(name, event = {}) { for (const listener of this.listeners[name] || []) listener({ target: this, ...event }); }
  focus() { this.focused = true; this.fire("focus"); }
  matches(selector) { return selector.split(",").some((part) => this.matchesOne(part.trim())); }
  matchesOne(selector) {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    return false;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node;
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const selectors = selector.split(",").map((part) => part.trim());
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectors.some((item) => child.matches(item))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

class FakeInput extends FakeElement {
  constructor(className = "") { super("input"); this.className = className; }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function getFunction(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Expected source block ${startMarker}`);
  return source.slice(start, end);
}

function setup() {
  const cards = [{ japanese: "neko", hiragana: "ねこ", meaning: "cat", meanings: ["cat"] }];
  const docNodes = {};
  const document = {
    documentElement: { lang: "en" },
    querySelector: (selector) => docNodes[selector] || null,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (namespace, tag) => { const node = new FakeElement(tag); node.namespaceURI = namespace; return node; },
    createTextNode: (text) => new FakeElement("#text", text),
  };
  const entry = new FakeElement("article");
  entry.className = "word-row deck-entry-row";
  const japanese = new FakeInput("deck-entry-japanese");
  const hiragana = new FakeInput("deck-entry-hiragana");
  hiragana.dataset.manuallyEdited = "false";
  const meanings = new FakeElement("div");
  meanings.className = "deck-entry-meanings";
  entry.append(japanese, hiragana, meanings);
  const strong = new FakeElement("strong");
  strong.textContent = "neko";
  const savedDetails = new FakeElement("div");
  savedDetails.className = "japanese-word-display";
  savedDetails.append(strong);
  const savedRow = new FakeElement("article");
  savedRow.className = "word-row";
  savedRow.dataset.cardIndex = "0";
  savedRow.querySelector = (selector) => selector === ".japanese-word-display strong" ? strong : FakeElement.prototype.querySelector.call(savedRow, selector);
  savedRow.append(savedDetails);
  const empty = new FakeElement("p");
  empty.className = "empty-word-list deck-search-empty";
  const inlineSuggestions = new FakeElement("section");
  inlineSuggestions.className = "spelling-suggestions";
  inlineSuggestions.hidden = true;
  const wordList = new FakeElement("div");
  wordList._connected = true;
  wordList.children = [entry, savedRow, empty, inlineSuggestions];
  wordList.children.forEach((child) => { child.parentNode = wordList; });
  wordList.querySelector = (selector) => {
    if (selector === ".deck-search-empty") return empty;
    if (selector === ".spelling-suggestions") return inlineSuggestions;
    return FakeElement.prototype.querySelector.call(wordList, selector);
  };
  wordList.querySelectorAll = (selector) => selector === ".word-row[data-card-index]" ? [savedRow] : FakeElement.prototype.querySelectorAll.call(wordList, selector);
  const cardForm = new FakeElement("form");
  cardForm._connected = true;
  const standaloneJapanese = new FakeInput();
  const standaloneHiragana = new FakeInput();
  const englishMeanings = new FakeElement("div");
  englishMeanings.id = "english-meanings";
  cardForm.append(standaloneJapanese, standaloneHiragana, englishMeanings);
  const addSuggestions = new FakeElement("section");
  const addMatches = new FakeElement("div");
  const addEmpty = new FakeElement("p");
  const addSearch = new FakeElement("div");
  const addFeedback = new FakeElement("p");
  addFeedback.className = "is-visible";
  addFeedback.textContent = "Added earlier";
  const addDeckSearch = new FakeElement("section");
  docNodes["#add-spelling-suggestions"] = addSuggestions;
  docNodes["#add-deck-matches"] = addMatches;
  docNodes["#add-deck-empty"] = addEmpty;
  docNodes["#add-deck-search"] = addSearch;
  const screens = { deck: { hidden: false }, add: { hidden: false } };
  const pendingExamples = [];
  const pendingAlternatives = [];
  const exampleService = {
    suggest: () => { const request = deferred(); pendingExamples.push(request); return request.promise; },
    alternatives: () => { const request = deferred(); pendingAlternatives.push(request); return request.promise; },
  };
  const window = {
    JapaneseExampleSuggestions: { createController },
    clearTimeout: (id) => { window.clearedTimeouts.push(id); },
    clearedTimeouts: [],
  };
  const listeners = {};
  const context = vm.createContext({
    document, window, cards, wordList, cardForm, japaneseInput: standaloneJapanese, hiraganaInput: standaloneHiragana,
    englishMeanings, addFeedback, addFeedbackTimeout: 123, exampleService, exampleControllers: new WeakMap(),
    activeExampleGroups: new WeakMap(), screens, editingCardIndex: null, formReturnScreen: "add",
    exampleStatusId: 0,
    exampleGroupSelector: ".meaning-entry-group, .deck-entry-meaning-group",
    hiraganaManuallyEdited: true, formTitle: { textContent: "Add word" }, formSubmitButton: { textContent: "Add" },
    cancelEditButton: { hidden: true }, deckListCount: {}, searchDeckCards,
    normalizeDeckWord: (value) => String(value).trim().toLowerCase(),
    compactHiragana: (value) => String(value || "").replace(/\s+/g, ""), romajiToHiragana,
    shouldAutoConvertHiragana: (manuallyEdited, value) => !manuallyEdited && !String(value).trim(),
    HTMLInputElement: FakeInput,
    resetMeaningInputs: undefined,
    addMeaningInput: undefined,
    windowTimers: {},
  });
  context.filterDeckList = undefined;
  context.renderAddDeckMatches = undefined;
  context.refreshExampleFields = undefined;
  context.addEventListener = (name, listener) => { (listeners[name] ||= []).push(listener); };
  context.wordList.addEventListener = (_name, listener) => { (listeners.inline ||= []).push(listener); };
  context.japaneseInput.addEventListener = (_name, listener) => { (listeners.japanese ||= []).push(listener); };
  context.cardForm.addEventListener = (_name, listener) => { (listeners.form ||= []).push(listener); };
  context.englishMeanings.addEventListener = (_name, listener) => { (listeners.meanings ||= []).push(listener); };
  context.hiraganaInput.addEventListener = () => {};
  context.addDeckEmpty = addEmpty;
  context.addDeckSearch = addSearch;
  context.addDeckMatches = addMatches;
  context.addSpellingSuggestions = addSuggestions;
  context.inlineSuggestions = inlineSuggestions;
  context.document.querySelector = (selector) => docNodes[selector] || null;
  context.document.querySelector("#add-feedback");
  Object.assign(docNodes, {
    "#add-feedback": addFeedback,
    "#add-spelling-suggestions": addSuggestions,
    "#add-deck-matches": addMatches,
    "#add-deck-empty": addEmpty,
    "#add-deck-search": addSearch,
  });

  vm.runInContext(getFunction("function renderDeckSearchWord", "const flashcard"), context);
  vm.runInContext(getFunction("function hasMatchingDeckWord", "async function prepareExampleAnnotations"), context);
  vm.runInContext(getFunction("function createDeckMeaningInput", "function showDeckMeaningHints"), context);
  vm.runInContext(getFunction("function createEntryExampleInput", "async function addDeckEntry"), context);
  vm.runInContext(getFunction("function addMeaningInput", "function renderSessionProgress"), context);
  vm.runInContext(getFunction("function renderDeckList", "function createDeckEntryRow"), context);
  vm.runInContext(getFunction("function showAddFeedback", "function confirmClearDeck"), context);
  vm.runInContext(getFunction("function resetMeaningInputs", "function renderSessionProgress"), context);
  vm.runInContext(getFunction("wordList.addEventListener(\"input\", (event) => {", "wordList.addEventListener(\"focusin\""), context);
  vm.runInContext(getFunction('japaneseInput.addEventListener("input", () => {', 'cardForm.addEventListener("keydown"'), context);
  const conversionStart = source.lastIndexOf('japaneseInput.addEventListener("input"');
  const conversionEnd = source.indexOf('hiraganaInput.addEventListener("input"', conversionStart);
  vm.runInContext(source.slice(conversionStart, conversionEnd), context);
  vm.runInContext(getFunction('englishMeanings.addEventListener("input", (event) => {', '// Registered after romaji-to-hiragana conversion'), context);
  vm.runInContext('wordList.addEventListener("input", () => refreshExampleFields(wordList));', context);
  vm.runInContext('cardForm.addEventListener("input", () => refreshExampleFields(cardForm));', context);

  // The two reset handlers are extracted from app.js; DOM event dispatch follows their registered order.
  return {
    context, cards, docNodes, entry, japanese, hiragana, meanings, savedRow, empty, strong, inlineSuggestions,
    cardForm, standaloneJapanese, standaloneHiragana, englishMeanings, addFeedback, addSuggestions, addMatches,
    addEmpty, addSearch, listeners, pendingExamples, pendingAlternatives,
    dispatchInline(target) { for (const listener of listeners.inline || []) listener({ target }); },
    dispatchJapanese() { for (const listener of listeners.japanese || []) listener({ target: standaloneJapanese }); },
    dispatchMeaning(target) { for (const listener of listeners.meanings || []) listener({ target }); },
  };
}

test("blank inline romaji resets dependent fields and search without moving the active input", () => {
  const state = setup();
  const { context, entry, japanese, hiragana, meanings, savedRow, empty, strong, inlineSuggestions, cards } = state;
  japanese.value = "   ";
  japanese.selectionStart = 1;
  japanese.selectionEnd = 2;
  japanese.focused = true;
  hiragana.value = "ねこ";
  hiragana.dataset.manuallyEdited = "true";
  for (let index = 0; index < 3; index++) {
    const group = context.createDeckMeaningInput(`meaning ${index}`);
    context.setupExampleFields(group, entry);
    group.querySelector(".deck-entry-example-romaji").value = "neko ga suki";
    group.querySelector(".deck-entry-example-hiragana").value = "ねこがすき";
    group.querySelector(".deck-entry-example-hiragana").dataset.manuallyEdited = "true";
    meanings.append(group);
  }
  const oldGroup = meanings.children[0];
  context.activeExampleGroups.set(context.wordList, oldGroup);
  inlineSuggestions.hidden = false;
  inlineSuggestions.textContent = "stale correction";
  const beforeCards = structuredClone(cards);

  state.dispatchInline(japanese);

  assert.equal(entry.querySelector(".deck-entry-japanese"), japanese);
  assert.equal(japanese.value, "   ");
  assert.equal(japanese.selectionStart, 1);
  assert.equal(japanese.selectionEnd, 2);
  assert.equal(japanese.focused, true);
  assert.equal(hiragana.value, "");
  assert.equal(hiragana.dataset.manuallyEdited, "false");
  assert.equal(meanings.children.length, 1);
  assert.equal(meanings.children[0].querySelector(".meaning-translation").value, "");
  assert.equal(meanings.children[0].querySelector(".deck-entry-example-romaji").value, "");
  assert.equal(meanings.children[0].querySelector(".deck-entry-example-hiragana").dataset.manuallyEdited, "false");
  assert.equal(meanings.children[0].querySelector(".deck-entry-example-romaji").disabled, true);
  assert.equal(meanings.children[0].querySelector(".deck-entry-example-fields").getAttribute?.("aria-disabled") ?? meanings.children[0].querySelector(".deck-entry-example-fields").attributes["aria-disabled"], "true");
  assert.equal(meanings.children[0].querySelector(".example-status").textContent, "");
  assert.equal(context.activeExampleGroups.has(context.wordList), false);
  assert.equal(inlineSuggestions.hidden, true);
  assert.equal(inlineSuggestions.textContent, "");
  assert.equal(savedRow.hidden, false);
  assert.equal(empty.hidden, true);
  assert.equal(context.deckListCount.textContent, "1 word");
  assert.equal(strong.textContent, "neko");
  assert.equal(strong.children.some((child) => child.tagName === "mark"), false);
  assert.deepEqual(cards, beforeCards);
});

test("blank standalone Add input resets meaning, reading, feedback, and suggestions", () => {
  const state = setup();
  const { context, standaloneJapanese, standaloneHiragana, englishMeanings, addFeedback, addSuggestions, addMatches, addEmpty, cards } = state;
  standaloneJapanese.value = "\t ";
  standaloneJapanese.selectionStart = 0;
  standaloneJapanese.selectionEnd = 1;
  standaloneJapanese.focused = true;
  standaloneHiragana.value = "ねこ";
  context.hiraganaManuallyEdited = true;
  context.editingCardIndex = null;
  const group1 = context.addMeaningInput("cat");
  group1.value = "cat";
  const group2 = context.addMeaningInput("feline");
  group2.value = "feline";
  englishMeanings.querySelectorAll(".meaning-entry-group")[0].querySelector(".meaning-example-romaji").value = "neko ga suki";
  englishMeanings.querySelectorAll(".meaning-entry-group")[0].querySelector(".meaning-example-hiragana").dataset.manuallyEdited = "true";
  const oldGroups = englishMeanings.querySelectorAll(".meaning-entry-group");
  context.activeExampleGroups.set(context.cardForm, oldGroups[0]);
  addFeedback.hidden = false;
  addSuggestions.hidden = false;
  addSuggestions.textContent = "stale";
  const beforeCards = structuredClone(cards);

  state.dispatchJapanese();

  assert.equal(standaloneJapanese.value, "\t ");
  assert.equal(standaloneJapanese.selectionStart, 0);
  assert.equal(standaloneJapanese.selectionEnd, 1);
  assert.equal(standaloneJapanese.focused, true);
  assert.equal(standaloneHiragana.value, "");
  assert.equal(standaloneHiragana.dataset.manuallyEdited, "false");
  assert.equal(context.hiraganaManuallyEdited, false);
  assert.equal(englishMeanings.querySelectorAll(".meaning-entry-group").length, 1);
  assert.equal(englishMeanings.querySelector(".meaning-translation").value, "");
  assert.equal(englishMeanings.querySelector(".meaning-example-romaji").value, "");
  assert.equal(englishMeanings.querySelector(".meaning-example-hiragana").dataset.manuallyEdited, "false");
  assert.equal(englishMeanings.querySelector(".meaning-example-romaji").disabled, true);
  assert.equal(addFeedback.hidden, true);
  assert.equal(addFeedback.textContent, "");
  assert.equal(addFeedback.classList.contains("is-visible"), false);
  assert.deepEqual(context.window.clearedTimeouts, [123]);
  assert.equal(context.addFeedbackTimeout, null);
  assert.equal(addSuggestions.hidden, true);
  assert.equal(addSuggestions.textContent, "");
  assert.equal(addMatches.childElementCount, cards.length);
  assert.equal(addEmpty.hidden, true);
  assert.deepEqual(cards, beforeCards);
});

test("blank Edit input retains edit and return metadata plus controls", () => {
  const state = setup();
  const { context, standaloneJapanese, standaloneHiragana, englishMeanings, cards } = state;
  standaloneJapanese.value = "";
  context.editingCardIndex = 0;
  context.formReturnScreen = "deck";
  context.formTitle.textContent = "Edit word";
  context.formSubmitButton.textContent = "Save changes";
  context.cancelEditButton.hidden = false;
  context.hiraganaManuallyEdited = true;
  context.addMeaningInput("old meaning");
  state.dispatchJapanese();
  assert.equal(context.editingCardIndex, 0);
  assert.equal(context.formReturnScreen, "deck");
  assert.equal(context.formTitle.textContent, "Edit word");
  assert.equal(context.formSubmitButton.textContent, "Save changes");
  assert.equal(context.cancelEditButton.hidden, false);
  assert.equal(standaloneHiragana.value, "");
  assert.equal(englishMeanings.querySelectorAll(".meaning-entry-group").length, 1);
  assert.equal(cards[0].japanese, "neko");
});

test("partial deletion and clearing a meaning or example leave dependent values intact", () => {
  const state = setup();
  const { context, japanese, hiragana, meanings, standaloneJapanese, standaloneHiragana, englishMeanings } = state;
  japanese.value = "nek";
  hiragana.value = "ねこ";
  const inlineGroup = context.createDeckMeaningInput("cat");
  context.setupExampleFields(inlineGroup, state.entry);
  inlineGroup.querySelector(".deck-entry-example-romaji").value = "neko ga suki";
  meanings.append(inlineGroup);
  state.dispatchInline(japanese);
  assert.equal(meanings.children.length, 1);
  assert.equal(meanings.children[0].querySelector(".meaning-translation").value, "cat");
  assert.equal(meanings.children[0].querySelector(".deck-entry-example-romaji").value, "neko ga suki");

  standaloneJapanese.value = "nek";
  standaloneHiragana.value = "ねこ";
  const addGroup = context.addMeaningInput("cat");
  addGroup.value = "cat";
  const example = addGroup.parentNode.querySelector(".meaning-example-romaji");
  example.value = "neko ga suki";
  state.dispatchJapanese();
  assert.equal(englishMeanings.querySelectorAll(".meaning-entry-group").length, 1);
  assert.equal(englishMeanings.querySelector(".meaning-translation").value, "cat");
  assert.equal(englishMeanings.querySelector(".meaning-example-romaji").value, "neko ga suki");
  state.dispatchMeaning(englishMeanings.querySelector(".meaning-translation"));
  assert.equal(standaloneJapanese.value, "nek");
  assert.equal(standaloneHiragana.value, "ねこ");
});

test("late example and spelling results from removed groups cannot repopulate the reset form", async () => {
  const state = setup();
  const { context, japanese, hiragana, meanings, pendingExamples, pendingAlternatives, inlineSuggestions } = state;
  japanese.value = "neko";
  const oldGroup = context.createDeckMeaningInput("cat");
  context.setupExampleFields(oldGroup, state.entry);
  meanings.append(oldGroup);
  hiragana.value = "ねこ";
  oldGroup.querySelector(".meaning-translation").value = "cat";
  context.wordList.querySelectorAll = (selector) => selector === ".deck-entry-meaning-group" ? meanings.children
    : selector === ".word-row[data-card-index]" ? [state.savedRow] : FakeElement.prototype.querySelectorAll.call(context.wordList, selector);
  oldGroup.querySelector(".deck-entry-example-romaji").focus();
  await Promise.resolve();
  assert.equal(pendingExamples.length, 1);
  japanese.value = " ";
  state.dispatchInline(japanese);
  pendingExamples[0].resolve(null);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pendingAlternatives.length, 0);
  assert.equal(oldGroup.isConnected, false);
  assert.equal(meanings.children.length, 1);
  assert.equal(meanings.children[0].querySelector(".deck-entry-example-romaji").value, "");
  assert.equal(inlineSuggestions.hidden, true);

  const oldCurrent = meanings.children[0];
  oldCurrent.querySelector(".meaning-translation").value = "cat";
  oldCurrent.querySelector(".deck-entry-example-romaji").value = "";
  oldCurrent.querySelector(".deck-entry-example-hiragana").value = "";
  // A fresh valid controller enters its spelling lookup before the form is reset.
  japanese.value = "naku";
  hiragana.value = "なく";
  oldCurrent.querySelector(".deck-entry-example-romaji").focus();
  await Promise.resolve();
  assert.equal(pendingExamples.length, 2);
  pendingExamples[1].resolve(null);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pendingAlternatives.length, 1);
  japanese.value = "";
  state.dispatchInline(japanese);
  pendingAlternatives[0].resolve([{ japanese: "neko", meaning: "cat" }]);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(inlineSuggestions.hidden, true);
  assert.equal(inlineSuggestions.textContent, "");
  assert.equal(meanings.children.length, 1);
  assert.equal(meanings.children[0].querySelector(".meaning-translation").value, "");
});
