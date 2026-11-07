// Build every Spanish starter deck as an exact prefix of the master translation.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { explainSuruComponents } from "./suru-tip-components.mjs";
const suruComponents = JSON.parse(readFileSync(new URL("./suru-components.json", import.meta.url), "utf8"));
const root = new URL("../decks/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const source = read("english/most-common-2000.json");
const draft = read("source-data/spanish-deck-draft.json");
const reviewed = read("source-data/spanish-reviewed-100.json");
if (source.cards.length !== 2000 || draft.cards.length !== 2000) throw new Error("Expected 2,000 cards.");
const wordCorrections = {
  "fushi|fushi": "nudo (del bambú)",
  "sozai|karui": "ligero",
};
draft.cards.splice(0, 100, ...reviewed.cards);
for (const [index, card] of draft.cards.entries()) {
  const original = source.cards[index];
  if (card.japanese !== original.japanese || card.hiragana !== original.hiragana) throw new Error(`Changed Japanese at ${index}.`);
  if (!card.english.trim()) throw new Error(`Missing meaning at ${index}.`);
  for (const [j, example] of card.examples.entries()) {
    const before = original.examples[j];
    if (example.romaji !== before.romaji || example.hiragana !== before.hiragana) throw new Error(`Changed example at ${index}.`);
    if (!example.english.trim() || example.wordMeanings.length !== before.wordMeanings.length) throw new Error(`Missing translation at ${index}.`);
    for (const [k, word] of example.wordMeanings.entries()) {
      const correction = wordCorrections[`${card.japanese}|${word.romaji}`];
      if (correction) word.meaning = correction;
      if (!word.meaning.trim() || word.romaji !== before.wordMeanings[k].romaji) throw new Error(`Changed token at ${index}.`);
    }
    explainSuruComponents(example, suruComponents, "es", before);
  }
}
for (const count of [50, 100, 500, 1000, 2000]) {
  const deck = { ...draft, name: `Más comunes - ${count.toLocaleString("es-ES")}`,
    source: `${source.source} Spanish: OPUS-MT-tc-big-en-es candidates with grammar templates and editorial corrections; see SOURCES.md.`,
    cards: draft.cards.slice(0, count) };
  writeFileSync(new URL(`spanish/most-common-${count}-es.json`, root), `${JSON.stringify(deck, null, 2)}\n`);
}
const sourceHash = createHash("sha256").update(JSON.stringify(source.cards)).digest("hex");
writeFileSync(new URL("source-data/spanish-build-report.json", root), `${JSON.stringify({sourceHash, cards: 2000,
  examples: draft.cards.reduce((n,c) => n+c.examples.length,0),
  annotations: draft.cards.reduce((n,c) => n+c.examples.reduce((n,e)=>n+e.wordMeanings.length,0),0),
  sizes: [50,100,500,1000,2000],
  review: "First 100 manually translated; remaining candidates reviewed for lexical errors and structural anomalies. Not independently proofread in full."}, null, 2)}\n`);
