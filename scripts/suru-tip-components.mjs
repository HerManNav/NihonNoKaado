// Component explanations shared by the English annotation and Spanish builds.
export function compoundStem(meaning) {
  return /compound expression: (taisetsu ni) \+ suru/.exec(meaning)?.[1]
    || /compound verb: ([a-z]+) \+/.exec(meaning)?.[1]
    || /of ([a-z]+) suru\b/.exec(meaning)?.[1]
    || /of ([a-z]+?)suru\b/.exec(meaning)?.[1];
}

export function componentTip(stem, components, language = "en") {
  const gloss = components[stem]?.[language];
  if (!gloss) return "";
  return language === "es"
    ? `Verbo base: ${stem} (${gloss}) + suru (hacer).`
    : `Base compound: ${stem} (${gloss}) + suru (to do).`;
}

export function explainSuruComponents(example, components, language = "en", original = example) {
  for (const [index, word] of example.wordMeanings.entries()) {
    const stem = compoundStem(original.wordMeanings[index].meaning);
    const tip = stem && componentTip(stem, components, language);
    if (tip && !word.meaning.includes(tip)) word.meaning += ` ${tip}`;
  }
}
