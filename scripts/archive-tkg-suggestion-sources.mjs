// Preserve the complete pinned dictionary for offline, reproducible suggestions.
// Usage: node scripts/archive-tkg-suggestion-sources.mjs <sparse-checkout-root>
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const commit = '32c267cbfa7756a2e3542657772759d92d4e2420';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const sourceRoot = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Provide the pinned TKG checkout directory.');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const indexBytes = await readFile(path.join(root, 'decks/source-data/tkg-entries-index-32c267cb.json'));
const index = JSON.parse(indexBytes);
const checkoutIndex = (await readFile(path.join(sourceRoot, 'entries_index.json'), 'utf8')).replace(/\r\n/g, '\n');
if (sha256(indexBytes) !== sha256(checkoutIndex)) throw new Error('Checkout index differs from the pinned app index.');
const archives = [];
let count = 0, examples = 0;
for (let start = 0; start < index.entries.length; start += 500) {
  const records = await Promise.all(index.entries.slice(start, start + 500).map(async row => {
    const file = path.resolve(sourceRoot, row.path);
    if (!file.startsWith(sourceRoot + path.sep)) throw new Error('Invalid source path.');
    const content = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
    const entry = JSON.parse(content);
    if (entry.id !== row.id || !Array.isArray(entry.examples)) throw new Error(`Invalid source entry: ${row.id}`);
    examples += entry.examples.length;
    return {id: row.id, path: row.path, sha256: sha256(content), content};
  }));
  const raw = JSON.stringify({format: 1, sourceCommit: commit, entries: records});
  const bytes = gzipSync(raw, {level: 9});
  if (Buffer.byteLength(raw) > 20_000_000 || bytes.length > 20_000_000) throw new Error('Source chunk exceeds 20 MB.');
  const file = `tkg-suggestion-entries-32c267cb-${String(archives.length).padStart(4, '0')}.json.gz`;
  await writeFile(path.join(root, 'decks/source-data', file), bytes);
  archives.push({file, entries: records.length, bytes: bytes.length, sha256: sha256(bytes)});
  count += records.length;
  if (archives.length % 10 === 0) console.log(`Archived ${count}/${index.entries.length} entries.`);
}
const manifest = {format: 1, source: 'https://github.com/tkgally/je-dict-1', sourceCommit: commit,
  license: 'CC0-1.0', indexFile: 'tkg-entries-index-32c267cb.json', indexSha256: sha256(indexBytes),
  entries: count, examples, archives};
await writeFile(path.join(root, 'decks/source-data/tkg-suggestion-entries-32c267cb-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({entries: count, examples, archives: archives.length}));
