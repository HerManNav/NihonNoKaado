const STORAGE_KEY = "japanese-cards.dictionary.v1";
const { parseImportedDictionary, prepareDefaultDictionary, serializeDictionary, romajiToHiragana, shouldSkipHiraganaOnTab, shouldAutoConvertHiragana, createPracticeDeck, createMeaningPracticeRun, getSessionProgressState, nextReviewIndex, removeCardAt, updateCardAt } = window.JapaneseCardsCore;
const { findWordMeanings } = window.JapaneseWordFormLookup;

const screens = {
  home: document.querySelector("#home-screen"),
  practice: document.querySelector("#practice-screen"),
  dictionary: document.querySelector("#dictionary-screen"),
  defaults: document.querySelector("#default-dictionaries-screen"),
  defaultConfirm: document.querySelector("#default-dictionary-confirm-screen"),
  add: document.querySelector("#add-screen"),
  clear: document.querySelector("#clear-screen"),
};

const startButton = document.querySelector("#start-button");
const originLanguage = document.querySelector("#origin-language");
const dictionaryCount = document.querySelector("#dictionary-count");
const dictionaryButton = document.querySelector("#dictionary-button");
const dictionaryListCount = document.querySelector("#dictionary-list-count");
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
const flashcard = document.querySelector("#flashcard");
const wordTranslationPopup = document.querySelector("#word-translation-popup");
const promptWord = document.querySelector("#prompt-word");
const answerWord = document.querySelector("#answer-word");
const revealHint = document.querySelector("#reveal-hint");
const swipeRevealHint = document.querySelector("#swipe-reveal-hint");
const progressLabel = document.querySelector("#progress-label");
const sessionOptions = document.querySelectorAll("[data-session-size]");
const progressTrack = document.querySelector("#progress-track");
const progressFill = document.querySelector("#progress-fill");
const progressReviewFill = document.querySelector("#progress-review-fill");
const progressPoints = document.querySelector("#progress-points");
const cardsRemaining = document.querySelector("#cards-remaining");
const dictionaryTools = document.querySelector("#dictionary-tools");
const dictionaryToolsButton = document.querySelector("#dictionary-tools-button");
const addButton = document.querySelector("#add-button");
const defaultDictionaryList = document.querySelector("#default-dictionary-list");
const defaultDictionariesCount = document.querySelector("#default-dictionaries-count");
const defaultDictionariesStatus = document.querySelector("#default-dictionaries-status");
const defaultDictionaryConfirmTitle = document.querySelector("#default-dictionary-confirm-title");
const defaultDictionaryConfirmDescription = document.querySelector("#default-dictionary-confirm-description");
const defaultDictionaryConfirmWarning = document.querySelector("#default-dictionary-confirm-warning");
const defaultDictionaryConfirmStatus = document.querySelector("#default-dictionary-confirm-status");
const cancelDefaultDictionaryLoadButton = document.querySelector("#cancel-default-dictionary-load");
const confirmDefaultDictionaryLoadButton = document.querySelector("#confirm-default-dictionary-load");
const importFile = document.querySelector("#import-file");
let storageWarning = "";
let editingCardIndex = null;
let formReturnScreen = "home";
let hiraganaManuallyEdited = false;
let addFeedbackTimeout = null;
let pendingDefaultDictionary = null;
let pendingDefaultDictionaryTrigger = null;
let defaultDictionaryLoadInProgress = false;

let cards = loadCards();
let practiceDeck = [];
let englishPracticeRun = null;
let practiceTarget = 0;
let practiceIndex = 0;
let reviewIndex = null;
let shownPracticeIndices = new Set();
let shownPracticeCards = new Map();
let answerRevealed = false;
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
let lastTappedRomajiToken = null;
let lastTappedRomajiTokenTimeout = null;
let lastPointerType = "mouse";

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
        const response = await fetch("dictionaries/romaji-english-jmdict-2026-11-02.json.gz?v=3", { cache: "no-cache" });
        if (!response.ok) throw new Error(`Dictionary request failed (${response.status}).`);
        if (typeof DecompressionStream !== "function") throw new Error("This browser cannot open the compressed lookup dictionary.");
        const compressed = await response.arrayBuffer();
        const jsonStream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
        const payload = await new Response(jsonStream).json();
        if (payload.format !== 3) throw new Error("The lookup dictionary needs a refresh.");
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
  const lookup = await getRomajiLookup();
  if (activeRomajiToken !== token) return;
  const meanings = findWordMeanings(key, lookup, previousKey);
  if (!meanings?.length) {
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

function appendRomajiTokens(element, value) {
  const text = String(value || "");
  const parts = text.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/g);
  parts.forEach((part) => {
    if (/^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(part)) {
      const token = document.createElement("span");
      token.className = "romaji-token";
      token.textContent = part;
      element.append(token);
    } else if (part) element.append(document.createTextNode(part));
  });
}

function loadCards() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((card) => typeof card?.japanese === "string" && (typeof card?.english === "string" || Array.isArray(card?.meanings)))
        .map((card) => {
          const meanings = (Array.isArray(card.meanings) ? card.meanings : [card.english]).filter((meaning) => typeof meaning === "string").map((meaning) => meaning.trim()).filter(Boolean);
          const examples = meanings.map((_, index) => {
            const example = Array.isArray(card.examples) ? card.examples[index] || {} : {};
            const romaji = typeof example.romaji === "string" ? example.romaji.trim() : "";
            return {
              romaji,
              hiragana: typeof example.hiragana === "string" && example.hiragana.trim() ? example.hiragana.trim() : romajiToHiragana(romaji),
              english: typeof example.english === "string" ? example.english.trim() : "",
            };
          });
          return { ...card, english: meanings[0] || "", meanings, examples, hiragana: typeof card.hiragana === "string" && card.hiragana ? card.hiragana : romajiToHiragana(card.japanese) };
        }).filter((card) => card.meanings.length > 0)
      : [];
  } catch {
    storageWarning = "Saved dictionary could not be read. Export a backup after restoring it.";
    return [];
  }
}

function saveCards(nextCards) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCards));
    storageWarning = "";
    return true;
  } catch {
    storageWarning = "Browser storage is unavailable. Export a backup before closing this page.";
    updateDictionaryCount();
    return false;
  }
}

function showScreen(name) {
  if (name !== "practice") hideWordTranslationPopup();
  Object.entries(screens).forEach(([key, screen]) => { screen.hidden = key !== name; });
  if (name === "home") updateDictionaryCount();
}

function updateDictionaryCount() {
  const count = cards.length;
  dictionaryCount.classList.remove("is-empty-prompt");
  dictionaryCount.textContent = count === 1 ? "1 word in your dictionary" : `${count} Cards in your dictionary`;
  dictionaryButton.textContent = `View dictionary (${count})`;
  if (storageWarning) dictionaryCount.textContent += ` · ${storageWarning}`;
}

function renderDictionaryList(highlightIndex = -1) {
  const count = cards.length;
  dictionaryListCount.textContent = count === 1 ? "1 word" : `${count} words`;
  wordList.replaceChildren();
  wordList.append(createDictionaryEntryRow());

  cards.forEach((card, index) => {
    const row = document.createElement("article");
    row.className = "word-row";
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
    removeButton.addEventListener("click", () => removeDictionaryCard(index));

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
}

function createDictionaryEntryRow() {
  const row = document.createElement("article");
  row.className = "word-row dictionary-entry-row";
  row.setAttribute("aria-label", "Add a dictionary entry");

  const spacer = document.createElement("span");
  spacer.className = "dictionary-entry-spacer";
  spacer.setAttribute("aria-hidden", "true");

  const details = document.createElement("div");
  details.className = "word-details dictionary-entry-fields";
  const japanese = document.createElement("input");
  japanese.type = "text";
  japanese.className = "dictionary-entry-japanese";
  japanese.placeholder = "Japanese (romaji)";
  japanese.setAttribute("aria-label", "New Japanese word in romaji");
  japanese.autocomplete = "off";

  const hiragana = document.createElement("input");
  hiragana.type = "text";
  hiragana.className = "dictionary-entry-hiragana";
  hiragana.placeholder = "Hiragana";
  hiragana.setAttribute("aria-label", "New word in hiragana");
  hiragana.autocomplete = "off";
  hiragana.dataset.manuallyEdited = "false";

  const meanings = document.createElement("div");
  meanings.className = "dictionary-entry-meanings";
  const firstMeaning = createDictionaryMeaningInput();
  meanings.append(firstMeaning);

  const meaningRow = document.createElement("div");
  meaningRow.className = "dictionary-entry-meaning-row";
  meaningRow.append(meanings);
  firstMeaning.querySelector(".dictionary-entry-hints").hidden = false;
  details.append(japanese, hiragana, meaningRow);

  const buttonSpacer = document.createElement("span");
  buttonSpacer.className = "dictionary-entry-spacer";
  buttonSpacer.setAttribute("aria-hidden", "true");
  row.append(spacer, details, buttonSpacer);
  return row;
}

function createDictionaryMeaningInput(value = "") {
  const group = document.createElement("div");
  group.className = "dictionary-entry-meaning-group";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "dictionary-entry-meaning meaning-translation";
  input.placeholder = "English meaning";
  input.setAttribute("aria-label", "New English meaning");
  input.value = value;
  const control = document.createElement("div");
  control.className = "dictionary-entry-meaning-control";
  const hints = document.createElement("div");
  hints.className = "dictionary-entry-hints";
  hints.hidden = true;
  hints.innerHTML = '<span>Press <kbd>Tab</kbd> for another meaning</span><span>Press <kbd>Enter</kbd> to add card</span>';
  control.append(input, hints);
  const exampleFields = document.createElement("div");
  exampleFields.className = "dictionary-entry-example-fields";
  exampleFields.append(
    createEntryExampleInput("romaji", "Example (romaji)"),
    createEntryExampleInput("hiragana", "Example (hiragana)"),
    createEntryExampleInput("english", "Example translation"),
  );
  group.append(control, exampleFields);
  return group;
}

function showDictionaryMeaningHints(row, activeGroup) {
  row.querySelectorAll(".dictionary-entry-meaning-group").forEach((group) => {
    const hints = group.querySelector(".dictionary-entry-hints");
    if (hints) hints.hidden = group !== activeGroup;
  });
}

function createEntryExampleInput(field, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = `dictionary-entry-example-${field}`;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", `New ${placeholder.toLowerCase()}`);
  input.autocomplete = "off";
  if (field === "hiragana") input.dataset.manuallyEdited = "false";
  return input;
}

function addDictionaryEntry() {
  const row = wordList.querySelector(".dictionary-entry-row");
  if (!row) return;
  const japanese = row.querySelector(".dictionary-entry-japanese").value.trim();
  const hiragana = row.querySelector(".dictionary-entry-hiragana").value.trim() || romajiToHiragana(japanese);
  const groups = [...row.querySelectorAll(".dictionary-entry-meaning-group")];
  const meaningEntries = groups.map((group) => {
    const romaji = group.querySelector(".dictionary-entry-example-romaji").value.trim();
    const customHiragana = group.querySelector(".dictionary-entry-example-hiragana").value.trim();
    return {
      meaning: group.querySelector(".meaning-translation").value.trim(),
      example: {
        romaji,
        hiragana: customHiragana || romajiToHiragana(romaji),
        english: group.querySelector(".dictionary-entry-example-english").value.trim(),
      },
    };
  }).filter((entry) => entry.meaning);
  const meanings = meaningEntries.map((entry) => entry.meaning);
  const examples = meaningEntries.map((entry) => entry.example);
  if (!japanese || meanings.length === 0) return;

  const english = meanings[0];
  const nextCards = [{ id: crypto.randomUUID?.() || String(Date.now()), japanese, hiragana, english, meanings, examples }, ...cards];
  if (!saveCards(nextCards)) {
    window.alert("The card could not be saved in this browser. Export a backup before closing this page.");
    return;
  }
  cards = nextCards;
  renderDictionaryList(0);
  wordList.scrollTop = 0;
  wordList.querySelector(".dictionary-entry-japanese")?.focus({ preventScroll: true });
}

function removeDictionaryCard(index) {
  const nextCards = removeCardAt(cards, index);
  if (!saveCards(nextCards)) {
    window.alert("The word could not be removed from browser storage.");
    return;
  }
  cards = nextCards;
  renderDictionaryList();
}

function closeDictionaryMenu() {
  dictionaryTools.classList.remove("is-open");
  dictionaryToolsButton.setAttribute("aria-expanded", "false");
}

function openDictionaryMenu() {
  dictionaryTools.classList.add("is-open");
  dictionaryToolsButton.setAttribute("aria-expanded", "true");
}

function exportDictionary() {
  const defaultName = `my_japan_dict_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`;
  const requestedName = window.prompt("Name this dictionary:", defaultName);
  if (requestedName === null) return;
  const dictionaryName = requestedName.trim() || "Japanese dictionary";
  downloadDictionary(dictionaryName);
}

function createDictionaryExport(dictionaryName) {
  return new Blob([createDictionaryJson(dictionaryName)], { type: "application/json;charset=utf-8" });
}

function createDictionaryJson(dictionaryName) {
  return serializeDictionary(cards, dictionaryName);
}

function getSafeDictionaryFilename(dictionaryName) {
  const safeName = dictionaryName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/\s+/g, "-") || "japanese-dictionary";
  return `${safeName}.json`;
}

function downloadDictionary(dictionaryName) {
  const blob = createDictionaryExport(dictionaryName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getSafeDictionaryFilename(dictionaryName);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeDictionaryMenu();
}

async function importDictionary(file) {
  if (!file) return;
  try {
    const importedCards = parseImportedDictionary(JSON.parse(await file.text()));
    if (cards.length > 0 && !window.confirm(`Replace your current dictionary of ${cards.length} cards with ${importedCards.length} imported cards?`)) return;
    if (!saveCards(importedCards)) {
      window.alert("The dictionary could not be saved in this browser. Export a backup before closing this page.");
      return;
    }
    cards = importedCards;
    updateDictionaryCount();
    dictionaryCount.textContent += ` · Imported ${cards.length} ${cards.length === 1 ? "card" : "cards"}.`;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "The dictionary could not be imported.");
  } finally {
    importFile.value = "";
    closeDictionaryMenu();
  }
}

function startPractice() {
  if (cards.length === 0) {
    document.querySelector("#dictionary-count").textContent = "Add your first word to start practicing or import a dictionary.";
    dictionaryCount.classList.remove("is-empty-prompt");
    void dictionaryCount.offsetWidth;
    dictionaryCount.classList.add("is-empty-prompt");
    return;
  }
  const fromEnglish = originLanguage.value === "english";
  const allMeaningCount = cards.reduce((total, card) => total + card.meanings.length, 0);
  const sessionSize = selectedSessionSize === "all" ? allMeaningCount : selectedSessionSize;
  practiceTarget = sessionSize;
  practiceDeck = fromEnglish ? [] : createPracticeDeck(cards, sessionSize);
  englishPracticeRun = fromEnglish ? createMeaningPracticeRun(cards) : null;
  practiceIndex = 0;
  reviewIndex = null;
  shownPracticeIndices = new Set();
  shownPracticeCards = new Map();
  answerRevealed = false;
  showScreen("practice");
  renderPracticeCard();
}

function renderPracticeCard(entranceAnimation = "") {
  hideWordTranslationPopup();
  const fromEnglish = originLanguage.value === "english";
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
    renderJapaneseWord(answerWord, card);
    const exampleBlock = createPracticeExample(card.examples?.[entry.meaningIndex]);
    if (exampleBlock) answerWord.append(exampleBlock);
  } else {
    renderJapaneseWord(promptWord, card);
    renderPracticeAnswer(answerWord, card, card.meanings.map((_, index) => index));
  }
  const showFullCard = isReviewing || answerRevealed;
  answerWord.hidden = !showFullCard;
  answerWord.classList.remove("is-appearing");
  if (isReviewing) answerWord.classList.add("is-appearing");
  revealHint.hidden = showFullCard;
  swipeRevealHint.classList.add("is-hidden");
  swipeRevealHint.classList.remove("is-fading", "is-attention");
  window.clearTimeout(deniedSwipeFeedbackTimeout);
  flashcard.classList.remove("is-revealing", "is-advancing", "is-entering", "is-dragging", "is-drag-snap", "is-denied-jitter", "is-swipe-exit-left", "is-swipe-exit-right", "is-swipe-enter-from-left", "is-swipe-enter-from-right");
  clearFlashcardDragStyles();
  if (entranceAnimation) flashcard.classList.add(entranceAnimation);
  flashcard.disabled = false;
  advancingPractice = false;
  flashcard.setAttribute("aria-expanded", String(showFullCard));
  progressLabel.textContent = `${practiceIndex} of ${practiceTarget} completed`;
  renderSessionProgress();
}

function renderJapaneseWord(container, card) {
  container.replaceChildren();
  const romaji = document.createElement("span");
  romaji.className = "romaji-word";
  appendRomajiTokens(romaji, card.japanese);
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
  appendRomajiTokens(exampleRomaji, example.romaji || "");
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
  if (answerRevealed) return;
  window.clearTimeout(deniedSwipeFeedbackTimeout);
  answerRevealed = true;
  answerWord.hidden = false;
  answerWord.classList.remove("is-appearing");
  flashcard.classList.remove("is-revealing");
  void flashcard.offsetWidth;
  flashcard.classList.add("is-revealing");
  answerWord.classList.add("is-appearing");
  revealHint.hidden = true;
  flashcard.classList.remove("is-denied-jitter");
  if (!swipeRevealHint.classList.contains("is-hidden")) {
    swipeRevealHint.classList.remove("is-attention");
    swipeRevealHint.classList.add("is-fading");
    window.setTimeout(() => {
      swipeRevealHint.classList.add("is-hidden");
      swipeRevealHint.classList.remove("is-fading");
    }, 1000);
  }
  flashcard.setAttribute("aria-expanded", "true");
  renderSessionProgress();
}

function reviewPracticeCard(index) {
  if (advancingPractice || !shownPracticeIndices.has(index)) return;
  reviewIndex = index === practiceIndex ? null : index;
  renderPracticeCard();
}

function advanceReview(entranceAnimation = "") {
  if (reviewIndex === null) return;
  reviewIndex = nextReviewIndex(reviewIndex, practiceIndex);
  renderPracticeCard(entranceAnimation);
}

function handleFlashcardAction() {
  if (reviewIndex !== null) {
    transitionFlashcardSwipe(-1, () => advanceReview("is-swipe-enter-from-right"));
  } else if (answerRevealed) {
    advancePractice();
  } else {
    revealAnswer();
  }
}

function finishPracticeAdvance(entranceAnimation = "is-swipe-enter-from-right") {
  if (practiceIndex === practiceTarget - 1) {
    progressLabel.textContent = `${practiceTarget} of ${practiceTarget} completed`;
    showScreen("home");
    return;
  }
  practiceIndex += 1;
  reviewIndex = null;
  answerRevealed = false;
  renderPracticeCard(entranceAnimation);
}

function advancePractice() {
  if (advancingPractice) return;
  transitionFlashcardSwipe(-1, () => finishPracticeAdvance());
}

function clearFlashcardDragStyles() {
  flashcard.style.removeProperty("--drag-x");
  flashcard.style.removeProperty("--drag-rotation");
  flashcard.style.removeProperty("--drag-opacity");
  flashcard.style.removeProperty("background-color");
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
    dragging: false,
  };
  flashcard.setPointerCapture(event.pointerId);
}

function moveFlashcardDrag(event) {
  if (!flashcardDrag || event.pointerId !== flashcardDrag.pointerId) return;
  const deltaX = event.clientX - flashcardDrag.startX;
  const deltaY = event.clientY - flashcardDrag.startY;
  if (!flashcardDrag.dragging) {
    if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    flashcardDrag.dragging = true;
    flashcard.classList.add("is-dragging");
  }
  if (event.cancelable) event.preventDefault();
  flashcardDrag.deltaX = deltaX;
  const width = flashcard.getBoundingClientRect().width || 320;
  const ratio = deltaX / width;
  flashcard.style.setProperty("--drag-x", `${deltaX}px`);
  flashcard.style.setProperty("--drag-rotation", `${Math.max(-9, Math.min(9, ratio * 16))}deg`);
  flashcard.style.setProperty("--drag-opacity", String(Math.max(0.48, 1 - Math.abs(ratio) * 0.5)));
  if (reviewIndex === null && !answerRevealed && deltaX < 0) {
    const redTint = Math.min(0.38, Math.abs(ratio) * 0.75);
    flashcard.style.backgroundColor = `rgba(194, 54, 47, ${redTint})`;
  } else {
    flashcard.style.removeProperty("background-color");
  }
}

function transitionFlashcardSwipe(direction, updateCard) {
  if (advancingPractice) return false;
  advancingPractice = true;
  flashcard.disabled = true;
  flashcard.classList.remove("is-dragging", "is-drag-snap", "is-entering", "is-swipe-enter-from-left", "is-swipe-enter-from-right");
  clearFlashcardDragStyles();
  flashcard.classList.add(direction < 0 ? "is-swipe-exit-left" : "is-swipe-exit-right");
  window.setTimeout(updateCard, 190);
  return true;
}

function navigateWithFlashcardSwipe(direction) {
  if (direction < 0) {
    if (reviewIndex === null && !answerRevealed) return false;
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
  const { dragging, deltaX, startTarget, pointerType } = flashcardDrag;
  flashcardDrag = null;
  if (!dragging) {
    if (pointerType !== "mouse" && (answerRevealed || reviewIndex !== null)) {
      lastTappedRomajiToken = startTarget instanceof Element ? startTarget.closest(".romaji-token") : null;
      window.clearTimeout(lastTappedRomajiTokenTimeout);
      lastTappedRomajiTokenTimeout = window.setTimeout(() => { lastTappedRomajiToken = null; }, 500);
    }
    return;
  }

  suppressFlashcardClick = true;
  window.clearTimeout(suppressFlashcardClickTimeout);
  suppressFlashcardClickTimeout = window.setTimeout(() => { suppressFlashcardClick = false; }, 0);

  const width = flashcard.getBoundingClientRect().width || 320;
  const threshold = Math.max(60, width * 0.18);
  if (Math.abs(deltaX) >= threshold && deltaX < 0 && reviewIndex === null && !answerRevealed) {
    showSwipeDeniedFeedback();
    return;
  }
  if (Math.abs(deltaX) >= threshold && navigateWithFlashcardSwipe(deltaX < 0 ? -1 : 1)) return;
  resetFlashcardDrag();
}

function cancelFlashcardDrag(event) {
  if (!flashcardDrag || event.pointerId !== flashcardDrag.pointerId) return;
  resetFlashcardDrag();
}

function handleFlashcardClick(event) {
  if (suppressFlashcardClick) {
    suppressFlashcardClick = false;
    window.clearTimeout(suppressFlashcardClickTimeout);
    event.preventDefault();
    return;
  }
  const token = (event.target instanceof Element ? event.target.closest(".romaji-token") : null)
    || lastTappedRomajiToken;
  lastTappedRomajiToken = null;
  window.clearTimeout(lastTappedRomajiTokenTimeout);
  if (token && (answerRevealed || reviewIndex !== null)) {
    event.preventDefault();
    event.stopPropagation();
    const mode = lastPointerType === "mouse" ? "hover" : "anchor";
    showWordTranslation(token, mode, event.clientX, event.clientY);
    return;
  }
  handleFlashcardAction();
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
  if (event.pointerType !== "mouse" && !token) hideWordTranslationPopup();
});

document.addEventListener("click", (event) => {
  const token = event.target instanceof Element ? event.target.closest(".romaji-token") : null;
  if (!token) hideWordTranslationPopup();
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
  closeDictionaryMenu();
  showScreen("add");
  japaneseInput.focus();
}

async function openDefaultDictionaries() {
  closeDictionaryMenu();
  showScreen("defaults");
  defaultDictionaryList.replaceChildren();
  defaultDictionariesCount.textContent = "";
  defaultDictionariesStatus.textContent = "Loading available dictionaries…";
  try {
    const response = await fetch("dictionaries/manifest.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Dictionary catalog request failed (${response.status}).`);
    const catalog = await response.json();
    if (!Array.isArray(catalog.dictionaries) || catalog.dictionaries.length === 0) {
      throw new Error("No default dictionaries are available yet.");
    }
    renderDefaultDictionaries(catalog.dictionaries);
    defaultDictionariesStatus.textContent = "Select a dictionary to replace the one saved in this browser.";
  } catch (error) {
    defaultDictionariesStatus.textContent = defaultDictionaryErrorMessage("dictionaries/manifest.json", error);
    const retryButton = document.createElement("button");
    retryButton.className = "secondary-button default-dictionary-retry";
    retryButton.type = "button";
    retryButton.textContent = "Try again";
    retryButton.addEventListener("click", openDefaultDictionaries, { once: true });
    defaultDictionaryList.replaceChildren(retryButton);
    console.error("Unable to load default dictionary catalog:", error);
  }
}

function renderDefaultDictionaries(dictionaries) {
  defaultDictionariesCount.textContent = dictionaries.length === 1 ? "1 available" : `${dictionaries.length} available`;
  const fragment = document.createDocumentFragment();
  dictionaries.forEach((dictionary) => {
    if (typeof dictionary.id !== "string" || typeof dictionary.name !== "string" || typeof dictionary.file !== "string" || !Number.isInteger(dictionary.count) || dictionary.count < 1) return;
    const button = document.createElement("button");
    button.className = "default-dictionary-option";
    button.type = "button";
    const name = document.createElement("strong");
    name.textContent = dictionary.name;
    const description = document.createElement("span");
    description.textContent = `${dictionary.count} ${dictionary.count === 1 ? "card" : "cards"}`;
    button.append(name, description);
    button.addEventListener("click", () => requestDefaultDictionaryLoad(dictionary, button));
    fragment.append(button);
  });
  defaultDictionaryList.replaceChildren(fragment);
}

function requestDefaultDictionaryLoad(dictionary, trigger) {
  pendingDefaultDictionary = dictionary;
  pendingDefaultDictionaryTrigger = trigger;
  defaultDictionaryConfirmTitle.textContent = cards.length ? "Replace your dictionary?" : "Load this dictionary?";
  defaultDictionaryConfirmDescription.textContent = cards.length
    ? `“${dictionary.name}” contains ${dictionary.count} cards. It will replace your current dictionary of ${cards.length} ${cards.length === 1 ? "card" : "cards"}.`
    : `Load “${dictionary.name}” with ${dictionary.count} cards?`;
  defaultDictionaryConfirmWarning.textContent = cards.length
    ? "This cannot be undone. Export a backup first if you want to keep your current cards."
    : "The cards will be saved in this browser.";
  defaultDictionaryConfirmStatus.textContent = "";
  confirmDefaultDictionaryLoadButton.textContent = cards.length ? "Replace and load" : "Load dictionary";
  confirmDefaultDictionaryLoadButton.disabled = false;
  cancelDefaultDictionaryLoadButton.disabled = false;
  showScreen("defaultConfirm");
  cancelDefaultDictionaryLoadButton.focus();
}

function cancelDefaultDictionaryLoad() {
  if (defaultDictionaryLoadInProgress) return;
  const trigger = pendingDefaultDictionaryTrigger;
  pendingDefaultDictionary = null;
  pendingDefaultDictionaryTrigger = null;
  showScreen("defaults");
  trigger?.focus();
}

async function loadDefaultDictionary() {
  const dictionary = pendingDefaultDictionary;
  if (!dictionary || defaultDictionaryLoadInProgress) return;
  defaultDictionaryLoadInProgress = true;
  defaultDictionaryConfirmStatus.textContent = `Loading “${dictionary.name}”…`;
  confirmDefaultDictionaryLoadButton.disabled = true;
  confirmDefaultDictionaryLoadButton.textContent = "Loading…";
  cancelDefaultDictionaryLoadButton.disabled = true;
  try {
    const response = await fetch(`dictionaries/${encodeURIComponent(dictionary.file)}`);
    if (!response.ok) throw new Error(`Dictionary request failed (${response.status}).`);
    const source = await response.json();
    const importedCards = prepareDefaultDictionary(source, dictionary.count);
    if (!saveCards(importedCards)) throw new Error("The new dictionary could not be saved in this browser.");
    cards = importedCards;
    pendingDefaultDictionary = null;
    pendingDefaultDictionaryTrigger = null;
    showScreen("home");
  } catch (error) {
    defaultDictionaryConfirmStatus.textContent = `${defaultDictionaryErrorMessage(`dictionaries/${dictionary.file}`, error)} Your current dictionary is unchanged; try again.`;
    confirmDefaultDictionaryLoadButton.disabled = false;
    confirmDefaultDictionaryLoadButton.textContent = cards.length ? "Replace and load" : "Load dictionary";
    cancelDefaultDictionaryLoadButton.disabled = false;
    console.error("Unable to load default dictionary:", error);
  } finally {
    defaultDictionaryLoadInProgress = false;
  }
}

function defaultDictionaryErrorMessage(resource, error) {
  if (window.location.protocol === "file:") {
    return "This page was opened directly from disk. Open Japanese Cards through a website or local web server to load its JSON dictionaries.";
  }
  const url = new URL(resource, document.baseURI);
  const statusMatch = String(error?.message || "").match(/\((\d{3})\)/);
  if (statusMatch) return `The dictionary file at ${url.pathname} returned HTTP ${statusMatch[1]}.`;
  return `Could not load ${url.pathname}. Check the connection and try again.`;
}

function startEditingCard(index) {
  const card = cards[index];
  if (!card) return;
  editingCardIndex = index;
  formReturnScreen = "dictionary";
  hiraganaManuallyEdited = false;
  japaneseInput.value = card.japanese;
  hiraganaInput.value = card.hiragana || romajiToHiragana(card.japanese);
  resetMeaningInputs(card.meanings?.length ? card.meanings : [card.english], card.examples || []);
  formTitle.textContent = "Edit word";
  formSubmitButton.textContent = "Save changes";
  cancelEditButton.hidden = false;
  backToLearningButton.hidden = true;
  enterHint.hidden = true;
  showScreen("add");
  japaneseInput.focus();
}

function cancelCardForm() {
  const returnScreen = formReturnScreen;
  editingCardIndex = null;
  showScreen(returnScreen);
}

function showAddFeedback(japanese) {
  window.clearTimeout(addFeedbackTimeout);
  addFeedback.textContent = `Added “${japanese}” to your dictionary.`;
  addFeedback.hidden = false;
  addFeedback.classList.remove("is-visible");
  void addFeedback.offsetWidth;
  addFeedback.classList.add("is-visible");
  addFeedbackTimeout = window.setTimeout(() => {
    addFeedback.classList.remove("is-visible");
    addFeedback.hidden = true;
  }, 2600);
}

function confirmClearDictionary() {
  document.querySelector("#clear-description").textContent = cards.length === 1
    ? "This will delete the 1 card saved in this browser."
    : `This will delete all ${cards.length} cards saved in this browser.`;
  closeDictionaryMenu();
  showScreen("clear");
}

function clearDictionary() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    window.alert("The saved dictionary could not be deleted from this browser.");
    return;
  }
  cards = [];
  storageWarning = "";
  showScreen("home");
}

addButton.addEventListener("click", openDefaultDictionaries);
dictionaryToolsButton.addEventListener("click", (event) => {
  if (event.detail === 0 || window.matchMedia("(hover: none)").matches) {
    if (dictionaryTools.classList.contains("is-open")) closeDictionaryMenu();
    else openDictionaryMenu();
  }
});
dictionaryTools.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "mouse") openDictionaryMenu();
});
dictionaryTools.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") closeDictionaryMenu();
});
dictionaryTools.addEventListener("focusin", () => {
  if (keyboardNavigation) openDictionaryMenu();
});
dictionaryTools.addEventListener("focusout", (event) => {
  if (!dictionaryTools.contains(event.relatedTarget)) closeDictionaryMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") keyboardNavigation = true;
});
document.addEventListener("pointerdown", (event) => {
  keyboardNavigation = false;
  if (!dictionaryTools.contains(event.target)) closeDictionaryMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dictionaryTools.classList.contains("is-open")) {
    closeDictionaryMenu();
    keyboardNavigation = false;
    dictionaryToolsButton.focus();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !screens.defaultConfirm.hidden && !defaultDictionaryLoadInProgress) {
    cancelDefaultDictionaryLoad();
  }
});
document.querySelector("#export-action").addEventListener("click", exportDictionary);
document.querySelector("#import-action").addEventListener("click", () => importFile.click());
document.querySelector("#clear-action").addEventListener("click", confirmClearDictionary);
document.querySelector("#confirm-clear").addEventListener("click", clearDictionary);
cancelDefaultDictionaryLoadButton.addEventListener("click", cancelDefaultDictionaryLoad);
confirmDefaultDictionaryLoadButton.addEventListener("click", loadDefaultDictionary);
importFile.addEventListener("change", () => importDictionary(importFile.files?.[0]));
backToLearningButton.addEventListener("click", cancelCardForm);
dictionaryButton.addEventListener("click", () => {
  renderDictionaryList();
  showScreen("dictionary");
});

wordList.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.matches(".dictionary-entry-example-hiragana")) {
    event.target.dataset.manuallyEdited = "true";
    return;
  }
  if (event.target.matches(".dictionary-entry-example-romaji")) {
    const hiragana = event.target.closest(".dictionary-entry-meaning-group")?.querySelector(".dictionary-entry-example-hiragana");
    if (hiragana && shouldAutoConvertHiragana(hiragana.dataset.manuallyEdited === "true", hiragana.value)) {
      hiragana.value = romajiToHiragana(event.target.value.trim());
      hiragana.dataset.manuallyEdited = "false";
    }
    return;
  }
  if (event.target.matches(".dictionary-entry-hiragana")) {
    event.target.dataset.manuallyEdited = "true";
    return;
  }
  if (!event.target.matches(".dictionary-entry-japanese")) return;
  const hiragana = event.target.closest(".dictionary-entry-row")?.querySelector(".dictionary-entry-hiragana");
  if (hiragana && shouldAutoConvertHiragana(hiragana.dataset.manuallyEdited === "true", hiragana.value)) {
    hiragana.value = romajiToHiragana(event.target.value.trim());
    hiragana.dataset.manuallyEdited = "false";
  }
});

wordList.addEventListener("focusin", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const row = event.target.closest(".dictionary-entry-row");
  const group = event.target.closest(".dictionary-entry-meaning-group");
  if (row && group) showDictionaryMeaningHints(row, group);
});

wordList.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const row = event.target.closest(".dictionary-entry-row");
  if (!row) return;
  const isJapaneseField = event.target.matches(".dictionary-entry-japanese");
  const isMeaningField = event.target.matches(".dictionary-entry-meaning");
  const isExampleRomajiField = event.target.matches(".dictionary-entry-example-romaji");
  const isExampleEndField = event.target.matches(".dictionary-entry-example-english");
  if (!isJapaneseField && !isMeaningField && !isExampleRomajiField && !isExampleEndField) return;
  const meaningInputs = [...row.querySelectorAll(".dictionary-entry-meaning")];
  const meaningIndex = meaningInputs.indexOf(event.target.closest(".dictionary-entry-meaning-group")?.querySelector(".dictionary-entry-meaning"));
  const isLastGroup = meaningIndex === meaningInputs.length - 1;
  if (event.key === "Tab" && !event.shiftKey && isJapaneseField) {
    event.preventDefault();
    meaningInputs[0]?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isExampleRomajiField) {
    event.preventDefault();
    event.target.closest(".dictionary-entry-meaning-group")?.querySelector(".dictionary-entry-example-english")?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isExampleEndField && isLastGroup) {
    event.preventDefault();
    const nextGroup = createDictionaryMeaningInput();
    row.querySelector(".dictionary-entry-meanings").append(nextGroup);
    nextGroup.querySelector(".dictionary-entry-meaning").focus();
  } else if (event.key === "Enter" && isExampleEndField && isLastGroup) {
    event.preventDefault();
    addDictionaryEntry();
  } else if (event.key === "Enter" && (isMeaningField || isExampleEndField)) {
    event.preventDefault();
    addDictionaryEntry();
  }
});

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const japanese = japaneseInput.value.trim();
  const hiragana = hiraganaInput.value.trim() || romajiToHiragana(japanese);
  const meaningEntries = [...englishMeanings.querySelectorAll(".meaning-entry-group")].map((group) => ({
    meaning: group.querySelector(".meaning-translation").value.trim(),
    example: {
      romaji: group.querySelector(".meaning-example-romaji").value.trim(),
      hiragana: group.querySelector(".meaning-example-hiragana").value.trim() || romajiToHiragana(group.querySelector(".meaning-example-romaji").value.trim()),
      english: group.querySelector(".meaning-example-english").value.trim(),
    },
  })).filter((entry) => entry.meaning);
  const meanings = meaningEntries.map((entry) => entry.meaning);
  const examples = meaningEntries.map((entry) => entry.example);
  if (!japanese || meanings.length === 0) return;
  const english = meanings[0];
  const isEditing = editingCardIndex !== null;
  const nextCards = !isEditing
    ? [...cards, { id: crypto.randomUUID?.() || String(Date.now()), japanese, hiragana, english, meanings, examples }]
    : updateCardAt(cards, editingCardIndex, { japanese, hiragana, english, meanings, examples });
  if (!saveCards(nextCards)) {
    window.alert("The card could not be saved in this browser. Export a backup before closing this page.");
    return;
  }
  cards = nextCards;
  if (!isEditing) {
    cardForm.reset();
    resetMeaningInputs();
    hiraganaManuallyEdited = false;
    showAddFeedback(japanese);
    japaneseInput.focus();
    return;
  }
  const returnScreen = formReturnScreen;
  const editedIndex = editingCardIndex;
  editingCardIndex = null;
  showScreen(returnScreen);
  if (returnScreen === "dictionary") {
    renderDictionaryList(editedIndex);
    wordList.children[editedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
});

cardForm.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.closest("#english-meanings")) return;
  const group = event.target.closest(".meaning-entry-group");
  const groups = [...englishMeanings.querySelectorAll(".meaning-entry-group")];
  const isLastGroup = groups.at(-1) === group;
  if (event.key === "Tab" && !event.shiftKey && event.target.matches(".meaning-example-romaji")) {
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
    hiragana.value = romajiToHiragana(event.target.value.trim());
    hiragana.dataset.manuallyEdited = "false";
  }
});

japaneseInput.addEventListener("input", () => {
  if (shouldAutoConvertHiragana(hiraganaManuallyEdited, hiraganaInput.value)) {
    hiraganaInput.value = romajiToHiragana(japaneseInput.value.trim());
    hiraganaManuallyEdited = false;
  }
});

hiraganaInput.addEventListener("input", () => { hiraganaManuallyEdited = true; });

flashcard.addEventListener("pointerdown", startFlashcardDrag);
flashcard.addEventListener("pointermove", moveFlashcardDrag);
flashcard.addEventListener("pointerup", endFlashcardDrag);
flashcard.addEventListener("pointercancel", cancelFlashcardDrag);
flashcard.addEventListener("click", handleFlashcardClick);

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

updateDictionaryCount();
