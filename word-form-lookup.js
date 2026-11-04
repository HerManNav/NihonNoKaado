(function exposeWordFormLookup(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JapaneseWordFormLookup = api;
})(globalThis, function createWordFormLookup() {
  const keySetCache = new WeakMap();
  const COPULA_FORMS = new Map([
    ["da", "plain copula form"],
    ["desu", "polite copula form"],
    ["datta", "past copula form"],
    ["deshita", "polite past copula form"],
    ["janai", "negative copula form"],
    ["janakatta", "past negative copula form"],
    ["dewanai", "negative copula form"],
    ["dewanakatta", "past negative copula form"],
    ["de", "connective copula form"],
    ["darou", "volitional copula form"],
    ["deshou", "polite volitional copula form"],
  ]);
  const PLURAL_SUFFIXES = new Map([
    ["tachi", "plural/group suffix"],
    ["ra", "informal plural suffix"],
    ["gata", "honorific plural suffix"],
  ]);

  function normalizedKey(value) {
    return String(value || "").trim().toLowerCase().replace(/’/g, "'");
  }

  function numericScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function keySets(data) {
    if (!data || typeof data !== "object") return { nouns: new Set(), pronouns: new Set() };
    let cached = keySetCache.get(data);
    if (!cached) {
      cached = {
        nouns: new Set(data.nounKeys || []),
        pronouns: new Set(data.pronounKeys || []),
      };
      keySetCache.set(data, cached);
    }
    return cached;
  }

  function bestHead(key, data) {
    const heads = data.heads?.[key];
    if (Array.isArray(heads) && heads.length) {
      return heads.reduce((best, row) => numericScore(row[1]) > numericScore(best[1]) ? row : best);
    }
    const first = data.lookup?.[key]?.[0];
    return first ? [first, 0] : null;
  }

  function addCandidate(candidates, text, score, priority = 0) {
    if (typeof text === "string" && text.trim()) {
      candidates.push({ text: text.trim(), score: numericScore(score), priority });
    }
  }

  function addDirectMeanings(candidates, key, data) {
    const heads = data.heads?.[key];
    if (Array.isArray(heads) && heads.length) {
      for (const [gloss, score] of heads) addCandidate(candidates, gloss, score);
    } else {
      for (const gloss of (data.lookup?.[key] || []).slice(0, 4)) addCandidate(candidates, gloss, 0);
    }
  }

  function addIrregularForms(candidates, key, data) {
    for (const [label, lemma, gloss, score] of data.irregularForms?.[key] || []) {
      const preferred = key === "shita" && lemma === "suru" && /past/.test(label) ? 1 : 0;
      addCandidate(candidates, `${label} of ${lemma} — ${gloss}`, score, preferred);
    }
  }

  function addRuleForms(candidates, key, data) {
    for (const [formSuffix, lemmaSuffix, posTag, label] of data.formRules || []) {
      if (!key.endsWith(formSuffix)) continue;
      const prefix = formSuffix ? key.slice(0, -formSuffix.length) : key;
      const lemma = prefix + lemmaSuffix;
      if (!lemma || lemma === key) continue;
      for (const [tag, gloss, score] of data.lemmas?.[lemma] || []) {
        if (tag !== posTag) continue;
        const shownLemma = tag === "vs" ? `${lemma} suru` : lemma;
        addCandidate(candidates, `${label} of ${shownLemma} — ${gloss}`, score);
      }
    }
  }

  function addNounCopula(candidates, key, previousKey, data, nouns) {
    for (const [suffix, label] of COPULA_FORMS) {
      let noun = "";
      if (key === suffix && previousKey && nouns.has(previousKey)) noun = previousKey;
      else if (key.endsWith(suffix) && key.length > suffix.length) {
        const attachedNoun = key.slice(0, -suffix.length);
        if (nouns.has(attachedNoun)) noun = attachedNoun;
      }
      if (!noun) continue;
      const head = bestHead(noun, data);
      if (head) addCandidate(candidates, `${label} of ${noun} — ${head[0]}`, numericScore(head[1]) - 1, previousKey === noun ? 1 : 0);
    }
  }

  function addPronounPlural(candidates, key, previousKey, data, nouns, pronouns) {
    for (const [suffix, label] of PLURAL_SUFFIXES) {
      let noun = "";
      const allowsBase = (base) => pronouns.has(base) || (suffix === "tachi" && nouns.has(base));
      if (key === suffix && previousKey && allowsBase(previousKey)) noun = previousKey;
      else if (key.endsWith(suffix) && key.length > suffix.length) {
        const base = key.slice(0, -suffix.length);
        if (allowsBase(base)) noun = base;
      }
      if (!noun) continue;
      const head = bestHead(noun, data);
      if (head) addCandidate(candidates, `${label} of ${noun} — ${head[0]}`, numericScore(head[1]) - 1, previousKey === noun ? 1 : 0);
    }
  }

  function addSpacedSuru(candidates, key, previousKey, data) {
    if (!previousKey) return;
    const verbalNouns = (data.lemmas?.[previousKey] || []).filter(([tag]) => tag === "vs");
    if (!verbalNouns.length) return;
    const suruForms = [
      ...(data.irregularForms?.[key] || []).filter(([, lemma]) => lemma === "suru")
        .map(([label, , , score]) => [label, score]),
    ];
    for (const [formSuffix, lemmaSuffix, posTag, label] of data.formRules || []) {
      if (posTag !== "vs-i" || !formSuffix || !key.endsWith(formSuffix)) continue;
      if (key.slice(0, -formSuffix.length) + lemmaSuffix === "suru") suruForms.push([label, 0]);
    }
    for (const [label, formScore] of suruForms) {
      for (const [, gloss, nounScore] of verbalNouns) {
        const score = Math.max(numericScore(formScore), numericScore(nounScore));
        addCandidate(candidates, `${label} of ${previousKey} suru — ${gloss}`, score, 2);
      }
    }
  }

  function findWordMeanings(key, data, previousKey = "") {
    const word = normalizedKey(key);
    if (!word || !data || typeof data !== "object") return [];
    const previous = normalizedKey(previousKey);
    const candidates = [];
    const { nouns, pronouns } = keySets(data);
    addDirectMeanings(candidates, word, data);
    addIrregularForms(candidates, word, data);
    addRuleForms(candidates, word, data);
    addNounCopula(candidates, word, previous, data, nouns);
    addPronounPlural(candidates, word, previous, data, nouns, pronouns);
    addSpacedSuru(candidates, word, previous, data);

    candidates.sort((a, b) => b.priority - a.priority || b.score - a.score);
    const seen = new Set();
    const result = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.text)) continue;
      seen.add(candidate.text);
      result.push(candidate.text);
      if (result.length === 4) break;
    }
    return result;
  }

  return { findWordMeanings };
});
