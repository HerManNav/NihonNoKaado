const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const styles = readFileSync(join(__dirname, "..", "styles.css"), "utf8");

function declarationsFor(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `Expected CSS rule for ${selector}`);
  return rule[1];
}

test("deck menu hover bridge stays behind clickable options", () => {
  const beforeBridge = declarationsFor(".deck-action-menu::before");
  const afterBridge = declarationsFor(".deck-action-menu::after");
  const actionButton = declarationsFor(".deck-action");

  assert.match(beforeBridge, /z-index:\s*0/);
  assert.match(afterBridge, /z-index:\s*0/);
  assert.match(actionButton, /position:\s*relative/);
  assert.match(actionButton, /z-index:\s*1/);
});

test("deck options accept pointer input while the menu is open on hover", () => {
  const openMenu = declarationsFor(".deck-tools.is-open .deck-action-menu");
  const hoverStyle = declarationsFor(".deck-action:hover, .deck-action:focus-visible");

  assert.match(openMenu, /pointer-events:\s*auto/);
  assert.match(openMenu, /visibility:\s*visible/);
  assert.match(hoverStyle, /background:\s*#d2d8c9/i);
});
