const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'android-app/android/app/src/main/AndroidManifest.xml'), 'utf8');

test('dictionary tools open import, export and clear screens and toggle on touch', () => {
  assert.match(app, /querySelector\("#import-action"\)\.addEventListener\("click", openDefaultDictionaries\)/);
  assert.match(app, /querySelector\("#export-action"\)\.addEventListener\("click", exportDictionary\)/);
  assert.match(app, /querySelector\("#clear-action"\)\.addEventListener\("click", confirmClearDictionary\)/);
  assert.match(app, /dictionaryTools\.classList\.contains\("is-open"\)\) closeDictionaryMenu\(\);\s*else openDictionaryMenu\(\)/);
  assert.match(app, /importButton\.className = "default-dictionary-option own-dictionary-option"/);
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
  assert.match(app, /addCardButton\.addEventListener\("click", addDictionaryEntry\)/);
  assert.match(css, /\.dictionary-entry-actions \.dictionary-add-meaning\s*\{[^}]*background:\s*#f4f4f0/);
  assert.match(css, /\.add-button::before\s*\{[^}]*position:\s*absolute;\s*inset:\s*0;\s*margin:\s*auto/);
});
