const STORAGE_KEY = "japanese-cards.deck.v1";
const LEGACY_STORAGE_KEY = "japanese-cards.dictionary.v1";
const CONTEXT_ANNOTATION_MIGRATION_KEY = "japanese-cards.context-annotation-migration.v1";
const { parseImportedDeck, prepareDefaultDeck, serializeDeck, normalizeWordMeanings, romajiToHiragana, shouldSkipHiraganaOnTab, shouldAutoConvertHiragana, createPracticeDeck, createMeaningPracticeRun, getSessionProgressState, nextReviewIndex, removeCardAt, updateCardAt } = window.JapaneseCardsCore;
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
let hiraganaManuallyEdited = false;
let addFeedbackTimeout = null;
let pendingDefaultDeck = null;
let pendingDefaultDeckTrigger = null;
let defaultDeckLoadInProgress = false;

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
let wordPopupBlocksCardAdvance = false;
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

function saveCards(nextCards) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCards));
    storageWarning = "";
    return true;
  } catch {
    storageWarning = "Browser storage is unavailable. Export a backup before closing this page.";
    updateDeckCount();
    return false;
  }
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

function showScreen(name) {
  if (name !== "practice") {
    wordPopupBlocksCardAdvance = false;
    hideWordTranslationPopup();
  }
  Object.entries(screens).forEach(([key, screen]) => { screen.hidden = key !== name; });
  if (name === "home") updateDeckCount();
}

// Called by Android's system Back gesture. Return false only at the root so
// Android can apply its normal behavior; all in-app screens use their existing
// cancellation paths, including their loading and form guards.
window.JapaneseCardsHandleBack = function handleSystemBack() {
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

function addDeckEntry() {
  const row = wordList.querySelector(".deck-entry-row");
  if (!row) return;
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
  const examples = meaningEntries.map((entry) => entry.example);
  if (!japanese || meanings.length === 0) return;

  const english = meanings[0];
  const nextCards = [{ id: crypto.randomUUID?.() || String(Date.now()), japanese, hiragana, english, meanings, examples }, ...cards];
  if (!saveCards(nextCards)) {
    window.alert("The card could not be saved in this browser. Export a backup before closing this page.");
    return;
  }
  cards = nextCards;
  renderDeckList(0);
  wordList.scrollTop = 0;
  wordList.querySelector(".deck-entry-japanese")?.focus({ preventScroll: true });
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
    showScreen("home");
    screens.home.classList.add("is-export-returning");
    await pause(reducedMotion ? 0 : 240);
  } finally {
    screens.export.classList.remove("is-export-success");
    screens.export.classList.remove("is-export-leaving");
    screens.home.classList.remove("is-export-returning");
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
  return serializeDeck(cards, deckName);
}

function getSafeDeckFilename(deckName) {
  const safeName = deckName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/\s+/g, "-") || "japanese-deck";
  return `${safeName}.json`;
}

async function importDeck(file) {
  if (!file) return;
  try {
    const importedCards = parseImportedDeck(JSON.parse(await file.text()));
    if (cards.length > 0 && !window.confirm(`Replace your current deck of ${cards.length} cards with ${importedCards.length} imported cards?`)) return;
    if (!saveCards(importedCards)) {
      window.alert("The deck could not be saved in this browser. Export a backup before closing this page.");
      return;
    }
    cards = importedCards;
    updateDeckCount();
    deckCount.textContent += ` · Imported ${cards.length} ${cards.length === 1 ? "card" : "cards"}.`;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "The deck could not be imported.");
  } finally {
    importFile.value = "";
    closeDeckMenu();
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
  wordPopupBlocksCardAdvance = false;
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
  const startedOutsideRomajiToken = !(flashcardDrag.startTarget instanceof Element
    && flashcardDrag.startTarget.closest(".romaji-token"));
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
    button.addEventListener("click", () => requestDefaultDeckLoad(deck, button));
    fragment.append(button);
  });
  defaultDeckList.replaceChildren(fragment);
}

function requestDefaultDeckLoad(deck, trigger) {
  pendingDefaultDeck = deck;
  pendingDefaultDeckTrigger = trigger;
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
  const trigger = pendingDefaultDeckTrigger;
  pendingDefaultDeck = null;
  pendingDefaultDeckTrigger = null;
  showScreen("defaults");
  trigger?.focus();
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
    if (!saveCards(importedCards)) throw new Error("The new deck could not be saved in this browser.");
    cards = importedCards;
    pendingDefaultDeck = null;
    pendingDefaultDeckTrigger = null;
    showScreen("home");
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
  editingDeckScrollTop = wordList.scrollTop || lastDeckScrollTop;
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
  showScreen("add");
  japaneseInput.focus();
}

function cancelCardForm() {
  const returnScreen = formReturnScreen;
  const editedIndex = editingCardIndex;
  editingCardIndex = null;
  showScreen(returnScreen);
  if (returnScreen === "deck" && editedIndex !== null) focusDeckCard(editedIndex, false);
}

function focusDeckCard(index, highlight = true) {
  renderDeckList(highlight ? index : -1);
  const row = wordList.children[index + 1];
  requestAnimationFrame(() => {
    wordList.scrollTop = editingDeckScrollTop;
    lastDeckScrollTop = editingDeckScrollTop;
    window.scrollTo(0, editingPageScrollTop);
    row?.querySelector(".edit-word-button")?.focus({ preventScroll: true });
  });
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
  storageWarning = "";
  showScreen("home");
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
document.querySelector("#export-action").addEventListener("click", exportDeck);
document.querySelector("#settings-button").addEventListener("click", openSettings);
window.addEventListener("japanese-cards:show-settings", openSettings);
document.querySelectorAll("[data-go-settings]").forEach(button => button.addEventListener("click", openSettings));
document.querySelector("#about-button").addEventListener("click", () => showScreen("about"));
document.querySelector("#export-form").addEventListener("submit", saveDeckExport);
document.querySelector("#cancel-export").addEventListener("click", () => { if (!exportInProgress) showScreen("home"); });
document.querySelector("#import-action").addEventListener("click", openDefaultDecks);
document.querySelector("#clear-action").addEventListener("click", confirmClearDeck);
document.querySelector("#confirm-clear").addEventListener("click", clearDeck);
cancelDefaultDeckLoadButton.addEventListener("click", cancelDefaultDeckLoad);
confirmDefaultDeckLoadButton.addEventListener("click", loadDefaultDeck);
importFile.addEventListener("change", () => importDeck(importFile.files?.[0]));
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
  const hiragana = event.target.closest(".deck-entry-row")?.querySelector(".deck-entry-hiragana");
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
  if (!(event.target instanceof HTMLInputElement)) return;
  const row = event.target.closest(".deck-entry-row");
  if (!row) return;
  const isJapaneseField = event.target.matches(".deck-entry-japanese");
  const isMeaningField = event.target.matches(".deck-entry-meaning");
  const isExampleRomajiField = event.target.matches(".deck-entry-example-romaji");
  const isExampleHiraganaField = event.target.matches(".deck-entry-example-hiragana");
  const isExampleEndField = event.target.matches(".deck-entry-example-english");
  if (!isJapaneseField && !isMeaningField && !isExampleRomajiField && !isExampleHiraganaField && !isExampleEndField) return;
  const meaningInputs = [...row.querySelectorAll(".deck-entry-meaning")];
  const meaningIndex = meaningInputs.indexOf(event.target.closest(".deck-entry-meaning-group")?.querySelector(".deck-entry-meaning"));
  const isLastGroup = meaningIndex === meaningInputs.length - 1;
  if (event.key === "Tab" && !event.shiftKey && isJapaneseField) {
    event.preventDefault();
    meaningInputs[0]?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isExampleRomajiField) {
    event.preventDefault();
    event.target.closest(".deck-entry-meaning-group")?.querySelector(".deck-entry-example-english")?.focus();
  } else if (event.key === "Tab" && !event.shiftKey && isExampleEndField && isLastGroup) {
    event.preventDefault();
    const nextGroup = createDeckMeaningInput();
    row.querySelector(".deck-entry-meanings").append(nextGroup);
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

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
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
  const examples = meaningEntries.map((entry, index) => {
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
  if (returnScreen === "deck") focusDeckCard(editedIndex);
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

updateDeckCount();
void restoreContextMeaningsForSavedCards();
