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
  assert.match(app, /const firstMeaning = createDictionaryMeaningInput\(\);\s*meanings\.append\(firstMeaning\)/);
});

test("inline entry prepends each saved card below the form and keeps focus at the top without scrolling", () => {
  const addStart = app.indexOf("function addDictionaryEntry");
  const addEnd = app.indexOf("function removeDictionaryCard", addStart);
  const addDictionary = app.slice(addStart, addEnd);

  assert.match(addDictionary, /const groups = \[\.\.\.row\.querySelectorAll\("\.dictionary-entry-meaning-group"\)\]/);
  assert.match(addDictionary, /const examples = meaningEntries\.map\(\(entry\) => entry\.example\)/);
  assert.match(addDictionary, /const nextCards = \[\{ id:[^\n]*, japanese, hiragana, english, meanings, examples \}, \.\.\.cards\]/);
  assert.match(addDictionary, /cards = nextCards;\s*renderDictionaryList\(0\);\s*wordList\.scrollTop = 0;\s*wordList\.querySelector\("\.dictionary-entry-japanese"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(addDictionary, /scrollIntoView/);
  assert.match(app, /event\.key === "Enter" && \(isMeaningField \|\| isExampleEndField\)[\s\S]*?addDictionaryEntry\(\)/);
});

test("inline hints are attached to each English field and follow the focused meaning", () => {
  const createMeaning = app.slice(app.indexOf("function createDictionaryMeaningInput"), app.indexOf("function createEntryExampleInput"));
  const activateHints = app.slice(app.indexOf("function showDictionaryMeaningHints"), app.indexOf("function addDictionaryEntry"));
  assert.ok(createMeaning.includes("dictionary-entry-hints"));
  assert.ok(createMeaning.includes("hints.hidden = true"));
  assert.match(activateHints, /group !== activeGroup/);
  assert.match(app, /wordList\.addEventListener\("focusin"[\s\S]*?showDictionaryMeaningHints\(row, group\)/);
  assert.ok(app.includes("Press <kbd>Tab</kbd> for another meaning"));
  assert.ok(app.includes("Press <kbd>Enter</kbd> to add card"));
  const meaningControl = declarationsFor(".dictionary-entry-meaning-control");
  const narrowEntry = styles.match(/@media \(max-width: 520px\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(meaningControl, /grid-template-columns:[^;]*minmax\(128px, \.55fr\)/);
  assert.match(narrowEntry, /\.dictionary-entry-meaning-control\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(narrowEntry, /\.dictionary-entry-hints\s*\{\s*flex-direction:\s*row/);
});

test("Tab from example romaji skips the editable hiragana input in both add surfaces", () => {
  assert.match(app, /event\.key === "Tab" && !event\.shiftKey && isExampleRomajiField[\s\S]*?querySelector\("\.dictionary-entry-example-english"\)\?\.focus\(\)/);
  assert.match(app, /event\.key === "Tab" && !event\.shiftKey && event\.target\.matches\("\.meaning-example-romaji"\)[\s\S]*?querySelector\("\.meaning-example-english"\)\?\.focus\(\)/);
});
