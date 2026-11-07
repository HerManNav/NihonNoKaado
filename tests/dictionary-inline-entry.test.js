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

test("web shortcut labels appear above their corresponding buttons", () => {
  assert.ok(app.includes('addMeaningHint.textContent = "Tab"'));
  assert.ok(app.includes('addCardHint.textContent = "Enter"'));
  assert.ok(app.includes('addMeaningAction.append(addMeaningHint, addMeaningButton)'));
  assert.ok(app.includes('addCardAction.append(addCardHint, addCardButton)'));
  assert.match(styles, /\.native-app \.web-shortcut-hint\s*\{\s*display:\s*none/);
  assert.match(declarationsFor(".dictionary-entry-meaning-control"), /grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("Tab from example romaji skips the editable hiragana input in both add surfaces", () => {
  assert.match(app, /event\.key === "Tab" && !event\.shiftKey && isExampleRomajiField[\s\S]*?querySelector\("\.dictionary-entry-example-english"\)\?\.focus\(\)/);
  assert.match(app, /event\.key === "Tab" && !event\.shiftKey && event\.target\.matches\("\.meaning-example-romaji"\)[\s\S]*?querySelector\("\.meaning-example-english"\)\?\.focus\(\)/);
});
