// Common modern Japanese inflections for JMdict romaji readings. The caller
// supplies the POS tags for the matching JMdict entry; this module does not
// guess the verb class from the spelling.
const GODAN = {
  v5u: { ending: "u", a: "wa", i: "i", e: "e", o: "o", te: "tte", ta: "tta" },
  "v5u-s": { ending: "u", a: "wa", i: "i", e: "e", o: "o", te: "ute", ta: "uta" },
  v5k: { ending: "ku", a: "ka", i: "ki", e: "ke", o: "ko", te: "ite", ta: "ita" },
  "v5k-s": { ending: "ku", a: "ka", i: "ki", e: "ke", o: "ko", te: "tte", ta: "tta" },
  v5g: { ending: "gu", a: "ga", i: "gi", e: "ge", o: "go", te: "ide", ta: "ida" },
  v5s: { ending: "su", a: "sa", i: "shi", e: "se", o: "so", te: "shite", ta: "shita" },
  v5t: { ending: "tsu", a: "ta", i: "chi", e: "te", o: "to", te: "tte", ta: "tta" },
  v5n: { ending: "nu", a: "na", i: "ni", e: "ne", o: "no", te: "nde", ta: "nda" },
  v5b: { ending: "bu", a: "ba", i: "bi", e: "be", o: "bo", te: "nde", ta: "nda" },
  v5m: { ending: "mu", a: "ma", i: "mi", e: "me", o: "mo", te: "nde", ta: "nda" },
  v5r: { ending: "ru", a: "ra", i: "ri", e: "re", o: "ro", te: "tte", ta: "tta" },
  "v5r-i": { ending: "ru", a: "ra", i: "ri", e: "re", o: "ro", te: "tte", ta: "tta" },
  v5aru: { ending: "ru", a: "ra", i: "i", e: "re", o: "ro", te: "tte", ta: "tta" },
};

// These verbs express states outside the ordinary ability/possibility reading.
// Their potential forms are excluded by published conjugation guidance.
const NO_POTENTIAL = new Set(["aru", "wakaru", "amegafuru", "kudasaru"]);

function addModernVerbForms(add, { te, past, negative, masuStem, conditional, potential, passive, causative, volitional, imperative }) {
  add(te, "te-form");
  add(past, "past form");
  add(negative, "negative form");
  add(negative.replace(/nai$/, "nakatta"), "past negative form");
  add(negative.replace(/nai$/, "nakute"), "negative te-form");
  add(negative.replace(/nai$/, "naide"), "negative connective form");
  add(masuStem, "verb stem");
  add(`${masuStem}masu`, "polite form");
  add(`${masuStem}mashita`, "polite past form");
  add(`${masuStem}masen`, "polite negative form");
  add(`${masuStem}masendeshita`, "polite past negative form");
  add(`${masuStem}tai`, "desiderative form");
  add(`${masuStem}takatta`, "past desiderative form");
  add(conditional, "conditional -ba form");
  add(`${past}ra`, "conditional -tara form");
  add(volitional, "volitional form");
  add(imperative, "imperative form");
  add(`${te}iru`, "te-iru form");
  add(`${te}ita`, "past te-iru form");
  add(`${te}imasu`, "polite te-iru form");

  for (const [form, name] of [[potential, "potential"], [passive, "passive"], [causative, "causative"]]) {
    if (!form?.endsWith("ru")) continue;
    add(form, `${name} form`);
    const stem = form.slice(0, -2);
    add(`${stem}ta`, `past ${name} form`);
    add(`${stem}te`, `${name} te-form`);
    add(`${stem}nai`, `negative ${name} form`);
  }
}

function addGodanForms(add, lemma, kind) {
  const rule = GODAN[kind];
  if (!rule || !lemma.endsWith(rule.ending)) return;
  const base = lemma.slice(0, -rule.ending.length);
  const negative = kind === "v5r-i" && lemma === "aru" ? "nai" : `${base}${rule.a}nai`;
  addModernVerbForms(add, {
    te: `${base}${rule.te}`,
    past: `${base}${rule.ta}`,
    negative,
    masuStem: `${base}${lemma === "gozaru" ? "i" : rule.i}`,
    conditional: `${base}${rule.e}ba`,
    potential: kind === "v5r-i" || NO_POTENTIAL.has(lemma) ? null : `${base}${rule.e}ru`,
    passive: `${base}${rule.a}reru`,
    causative: `${base}${rule.a}seru`,
    volitional: `${base}${rule.o}u`,
    imperative: `${base}${rule.e}`,
  });
}

function addIchidanForms(add, lemma) {
  if (!lemma.endsWith("ru")) return;
  const base = lemma.slice(0, -2);
  addModernVerbForms(add, {
    te: `${base}te`, past: `${base}ta`, negative: `${base}nai`,
    masuStem: base, conditional: `${base}reba`, potential: `${base}rareru`,
    passive: `${base}rareru`, causative: `${base}saseru`,
    volitional: `${base}you`, imperative: `${base}ro`,
  });
  // The shorter potential is common in speech, but the longer form above is
  // shared with the passive and remains available too.
  add(`${base}reru`, "colloquial potential form");
}

function addSuruForms(add, prefix = "") {
  addModernVerbForms(add, {
    te: `${prefix}shite`, past: `${prefix}shita`, negative: `${prefix}shinai`,
    masuStem: `${prefix}shi`, conditional: `${prefix}sureba`,
    potential: `${prefix}dekiru`, passive: `${prefix}sareru`,
    causative: `${prefix}saseru`, volitional: `${prefix}shiyou`,
    imperative: `${prefix}shiro`,
  });
  if (prefix) add(`${prefix}suru`, "suru verb (dictionary form)");
}

function addKuruForms(add, lemma) {
  if (!lemma.endsWith("kuru")) return;
  const prefix = lemma.slice(0, -4);
  addModernVerbForms(add, {
    te: `${prefix}kite`, past: `${prefix}kita`, negative: `${prefix}konai`,
    masuStem: `${prefix}ki`, conditional: `${prefix}kureba`,
    potential: `${prefix}korareru`, passive: `${prefix}korareru`,
    causative: `${prefix}kosaseru`, volitional: `${prefix}koyou`,
    imperative: `${prefix}koi`,
  });
}

function addIAdjectiveForms(add, lemma, irregular) {
  if (!lemma.endsWith("i")) return;
  const base = irregular && lemma === "ii" ? "yo" : lemma.slice(0, -1);
  add(`${base}katta`, "past adjective form");
  add(`${base}kute`, "adjective te-form");
  add(`${base}kunai`, "negative adjective form");
  add(`${base}kunakatta`, "past negative adjective form");
  add(`${base}ku`, "adverbial adjective form");
  add(`${base}kereba`, "conditional adjective form");
}

function addNaAdjectiveForms(add, lemma) {
  add(`${lemma}na`, "attributive na-adjective form");
  add(`${lemma}da`, "plain copula form");
  add(`${lemma}datta`, "past na-adjective form");
  add(`${lemma}de`, "connective na-adjective form");
  add(`${lemma}janai`, "negative na-adjective form");
  add(`${lemma}janakatta`, "past negative na-adjective form");
  add(`${lemma}desu`, "polite na-adjective form");
  add(`${lemma}deshita`, "polite past na-adjective form");
}

function addCopulaForms(add, lemma) {
  if (lemma === "da") {
    add("datta", "past copula form");
    add("de", "connective copula form");
    add("janai", "negative copula form");
    add("janakatta", "past negative copula form");
    add("darou", "volitional copula form");
    add("naraba", "conditional copula form");
  } else if (lemma === "desu") {
    add("deshita", "polite past copula form");
    add("deshou", "polite volitional copula form");
  }
}

export function generateInflections(lemmaRomaji, posTags) {
  const lemma = String(lemmaRomaji || "").trim().toLowerCase();
  if (!/^[a-z]+(?:'[a-z]+)*$/.test(lemma)) return [];
  const tags = new Set(posTags || []);
  const results = [];
  const seen = new Set();
  function add(romaji, label) {
    if (!romaji || romaji === lemma || !/^[a-z]+(?:'[a-z]+)*$/.test(romaji)) return;
    const key = `${romaji}\0${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ romaji, label });
  }

  if (tags.has("vs-i") || tags.has("vs-s")) {
    if (lemma.endsWith("suru")) addSuruForms(add, lemma.slice(0, -4));
  } else if (tags.has("vk")) {
    addKuruForms(add, lemma);
  } else if (tags.has("v1") || tags.has("v1-s")) {
    addIchidanForms(add, lemma);
  } else {
    for (const kind of Object.keys(GODAN)) {
      if (tags.has(kind)) addGodanForms(add, lemma, kind);
    }
  }

  if (tags.has("vs") && !lemma.endsWith("suru")) addSuruForms(add, lemma);
  if (tags.has("adj-i") || tags.has("adj-ix")) addIAdjectiveForms(add, lemma, tags.has("adj-ix"));
  if (tags.has("adj-na")) addNaAdjectiveForms(add, lemma);
  if (tags.has("cop")) addCopulaForms(add, lemma);
  return results;
}
