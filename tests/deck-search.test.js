const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const source = readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");

function setup() {
  const listeners = {};
  const dialog = {
    open: false,
    returnValue: "",
    addEventListener: (name, callback) => { listeners[name] = callback; },
    showModal() { this.open = true; },
    close(value) { this.open = false; this.returnValue = value; listeners.close(); },
  };
  const cards = [{ japanese: "neko" }, { japanese: "nekoyanagi" }, { japanese: "inu" }];
  const rows = cards.map((_, index) => ({ dataset: { cardIndex: String(index) }, hidden: false }));
  const empty = { hidden: true };
  const label = {};
  const word = {};
  const context = vm.createContext({
    overwriteDialog: dialog, pendingOverwrite: null, cards,
    document: { querySelector: () => word },
    wordList: { querySelectorAll: () => rows, querySelector: () => empty },
    deckListCount: label,
  });
  vm.runInContext(source.slice(source.indexOf("function normalizeDeckWord"), source.indexOf("function renderAddDeckMatches")), context);
  return { context, dialog, cards, rows, empty, label, word };
}

test("live search matches substrings ignoring case and whitespace, and clearing restores the deck", () => {
  const { context, rows, empty, label } = setup();
  context.filterDeckList(" NEKO ");
  assert.deepEqual(rows.map((row) => row.hidden), [false, false, true]);
  assert.equal(label.textContent, "2 / 3");
  context.filterDeckList("missing");
  assert.equal(empty.hidden, false);
  context.filterDeckList("");
  assert.deepEqual(rows.map((row) => row.hidden), [false, false, false]);
  assert.equal(empty.hidden, true);
});

test("only exact duplicates prompt; cancel does not save and confirming saves once", () => {
  const { context, dialog, word } = setup();
  const saved = [];
  context.requestCardOverwrite("nek", (index) => saved.push(index));
  assert.deepEqual(saved, [-1]);
  assert.equal(dialog.open, false);
  context.requestCardOverwrite(" NEKO ", (index) => saved.push(index));
  assert.equal(dialog.open, true);
  assert.equal(word.textContent, "neko");
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
