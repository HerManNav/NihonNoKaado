const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'export-storage.js'), 'utf8');

function runtime(plugin) {
  const calls = [];
  const link = { click() { calls.push(['click', this.download, this.href]); }, remove() { calls.push(['remove']); } };
  const window = { Capacitor: plugin ? { Plugins: { DeckExport: plugin } } : undefined,
    indexedDB: { deleteDatabase(name) { calls.push(['forget', name]); } },
    setTimeout(fn, delay) { calls.push(['timer', delay]); this.pending = fn; } };
  const document = { createElement: () => link, body: { append: () => calls.push(['append']) } };
  const URL = { createObjectURL(blob) { calls.push(['blob', blob]); return 'blob:export'; }, revokeObjectURL(url) { calls.push(['revoke', url]); } };
  vm.runInNewContext(source, { window, document, URL, Blob });
  return { api: window.JapaneseCardsExport, window, calls };
}

test('web export downloads named JSON and releases its temporary URL', async () => {
  const { api, window, calls } = runtime();
  assert.equal(api.isNative, false);
  assert.match(api.destination(), /browser/);
  assert.equal((await api.save('deck.json', '{"cards":[]}')).downloaded, true);
  assert.equal(await calls.find(c => c[0] === 'blob')[1].text(), '{"cards":[]}');
  assert.deepEqual(calls.find(c => c[0] === 'click'), ['click', 'deck.json', 'blob:export']);
  assert.deepEqual(calls.find(c => c[0] === 'timer'), ['timer', 1000]);
  window.pending();
  assert.deepEqual(calls.at(-1), ['revoke', 'blob:export']);
});

test('Android export passes name and contents to the native Downloads plugin and propagates failures', async () => {
  const requests = [];
  const plugin = { async save(request) { requests.push(request); if (request.filename === 'bad.json') throw Error('failed'); return { ok: true }; } };
  const { api, calls } = runtime(plugin);
  assert.equal(api.isNative, true);
  assert.match(api.destination(), /Downloads/);
  await api.save('deck.json', '{}');
  assert.equal(requests[0].filename, 'deck.json');
  assert.equal(requests[0].contents, '{}');
  await assert.rejects(api.save('bad.json', '{}'), /failed/);
  assert.equal(calls.some(c => c[0] === 'blob'), false);
});
