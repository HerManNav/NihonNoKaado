const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");

function declarationsFor(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `Expected CSS rule for ${selector}`);
  return rule[1];
}

function selectionChecker(selection, cardNodes = []) {
  const helper = app.match(/function hasSelectedTextInFlashcard\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, "Expected a flashcard text selection guard");
  const context = {
    window: { getSelection: () => selection },
    flashcard: { contains: (node) => cardNodes.includes(node) },
  };
  vm.runInNewContext(`${helper}\nglobalThis.checkSelection = hasSelectedTextInFlashcard;`, context);
  return context.checkSelection();
}

test("selected text inside the flashcard suppresses its click action", () => {
  const anchor = { name: "selected start" };
  const focus = { name: "selected end" };
  const selection = { isCollapsed: false, anchorNode: anchor, focusNode: focus, toString: () => "selected word" };

  assert.equal(selectionChecker(selection, [anchor, focus]), true);
});

test("collapsed, blank, or outside text selections do not suppress card clicks", () => {
  const inside = { name: "inside" };
  const outside = { name: "outside" };
  assert.equal(selectionChecker({ isCollapsed: true, anchorNode: inside, focusNode: inside, toString: () => "" }, [inside]), false);
  assert.equal(selectionChecker({ isCollapsed: false, anchorNode: inside, focusNode: inside, toString: () => "   " }, [inside]), false);
  assert.equal(selectionChecker({ isCollapsed: false, anchorNode: inside, focusNode: outside, toString: () => "mixed" }, [inside]), false);
  assert.equal(selectionChecker(null), false);
});

test("ordinary flashcard clicks still reveal, advance, or step through review cards", () => {
  const handler = app.match(/function handleFlashcardAction\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(handler, "Expected flashcard click handler");
  assert.match(handler, /if \(hasSelectedTextInFlashcard\(\)\) return;/);
  assert.match(handler, /advanceReview\(\)/);
  assert.match(handler, /advancePractice\(\)/);
  assert.match(handler, /revealAnswer\(\)/);
});

test("practice examples support mouse selection and mobile long-press selection", () => {
  const declarations = declarationsFor(".practice-example, .practice-example *");
  assert.match(declarations, /-webkit-user-select:\s*text/);
  assert.match(declarations, /user-select:\s*text/);
  assert.match(declarations, /-webkit-touch-callout:\s*default/);
  assert.doesNotMatch(app, /flashcard\.addEventListener\(["']contextmenu["']/);
});
