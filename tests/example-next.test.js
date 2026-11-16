const test = require("node:test");
const assert = require("node:assert/strict");
const { createController } = require("../example-suggestions.js");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const language = readFileSync(path.join(__dirname, "..", "language.js"), "utf8");

class UiNode {
  constructor(tag = "div") {
    this.tagName = tag; this.children = []; this.parentNode = null; this.className = "";
    this.attributes = {}; this.dataset = {}; this.listeners = {}; this.disabled = false; this.value = "";
    this._text = ""; this.hidden = false;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: name => { this.className = this.className.split(/\s+/).filter(item => item && item !== name).join(" "); },
      toggle: (name, force) => { const add = force === undefined ? !this.classList.contains(name) : force; this.classList[add ? "add" : "remove"](name); return add; },
    };
  }
  get textContent() { return this.children.length ? this.children.map(child => child.textContent).join("") : this._text; }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get isConnected() { return this._connected || Boolean(this.parentNode?.isConnected); }
  append(...nodes) { for (const node of nodes) { if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1); node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this._text = ""; this.append(...nodes); }
  before(node) { if (!this.parentNode) return; const index = this.parentNode.children.indexOf(this); node.parentNode = this.parentNode; this.parentNode.children.splice(index, 0, node); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  fire(name, event = {}) { for (const callback of this.listeners[name] || []) callback({target: this, ...event}); }
  click() { this.fire("click"); }
  matches(selector) { return selector.split(",").some(item => this.className.split(/\s+/).includes(item.trim().slice(1))); }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const selectors = selector.split(",").map(item => item.trim().slice(1)); const found = [];
    const walk = node => { for (const child of node.children) { if (selectors.some(name => child.className.split(/\s+/).includes(name))) found.push(child); walk(child); } };
    walk(this); return found;
  }
}

function uiGroup(prefix, groupClass) {
  const group = new UiNode("div"); group.className = groupClass;
  const meaning = new UiNode("input"); meaning.className = "meaning-translation";
  const examples = new UiNode("div"); examples.className = `${prefix}-example-fields`;
  const romaji = new UiNode("input"); romaji.className = `${prefix}-example-romaji`;
  const hiragana = new UiNode("input"); hiragana.className = `${prefix}-example-hiragana`; hiragana.dataset.manuallyEdited = "false";
  const english = new UiNode("input"); english.className = `${prefix}-example-english`;
  examples.append(romaji, hiragana, english); group.append(meaning, examples);
  return {group, meaning, examples, romaji, hiragana, english};
}

function setupUiGroups() {
  const wordList = new UiNode("div"); wordList._connected = true;
  const cardForm = new UiNode("form"); cardForm._connected = true;
  const japaneseInput = new UiNode("input"); japaneseInput.value = "taberu";
  const hiraganaInput = new UiNode("input"); hiraganaInput.value = "たべる";
  const inlineRow = new UiNode("article"); inlineRow.className = "deck-entry-row";
  const inlineJapanese = new UiNode("input"); inlineJapanese.className = "deck-entry-japanese"; inlineJapanese.value = "taberu";
  const inlineHiragana = new UiNode("input"); inlineHiragana.className = "deck-entry-hiragana"; inlineHiragana.value = "たべる";
  const inlineMeanings = new UiNode("div"); inlineMeanings.className = "deck-entry-meanings";
  inlineRow.append(inlineJapanese, inlineHiragana, inlineMeanings); wordList.append(inlineRow);
  const inlineA = uiGroup("deck-entry", "deck-entry-meaning-group"); inlineA.meaning.value = "to eat";
  const inlineB = uiGroup("deck-entry", "deck-entry-meaning-group"); inlineB.meaning.value = "to eat fruit";
  inlineMeanings.append(inlineA.group, inlineB.group);
  const englishMeanings = new UiNode("div"); englishMeanings.id = "english-meanings";
  const standalone = uiGroup("meaning", "meaning-entry-group"); standalone.meaning.value = "to eat";
  englishMeanings.append(standalone.group); cardForm.append(japaneseInput, hiraganaInput, englishMeanings);
  const panels = {inline: new UiNode("section"), add: new UiNode("section")};
  const suggestionsCalls = [];
  const requests = [];
  let alternatives = 0;
  const exampleService = {suggest: (context, excluded) => {
    requests.push({context: {...context}, excluded: [...excluded]});
    return Promise.resolve(context.meaning === "to eat fruit" ? examples[1] : examples[0]);
  }, allSuggestions: async context => context.meaning === "to eat fruit" ? examples : [examples[0]],
  alternatives: async () => { alternatives++; return []; }};
  const context = vm.createContext({
    document: {documentElement: {lang: "en"}, createElement: tag => new UiNode(tag),
      createElementNS: (namespace, tag) => { const node = new UiNode(tag); node.namespaceURI = namespace; return node; }},
    window: {JapaneseExampleSuggestions: {createController}},
    wordList, cardForm, japaneseInput, hiraganaInput, exampleService,
    activeExampleGroups: new WeakMap(), exampleControllers: new WeakMap(), exampleStatusId: 0,
    exampleGroupSelector: ".meaning-entry-group, .deck-entry-meaning-group",
    screens: {deck: {hidden: false}, add: {hidden: false}}, editingCardIndex: null,
    hasMatchingDeckWord: () => false,
    renderSpellingSuggestions: host => { suggestionsCalls.push(host); panels[host === wordList ? "inline" : "add"].hidden = true; },
    compactHiragana: value => value, romajiToHiragana: value => value,
    refreshExampleFields: () => {}, hiraganaManuallyEdited: false,
  });
  const start = app.indexOf("function setupExampleFields");
  const end = app.indexOf("function refreshExampleFields", start);
  vm.runInContext(app.slice(start, end), context);
  context.setupExampleFields(inlineA.group, inlineRow);
  context.setupExampleFields(inlineB.group, inlineRow);
  context.setupExampleFields(standalone.group);
  return {context, wordList, cardForm, englishMeanings, inlineA, inlineB, standalone, inlineRow, panels, suggestionsCalls, requests,
    get alternatives() { return alternatives; }};
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
}

function harness({suggest = () => null, allSuggestions, findAlternatives = null, isActive = () => true} = {}) {
  const fields = [0, 1, 2].map(() => ({value: "", dataset: {}, disabled: true}));
  const context = {japanese: "taberu", hiragana: "たべる", meaning: "to eat", language: "en"};
  const statuses = [];
  const nextStates = [];
  const alternatives = [];
  const controller = createController({fields, getContext: () => context, suggest, allSuggestions,
    findAlternatives, onAlternatives: value => alternatives.push(value),
    setStatus: (message, state) => statuses.push({message, state}),
    setNavigationState: state => nextStates.push({...state}), isActive});
  return {fields, context, statuses, nextStates, alternatives, controller};
}

const examples = [
  {romaji: "ringo wo taberu.", hiragana: "りんごをたべる。", english: "I eat an apple."},
  {romaji: "asagohan wo tabemashita ka?", hiragana: "あさごはんをたべましたか。", english: "Did you eat breakfast?"},
  {romaji: "kono resutoran de tabeyou.", hiragana: "このレストランでたべよう。", english: "Let's eat at this restaurant."},
];

test("focus remains non-overwriting for partial and full examples", async () => {
  for (const index of [0, 1, 2]) {
    let calls = 0;
    const h = harness({suggest: () => { calls++; return examples[0]; }});
    h.controller.refresh();
    h.fields[index].value = `manual-${index}`;
    h.controller.refresh();
    await h.controller.focus();
    assert.equal(calls, 0);
    assert.equal(h.fields[index].value, `manual-${index}`);
  }
  const h = harness({suggest: () => examples[0]});
  h.controller.refresh();
  await h.controller.focus();
  assert.deepEqual(h.fields.map(field => field.value), Object.values(examples[0]));
  assert.equal(h.fields[1].dataset.manuallyEdited, "false");
});

test("focus does not overwrite partial or full examples and establishes the initial counter", async () => {
  for (const index of [0, 1, 2]) {
    let calls = 0;
    const h = harness({suggest: () => { calls++; return examples[0]; }});
    h.controller.refresh();
    h.fields[index].value = `manual-${index}`;
    h.controller.refresh();
    await h.controller.focus();
    assert.equal(calls, 0);
    assert.equal(h.fields[index].value, `manual-${index}`);
  }
  const h = harness({allSuggestions: async () => examples});
  h.controller.refresh();
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 0, total: 0});
  await h.controller.focus();
  assert.deepEqual(h.fields.map(field => field.value), Object.values(examples[0]));
  assert.equal(h.fields[1].dataset.manuallyEdited, "false");
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 1, total: 3});
});

test("right advances and left reverses through all examples, wrapping at both ends", async () => {
  let loads = 0;
  const h = harness({allSuggestions: async () => { loads++; return examples; }});
  h.controller.refresh();
  await h.controller.focus();
  const shown = [h.fields[0].value];
  await h.controller.next(); shown.push(h.fields[0].value);
  await h.controller.next(); shown.push(h.fields[0].value);
  await h.controller.next(); shown.push(h.fields[0].value);
  await h.controller.previous(); shown.push(h.fields[0].value);
  await h.controller.previous(); shown.push(h.fields[0].value);
  await h.controller.previous(); shown.push(h.fields[0].value);
  await h.controller.previous(); shown.push(h.fields[0].value);
  assert.deepEqual(shown, [examples[0].romaji, examples[1].romaji, examples[2].romaji,
    examples[0].romaji, examples[2].romaji, examples[1].romaji, examples[0].romaji, examples[2].romaji]);
  assert.equal(loads, 1);
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 3, total: 3});
});

test("manual example edits retain the loaded list and counter; context edits reset both", async () => {
  const h = harness({allSuggestions: async context => context.meaning === "to eat" ? examples : [examples[2]]});
  h.controller.refresh();
  await h.controller.focus();
  h.fields[0].value = "my custom sentence";
  h.controller.refresh();
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 0, total: 3});
  h.fields[0].value = examples[1].romaji;
  h.controller.refresh();
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 2, total: 3});
  await h.controller.next();
  assert.equal(h.fields[0].value, examples[2].romaji);
  await h.controller.previous();
  assert.equal(h.fields[0].value, examples[1].romaji);
  h.context.meaning = "a new sense";
  h.controller.refresh();
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 0, total: 0});
  await h.controller.next();
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 1, total: 1});
});

test("single result wraps to itself and no results preserve the manual example", async () => {
  const one = harness({allSuggestions: async () => [examples[0]]});
  one.controller.refresh();
  await one.controller.focus();
  await one.controller.next();
  assert.equal(one.fields[0].value, examples[0].romaji);
  assert.deepEqual(one.nextStates.at(-1), {disabled: false, busy: false, position: 1, total: 1});
  await one.controller.previous();
  assert.equal(one.fields[0].value, examples[0].romaji);

  let calls = 0, alternatives = 0;
  const none = harness({allSuggestions: async () => { calls++; return []; },
    findAlternatives: async () => { alternatives++; return []; }});
  none.fields.forEach((field, index) => { field.value = ["manual romaji", "manual reading", "manual translation"][index]; });
  none.controller.refresh();
  const before = none.fields.map(field => field.value);
  await none.controller.next();
  assert.deepEqual(none.fields.map(field => field.value), before);
  assert.deepEqual(none.nextStates.at(-1), {disabled: true, busy: false, position: 0, total: 0});
  assert.equal(none.statuses.at(-1).message, "No more matching examples.");
  await none.controller.next();
  assert.equal(calls, 1);
  assert.equal(alternatives, 0);
});

test("focus no-match retains its spelling fallback", async () => {
  let alternatives = 0;
  const h = harness({allSuggestions: async () => [], findAlternatives: async () => { alternatives++; return []; }});
  h.controller.refresh();
  await h.controller.focus();
  assert.equal(alternatives, 1);
  assert.equal(h.statuses.at(-1).state, "empty");
  assert.deepEqual(h.nextStates.at(-1), {disabled: true, busy: false, position: 0, total: 0});
});

test("initial list loading is shared by both arrows and the form wait guard", async () => {
  const request = deferred();
  let calls = 0;
  const h = harness({allSuggestions: () => { calls++; return request.promise; }});
  h.controller.refresh();
  const pending = h.controller.focus();
  assert.equal(h.controller.next(), pending);
  assert.equal(h.controller.previous(), pending);
  assert.equal(h.controller.wait(), pending);
  assert.deepEqual(h.statuses.at(-1), {message: "", state: "loading"});
  assert.deepEqual(h.nextStates.at(-1), {disabled: true, busy: true, position: 0, total: 0});
  await Promise.resolve();
  assert.equal(calls, 1);
  request.resolve(examples);
  await pending;
  assert.deepEqual(h.fields.map(field => field.value), Object.values(examples[0]));
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 1, total: 3});
});

test("stale list loads cannot change the count or current example after context change or detachment", async () => {
  const oldRequest = deferred(), currentRequest = deferred();
  let calls = 0;
  const h = harness({allSuggestions: () => (++calls === 1 ? oldRequest.promise : currentRequest.promise)});
  h.controller.refresh();
  const stale = h.controller.next();
  await Promise.resolve();
  h.context.meaning = "new meaning";
  h.controller.refresh();
  const current = h.controller.next();
  await Promise.resolve();
  oldRequest.resolve(examples);
  await stale;
  assert.deepEqual(h.fields.map(field => field.value), ["", "", ""]);
  assert.deepEqual(h.nextStates.at(-1), {disabled: true, busy: true, position: 0, total: 0});
  currentRequest.resolve([examples[1], examples[2]]);
  await current;
  assert.deepEqual(h.fields.map(field => field.value), Object.values(examples[1]));
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 1, total: 2});

  let active = true;
  const detachedRequest = deferred();
  const detached = harness({isActive: () => active, allSuggestions: () => detachedRequest.promise});
  detached.controller.refresh();
  const pending = detached.controller.next();
  await Promise.resolve();
  active = false;
  detachedRequest.resolve(examples);
  await pending;
  assert.deepEqual(detached.fields.map(field => field.value), ["", "", ""]);
  assert.deepEqual(detached.nextStates.at(-1), {disabled: false, busy: false, position: 0, total: 0});
});

test("a failed list load preserves fields and retries", async () => {
  let calls = 0;
  const h = harness({allSuggestions: async () => { if (++calls === 1) throw new Error("offline"); return examples; }});
  h.fields[0].value = "manual sentence";
  h.fields[1].value = "manual reading";
  h.fields[2].value = "manual translation";
  h.controller.refresh();
  const before = h.fields.map(field => field.value);
  await h.controller.next();
  assert.deepEqual(h.fields.map(field => field.value), before);
  assert.equal(h.statuses.at(-1).state, "error");
  assert.deepEqual(h.nextStates.at(-1), {disabled: false, busy: false, position: 0, total: 0});
  await h.controller.next();
  assert.equal(calls, 2);
  assert.deepEqual(h.fields.map(field => field.value), Object.values(examples[0]));
});
test("arrow UI exposes accessible labels, a live counter, and keyboard order", () => {
  const setupStart = app.indexOf("function setupExampleFields");
  const setupEnd = app.indexOf("function refreshExampleFields", setupStart);
  const setup = app.slice(setupStart, setupEnd);
  assert.match(setup, /fields\[0\]\.before\(romajiControl\)[\s\S]*?romajiControl\.append\(fields\[0\]\)/);
  assert.match(setup, /previousButton\.type = "button"/);
  assert.match(setup, /nextButton\.type = "button"/);
  assert.match(setup, /previousButton\.setAttribute\("aria-label", "Previous example"\)/);
  assert.match(setup, /nextButton\.setAttribute\("aria-label", "Next example"\)/);
  assert.match(setup, /previousIcon\.setAttribute\("viewBox", "0 0 24 24"\)[\s\S]*?previousIcon\.setAttribute\("focusable", "false"\)/);
  assert.match(setup, /previousPath\.setAttribute\("d", "M19 12H5 M12 19l-7-7 7-7"\)/);
  assert.match(setup, /nextPath\.setAttribute\("d", "M5 12h14 M12 5l7 7-7 7"\)/);
  assert.match(setup, /counter\.className = "example-counter"[\s\S]*?counter\.textContent = "0\/0"/);
  assert.match(setup, /controller\.next\(\)/);
  assert.match(setup, /controller\.previous\(\)/);
  assert.match(setup, /counter\.textContent = `\$\{position\}\/\$\{total\}`/);
  assert.match(app, /const previousButton = group\?\.querySelector\("\.example-previous-button"\)/);
  assert.match(app, /const nextButton = group\?\.querySelector\("\.example-next-button"\)/);
  assert.match(app, /isExampleRomajiField[\s\S]*?previousButton && !previousButton\.disabled \? previousButton/);
  assert.match(app, /isPreviousButton\) \{\s*event\.preventDefault\(\);[\s\S]*?nextButton && !nextButton\.disabled \? nextButton/);
  assert.match(app, /if \(\(isPreviousButton \|\| isNextButton\) && \(event\.key === "Enter" \|\| event\.key === " "\)\) return/);
  assert.match(styles, /\.example-romaji-control\s*\{[^}]*align-items:\s*flex-end/);
  assert.match(styles, /\.example-navigation\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*center[^}]*gap:\s*3px/);
  assert.match(styles, /\.example-english-control\s*\{[^}]*display:\s*flex/);
  assert.match(styles, /\.example-counter\s*\{[^}]*flex:\s*0 0 auto[^}]*width:\s*72px[^}]*font-size:\s*14px/);
  assert.match(styles, /\.example-previous-button, \.example-next-button\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center/);
  assert.match(styles, /\.example-navigation-icon\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/);
  assert.match(language, /"Next example": "Siguiente ejemplo"/);
  assert.match(language, /"Previous example": "Ejemplo anterior"/);
  assert.match(language, /"No more matching examples\.": "No hay más ejemplos coincidentes\."/);
});

test("actual setup puts counter and arrow pairs beside both forms and both directions change only their group", async () => {
  const ui = setupUiGroups();
  for (const item of [ui.inlineA, ui.inlineB, ui.standalone]) {
    const control = item.romaji.parentNode;
    assert.equal(control.className, "example-romaji-control");
    assert.equal(control.children[0], item.romaji);
    const navigation = control.children[1];
    assert.equal(navigation.className, "example-navigation");
    const [counter, buttons] = navigation.children;
    assert.equal(navigation.children.length, 2);
    assert.equal(counter.parentNode, navigation);
    assert.equal(buttons.parentNode, navigation);
    assert.equal(buttons.className, "example-navigation-buttons");
    assert.equal(item.group.querySelector(".meaning-translation").parentNode, item.group);
    assert.equal(counter, item.group.querySelector(".example-counter"));
    assert.equal(counter.className, "example-counter");
    assert.equal(counter.getAttribute("aria-live"), "polite");
    assert.equal(counter.textContent, "0/0");
    assert.equal(buttons.children.length, 2);
    for (const [button, className, label, pathData] of [
      [buttons.children[0], "example-previous-button", "Previous example", "M19 12H5 M12 19l-7-7 7-7"],
      [buttons.children[1], "example-next-button", "Next example", "M5 12h14 M12 5l7 7-7 7"],
    ]) {
      assert.equal(button.className, className);
      assert.equal(button.type, "button");
      assert.equal(button.getAttribute("aria-label"), label);
      assert.equal(button.title, label);
      assert.equal(button.children[0].tagName, "svg");
      assert.equal(button.children[0].namespaceURI, "http://www.w3.org/2000/svg");
      assert.equal(button.children[0].getAttribute("aria-hidden"), "true");
      assert.equal(button.children[0].getAttribute("focusable"), "false");
      assert.equal(button.children[0].children[0].tagName, "path");
      assert.equal(button.children[0].children[0].getAttribute("d"), pathData);
      assert.equal(button.children[0].children[0].getAttribute("stroke"), "currentColor");
      assert.equal(button.disabled, false);
      assert.equal(button.getAttribute("aria-busy"), "false");
    }
  }
  const navB = ui.inlineB.romaji.parentNode.children[1];
  const counterB = navB.children[0], [previousB, nextB] = navB.children[1].children;
  nextB.click();
  assert.equal(nextB.disabled, true);
  assert.equal(nextB.getAttribute("aria-busy"), "true");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.inlineA.romaji.value, "");
  assert.equal(ui.inlineB.romaji.value, examples[0].romaji);
  assert.equal(counterB.textContent, "1/3");
  assert.equal(nextB.disabled, false);
  assert.equal(nextB.getAttribute("aria-busy"), "false");
  assert.equal(ui.context.activeExampleGroups.get(ui.wordList), ui.inlineB.group);
  assert.ok(ui.suggestionsCalls.includes(ui.wordList));
  nextB.click();
  assert.equal(ui.inlineB.romaji.value, examples[1].romaji);
  assert.equal(counterB.textContent, "2/3");
  previousB.click();
  assert.equal(ui.inlineB.romaji.value, examples[0].romaji);
  assert.equal(counterB.textContent, "1/3");
  previousB.click();
  assert.equal(ui.inlineB.romaji.value, examples[2].romaji);
  assert.equal(counterB.textContent, "3/3");
  nextB.click();
  assert.equal(ui.inlineB.romaji.value, examples[0].romaji);
  assert.equal(counterB.textContent, "1/3");
  assert.equal(ui.alternatives, 0);
  assert.equal(ui.inlineB.group.querySelector(".example-status").textContent, "");
  assert.equal(ui.inlineB.group.querySelector(".example-status").hidden, true);
  ui.standalone.romaji.parentNode.querySelector(".example-next-button").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.standalone.romaji.value, examples[0].romaji);
  assert.equal(ui.inlineA.romaji.value, "");
  assert.equal(ui.context.activeExampleGroups.get(ui.cardForm), ui.standalone.group);
  assert.ok(ui.suggestionsCalls.includes(ui.cardForm));
  assert.equal(ui.standalone.group.querySelector(".example-counter").textContent, "1/1");
  assert.deepEqual([ui.inlineA.romaji.parentNode.children[0], ui.standalone.romaji.parentNode.children[0]], [ui.inlineA.romaji, ui.standalone.romaji]);
  assert.ok(ui.inlineRow.parentNode === ui.wordList);
  assert.ok(ui.standalone.group.parentNode === ui.englishMeanings);
  assert.ok(ui.standalone.group.parentNode === ui.englishMeanings);
});
