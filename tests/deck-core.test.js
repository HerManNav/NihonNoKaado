const test = require("node:test");
const assert = require("node:assert/strict");
const { createMeaningPracticeRun, createPracticeDeck, getDeckEntryKeyAction, getSessionProgressState, nextReviewIndex, parseImportedDeck, prepareDefaultDeck, removeCardAt, romajiToHiragana, serializeDeck, shouldAutoConvertHiragana, shouldSkipHiraganaOnTab, shuffle, updateCardAt } = require("../deck-core.js");

test("imports previously exported dictionary-format JSON during the rename", () => {
  const legacy = { format: "japanese-cards-dictionary", version: 3, cards: [{ japanese: "neko", english: "cat" }] };
  assert.equal(parseImportedDeck(legacy, () => "legacy")[0].japanese, "neko");
});

test("imports the app's named dictionary format and trims card fields", () => {
  const cards = parseImportedDeck({
    format: "japanese-cards-deck",
    version: 1,
    name: "Travel words",
    cards: [{ japanese: "  eki  ", english: "  station\nExample: eki wa doko desu ka?  " }],
  }, (index) => `test-${index}`);

  assert.deepEqual(cards, [{
    id: "test-0",
    japanese: "eki",
    hiragana: "えき",
    english: "station\nExample: eki wa doko desu ka?",
    meanings: ["station\nExample: eki wa doko desu ka?"],
    examples: [{ romaji: "", hiragana: "", english: "" }],
  }]);
});

test("imports a plain array for hand-authored decks", () => {
  const cards = parseImportedDeck([{ japanese: "arigatou", english: "thank you" }], () => "test-id");
  assert.equal(cards[0].id, "test-id");
  assert.equal(cards[0].japanese, "arigatou");
  assert.equal(cards[0].hiragana, "ありがとう");
  assert.equal(cards[0].english, "thank you");
  assert.deepEqual(cards[0].meanings, ["thank you"]);
});

test("prepares a default deck with generated hiragana and the requested card count", () => {
  const source = {
    format: "japanese-cards-deck",
    version: 2,
    cards: [
      { japanese: "neko", english: "cat" },
      { japanese: "inu", meanings: ["dog", "a domestic animal"] },
      { japanese: "mizu", english: "water" },
    ],
  };

  const cards = prepareDefaultDeck(source, 2, (index) => `default-${index}`);

  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(({ japanese, hiragana }) => [japanese, hiragana]), [
    ["neko", "ねこ"],
    ["inu", "いぬ"],
  ]);
  assert.deepEqual(cards[1].meanings, ["dog", "a domestic animal"]);
});

test("rejects invalid default deck sizes and a source list that is too short", () => {
  const source = [{ japanese: "neko", english: "cat" }];
  for (const count of [0, -1, 1.5, "1", NaN]) {
    assert.throws(() => prepareDefaultDeck(source, count), /positive integer/);
  }
  assert.throws(() => prepareDefaultDeck(source, 2), /fewer cards/);
});

test("imports multiple English meanings, trimming and discarding blank entries", () => {
  const cards = parseImportedDeck([{
    japanese: "  hashi ",
    meanings: ["  chopsticks  ", "", "  bridge\nExample: hashio wataru  ", 42],
  }], () => "multi-id");

  assert.deepEqual(cards[0], {
    id: "multi-id",
    japanese: "hashi",
    hiragana: "はし",
    english: "chopsticks",
    meanings: ["chopsticks", "bridge\nExample: hashio wataru"],
    examples: [
      { romaji: "", hiragana: "", english: "" },
      { romaji: "", hiragana: "", english: "" },
    ],
  });
});

test("imports an English array and keeps duplicate meanings as separate entries", () => {
  const cards = parseImportedDeck([{ japanese: "neko", english: ["cat", "cat"] }], () => "cats");

  assert.deepEqual(cards[0].meanings, ["cat", "cat"]);
});

test("imports and trims an explicit hiragana field", () => {
  const cards = parseImportedDeck([
    { japanese: "  neko ", hiragana: "  ねこ  ", english: "cat" },
  ], () => "test-id");

  assert.equal(cards[0].hiragana, "ねこ");
});

test("exports edited hiragana with each card and preserves it on import", () => {
  const sourceCards = [{ japanese: "arigatou", hiragana: "ありがとー", english: "thank you (casual)" }];
  const json = serializeDeck(sourceCards, "Travel", "2026-11-02T12:00:00.000Z");
  const parsedJson = JSON.parse(json);

  assert.deepEqual(parsedJson.cards, [{
    japanese: "arigatou",
    hiragana: "ありがとー",
    examples: [{ romaji: "", hiragana: "", english: "" }],
    english: "thank you (casual)",
  }]);
  assert.equal(sourceCards[0].hiragana, "ありがとー");
  const importedCard = parseImportedDeck(parsedJson, () => "round-trip")[0];
  assert.equal(importedCard.hiragana, "ありがとー");
  assert.equal(importedCard.english, "thank you (casual)");
});

test("exports and reimports all edited meanings and aligned examples", () => {
  const sourceCards = [{
    japanese: "hashi",
    hiragana: "はし",
    english: "chopsticks",
    meanings: ["chopsticks", "bridge", "edge; used in this example"],
    examples: [
      { romaji: "hashi o tsukau.", hiragana: "はしをつかう。", english: "Use chopsticks." },
      { romaji: "hashi o wataru.", hiragana: "はしをわたる。", english: "Cross the bridge." },
      { romaji: "hashi no hashi.", hiragana: "はしのはし。", english: "The edge of the bridge." },
    ],
  }];
  const exported = JSON.parse(serializeDeck(sourceCards, "Travel", "2026-11-03T12:00:00.000Z"));

  assert.equal(exported.version, 3);
  assert.deepEqual(exported.cards, [{
    japanese: "hashi",
    hiragana: "はし",
    examples: sourceCards[0].examples,
    meanings: ["chopsticks", "bridge", "edge; used in this example"],
  }]);
  const imported = parseImportedDeck(exported, () => "round-trip")[0];
  assert.deepEqual(imported.meanings, sourceCards[0].meanings);
  assert.deepEqual(imported.examples, sourceCards[0].examples);
  assert.equal(imported.english, "chopsticks");
});

test("contextual word meanings survive default import and export", () => {
  const example = {
    romaji: "ame ga futte iru.", hiragana: "あめがふっている。", english: "It's raining.",
    wordMeanings: [
      { romaji: "ame", meaning: "rain", entryId: "00583_ame", senseNumber: 1 },
      { romaji: "ga", meaning: "subject marker", entryId: "00051_ga" },
      { romaji: "futte", meaning: "te-form of furu — to fall (rain)", entryId: "00473_furu" },
      { romaji: "iru", meaning: "continuing action", entryId: "00023_iru" },
    ],
  };
  const cards = parseImportedDeck({ format: "japanese-cards-deck", version: 3,
    cards: [{ japanese: "ga", english: "subject marker", examples: [example] }] }, () => "rain-card");
  assert.deepEqual(cards[0].examples[0].wordMeanings, example.wordMeanings);
  const exported = JSON.parse(serializeDeck(cards, "rain", "2026-11-05T00:00:00.000Z"));
  assert.deepEqual(exported.cards[0].examples[0].wordMeanings, example.wordMeanings);
  assert.deepEqual(parseImportedDeck(exported, () => "round-trip")[0].examples[0].wordMeanings, example.wordMeanings);
});

test("stale or incomplete contextual annotations are discarded as a unit", () => {
  const cards = parseImportedDeck([
    { japanese: "ame", english: "rain", examples: [{ romaji: "ame ga furu.", english: "It rains.",
      wordMeanings: [{ romaji: "ame", meaning: "rain" }, { romaji: "wa", meaning: "topic marker" }, { romaji: "furu", meaning: "to fall" }] }] },
    { japanese: "ame", english: "rain", examples: [{ romaji: "ame ga furu.", english: "It rains.",
      wordMeanings: [{ romaji: "ame", meaning: "rain" }, { romaji: "ga", meaning: "subject marker" }] }] },
  ], (index) => `card-${index}`);
  assert(!("wordMeanings" in cards[0].examples[0]));
  assert(!("wordMeanings" in cards[1].examples[0]));
});

test("imports partial examples by meaning index and generates missing example hiragana", () => {
  const imported = parseImportedDeck([{
    japanese: "neko",
    meanings: ["cat", "feline"],
    examples: [
      { romaji: "neko ga suki.", english: "I like cats." },
      { romaji: "", hiragana: "", english: "" },
      { romaji: "unused", hiragana: "よぶん", english: "ignored extra example" },
    ],
  }], () => "example-id")[0];

  assert.deepEqual(imported.examples, [
    { romaji: "neko ga suki.", hiragana: "ねこ が すき。", english: "I like cats." },
    { romaji: "", hiragana: "", english: "" },
  ]);
});

test("converts common gojuon and alternate Hepburn spellings", () => {
  const cases = [
    ["a i u e o", "あ い う え お"],
    ["kakikukeko", "かきくけこ"],
    ["sashisuseso", "さしすせそ"],
    ["tachitsuteto", "たちつてと"],
    ["naninuneno", "なにぬねの"],
    ["hahifuheho", "はひふへほ"],
    ["mamimumemo", "まみむめも"],
    ["yayuyo", "やゆよ"],
    ["rarirurero", "らりるれろ"],
    ["wawo", "わを"],
    ["gajizuzezo", "がじずぜぞ"],
    ["dadidudedo", "だぢづでど"],
    ["babibubebo", "ばびぶべぼ"],
    ["papipupepo", "ぱぴぷぺぽ"],
    ["si ti tu hu zi", "し ち つ ふ じ"],
  ];

  for (const [romaji, hiragana] of cases) {
    assert.equal(romajiToHiragana(romaji), hiragana, romaji);
  }
});

test("converts yoon digraphs and greedy syllables", () => {
  const cases = [
    ["kya kyu kyo", "きゃ きゅ きょ"],
    ["sha shu sho", "しゃ しゅ しょ"],
    ["cha chu cho", "ちゃ ちゅ ちょ"],
    ["nya nyu nyo", "にゃ にゅ にょ"],
    ["gya gyu gyo", "ぎゃ ぎゅ ぎょ"],
    ["ja ju jo", "じゃ じゅ じょ"],
    ["rya ryu ryo", "りゃ りゅ りょ"],
  ];

  for (const [romaji, hiragana] of cases) {
    assert.equal(romajiToHiragana(romaji), hiragana, romaji);
  }
});

test("handles geminated consonants, including Hepburn tch", () => {
  const cases = [
    ["gakkou", "がっこう"],
    ["kitte", "きって"],
    ["matcha", "まっちゃ"],
    ["meccha", "めっちゃ"],
    ["hassha", "はっしゃ"],
  ];

  for (const [romaji, hiragana] of cases) {
    assert.equal(romajiToHiragana(romaji), hiragana, romaji);
  }
});

test("handles syllabic n before consonants, vowels, y, and punctuation", () => {
  const cases = [
    ["kanji", "かんじ"],
    ["tenki", "てんき"],
    ["shinbun", "しんぶん"],
    ["konnichiwa", "こんにちは"],
    ["konbanwa", "こんばんは"],
    ["nani", "なに"],
    ["nya", "にゃ"],
    ["kin'en", "きんえん"],
    ["san, neko", "さん、 ねこ"],
  ];

  for (const [romaji, hiragana] of cases) {
    assert.equal(romajiToHiragana(romaji), hiragana, romaji);
  }
});

test("converts common punctuation and paired quotes in complete example sentences", () => {
  assert.equal(romajiToHiragana("Ohayou, Tokyo!"), "おはよう、 ときょ！");
  assert.equal(romajiToHiragana('"neko desu."'), "「ねこ です。」");
  assert.equal(romajiToHiragana("neko... inu? (dare)"), "ねこ… いぬ？ （だれ）");
  assert.equal(romajiToHiragana("neko: inu; sushi."), "ねこ： いぬ； すし。");
});

test("preserves spaces, existing Japanese text, and unsupported characters", () => {
  assert.equal(romajiToHiragana("  neko  "), "  ねこ  ");
  assert.equal(romajiToHiragana("ねこ"), "ねこ");
  assert.equal(romajiToHiragana("ko-hi-"), "こ-ひ-");
  assert.equal(romajiToHiragana(""), "");
  assert.equal(romajiToHiragana(null), "");
});

test("Tab from romaji skips hiragana, while Shift+Tab keeps normal backwards navigation", () => {
  assert.equal(shouldSkipHiraganaOnTab("Tab", false), true);
  assert.equal(shouldSkipHiraganaOnTab("Tab", true), false);
  assert.equal(shouldSkipHiraganaOnTab("Enter", false), false);
});

test("romaji edits auto-convert hiragana unless a manual value is present", () => {
  assert.equal(shouldAutoConvertHiragana(false, "てすと"), true);
  assert.equal(shouldAutoConvertHiragana(true, "てすと"), false);
  assert.equal(shouldAutoConvertHiragana(true, ""), true);
  assert.equal(shouldAutoConvertHiragana(true, "   "), true);
  assert.equal(shouldAutoConvertHiragana(false, null), true);
});

test("deck entry keyboard flow skips hiragana and supports repeated meanings and cards", () => {
  assert.equal(getDeckEntryKeyAction("Tab", false, "japanese"), "focus-meaning");
  assert.equal(getDeckEntryKeyAction("Tab", true, "japanese"), null);
  assert.equal(getDeckEntryKeyAction("Tab", false, "meaning", 0, 1), "add-meaning");
  assert.equal(getDeckEntryKeyAction("Tab", false, "meaning", 0, 2), null);
  assert.equal(getDeckEntryKeyAction("Enter", false, "meaning", 0, 2), "focus-next-meaning");
  assert.equal(getDeckEntryKeyAction("Enter", false, "meaning", 1, 2), "add-card");
  assert.equal(getDeckEntryKeyAction("Enter", true, "meaning", 0, 1), null);
  assert.equal(getDeckEntryKeyAction("Escape", false, "meaning", 0, 1), null);
  assert.equal(getDeckEntryKeyAction("Enter", false, "hiragana", 0, 1), null);
});

test("rejects unsupported formats and versions", () => {
  assert.throws(
    () => parseImportedDeck({ format: "another-app", cards: [] }),
    /different deck format/,
  );
  assert.throws(
    () => parseImportedDeck({ format: "japanese-cards-deck", version: 4, cards: [] }),
    /version is not supported/,
  );
});

test("rejects cards without both a Japanese word and English translation", () => {
  assert.throws(() => parseImportedDeck([{ japanese: "neko", english: " " }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDeck([{ english: "cat" }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDeck({ cards: "not an array" }), /does not contain/);
  assert.throws(() => parseImportedDeck(null), /does not contain/);
});

test("rejects a multi-meaning card when every supplied meaning is blank", () => {
  assert.throws(
    () => parseImportedDeck([{ japanese: "neko", meanings: [" ", "\n"] }]),
    /Card 1 is missing/,
  );
});

test("shuffle returns a permutation without changing the source", () => {
  const source = ["a", "b", "c"];
  const shuffled = shuffle(source, () => 0);

  assert.deepEqual(source, ["a", "b", "c"]);
  assert.deepEqual([...shuffled].sort(), [...source].sort());
  assert.notDeepEqual(shuffled, source);
});

test("practice deck has the selected length and avoids repeats before exhausting cards", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];
  const deck = createPracticeDeck(cards, 7, () => 0);

  assert.equal(deck.length, 7);
  assert.ok(deck.every((card) => cards.includes(card)));
  assert.deepEqual(deck.slice(0, 3).sort((a, b) => a.japanese.localeCompare(b.japanese)), cards);
  for (let index = 1; index < deck.length; index += 1) {
    assert.notEqual(deck[index], deck[index - 1]);
  }
});

test("whole-deck deck includes every current card exactly once", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];
  const deck = createPracticeDeck(cards, cards.length, () => 0);

  assert.equal(deck.length, cards.length);
  assert.deepEqual([...deck].sort((a, b) => a.japanese.localeCompare(b.japanese)), cards);
});

test("progress is dark green through the current guess and leaves unseen cards unavailable", () => {
  const state = getSessionProgressState(5, 2, null, new Set([0, 1, 2]));

  assert.equal(state.darkPosition, 50);
  assert.equal(state.reviewWidth, 0);
  assert.deepEqual(state.points.map(({ isDark }) => isDark), [true, true, true, false, false]);
  assert.equal(state.points[2].isGuessing, true);
  assert.equal(state.points[3].isShown, false);
});

test("review splits progress at the selected card, then continues light green to the guess card", () => {
  const state = getSessionProgressState(5, 3, 1, new Set([0, 1, 2, 3]));

  assert.equal(state.darkPosition, 25);
  assert.equal(state.reviewPosition, 25);
  assert.equal(state.reviewWidth, 50);
  assert.deepEqual(state.points.map(({ isDark, isReviewRange }) => [isDark, isReviewRange]), [
    [true, false],
    [true, false],
    [false, true],
    [false, true],
    [false, false],
  ]);
  assert.equal(state.points[1].isReviewing, true);
  assert.equal(state.points[3].isGuessing, true);
  assert.equal(state.points[4].isShown, false);
});

test("reviewing the card directly before the guess keeps a one-step light segment", () => {
  const state = getSessionProgressState(4, 3, 2, [0, 1, 2, 3]);

  assert.ok(state.darkPosition < 100);
  assert.equal(state.reviewWidth, 100 - state.darkPosition);
  assert.equal(state.points[2].isReviewing, true);
  assert.equal(state.points[3].isReviewRange, true);
});

test("one-card progress avoids division edge cases and revealed cards stop showing guess mode", () => {
  const guessing = getSessionProgressState(1, 0, null, [0]);
  const revealed = getSessionProgressState(1, 0, null, [0], true);

  assert.equal(guessing.guessPosition, 0);
  assert.equal(guessing.darkPosition, 0);
  assert.equal(guessing.points[0].isGuessing, true);
  assert.equal(revealed.points[0].isGuessing, false);
});

test("review stepping advances through shown cards and stops at the current guess", () => {
  assert.equal(nextReviewIndex(null, 3), null);
  assert.equal(nextReviewIndex(0, 3), 1);
  assert.equal(nextReviewIndex(1, 3), 2);
  assert.equal(nextReviewIndex(2, 3), null);
  assert.throws(() => nextReviewIndex(3, 3), /must precede/);
  assert.throws(() => nextReviewIndex(-1, 3), /must precede/);
});

test("progress calculation rejects invalid session and review indices", () => {
  assert.throws(() => getSessionProgressState(0, 0, null, []), /at least one card/);
  assert.throws(() => getSessionProgressState(4, 4, null, []), /outside the session/);
  assert.throws(() => getSessionProgressState(4, 2, 2, [0, 1, 2]), /earlier session card/);
  assert.throws(() => getSessionProgressState(4, 2, null, "0,1,2"), /Set or array/);
  assert.throws(() => getSessionProgressState(4, 2, null, [0, 1, 4]), /Shown card index is outside/);
  assert.throws(() => getSessionProgressState(4, 2, null, [0, 1]), /must have been shown/);
});

test("rejects impossible session sizes and empty decks", () => {
  assert.throws(() => createPracticeDeck([], 1), /empty deck/);
  assert.throws(() => createPracticeDeck([{ japanese: "a" }], -1), /non-negative integer/);
  assert.deepEqual(createPracticeDeck([], 0), []);
});

test("English practice shows every meaning once per run, then resets for the next run", () => {
  const cards = [
    { japanese: "hashi", meanings: ["chopsticks", "bridge"] },
    { japanese: "neko", meanings: ["cat"] },
  ];
  const run = createMeaningPracticeRun(cards, () => 0);
  const firstRun = [run.draw(), run.draw(), run.draw()];

  assert.deepEqual(firstRun.map(({ card, meaning }) => `${card.japanese}:${meaning}`), [
    "hashi:chopsticks",
    "hashi:bridge",
    "neko:cat",
  ]);
  assert.equal(firstRun[0].runComplete, false);
  assert.equal(firstRun[1].runComplete, false);
  assert.equal(firstRun[2].runComplete, true);

  const nextRunDraw = run.draw();
  assert.equal(nextRunDraw.meaning, "chopsticks");
  assert.equal(nextRunDraw.runComplete, false);
});

test("English practice tracks duplicate meaning strings by their separate field positions", () => {
  const duplicateMeaningCard = { japanese: "neko", meanings: ["cat", "cat"] };
  const run = createMeaningPracticeRun([duplicateMeaningCard], () => 0);

  const first = run.draw();
  const second = run.draw();
  assert.equal(first.meaning, "cat");
  assert.equal(second.meaning, "cat");
  assert.equal(first.meaningIndex, 0);
  assert.equal(second.meaningIndex, 1);
  assert.equal(second.runComplete, true);
});

test("English practice rejects empty decks and cards without meanings", () => {
  assert.throws(() => createMeaningPracticeRun([]), /empty deck/);
  assert.throws(() => createMeaningPracticeRun([{ japanese: "neko", meanings: [] }]), /at least one English meaning/);
});

test("removes the selected card without changing the original list", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];

  assert.deepEqual(removeCardAt(cards, 1), [{ japanese: "a" }, { japanese: "c" }]);
  assert.deepEqual(cards, [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }]);
  assert.deepEqual(removeCardAt(cards, 99), cards);
});

test("updates romaji, hiragana, and English while preserving card identity and source data", () => {
  const cards = [
    { id: "card-1", japanese: "arigatou", hiragana: "ありがとう", english: "thank you" },
    { id: "card-2", japanese: "neko", hiragana: "ねこ", english: "cat" },
  ];
  const updatedCards = updateCardAt(cards, 0, {
    japanese: "arigatou gozaimasu",
    hiragana: "ありがとうございます",
    english: "thank you (polite)",
  });

  assert.deepEqual(updatedCards[0], {
    id: "card-1",
    japanese: "arigatou gozaimasu",
    hiragana: "ありがとうございます",
    english: "thank you (polite)",
  });
  assert.equal(updatedCards[1], cards[1]);
  assert.deepEqual(cards[0], { id: "card-1", japanese: "arigatou", hiragana: "ありがとう", english: "thank you" });
  assert.deepEqual(updateCardAt(cards, 10, { japanese: "ignored" }), cards);
});
