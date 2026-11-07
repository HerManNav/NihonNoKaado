import { readFileSync, writeFileSync } from "node:fs";
import { compoundStem } from "./suru-tip-components.mjs";
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const index = read("../decks/source-data/tkg-entries-index-32c267cb.json").entries;
const cards = read("../decks/english/most-common-2000.json").cards;
const spanish = read("../decks/source-data/spanish-translation-candidates.json");
const overrides = read("./spanish-translation-overrides.json");
const components = read("./suru-component-overrides.json");
const annotations = cards.flatMap(c=>c.examples.flatMap(e=>e.wordMeanings));
const stems = [...new Set(annotations.map(w=>compoundStem(w.meaning)).filter(Boolean))].sort();
const output = {}, missing = [];
for (const stem of stems) {
  // These are independent lexical verbs, not noun + suru compounds.
  if (["tas", "ut"].includes(stem)) continue;
  if (components[stem]) { const [en, es] = components[stem]; output[stem] = {en, es}; continue; }
  const nouns = index.filter(e=>e.id.slice(6) === stem && e.pos_tags.includes("noun"));
  const compound = index.find(e=>e.id.slice(6) === `${stem}suru` && e.headword.endsWith("する"));
  const linkedIds = new Set(annotations.filter(w=>compoundStem(w.meaning)===stem).map(w=>w.entryId));
  const linked = nouns.filter(n=>linkedIds.has(n.id));
  const spelled = compound && nouns.filter(n=>n.headword===compound.headword.slice(0,-2));
  const noun = spelled?.length===1 ? spelled[0] : linked.length===1 ? linked[0] : nouns.length===1 ? nouns[0] : null;
  if (!noun) { missing.push([stem,"ambiguous noun",nouns.map(n=>[n.id,n.gloss])]); continue; }
  const en = noun.gloss.split(/[;,]/)[0].trim();
  const es = overrides[en] || spanish[en]?.translation;
  output[stem] = { en, es: es || "", entryId: noun.id };
  if (!es) missing.push([stem,en]);
}
writeFileSync(new URL("./suru-components.json", import.meta.url), JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify({stems:stems.length,resolved:Object.keys(output).length,missing},null,2));
