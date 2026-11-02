const STORAGE_KEY = "japanese-cards.dictionary.v1";
const { parseImportedDictionary, romajiToHiragana, createPracticeDeck, removeCardAt } = window.JapaneseCardsCore;

const screens = {
  home: document.querySelector("#home-screen"),
  practice: document.querySelector("#practice-screen"),
  dictionary: document.querySelector("#dictionary-screen"),
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
const hiraganaPreview = document.querySelector("#hiragana-preview");
const englishInput = document.querySelector("#english-translation");
const flashcard = document.querySelector("#flashcard");
const promptWord = document.querySelector("#prompt-word");
const answerWord = document.querySelector("#answer-word");
const revealHint = document.querySelector("#reveal-hint");
const progressLabel = document.querySelector("#progress-label");
const sessionOptions = document.querySelectorAll("[data-session-size]");
const progressTrack = document.querySelector("#progress-track");
const progressFill = document.querySelector("#progress-fill");
const progressPoints = document.querySelector("#progress-points");
const cardsRemaining = document.querySelector("#cards-remaining");
const dictionaryActions = document.querySelector("#dictionary-actions");
const addButton = document.querySelector("#add-button");
const importFile = document.querySelector("#import-file");
let storageWarning = "";

let cards = loadCards();
let practiceDeck = [];
let practiceIndex = 0;
let answerRevealed = false;
let selectedSessionSize = 5;
let advancingPractice = false;
let keyboardNavigation = false;

function loadCards() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((card) => typeof card?.japanese === "string" && typeof card?.english === "string")
        .map((card) => ({ ...card, hiragana: typeof card.hiragana === "string" && card.hiragana ? card.hiragana : romajiToHiragana(card.japanese) }))
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
  Object.entries(screens).forEach(([key, screen]) => { screen.hidden = key !== name; });
  if (name === "home") updateDictionaryCount();
}

function updateDictionaryCount() {
  const count = cards.length;
  dictionaryCount.classList.remove("is-empty-prompt");
  dictionaryCount.textContent = count === 1 ? "1 word in your dictionary" : `${count} words in your dictionary`;
  dictionaryButton.textContent = `View dictionary (${count})`;
  if (storageWarning) dictionaryCount.textContent += ` · ${storageWarning}`;
}

function renderDictionaryList() {
  const count = cards.length;
  dictionaryListCount.textContent = count === 1 ? "1 word" : `${count} words`;
  wordList.replaceChildren();

  if (count === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-word-list";
    emptyMessage.textContent = "Your dictionary is empty. Add or import words from the home screen.";
    wordList.append(emptyMessage);
    return;
  }

  cards.forEach((card, index) => {
    const row = document.createElement("article");
    row.className = "word-row";

    const removeButton = document.createElement("button");
    removeButton.className = "remove-word-button";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${card.japanese}`);
    removeButton.title = "Remove this word";
    removeButton.addEventListener("click", () => removeDictionaryCard(index));

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
    english.textContent = card.english.replace(/\r\n|\r|\n/g, "    ");
    details.append(japanese, english);
    row.append(removeButton, details);
    wordList.append(row);
  });
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
  dictionaryActions.classList.remove("is-open");
  addButton.setAttribute("aria-expanded", "false");
}

function openDictionaryMenu() {
  dictionaryActions.classList.add("is-open");
  addButton.setAttribute("aria-expanded", "true");
}

function exportDictionary() {
  const requestedName = window.prompt("Name this dictionary:", "my_japan_dict_" + new Date().toISOString().slice(0, 10).replace(/-/g, "_"));
  if (requestedName === null) return;
  const dictionaryName = requestedName.trim() || "Japanese dictionary";
  const dictionary = {
    format: EXPORT_FORMAT,
    version: 1,
    name: dictionaryName,
    exportedAt: new Date().toISOString(),
    cards: cards.map(({ japanese, hiragana, english }) => ({ japanese, hiragana, english })),
  };
  const blob = new Blob([JSON.stringify(dictionary, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safeName = dictionaryName.replace(/[<>:"\/\\|?*\u0000-\u001F]/g, "").replace(/\s+/g, "-") || "japanese-dictionary";
  link.download = `${safeName}.json`;
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
  const sessionSize = selectedSessionSize === "all" ? cards.length : selectedSessionSize;
  practiceDeck = createPracticeDeck(cards, sessionSize);
  practiceIndex = 0;
  showScreen("practice");
  renderPracticeCard();
}

function renderPracticeCard() {
  const card = practiceDeck[practiceIndex];
  const fromEnglish = originLanguage.value === "english";
  if (fromEnglish) {
    promptWord.textContent = card.english;
    renderJapaneseWord(answerWord, card);
  } else {
    renderJapaneseWord(promptWord, card);
    answerWord.textContent = card.english;
  }
  answerWord.hidden = true;
  answerWord.classList.remove("is-appearing");
  revealHint.hidden = false;
  flashcard.classList.remove("is-revealing", "is-advancing", "is-entering");
  flashcard.disabled = false;
  advancingPractice = false;
  flashcard.setAttribute("aria-expanded", "false");
  answerRevealed = false;
  progressLabel.textContent = `${practiceIndex} of ${practiceDeck.length} completed`;
  renderSessionProgress();
}

function renderJapaneseWord(container, card) {
  container.replaceChildren();
  const romaji = document.createElement("span");
  romaji.className = "romaji-word";
  romaji.textContent = card.japanese;
  const hiragana = document.createElement("span");
  hiragana.className = "hiragana-subtext";
  hiragana.textContent = card.hiragana || romajiToHiragana(card.japanese);
  container.append(romaji, hiragana);
}

function renderSessionProgress() {
  const total = practiceDeck.length;
  const shown = practiceIndex + 1;
  const remaining = total - practiceIndex;
  const points = Array.from({ length: total }, (_, index) => {
    const position = total === 1 ? 50 : (index / (total - 1)) * 100;
    const reached = index < shown ? " is-reached" : "";
    return `<span class="progress-point${reached}" style="left: ${position}%"></span>`;
  }).join("");

  progressPoints.innerHTML = points;
  progressFill.style.width = `${total === 1 ? 0 : ((shown - 1) / (total - 1)) * 100}%`;
  progressTrack.setAttribute("aria-valuemax", String(total));
  progressTrack.setAttribute("aria-valuenow", String(shown));
  progressTrack.setAttribute("aria-valuetext", `Card ${shown} of ${total}`);
  cardsRemaining.textContent = `${remaining} ${remaining === 1 ? "card" : "cards"} left`;
}

function revealAnswer() {
  if (answerRevealed) return;
  answerRevealed = true;
  answerWord.hidden = false;
  answerWord.classList.remove("is-appearing");
  flashcard.classList.remove("is-revealing");
  void flashcard.offsetWidth;
  flashcard.classList.add("is-revealing");
  answerWord.classList.add("is-appearing");
  revealHint.hidden = true;
  flashcard.setAttribute("aria-expanded", "true");
}

function advancePractice() {
  if (advancingPractice) return;
  advancingPractice = true;
  flashcard.disabled = true;
  flashcard.classList.add("is-advancing");

  window.setTimeout(() => {
    if (practiceIndex === practiceDeck.length - 1) {
      progressLabel.textContent = `${practiceDeck.length} of ${practiceDeck.length} completed`;
      showScreen("home");
      return;
    }
    practiceIndex += 1;
    renderPracticeCard();
    flashcard.classList.add("is-entering");
    window.setTimeout(() => flashcard.classList.remove("is-entering"), 240);
  }, 170);
}

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
  hiraganaPreview.textContent = "";
  closeDictionaryMenu();
  showScreen("add");
  japaneseInput.focus();
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

addButton.addEventListener("click", (event) => {
  // Hover opens the menu on desktop; clicks toggle it on touch and keyboard.
  if (event.detail === 0 || window.matchMedia("(hover: none)").matches) {
    if (dictionaryActions.classList.contains("is-open")) closeDictionaryMenu();
    else openDictionaryMenu();
  }
});
dictionaryActions.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "mouse") openDictionaryMenu();
});
dictionaryActions.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse" && !dictionaryActions.contains(document.activeElement)) closeDictionaryMenu();
});
dictionaryActions.addEventListener("focusin", () => {
  if (keyboardNavigation) openDictionaryMenu();
});
dictionaryActions.addEventListener("focusout", (event) => {
  if (!dictionaryActions.contains(event.relatedTarget)) closeDictionaryMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") keyboardNavigation = true;
});
document.addEventListener("pointerdown", (event) => {
  keyboardNavigation = false;
  if (!dictionaryActions.contains(event.target)) closeDictionaryMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dictionaryActions.classList.contains("is-open")) {
    closeDictionaryMenu();
    keyboardNavigation = false;
    addButton.focus();
  }
});
document.querySelector("#add-word-action").addEventListener("click", startAddingWord);
document.querySelector("#export-action").addEventListener("click", exportDictionary);
document.querySelector("#import-action").addEventListener("click", () => importFile.click());
document.querySelector("#clear-action").addEventListener("click", confirmClearDictionary);
document.querySelector("#confirm-clear").addEventListener("click", clearDictionary);
importFile.addEventListener("change", () => importDictionary(importFile.files?.[0]));
dictionaryButton.addEventListener("click", () => {
  renderDictionaryList();
  showScreen("dictionary");
});

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const japanese = japaneseInput.value.trim();
  const english = englishInput.value.trim();
  if (!japanese || !english) return;
  const hiragana = romajiToHiragana(japanese);
  const nextCards = [...cards, { id: crypto.randomUUID?.() || String(Date.now()), japanese, hiragana, english }];
  if (!saveCards(nextCards)) {
    window.alert("The card could not be saved in this browser. Export a backup before closing this page.");
    return;
  }
  cards = nextCards;
  showScreen("home");
});

japaneseInput.addEventListener("input", () => {
  hiraganaPreview.textContent = romajiToHiragana(japaneseInput.value.trim());
});

flashcard.addEventListener("click", () => {
  if (answerRevealed) advancePractice();
  else revealAnswer();
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || screens.practice.hidden) return;
  const target = event.target;
  if (target instanceof Element && target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
  event.preventDefault();
  if (answerRevealed) advancePractice();
  else revealAnswer();
});

document.querySelectorAll("[data-go-home]").forEach((button) => button.addEventListener("click", () => showScreen("home")));

updateDictionaryCount();
