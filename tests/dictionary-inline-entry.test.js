const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const app = readFileSync(join(__dirname, "..", "app.js"), "utf8");
const styles = readFileSync(join(__dirname, "..", "styles.css"), "utf8");

function declarationsFor(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `Expected CSS rule for ${selector}`);
  return rule[1];
}

test("dictionary list keeps its blank entry before saved entries, including when empty", () => {
  const renderStart = app.indexOf("function renderDictionaryList");
  const renderEnd = app.indexOf("function createDictionaryEntryRow", renderStart);
  const renderDictionary = app.slice(renderStart, renderEnd);
  const blankEntryIndex = renderDictionary.indexOf("wordList.append(createDictionaryEntryRow());");
  const cardsIndex = renderDictionary.indexOf("cards.forEach((card, index) => {");

  assert.ok(blankEntryIndex >= 0 && blankEntryIndex < cardsIndex);
  assert.match(app, /row\.className = "word-row dictionary-entry-row"/);
  assert.match(app, /japanese\.className = "dictionary-entry-japanese"/);
  assert.match(app, /hiragana\.className = "dictionary-entry-hiragana"/);
  assert.match(app, /meanings\.append\(createDictionaryMeaningInput\(\)\)/);
});

test("inline entry prepends each saved card below the form and keeps focus at the top without scrolling", () => {
  const addStart = app.indexOf("function addDictionaryEntry");
  const addEnd = app.indexOf("function removeDictionaryCard", addStart);
  const addDictionary = app.slice(addStart, addEnd);

  assert.match(app, /const meanings = \[\.\.\.row\.querySelectorAll\("\.dictionary-entry-meaning"\)\][\s\S]*?\.filter\(Boolean\)/);
  assert.match(addDictionary, /const nextCards = \[\{ id:[^\n]*, japanese, hiragana, english, meanings \}, \.\.\.cards\]/);
  assert.match(addDictionary, /cards = nextCards;\s*renderDictionaryList\(0\);\s*wordList\.scrollTop = 0;\s*wordList\.querySelector\("\.dictionary-entry-japanese"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(addDictionary, /scrollIntoView/);
  assert.match(app, /getDictionaryEntryKeyAction\(event\.key, event\.shiftKey/);
  assert.match(app, /action === "add-card"[\s\S]*?addDictionaryEntry\(\)/);
});

test("inline entry has keyboard hints beside English and adapts on small screens", () => {
  assert.ok(app.includes("Press <kbd>Tab</kbd> for another meaning"));
  assert.ok(app.includes("Press <kbd>Enter</kbd> to add card"));
  const meaningRow = declarationsFor(".dictionary-entry-meaning-row");
  const narrowEntry = styles.match(/@media \(max-width: 520px\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(meaningRow, /grid-template-columns:[^;]*minmax\(128px, \.55fr\)/);
  assert.match(narrowEntry, /\.dictionary-entry-meaning-row\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(narrowEntry, /\.dictionary-entry-hints\s*\{\s*flex-direction:\s*row/);
});
