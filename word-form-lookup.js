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
  // The short particle と shares its reading with many unrelated words. Its
  // common conjunction, accompaniment, and quotation senses are present in
  // JMdict's full gloss list but can disappear behind those homographs when
  // the four-line popup uses only each entry's first gloss.
  const PARTICLE_SENSE_HINTS = new Map([
    ["to", ["and", "with", "used for quoting (thoughts, speech, etc.)"]],
  ]);
  const NO_POTENTIAL = new Set(["aru", "wakaru", "amegafuru", "kudasaru"]);

  function isUnsupportedForm(label, lemma, tag, gloss) {
    if (/potential/.test(label)) {
      if (tag === "v5r-i" || NO_POTENTIAL.has(lemma)) return true;
      if (lemma === "iru" && tag === "v5r" && /\bneed(?:ed)?\b/i.test(gloss)) return true;
    }
    // ござる takes ござい- before ます, never the regular ござり- stem.
    return lemma === "gozaru" && /^polite/.test(label);
  }

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

  function suruComponentTip(noun, data) {
    const row = (data.lemmas?.[noun] || []).find(([tag]) => tag === "vs");
    return row ? ` Base compound: ${noun} (${row[1]}) + suru (to do).` : "";
  }

  function addDirectMeanings(candidates, key, data) {
    const heads = data.heads?.[key];
    if (Array.isArray(heads) && heads.length) {
      for (const [gloss, score] of heads) addCandidate(candidates, gloss, score);
    } else {
      for (const gloss of (data.lookup?.[key] || []).slice(0, 4)) addCandidate(candidates, gloss, 0);
    }
  }

  function addParticleSenseHints(candidates, key, data) {
    const hints = PARTICLE_SENSE_HINTS.get(key);
    if (!hints) return;
    const sourceGlosses = data.lookup?.[key] || [];
    for (const hint of hints) {
      if (sourceGlosses.includes(hint)) addCandidate(candidates, hint, 0, 1);
    }
  }

  function addIrregularForms(candidates, key, data) {
    for (const [label, lemma, gloss, score] of data.irregularForms?.[key] || []) {
      if (isUnsupportedForm(label, lemma, "", gloss) && lemma !== "gozaru") continue;
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
        if (isUnsupportedForm(label, lemma, tag, gloss)) continue;
        const shownLemma = tag === "vs" ? `${lemma} suru` : lemma;
        const continuous = /te-iru/.test(label) ? " (te-form + iru: ongoing action or continuing state)" : "";
        const passive = tag === "vs" && /passive/.test(label) ? ` (compound verb: ${lemma} + suru; passive voice)` : "";
        const components = tag === "vs" ? suruComponentTip(lemma, data)
          : lemma.endsWith("suru") ? suruComponentTip(lemma.slice(0, -4), data) : "";
        addCandidate(candidates, `${label} of ${shownLemma} — ${gloss}${continuous}${passive}${components}`, score);
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
      // With a separate preceding noun, the card supplies the missing context.
      // Without it, a matching noun suffix must not outrank a real verb form
      // (e.g. shinda is usually the past of shinu, not shin + da).
      if (head) addCandidate(candidates, `${label} of ${noun} — ${head[0]}`, numericScore(head[1]) - 1, previousKey === noun ? 1 : -1);
    }
  }

  function addPronounPlural(candidates, key, previousKey, data) {
    for (const [suffix, label] of PLURAL_SUFFIXES) {
      let noun = "";
      const allowsBase = (base) => {
        const head = data.groupHeads?.[base];
        return !!head && (suffix !== "gata" || head[2] === "person");
      };
      if (key === suffix && previousKey && allowsBase(previousKey)) noun = previousKey;
      else if (key.endsWith(suffix) && key.length > suffix.length) {
        const base = key.slice(0, -suffix.length);
        if (allowsBase(base)) noun = base;
      }
      if (!noun) continue;
      const head = data.groupHeads[noun];
      if (head) addCandidate(candidates, `${label} of ${noun} — ${head[0]}`, numericScore(head[1]) - 1, previousKey === noun ? 1 : -1);
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
        addCandidate(candidates, `${label} of ${previousKey} suru — ${gloss}${suruComponentTip(previousKey, data)}`, score, 2);
      }
    }
  }

  function addAttachedSuru(candidates, key, data) {
    for (const [suffix, form] of [["shimasendeshita", "polite past negative"], ["shinakatta", "past negative"],
      ["shimashita", "polite past"], ["shimasen", "polite negative"], ["shimasu", "polite"],
      ["shinai", "negative"], ["shita", "past"], ["suru", "dictionary form"]]) {
      if (!key.endsWith(suffix) || key.length === suffix.length) continue;
      const noun = key.slice(0, -suffix.length);
      for (const [tag, gloss, score] of data.lemmas?.[noun] || []) {
        if (tag !== "vs") continue;
        addCandidate(candidates, `${form} form of ${noun} suru — ${gloss} (compound verb: ${noun} + ${suffix})${suruComponentTip(noun, data)}`, score, 1);
      }
    }
  }

  function addContinuousAuxiliary(candidates, key, data) {
    for (const [ending, label] of [
      ['imasendeshita', 'polite past negative'], ['imashita', 'polite past'],
      ['inakatta', 'past negative'], ['imasen', 'polite negative'], ['inai', 'negative'],
    ]) {
      if (!key.endsWith(ending)) continue;
      const teForm = key.slice(0, -ending.length);
      if (!/(?:te|de)$/.test(teForm)) continue;
      for (const meaning of findWordMeanings(teForm, data)) {
        const match = /^(.*?te-form) of (.+?) — (.+)$/.exec(meaning);
        if (!match) continue;
        addCandidate(candidates, `${label} continuing form of ${match[2]} — ${match[3]} (${teForm} + ${ending}: ${match[1]} + iru, continuing action or state)`, 0, 1);
      }
      break;
    }
  }

  function findWordMeanings(key, data, previousKey = "") {
    const word = normalizedKey(key);
    if (!word || !data || typeof data !== "object") return [];
    const previous = normalizedKey(previousKey);
    const candidates = [];
    const { nouns } = keySets(data);
    addDirectMeanings(candidates, word, data);
    if (word === "arigatougozaimashita") {
      addCandidate(candidates, "thank you (gozaimashita is the polite past of gozaimasu)", 0, 1);
    }
    addParticleSenseHints(candidates, word, data);
    addIrregularForms(candidates, word, data);
    addRuleForms(candidates, word, data);
    addNounCopula(candidates, word, previous, data, nouns);
    addPronounPlural(candidates, word, previous, data);
    addSpacedSuru(candidates, word, previous, data);
    addAttachedSuru(candidates, word, data);
    addContinuousAuxiliary(candidates, word, data);

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
