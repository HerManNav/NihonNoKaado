const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { searchDeckCards } = require("../deck-core.js");

const source = readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");

class FakeNode {
  constructor(tagName = "#text", text = "") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.dataset = {};
    this.className = "";
    this._text = text;
  }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
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
  replaceChildren(...nodes) { this.children.forEach((child) => { child.parentNode = null; }); this.children = []; this._text = ""; this.append(...nodes); }
  insertBefore(node, before) {
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    const index = this.children.indexOf(before);
    node.parentNode = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    return node;
  }
  querySelector(selector) {
    if (selector === ".japanese-word-display strong") return this.strong || null;
    return null;
  }
}

function setup(cards = [
  { japanese: "neko", hiragana: "ねこ", meanings: ["cat"] },
  { japanese: "nekoyanagi", hiragana: "ねこやなぎ", meanings: ["pussy willow"] },
  { japanese: "neku", hiragana: "ねく", meanings: ["fuzzy match"] },
  { japanese: "inu", hiragana: "いぬ", meanings: ["dog"] },
]) {
  const listeners = {};
  const dialog = {
    open: false, returnValue: "",
    addEventListener: (name, callback) => { listeners[name] = callback; },
    showModal() { this.open = true; },
    close(value) { this.open = false; this.returnValue = value; listeners.close(); },
  };
  const empty = new FakeNode("p");
  const entry = new FakeNode("article");
  entry.className = "word-row deck-entry-row";
  const formInput = new FakeNode("input");
  formInput.value = "stored entry value";
  formInput.selectionStart = 4;
  formInput.selectionEnd = 8;
  formInput.focused = true;
  formInput.listeners = { input: () => "same listener" };
  entry.append(formInput);
  const rows = cards.map((card, index) => {
    const row = new FakeNode("article");
    row.className = "word-row";
    row.dataset.cardIndex = String(index);
    row.strong = new FakeNode("strong");
    row.strong.textContent = card.japanese;
    row.querySelector = (selector) => selector === ".japanese-word-display strong" ? row.strong : null;
    return row;
  });
  const suggestions = new FakeNode("section");
  const wordList = new FakeNode("div");
  wordList.children = [entry, ...rows, empty, suggestions];
  wordList.children.forEach((child) => { child.parentNode = wordList; });
  wordList.querySelectorAll = () => rows;
  wordList.querySelector = (selector) => selector === ".deck-search-empty" ? empty : null;
  const label = {};
  const overwriteWord = {};
  const addList = new FakeNode("div");
  const addEmpty = {};
  const addSearch = {};
  const japaneseInput = { value: "" };
  const nodes = {
    "#overwrite-word": overwriteWord,
    "#add-spelling-suggestions": suggestions,
    "#add-deck-matches": addList,
    "#add-deck-empty": addEmpty,
    "#add-deck-search": addSearch,
  };
  const document = {
    querySelector: (selector) => nodes[selector] || null,
    createTextNode: (text) => new FakeNode("#text", text),
    createElement: (tagName) => new FakeNode(tagName),
  };
  const context = vm.createContext({
    overwriteDialog: dialog, pendingOverwrite: null, cards, document, wordList, deckListCount: label,
    japaneseInput, editingCardIndex: null, searchDeckCards,
  });
  const first = source.indexOf("function normalizeDeckWord");
  const last = source.indexOf("const flashcard");
  vm.runInContext(source.slice(first, last), context);
  const matchStart = source.indexOf("function hasMatchingDeckWord");
  const matchEnd = source.indexOf("function renderSpellingSuggestions", matchStart);
  vm.runInContext(source.slice(matchStart, matchEnd), context);
  return { context, dialog, cards, rows, empty, label, wordList, entry, formInput, addList, addEmpty, addSearch, japaneseInput, listeners };
}

test("inline search ranks and highlights results while keeping the entry form mounted", () => {
  const { context, rows, empty, label, wordList, entry, formInput } = setup();
  const input = { value: " neko ", selectionStart: 2, selectionEnd: 3, focused: true };
  context.filterDeckList(input.value);
  assert.deepEqual(rows.map((row) => row.hidden), [false, false, false, true]);
  assert.deepEqual(wordList.children.slice(0, 4), [entry, rows[0], rows[1], rows[2]]);
  assert.equal(label.textContent, "3 / 4");
  assert.equal(empty.hidden, true);
  assert.equal(rows[0].strong.textContent, "neko");
  assert.equal(rows[0].strong.children[0].tagName, "mark");
  assert.equal(rows[0].strong.children[0].textContent, "neko");
  assert.equal(rows[1].strong.children[0].textContent, "neko");
  assert.equal(rows[2].strong.children.length, 1);
  assert.equal(rows[2].strong.children[0].tagName, "#text");
  assert.equal(input.value, " neko ");
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 3);
  assert.equal(input.focused, true);
  assert.equal(wordList.children[0], entry);
  assert.equal(entry.children[0], formInput);
  assert.equal(formInput.value, "stored entry value");
  assert.equal(formInput.selectionStart, 4);
  assert.equal(formInput.selectionEnd, 8);
  assert.equal(formInput.focused, true);
  assert.equal(formInput.listeners.input(), "same listener");
});

test("clearing restores original row order and removes highlights; hostile markup stays text", () => {
  const { context, rows, empty, label, wordList, entry } = setup([
    { japanese: "<img src=x onerror=alert(1)>", meanings: ["literal"] },
    { japanese: "inu", meanings: ["dog"] },
  ]);
  context.filterDeckList("<img");
  assert.equal(rows[0].strong.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(rows[0].strong.children[0].tagName, "mark");
  context.filterDeckList("");
  assert.deepEqual(wordList.children.slice(0, 3), [entry, rows[0], rows[1]]);
  assert.deepEqual(rows.map((row) => row.hidden), [false, false]);
  assert.equal(rows[0].strong.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(rows[0].strong.children.some((child) => child.tagName === "mark"), false);
  assert.equal(empty.hidden, true);
  assert.equal(label.textContent, "2 words");
  context.filterDeckList("no-match");
  assert.equal(empty.hidden, false);
  assert.equal(label.textContent, "0 / 2");
});

test("standalone add matches use the same result order and literal highlights", () => {
  const { context, cards, addList, addEmpty, addSearch, japaneseInput } = setup();
  japaneseInput.value = "neko";
  context.renderAddDeckMatches();
  assert.deepEqual(addList.children.map((row) => row.children[0].textContent), ["neko", "nekoyanagi", "neku"]);
  assert.equal(addList.children[1].children[0].children[0].tagName, "mark");
  assert.equal(addList.children[1].children[0].textContent, cards[1].japanese);
  assert.equal(addEmpty.hidden, true);
  assert.equal(addSearch.hidden, false);
  japaneseInput.value = "missing";
  context.renderAddDeckMatches();
  assert.equal(addList.children.length, 0);
  assert.equal(addEmpty.hidden, false);
});

test("spelling suggestions treat fuzzy deck hits as existing matches", () => {
  const { context } = setup();
  assert.equal(context.hasMatchingDeckWord("neka"), true);
  assert.equal(context.hasMatchingDeckWord("missing"), false);
});

test("only exact duplicates prompt; cancel does not save and confirming saves once", () => {
  const { context, dialog } = setup();
  const saved = [];
  context.requestCardOverwrite("nek", (index) => saved.push(index));
  assert.deepEqual(saved, [-1]);
  assert.equal(dialog.open, false);
  context.requestCardOverwrite(" NEKO ", (index) => saved.push(index));
  assert.equal(dialog.open, true);
  assert.equal(context.document.querySelector("#overwrite-word").textContent, "neko");
  assert.deepEqual(saved, [-1]);
  dialog.close("cancel");
  assert.deepEqual(saved, [-1]);
  context.requestCardOverwrite("neko", (index) => saved.push(index));
  context.requestCardOverwrite("inu", () => assert.fail("Repeated submit replaced the pending card"));
  dialog.close("overwrite");
  assert.deepEqual(saved, [-1, 0]);
  context.requestCardOverwrite("inu", () => assert.fail("Escape reused an earlier confirmation"));
  assert.equal(dialog.returnValue, "cancel");
  dialog.close("cancel");
});
