const STORAGE_KEY = "japanese-cards.dictionary.v1";
const { parseImportedDictionary, serializeDictionary, romajiToHiragana, shouldSkipHiraganaOnTab, shouldAutoConvertHiragana, createPracticeDeck, createMeaningPracticeRun, removeCardAt, updateCardAt } = window.JapaneseCardsCore;

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
const hiraganaInput = document.querySelector("#hiragana-word");
const englishMeanings = document.querySelector("#english-meanings");
const englishInput = document.querySelector("#english-translation");
const formTitle = document.querySelector("#form-title");
const formSubmitButton = cardForm.querySelector("[type='submit']");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const backToLearningButton = document.querySelector("#back-to-learning-button");
const addFeedback = document.querySelector("#add-feedback");
const enterHint = document.querySelector("#enter-hint");
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
const dictionaryTools = document.querySelector("#dictionary-tools");
const dictionaryToolsButton = document.querySelector("#dictionary-tools-button");
const addButton = document.querySelector("#add-button");
const importFile = document.querySelector("#import-file");
let storageWarning = "";
let editingCardIndex = null;
let formReturnScreen = "home";
let hiraganaManuallyEdited = false;
let addFeedbackTimeout = null;

let cards = loadCards();
let practiceDeck = [];
let englishPracticeRun = null;
let practiceTarget = 0;
let practiceIndex = 0;
let answerRevealed = false;
let selectedSessionSize = 5;
let advancingPractice = false;
let keyboardNavigation = false;

function loadCards() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((card) => typeof card?.japanese === "string" && (typeof card?.english === "string" || Array.isArray(card?.meanings)))
        .map((card) => {
          const meanings = (Array.isArray(card.meanings) ? card.meanings : [card.english]).filter((meaning) => typeof meaning === "string").map((meaning) => meaning.trim()).filter(Boolean);
          return { ...card, english: meanings[0] || "", meanings, hiragana: typeof card.hiragana === "string" && card.hiragana ? card.hiragana : romajiToHiragana(card.japanese) };
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

function renderDictionaryList(highlightIndex = -1) {
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
  showScreen("practice");
  renderPracticeCard();
}

function renderPracticeCard() {
  const fromEnglish = originLanguage.value === "english";
  if (fromEnglish && !practiceDeck[practiceIndex]) drawEnglishPracticeCard();
  const entry = practiceDeck[practiceIndex];
  const card = fromEnglish ? entry.card : entry;
  if (fromEnglish) {
    promptWord.textContent = entry.meaning;
    renderJapaneseWord(answerWord, card);
  } else {
    renderJapaneseWord(promptWord, card);
    answerWord.textContent = card.meanings.join("\n\n");
  }
  answerWord.hidden = true;
  answerWord.classList.remove("is-appearing");
  revealHint.hidden = false;
  flashcard.classList.remove("is-revealing", "is-advancing", "is-entering");
  flashcard.disabled = false;
  advancingPractice = false;
  flashcard.setAttribute("aria-expanded", "false");
  answerRevealed = false;
  progressLabel.textContent = `${practiceIndex} of ${practiceTarget} completed`;
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

function drawEnglishPracticeCard() {
  practiceDeck[practiceIndex] = englishPracticeRun.draw();
}

function meaningInputs() {
  return [...englishMeanings.querySelectorAll("input")];
}

function addMeaningInput(value = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.name = "meanings";
  input.placeholder = "Another meaning";
  input.value = value;
  englishMeanings.append(input);
  return input;
}

function resetMeaningInputs(values = [""]) {
  const inputs = meaningInputs();
  inputs.slice(1).forEach((input) => input.remove());
  const first = meaningInputs()[0] || addMeaningInput();
  first.value = values[0] || "";
  values.slice(1).forEach((value) => addMeaningInput(value));
}

function renderSessionProgress() {
  const total = practiceTarget;
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
    if (practiceIndex === practiceTarget - 1) {
      progressLabel.textContent = `${practiceTarget} of ${practiceTarget} completed`;
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
  resetMeaningInputs();
  editingCardIndex = null;
  formReturnScreen = "home";
  hiraganaManuallyEdited = false;
  addFeedback.hidden = true;
  window.clearTimeout(addFeedbackTimeout);
  formTitle.textContent = "Add a new word";
  formSubmitButton.textContent = "Add";
  cancelEditButton.hidden = true;
  backToLearningButton.hidden = false;
  enterHint.hidden = false;
  closeDictionaryMenu();
  showScreen("add");
  japaneseInput.focus();
}

function startEditingCard(index) {
  const card = cards[index];
  if (!card) return;
  editingCardIndex = index;
  formReturnScreen = "dictionary";
  hiraganaManuallyEdited = false;
  japaneseInput.value = card.japanese;
  hiraganaInput.value = card.hiragana || romajiToHiragana(card.japanese);
  resetMeaningInputs(card.meanings?.length ? card.meanings : [card.english]);
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

addButton.addEventListener("click", startAddingWord);
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
  if (event.pointerType === "mouse" && !dictionaryTools.contains(document.activeElement)) closeDictionaryMenu();
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
document.querySelector("#export-action").addEventListener("click", exportDictionary);
document.querySelector("#import-action").addEventListener("click", () => importFile.click());
document.querySelector("#clear-action").addEventListener("click", confirmClearDictionary);
document.querySelector("#confirm-clear").addEventListener("click", clearDictionary);
importFile.addEventListener("change", () => importDictionary(importFile.files?.[0]));
backToLearningButton.addEventListener("click", cancelCardForm);
dictionaryButton.addEventListener("click", () => {
  renderDictionaryList();
  showScreen("dictionary");
});

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const japanese = japaneseInput.value.trim();
  const hiragana = hiraganaInput.value.trim() || romajiToHiragana(japanese);
  const meanings = meaningInputs().map((input) => input.value.trim()).filter(Boolean);
  if (!japanese || meanings.length === 0) return;
  const english = meanings[0];
  const isEditing = editingCardIndex !== null;
  const nextCards = !isEditing
    ? [...cards, { id: crypto.randomUUID?.() || String(Date.now()), japanese, hiragana, english, meanings }]
    : updateCardAt(cards, editingCardIndex, { japanese, hiragana, english, meanings });
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
  if (!(event.target instanceof HTMLInputElement) || !event.target.matches("#english-meanings input")) return;
  if (event.key === "Tab" && !event.shiftKey) {
    event.preventDefault();
    const inputs = meaningInputs();
    const index = inputs.indexOf(event.target);
    (inputs[index + 1] || addMeaningInput()).focus();
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
  englishInput.focus();
});

japaneseInput.addEventListener("input", () => {
  if (shouldAutoConvertHiragana(hiraganaManuallyEdited, hiraganaInput.value)) {
    hiraganaInput.value = romajiToHiragana(japaneseInput.value.trim());
    hiraganaManuallyEdited = false;
  }
});

hiraganaInput.addEventListener("input", () => { hiraganaManuallyEdited = true; });

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
document.querySelector("#add-back-button").addEventListener("click", cancelCardForm);
cancelEditButton.addEventListener("click", cancelCardForm);

updateDictionaryCount();
