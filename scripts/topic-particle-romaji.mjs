// Keep the pronounced topic particle in sync with its clickable annotation.
// Entry IDs retain the source spelling; lexical ha (tooth, leaf) stays ha.
export function normalizeTopicParticleRomaji(example) {
  let index = 0;
  example.romaji = example.romaji.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (token) => {
    const word = example.wordMeanings?.[index++];
    if (token.toLowerCase() !== "ha" || word?.entryId !== "00079_ha") return token;
    const replacement = token === "HA" ? "WA" : token === "Ha" ? "Wa" : "wa";
    word.romaji = replacement;
    return replacement;
  });
}
