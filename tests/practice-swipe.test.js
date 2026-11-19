const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const root = join(__dirname, "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const language = readFileSync(join(root, "language.js"), "utf8");

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in app.js`);
  const open = app.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    else if (app[index] === "}" && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`Could not find end of ${name}`);
}

class FakeElement {
  constructor() {
    this.classes = new Set();
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
    this.rect = { width: 320, height: 280 };
    this.disabled = false;
    this.listeners = {};
    this.childNodes = [];
    this.dataset = {};
    this._textContent = "";
    this.hidden = false;
    this.attributes = {};
  }
  set textContent(value) { this._textContent = String(value); this.childNodes = []; }
  get textContent() { return this._textContent + this.childNodes.map((child) => child.textContent || "").join(""); }
  replaceChildren(...children) { this.childNodes = children; }
  append(...children) { this.childNodes.push(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  get classList() {
    return { add: (...items) => items.forEach((item) => this.classes.add(item)), remove: (...items) => items.forEach((item) => this.classes.delete(item)), contains: (item) => this.classes.has(item), toggle: (item, force) => { const add = force === undefined ? !this.classes.has(item) : force; if (add) this.classes.add(item); else this.classes.delete(item); return add; } };
  }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture() {}
}

function makeHarness() {
  let nextTimer = 0;
  const timers = new Map();
  const stored = new Map();
  const flashcard = new FakeElement();
  const context = vm.createContext({
    Element: FakeElement,
    LEARNING_KEY: "japanese-cards.learning.v2",
    DECK_IDENTITY_KEY: "japanese-cards.deck-identity.v1",
    fingerprintRegistrationSequence: 0,
    fingerprintRegistrationByContent: Object.create(null),
    pendingFingerprintRegistrations: new Map(),
    flashcard,
    window: { setTimeout(fn, delay = 0) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, matchMedia: () => ({ matches: false }) },
    setTimeout: (...args) => context.window.setTimeout(...args),
    clearTimeout: (...args) => context.window.clearTimeout(...args),
    localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    wordTranslationPopup: { hidden: true },
    suppressFlashcardClick: false,
    suppressFlashcardClickTimeout: null,
    lastTappedRomajiToken: null,
    lastTappedRomajiTokenTimeout: null,
    deniedSwipeFeedbackTimeout: null,
    advancingPractice: false,
    screens: { practice: { hidden: false } },
    practiceAdvanceTimer: null,
    correctConfirmationTimer: null,
    correctConfirmationGeneration: 0,
    flipUnlockTimer: null,
    flipGeneration: 0,
    practiceAdvanceGeneration: 0,
    rememberPopupDismissTap: false,
    reviewIndex: null,
    practicePhase: "guessing",
    answerRevealed: false,
    practiceIndex: 0,
    practiceTarget: 3,
    practiceDeck: [{ japanese: "neko", meanings: ["cat"] }],
    attemptGrades: [null, null, null],
    sessionDeckId: "deck:test",
    activeDeckId: "deck:test",
    deckIdentity: { version: 1, activeDeckId: "deck:test", fingerprints: Object.create(null) },
    fingerprintDeck: async () => "a".repeat(64),
    makeDeckId: (prefix) => `${prefix}:generated`,
    sessionDirection: "japanese",
    originLanguage: { value: "japanese" },
    commitLearning(_card, grade) { context.lastCommit = { grade, deckId: context.sessionDeckId, direction: context.sessionDirection }; },
    showSwipeDeniedFeedback() { context.denied = true; },
    navigateWithFlashcardSwipe(direction) { context.navigated = direction; return true; },
    commitCurrentMiss() { context.missCount = (context.missCount || 0) + 1; return true; },
    advancePractice() { context.advanceCalled = (context.advanceCalled || 0) + 1; },
    resetFlashcardDrag() { context.flashcardDrag = null; flashcard.classList.remove("is-dragging"); flashcard.classList.add("is-drag-snap"); },
    clearFlashcardDragStyles() {},
    wordPopupBlocksCardAdvance: false,
    hideWordTranslationPopup() {},
    summaryCorrect: new FakeElement(),
    summaryMissedList: new FakeElement(),
    practiceSummary: new FakeElement(),
    rememberLaterButton: new FakeElement(),
    finishPracticeAdvance() { context.advanceCalled = (context.advanceCalled || 0) + 1; },
    document: {
      querySelector: () => new FakeElement(),
      createElement: () => new FakeElement(),
    },
  });
  ["normalizeDeckWord", "isValidDeckId", "persistActiveDeckIdentity", "loadDeckIdentity", "defaultDeckIdentityId", "canonicalDeckContent", "startFlashcardDrag", "moveFlashcardDrag", "endFlashcardDrag", "cancelFlashcardDrag", "commitCurrentGrade", "confirmCurrentCorrect", "finishCorrectConfirmation", "transitionFlashcardSwipe", "advancePractice", "cancelPracticeTimers", "handleFlashcardAction", "handleRememberLaterAction", "renderPracticeSummary", "loadLearningStore", "saveLearningStore", "learningWeightFromStore", "commitLearning", "migrateLearningKey"].forEach((name) => vm.runInContext(functionSource(name), context));
  context.commitLearning = (_card, grade) => { context.lastCommit = { grade, deckId: context.sessionDeckId, direction: context.sessionDirection }; };
  return { context, flashcard, timers, stored };
}

function pointer(context, type, x, y, target = {}) {
  return { pointerId: 1, pointerType: type, clientX: x, clientY: y, target, isPrimary: true, button: 0, cancelable: true, preventDefault() {} };
}

test("a left swipe on a revealed card grades once and starts only the 190ms exit", () => {
  const { context, flashcard, timers } = makeHarness();
  context.practicePhase = "revealed";
  context.event = pointer(context, "touch", 160, 140);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 80, 130);
  vm.runInContext("moveFlashcardDrag(event)", context);
  assert.equal(vm.runInContext("flashcardDrag.axis", context), "horizontal");
  assert.equal(flashcard.style["--drag-x"], "-80px");
  context.event = pointer(context, "touch", 80, 130);
  vm.runInContext("endFlashcardDrag(event)", context);
  assert.equal(context.attemptGrades[0], "correct");
  assert.equal(context.lastCommit.grade, "correct");
  assert.equal(context.navigated, undefined);
  assert.equal(vm.runInContext("practicePhase", context), "exiting");
  assert.equal(flashcard.classList.contains("is-dragging"), false);
  assert.equal(flashcard.classList.contains("is-drag-snap"), false);
  assert.equal(context.correctConfirmationTimer, null);
  assert.equal([...timers.values()].filter(({ delay }) => delay === 190).length, 1);
  assert.equal([...timers.values()].some(({ delay }) => delay === 360 || delay === 150), false);
  assert.equal(flashcard.classList.contains("is-swipe-exit-left"), true);
});

test("a revealed-card click confirms with 360ms pulse, 150ms hold, and 190ms exit", () => {
  const click = makeHarness();
  click.context.practicePhase = "revealed";
  vm.runInContext("handleFlashcardAction()", click.context);
  let timer = click.timers.get(click.context.correctConfirmationTimer);
  assert.equal(timer.delay, 360);
  timer.fn();
  timer = click.timers.get(click.context.correctConfirmationTimer);
  assert.equal(timer.delay, 150);
  timer.fn();
  const exit = [...click.timers.values()].at(-1);
  assert.equal(exit.delay, 190);
  exit.fn();
  assert.equal(click.context.advanceCalled, 1);

  const swipe = makeHarness();
  swipe.context.practicePhase = "revealed";
  swipe.context.event = pointer(swipe.context, "touch", 160, 140);
  vm.runInContext("startFlashcardDrag(event)", swipe.context);
  swipe.context.event = pointer(swipe.context, "touch", 80, 130);
  vm.runInContext("moveFlashcardDrag(event)", swipe.context);
  swipe.context.event = pointer(swipe.context, "touch", 80, 130);
  vm.runInContext("endFlashcardDrag(event)", swipe.context);
  assert.equal(swipe.context.attemptGrades[0], "correct");
  assert.equal(vm.runInContext("practicePhase", swipe.context), "exiting");
  assert.equal([...swipe.timers.values()].at(-1).delay, 190);
  assert.equal(swipe.context.lastCommit.grade, click.context.lastCommit.grade);
});

test("short and cancelled horizontal swipes do not grade", () => {
  const { context } = makeHarness();
  context.practicePhase = "revealed";
  context.event = pointer(context, "touch", 160, 140);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 120, 140);
  vm.runInContext("moveFlashcardDrag(event)", context);
  vm.runInContext("endFlashcardDrag(event)", context);
  assert.equal(context.attemptGrades[0], null);
  context.event = pointer(context, "touch", 160, 140);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 80, 140);
  vm.runInContext("moveFlashcardDrag(event)", context);
  vm.runInContext("cancelFlashcardDrag(event)", context);
  assert.equal(context.attemptGrades[0], null);
});

test("review left and right swipes stay ungraded", () => {
  const { context } = makeHarness();
  context.reviewIndex = 1;
  context.practiceIndex = 2;
  context.event = pointer(context, "touch", 160, 140);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 80, 130);
  vm.runInContext("moveFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 80, 130);
  vm.runInContext("endFlashcardDrag(event)", context);
  assert.equal(context.navigated, -1);
  assert.equal(context.attemptGrades[0], null);
  context.navigated = undefined;
  context.event = pointer(context, "touch", 160, 140);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 240, 130);
  vm.runInContext("moveFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 240, 130);
  vm.runInContext("endFlashcardDrag(event)", context);
  assert.equal(context.navigated, 1);
  assert.equal(context.attemptGrades[0], null);
});

test("revealed vertical drag commits a miss only at threshold; cancel and short drag do not", () => {
  const { context } = makeHarness();
  context.practicePhase = "revealed";
  context.event = pointer(context, "touch", 160, 100);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 160, 200);
  vm.runInContext("moveFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 160, 200);
  vm.runInContext("cancelFlashcardDrag(event)", context);
  assert.equal(context.missCount || 0, 0);
  context.event = pointer(context, "touch", 160, 100);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 160, 179);
  vm.runInContext("moveFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 160, 179);
  vm.runInContext("endFlashcardDrag(event)", context);
  assert.equal(context.missCount || 0, 0);
  context.event = pointer(context, "touch", 160, 100);
  vm.runInContext("startFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 160, 190);
  vm.runInContext("moveFlashcardDrag(event)", context);
  context.event = pointer(context, "touch", 160, 190);
  vm.runInContext("endFlashcardDrag(event)", context);
  assert.equal(context.missCount, 1);
  assert.equal(context.attemptGrades[0], null, "the stubbed miss action leaves grading to its guard");
});

test("grade guard uses the session direction and refuses review or duplicate commits", () => {
  const { context } = makeHarness();
  context.practicePhase = "revealed";
  context.reviewIndex = 0;
  vm.runInContext("commitCurrentGrade('correct')", context);
  assert.equal(context.attemptGrades[0], null, "review never commits a grade");
  context.reviewIndex = null;
  vm.runInContext("commitCurrentGrade('correct')", context);
  assert.equal(context.attemptGrades[0], "correct");
  assert.equal(context.lastCommit.deckId, "deck:test");
  assert.equal(context.lastCommit.direction, "japanese");
  vm.runInContext("commitCurrentGrade('incorrect')", context);
  assert.equal(context.attemptGrades[0], "correct");
});

test("practice exit timers cannot advance after leaving practice", () => {
  const { context, timers } = makeHarness();
  context.rememberLaterButton.classList.add("is-active");
  context.advanced = false;
  vm.runInContext("transitionFlashcardSwipe(-1, () => { advanced = true })", context);
  assert.equal(context.rememberLaterButton.disabled, true);
  assert.equal(context.rememberLaterButton.classList.contains("is-active"), false);
  const callback = [...timers.values()][0].fn;
  vm.runInContext("cancelPracticeTimers()", context);
  callback();
  assert.equal(context.advanced, false);
  assert.equal(vm.runInContext("practiceAdvanceTimer", context), null);
});

test("correct confirmation pulses 360ms, holds 150ms, then exits for 190ms once", () => {
  const { context, flashcard, timers } = makeHarness();
  context.practicePhase = "revealed";
  vm.runInContext("confirmCurrentCorrect()", context);
  assert.equal(vm.runInContext("practicePhase", context), "confirmingCorrect");
  assert.equal(vm.runInContext("attemptGrades[0]", context), "correct");
  const blink = timers.get(context.correctConfirmationTimer);
  assert.equal(blink.delay, 360);
  blink.fn();
  assert.equal(flashcard.classList.contains("is-correct-hold"), true);
  const hold = timers.get(context.correctConfirmationTimer);
  assert.equal(hold.delay, 150);
  hold.fn();
  const exit = [...timers.values()].at(-1);
  assert.equal(exit.delay, 190);
  exit.fn();
  assert.equal(context.advanceCalled, 1);
});

test("reduced motion keeps the correct confirmation visible for 510ms before one exit", () => {
  const { context, flashcard, timers } = makeHarness();
  context.practicePhase = "revealed";
  context.window.matchMedia = () => ({ matches: true });
  vm.runInContext("confirmCurrentCorrect()", context);
  assert.equal(flashcard.classList.contains("is-correct-hold"), true);
  const confirmation = timers.get(context.correctConfirmationTimer);
  assert.equal(confirmation.delay, 510);
  confirmation.fn();
  const exit = [...timers.values()].at(-1);
  assert.equal(exit.delay, 190);
  exit.fn();
  assert.equal(context.advanceCalled, 1);
});

test("Remember me later dismisses an open token popup before grading", () => {
  const { context } = makeHarness();
  context.practicePhase = "revealed";
  context.wordPopupBlocksCardAdvance = true;
  context.wordTranslationPopup.hidden = false;
  context.rememberPopupDismissTap = true;
  context.event = { preventDefault() { context.prevented = true; } };
  vm.runInContext("handleRememberLaterAction(event)", context);
  assert.equal(context.missCount || 0, 0);
  assert.equal(context.wordPopupBlocksCardAdvance, false);
  assert.equal(context.prevented, true);
  context.wordTranslationPopup.hidden = true;
  vm.runInContext("handleRememberLaterAction(event)", context);
  assert.equal(context.missCount, 1);
});

test("summary counts grades and keeps every repeated missed attempt", () => {
  const { context } = makeHarness();
  context.practiceTarget = 4;
  context.attemptGrades = ["correct", "incorrect", null, "incorrect"];
  context.practiceDeck = [
    { japanese: "inu", hiragana: "いぬ", meanings: ["dog"] },
    { japanese: "neko", hiragana: "ねこ", meanings: ["cat"] },
    { japanese: "tori", hiragana: "とり", meanings: ["bird"] },
    { japanese: "inu", hiragana: "いぬ", meanings: ["dog"] },
  ];
  vm.runInContext("renderPracticeSummary()", context);
  assert.equal(context.summaryCorrect.textContent, "1 / 4 correct");
  assert.equal(context.summaryMissedList.childNodes.length, 2);
  assert.equal(context.summaryMissedList.childNodes[0].childNodes[0].textContent, "neko");
  assert.equal(context.summaryMissedList.childNodes[1].childNodes[0].textContent, "inu");
  context.attemptGrades = ["correct"];
  context.practiceTarget = 1;
  vm.runInContext("renderPracticeSummary()", context);
  assert.equal(context.summaryMissedList.childNodes[0].textContent, "No failed cards.");
});

test("direction histories stay separate and Japanese key edits migrate both buckets", () => {
  const { context, stored } = makeHarness();
  stored.set("japanese-cards.learning.v2", JSON.stringify({ version: 2, decks: {
    "deck:test": {
      japanese: { inu: { correct: 1, incorrect: 4 } },
      english: { inu: { correct: 3, incorrect: 4 } },
    },
  } }));
  vm.runInContext("practiceDeck[0].japanese = 'inu'", context);
  assert.equal(vm.runInContext("learningWeightFromStore(practiceDeck[0], loadLearningStore(), 'deck:test', 'japanese')", context), 4);
  assert.equal(vm.runInContext("learningWeightFromStore(practiceDeck[0], loadLearningStore(), 'deck:test', 'english')", context), 2);
  vm.runInContext("migrateLearningKey('inu', 'dog')", context);
  const result = JSON.parse(stored.get("japanese-cards.learning.v2"));
  assert.deepEqual(result.decks["deck:test"].japanese.dog, { correct: 1, incorrect: 4 });
  assert.deepEqual(result.decks["deck:test"].english.dog, { correct: 3, incorrect: 4 });
});

test("legacy unsplit learning is ignored and grade storage accepts prototype-like words safely", () => {
  const { context, stored } = makeHarness();
  vm.runInContext(functionSource("commitLearning"), context);
  stored.set("japanese-cards.learning.v2", JSON.stringify({ version: 1, decks: { "deck:test": { inu: { correct: 8, incorrect: 0 } } } }));
  assert.equal(vm.runInContext("Object.keys(loadLearningStore().decks).length", context), 0);
  context.practiceDeck = [{ japanese: "__proto__", meanings: ["prototype"] }];
  vm.runInContext("sessionDirection = 'english'; commitLearning(practiceDeck[0], 'incorrect')", context);
  const result = JSON.parse(stored.get("japanese-cards.learning.v2"));
  assert.deepEqual(result.decks["deck:test"].english.__proto__, { correct: 0, incorrect: 1 });
});

test("deck identities reuse exact-content aliases, explicit IDs, and language-specific defaults", async () => {
  const { context, stored } = makeHarness();
  const resolveDeckId = await vm.runInContext(`(async () => { async ${functionSource("resolveDeckId")} return resolveDeckId; })()`, context);
  context.deckIdentity.fingerprints["a".repeat(64)] = "custom:known";
  assert.equal(await resolveDeckId([], null), "custom:known");
  assert.equal(await resolveDeckId([], "portable:exported"), "portable:exported");
  context.fingerprintDeck = async () => "b".repeat(64);
  assert.equal(await resolveDeckId([], null), "custom:generated");
  assert.equal(vm.runInContext("defaultDeckIdentityId('english/most-common-50.json')", context), "default:english/most-common-50.json");
  assert.equal(vm.runInContext("defaultDeckIdentityId('spanish/most-common-50-es.json')", context), "default:spanish/most-common-50-es.json");
  vm.runInContext("activeDeckId = 'legacy:stable'; persistActiveDeckIdentity(activeDeckId)", context);
  const identity = JSON.parse(stored.get("japanese-cards.deck-identity.v1"));
  assert.equal(identity.activeDeckId, "legacy:stable");
  stored.set("japanese-cards.deck-identity.v1", JSON.stringify(identity));
  assert.equal(vm.runInContext("loadDeckIdentity().activeDeckId", context), "legacy:stable");
});

test("an ID-free exact reimport waits for the current saved-deck fingerprint", async () => {
  const { context } = makeHarness();
  let releaseHash;
  context.fingerprintDeck = () => new Promise((resolve) => { releaseHash = resolve; });
  const helpers = await vm.runInContext(`(async () => { async ${functionSource("registerDeckFingerprint")} async ${functionSource("resolveDeckId")} return { registerDeckFingerprint, resolveDeckId }; })()`, context);
  const cards = [{ japanese: "inu", hiragana: "いぬ", meanings: ["dog"], examples: [] }];
  const registering = helpers.registerDeckFingerprint(cards, "custom:existing");
  const resolving = helpers.resolveDeckId(cards, null);
  context.fingerprintDeck = async () => "c".repeat(64);
  releaseHash("c".repeat(64));
  await registering;
  assert.equal(await resolving, "custom:existing");
});

test("feedback layout, miss action, summary, and responsive gesture affordances exist", () => {
  assert.match(app, /transitionend[\s\S]*finishFlip\(flipGeneration\)/);
  assert.match(app, /rememberLaterButton\.addEventListener\("click", handleRememberLaterAction\)/);
  assert.match(app, /practicePhase = "summary"/);
  assert.match(html, /id="practice-summary"/);
  assert.ok(html.indexOf('id="flashcard"') < html.indexOf('class="session-progress"'));
  assert.ok(html.indexOf('class="session-progress"') < html.indexOf('id="remember-later-button"'));
  assert.match(html, /class="remember-later-button" type="button" disabled/);
  assert.match(html, /<button id="remember-later-button" class="remember-later-button" type="button" disabled>\s*Remember me later\s*<\/button>/);
  assert.doesNotMatch(html, /remember-later-arrow|remember-later-copy|Drag the revealed card down here/);
  assert.doesNotMatch(html, /practice-action-slot/);
  assert.match(styles, /\.session-progress \{ width: 100%; margin-top: 18px; \}/);
  assert.match(styles, /\.remember-later-button \{[\s\S]*?justify-content: center[\s\S]*?min-height: 144px[\s\S]*?text-align: center/);
  assert.match(styles, /\.summary-missed-list \{[^\n]*text-align: center/);
  assert.match(styles, /\.summary-missed-list li \{[^\n]*text-align: center/);
  assert.match(app, /rememberLaterButton\.disabled = !canRememberLater/);
  assert.match(app, /--drop-lift/);
  assert.doesNotMatch(app, /summaryDetail|incorrect · .* skipped/);
  assert.doesNotMatch(html, /summary-detail|practice-credit/);
  assert.match(html, /<h2 id="summary-missed-title">Failed cards<\/h2>/);
  assert.match(html, /<p class="subtle-text">Romaji meanings use <a href="https:\/\/www\.edrdg\.org\//);
  assert.match(language, /"Failed cards": "Tarjetas falladas"/);
  assert.match(language, /"No failed cards\.": "No hay tarjetas falladas\."/);
  assert.doesNotMatch(language, /incorrect · .* skipped/);
  assert.match(app, /setTimeout\(\(\) => finishCorrectConfirmation\(generation\), 510\)/);
  assert.match(app, /if \(generation !== correctConfirmationGeneration\) return;[\s\S]*?setTimeout\(\(\) => finishCorrectConfirmation\(generation\), 150\);[\s\S]*?\}, 360\)/);
  assert.match(styles, /reveal-blip 360ms/);
  assert.match(app, /flashcard\.classList\.add\("is-render-reset"\)/);
  assert.match(app, /flashcard\.classList\.remove\("is-render-reset"\);\s*void flashcardInner\.offsetWidth;\s*flashcard\.classList\.add\("is-flipped"\)/);
  assert.match(styles, /\.flashcard\.is-render-reset \.flashcard-inner \{ transition: none; \}/);
  assert.match(styles, /touch-action:\s*none/);
  assert.match(styles, /\.flashcard\.is-swipe-exit-down/);
  assert.match(styles, /button:disabled[^\n]*\n\.flashcard:disabled \{ cursor: default; opacity: 1; \}/);
  assert.doesNotMatch(styles, /\.flashcard\.is-swipe-exit-left, \.flashcard\.is-swipe-exit-right \{ opacity:/);
  assert.doesNotMatch(styles, /@keyframes swipe-enter-from-(left|right) \{ from \{ opacity:/);
});
