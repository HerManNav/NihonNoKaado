(() => {
  const gate = document.querySelector("#language-gate");
  const app = document.querySelector(".app-shell");
  const languageOptions = gate.querySelector(".language-options");
  const loading = gate.querySelector(".language-loading");
  const loadingLabel = gate.querySelector("[data-loading-label]");
  const loadingFootnote = gate.querySelector("[data-loading-footnote]");
  const loadingPercent = gate.querySelector("[data-loading-percent]");
  const loadingTrack = gate.querySelector("[role='progressbar']");
  const loadingFill = gate.querySelector(".loading-fill");
  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);
  let translationObserver = null;
  let transitionInProgress = false;

  const translations = new Map(Object.entries({
    "Show me": "Quiero ver primero",
    "Japanese first": "Japonés primero",
    "English first": "Inglés primero",
    "Cards per session": "Tarjetas por sesión",
    "Cards per practice session": "Tarjetas por sesión de práctica",
    "Whole dictionary": "Todo el diccionario",
    "Start session": "Empezar sesión",
    "Romaji meanings use ": "Los significados en romaji usan ",
    " by James William Breen and EDRDG. Ranking uses ": " de James William Breen y EDRDG. La clasificación usa ",
    ". Data is ": ". Los datos están bajo la licencia ",
    "Browse default dictionaries": "Explorar diccionarios predeterminados",
    "Dictionary tools": "Herramientas del diccionario",
    "Clear dictionary": "Vaciar diccionario",
    "Import dictionary": "Importar diccionario",
    "Export dictionary": "Exportar diccionario",
    "View dictionary (0)": "Ver diccionario (0)",
    "Practice": "Práctica",
    "Language": "Idioma",
    "← Back": "← Volver",
    "Tap the card to discover its meaning before moving on.": "Toca la tarjeta para descubrir su significado antes de continuar.",
    "Tap to reveal translation": "Toca para ver la traducción",
    "Session progress. Click a shown dot to review that card.": "Progreso de la sesión. Pulsa un punto visible para repasar esa tarjeta.",
    "Current dictionary": "Diccionario actual",
    "Default dictionaries": "Diccionarios predeterminados",
    "Choose a starter dictionary. Loading one will replace the dictionary saved in this browser.": "Elige un diccionario inicial. Al cargarlo, se reemplazará el diccionario guardado en este navegador.",
    "The 50- and 100-word sets keep their original news and online frequency list. The 500-, 1,000-, and 2,000-word sets use a Japanese news frequency ranking, filtered to unique romaji words with a sense-matched example.": "Las listas de 50 y 100 palabras conservan sus fuentes originales de frecuencia en noticias y sitios web. Las listas de 500, 1.000 y 2.000 palabras usan una clasificación basada en noticias japonesas, filtrada para incluir palabras únicas en romaji con ejemplos acordes a su significado.",
    "Meanings and example sentences come from the ": "Los significados y las frases de ejemplo proceden del ",
    ". Its entries include sense-tagged examples and are reviewed as part of the project. TKG data is public domain (CC0).": ". Sus entradas incluyen ejemplos etiquetados por significado y se revisan como parte del proyecto. Los datos de TKG son de dominio público (CC0).",
    "The larger-set frequency ranking comes from ": "La clasificación de frecuencia de las listas más grandes procede de ",
    ", based on Leipzig Corpora Collection news counts. The list is CC BY-SA 4.0. The 50- and 100-word lists retain the ": ", basada en los recuentos de noticias de Leipzig Corpora Collection. La lista usa la licencia CC BY-SA 4.0. Las listas de 50 y 100 palabras mantienen la ",
    ".": ".",
    "DEFAULT DICTIONARY": "DICCIONARIO PREDETERMINADO",
    "Replace your dictionary?": "¿Reemplazar tu diccionario?",
    "Cancel": "Cancelar",
    "Replace and load": "Reemplazar y cargar",
    "Add a new Card": "Añadir una tarjeta",
    "Japanese (romaji)": "Japonés (romaji)",
    "e.g. ohayou": "p. ej., ohayou",
    "Hiragana": "Hiragana",
    "English meaning(s)": "Significado(s) en inglés",
    "e.g. good morning": "p. ej., buenos días",
    "Example (romaji)": "Ejemplo (romaji)",
    "Example (hiragana)": "Ejemplo (hiragana)",
    "Example translation": "Traducción del ejemplo",
    "Press Tab after an example translation to add another meaning": "Pulsa Tab después de la traducción de un ejemplo para añadir otro significado",
    "Press Enter to add": "Pulsa Intro para añadir",
    "Add": "Añadir",
    "Back to learning": "Volver al aprendizaje",
    "Clear your dictionary?": "¿Vaciar tu diccionario?",
    "This cannot be undone.": "Esta acción no se puede deshacer.",
    "Delete all cards": "Eliminar todas las tarjetas",
    "Browse default dictionaries": "Explorar diccionarios predeterminados",
    "Remove this word": "Eliminar esta palabra",
    "Edit": "Editar",
    "Add a dictionary entry": "Añadir una entrada al diccionario",
    "New Japanese word in romaji": "Nueva palabra japonesa en romaji",
    "New word in hiragana": "Nueva palabra en hiragana",
    "English meaning": "Significado en inglés",
    "New English meaning": "Nuevo significado en inglés",
    "Press Tab for another meaning": "Pulsa Tab para añadir otro significado",
    "Press Enter to add card": "Pulsa Intro para añadir la tarjeta",
    "Press ": "Pulsa ",
    " for another meaning": " para añadir otro significado",
    " to add card": " para añadir la tarjeta",
    "Another meaning": "Otro significado",
    "New Example (romaji)": "Nuevo ejemplo (romaji)",
    "New Example (hiragana)": "Nuevo ejemplo (hiragana)",
    "New Example translation": "Nueva traducción del ejemplo",
    "Try again": "Intentar de nuevo",
    "Select a dictionary to replace the one saved in this browser.": "Selecciona un diccionario para reemplazar el que está guardado en este navegador.",
    "Loading available dictionaries…": "Cargando diccionarios disponibles…",
    "No default dictionaries are available yet.": "Todavía no hay diccionarios predeterminados disponibles.",
    "1 available": "1 disponible",
    "Replace your dictionary?": "¿Reemplazar tu diccionario?",
    "Load this dictionary?": "¿Cargar este diccionario?",
    "Load dictionary": "Cargar diccionario",
    "Loading…": "Cargando…",
    "This page was opened directly from disk. Open Japanese Cards through a website or local web server to load its JSON dictionaries.": "Esta página se abrió directamente desde el disco. Abre Japanese Cards desde un sitio web o un servidor local para cargar sus diccionarios JSON.",
    "Your current dictionary is unchanged; try again.": "Tu diccionario actual no ha cambiado. Inténtalo de nuevo.",
    "The cards will be saved in this browser.": "Las tarjetas se guardarán en este navegador.",
    "This cannot be undone. Export a backup first if you want to keep your current cards.": "Esta acción no se puede deshacer. Exporta una copia de seguridad si quieres conservar tus tarjetas actuales.",
    "Edit word": "Editar palabra",
    "Save changes": "Guardar cambios",
    "Back to learning": "Volver al aprendizaje",
    "The saved dictionary could not be deleted from this browser.": "No se pudo eliminar el diccionario guardado en este navegador.",
    "Saved dictionary could not be read. Export a backup after restoring it.": "No se pudo leer el diccionario guardado. Restáuralo y exporta una copia de seguridad.",
    "Browser storage is unavailable. Export a backup before closing this page.": "El almacenamiento del navegador no está disponible. Exporta una copia de seguridad antes de cerrar esta página.",
    "The card could not be saved in this browser. Export a backup before closing this page.": "No se pudo guardar la tarjeta en este navegador. Exporta una copia de seguridad antes de cerrar esta página.",
    "The word could not be removed from browser storage.": "No se pudo eliminar la palabra del almacenamiento del navegador.",
    "Name this dictionary:": "Ponle un nombre a este diccionario:",
    "Japanese dictionary": "Diccionario de japonés",
    "Replace your current dictionary of ": "¿Reemplazar el diccionario actual, que tiene ",
    " cards with ": " tarjetas, por uno con ",
    " imported cards?": " tarjetas importadas?",
    "The dictionary could not be saved in this browser. Export a backup before closing this page.": "No se pudo guardar el diccionario en este navegador. Exporta una copia de seguridad antes de cerrar esta página.",
    "The dictionary could not be imported.": "No se pudo importar el diccionario.",
    "Add your first word to start practicing or import a dictionary.": "Añade tu primera palabra para empezar a practicar o importa un diccionario.",
    "Guess": "Adivina",
    "Next": "Siguiente",
    "Current card ": "Tarjeta actual ",
    ", answer revealed": ", respuesta revelada",
    ", guess this card": ", intenta adivinar esta tarjeta",
    "Review card ": "Repasar tarjeta ",
    "Session progress, card ": "Progreso de la sesión, tarjeta ",
    " of ": " de ",
    ". Click a shown dot to review it. The marker shows the current card.": ". Pulsa un punto visible para repasarlo. El indicador muestra la tarjeta actual.",
    "Loading available dictionaries…": "Cargando diccionarios disponibles…",
    "The dictionary file at ": "El archivo de diccionario en ",
    " returned HTTP ": " devolvió el estado HTTP ",
    "Could not load ": "No se pudo cargar ",
    ". Check the connection and try again.": ". Comprueba la conexión e inténtalo de nuevo.",
    "The new dictionary could not be saved in this browser.": "No se pudo guardar el nuevo diccionario en este navegador.",
    "Added “": "Se añadió «",
    "” to your dictionary.": "» a tu diccionario.",
    "This will delete the 1 card saved in this browser.": "Se eliminará la única tarjeta guardada en este navegador.",
    "This will delete all ": "Se eliminarán las ",
    " cards saved in this browser.": " tarjetas guardadas en este navegador."
  }).map(([source, target]) => [source.trim(), target.trim()]));

  const exactPatterns = [
    [/^(\d+) Cards in your dictionary$/, (_, n) => `${n} tarjetas en tu diccionario`],
    [/^View dictionary \((\d+)\)$/, (_, n) => `Ver diccionario (${n})`],
    [/^1 word in your dictionary$/, () => "1 palabra en tu diccionario"],
    [/^(\d+) words?$/, (_, n) => `${n} ${n === "1" ? "palabra" : "palabras"}`],
    [/^(\d+) cards?$/, (_, n) => `${n} ${n === "1" ? "tarjeta" : "tarjetas"}`],
    [/^(\d+) of (\d+) completed$/, (_, a, b) => `${a} de ${b} completadas`],
    [/^(\d+) (card|cards) left$/, (_, n) => `${n} ${n === "1" ? "tarjeta" : "tarjetas"} restantes`],
    [/^Remove (.+)$/, (_, word) => `Eliminar ${word}`],
    [/^Edit (.+)$/, (_, word) => `Editar ${word}`],
    [/^New (.+)$/, (_, label) => `Nuevo ${label.toLowerCase()}`],
    [/^(\d+) available$/, (_, n) => `${n} ${n === "1" ? "disponible" : "disponibles"}`],
    [/^Most common Japanese — ([\d,]+) words$/, (_, n) => `Palabras japonesas más frecuentes — ${n}`],
    [/^“(.+)” contains (\d+) cards?\. It will replace your current dictionary of (\d+) (card|cards)\.$/, (_, name, count, total) => `«${name}» contiene ${count} tarjetas. Reemplazará tu diccionario actual de ${total} ${total === "1" ? "tarjeta" : "tarjetas"}.`],
    [/^Load “(.+)” with (\d+) cards?\?$/, (_, name, count) => `¿Cargar «${name}» con ${count} tarjetas?`],
    [/^Loading “(.+)”…$/, (_, name) => `Cargando «${name}»…`],
    [/^Added “(.+)” to your dictionary\.$/, (_, name) => `Se añadió «${name}» a tu diccionario.`],
    [/^This will delete all (\d+) cards saved in this browser\.$/, (_, n) => `Se eliminarán las ${n} tarjetas guardadas en este navegador.`],
    [/^Replace your current dictionary of (\d+) cards with (\d+) imported cards\?$/, (_, current, imported) => `¿Reemplazar tu diccionario actual de ${current} tarjetas por ${imported} tarjetas importadas?`],
    [/^The dictionary file at (.+) returned HTTP (\d+)\.$/, (_, path, status) => `El archivo de diccionario en ${path} devolvió el estado HTTP ${status}.`],
    [/^Could not load (.+)\. Check the connection and try again\.$/, (_, path) => `No se pudo cargar ${path}. Comprueba la conexión e inténtalo de nuevo.`],
    [/^Session progress, card (\d+) of (\d+)\. Click a shown dot to review it\. The marker shows the current card\.$/, (_, shown, total) => `Progreso de la sesión, tarjeta ${shown} de ${total}. Pulsa un punto visible para repasarlo. El indicador muestra la tarjeta actual.`],
    [/^Current card (\d+) of (\d+), answer revealed$/, (_, shown, total) => `Tarjeta actual ${shown} de ${total}, respuesta revelada`],
    [/^Current card (\d+) of (\d+), guess this card$/, (_, shown, total) => `Tarjeta actual ${shown} de ${total}, intenta adivinar esta tarjeta`],
    [/^Review card (\d+) of (\d+)$/, (_, shown, total) => `Repasar tarjeta ${shown} de ${total}`],
    [/^(.+) · Imported (\d+) (card|cards)\.$/, (_, prefix, count) => `${prefix} · Importadas ${count} ${count === "1" ? "tarjeta" : "tarjetas"}.`],
    [/^(.+) Your current dictionary is unchanged; try again\.$/, (_, message) => `${translateText(message)} Tu diccionario actual no ha cambiado. Inténtalo de nuevo.`]
  ];

  const attributeTranslations = new Map(Object.entries({
    "Browse default dictionaries": "Explorar diccionarios predeterminados",
    "Dictionary tools": "Herramientas del diccionario",
    "Cards per practice session": "Tarjetas por sesión de práctica",
    "Practice": "Práctica",
    "Choose language": "Elegir idioma",
    "Session progress, card ": "Progreso de la sesión, tarjeta ",
    "Click a shown dot to review that card.": "Pulsa un punto visible para repasar esa tarjeta.",
    "Remove this word": "Eliminar esta palabra",
    "Add a dictionary entry": "Añadir una entrada al diccionario",
    "Japanese (romaji)": "Japonés (romaji)",
    "New Japanese word in romaji": "Nueva palabra japonesa en romaji",
    "Hiragana": "Hiragana",
    "New word in hiragana": "Nueva palabra en hiragana",
    "English meaning": "Significado en inglés",
    "New English meaning": "Nuevo significado en inglés",
    "Example in romaji": "Ejemplo en romaji",
    "Example in hiragana": "Ejemplo en hiragana",
    "Example translation": "Traducción del ejemplo"
  }));

  function translateText(value) {
    const trimmed = value.trim();
    if (!trimmed) return value;
    let translated = translations.get(trimmed);
    if (translated === undefined) {
      const match = exactPatterns.find(([pattern]) => pattern.test(trimmed));
      if (match) translated = trimmed.replace(match[0], match[1]);
    }
    if (translated === undefined) return value;
    const leading = value.match(/^\s*/)?.[0] || "";
    const trailing = value.match(/\s*$/)?.[0] || "";
    return `${leading}${translated}${trailing}`;
  }

  function translateTree(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const translated = translateText(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    });
    if (root.nodeType === Node.ELEMENT_NODE) {
      ["aria-label", "title", "placeholder"].forEach((attribute) => {
        if (!root.hasAttribute(attribute)) return;
        const value = root.getAttribute(attribute);
        const translated = attributeTranslations.get(value) || translateText(value);
        if (translated !== value) root.setAttribute(attribute, translated);
      });
      root.querySelectorAll("[aria-label], [title], [placeholder]").forEach((element) => {
        ["aria-label", "title", "placeholder"].forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          const value = element.getAttribute(attribute);
          const translated = attributeTranslations.get(value) || translateText(value);
          if (translated !== value) element.setAttribute(attribute, translated);
        });
      });
    }
  }

  function applySpanish() {
    document.documentElement.lang = "es";
    document.title = "Japanese Cards — Aprende japonés";
    translateTree(document.body);
    window.alert = (message) => nativeAlert(translateText(String(message)));
    window.confirm = (message) => nativeConfirm(translateText(String(message)));
    window.prompt = (message, value) => nativePrompt(translateText(String(message)), value);
    translationObserver?.disconnect();
    translationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) node.nodeValue = translateText(node.nodeValue);
          else if (node.nodeType === Node.ELEMENT_NODE) translateTree(node);
        });
        else if (mutation.type === "attributes") translateTree(mutation.target);
      });
    });
    translationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "title", "placeholder"] });
  }

  function startSelection(language) {
    if (transitionInProgress) return;
    const currentLanguage = sessionStorage.getItem("japanese-cards.current-language");
    if (currentLanguage && currentLanguage !== language) {
      sessionStorage.setItem("japanese-cards.pending-language", language);
      window.location.reload();
      return;
    }
    transitionInProgress = true;
    sessionStorage.setItem("japanese-cards.current-language", language);
    if (language === "es") applySpanish();
    else document.documentElement.lang = "en";
    languageOptions.hidden = true;
    loading.hidden = false;
    loadingLabel.textContent = language === "es" ? "Preparando todo" : "Getting things ready";
    loadingFootnote.textContent = language === "es" ? "Preparando tu espacio de estudio" : "Preparing your study space";
    const start = performance.now();
    const duration = 2000;
    const stages = [
      [0, 0], [220, 12], [450, 29], [720, 30], [1000, 52],
      [1190, 58], [1500, 82], [1730, 83], [2000, 100]
    ];
    const tick = (now) => {
      const elapsed = Math.min(duration, now - start);
      const stageIndex = stages.findIndex(([time]) => time >= elapsed);
      const nextStage = stages[Math.max(1, stageIndex)];
      const previousStage = stages[Math.max(0, stageIndex - 1)];
      const fraction = nextStage[0] === previousStage[0] ? 1 : (elapsed - previousStage[0]) / (nextStage[0] - previousStage[0]);
      const eased = fraction * fraction * (3 - 2 * fraction);
      const percent = Math.round(previousStage[1] + (nextStage[1] - previousStage[1]) * eased);
      loadingFill.style.width = `${percent}%`;
      loadingPercent.textContent = `${percent}%`;
      loadingTrack.setAttribute("aria-valuenow", String(percent));
      if (elapsed < duration) requestAnimationFrame(tick);
      else window.setTimeout(() => {
        gate.classList.add("is-leaving");
        window.setTimeout(() => {
          gate.hidden = true;
          app.hidden = false;
          app.classList.add("is-entering-app");
          window.setTimeout(() => app.classList.remove("is-entering-app"), 500);
          transitionInProgress = false;
        }, 280);
      }, 80);
    };
    requestAnimationFrame(tick);
  }

  document.querySelectorAll("[data-language]").forEach((button) => button.addEventListener("click", () => startSelection(button.dataset.language)));
  document.querySelector("#language-back-button").addEventListener("click", () => {
    if (transitionInProgress) return;
    transitionInProgress = true;
    gate.hidden = false;
    gate.classList.remove("is-leaving");
    gate.classList.add("is-returning");
    app.classList.add("is-leaving-app");
    window.setTimeout(() => {
      app.hidden = true;
      app.classList.remove("is-leaving-app");
      gate.classList.remove("is-returning");
      languageOptions.hidden = false;
      loading.hidden = true;
      loadingFill.style.width = "0%";
      loadingPercent.textContent = "0%";
      loadingTrack.setAttribute("aria-valuenow", "0");
      transitionInProgress = false;
    }, 240);
  });

  const pendingLanguage = sessionStorage.getItem("japanese-cards.pending-language");
  if (pendingLanguage === "en" || pendingLanguage === "es") {
    sessionStorage.removeItem("japanese-cards.pending-language");
    sessionStorage.setItem("japanese-cards.current-language", pendingLanguage);
    startSelection(pendingLanguage);
  }
})();
