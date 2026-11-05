(function exposeDictionaryCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JapaneseCardsCore = api;
})(globalThis, function createDictionaryCore() {
  const EXPORT_FORMAT = "japanese-cards-dictionary";
  const ROMAJI_SYLLABLES = {
    kya: "きゃ", kyu: "きゅ", kyo: "きょ", gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
    sha: "しゃ", shu: "しゅ", sho: "しょ", ja: "じゃ", ju: "じゅ", jo: "じょ",
    cha: "ちゃ", chu: "ちゅ", cho: "ちょ", nya: "にゃ", nyu: "にゅ", nyo: "にょ",
    hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ", bya: "びゃ", byu: "びゅ", byo: "びょ",
    pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ", mya: "みゃ", myu: "みゅ", myo: "みょ",
    rya: "りゃ", ryu: "りゅ", ryo: "りょ",
    shi: "し", chi: "ち", tsu: "つ", fu: "ふ", ji: "じ", si: "し", ti: "ち", tu: "つ",
    ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ", ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
    sa: "さ", su: "す", se: "せ", so: "そ", za: "ざ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
    ta: "た", te: "て", to: "と", da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
    na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の", ha: "は", hi: "ひ", hu: "ふ", he: "へ", ho: "ほ",
    ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ", pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
    ma: "ま", mi: "み", mu: "む", me: "め", mo: "も", ya: "や", yu: "ゆ", yo: "よ",
    ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ", wa: "わ", wo: "を", n: "ん",
    a: "あ", i: "い", u: "う", e: "え", o: "お",
  };
  const ROMAJI_WORDS = { konnichiwa: "こんにちは", konbanwa: "こんばんは" };
  const ROMAJI_PUNCTUATION = {
    ",": "、", ".": "。", "?": "？", "!": "！", ":": "：", ";": "；",
    "(": "（", ")": "）",
  };

  function romajiToHiragana(value) {
    const input = String(value ?? "").toLowerCase();
    if (ROMAJI_WORDS[input]) return ROMAJI_WORDS[input];
    let output = "";
    let insideDoubleQuote = false;
    for (let index = 0; index < input.length;) {
      const char = input[index];
      if (input.slice(index, index + 3) === "...") {
        output += "…";
        index += 3;
        continue;
      }
      if (char === '"') {
        output += insideDoubleQuote ? "」" : "「";
        insideDoubleQuote = !insideDoubleQuote;
        index += 1;
        continue;
      }
      if (/[^a-z]/.test(char)) {
        output += ROMAJI_PUNCTUATION[char] || char;
        index += 1;
        continue;
      }
      // Hepburn spells the geminated "ch" sound with "tch" (for example, matcha).
      if (input.slice(index, index + 3) === "tch") {
        output += "っ";
        index += 1;
        continue;
      }
      if (index + 1 < input.length && char === input[index + 1] && /[bcdfghjklmpqrstvwxyz]/.test(char) && char !== "n") {
        output += "っ";
        index += 1;
        continue;
      }
      if (char === "n" && input[index + 1] === "'") {
        output += "ん";
        index += 2;
        continue;
      }
      if (char === "n" && index + 1 < input.length && !/[aiueoyn]/.test(input[index + 1])) {
        output += "ん";
        index += 1;
        continue;
      }
      const syllable = [3, 2, 1].map((length) => input.slice(index, index + length)).find((part) => ROMAJI_SYLLABLES[part]);
      if (syllable) {
        output += ROMAJI_SYLLABLES[syllable];
        index += syllable.length;
      } else {
        output += char;
        index += 1;
      }
    }
    return output;
  }

  function shouldSkipHiraganaOnTab(key, shiftKey) {
    return key === "Tab" && !shiftKey;
  }

  function shouldAutoConvertHiragana(manuallyEdited, currentHiragana) {
    return !manuallyEdited || !String(currentHiragana ?? "").trim();
  }

  function getDictionaryEntryKeyAction(key, shiftKey, field, fieldIndex = 0, fieldCount = 1) {
    if (shiftKey) return null;
    if (key === "Tab" && field === "japanese") return "focus-meaning";
    if (field !== "meaning") return null;
    const isLastMeaning = fieldIndex === fieldCount - 1;
    if (key === "Tab" && isLastMeaning) return "add-meaning";
    if (key === "Enter") return isLastMeaning ? "add-card" : "focus-next-meaning";
    return null;
  }

  function normalizeWordMeanings(value, romaji) {
    if (!Array.isArray(value)) return null;
    const words = String(romaji).match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];
    if (!words.length || value.length !== words.length) return null;
    const normalized = [];
    for (const [index, word] of words.entries()) {
      const item = value[index];
      const sameWord = String(item?.romaji || "").toLowerCase().replace(/’/g, "'")
        === word.toLowerCase().replace(/’/g, "'");
      if (!sameWord || typeof item.meaning !== "string" || !item.meaning.trim()) return null;
      const annotation = { romaji: word, meaning: item.meaning.trim() };
      if (typeof item.entryId === "string" && /^\d{5}_[a-z0-9_'-]+$/i.test(item.entryId)) {
        annotation.entryId = item.entryId;
      }
      if (Number.isInteger(item.senseNumber) && item.senseNumber > 0) {
        annotation.senseNumber = item.senseNumber;
      }
      normalized.push(annotation);
    }
    return normalized;
  }

  function parseImportedDictionary(data, makeId = createId) {
    const imported = Array.isArray(data) ? data : data?.cards;
    if (!Array.isArray(imported)) throw new Error("This file does not contain a Japanese Cards dictionary.");
    if (data && !Array.isArray(data) && data.format && data.format !== EXPORT_FORMAT) {
      throw new Error("This file is for a different dictionary format.");
    }
    if (data && !Array.isArray(data) && data.version && ![1, 2, 3].includes(data.version)) {
      throw new Error("This dictionary version is not supported.");
    }
    return imported.map((card, index) => {
      const japanese = typeof card?.japanese === "string" ? card.japanese.trim() : "";
      const rawMeanings = Array.isArray(card?.meanings) ? card.meanings : (Array.isArray(card?.english) ? card.english : [card?.english]);
      const meanings = rawMeanings.filter((meaning) => typeof meaning === "string").map((meaning) => meaning.trim()).filter(Boolean);
      if (!japanese || meanings.length === 0) throw new Error(`Card ${index + 1} is missing its Japanese word or English translation.`);
      const hiragana = typeof card?.hiragana === "string" && card.hiragana.trim()
        ? card.hiragana.trim()
        : romajiToHiragana(japanese);
      const rawExamples = Array.isArray(card?.examples) ? card.examples : [];
      const examples = meanings.map((_, meaningIndex) => {
        const example = rawExamples[meaningIndex] || {};
        const romaji = typeof example.romaji === "string" ? example.romaji.trim() : "";
        const exampleHiragana = typeof example.hiragana === "string" && example.hiragana.trim()
          ? example.hiragana.trim()
          : romajiToHiragana(romaji);
        const english = typeof example.english === "string" ? example.english.trim() : "";
        const importedExample = { romaji, hiragana: exampleHiragana, english };
        const wordMeanings = normalizeWordMeanings(example.wordMeanings, romaji);
        if (wordMeanings) importedExample.wordMeanings = wordMeanings;
        return importedExample;
      });
      return { id: makeId(index), japanese, hiragana, english: meanings[0], meanings, examples };
    });
  }

  function prepareDefaultDictionary(data, count, makeId = createId) {
    if (!Number.isInteger(count) || count < 1) throw new RangeError("Default dictionary size must be a positive integer.");
    const cards = parseImportedDictionary(data, makeId);
    if (cards.length < count) throw new Error("The dictionary has fewer cards than its catalog entry specifies.");
    return cards.slice(0, count);
  }

  function serializeDictionary(cards, name, exportedAt = new Date().toISOString()) {
    if (!Array.isArray(cards)) throw new TypeError("Cards must be an array.");
    return JSON.stringify({
      format: EXPORT_FORMAT,
      version: 3,
      name,
      exportedAt,
      cards: cards.map((card) => {
        const meanings = Array.isArray(card.meanings) ? card.meanings : [card.english];
        const exported = {
          japanese: card.japanese,
          hiragana: card.hiragana,
          examples: meanings.map((_, index) => {
            const example = Array.isArray(card.examples) ? card.examples[index] : null;
            const romaji = typeof example?.romaji === "string" ? example.romaji.trim() : "";
            const exportedExample = {
              romaji,
              hiragana: typeof example?.hiragana === "string" && example.hiragana.trim() ? example.hiragana.trim() : romajiToHiragana(romaji),
              english: typeof example?.english === "string" ? example.english.trim() : "",
            };
            const wordMeanings = normalizeWordMeanings(example?.wordMeanings, romaji);
            if (wordMeanings) exportedExample.wordMeanings = wordMeanings;
            return exportedExample;
          }),
        };
        if (meanings.length > 1) exported.meanings = meanings;
        else exported.english = meanings[0];
        return exported;
      }),
    }, null, 2);
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

  function getSessionProgressState(total, currentIndex, reviewIndex, shownIndices, answerRevealed = false) {
    if (!Number.isInteger(total) || total < 1) throw new RangeError("Session progress needs at least one card.");
    if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= total) {
      throw new RangeError("Current card index is outside the session.");
    }
    if (reviewIndex !== null && (!Number.isInteger(reviewIndex) || reviewIndex < 0 || reviewIndex >= currentIndex)) {
      throw new RangeError("Review card must be an earlier session card.");
    }
    if (!(shownIndices instanceof Set) && !Array.isArray(shownIndices)) {
      throw new TypeError("Shown card indices must be a Set or array.");
    }

    const shown = shownIndices instanceof Set ? shownIndices : new Set(shownIndices);
    if ([...shown].some((index) => !Number.isInteger(index) || index < 0 || index >= total)) {
      throw new RangeError("Shown card index is outside the session.");
    }
    if (!shown.has(currentIndex) || (reviewIndex !== null && !shown.has(reviewIndex))) {
      throw new RangeError("Current and reviewed cards must have been shown.");
    }
    const position = (index) => total === 1 ? 0 : (index / (total - 1)) * 100;
    const guessPosition = position(currentIndex);
    const darkThroughIndex = reviewIndex ?? currentIndex;
    const darkPosition = position(darkThroughIndex);
    const reviewPosition = reviewIndex === null ? guessPosition : position(reviewIndex);
    const points = Array.from({ length: total }, (_, index) => {
      const isShown = shown.has(index);
      return {
        index,
        isShown,
        isDark: isShown && index <= darkThroughIndex,
        isReviewRange: isShown && reviewIndex !== null && index > reviewIndex && index <= currentIndex,
        isCurrent: index === currentIndex,
        isGuessing: index === currentIndex && !answerRevealed,
        isReviewing: index === reviewIndex,
      };
    });

    return {
      shownCount: currentIndex + 1,
      guessPosition,
      darkPosition,
      reviewPosition,
      reviewWidth: reviewIndex === null ? 0 : guessPosition - reviewPosition,
      points,
    };
  }

  function nextReviewIndex(reviewIndex, currentIndex) {
    if (reviewIndex === null) return null;
    if (!Number.isInteger(reviewIndex) || !Number.isInteger(currentIndex) || reviewIndex < 0 || reviewIndex >= currentIndex) {
      throw new RangeError("Review position must precede the current card.");
    }
    return reviewIndex + 1 >= currentIndex ? null : reviewIndex + 1;
  }

  function createMeaningPracticeRun(cards, random = Math.random) {
    if (!Array.isArray(cards) || cards.length === 0) throw new RangeError("Cannot practice an empty dictionary.");
    if (cards.some((card) => !Array.isArray(card.meanings) || card.meanings.length === 0)) {
      throw new TypeError("Every practice card must have at least one English meaning.");
    }

    let pool;
    let seenMeanings;
    function reset() {
      pool = [...cards];
      seenMeanings = new Map(cards.map((card) => [card, card.meanings.map(() => false)]));
    }

    function draw() {
      if (pool.length === 0) reset();
      const cardIndex = Math.floor(random() * pool.length);
      const card = pool[cardIndex];
      const seen = seenMeanings.get(card);
      const unseenIndices = seen.flatMap((wasSeen, index) => wasSeen ? [] : [index]);
      const meaningIndex = unseenIndices[Math.floor(random() * unseenIndices.length)];
      seen[meaningIndex] = true;
      if (seen.every(Boolean)) pool.splice(cardIndex, 1);
      return { card, meaningIndex, meaning: card.meanings[meaningIndex], runComplete: pool.length === 0 };
    }

    reset();
    return { draw, reset };
  }

  function removeCardAt(cards, index) {
    if (!Array.isArray(cards)) throw new TypeError("Cards must be an array.");
    if (!Number.isInteger(index) || index < 0 || index >= cards.length) return [...cards];
    return cards.filter((_, cardIndex) => cardIndex !== index);
  }

  function updateCardAt(cards, index, updates) {
    if (!Array.isArray(cards)) throw new TypeError("Cards must be an array.");
    if (!Number.isInteger(index) || index < 0 || index >= cards.length) return [...cards];
    return cards.map((card, cardIndex) => cardIndex === index ? { ...card, ...updates } : card);
  }

  return { parseImportedDictionary, prepareDefaultDictionary, serializeDictionary, normalizeWordMeanings, romajiToHiragana, shouldSkipHiraganaOnTab, shouldAutoConvertHiragana, getDictionaryEntryKeyAction, shuffle, createPracticeDeck, createMeaningPracticeRun, getSessionProgressState, nextReviewIndex, removeCardAt, updateCardAt };
});
