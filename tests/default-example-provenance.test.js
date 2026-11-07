const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");

const sourceDirectory = path.join(__dirname, "../decks/source-data");
const deckDirectory = path.join(__dirname, "../decks");
const commit = "32c267cb";
const entries = new Map();
const indexEntries = new Map(JSON.parse(readFileSync(path.join(sourceDirectory,
  "tkg-entries-index-32c267cb.json"), "utf8")).entries.map((entry) => [entry.id, entry]));

for (const prefix of ["tkg-example-entries", "tkg-linked-entries"]) {
  const manifest = JSON.parse(readFileSync(path.join(sourceDirectory, `${prefix}-${commit}-manifest.json`), "utf8"));
  for (const archive of manifest.archives) {
    const compressed = readFileSync(path.join(sourceDirectory, archive.file));
    assert(compressed.length < 25_000_000, `${archive.file} exceeds the host's per-file limit`);
    const payload = JSON.parse(gunzipSync(compressed));
    for (const record of payload.entries) {
      const entry = JSON.parse(record.content);
      assert.equal(entry.id, record.id);
      entries.set(entry.id, entry);
    }
  }
}

test("contextual annotations cite preserved TKG entries and real definition numbers", () => {
  let cited = 0;
  let numbered = 0;
  const errors = [];
  for (const size of [50, 100, 500, 1000, 2000]) {
    const deck = JSON.parse(readFileSync(path.join(deckDirectory, `english/most-common-${size}.json`), "utf8"));
    for (const [cardIndex, card] of deck.cards.entries()) {
      for (const example of card.examples || []) {
        for (const [tokenIndex, annotation] of (example.wordMeanings || []).entries()) {
          const location = `${size} card ${cardIndex + 1} (${card.japanese}), token ${tokenIndex + 1} (${annotation.romaji})`;
          if (annotation.entryId === undefined) {
            if (annotation.senseNumber !== undefined) errors.push(`${location}: senseNumber lacks entryId`);
            continue;
          }
          cited += 1;
          const entry = entries.get(annotation.entryId);
          if (!entry && indexEntries.has(annotation.entryId) && annotation.senseNumber === undefined) continue;
          if (!entry) {
            errors.push(`${location}: missing preserved source ${annotation.entryId}`);
            continue;
          }
          if (annotation.senseNumber !== undefined) {
            numbered += 1;
            if (!entry.definitions?.some((definition) => definition.sense_number === annotation.senseNumber)) {
              errors.push(`${location}: ${annotation.entryId} has no definition ${annotation.senseNumber}`);
            }
          }
        }
      }
    }
  }
  assert(cited > 0, "Expected source-linked word annotations");
  assert(numbered > 0, "Expected sense-linked word annotations");
  assert.equal(errors.length, 0, `Invalid provenance:\n${errors.slice(0, 20).join("\n")}`);
});
