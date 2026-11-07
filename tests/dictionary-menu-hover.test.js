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

test("dictionary menu hover bridge stays behind clickable options", () => {
  const beforeBridge = declarationsFor(".dictionary-action-menu::before");
  const afterBridge = declarationsFor(".dictionary-action-menu::after");
  const actionButton = declarationsFor(".dictionary-action");

  assert.match(beforeBridge, /z-index:\s*0/);
  assert.match(afterBridge, /z-index:\s*0/);
  assert.match(actionButton, /position:\s*relative/);
  assert.match(actionButton, /z-index:\s*1/);
});

test("dictionary options accept pointer input while the menu is open on hover", () => {
  const openMenu = declarationsFor(".dictionary-tools.is-open .dictionary-action-menu");
  const hoverStyle = declarationsFor(".dictionary-action:hover, .dictionary-action:focus-visible");

  assert.match(openMenu, /pointer-events:\s*auto/);
  assert.match(openMenu, /visibility:\s*visible/);
  assert.match(hoverStyle, /background:\s*#d2d8c9/i);
});
