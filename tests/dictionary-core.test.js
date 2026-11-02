const test = require("node:test");
const assert = require("node:assert/strict");
const { createPracticeDeck, parseImportedDictionary, removeCardAt, romajiToHiragana, serializeDictionary, shuffle } = require("../dictionary-core.js");

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
  }]);
});

test("imports a plain array for hand-authored dictionaries", () => {
  const cards = parseImportedDictionary([{ japanese: "arigatou", english: "thank you" }], () => "test-id");
  assert.equal(cards[0].id, "test-id");
  assert.equal(cards[0].japanese, "arigatou");
  assert.equal(cards[0].hiragana, "ありがとう");
  assert.equal(cards[0].english, "thank you");
});

test("imports and trims an explicit hiragana field", () => {
  const cards = parseImportedDictionary([
    { japanese: "  neko ", hiragana: "  ねこ  ", english: "cat" },
  ], () => "test-id");

  assert.equal(cards[0].hiragana, "ねこ");
});

test("exports only romaji and English fields, then regenerates hiragana on import", () => {
  const sourceCards = [{ japanese: "arigatou", hiragana: "ありがとう", english: "thank you" }];
  const json = serializeDictionary(sourceCards, "Travel", "2026-11-02T12:00:00.000Z");
  const parsedJson = JSON.parse(json);

  assert.deepEqual(parsedJson.cards, [{ japanese: "arigatou", english: "thank you" }]);
  assert.equal(Object.hasOwn(parsedJson.cards[0], "hiragana"), false);
  assert.equal(sourceCards[0].hiragana, "ありがとう");
  assert.equal(parseImportedDictionary(parsedJson, () => "round-trip")[0].hiragana, "ありがとう");
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

test("rejects unsupported formats and versions", () => {
  assert.throws(
    () => parseImportedDictionary({ format: "another-app", cards: [] }),
    /different dictionary format/,
  );
  assert.throws(
    () => parseImportedDictionary({ format: "japanese-cards-dictionary", version: 2, cards: [] }),
    /version is not supported/,
  );
});

test("rejects cards without both a Japanese word and English translation", () => {
  assert.throws(() => parseImportedDictionary([{ japanese: "neko", english: " " }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDictionary([{ english: "cat" }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDictionary({ cards: "not an array" }), /does not contain/);
  assert.throws(() => parseImportedDictionary(null), /does not contain/);
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

test("removes the selected card without changing the original list", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];

  assert.deepEqual(removeCardAt(cards, 1), [{ japanese: "a" }, { japanese: "c" }]);
  assert.deepEqual(cards, [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }]);
  assert.deepEqual(removeCardAt(cards, 99), cards);
});
