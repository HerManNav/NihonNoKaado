const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDefaultDictionary, serializeDictionary, parseImportedDictionary } = require('../dictionary-core.js');

const specs = [
  { size: 50, checks: [
    ['kono hon ha omoshiroi desu.', 'omoshiroi', /interesting.*i-adjective.*polite desu/i],
    ['kare ha"ikitakunai"to iimashita.', 'ikitakunai', /negative.*want to go|do not want to go/i],
  ] },
  { size: 100, checks: [
    ['okane ga hitsuyou desu.', 'hitsuyou', /necessary.*na-adjective.*polite copula/i],
    ['mada tabeteimasen.', 'tabeteimasen', /negative.*taberu.*tabete \+ imasen/i],
  ] },
  ...[500, 1000, 2000].map(size => ({ size, checks: [
    ['toshokan de benkyoushimasu.', 'benkyoushimasu', /compound verb: benkyou \+ shimasu.*polite/i],
    ['chiba ken ni sundeimasu.', 'sundeimasu', /sumu.*sunde \+ imasu.*continuing/i],
    ['ame ga futte iru.', 'futte', /furu.*futte \+ iru/i],
    ['tsuki ga kirei da.', 'kirei', /beautiful.*na-adjective.*plain copula/i],
  ] })),
];

for (const { size, checks } of specs) {
  test(`${size}-word default deck preserves its contextual meanings through import and export`, () => {
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, `../dictionaries/most-common-${size}.json`), 'utf8'));
    const imported = prepareDefaultDictionary(source, size, index => String(index));
    const roundTrip = parseImportedDictionary(JSON.parse(serializeDictionary(imported, 'test')), index => String(index));
    for (const [sentence, token, expected] of checks) {
      const example = roundTrip.flatMap(card => card.examples).find(row => row.romaji === sentence);
      assert(example, `${size}: missing ${sentence}`);
      const word = example.wordMeanings.find(row => row.romaji === token);
      assert(word, `${size}: missing ${token}`);
      assert.match(word.meaning, expected, `${size}: ${sentence}`);
    }
  });
}
