const test = require('node:test');
const assert = require('node:assert/strict');
const deck = require('../dictionaries/most-common-2000.json');

// Whole-sentence expectations: these contrast homographs and grammatical uses
// that a frequency-ranked headword lookup cannot resolve on its own.
const cases = [
  ['This smartphone is equipped with AI.', 'AI', /artificial intelligence/],
  ['Please solve this equation.', 'shiki', /equation/],
  ['Only those 20 and older may enter.', 'kata', /person/],
  ["I'm blood type A.", 'A', /blood type/],
  ['She sacrificed herself for her family.', 'shita', /past of suru/],
  ['This book was very helpful.', 'natta', /past of naru/],
  ['We are looking for talented people.', 'na', /adjectival connector/],
  ['The starting pitcher held the opponents scoreless through seven innings.', 'kai', /inning/],
  ['To advocate for preserving the national polity.', 'goji', /preservation/],
  ['I went to the temple.', 'o', /honorific prefix/],
  ['Please check the website for details.', 'go', /honorific prefix/],
  ["Don't go too fast.", 'suginaide', /negative.*sugiru/],
];
for (const [english, word, meaning] of cases) {
  test(`${word} uses its sentence meaning in ${english}`, () => {
    const example = deck.cards.flatMap(card => card.examples).find(item => item.english === english);
    assert(example, `Missing reference sentence: ${english}`);
    const annotation = example.wordMeanings.find(item => item.romaji === word);
    assert(annotation, `Missing target ${word}`);
    assert.match(annotation.meaning, meaning);
  });
}

test('selector flags unknown words and mismatched source alignment', async () => {
  const { annotateExample } = await import('../scripts/tkg-context-meaning.mjs');
  const result = annotateExample({
    example: { romaji: 'unrecognized.' }, sourceExample: { japanese: 'あ。', english: 'Ah.' },
    entriesById: new Map(), indexById: new Map(),
  });
  assert(result.review.some(item => item.type === 'alignment'));
  assert(result.review.some(item => item.type === 'missing entry'));
});
