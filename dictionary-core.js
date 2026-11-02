(function exposeDictionaryCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JapaneseCardsCore = api;
})(globalThis, function createDictionaryCore() {
  const EXPORT_FORMAT = "japanese-cards-dictionary";

  function parseImportedDictionary(data, makeId = createId) {
    const imported = Array.isArray(data) ? data : data?.cards;
    if (!Array.isArray(imported)) throw new Error("This file does not contain a Japanese Cards dictionary.");
    if (data && !Array.isArray(data) && data.format && data.format !== EXPORT_FORMAT) {
      throw new Error("This file is for a different dictionary format.");
    }
    if (data && !Array.isArray(data) && data.version && data.version !== 1) {
      throw new Error("This dictionary version is not supported.");
    }
    return imported.map((card, index) => {
      const japanese = typeof card?.japanese === "string" ? card.japanese.trim() : "";
      const english = typeof card?.english === "string" ? card.english.trim() : "";
      if (!japanese || !english) throw new Error(`Card ${index + 1} is missing its Japanese word or English translation.`);
      return { id: makeId(index), japanese, english };
    });
  }

  function createId(index) {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`;
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function createPracticeDeck(cards, size, random = Math.random) {
    if (!Array.isArray(cards)) throw new TypeError("Cards must be an array.");
    if (!Number.isInteger(size) || size < 0) throw new RangeError("Session size must be a non-negative integer.");
    if (size > 0 && cards.length === 0) throw new RangeError("Cannot practice an empty dictionary.");

    const deck = [];
    while (deck.length < size) {
      const batch = shuffle(cards, random);
      if (batch.length > 1 && deck.length > 0 && batch[0] === deck[deck.length - 1]) {
        const differentCardIndex = batch.findIndex((card) => card !== deck[deck.length - 1]);
        [batch[0], batch[differentCardIndex]] = [batch[differentCardIndex], batch[0]];
      }
      deck.push(...batch.slice(0, size - deck.length));
    }
    return deck;
  }

  function removeCardAt(cards, index) {
    if (!Array.isArray(cards)) throw new TypeError("Cards must be an array.");
    if (!Number.isInteger(index) || index < 0 || index >= cards.length) return [...cards];
    return cards.filter((_, cardIndex) => cardIndex !== index);
  }

  return { parseImportedDictionary, shuffle, createPracticeDeck, removeCardAt };
});
