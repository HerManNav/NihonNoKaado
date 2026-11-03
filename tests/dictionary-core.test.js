const test = require("node:test");
const assert = require("node:assert/strict");
const { createMeaningPracticeRun, createPracticeDeck, parseImportedDictionary, removeCardAt, romajiToHiragana, serializeDictionary, shouldAutoConvertHiragana, shouldSkipHiraganaOnTab, shuffle, updateCardAt } = require("../dictionary-core.js");

test("imports the app's named dictionary format and trims card fields", () => {
  const cards = parseImportedDictionary({
    format: "japanese-cards-dictionary",
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
  }]);
});

test("imports a plain array for hand-authored dictionaries", () => {
  const cards = parseImportedDictionary([{ japanese: "arigatou", english: "thank you" }], () => "test-id");
  assert.equal(cards[0].id, "test-id");
  assert.equal(cards[0].japanese, "arigatou");
  assert.equal(cards[0].hiragana, "ありがとう");
  assert.equal(cards[0].english, "thank you");
  assert.deepEqual(cards[0].meanings, ["thank you"]);
});

test("imports multiple English meanings, trimming and discarding blank entries", () => {
  const cards = parseImportedDictionary([{
    japanese: "  hashi ",
    meanings: ["  chopsticks  ", "", "  bridge\nExample: hashio wataru  ", 42],
  }], () => "multi-id");

  assert.deepEqual(cards[0], {
    id: "multi-id",
    japanese: "hashi",
    hiragana: "はし",
    english: "chopsticks",
    meanings: ["chopsticks", "bridge\nExample: hashio wataru"],
  });
});

test("imports an English array and keeps duplicate meanings as separate entries", () => {
  const cards = parseImportedDictionary([{ japanese: "neko", english: ["cat", "cat"] }], () => "cats");

  assert.deepEqual(cards[0].meanings, ["cat", "cat"]);
});

test("imports and trims an explicit hiragana field", () => {
  const cards = parseImportedDictionary([
    { japanese: "  neko ", hiragana: "  ねこ  ", english: "cat" },
  ], () => "test-id");

  assert.equal(cards[0].hiragana, "ねこ");
});

test("exports edited hiragana with each card and preserves it on import", () => {
  const sourceCards = [{ japanese: "arigatou", hiragana: "ありがとー", english: "thank you (casual)" }];
  const json = serializeDictionary(sourceCards, "Travel", "2026-11-02T12:00:00.000Z");
  const parsedJson = JSON.parse(json);

  assert.deepEqual(parsedJson.cards, [{ japanese: "arigatou", hiragana: "ありがとー", english: "thank you (casual)" }]);
  assert.equal(sourceCards[0].hiragana, "ありがとー");
  const importedCard = parseImportedDictionary(parsedJson, () => "round-trip")[0];
  assert.equal(importedCard.hiragana, "ありがとー");
  assert.equal(importedCard.english, "thank you (casual)");
});

test("exports and reimports all edited meanings", () => {
  const sourceCards = [{
    japanese: "hashi",
    hiragana: "はし",
    english: "chopsticks",
    meanings: ["chopsticks", "bridge", "edge; used in this example"],
  }];
  const exported = JSON.parse(serializeDictionary(sourceCards, "Travel", "2026-11-03T12:00:00.000Z"));

  assert.equal(exported.version, 2);
  assert.deepEqual(exported.cards, [{
    japanese: "hashi",
    hiragana: "はし",
    meanings: ["chopsticks", "bridge", "edge; used in this example"],
  }]);
  const imported = parseImportedDictionary(exported, () => "round-trip")[0];
  assert.deepEqual(imported.meanings, sourceCards[0].meanings);
  assert.equal(imported.english, "chopsticks");
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
    ["san, neko", "さん, ねこ"],
  ];

  for (const [romaji, hiragana] of cases) {
    assert.equal(romajiToHiragana(romaji), hiragana, romaji);
  }
});

test("preserves spaces, punctuation, existing Japanese text, and unsupported characters", () => {
  assert.equal(romajiToHiragana("Ohayou, Tokyo!"), "おはよう, ときょ!");
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

test("rejects unsupported formats and versions", () => {
  assert.throws(
    () => parseImportedDictionary({ format: "another-app", cards: [] }),
    /different dictionary format/,
  );
  assert.throws(
    () => parseImportedDictionary({ format: "japanese-cards-dictionary", version: 3, cards: [] }),
    /version is not supported/,
  );
});

test("rejects cards without both a Japanese word and English translation", () => {
  assert.throws(() => parseImportedDictionary([{ japanese: "neko", english: " " }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDictionary([{ english: "cat" }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDictionary({ cards: "not an array" }), /does not contain/);
  assert.throws(() => parseImportedDictionary(null), /does not contain/);
});

test("rejects a multi-meaning card when every supplied meaning is blank", () => {
  assert.throws(
    () => parseImportedDictionary([{ japanese: "neko", meanings: [" ", "\n"] }]),
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

test("whole-dictionary deck includes every current card exactly once", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];
  const deck = createPracticeDeck(cards, cards.length, () => 0);

  assert.equal(deck.length, cards.length);
  assert.deepEqual([...deck].sort((a, b) => a.japanese.localeCompare(b.japanese)), cards);
});

test("rejects impossible session sizes and empty dictionaries", () => {
  assert.throws(() => createPracticeDeck([], 1), /empty dictionary/);
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

test("English practice rejects empty dictionaries and cards without meanings", () => {
  assert.throws(() => createMeaningPracticeRun([]), /empty dictionary/);
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
