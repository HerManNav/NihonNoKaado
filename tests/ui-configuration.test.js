const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'android-app/android/app/src/main/AndroidManifest.xml'), 'utf8');

test('deck tools open import, export and clear screens and toggle on touch', () => {
  assert.match(app, /querySelector\("#import-action"\)\.addEventListener\("click", openDefaultDecks\)/);
  assert.match(app, /querySelector\("#export-action"\)\.addEventListener\("click", exportDeck\)/);
  assert.match(app, /querySelector\("#clear-action"\)\.addEventListener\("click", confirmClearDeck\)/);
  assert.match(app, /deckTools\.classList\.contains\("is-open"\)\) closeDeckMenu\(\);\s*else openDeckMenu\(\)/);
  assert.match(app, /importButton\.className = "default-deck-option own-deck-option"/);
  assert.match(css, /\.own-deck-option\s*\{[^}]*background:\s*#f0f0eb/);
});

test('export screen shows Downloads on Android and uses browser downloads on web', () => {
  assert.match(html, /id="export-name"[^>]*required/);
  assert.match(app, /export-destination-info"\)\.hidden = !window\.JapaneseCardsExport\.isNative/);
  assert.match(html, /Successfully exported/);
  assert.match(app, /screens\.export\.classList\.add\("is-export-success"\)/);
  assert.match(app, /showScreen\("home"\)/);
  assert.match(manifest, /android:screenOrientation="portrait"/);
});

test('entry controls and web plus use neutral centered styling', () => {
  assert.match(app, /addMeaningButton\.addEventListener\("click"/);
  assert.match(app, /addCardButton\.addEventListener\("click", addDeckEntry\)/);
  assert.match(css, /\.deck-entry-actions \.deck-add-meaning\s*\{[^}]*background:\s*#f4f4f0/);
  assert.match(css, /\.add-button::before\s*\{[^}]*position:\s*absolute;\s*inset:\s*0;\s*margin:\s*auto/);
});
