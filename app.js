const STORAGE_KEY = "japanese-cards.deck.v1";
const LEGACY_STORAGE_KEY = "japanese-cards.dictionary.v1";
const CONTEXT_ANNOTATION_MIGRATION_KEY = "japanese-cards.context-annotation-migration.v1";
const DECK_IDENTITY_KEY = "japanese-cards.deck-identity.v1";
const LEARNING_KEY = "japanese-cards.learning.v2";
const { parseImportedDeck, prepareDefaultDeck, serializeDeck, normalizeWordMeanings, romajiToHiragana, searchDeckCards, shouldSkipHiraganaOnTab, shouldAutoConvertHiragana, createPracticeDeck, createMeaningPracticeRun, getSessionProgressState, nextReviewIndex, removeCardAt, updateCardAt } = window.JapaneseCardsCore;
const { findWordMeanings } = window.JapaneseWordFormLookup;
document.documentElement.classList.toggle("native-app", Boolean(window.Capacitor?.isNativePlatform?.()));

const screens = {
  home: document.querySelector("#home-screen"),
  practice: document.querySelector("#practice-screen"),
  deck: document.querySelector("#deck-screen"),
  defaults: document.querySelector("#default-decks-screen"),
  defaultConfirm: document.querySelector("#default-deck-confirm-screen"),
  add: document.querySelector("#add-screen"),
  clear: document.querySelector("#clear-screen"),
  settings: document.querySelector("#settings-screen"),
  about: document.querySelector("#about-screen"),
  export: document.querySelector("#export-screen"),
};

const startButton = document.querySelector("#start-button");
const originLanguage = document.querySelector("#origin-language");
const deckCount = document.querySelector("#deck-count");
const deckListCount = document.querySelector("#deck-list-count");
const wordList = document.querySelector("#word-list");
const cardForm = document.querySelector("#card-form");
const japaneseInput = document.querySelector("#japanese-word");
const hiraganaInput = document.querySelector("#hiragana-word");
const englishMeanings = document.querySelector("#english-meanings");
const formTitle = document.querySelector("#form-title");
const formSubmitButton = cardForm.querySelector("[type='submit']");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const backToLearningButton = document.querySelector("#back-to-learning-button");
const addFeedback = document.querySelector("#add-feedback");
const enterHint = document.querySelector("#enter-hint");
const overwriteDialog = document.querySelector("#overwrite-dialog");
let pendingOverwrite = null;

function normalizeDeckWord(value) {
  return String(value).trim().toLowerCase();
}

function requestCardOverwrite(japanese, save) {
  if (overwriteDialog.open) return;
  const index = cards.findIndex((card) => normalizeDeckWord(card.japanese) === normalizeDeckWord(japanese));
  if (index === -1) { save(-1); return; }
  document.querySelector("#overwrite-word").textContent = cards[index].japanese;
  overwriteDialog.returnValue = "cancel";
  pendingOverwrite = () => save(index);
  overwriteDialog.showModal();
}

overwriteDialog.addEventListener("close", () => {
  const save = pendingOverwrite;
  pendingOverwrite = null;
  if (overwriteDialog.returnValue === "overwrite") save?.();
});

function renderDeckSearchWord(element, text, ranges) {
  element.replaceChildren();
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) element.append(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement("mark");
    mark.className = "deck-search-match";
    mark.textContent = text.slice(start, end);
    element.append(mark);
    cursor = end;
  }
  if (cursor < text.length) element.append(document.createTextNode(text.slice(cursor)));
}

function filterDeckList(value) {
  const query = normalizeDeckWord(value);
  const results = searchDeckCards(cards, value);
  const resultByIndex = new Map(results.map((result) => [result.index, result]));
  const rows = [...wordList.querySelectorAll(".word-row[data-card-index]")];
  const rowByIndex = new Map(rows.map((row) => [Number(row.dataset.cardIndex), row]));
  for (const row of rows) {
    const index = Number(row.dataset.cardIndex);
    const result = resultByIndex.get(index);
    row.hidden = !result;
    const strong = row.querySelector(".japanese-word-display strong");
    if (strong) renderDeckSearchWord(strong, cards[index].japanese, result?.ranges || []);
  }
  for (const result of results) {
    const row = rowByIndex.get(result.index);
    if (row) wordList.insertBefore(row, wordList.querySelector(".deck-search-empty"));
  }
  rows.filter((row) => !resultByIndex.has(Number(row.dataset.cardIndex)))
    .sort((left, right) => Number(left.dataset.cardIndex) - Number(right.dataset.cardIndex))
    .forEach((row) => wordList.insertBefore(row, wordList.querySelector(".deck-search-empty")));
  const count = results.length;
  deckListCount.textContent = query ? `${count} / ${cards.length}` : (count === 1 ? "1 word" : `${count} words`);
  wordList.querySelector(".deck-search-empty").hidden = results.length > 0;
}

function renderAddDeckMatches() {
  const suggestions = document.querySelector("#add-spelling-suggestions");
  suggestions.hidden = true;
  suggestions.replaceChildren();
  const list = document.querySelector("#add-deck-matches");
  list.replaceChildren();
  const results = searchDeckCards(cards, japaneseInput.value);
  results.forEach((result) => {
    const card = cards[result.index];
    const row = document.createElement("article");
    row.className = "word-details add-deck-match";
    const word = document.createElement("strong");
    renderDeckSearchWord(word, card.japanese, result.ranges);
    const meaning = document.createElement("p");
    meaning.textContent = card.meanings.join(" · ");
    row.append(word, meaning);
    list.append(row);
  });
  document.querySelector("#add-deck-empty").hidden = list.childElementCount > 0;
  document.querySelector("#add-deck-search").hidden = editingCardIndex !== null;
}
const flashcard = document.querySelector("#flashcard");
const flashcardInner = flashcard.querySelector(".flashcard-inner");
const wordTranslationPopup = document.querySelector("#word-translation-popup");
const promptWord = document.querySelector("#prompt-word");
const backPromptWord = document.querySelector("#back-prompt-word");
const answerWord = document.querySelector("#answer-word");
const revealHint = document.querySelector("#reveal-hint");
const flashcardFront = document.querySelector("#flashcard-front");
const flashcardBack = document.querySelector("#flashcard-back");
const dragMissHint = document.querySelector("#drag-miss-hint");
const rememberLaterButton = document.querySelector("#remember-later-button");
const practiceSummary = document.querySelector("#practice-summary");
const summaryCorrect = document.querySelector("#summary-correct");
const summaryMissedList = document.querySelector("#summary-missed-list");
const practiceAnnouncement = document.querySelector("#practice-announcement");
const swipeRevealHint = document.querySelector("#swipe-reveal-hint");
const progressLabel = document.querySelector("#progress-label");
const sessionOptions = document.querySelectorAll("[data-session-size]");
const progressTrack = document.querySelector("#progress-track");
const progressFill = document.querySelector("#progress-fill");
const progressReviewFill = document.querySelector("#progress-review-fill");
const progressPoints = document.querySelector("#progress-points");
const cardsRemaining = document.querySelector("#cards-remaining");
const deckTools = document.querySelector("#deck-tools");
const deckToolsButton = document.querySelector("#deck-tools-button");
const addButton = document.querySelector("#add-button");
const defaultDeckList = document.querySelector("#default-deck-list");
const defaultDecksCount = document.querySelector("#default-decks-count");
const defaultDecksStatus = document.querySelector("#default-decks-status");
const defaultDeckConfirmTitle = document.querySelector("#default-deck-confirm-title");
const defaultDeckConfirmDescription = document.querySelector("#default-deck-confirm-description");
const defaultDeckConfirmWarning = document.querySelector("#default-deck-confirm-warning");
const defaultDeckConfirmStatus = document.querySelector("#default-deck-confirm-status");
const cancelDefaultDeckLoadButton = document.querySelector("#cancel-default-deck-load");
const confirmDefaultDeckLoadButton = document.querySelector("#confirm-default-deck-load");
const importFile = document.querySelector("#import-file");
let storageWarning = "";
let editingCardIndex = null;
let editingDeckScrollTop = 0;
let lastDeckScrollTop = 0;
let editingPageScrollTop = 0;
let formReturnScreen = "home";
let deckFeatureReturnScreen = "home";
let hiraganaManuallyEdited = false;
let addFeedbackTimeout = null;
let pendingDefaultDeck = null;
let defaultDeckLoadInProgress = false;
let fingerprintRegistrationSequence = 0;
const fingerprintRegistrationByContent = Object.create(null);
const pendingFingerprintRegistrations = new Map();

let cards = loadCards();
let deckIdentity = loadDeckIdentity();
let activeDeckId = deckIdentity.activeDeckId || makeDeckId("custom");
persistActiveDeckIdentity(activeDeckId);
if (cards.length) void registerDeckFingerprint(cards, activeDeckId);
let practiceDeck = [];
let englishPracticeRun = null;
let practiceTarget = 0;
let practiceIndex = 0;
let reviewIndex = null;
let shownPracticeIndices = new Set();
let shownPracticeCards = new Map();
let answerRevealed = false;
let practicePhase = "guessing";
let attemptGrades = [];
let sessionDeckId = null;
let sessionDirection = "japanese";
let correctConfirmationTimer = null;
let practiceAdvanceTimer = null;
let correctConfirmationGeneration = 0;
let flipUnlockTimer = null;
let flipGeneration = 0;
let practiceAdvanceGeneration = 0;
let rememberPopupDismissTap = false;
let selectedSessionSize = 5;
let advancingPractice = false;
let keyboardNavigation = false;
let flashcardDrag = null;
let suppressFlashcardClick = false;
let suppressFlashcardClickTimeout = null;
let deniedSwipeFeedbackTimeout = null;
let romajiLookup = null;
let romajiLookupPromise = null;
let activeRomajiToken = null;
let activePopupMode = null;
let activePopupPointer = null;
let wordPopupBlocksCardAdvance = false;
let lastTappedRomajiToken = null;
let lastTappedRomajiTokenTimeout = null;
let lastPointerType = "mouse";

const exampleService = window.JapaneseExampleSuggestions.createService({
  async loadCorpus() {
    const response = await fetch("decks/example-suggestions.json", {cache: "no-cache"});
    if (!response.ok) throw new Error(`Example request failed (${response.status}).`);
    return response.json();
  },
  async loadPart(part) {
    if (!/^example-suggestions\/part-\d+\.json$/.test(part.file)) throw new Error("Invalid example part path.");
    const response = await fetch(`decks/${part.file}?v=${part.sha256}`);
    if (!response.ok) throw new Error(`Example request failed (${response.status}).`);
    return response.json();
  },
  loadLookup: getRomajiLookup,
  findWordMeanings,
  normalizeWordMeanings,
});
const exampleControllers = new WeakMap();
const activeExampleGroups = new WeakMap();
const exampleGroupSelector = ".meaning-entry-group, .deck-entry-meaning-group";
let exampleStatusId = 0;

function hasMatchingDeckWord(value) {
  return searchDeckCards(cards, value).length > 0;
}

function renderSpellingSuggestions(host, items = [], choose) {
  const inline = host === wordList;
  const panel = inline ? wordList.querySelector(".spelling-suggestions") : document.querySelector("#add-spelling-suggestions");
  const empty = inline ? wordList.querySelector(".deck-search-empty") : document.querySelector("#add-deck-empty");
  if (!panel || !empty) return;
  panel.replaceChildren();
  panel.hidden = items.length === 0;
  const value = inline ? wordList.querySelector(".deck-entry-japanese")?.value || "" : japaneseInput.value;
  empty.hidden = items.length > 0 || hasMatchingDeckWord(value);
  if (!items.length) return;
  const heading = document.createElement("h3");
  heading.textContent = "Did you mean…?";
  const list = document.createElement("ul");
  for (const item of items) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "spelling-suggestion";
    const word = document.createElement("strong");
    word.textContent = item.japanese;
    const meaning = document.createElement("span");
    meaning.textContent = item.meaning;
    button.append(word, meaning);
    button.addEventListener("click", () => choose(item));
    row.append(button);
    list.append(row);
  }
  panel.append(heading, list);
}

function setupExampleFields(group, row = null) {
  const host = row ? wordList : cardForm;
  const prefix = row ? "deck-entry" : "meaning";
  const wrapper = group.querySelector(`.${prefix}-example-fields`);
  const fields = ["romaji", "hiragana", "english"].map(key => group.querySelector(`.${prefix}-example-${key}`));
  let romajiControl = fields[0].parentNode?.classList.contains("example-romaji-control") ? fields[0].parentNode : null;
  let navigation = group.querySelector(".example-navigation");
  let englishControl = fields[2].parentNode?.classList.contains("example-english-control") ? fields[2].parentNode : null;
  if (!romajiControl) {
    romajiControl = document.createElement("div");
    romajiControl.className = "example-romaji-control";
    fields[0].before(romajiControl);
    romajiControl.append(fields[0]);
  }
  if (!englishControl) {
    englishControl = document.createElement("div");
    englishControl.className = "example-english-control";
    fields[2].before(englishControl);
    englishControl.append(fields[2]);
  }
  let previousButton = group.querySelector(".example-previous-button");
  let nextButton = group.querySelector(".example-next-button");
  let counter = group.querySelector(".example-counter");
  if (!navigation) {
    navigation = document.createElement("div");
    navigation.className = "example-navigation";
    counter = document.createElement("span");
    counter.className = "example-counter";
    counter.setAttribute("aria-live", "polite");
    counter.textContent = "0/0";
    const buttons = document.createElement("div");
    buttons.className = "example-navigation-buttons";
    previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.className = "example-previous-button";
    previousButton.setAttribute("aria-label", "Previous example");
    previousButton.title = "Previous example";
    const previousIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    previousIcon.setAttribute("viewBox", "0 0 24 24");
    previousIcon.setAttribute("width", "18");
    previousIcon.setAttribute("height", "18");
    previousIcon.setAttribute("aria-hidden", "true");
    previousIcon.setAttribute("focusable", "false");
    const previousPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    previousPath.setAttribute("d", "M19 12H5 M12 19l-7-7 7-7");
    previousPath.setAttribute("fill", "none");
    previousPath.setAttribute("stroke", "currentColor");
    previousPath.setAttribute("stroke-width", "2");
    previousPath.setAttribute("stroke-linecap", "round");
    previousPath.setAttribute("stroke-linejoin", "round");
    previousIcon.append(previousPath);
    previousButton.append(previousIcon);
    nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "example-next-button";
    nextButton.setAttribute("aria-label", "Next example");
    nextButton.title = "Next example";
    const nextIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    nextIcon.setAttribute("viewBox", "0 0 24 24");
    nextIcon.setAttribute("width", "18");
    nextIcon.setAttribute("height", "18");
    nextIcon.setAttribute("aria-hidden", "true");
    nextIcon.setAttribute("focusable", "false");
    const nextPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    nextPath.setAttribute("d", "M5 12h14 M12 5l7 7-7 7");
    nextPath.setAttribute("fill", "none");
    nextPath.setAttribute("stroke", "currentColor");
    nextPath.setAttribute("stroke-width", "2");
    nextPath.setAttribute("stroke-linecap", "round");
    nextPath.setAttribute("stroke-linejoin", "round");
    nextIcon.append(nextPath);
    nextButton.append(nextIcon);
    buttons.append(previousButton, nextButton);
    navigation.append(counter, buttons);
    romajiControl.append(navigation);
  }
  let controller;
  const navigate = direction => {
    activeExampleGroups.set(host, group);
    renderSpellingSuggestions(host);
    void (direction < 0 ? controller.previous() : controller.next());
  };
  previousButton.addEventListener("click", () => navigate(-1));
  nextButton.addEventListener("click", () => navigate(1));
  const status = document.createElement("p");
  status.className = "example-status";
  status.id = `example-status-${++exampleStatusId}`;
  status.hidden = true;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  wrapper.before(status);
  fields.forEach(field => field.setAttribute("aria-describedby", status.id));
  const context = () => ({
    japanese: (row ? row.querySelector(".deck-entry-japanese") : japaneseInput).value.trim(),
    hiragana: (row ? row.querySelector(".deck-entry-hiragana") : hiraganaInput).value.trim(),
    meaning: group.querySelector(".meaning-translation").value.trim(),
    language: document.documentElement.lang === "es" ? "es" : "en",
  });
  controller = window.JapaneseExampleSuggestions.createController({
    fields, getContext: context, suggest: (value, excluded) => exampleService.suggest(value, excluded),
    allSuggestions: exampleService.allSuggestions ? value => exampleService.allSuggestions(value) : undefined,
    findAlternatives: value => exampleService.alternatives(value),
    setNavigationState: ({disabled, busy, position, total}) => {
      previousButton.disabled = disabled;
      nextButton.disabled = disabled;
      previousButton.setAttribute("aria-busy", String(busy));
      nextButton.setAttribute("aria-busy", String(busy));
      counter.textContent = `${position}/${total}`;
    },
    canOfferAlternatives: () => activeExampleGroups.get(host) === group && !hasMatchingDeckWord(context().japanese)
      && (row || editingCardIndex === null),
    onAlternatives: items => renderSpellingSuggestions(host, items, item => {
      const word = row ? row.querySelector(".deck-entry-japanese") : japaneseInput;
      const reading = row ? row.querySelector(".deck-entry-hiragana") : hiraganaInput;
      if (!row) hiraganaManuallyEdited = false;
      word.value = item.japanese;
      word.dispatchEvent(new Event("input", {bubbles: true}));
      reading.value = item.hiragana || compactHiragana(romajiToHiragana(item.japanese));
      reading.dataset.manuallyEdited = "false";
      refreshExampleFields(host);
      fields[0].focus();
    }),
    isActive: () => group.isConnected && !(row ? screens.deck : screens.add).hidden,
    setStatus(message, state) {
      const locked = fields[0].disabled;
      wrapper.classList.toggle("example-fields-locked", locked);
      wrapper.setAttribute("aria-disabled", String(locked));
      wrapper.tabIndex = locked ? 0 : -1;
      status.textContent = message;
      status.hidden = !message;
      status.classList.remove("is-warning");
      if (state === "warning") {
        void status.offsetWidth;
        status.classList.add("is-warning");
      }
    },
  });
  fields[0].addEventListener("focus", () => {
    activeExampleGroups.set(host, group);
    renderSpellingSuggestions(host);
    void controller.focus();
  });
  // Disabled inputs do not dispatch pointer events: their wrapper receives taps.
  wrapper.addEventListener("click", controller.warn);
  wrapper.addEventListener("focus", controller.warn);
  wrapper.addEventListener("keydown", event => {
    if (event.target === wrapper && fields[0].disabled && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); controller.warn();
    }
  });
  exampleControllers.set(group, controller);
  controller.refresh();
}

function refreshExampleFields(host) {
  host.querySelectorAll(exampleGroupSelector).forEach(group => exampleControllers.get(group)?.refresh());
}

function clearCardDependentFields(row = null) {
  const host = row ? wordList : cardForm;
  activeExampleGroups.delete(host);
  if (row) {
    const hiragana = row.querySelector(".deck-entry-hiragana");
    hiragana.value = "";
    hiragana.dataset.manuallyEdited = "false";
    const group = createDeckMeaningInput();
    row.querySelector(".deck-entry-meanings").replaceChildren(group);
    setupExampleFields(group, row);
  } else {
    hiraganaInput.value = "";
    hiraganaInput.dataset.manuallyEdited = "false";
    hiraganaManuallyEdited = false;
    resetMeaningInputs();
    window.clearTimeout(addFeedbackTimeout);
    addFeedbackTimeout = null;
    addFeedback.hidden = true;
    addFeedback.textContent = "";
    addFeedback.classList.remove("is-visible");
  }
  renderSpellingSuggestions(host);
}

async function prepareExampleAnnotations(groups, japanese, examples) {
  return Promise.all(examples.map((example, index) => exampleService.analyze(example, {
    japanese, meaning: groups[index].querySelector(".meaning-translation").value.trim(),
  })));
}

async function waitForExampleSuggestions(host) {
  await Promise.all([...host.querySelectorAll(exampleGroupSelector)].map(group => exampleControllers.get(group)?.wait()));
}

function exampleFormSignature(host) {
  return JSON.stringify([...host.querySelectorAll("input")].map(input => input.value));
}

function hideWordTranslationPopup() {
  activeRomajiToken = null;
  activePopupMode = null;
  activePopupPointer = null;
  wordTranslationPopup.hidden = true;
  wordTranslationPopup.textContent = "";
}

async function getRomajiLookup() {
  if (romajiLookup) return romajiLookup;
  if (!romajiLookupPromise) {
    romajiLookupPromise = (async () => {
      try {
        const deckPath = "decks/romaji-english-jmdict-2026-11-02";
        const response = await fetch(`${deckPath}.json.gz?v=6`, { cache: "no-cache" });
        let payload = null;
        if (response.ok && typeof DecompressionStream === "function") {
          try {
            const compressed = await response.arrayBuffer();
            const jsonStream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
            payload = await new Response(jsonStream).json();
          } catch (error) {
            console.info("Using the uncompressed romaji lookup fallback.", error);
          }
        }
        if (!payload) {
          const fallbackResponse = await fetch(`${deckPath}.json?v=6`, { cache: "no-cache" });
          if (!fallbackResponse.ok) throw new Error(`Deck request failed (${response.status}; fallback ${fallbackResponse.status}).`);
          payload = await fallbackResponse.json();
        }
        if (payload.format !== 5) throw new Error("The lookup deck needs a refresh.");
        romajiLookup = payload;
        return romajiLookup;
      } catch (error) {
        console.warn("Romaji word lookup is unavailable.", error);
        romajiLookupPromise = null;
        return null;
      }
    })();
  }
  return romajiLookupPromise;
}

function positionWordTranslationPopup(x, y) {
  const bounds = wordTranslationPopup.getBoundingClientRect();
  const left = Math.max(bounds.width / 2 + 8, Math.min(window.innerWidth - bounds.width / 2 - 8, x));
  const top = Math.max(bounds.height + 8, y - 10);
  wordTranslationPopup.style.left = `${left}px`;
  wordTranslationPopup.style.top = `${top}px`;
}

async function showWordTranslation(token, mode, x, y) {
  const key = token.textContent.trim().toLowerCase().replace(/[’]/g, "'");
  const previousToken = token.previousElementSibling;
  const separator = token.previousSibling;
  const previousKey = previousToken?.classList.contains("romaji-token") && separator?.nodeType === Node.TEXT_NODE
    && /^\s+$/.test(separator.textContent) ? previousToken.textContent : "";
  activeRomajiToken = token;
  activePopupMode = mode;
  activePopupPointer = { x, y };
  let meanings;
  if (token.dataset.contextMeaning) {
    meanings = [token.dataset.contextMeaning];
  } else {
    const lookup = await getRomajiLookup();
    if (activeRomajiToken !== token) return;
    meanings = findWordMeanings(key, lookup, previousKey).slice(0, 1);
  }
  if (!meanings?.length) {
    wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
    return;
  }
  wordTranslationPopup.replaceChildren(...meanings.map((meaning) => {
    const line = document.createElement("div");
    line.className = "word-translation-line";
    line.textContent = meaning;
    return line;
  }));
  wordTranslationPopup.hidden = false;
  if (mode === "hover") {
    const pointer = activePopupPointer || { x, y };
    positionWordTranslationPopup(pointer.x, pointer.y);
  }
  else {
    const rect = token.getBoundingClientRect();
    positionWordTranslationPopup(rect.left + rect.width / 2, rect.top - 2);
  }
}

function appendRomajiTokens(element, value, wordMeanings = null) {
  const text = String(value || "");
  const parts = text.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/g);
  const annotations = normalizeWordMeanings(wordMeanings, text);
  let wordIndex = 0;
  parts.forEach((part) => {
    if (/^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(part)) {
      const token = document.createElement("span");
      token.className = "romaji-token";
      token.textContent = part;
      if (annotations) token.dataset.contextMeaning = annotations[wordIndex].meaning;
      wordIndex += 1;
      element.append(token);
    } else if (part) element.append(document.createTextNode(part));
  });
}

function loadCards() {
  try {
    let stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      stored = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored !== null) {
        localStorage.setItem(STORAGE_KEY, stored);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    const saved = JSON.parse(stored || "[]");
    return Array.isArray(saved)
      ? saved.filter((card) => typeof card?.japanese === "string" && (typeof card?.english === "string" || Array.isArray(card?.meanings)))
        .map((card) => {
          const meanings = (Array.isArray(card.meanings) ? card.meanings : [card.english]).filter((meaning) => typeof meaning === "string").map((meaning) => meaning.trim()).filter(Boolean);
          const examples = meanings.map((_, index) => {
            const example = Array.isArray(card.examples) ? card.examples[index] || {} : {};
            const romaji = typeof example.romaji === "string" ? example.romaji.trim() : "";
            const wordMeanings = normalizeWordMeanings(example.wordMeanings, romaji);
            return {
              romaji,
              hiragana: typeof example.hiragana === "string" && example.hiragana.trim() ? example.hiragana.trim() : romajiToHiragana(romaji),
              english: typeof example.english === "string" ? example.english.trim() : "",
              ...(wordMeanings ? { wordMeanings } : {}),
            };
          });
          return { ...card, english: meanings[0] || "", meanings, examples, hiragana: typeof card.hiragana === "string" && card.hiragana ? card.hiragana : romajiToHiragana(card.japanese) };
        }).filter((card) => card.meanings.length > 0)
      : [];
  } catch {
    storageWarning = "Saved deck could not be read. Export a backup after restoring it.";
    return [];
  }
}

function saveCards(nextCards, deckId = activeDeckId) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCards));
    storageWarning = "";
    persistActiveDeckIdentity(deckId);
    void registerDeckFingerprint(nextCards, deckId);
    return true;
  } catch {
    storageWarning = "Browser storage is unavailable. Export a backup before closing this page.";
    updateDeckCount();
    return false;
  }
}

function makeDeckId(prefix = "custom") {
  const uuid = window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${uuid}`;
}

function defaultDeckIdentityId(deckFile) {
  return `default:${String(deckFile)}`;
}

function isValidDeckId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
}

function loadDeckIdentity() {
  try {
    const saved = JSON.parse(localStorage.getItem(DECK_IDENTITY_KEY) || "null");
    if (!saved || saved.version !== 1 || !saved.fingerprints || typeof saved.fingerprints !== "object" || Array.isArray(saved.fingerprints)) {
      return { version: 1, activeDeckId: null, fingerprints: {} };
    }
    const fingerprints = {};
    Object.entries(saved.fingerprints).forEach(([digest, deckId]) => {
      if (/^[a-f0-9]{64}$/.test(digest) && isValidDeckId(deckId)) fingerprints[digest] = deckId;
    });
    return { version: 1, activeDeckId: isValidDeckId(saved.activeDeckId) ? saved.activeDeckId : null, fingerprints };
  } catch {
    return { version: 1, activeDeckId: null, fingerprints: {} };
  }
}

function persistActiveDeckIdentity(deckId) {
  if (isValidDeckId(deckId)) activeDeckId = deckId;
  deckIdentity.activeDeckId = activeDeckId;
  try { localStorage.setItem(DECK_IDENTITY_KEY, JSON.stringify(deckIdentity)); } catch { /* identity is an optional local enhancement */ }
}

function canonicalDeckContent(deckCards) {
  const norm = (value) => String(value ?? "").trim().normalize("NFC");
  return JSON.stringify((Array.isArray(deckCards) ? deckCards : []).map((card) => {
    const meanings = Array.isArray(card?.meanings) ? card.meanings : [card?.english];
    return [norm(card?.japanese), norm(card?.hiragana), meanings.map(norm), meanings.map((_, index) => {
      const example = card?.examples?.[index] || {};
      return [norm(example.romaji), norm(example.hiragana), norm(example.english)];
    })];
  }));
}

async function fingerprintDeck(deckCards) {
  try {
    const bytes = new TextEncoder().encode(canonicalDeckContent(deckCards));
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

async function registerDeckFingerprint(deckCards, deckId) {
  const canonicalContent = canonicalDeckContent(deckCards);
  const registrationSequence = ++fingerprintRegistrationSequence;
  fingerprintRegistrationByContent[canonicalContent] = registrationSequence;
  let finishRegistration;
  const completion = new Promise((resolve) => { finishRegistration = resolve; });
  pendingFingerprintRegistrations.set(canonicalContent, { deckId, registrationSequence, completion });
  try {
    const digest = await fingerprintDeck(deckCards);
    if (!digest || !isValidDeckId(deckId) || fingerprintRegistrationByContent[canonicalContent] !== registrationSequence) return;
    deckIdentity.fingerprints[digest] = deckId;
    try { localStorage.setItem(DECK_IDENTITY_KEY, JSON.stringify(deckIdentity)); } catch { /* the deck remains usable without identity persistence */ }
  } finally {
    if (pendingFingerprintRegistrations.get(canonicalContent)?.registrationSequence === registrationSequence) pendingFingerprintRegistrations.delete(canonicalContent);
    if (fingerprintRegistrationByContent[canonicalContent] === registrationSequence) delete fingerprintRegistrationByContent[canonicalContent];
    finishRegistration();
  }
}

async function resolveDeckId(deckCards, preferredId = null) {
  if (isValidDeckId(preferredId)) return preferredId;
  const canonicalContent = canonicalDeckContent(deckCards);
  while (pendingFingerprintRegistrations.has(canonicalContent)) {
    await pendingFingerprintRegistrations.get(canonicalContent).completion;
  }
  const digest = await fingerprintDeck(deckCards);
  return (digest && deckIdentity.fingerprints[digest]) || makeDeckId("custom");
}

function loadLearningStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEARNING_KEY) || "null");
    if (!saved || saved.version !== 2 || !saved.decks || typeof saved.decks !== "object" || Array.isArray(saved.decks)) return { version: 2, decks: Object.create(null) };
    const decks = Object.create(null);
    Object.entries(saved.decks).forEach(([deckId, directions]) => {
      if (!isValidDeckId(deckId) || !directions || typeof directions !== "object" || Array.isArray(directions)) return;
      const validatedDirections = Object.create(null);
      ["japanese", "english"].forEach((direction) => {
        const words = directions[direction];
        if (!words || typeof words !== "object" || Array.isArray(words)) return;
        const validated = Object.create(null);
        Object.entries(words).forEach(([rawKey, counts]) => {
          const key = normalizeDeckWord(rawKey);
          if (!key || !counts || typeof counts !== "object") return;
          const correct = Number.isSafeInteger(counts.correct) && counts.correct >= 0 ? Math.min(counts.correct, 1000000000) : 0;
          const incorrect = Number.isSafeInteger(counts.incorrect) && counts.incorrect >= 0 ? Math.min(counts.incorrect, 1000000000) : 0;
          const prior = Object.hasOwn(validated, key) ? validated[key] : { correct: 0, incorrect: 0 };
          validated[key] = { correct: Math.min(1000000000, prior.correct + correct), incorrect: Math.min(1000000000, prior.incorrect + incorrect) };
        });
        validatedDirections[direction] = validated;
      });
      decks[deckId] = validatedDirections;
    });
    return { version: 2, decks };
  } catch { return { version: 2, decks: Object.create(null) }; }
}

function saveLearningStore(store) {
  try { localStorage.setItem(LEARNING_KEY, JSON.stringify(store)); return true; } catch { return false; }
}

function learningForCard(card, deckId = activeDeckId, direction = "japanese") {
  const store = loadLearningStore();
  return store.decks[deckId]?.[direction]?.[normalizeDeckWord(card?.japanese)] || { correct: 0, incorrect: 0 };
}

function learningWeight(card, deckId = activeDeckId, direction = "japanese") {
  const record = learningForCard(card, deckId, direction);
  return 1 + Math.min(4, Math.max(0, record.incorrect - record.correct));
}

function learningWeightFromStore(card, store, deckId, direction) {
  const record = store.decks[deckId]?.[direction]?.[normalizeDeckWord(card?.japanese)] || { correct: 0, incorrect: 0 };
  return 1 + Math.min(4, Math.max(0, record.incorrect - record.correct));
}

function commitLearning(card, grade, deckId = sessionDeckId || activeDeckId, direction = sessionDirection) {
  const store = loadLearningStore();
  const words = Object.hasOwn(store.decks, deckId) ? store.decks[deckId] : (store.decks[deckId] = Object.create(null));
  const directionWords = Object.hasOwn(words, direction) ? words[direction] : (words[direction] = Object.create(null));
  const key = normalizeDeckWord(card?.japanese);
  const record = Object.hasOwn(directionWords, key) ? directionWords[key] : (directionWords[key] = { correct: 0, incorrect: 0 });
  const field = grade === "correct" ? "correct" : "incorrect";
  record[field] = Math.min(1000000000, record[field] + 1);
  saveLearningStore(store);
}

function migrateLearningKey(oldJapanese, newJapanese) {
  const oldKey = normalizeDeckWord(oldJapanese);
  const newKey = normalizeDeckWord(newJapanese);
  if (!oldKey || !newKey || oldKey === newKey) return;
  const store = loadLearningStore();
  const directions = store.decks[activeDeckId];
  if (!directions) return;
  ["japanese", "english"].forEach((direction) => {
    const words = directions[direction];
    if (!words || !Object.hasOwn(words, oldKey)) return;
    const existing = Object.hasOwn(words, newKey) ? words[newKey] : { correct: 0, incorrect: 0 };
    const migrated = words[oldKey];
    words[newKey] = { correct: Math.min(1000000000, existing.correct + migrated.correct), incorrect: Math.min(1000000000, existing.incorrect + migrated.incorrect) };
    delete words[oldKey];
  });
  saveLearningStore(store);
}

function contextualExampleKey(example) {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  return JSON.stringify([normalize(example?.romaji), normalize(example?.hiragana), normalize(example?.english)]);
}

function savedDeckContentSignature(savedCards) {
  const normalize = (value) => String(value || "").trim();
  const content = JSON.stringify(savedCards.map((card) => [
    normalize(card.japanese),
    normalize(card.hiragana),
    card.meanings.map(normalize),
    card.examples.map((example) => [normalize(example.romaji), normalize(example.hiragana), normalize(example.english)]),
  ]));
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${savedCards.length}:${(hash >>> 0).toString(36)}`;
}

async function restoreContextMeaningsForSavedCards() {
  if (!cards.length || !cards.some((card) => card.examples.some((example) => !example.wordMeanings?.length))) return;
  const signature = savedDeckContentSignature(cards);
  if (localStorage.getItem(CONTEXT_ANNOTATION_MIGRATION_KEY) === signature) return;

  try {
    const response = await fetch("decks/english/most-common-2000.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Context deck request failed (${response.status}).`);
    const source = await response.json();
    const defaultCards = prepareDefaultDeck(source, source.cards?.length || 0, (index) => `context-${index}`);
    const annotationsByExample = new Map();
    defaultCards.forEach((card) => card.examples.forEach((example) => {
      const key = contextualExampleKey(example);
      if (example.wordMeanings?.length && !annotationsByExample.has(key)) {
        annotationsByExample.set(key, example.wordMeanings);
      }
    }));

    let changed = false;
    const updatedCards = cards.map((card) => {
      let cardChanged = false;
      const examples = card.examples.map((example) => {
        if (example.wordMeanings?.length) return example;
        const annotations = annotationsByExample.get(contextualExampleKey(example));
        if (!annotations?.length) return example;
        cardChanged = true;
        return { ...example, wordMeanings: annotations.map((annotation) => ({ ...annotation })) };
      });
      if (!cardChanged) return card;
      changed = true;
      return { ...card, examples };
    });

    if (changed) {
      if (!saveCards(updatedCards)) return;
      cards = updatedCards;
    }
    localStorage.setItem(CONTEXT_ANNOTATION_MIGRATION_KEY, signature);
  } catch (error) {
    console.warn("Could not restore contextual word meanings for the saved deck.", error);
  }
}

function showScreen(name, onShown = () => {}) {
  if (name !== "practice") cancelPracticeTimers();
  if (name !== "practice") {
    wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
  }
  const currentScreen = Object.values(screens).find(screen => !screen.hidden);
  const nextScreen = screens[name];
  const update = () => {
    Object.entries(screens).forEach(([key, screen]) => { screen.hidden = key !== name; });
    if (name === "home") updateDeckCount();
    if (name === "add") renderAddDeckMatches();
    onShown();
  };
  if (currentScreen === nextScreen) { update(); return; }
  if (typeof document.startViewTransition === "function") document.startViewTransition(update);
  else update();
}

function returnFromDeckFeature() {
  showScreen(deckFeatureReturnScreen);
}

// Called by Android's system Back gesture. Return false only at the root so
// Android can apply its normal behavior; all in-app screens use their existing
// cancellation paths, including their loading and form guards.
window.JapaneseCardsHandleBack = function handleSystemBack() {
  if (overwriteDialog.open) { overwriteDialog.close("cancel"); return true; }
  const language = window.JapaneseCardsLanguageNavigation;
  if (language?.isSelectorVisible()) return language.backFromSelector();
  if (!wordTranslationPopup.hidden) {
    wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
    return true;
  }
  if (deckTools.classList.contains("is-open")) {
    closeDeckMenu();
    return true;
  }
  if (!screens.defaultConfirm.hidden) {
    if (!defaultDeckLoadInProgress) cancelDefaultDeckLoad();
    return true;
  }
  if (!screens.add.hidden) {
    cancelCardForm();
    return true;
  }
  if (!screens.export.hidden && exportInProgress) return true;
  if (!screens.about.hidden) { openSettings(); return true; }
  if (!screens.defaults.hidden || !screens.clear.hidden || !screens.export.hidden) {
    returnFromDeckFeature();
    return true;
  }
  if (!screens.settings.hidden || !screens.export.hidden || !screens.practice.hidden || !screens.deck.hidden || !screens.defaults.hidden || !screens.clear.hidden) {
    showScreen("home");
    return true;
  }
  return language?.backFromHome() || false;
};

function updateDeckCount() {
  const count = cards.length;
  deckCount.classList.remove("is-empty-prompt");
  deckCount.textContent = count === 1 ? "1 word in your deck" : `${count} Cards in your deck`;
  if (storageWarning) deckCount.textContent += ` · ${storageWarning}`;
}

function renderDeckList(highlightIndex = -1) {
  const count = cards.length;
  deckListCount.textContent = count === 1 ? "1 word" : `${count} words`;
  wordList.replaceChildren();
  wordList.append(createDeckEntryRow());

  cards.forEach((card, index) => {
    const row = document.createElement("article");
    row.className = "word-row";
    row.dataset.cardIndex = index;
    if (index === highlightIndex) {
      row.classList.add("is-updated");
      row.addEventListener("animationend", () => row.classList.remove("is-updated"), { once: true });
    }

    const removeButton = document.createElement("button");
    removeButton.className = "remove-word-button";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${card.japanese}`);
    removeButton.title = "Remove this word";
    removeButton.addEventListener("click", () => removeDeckCard(index));

    const editButton = document.createElement("button");
    editButton.className = "edit-word-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${card.japanese}`);
    editButton.addEventListener("click", () => startEditingCard(index));

    const details = document.createElement("div");
    details.className = "word-details";
    const japanese = document.createElement("div");
    japanese.className = "japanese-word-display";
    const romaji = document.createElement("strong");
    romaji.textContent = card.japanese;
    const hiragana = document.createElement("span");
    hiragana.className = "hiragana-subtext";
    hiragana.textContent = card.hiragana || romajiToHiragana(card.japanese);
    japanese.append(romaji, hiragana);
    const english = document.createElement("p");
    english.textContent = card.meanings.map((meaning) => meaning.replace(/\r\n|\r|\n/g, "    ")).join("  ·  ");
    details.append(japanese, english);
    row.append(removeButton, details, editButton);
    wordList.append(row);
  });
  const empty = document.createElement("p");
  empty.className = "empty-word-list deck-search-empty";
  empty.textContent = "No matching words in this deck.";
  const suggestions = document.createElement("section");
  suggestions.className = "spelling-suggestions";
  suggestions.hidden = true;
  suggestions.setAttribute("aria-label", "Spelling suggestions");
  suggestions.setAttribute("aria-live", "polite");
  wordList.append(empty, suggestions);
  filterDeckList("");
}

function createDeckEntryRow() {
  const row = document.createElement("article");
  row.className = "word-row deck-entry-row";
  row.setAttribute("aria-label", "Add a deck entry");

  const spacer = document.createElement("span");
  spacer.className = "deck-entry-spacer";
  spacer.setAttribute("aria-hidden", "true");

  const details = document.createElement("div");
  details.className = "word-details deck-entry-fields";
  const addMeaningButton = document.createElement("button");
  addMeaningButton.className = "secondary-button deck-add-meaning";
  addMeaningButton.type = "button";
  addMeaningButton.textContent = "Add another meaning";
  addMeaningButton.addEventListener("click", () => {
    const next = createDeckMeaningInput();
    meanings.append(next);
    setupExampleFields(next, row);
    showDeckMeaningHints(row, next);
    next.querySelector(".meaning-translation").focus();
  });
  const addCardButton = document.createElement("button");
  addCardButton.className = "primary-button deck-add-card";
  addCardButton.type = "button";
  addCardButton.textContent = "Add card to deck";
  addCardButton.addEventListener("click", addDeckEntry);
  const actions = document.createElement("div");
  actions.className = "deck-entry-actions";
  const addMeaningAction = document.createElement("div");
  addMeaningAction.className = "deck-entry-action-group";
  const addMeaningHint = document.createElement("span");
  addMeaningHint.className = "deck-action-hint web-shortcut-hint";
  addMeaningHint.textContent = "Tab";
  addMeaningAction.append(addMeaningHint, addMeaningButton);
  const addCardAction = document.createElement("div");
  addCardAction.className = "deck-entry-action-group";
  const addCardHint = document.createElement("span");
  addCardHint.className = "deck-action-hint web-shortcut-hint";
  addCardHint.textContent = "Enter";
  addCardAction.append(addCardHint, addCardButton);
  actions.append(addMeaningAction, addCardAction);
  const japanese = document.createElement("input");
  japanese.type = "text";
  japanese.className = "deck-entry-japanese";
  japanese.placeholder = "Japanese (romaji)";
  japanese.setAttribute("aria-label", "New Japanese word in romaji");
  japanese.autocomplete = "off";

  const hiragana = document.createElement("input");
  hiragana.type = "text";
  hiragana.className = "deck-entry-hiragana";
  hiragana.placeholder = "Hiragana";
  hiragana.setAttribute("aria-label", "New word in hiragana");
  hiragana.autocomplete = "off";
  hiragana.dataset.manuallyEdited = "false";

  const meanings = document.createElement("div");
  meanings.className = "deck-entry-meanings";
  const firstMeaning = createDeckMeaningInput();
  meanings.append(firstMeaning);

  const meaningRow = document.createElement("div");
  meaningRow.className = "deck-entry-meaning-row";
  meaningRow.append(meanings);
  details.append(japanese, hiragana, meaningRow, actions);

  const buttonSpacer = document.createElement("span");
  buttonSpacer.className = "deck-entry-spacer";
  buttonSpacer.setAttribute("aria-hidden", "true");
  row.append(spacer, details, buttonSpacer);
  setupExampleFields(firstMeaning, row);
  return row;
}

function createDeckMeaningInput(value = "") {
  const group = document.createElement("div");
  group.className = "deck-entry-meaning-group";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "deck-entry-meaning meaning-translation";
  input.placeholder = "English meaning";
  input.setAttribute("aria-label", "New English meaning");
  input.value = value;
  const control = document.createElement("div");
  control.className = "deck-entry-meaning-control";
  control.append(input);
  const exampleFields = document.createElement("div");
  exampleFields.className = "deck-entry-example-fields";
  exampleFields.append(
    createEntryExampleInput("romaji", "Example (romaji)"),
    createEntryExampleInput("hiragana", "Example (hiragana)"),
    createEntryExampleInput("english", "Example translation"),
  );
  group.append(control, exampleFields);
  return group;
}

function showDeckMeaningHints(row, activeGroup) {
  row.querySelectorAll(".deck-entry-meaning-group").forEach((group) => {
    const hints = group.querySelector(".deck-entry-hints");
    if (hints) hints.hidden = group !== activeGroup;
  });
}

function createEntryExampleInput(field, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = `deck-entry-example-${field}`;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", `New ${placeholder.toLowerCase()}`);
  input.autocomplete = "off";
  if (field === "hiragana") input.dataset.manuallyEdited = "false";
  return input;
}

async function addDeckEntry() {
  const row = wordList.querySelector(".deck-entry-row");
  if (!row || row.dataset.saving === "true") return;
  row.dataset.saving = "true";
  try {
    await waitForExampleSuggestions(row);
    const signature = exampleFormSignature(row);
    const japanese = row.querySelector(".deck-entry-japanese").value.trim();
    const hiragana = compactHiragana(row.querySelector(".deck-entry-hiragana").value.trim() || romajiToHiragana(japanese));
    const groups = [...row.querySelectorAll(".deck-entry-meaning-group")];
    const meaningEntries = groups.map((group) => {
      const romaji = group.querySelector(".deck-entry-example-romaji").value.trim();
      const customHiragana = group.querySelector(".deck-entry-example-hiragana").value.trim();
      return {
        meaning: group.querySelector(".meaning-translation").value.trim(),
        example: {
          romaji,
          hiragana: compactHiragana(customHiragana || romajiToHiragana(romaji)),
          english: group.querySelector(".deck-entry-example-english").value.trim(),
        },
      };
    }).filter((entry) => entry.meaning);
    const meanings = meaningEntries.map((entry) => entry.meaning);
    let examples = meaningEntries.map((entry) => entry.example);
    if (!japanese || meanings.length === 0) return;

    const filledGroups = groups.filter(group => group.querySelector(".meaning-translation").value.trim());
    examples = await prepareExampleAnnotations(filledGroups, japanese, examples);
    if (!row.isConnected || signature !== exampleFormSignature(row)) return;

    const english = meanings[0];
    requestCardOverwrite(japanese, (existingIndex) => {
      if (!row.isConnected || signature !== exampleFormSignature(row)) return;
      const entry = { japanese, hiragana, english, meanings, examples };
      const nextCards = existingIndex < 0
        ? [{ id: crypto.randomUUID?.() || String(Date.now()), ...entry }, ...cards]
        : updateCardAt(cards, existingIndex, entry);
      if (!saveCards(nextCards)) {
        window.alert("The card could not be saved in this browser. Export a backup before closing this page.");
        return;
      }
      if (existingIndex >= 0) migrateLearningKey(cards[existingIndex]?.japanese, japanese);
      cards = nextCards;
      renderDeckList(existingIndex < 0 ? 0 : existingIndex);
      wordList.scrollTop = 0;
      wordList.querySelector(".deck-entry-japanese")?.focus({ preventScroll: true });
    });
  } finally { row.dataset.saving = "false"; }
}

function removeDeckCard(index) {
  const nextCards = removeCardAt(cards, index);
  if (!saveCards(nextCards)) {
    window.alert("The word could not be removed from browser storage.");
    return;
  }
  cards = nextCards;
  renderDeckList();
}

function closeDeckMenu() {
  deckTools.classList.remove("is-open");
  deckToolsButton.setAttribute("aria-expanded", "false");
}

function openDeckMenu() {
  deckTools.classList.add("is-open");
  deckToolsButton.setAttribute("aria-expanded", "true");
}

let exportInProgress = false;
let exportToastTimeout = null;

function openSettings() {
  closeDeckMenu();
  showScreen("settings");
}

function exportDeck() {
  deckFeatureReturnScreen = screens.deck.hidden ? "home" : "deck";
  closeDeckMenu();
  window.clearTimeout(exportToastTimeout);
  document.querySelector("#export-toast").hidden = true;
  document.querySelector("#export-name").value = `my_japan_dict_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`;
  document.querySelector("#export-status").textContent = "";
  document.querySelector("#cancel-export").textContent = "Cancel";
  showScreen("export");
  document.querySelector("#export-destination-info").hidden = !window.JapaneseCardsExport.isNative;
  document.querySelector("#export-destination").textContent = window.JapaneseCardsExport.destination();
  document.querySelector("#export-name").focus();
}

async function finishDeckExport(downloaded) {
  const toast = document.querySelector("#export-toast");
  document.querySelector("#export-toast-message").textContent = downloaded
    ? "" : "Deck saved to Downloads.";
  document.querySelector("#export-status").textContent = "";
  toast.hidden = false;
  exportToastTimeout = window.setTimeout(() => { toast.hidden = true; }, 5000);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pause = (milliseconds) => new Promise(resolve => window.setTimeout(resolve, milliseconds));
  try {
    screens.export.classList.add("is-export-success");
    await pause(reducedMotion ? 250 : 360);
    screens.export.classList.add("is-export-leaving");
    await pause(reducedMotion ? 0 : 200);
    returnFromDeckFeature();
    screens[deckFeatureReturnScreen].classList.add("is-export-returning");
    await pause(reducedMotion ? 0 : 240);
  } finally {
    screens.export.classList.remove("is-export-success");
    screens.export.classList.remove("is-export-leaving");
    screens[deckFeatureReturnScreen].classList.remove("is-export-returning");
  }
}

async function saveDeckExport(event) {
  event.preventDefault();
  if (exportInProgress) return;
  const name = document.querySelector("#export-name").value.trim();
  if (!name) { document.querySelector("#export-name").focus(); return; }
  exportInProgress = true;
  const controls = ["#confirm-export", "#export-name", "#cancel-export"];
  controls.forEach(selector => { document.querySelector(selector).disabled = true; });
  const status = document.querySelector("#export-status");
  status.textContent = "Saving deck…";
  try {
    const result = await window.JapaneseCardsExport.save(getSafeDeckFilename(name), createDeckJson(name));
    await finishDeckExport(Boolean(result?.downloaded));
  } catch (error) {
    status.textContent = error.message || "The deck could not be exported. Check available space and try again.";
  } finally {
    exportInProgress = false;
    controls.forEach(selector => { document.querySelector(selector).disabled = false; });
  }
}

function createDeckJson(deckName) {
  return serializeDeck(cards, deckName, new Date().toISOString(), activeDeckId);
}

function getSafeDeckFilename(deckName) {
  const safeName = deckName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/\s+/g, "-") || "japanese-deck";
  return `${safeName}.json`;
}

async function importDeck(file) {
  if (!file) { returnFromDeckFeature(); return; }
  try {
    const importedData = JSON.parse(await file.text());
    const importedCards = parseImportedDeck(importedData);
    if (cards.length > 0 && !window.confirm(`Replace your current deck of ${cards.length} cards with ${importedCards.length} imported cards?`)) return;
    const importedDeckId = await resolveDeckId(importedCards, !Array.isArray(importedData) ? importedData.deckId : null);
    if (!saveCards(importedCards, importedDeckId)) {
      window.alert("The deck could not be saved in this browser. Export a backup before closing this page.");
      return;
    }
    cards = importedCards;
    renderDeckList();
    updateDeckCount();
    deckCount.textContent += ` · Imported ${cards.length} ${cards.length === 1 ? "card" : "cards"}.`;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "The deck could not be imported.");
  } finally {
    importFile.value = "";
    closeDeckMenu();
    returnFromDeckFeature();
  }
}

function startPractice() {
  if (cards.length === 0) {
    document.querySelector("#deck-count").textContent = "Add your first word to start practicing or import a deck.";
    deckCount.classList.remove("is-empty-prompt");
    void deckCount.offsetWidth;
    deckCount.classList.add("is-empty-prompt");
    return;
  }
  const fromEnglish = originLanguage.value === "english";
  const allMeaningCount = cards.reduce((total, card) => total + card.meanings.length, 0);
  const sessionSize = selectedSessionSize === "all" ? allMeaningCount : selectedSessionSize;
  cancelPracticeTimers();
  sessionDeckId = activeDeckId;
  sessionDirection = fromEnglish ? "english" : "japanese";
  const learningSnapshot = loadLearningStore();
  const weightSnapshot = new Map(cards.map((card) => [card, learningWeightFromStore(card, learningSnapshot, sessionDeckId, sessionDirection)]));
  const weightForCard = (card) => weightSnapshot.get(card) || 1;
  practiceTarget = sessionSize;
  practiceDeck = fromEnglish ? [] : createPracticeDeck(cards, sessionSize, Math.random, weightForCard);
  englishPracticeRun = fromEnglish ? createMeaningPracticeRun(cards, Math.random, weightForCard) : null;
  practiceIndex = 0;
  reviewIndex = null;
  shownPracticeIndices = new Set();
  shownPracticeCards = new Map();
  answerRevealed = false;
  practicePhase = "guessing";
  attemptGrades = Array.from({ length: practiceTarget }, () => null);
  showScreen("practice");
  renderPracticeCard();
}

function renderPracticeCard(entranceAnimation = "") {
  wordPopupBlocksCardAdvance = false;
  hideWordTranslationPopup();
  const fromEnglish = sessionDirection === "english";
  const displayIndex = reviewIndex ?? practiceIndex;
  if (fromEnglish && !practiceDeck[displayIndex]) drawEnglishPracticeCard(displayIndex);
  const entry = practiceDeck[displayIndex];
  const card = fromEnglish ? entry.card : entry;
  const isReviewing = reviewIndex !== null;
  if (!isReviewing) {
    shownPracticeIndices.add(practiceIndex);
    shownPracticeCards.set(card.japanese, card);
  }
  if (fromEnglish) {
    promptWord.textContent = entry.meaning;
    backPromptWord.textContent = entry.meaning;
    renderJapaneseWord(answerWord, card);
    const exampleBlock = createPracticeExample(card.examples?.[entry.meaningIndex]);
    if (exampleBlock) answerWord.append(exampleBlock);
  } else {
    renderJapaneseWord(promptWord, card);
    renderJapaneseWord(backPromptWord, card);
    renderPracticeAnswer(answerWord, card, card.meanings.map((_, index) => index));
  }
  const showFullCard = isReviewing || practicePhase === "revealed" || practicePhase === "confirmingCorrect";
  answerWord.classList.remove("is-appearing");
  if (isReviewing) answerWord.classList.add("is-appearing");
  flashcard.classList.add("is-render-reset");
  revealHint.hidden = isReviewing || showFullCard;
  flashcard.classList.toggle("is-flipped", showFullCard);
  flashcardFront.setAttribute("aria-hidden", String(showFullCard));
  flashcardBack.setAttribute("aria-hidden", String(!showFullCard));
  flashcard.setAttribute("aria-label", isReviewing ? "Reviewed card" : showFullCard ? "Answer revealed. Select to mark correct." : "Reveal the answer");
  const canRememberLater = !isReviewing && practicePhase === "revealed";
  rememberLaterButton.disabled = !canRememberLater;
  rememberLaterButton.classList.toggle("is-active", canRememberLater);
  practiceSummary.hidden = true;
  document.querySelector(".practice-content").hidden = false;
  swipeRevealHint.classList.add("is-hidden");
  swipeRevealHint.classList.remove("is-fading", "is-attention");
  window.clearTimeout(deniedSwipeFeedbackTimeout);
  flashcard.classList.remove("is-confirming-correct", "is-correct-hold", "is-advancing", "is-entering", "is-dragging", "is-drag-snap", "is-denied-jitter", "is-swipe-exit-left", "is-swipe-exit-right", "is-swipe-exit-down", "is-swipe-enter-from-left", "is-swipe-enter-from-right");
  clearFlashcardDragStyles();
  if (entranceAnimation) flashcard.classList.add(entranceAnimation);
  flashcard.disabled = practicePhase === "flipping" || practicePhase === "confirmingCorrect" || practicePhase === "committingMiss" || practicePhase === "exiting";
  advancingPractice = flashcard.disabled;
  flashcard.setAttribute("aria-expanded", String(showFullCard));
  progressLabel.textContent = `${practiceIndex} of ${practiceTarget} completed`;
  renderSessionProgress();
}

function renderJapaneseWord(container, card) {
  container.replaceChildren();
  const romaji = document.createElement("span");
  romaji.className = "romaji-word";
  const oneWord = /^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(card.japanese);
  const oneMeaning = Array.isArray(card.meanings) && card.meanings.length === 1 && card.meanings[0];
  const stem = /^(.*)suru$/i.exec(card.japanese)?.[1];
  const baseTip = stem && card.examples?.flatMap((example) => example.wordMeanings || [])
    .map((word) => word.meaning.match(/(?:Base compound|Verbo base): .+$/)?.[0])
    .find((tip) => tip?.split(": ")[1]?.split(" (")[0].replace(/\s/g, "") === stem);
  appendRomajiTokens(romaji, card.japanese,
    oneWord && oneMeaning ? [{ romaji: card.japanese, meaning: baseTip ? `${oneMeaning} ${baseTip}` : oneMeaning }] : null);
  const hiragana = document.createElement("span");
  hiragana.className = "hiragana-subtext";
  hiragana.textContent = card.hiragana || romajiToHiragana(card.japanese);
  container.append(romaji, hiragana);
}

function renderPracticeAnswer(container, card, meaningIndexes) {
  container.replaceChildren();
  meaningIndexes.forEach((meaningIndex) => {
    const meaning = document.createElement("div");
    meaning.className = "practice-meaning";
    const translation = document.createElement("span");
    translation.className = "practice-translation";
    translation.textContent = card.meanings[meaningIndex] || "";
    meaning.append(translation);
    const exampleBlock = createPracticeExample(card.examples?.[meaningIndex]);
    if (exampleBlock) meaning.append(exampleBlock);
    container.append(meaning);
  });
}

function createPracticeExample(example) {
  if (!example || !(example.romaji || example.hiragana || example.english)) return null;
  const exampleBlock = document.createElement("div");
  exampleBlock.className = "practice-example";
  const exampleRomaji = document.createElement("span");
  exampleRomaji.className = "practice-example-romaji";
  appendRomajiTokens(exampleRomaji, example.romaji || "", example.wordMeanings);
  const exampleHiragana = document.createElement("span");
  exampleHiragana.className = "practice-example-hiragana";
  exampleHiragana.textContent = example.hiragana || romajiToHiragana(example.romaji || "");
  const exampleTranslation = document.createElement("span");
  exampleTranslation.className = "practice-example-translation";
  exampleTranslation.textContent = example.english || "";
  exampleBlock.append(exampleRomaji, exampleHiragana, exampleTranslation);
  return exampleBlock;
}

function drawEnglishPracticeCard(index = practiceIndex) {
  practiceDeck[index] = englishPracticeRun.draw();
}

function meaningInputs() {
  return [...englishMeanings.querySelectorAll(".meaning-translation")];
}

function addMeaningInput(value = "", example = {}) {
  const group = document.createElement("div");
  group.className = "meaning-entry-group";
  const input = document.createElement("input");
  input.type = "text";
  input.name = "meanings";
  input.className = "meaning-translation";
  input.placeholder = "Another meaning";
  input.value = value;
  const exampleFields = document.createElement("div");
  exampleFields.className = "meaning-example-fields";
  const fields = [
    ["romaji", "Example (romaji)"],
    ["hiragana", "Example (hiragana)"],
    ["english", "Example translation"],
  ];
  fields.forEach(([field, placeholder]) => {
    const exampleInput = document.createElement("input");
    exampleInput.type = "text";
    exampleInput.className = `meaning-example-${field}`;
    exampleInput.placeholder = placeholder;
    exampleInput.setAttribute("aria-label", `${placeholder} for ${value || "meaning"}`);
    exampleInput.autocomplete = "off";
    exampleInput.value = example[field] || (field === "hiragana" ? romajiToHiragana(example.romaji || "") : "");
    if (field === "hiragana") exampleInput.dataset.manuallyEdited = example.hiragana ? "true" : "false";
    exampleFields.append(exampleInput);
  });
  group.append(input, exampleFields);
  englishMeanings.append(group);
  setupExampleFields(group);
  return input;
}

function resetMeaningInputs(values = [""], examples = []) {
  englishMeanings.replaceChildren();
  const first = addMeaningInput(values[0] || "", examples[0] || {});
  values.slice(1).forEach((value, index) => addMeaningInput(value, examples[index + 1] || {}));
  if (!first.id) first.id = "english-translation";
}

function renderSessionProgress() {
  const total = practiceTarget;
  const state = getSessionProgressState(total, practiceIndex, reviewIndex, shownPracticeIndices, answerRevealed);
  const shown = state.shownCount;
  const remaining = total - practiceIndex;
  const progressMarker = document.createElement("span");
  progressMarker.className = "progress-current-marker";
  progressMarker.textContent = answerRevealed ? "Next" : "Guess";
  progressMarker.style.left = `${state.guessPosition}%`;
  progressMarker.setAttribute("aria-hidden", "true");

  progressPoints.replaceChildren();
  state.points.forEach((pointState) => {
    const { index } = pointState;
    const position = total === 1 ? 50 : (index / (total - 1)) * 100;
    const point = document.createElement("button");
    point.type = "button";
    point.className = "progress-point";
    point.style.left = `${position}%`;
    point.disabled = !pointState.isShown;
    point.setAttribute("aria-label", index === practiceIndex
      ? `Current card ${index + 1} of ${total}${answerRevealed ? ", answer revealed" : ", guess this card"}`
      : `Review card ${index + 1} of ${total}`);
    if (pointState.isDark) point.classList.add("is-reached");
    if (pointState.isReviewRange) point.classList.add("is-review-range");
    if (pointState.isCurrent) {
      point.classList.add("is-current");
      point.setAttribute("aria-current", "step");
      if (pointState.isGuessing) point.classList.add("is-guessing");
    }
    if (pointState.isReviewing) point.classList.add("is-reviewing");
    point.addEventListener("click", () => reviewPracticeCard(index));
    progressPoints.append(point);
  });
  progressPoints.append(progressMarker);
  progressFill.style.width = `${state.darkPosition}%`;
  progressReviewFill.style.left = `${state.reviewPosition}%`;
  progressReviewFill.style.width = `${state.reviewWidth}%`;
  progressTrack.setAttribute("aria-label", `Session progress, card ${shown} of ${total}. Click a shown dot to review it. The marker shows the current card.`);
  cardsRemaining.textContent = `${remaining} ${remaining === 1 ? "card" : "cards"} left`;
}

function revealAnswer() {
  if (reviewIndex !== null || practicePhase !== "guessing") return;
  window.clearTimeout(deniedSwipeFeedbackTimeout);
  answerRevealed = true;
  practicePhase = "flipping";
  const generation = ++flipGeneration;
  flashcard.classList.remove("is-render-reset");
  void flashcardInner.offsetWidth;
  flashcard.classList.add("is-flipped");
  flashcard.disabled = true;
  advancingPractice = true;
  flashcard.classList.remove("is-denied-jitter");
  if (!swipeRevealHint.classList.contains("is-hidden")) {
    swipeRevealHint.classList.remove("is-attention");
    swipeRevealHint.classList.add("is-fading");
    window.setTimeout(() => {
      swipeRevealHint.classList.add("is-hidden");
      swipeRevealHint.classList.remove("is-fading");
    }, 1000);
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    finishFlip(generation);
  } else {
    window.clearTimeout(flipUnlockTimer);
    flipUnlockTimer = window.setTimeout(() => finishFlip(generation), 450);
  }
  renderSessionProgress();
}

function finishFlip(generation) {
  if (generation !== flipGeneration || practicePhase !== "flipping") return;
  window.clearTimeout(flipUnlockTimer);
  flipUnlockTimer = null;
  practicePhase = "revealed";
  revealHint.hidden = true;
  flashcard.disabled = false;
  advancingPractice = false;
  flashcardFront.setAttribute("aria-hidden", "true");
  flashcardBack.setAttribute("aria-hidden", "false");
  flashcard.setAttribute("aria-expanded", "true");
  flashcard.setAttribute("aria-label", "Answer revealed. Select to mark correct.");
  const entry = practiceDeck[practiceIndex];
  practiceAnnouncement.textContent = sessionDirection === "english" ? entry?.card?.japanese : entry?.meanings?.join("; ");
  rememberLaterButton.disabled = reviewIndex !== null;
  rememberLaterButton.classList.toggle("is-active", reviewIndex === null);
  renderSessionProgress();
}

flashcardInner.addEventListener("transitionend", (event) => {
  if (event.target === flashcardInner && event.propertyName === "transform" && practicePhase === "flipping") finishFlip(flipGeneration);
});

function cancelPracticeTimers() {
  correctConfirmationGeneration += 1;
  flipGeneration += 1;
  practiceAdvanceGeneration += 1;
  window.clearTimeout(correctConfirmationTimer);
  window.clearTimeout(flipUnlockTimer);
  window.clearTimeout(practiceAdvanceTimer);
  correctConfirmationTimer = null;
  flipUnlockTimer = null;
  practiceAdvanceTimer = null;
}

function commitCurrentGrade(grade) {
  if (reviewIndex !== null || practicePhase !== "revealed" || attemptGrades[practiceIndex] !== null) return false;
  const entry = practiceDeck[practiceIndex];
  if (!entry) return false;
  wordPopupBlocksCardAdvance = false;
  hideWordTranslationPopup();
  const card = sessionDirection === "english" ? entry.card : entry;
  attemptGrades[practiceIndex] = grade;
  commitLearning(card, grade);
  return true;
}

function confirmCurrentCorrect() {
  if (!commitCurrentGrade("correct")) return;
  practicePhase = "confirmingCorrect";
  advancingPractice = true;
  flashcard.disabled = true;
  rememberLaterButton.disabled = true;
  rememberLaterButton.classList.remove("is-active");
  flashcard.setAttribute("aria-label", "Marked correct");
  const generation = ++correctConfirmationGeneration;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    flashcard.classList.add("is-correct-hold");
    correctConfirmationTimer = window.setTimeout(() => finishCorrectConfirmation(generation), 510);
  } else {
    flashcard.classList.remove("is-correct-hold", "is-confirming-correct");
    void flashcard.offsetWidth;
    flashcard.classList.add("is-confirming-correct");
    correctConfirmationTimer = window.setTimeout(() => {
      if (generation !== correctConfirmationGeneration) return;
      flashcard.classList.remove("is-confirming-correct");
      flashcard.classList.add("is-correct-hold");
      correctConfirmationTimer = window.setTimeout(() => finishCorrectConfirmation(generation), 150);
    }, 360);
  }
}

function finishCorrectConfirmation(generation) {
  if (generation !== correctConfirmationGeneration || practicePhase !== "confirmingCorrect") return;
  correctConfirmationTimer = null;
  flashcard.classList.remove("is-correct-hold");
  practicePhase = "revealed";
  advancingPractice = false;
  advancePractice();
}

function commitCurrentMiss() {
  if (!commitCurrentGrade("incorrect")) return false;
  practicePhase = "committingMiss";
  advancingPractice = true;
  flashcard.disabled = true;
  rememberLaterButton.disabled = true;
  rememberLaterButton.classList.remove("is-active");
  flashcard.classList.remove("is-dragging", "is-drag-snap");
  clearFlashcardDragStyles();
  flashcard.classList.add("is-swipe-exit-down");
  practicePhase = "exiting";
  const generation = ++practiceAdvanceGeneration;
  practiceAdvanceTimer = window.setTimeout(() => {
    if (generation !== practiceAdvanceGeneration || screens.practice.hidden) return;
    practiceAdvanceTimer = null;
    finishPracticeAdvance();
  }, 190);
  return true;
}

function reviewPracticeCard(index) {
  if (advancingPractice || !shownPracticeIndices.has(index)) return;
  if (correctConfirmationTimer !== null) cancelPracticeTimers();
  reviewIndex = index === practiceIndex ? null : index;
  renderPracticeCard();
}

function advanceReview(entranceAnimation = "") {
  if (reviewIndex === null) return;
  reviewIndex = nextReviewIndex(reviewIndex, practiceIndex);
  renderPracticeCard(entranceAnimation);
}

function handleFlashcardAction() {
  if (flashcard.disabled || practicePhase === "flipping" || practicePhase === "confirmingCorrect" || practicePhase === "committingMiss" || practicePhase === "exiting" || practicePhase === "summary") return;
  if (reviewIndex !== null) {
    transitionFlashcardSwipe(-1, () => advanceReview("is-swipe-enter-from-right"));
  } else if (practicePhase === "revealed") {
    confirmCurrentCorrect();
  } else {
    revealAnswer();
  }
}

function finishPracticeAdvance(entranceAnimation = "is-swipe-enter-from-right") {
  if (practiceIndex === practiceTarget - 1) {
    progressLabel.textContent = `${practiceTarget} of ${practiceTarget} completed`;
    renderPracticeSummary();
    return;
  }
  practiceIndex += 1;
  reviewIndex = null;
  answerRevealed = false;
  practicePhase = "guessing";
  renderPracticeCard(entranceAnimation);
}

function renderPracticeSummary() {
  cancelPracticeTimers();
  wordPopupBlocksCardAdvance = false;
  hideWordTranslationPopup();
  practicePhase = "summary";
  const correct = attemptGrades.filter((grade) => grade === "correct").length;
  summaryCorrect.textContent = `${correct} / ${practiceTarget} correct`;
  summaryMissedList.replaceChildren();
  const missed = attemptGrades.flatMap((grade, index) => grade === "incorrect" ? [{ entry: practiceDeck[index], index }] : []);
  if (!missed.length) {
    const item = document.createElement("li");
    item.textContent = "No failed cards.";
    summaryMissedList.append(item);
  } else {
    missed.forEach(({ entry, index }) => {
      const card = sessionDirection === "english" ? entry.card : entry;
      const prompt = sessionDirection === "english" ? entry.meaning : card.japanese;
      const answer = sessionDirection === "english" ? `${card.japanese} (${card.hiragana})` : card.meanings.join(" · ");
      const item = document.createElement("li");
      item.dataset.attemptIndex = String(index);
      const promptNode = document.createElement("strong");
      promptNode.textContent = prompt;
      const answerNode = document.createElement("span");
      answerNode.textContent = answer;
      item.append(promptNode, answerNode);
      summaryMissedList.append(item);
    });
  }
  document.querySelector(".practice-content").hidden = true;
  practiceSummary.hidden = false;
  rememberLaterButton.disabled = true;
  rememberLaterButton.classList.remove("is-active");
}

function advancePractice() {
  if (advancingPractice || reviewIndex !== null) return;
  practicePhase = "exiting";
  transitionFlashcardSwipe(-1, () => finishPracticeAdvance());
}

function clearFlashcardDragStyles() {
  flashcard.style.removeProperty("--drag-x");
  flashcard.style.removeProperty("--drag-y");
  flashcard.style.removeProperty("--drag-rotation");
  flashcard.style.removeProperty("--drag-opacity");
  flashcard.style.removeProperty("--drag-miss-opacity");
  flashcard.style.removeProperty("--flashcard-drag-bg");
  rememberLaterButton.style.removeProperty("--drop-lift");
  rememberLaterButton.classList.remove("is-drop-approaching");
}

function resetFlashcardDrag() {
  flashcardDrag = null;
  flashcard.classList.remove("is-dragging");
  flashcard.classList.add("is-drag-snap");
  clearFlashcardDragStyles();
  window.setTimeout(() => flashcard.classList.remove("is-drag-snap"), 200);
}

function startFlashcardDrag(event) {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || advancingPractice) return;
  lastPointerType = event.pointerType;
  flashcard.classList.remove("is-entering", "is-swipe-enter-from-left", "is-swipe-enter-from-right", "is-drag-snap");
  flashcardDrag = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startTarget: event.target,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    axis: null,
    dragging: false,
  };
  flashcard.setPointerCapture(event.pointerId);
}

function moveFlashcardDrag(event) {
  if (!flashcardDrag || event.pointerId !== flashcardDrag.pointerId) return;
  const deltaX = event.clientX - flashcardDrag.startX;
  const deltaY = event.clientY - flashcardDrag.startY;
  flashcardDrag.deltaX = deltaX;
  flashcardDrag.deltaY = deltaY;
  if (!flashcardDrag.axis) {
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
    if (Math.abs(deltaX) >= Math.abs(deltaY)) flashcardDrag.axis = "horizontal";
    else if (reviewIndex === null && practicePhase === "revealed" && deltaY > 0) flashcardDrag.axis = "vertical";
    else return;
    flashcardDrag.dragging = true;
    flashcard.classList.add("is-dragging");
  }
  if (event.cancelable) event.preventDefault();
  const rect = flashcard.getBoundingClientRect();
  const width = rect.width || 320;
  const horizontalRatio = deltaX / width;
  if (flashcardDrag.axis === "horizontal") {
    flashcard.style.setProperty("--drag-x", `${deltaX}px`);
    flashcard.style.setProperty("--drag-rotation", `${Math.max(-9, Math.min(9, horizontalRatio * 16))}deg`);
  } else {
    const threshold = Math.max(80, (rect.height || 280) * 0.22);
    const ratio = Math.max(0, Math.min(1, deltaY / threshold));
    flashcard.style.setProperty("--drag-y", `${deltaY}px`);
    flashcard.style.setProperty("--drag-opacity", String(Math.max(0.48, 1 - ratio * 0.45)));
    flashcard.style.setProperty("--drag-miss-opacity", String(ratio));
    flashcard.style.setProperty("--flashcard-drag-bg", `rgba(194, 54, 47, ${ratio * 0.3})`);
    rememberLaterButton.style.setProperty("--drop-lift", `${Math.min(deltaY * 0.45, 38)}px`);
    rememberLaterButton.classList.toggle("is-drop-approaching", ratio > 0.08);
    return;
  }
  if (reviewIndex === null && practicePhase === "guessing" && deltaX < 0) {
    const redTint = Math.min(0.38, Math.abs(horizontalRatio) * 0.75);
    flashcard.style.setProperty("--flashcard-drag-bg", `rgba(194, 54, 47, ${redTint})`);
  } else {
    flashcard.style.removeProperty("--flashcard-drag-bg");
  }
}

function transitionFlashcardSwipe(direction, updateCard) {
  if (advancingPractice) return false;
  advancingPractice = true;
  flashcard.disabled = true;
  rememberLaterButton.disabled = true;
  rememberLaterButton.classList.remove("is-active");
  flashcard.classList.remove("is-dragging", "is-drag-snap", "is-entering", "is-swipe-enter-from-left", "is-swipe-enter-from-right");
  clearFlashcardDragStyles();
  flashcard.classList.add(direction < 0 ? "is-swipe-exit-left" : "is-swipe-exit-right");
  const generation = ++practiceAdvanceGeneration;
  practiceAdvanceTimer = window.setTimeout(() => {
    if (generation !== practiceAdvanceGeneration || screens.practice.hidden) return;
    practiceAdvanceTimer = null;
    updateCard();
  }, 190);
  return true;
}

function navigateWithFlashcardSwipe(direction) {
  if (direction < 0) {
    if (reviewIndex === null && practicePhase !== "revealed") return false;
    if (reviewIndex !== null) {
      if (reviewIndex >= practiceIndex) return false;
      return transitionFlashcardSwipe(direction, () => advanceReview("is-swipe-enter-from-right"));
    }
    return transitionFlashcardSwipe(direction, () => finishPracticeAdvance());
  }

  const currentIndex = reviewIndex ?? practiceIndex;
  if (currentIndex <= 0) return false;
  return transitionFlashcardSwipe(direction, () => {
    reviewIndex = currentIndex - 1;
    renderPracticeCard("is-swipe-enter-from-left");
  });
}

function showSwipeDeniedFeedback() {
  swipeRevealHint.classList.remove("is-hidden");
  swipeRevealHint.classList.remove("is-fading");
  swipeRevealHint.classList.add("is-attention");
  resetFlashcardDrag();
  window.clearTimeout(deniedSwipeFeedbackTimeout);
  deniedSwipeFeedbackTimeout = window.setTimeout(() => {
    flashcard.classList.remove("is-drag-snap");
    flashcard.classList.add("is-denied-jitter");
    window.setTimeout(() => flashcard.classList.remove("is-denied-jitter"), 320);
  }, 185);
}

function endFlashcardDrag(event) {
  if (!flashcardDrag || event.pointerId !== flashcardDrag.pointerId) return;
  const { dragging, deltaX, deltaY, axis, startTarget, pointerType } = flashcardDrag;
  flashcardDrag = null;
  const startedOnRomajiToken = startTarget instanceof Element && startTarget.closest(".romaji-token");
  if (!dragging) {
    if (pointerType !== "mouse" && (answerRevealed || reviewIndex !== null)) {
      lastTappedRomajiToken = startedOnRomajiToken || null;
      window.clearTimeout(lastTappedRomajiTokenTimeout);
      lastTappedRomajiTokenTimeout = window.setTimeout(() => { lastTappedRomajiToken = null; }, 500);
    }
    return;
  }

  if (wordPopupBlocksCardAdvance && !startedOnRomajiToken) {
    wordPopupBlocksCardAdvance = false;
    suppressFlashcardClick = true;
    window.clearTimeout(suppressFlashcardClickTimeout);
    suppressFlashcardClickTimeout = window.setTimeout(() => { suppressFlashcardClick = false; }, 0);
    resetFlashcardDrag();
    return;
  }

  suppressFlashcardClick = true;
  window.clearTimeout(suppressFlashcardClickTimeout);
  suppressFlashcardClickTimeout = window.setTimeout(() => { suppressFlashcardClick = false; }, 0);

  const width = flashcard.getBoundingClientRect().width || 320;
  const rect = flashcard.getBoundingClientRect();
  const horizontalThreshold = Math.max(60, width * 0.18);
  const verticalThreshold = Math.max(80, (rect.height || 280) * 0.22);
  if (axis === "vertical") {
    if (deltaY >= verticalThreshold && commitCurrentMiss()) return;
    resetFlashcardDrag();
    return;
  }
  if (axis === "horizontal" && Math.abs(deltaX) >= horizontalThreshold && deltaX < 0 && reviewIndex === null && practicePhase === "guessing") {
    showSwipeDeniedFeedback();
    return;
  }
  if (axis === "horizontal" && Math.abs(deltaX) >= horizontalThreshold && deltaX < 0 && reviewIndex === null && practicePhase === "revealed") {
    flashcard.classList.remove("is-dragging", "is-drag-snap");
    clearFlashcardDragStyles();
    if (!commitCurrentGrade("correct")) return;
    practicePhase = "exiting";
    transitionFlashcardSwipe(-1, () => finishPracticeAdvance());
    return;
  }
  if (axis === "horizontal" && Math.abs(deltaX) >= horizontalThreshold && navigateWithFlashcardSwipe(deltaX < 0 ? -1 : 1)) return;
  resetFlashcardDrag();
}

function cancelFlashcardDrag(event) {
  if (!flashcardDrag || event.pointerId !== flashcardDrag.pointerId) return;
  const startedOutsideRomajiToken = !(flashcardDrag.startTarget instanceof Element
    && flashcardDrag.startTarget.closest(".romaji-token"));
  if (flashcardDrag.dragging) {
    suppressFlashcardClick = true;
    window.clearTimeout(suppressFlashcardClickTimeout);
    suppressFlashcardClickTimeout = window.setTimeout(() => { suppressFlashcardClick = false; }, 0);
  }
  if (startedOutsideRomajiToken && wordTranslationPopup.hidden) wordPopupBlocksCardAdvance = false;
  resetFlashcardDrag();
}

function handleFlashcardClick(event) {
  if (suppressFlashcardClick) {
    suppressFlashcardClick = false;
    window.clearTimeout(suppressFlashcardClickTimeout);
    event.preventDefault();
    return;
  }
  const clickedToken = event.target instanceof Element ? event.target.closest(".romaji-token") : null;
  const token = clickedToken || lastTappedRomajiToken;
  lastTappedRomajiToken = null;
  window.clearTimeout(lastTappedRomajiTokenTimeout);
  if (wordPopupBlocksCardAdvance && !token) {
    wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (token && (answerRevealed || reviewIndex !== null)) {
    event.preventDefault();
    event.stopPropagation();
    const mode = lastPointerType === "mouse" ? "hover" : "anchor";
    wordPopupBlocksCardAdvance = mode === "anchor";
    showWordTranslation(token, mode, event.clientX, event.clientY);
    return;
  }
  handleFlashcardAction();
}

function handleRememberLaterAction(event) {
  if (rememberLaterButton.disabled || reviewIndex !== null || practicePhase !== "revealed") return;
  const dismissOnly = rememberPopupDismissTap || wordPopupBlocksCardAdvance || !wordTranslationPopup.hidden;
  rememberPopupDismissTap = false;
  if (dismissOnly) {
    wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
    event.preventDefault();
    return;
  }
  commitCurrentMiss();
}

flashcard.addEventListener("pointerover", (event) => {
  if (event.pointerType !== "mouse" || (!answerRevealed && reviewIndex === null)) return;
  const token = event.target instanceof Element ? event.target.closest(".romaji-token") : null;
  if (token) showWordTranslation(token, "hover", event.clientX, event.clientY);
});

document.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || activePopupMode !== "hover" || !activeRomajiToken) return;
  const token = event.target instanceof Element ? event.target.closest(".romaji-token") : null;
  if (token && token !== activeRomajiToken && flashcard.contains(token)) {
    showWordTranslation(token, "hover", event.clientX, event.clientY);
    return;
  }
  const rect = activeRomajiToken.getBoundingClientRect();
  const margin = 8;
  const outside = event.clientX < rect.left - margin || event.clientX > rect.right + margin
    || event.clientY < rect.top - margin || event.clientY > rect.bottom + margin;
  if (outside) {
    hideWordTranslationPopup();
    return;
  }
  activePopupPointer = { x: event.clientX, y: event.clientY };
  if (!wordTranslationPopup.hidden) positionWordTranslationPopup(event.clientX, event.clientY);
});

document.addEventListener("pointerdown", (event) => {
  lastPointerType = event.pointerType;
  const token = event.target instanceof Element ? event.target.closest(".romaji-token") : null;
  const popup = event.target instanceof Element ? event.target.closest(".word-translation-popup") : null;
  if (event.pointerType !== "mouse" && !token && !popup) {
    if (!flashcard.contains(event.target)) wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
  }
});

document.addEventListener("click", (event) => {
  const token = event.target instanceof Element ? event.target.closest(".romaji-token") : null;
  if (!token) {
    wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
  }
});

startButton.addEventListener("click", startPractice);
sessionOptions.forEach((button) => button.addEventListener("click", () => {
  selectedSessionSize = button.dataset.sessionSize === "all" ? "all" : Number(button.dataset.sessionSize);
  sessionOptions.forEach((option) => {
    const isSelected = option === button;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
}));
function startAddingWord() {
  cardForm.reset();
  resetMeaningInputs();
  editingCardIndex = null;
  formReturnScreen = "home";
  hiraganaManuallyEdited = false;
  addFeedback.hidden = true;
  window.clearTimeout(addFeedbackTimeout);
  formTitle.textContent = "Add a new Card";
  formSubmitButton.textContent = "Add";
  cancelEditButton.hidden = true;
  backToLearningButton.hidden = false;
  enterHint.hidden = false;
  closeDeckMenu();
  showScreen("add");
  japaneseInput.focus();
}

async function openDefaultDecks() {
  if (!screens.deck.hidden) deckFeatureReturnScreen = "deck";
  closeDeckMenu();
  showScreen("defaults");
  defaultDeckList.replaceChildren();
  defaultDecksCount.textContent = "";
  defaultDecksStatus.textContent = "Loading available decks…";
  try {
    const response = await fetch("decks/manifest.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Deck catalog request failed (${response.status}).`);
    const catalog = await response.json();
    if (!Array.isArray(catalog.decks) || catalog.decks.length === 0) {
      throw new Error("No default decks are available yet.");
    }
    const spanish = sessionStorage.getItem("japanese-cards.current-language") === "es";
    const decks = spanish ? catalog.decks.map((deck) => ({
      ...deck,
      name: `Más comunes - ${deck.count.toLocaleString("es-ES")}${deck.spanishFile ? "" : " (en inglés)"}`,
      file: deck.spanishFile || deck.file,
    })) : catalog.decks;
    renderDefaultDecks(decks);
    const importButton = document.createElement("button");
    importButton.className = "default-deck-option own-deck-option";
    importButton.type = "button";
    importButton.textContent = "Import my own deck";
    importButton.addEventListener("click", () => importFile.click());
    defaultDeckList.append(importButton);
    defaultDecksStatus.textContent = "";
  } catch (error) {
    defaultDecksStatus.textContent = defaultDeckErrorMessage("decks/manifest.json", error);
    const retryButton = document.createElement("button");
    retryButton.className = "secondary-button default-deck-retry";
    retryButton.type = "button";
    retryButton.textContent = "Try again";
    retryButton.addEventListener("click", openDefaultDecks, { once: true });
    defaultDeckList.replaceChildren(retryButton);
    console.error("Unable to load default deck catalog:", error);
  }
}

function renderDefaultDecks(decks) {
  defaultDecksCount.textContent = decks.length === 1 ? "1 available" : `${decks.length} available`;
  const fragment = document.createDocumentFragment();
  decks.forEach((deck) => {
    if (typeof deck.id !== "string" || typeof deck.name !== "string" || typeof deck.file !== "string" || !Number.isInteger(deck.count) || deck.count < 1) return;
    const button = document.createElement("button");
    button.className = "default-deck-option";
    button.type = "button";
    const name = document.createElement("strong");
    name.textContent = deck.name;
    const description = document.createElement("span");
    description.textContent = `${deck.count} ${deck.count === 1 ? "card" : "cards"}`;
    button.append(name, description);
    button.addEventListener("click", () => requestDefaultDeckLoad(deck));
    fragment.append(button);
  });
  defaultDeckList.replaceChildren(fragment);
}

function requestDefaultDeckLoad(deck) {
  pendingDefaultDeck = deck;
  defaultDeckConfirmTitle.textContent = cards.length ? "Replace your deck?" : "Load this deck?";
  defaultDeckConfirmDescription.textContent = cards.length
    ? `“${deck.name}” contains ${deck.count} cards. It will replace your current deck of ${cards.length} ${cards.length === 1 ? "card" : "cards"}.`
    : `Load “${deck.name}” with ${deck.count} cards?`;
  defaultDeckConfirmWarning.textContent = cards.length
    ? "This cannot be undone. Export a backup first if you want to keep your current cards."
    : "The cards will be saved in this browser.";
  defaultDeckConfirmStatus.textContent = "";
  confirmDefaultDeckLoadButton.textContent = cards.length ? "Replace and load" : "Load deck";
  confirmDefaultDeckLoadButton.disabled = false;
  cancelDefaultDeckLoadButton.disabled = false;
  showScreen("defaultConfirm");
  cancelDefaultDeckLoadButton.focus();
}

function cancelDefaultDeckLoad() {
  if (defaultDeckLoadInProgress) return;
  pendingDefaultDeck = null;
  returnFromDeckFeature();
}

async function loadDefaultDeck() {
  const deck = pendingDefaultDeck;
  if (!deck || defaultDeckLoadInProgress) return;
  defaultDeckLoadInProgress = true;
  defaultDeckConfirmStatus.textContent = `Loading “${deck.name}”…`;
  confirmDefaultDeckLoadButton.disabled = true;
  confirmDefaultDeckLoadButton.textContent = "Loading…";
  cancelDefaultDeckLoadButton.disabled = true;
  try {
    const response = await fetch(`decks/${deck.file.split("/").map(encodeURIComponent).join("/")}`);
    if (!response.ok) throw new Error(`Deck request failed (${response.status}).`);
    const source = await response.json();
    const importedCards = prepareDefaultDeck(source, deck.count);
    const defaultDeckId = defaultDeckIdentityId(deck.file);
    if (!saveCards(importedCards, defaultDeckId)) throw new Error("The new deck could not be saved in this browser.");
    cards = importedCards;
    renderDeckList();
    pendingDefaultDeck = null;
    returnFromDeckFeature();
  } catch (error) {
    defaultDeckConfirmStatus.textContent = `${defaultDeckErrorMessage(`decks/${deck.file}`, error)} Your current deck is unchanged; try again.`;
    confirmDefaultDeckLoadButton.disabled = false;
    confirmDefaultDeckLoadButton.textContent = cards.length ? "Replace and load" : "Load deck";
    cancelDefaultDeckLoadButton.disabled = false;
    console.error("Unable to load default deck:", error);
  } finally {
    defaultDeckLoadInProgress = false;
  }
}

function defaultDeckErrorMessage(resource, error) {
  if (window.location.protocol === "file:") {
    return "This page was opened directly from disk. Open Japanese Cards through a website or local web server to load its JSON decks.";
  }
  const url = new URL(resource, document.baseURI);
  const statusMatch = String(error?.message || "").match(/\((\d{3})\)/);
  if (statusMatch) return `The deck file at ${url.pathname} returned HTTP ${statusMatch[1]}.`;
  return `Could not load ${url.pathname}. Check the connection and try again.`;
}

function startEditingCard(index) {
  const card = cards[index];
  if (!card) return;
  editingDeckScrollTop = wordList.scrollTop;
  editingPageScrollTop = window.scrollY;
  editingCardIndex = index;
  formReturnScreen = "deck";
  hiraganaManuallyEdited = false;
  japaneseInput.value = card.japanese;
  hiraganaInput.value = card.hiragana || romajiToHiragana(card.japanese);
  resetMeaningInputs(card.meanings?.length ? card.meanings : [card.english], card.examples || []);
  formTitle.textContent = "Edit word";
  formSubmitButton.textContent = "Save changes";
  cancelEditButton.hidden = false;
  backToLearningButton.hidden = true;
  enterHint.hidden = true;
  showScreen("add", () => {
    if (editingCardIndex !== index) return;
    englishMeanings.querySelectorAll(".meaning-entry-group").forEach(group => {
      void exampleControllers.get(group)?.inspect();
    });
    japaneseInput.focus();
  });
}

function cancelCardForm() {
  const returnScreen = formReturnScreen;
  const editedIndex = editingCardIndex;
  editingCardIndex = null;
  showScreen(returnScreen, () => {
    if (returnScreen === "deck" && editedIndex !== null) focusDeckCard(editedIndex, false);
  });
}

function focusDeckCard(index, highlight = true) {
  renderDeckList(highlight ? index : -1);
  const row = wordList.children[index + 1];
  wordList.scrollTop = editingDeckScrollTop;
  lastDeckScrollTop = editingDeckScrollTop;
  window.scrollTo(0, editingPageScrollTop);
  row?.querySelector(".edit-word-button")?.focus({ preventScroll: true });
}

wordList.addEventListener("scroll", () => { lastDeckScrollTop = wordList.scrollTop; }, { passive: true });

function compactHiragana(value) {
  return String(value || "").replace(/\s+/g, "");
}

function showAddFeedback(japanese) {
  window.clearTimeout(addFeedbackTimeout);
  addFeedback.textContent = `Added “${japanese}” to your deck.`;
  addFeedback.hidden = false;
  addFeedback.classList.remove("is-visible");
  void addFeedback.offsetWidth;
  addFeedback.classList.add("is-visible");
  addFeedbackTimeout = window.setTimeout(() => {
    addFeedback.classList.remove("is-visible");
    addFeedback.hidden = true;
  }, 2600);
}

function confirmClearDeck() {
  deckFeatureReturnScreen = screens.deck.hidden ? "home" : "deck";
  document.querySelector("#clear-description").textContent = cards.length === 1
    ? "This will delete the 1 card saved in this browser."
    : `This will delete all ${cards.length} cards saved in this browser.`;
  closeDeckMenu();
  showScreen("clear");
}

function clearDeck() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    window.alert("The saved deck could not be deleted from this browser.");
    return;
  }
  cards = [];
  activeDeckId = makeDeckId("custom");
  persistActiveDeckIdentity(activeDeckId);
  storageWarning = "";
  renderDeckList();
  returnFromDeckFeature();
}

addButton.addEventListener("click", () => {
  renderDeckList();
  showScreen("deck");
});
deckToolsButton.addEventListener("click", (event) => {
  if (event.detail === 0 || lastPointerType !== "mouse" || window.matchMedia("(hover: none)").matches) {
    if (deckTools.classList.contains("is-open")) closeDeckMenu();
    else openDeckMenu();
  }
});
deckTools.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "mouse") openDeckMenu();
});
deckTools.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") closeDeckMenu();
});
deckTools.addEventListener("focusin", () => {
  if (keyboardNavigation) openDeckMenu();
});
deckTools.addEventListener("focusout", (event) => {
  if (!deckTools.contains(event.relatedTarget)) closeDeckMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") keyboardNavigation = true;
});
document.addEventListener("pointerdown", (event) => {
  keyboardNavigation = false;
  if (!deckTools.contains(event.target)) closeDeckMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && deckTools.classList.contains("is-open")) {
    closeDeckMenu();
    keyboardNavigation = false;
    deckToolsButton.focus();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !screens.defaultConfirm.hidden && !defaultDeckLoadInProgress) {
    cancelDefaultDeckLoad();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!screens.defaults.hidden || !screens.clear.hidden || (!screens.export.hidden && !exportInProgress)) {
    returnFromDeckFeature();
  }
});
document.querySelector("#export-action").addEventListener("click", exportDeck);
document.querySelector("#settings-button").addEventListener("click", openSettings);
window.addEventListener("japanese-cards:show-settings", openSettings);
document.querySelectorAll("[data-go-settings]").forEach(button => button.addEventListener("click", openSettings));
document.querySelector("#about-button").addEventListener("click", () => showScreen("about"));
document.querySelector("#export-form").addEventListener("submit", saveDeckExport);
document.querySelector("#cancel-export").addEventListener("click", () => { if (!exportInProgress) returnFromDeckFeature(); });
document.querySelector("#import-action").addEventListener("click", openDefaultDecks);
document.querySelector("#clear-action").addEventListener("click", confirmClearDeck);
document.querySelector("#confirm-clear").addEventListener("click", clearDeck);
document.querySelector("#default-decks-back-button").addEventListener("click", returnFromDeckFeature);
document.querySelector("#cancel-clear").addEventListener("click", returnFromDeckFeature);
cancelDefaultDeckLoadButton.addEventListener("click", cancelDefaultDeckLoad);
confirmDefaultDeckLoadButton.addEventListener("click", loadDefaultDeck);
importFile.addEventListener("change", () => importDeck(importFile.files?.[0]));
importFile.addEventListener("cancel", returnFromDeckFeature);
backToLearningButton.addEventListener("click", cancelCardForm);

wordList.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.matches(".deck-entry-example-hiragana")) {
    event.target.dataset.manuallyEdited = "true";
    return;
  }
  if (event.target.matches(".deck-entry-example-romaji")) {
    const hiragana = event.target.closest(".deck-entry-meaning-group")?.querySelector(".deck-entry-example-hiragana");
    if (hiragana && shouldAutoConvertHiragana(hiragana.dataset.manuallyEdited === "true", hiragana.value)) {
      hiragana.value = compactHiragana(romajiToHiragana(event.target.value.trim()));
      hiragana.dataset.manuallyEdited = "false";
    }
    return;
  }
  if (event.target.matches(".deck-entry-hiragana")) {
    event.target.dataset.manuallyEdited = "true";
    return;
  }
  if (!event.target.matches(".deck-entry-japanese")) return;
  const row = event.target.closest(".deck-entry-row");
  if (event.target.value.trim() === "") clearCardDependentFields(row);
  filterDeckList(event.target.value);
  const hiragana = row?.querySelector(".deck-entry-hiragana");
  if (hiragana && shouldAutoConvertHiragana(hiragana.dataset.manuallyEdited === "true", hiragana.value)) {
    hiragana.value = compactHiragana(romajiToHiragana(event.target.value.trim()));
    hiragana.dataset.manuallyEdited = "false";
  }
});

wordList.addEventListener("focusin", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const row = event.target.closest(".deck-entry-row");
  const group = event.target.closest(".deck-entry-meaning-group");
  if (row && group) showDeckMeaningHints(row, group);
});

wordList.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLInputElement) && !event.target.matches(".example-previous-button, .example-next-button")) return;
  const row = event.target.closest(".deck-entry-row");
  if (!row) return;
  const isPreviousButton = event.target.matches(".example-previous-button");
  const isNextButton = event.target.matches(".example-next-button");
  const isJapaneseField = event.target.matches(".deck-entry-japanese");
  const isMeaningField = event.target.matches(".deck-entry-meaning");
  const isExampleRomajiField = event.target.matches(".deck-entry-example-romaji");
  const isExampleHiraganaField = event.target.matches(".deck-entry-example-hiragana");
  const isExampleEndField = event.target.matches(".deck-entry-example-english");
  if (!isJapaneseField && !isMeaningField && !isExampleRomajiField && !isExampleHiraganaField && !isExampleEndField && !isPreviousButton && !isNextButton) return;
  if (event.key === "Escape" && isJapaneseField) {
    event.preventDefault();
    event.target.value = "";
    clearCardDependentFields(row);
    filterDeckList("");
    return;
  }
  const meaningInputs = [...row.querySelectorAll(".deck-entry-meaning")];
  const meaningIndex = meaningInputs.indexOf(event.target.closest(".deck-entry-meaning-group")?.querySelector(".deck-entry-meaning"));
  const isLastGroup = meaningIndex === meaningInputs.length - 1;
  const group = event.target.closest(".deck-entry-meaning-group");
  const previousButton = group?.querySelector(".example-previous-button");
  const nextButton = group?.querySelector(".example-next-button");
  if (event.key === "Tab" && !event.shiftKey && isJapaneseField) {
    event.preventDefault();
    meaningInputs[0]?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isExampleRomajiField) {
    event.preventDefault();
    group?.querySelector(".deck-entry-example-english")?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isPreviousButton) {
    event.preventDefault();
    (nextButton && !nextButton.disabled ? nextButton : group?.querySelector(".deck-entry-example-english"))?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isNextButton) {
    event.preventDefault();
    group?.querySelector(".deck-entry-example-english")?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isExampleEndField && isLastGroup) {
    event.preventDefault();
    const nextGroup = createDeckMeaningInput();
    row.querySelector(".deck-entry-meanings").append(nextGroup);
    setupExampleFields(nextGroup, row);
    nextGroup.querySelector(".deck-entry-meaning").focus();
  } else if (event.key === "Enter" && isExampleRomajiField) {
    event.preventDefault();
    addDeckEntry();
  } else if (event.key === "Enter" && isExampleHiraganaField) {
    event.preventDefault();
    addDeckEntry();
  } else if (event.key === "Enter" && isExampleEndField && isLastGroup) {
    event.preventDefault();
    addDeckEntry();
  } else if (event.key === "Enter" && (isMeaningField || isExampleEndField)) {
    event.preventDefault();
    addDeckEntry();
  }
});

cardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (cardForm.dataset.saving === "true") return;
  cardForm.dataset.saving = "true";
  try {
    await waitForExampleSuggestions(cardForm);
    const signature = exampleFormSignature(cardForm);
    const editingIndex = editingCardIndex;
    const japanese = japaneseInput.value.trim();
    const hiragana = compactHiragana(hiraganaInput.value.trim() || romajiToHiragana(japanese));
    const meaningEntries = [...englishMeanings.querySelectorAll(".meaning-entry-group")].map((group) => ({
      meaning: group.querySelector(".meaning-translation").value.trim(),
      example: {
        romaji: group.querySelector(".meaning-example-romaji").value.trim(),
        hiragana: compactHiragana(group.querySelector(".meaning-example-hiragana").value.trim() || romajiToHiragana(group.querySelector(".meaning-example-romaji").value.trim())),
        english: group.querySelector(".meaning-example-english").value.trim(),
      },
    })).filter((entry) => entry.meaning);
    const meanings = meaningEntries.map((entry) => entry.meaning);
    let examples = meaningEntries.map((entry, index) => {
      const previousCard = editingCardIndex !== null ? cards[editingCardIndex] : null;
      const previous = previousCard?.examples?.[index];
      const current = entry.example;
      const unchanged = previous?.romaji === current.romaji && previous?.hiragana === current.hiragana
        && previous?.english === current.english && previousCard?.japanese === japanese
        && previousCard?.hiragana === hiragana
        && (previousCard?.meanings?.[index] || (index === 0 ? previousCard?.english : "")) === entry.meaning;
      return unchanged && Array.isArray(previous.wordMeanings)
        ? { ...current, wordMeanings: previous.wordMeanings } : current;
    });
    if (!japanese || meanings.length === 0) return;
    const filledGroups = [...englishMeanings.querySelectorAll(".meaning-entry-group")]
      .filter(group => group.querySelector(".meaning-translation").value.trim());
    examples = await Promise.all(examples.map((example, index) => example.wordMeanings ? example
      : prepareExampleAnnotations([filledGroups[index]], japanese, [example]).then(items => items[0])));
    if (screens.add.hidden || signature !== exampleFormSignature(cardForm) || editingIndex !== editingCardIndex) return;
    const english = meanings[0];
    const isEditing = editingCardIndex !== null;
    const save = (existingIndex = -1) => {
      if (screens.add.hidden || signature !== exampleFormSignature(cardForm) || editingIndex !== editingCardIndex) return;
      const nextCards = !isEditing && existingIndex < 0
        ? [...cards, { id: crypto.randomUUID?.() || String(Date.now()), japanese, hiragana, english, meanings, examples }]
        : updateCardAt(cards, isEditing ? editingCardIndex : existingIndex, { japanese, hiragana, english, meanings, examples });
      if (!saveCards(nextCards)) {
        window.alert("The card could not be saved in this browser. Export a backup before closing this page.");
        return;
      }
      const priorJapanese = isEditing ? cards[editingCardIndex]?.japanese : (existingIndex >= 0 ? cards[existingIndex]?.japanese : "");
      if (priorJapanese) migrateLearningKey(priorJapanese, japanese);
      cards = nextCards;
      if (!isEditing) {
        cardForm.reset();
        resetMeaningInputs();
        hiraganaManuallyEdited = false;
        renderAddDeckMatches();
        showAddFeedback(japanese);
        japaneseInput.focus();
        return;
      }
      const returnScreen = formReturnScreen;
      const editedIndex = editingCardIndex;
      editingCardIndex = null;
      showScreen(returnScreen, () => {
        if (returnScreen === "deck") focusDeckCard(editedIndex);
      });
    };
    if (isEditing) save();
    else requestCardOverwrite(japanese, save);
  } finally { cardForm.dataset.saving = "false"; }
});

japaneseInput.addEventListener("input", () => {
  if (japaneseInput.value.trim() === "") clearCardDependentFields();
  renderAddDeckMatches();
});

cardForm.addEventListener("keydown", (event) => {
  if ((!(event.target instanceof HTMLInputElement) && !event.target.matches(".example-previous-button, .example-next-button")) || !event.target.closest("#english-meanings")) return;
  const group = event.target.closest(".meaning-entry-group");
  const isPreviousButton = event.target.matches(".example-previous-button");
  const isNextButton = event.target.matches(".example-next-button");
  const groups = [...englishMeanings.querySelectorAll(".meaning-entry-group")];
  const isLastGroup = groups.at(-1) === group;
  if ((isPreviousButton || isNextButton) && (event.key === "Enter" || event.key === " ")) return;
  if (event.key === "Tab" && !event.shiftKey && isNextButton) {
    event.preventDefault();
    group.querySelector(".meaning-example-english")?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isPreviousButton) {
    event.preventDefault();
    const nextButton = group.querySelector(".example-next-button");
    (nextButton && !nextButton.disabled ? nextButton : group.querySelector(".meaning-example-english"))?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && event.target.matches(".meaning-example-romaji")) {
    event.preventDefault();
    group.querySelector(".meaning-example-english")?.focus();
    return;
  }
  if (event.key === "Tab" && !event.shiftKey && event.target.matches(".meaning-example-english") && isLastGroup) {
    event.preventDefault();
    addMeaningInput().focus();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    cardForm.requestSubmit();
  }
});

japaneseInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    japaneseInput.value = "";
    clearCardDependentFields();
    renderAddDeckMatches();
    return;
  }
  if (!shouldSkipHiraganaOnTab(event.key, event.shiftKey)) return;
  event.preventDefault();
  meaningInputs()[0]?.focus();
});

englishMeanings.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.matches(".meaning-example-hiragana")) {
    event.target.dataset.manuallyEdited = "true";
    return;
  }
  if (!event.target.matches(".meaning-example-romaji")) return;
  const hiragana = event.target.closest(".meaning-entry-group")?.querySelector(".meaning-example-hiragana");
  if (hiragana && shouldAutoConvertHiragana(hiragana.dataset.manuallyEdited === "true", hiragana.value)) {
    hiragana.value = compactHiragana(romajiToHiragana(event.target.value.trim()));
    hiragana.dataset.manuallyEdited = "false";
  }
});

japaneseInput.addEventListener("input", () => {
  if (shouldAutoConvertHiragana(hiraganaManuallyEdited, hiraganaInput.value)) {
    hiraganaInput.value = compactHiragana(romajiToHiragana(japaneseInput.value.trim()));
    hiraganaManuallyEdited = false;
  }
});

hiraganaInput.addEventListener("input", () => { hiraganaManuallyEdited = true; });

// Registered after romaji-to-hiragana conversion so readiness sees the new reading.
wordList.addEventListener("input", () => refreshExampleFields(wordList));
cardForm.addEventListener("input", () => refreshExampleFields(cardForm));
englishMeanings.querySelectorAll(".meaning-entry-group").forEach(group => setupExampleFields(group));

flashcard.addEventListener("pointerdown", startFlashcardDrag);
flashcard.addEventListener("pointermove", moveFlashcardDrag);
flashcard.addEventListener("pointerup", endFlashcardDrag);
flashcard.addEventListener("pointercancel", cancelFlashcardDrag);
flashcard.addEventListener("click", handleFlashcardClick);
rememberLaterButton.addEventListener("pointerdown", () => {
  rememberPopupDismissTap = wordPopupBlocksCardAdvance || !wordTranslationPopup.hidden;
});
rememberLaterButton.addEventListener("pointercancel", () => { rememberPopupDismissTap = false; });
rememberLaterButton.addEventListener("click", handleRememberLaterAction);
document.querySelector("#summary-back-button").addEventListener("click", () => showScreen("home"));

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || screens.practice.hidden) return;
  const target = event.target;
  if (target instanceof Element && target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
  event.preventDefault();
  handleFlashcardAction();
});

document.querySelectorAll("[data-go-home]").forEach((button) => button.addEventListener("click", () => showScreen("home")));
document.querySelector("#add-back-button").addEventListener("click", cancelCardForm);
cancelEditButton.addEventListener("click", cancelCardForm);

updateDeckCount();
void restoreContextMeaningsForSavedCards();
