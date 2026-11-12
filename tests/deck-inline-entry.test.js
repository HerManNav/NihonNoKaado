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

test("deck list keeps its blank entry before saved entries, including when empty", () => {
  const renderStart = app.indexOf("function renderDeckList");
  const renderEnd = app.indexOf("function createDeckEntryRow", renderStart);
  const renderDeck = app.slice(renderStart, renderEnd);
  const blankEntryIndex = renderDeck.indexOf("wordList.append(createDeckEntryRow());");
  const cardsIndex = renderDeck.indexOf("cards.forEach((card, index) => {");

  assert.ok(blankEntryIndex >= 0 && blankEntryIndex < cardsIndex);
  assert.match(app, /row\.className = "word-row deck-entry-row"/);
  assert.match(app, /japanese\.className = "deck-entry-japanese"/);
  assert.match(app, /hiragana\.className = "deck-entry-hiragana"/);
  assert.match(app, /const firstMeaning = createDeckMeaningInput\(\);\s*meanings\.append\(firstMeaning\)/);
});

test("inline entry prepends each saved card below the form and keeps focus at the top without scrolling", () => {
  const addStart = app.indexOf("function addDeckEntry");
  const addEnd = app.indexOf("function removeDeckCard", addStart);
  const addDeck = app.slice(addStart, addEnd);

  assert.match(addDeck, /const groups = \[\.\.\.row\.querySelectorAll\("\.deck-entry-meaning-group"\)\]/);
  assert.match(addDeck, /const examples = meaningEntries\.map\(\(entry\) => entry\.example\)/);
  assert.match(addDeck, /const nextCards = existingIndex < 0\s*\? \[\{ id:[^\n]*, \.\.\.entry \}, \.\.\.cards\]/);
  assert.match(addDeck, /cards = nextCards;\s*renderDeckList\(existingIndex < 0 \? 0 : existingIndex\);\s*wordList\.scrollTop = 0;\s*wordList\.querySelector\("\.deck-entry-japanese"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(addDeck, /scrollIntoView/);
  assert.match(app, /event\.key === "Enter" && \(isMeaningField \|\| isExampleEndField\)[\s\S]*?addDeckEntry\(\)/);
});

test("web shortcut labels appear above their corresponding buttons", () => {
  assert.ok(app.includes('addMeaningHint.textContent = "Tab"'));
  assert.ok(app.includes('addCardHint.textContent = "Enter"'));
  assert.ok(app.includes('addMeaningAction.append(addMeaningHint, addMeaningButton)'));
  assert.ok(app.includes('addCardAction.append(addCardHint, addCardButton)'));
  assert.match(styles, /\.native-app \.web-shortcut-hint\s*\{\s*display:\s*none/);
  assert.match(declarationsFor(".deck-entry-meaning-control"), /grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("Tab from example romaji skips the editable hiragana input in both add surfaces", () => {
  assert.match(app, /event\.key === "Tab" && !event\.shiftKey && isExampleRomajiField[\s\S]*?querySelector\("\.deck-entry-example-english"\)\?\.focus\(\)/);
  assert.match(app, /event\.key === "Tab" && !event\.shiftKey && event\.target\.matches\("\.meaning-example-romaji"\)[\s\S]*?querySelector\("\.meaning-example-english"\)\?\.focus\(\)/);
});
