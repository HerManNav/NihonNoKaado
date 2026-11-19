(function exposeExamples(root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./example-search.js") : root.JapaneseExampleSearch);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JapaneseExampleSuggestions = api;
})(globalThis, function createExamples(search) {
  const {tokens, text, wordKey, wordKeys, sentenceKey, meaningParts, meaningHead, overlap, senseScore, naturalness, spellingDistance,
    romanizeReading, parseContinuousForm, describeContinuousForm, continuousForms} = search;
  const correctionKey = value => wordKey(romanizeReading(value).replace(/[\s-]+/g,''));
  const constructionMeaning = meaning => meaningParts(meaning).map(part =>
    part.replace(/^(?:please\s+|keep\s+(?:on\s+)?|continue\s+(?:to\s+)?)/i,'')).join(' / ');

  function createService({loadCorpus, loadPart, loadLookup, findWordMeanings, normalizeWordMeanings, maxCachedParts = 8}) {
    const cachedPartLimit = Number.isInteger(maxCachedParts) && maxCachedParts > 0 ? maxCachedParts : 8;
    let corpusPromise, legacyIndex, spellingKeys, constructionCorrections;
    const partPromises = new Map();
    const nearbyQueries = new Map(), alternativeQueries = new Map();
    function remember(cache, key, value) {
      cache.delete(key);
      cache.set(key, value);
      while (cache.size > 16) cache.delete(cache.keys().next().value);
      return value;
    }
    function indexRecords(records, aliases = {}) {
      const byWord = new Map();
      const normalized = new Map(), entries = new Map();
      function keysFor(value) {
        if (!normalized.has(value)) normalized.set(value, wordKeys(value));
        return normalized.get(value);
      }
      for (const row of records) {
        if (!row.aliases && aliases[row.entryId]) row.aliases = aliases[row.entryId];
        const prior = row.entryId && entries.get(row.entryId);
        let keys;
        if (prior && prior.japanese === row.japanese && prior.hiragana === row.hiragana && prior.aliases === row.aliases) keys = prior.keys;
        else {
          keys = [...new Set([row.japanese, row.hiragana, ...(row.aliases || [])].flatMap(keysFor))];
          if (row.entryId) entries.set(row.entryId, {japanese:row.japanese,hiragana:row.hiragana,aliases:row.aliases,keys});
        }
        for (const key of keys) {
          if (!byWord.has(key)) byWord.set(key, []);
          byWord.get(key).push(row);
        }
      }
      return {byWord, records};
    }
    async function corpus() {
      if (!corpusPromise) corpusPromise = Promise.resolve().then(loadCorpus).then(payload => {
        if (!(payload.format === 1 && Array.isArray(payload.records)) &&
          !(payload.format === 2 && Array.isArray(payload.parts) && payload.index && typeof loadPart === "function")) throw new Error("Invalid example dictionary.");
        if (payload.format === 1) legacyIndex = indexRecords(payload.records);
        return payload;
      }).catch(error => { corpusPromise = null; throw error; });
      return corpusPromise;
    }
    function partIndex(index, manifest) {
      let request = partPromises.get(index);
      if (!request) {
        const descriptor = manifest.parts[index];
        request = Promise.resolve().then(() => loadPart(descriptor)).then(payload => {
          if (payload.format !== 2 || !Array.isArray(payload.records) || payload.records.length !== descriptor.records) throw new Error("Invalid example part.");
          return indexRecords(payload.records, payload.aliases);
        }).catch(error => {
          if (partPromises.get(index) === request) partPromises.delete(index);
          throw error;
        });
      }
      // In-flight callers retain their promises when the bounded LRU evicts a part.
      partPromises.delete(index);
      partPromises.set(index, request);
      while (partPromises.size > cachedPartLimit) partPromises.delete(partPromises.keys().next().value);
      return request;
    }
    function continuousExample(example, form, base, start, count) {
      const wordMeanings = example.wordMeanings?.map((word,index) => index >= start && index < start + count
        ? {...word, meaning:describeContinuousForm(form,base.japanese,base.meaning)} : {...word});
      return {...example, ...(wordMeanings ? {wordMeanings} : {})};
    }
    async function recordsFor(context) {
      const manifest = await corpus();
      const form = parseContinuousForm(romanizeReading(context.japanese));
      const keys = [...new Set([context.japanese, context.hiragana].flatMap(wordKeys))];
      const routeKeys = [...new Set([...keys, ...(form ? wordKeys(form.teForm) : [])])];
      const refs = form ? manifest.constructions?.[wordKey(form.core)] || [] : [];
      let indexes;
      if (manifest.format === 2) {
        const parts = [...new Set([...routeKeys.flatMap(key => manifest.index[key] || []), ...refs.map(ref => ref[0])])];
        indexes = new Map(await Promise.all(parts.map(async index => [index,await partIndex(index,manifest)])));
      } else indexes = new Map([[0,legacyIndex]]);
      const rowsForKeys = wanted => [...new Set([...indexes.values()].flatMap(index => wanted.flatMap(key => index.byWord.get(key) || [])))];
      const rows = rowsForKeys(keys);
      if (!form) return rows;
      const continuing = new Set(rowsForKeys(wordKeys(form.teForm + 'iru')));
      const bases = rowsForKeys(wordKeys(form.teForm)).filter(row => continuing.has(row));
      // Adapt only a proven verb alias. Keep reading checks tied to the queried
      // form rather than trusting a caller-supplied kana reading.
      const adapt = (base,example,exactContinuous = false) => ({...base,japanese:context.japanese,hiragana:form.core + (form.request ? 'kudasai' : ''),
        aliases:[context.japanese,form.core + (form.request ? 'kudasai' : '')],example,continuous:true,exactContinuous});
      const results = [...rows];
      for (const [part,record,start,count] of refs) {
        const source = indexes?.get(part)?.records[record];
        const target = source?.example.wordMeanings?.[start];
        const base = bases.find(row => row.entryId === target?.entryId && row.senseNumber === target.senseNumber && row.language === source.language);
        if (base) results.push(adapt(base,continuousExample(source.example,form,base,start,count),true));
      }
      // If this exact construction has no bundled sentence, the dictionary can
      // still supply a sentence for its underlying verb and selected sense.
      for (const base of bases) results.push(adapt(base,base.example));
      return results;
    }
    async function rankSuggestions({japanese, hiragana, meaning, language = "en"}) {
      const candidates = await recordsFor({japanese, hiragana});
      const inputKeys = wordKeys(japanese);
      const reliableReading = !/[a-zāīūēō]/i.test(hiragana);
      const ranked = candidates.filter(row => row.language === language &&
        [row.japanese, ...(row.aliases || [])].some(alias => wordKeys(alias).some(key => inputKeys.includes(key))) &&
        (!reliableReading || [row.hiragana, ...(row.aliases || [])].some(reading => wordKey(reading) === wordKey(hiragana))))
        .map(row => {
          const selectedMeaning = row.continuous ? constructionMeaning(meaning) : meaning;
          const direct = senseScore(selectedMeaning, row.meaning);
          const synonyms = Math.max(0, ...(row.meaningAliases || []).map(gloss => senseScore(selectedMeaning, gloss))) * 0.94;
          const score = Math.max(direct, synonyms);
          const words = tokens(row.example.romaji);
          const surface = words.some((_, i) => [1,2,3,4,5].some(length =>
            wordKeys(words.slice(i, i + length).join('')).some(key => inputKeys.includes(key)))) ? 3 : 0;
          const translated = text(row.example.english);
          const literal = meaningParts(meaning).some(part => {
            const phrase = meaningHead(part).replace(/^to\s+/, '');
            return phrase && (` ${translated.replace(/[^\p{L}\s]/gu, ' ')} `).includes(` ${phrase} `);
          }) ? 1 : 0;
          return {row, score, quality: naturalness(row.example) + surface + literal + (row.exactContinuous ? 5 : 0)
            + (row.reviewed ? 0.8 : 0) + (row.quality || 0)};
        }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.quality - a.quality
          || a.row.example.romaji.localeCompare(b.row.example.romaji));
      return ranked;
    }
    async function suggest(context, excludedRomaji = []) {
      const ranked = await rankSuggestions(context);
      const excluded = new Set(excludedRomaji.map(sentenceKey));
      const best = ranked.find(item => !excluded.has(sentenceKey(item.row.example.romaji)));
      return best ? JSON.parse(JSON.stringify(best.row.example)) : null;
    }
    async function allSuggestions(context) {
      const ranked = await rankSuggestions(context);
      const seen = new Set();
      const examples = [];
      for (const item of ranked) {
        const key = sentenceKey(item.row.example.romaji);
        if (seen.has(key)) continue;
        seen.add(key);
        examples.push(JSON.parse(JSON.stringify(item.row.example)));
      }
      return examples;
    }
    async function alternatives(context = {}, limit = 5) {
      const {japanese, meaning, language = "en"} = context || {};
      const size = Math.max(0, Math.min(5, Number.isFinite(limit) ? Math.floor(limit) : 5));
      const query = correctionKey(japanese);
      if (!size || query.length < 3 || query.length > 40 || !meaningParts(meaning).length) return [];
      const key = JSON.stringify([text(japanese), text(meaning), language, size]);
      let request = alternativeQueries.get(key);
      if (!request) {
        request = computeAlternatives({japanese, meaning, language}, size).catch(error => {
          if (alternativeQueries.get(key) === request) alternativeQueries.delete(key);
          throw error;
        });
      }
      remember(alternativeQueries, key, request);
      return (await request).map(item => ({...item}));
    }
    async function computeAlternatives({japanese, meaning, language}, limit) {
      const query = correctionKey(japanese);
      const manifest = await corpus();
      spellingKeys ||= manifest.format === 2 ? Object.keys(manifest.index) : [...legacyIndex.byWord.keys()];
      const maxDistance = query.length <= 4 ? 1 : query.length <= 8 ? 1.7 : 2.2;
      // A typo fallback must not download the entire corpus. Search the closest
      // spellings in at most six parts, reusing the normal parsed-part cache.
      let selected = nearbyQueries.get(query);
      if (!selected) {
        const nearby = [];
        for (const key of spellingKeys) {
          if (key === query || Math.abs(key.length - query.length) > 2) continue;
          const distance = spellingDistance(query, key, maxDistance);
          if (Number.isFinite(distance)) nearby.push({key, distance});
        }
        nearby.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
        const parts = new Set();
        selected = [];
        for (const candidate of nearby) {
          const required = manifest.format === 2 ? manifest.index[candidate.key] : [];
          const additional = required.filter(index => !parts.has(index));
          if (parts.size + additional.length > 6) continue;
          additional.forEach(index => parts.add(index));
          selected.push(candidate);
          if (selected.length === 18) break;
        }
      }
      remember(nearbyQueries, query, selected);
      const groups = await Promise.all(selected.map(candidate => recordsFor({japanese: candidate.key, hiragana: ""})));
      const ranked = new Map();
      if (!constructionCorrections) {
        const seen = new Set();
        constructionCorrections = [];
        for (const row of manifest.constructionSpellings || []) {
          const form = parseContinuousForm(row.japanese);
          if (!form) continue;
          // The metadata proves the verb and sense. Expand its auxiliary forms
          // in memory so one-letter typos in -iru, -imasu, -inai, etc. work too.
          for (const japanese of [...continuousForms(form.teForm),form.teForm + 'ite kudasai']) {
            const key = correctionKey(japanese);
            const identity = JSON.stringify([key,row.meaning,row.language,row.meaningAliases]);
            if (seen.has(identity)) continue;
            seen.add(identity);
            constructionCorrections.push({...row,japanese,key});
          }
        }
      }
      // These forms already have validated, sense-linked examples. Include
      // them directly: normalized index keys cannot reconstruct their spelling,
      // and unrelated nearby words must not use up their six-part IO budget.
      for (const row of constructionCorrections) {
        if (row.language !== language) continue;
        const key = row.key;
        if (key === query) continue;
        const distance = spellingDistance(query,key,maxDistance);
        if (!Number.isFinite(distance)) continue;
        const selectedMeaning = constructionMeaning(meaning);
        const semantic = Math.max(senseScore(selectedMeaning,row.meaning),
          ...((row.meaningAliases || []).map(gloss => senseScore(selectedMeaning,gloss) * 0.94)));
        if (!semantic) continue;
        const result = {japanese:row.japanese,hiragana:'',meaning:row.meaning};
        const score = semantic * 3 - distance * 2 + 0.2;
        if (!ranked.has(key) || ranked.get(key).score < score) ranked.set(key,{result,score});
      }
      for (const row of new Set(groups.flat())) {
        if (row.language !== language) continue;
        const semantic = Math.max(senseScore(meaning, row.meaning),
          ...((row.meaningAliases || []).map(gloss => senseScore(meaning, gloss) * 0.94)));
        if (!semantic) continue;
        const variants = [...new Set([row.japanese, ...(row.aliases || [])].filter(alias => /^[a-z' -]+$/i.test(alias))
          .flatMap(alias => [alias, alias.replace(/ou/g, "oo")]))];
        const spellings = variants.map(value => ({value, normalized: spellingDistance(query, correctionKey(value), maxDistance),
          display: spellingDistance(text(japanese), text(value), maxDistance + 0.5)}))
          .filter(item => correctionKey(item.value) !== query && Number.isFinite(item.normalized))
          .sort((a, b) => a.normalized - b.normalized || a.display - b.display || a.value.localeCompare(b.value));
        const best = spellings[0];
        if (!best) continue;
        const result = {japanese: best.value, hiragana: row.hiragana, meaning: row.meaning};
        // Source aliases include conjugations. Their kana reading is generated
        // by the form below when selected; base spellings keep the source kana.
        if (wordKey(best.value) !== wordKey(row.japanese)) result.hiragana = "";
        const score = semantic * 3 - best.normalized * 2 + naturalness(row.example) * 0.1;
        const key = correctionKey(best.value);
        if (!ranked.has(key) || ranked.get(key).score < score) ranked.set(key, {result, score});
      }
      return [...ranked.values()].sort((a, b) => b.score - a.score || a.result.japanese.localeCompare(b.result.japanese))
        .slice(0, Math.min(5, limit)).map(item => item.result);
    }
    async function analyze(example, context) {
      if (!tokens(example.romaji).length) return {...example};
      let candidates = [];
      try { candidates = await recordsFor(context); } catch { /* Custom entries still work if an example part is unavailable. */ }
      const known = candidates.find(row => sentenceKey(row.example.romaji) === sentenceKey(example.romaji)
        && text(row.example.english) === text(example.english)
        && wordKey(row.example.hiragana) === wordKey(example.hiragana));
      const reviewed = known && normalizeWordMeanings(known.example.wordMeanings, example.romaji);
      if (reviewed) return {...example, wordMeanings: reviewed};
      const lookup = await loadLookup();
      const words = tokens(example.romaji);
      const wordMeanings = words.map((romaji, index) => {
        const key = text(romaji), previous = index ? text(words[index - 1]) : "";
        let choices = lookup ? findWordMeanings(key, lookup, previous) : [];
        const continuous = parseContinuousForm(key,previous) || parseContinuousForm(words[index + 1],key);
        if (continuous && lookup) {
          const combined = findWordMeanings(continuous.core,lookup).filter(choice => /continuing form of/.test(choice));
          const ranked = combined.map((choice,order) => ({choice,order,
            score:overlap(choice.split(' — ')[1]?.split(' (')[0],context.meaning) * 2 + overlap(choice,example.english)}))
            .sort((a,b) => b.score - a.score || a.order - b.order);
          if (ranked.length) choices = ranked.map(item => item.choice);
        }
        // The card's supplied sense resolves the target word; the translation
        // ranks other lexical alternatives (including homographs) in the sentence.
        if (wordKey(key) === wordKey(context.japanese) && context.meaning) {
          const meanings = meaningParts(context.meaning).sort((a, b) => overlap(meaningHead(b), example.english) - overlap(meaningHead(a), example.english));
          const grammatical = continuous && choices.find(choice => /continuing form of/.test(choice)
            && overlap(choice.split(' — ')[1]?.split(' (')[0], meanings[0]) > 0);
          choices = [grammatical || meanings[0]];
        }
        else if (!continuous || !choices.some(choice => /continuing form of/.test(choice))) choices = choices.map((meaning, order) => ({meaning, order, score: overlap(meaning, example.english)}))
          .sort((a, b) => b.score - a.score || a.order - b.order).map(item => item.meaning);
        const particles = {
          wa: "topic marker", wo: "object marker", ka: "question particle",
          ga: "subject marker", no: "possessive / of", ni: "destination / time / location marker",
          de: "location / means marker", to: "and / with / quotation marker",
        };
        const particle = words.length > 1 && key !== wordKey(context.japanese) && particles[key];
        return {romaji, meaning: particle || choices[0] || "Meaning unavailable; check the spelling and word spacing."};
      });
      return {...example, wordMeanings};
    }
    return {suggest, allSuggestions, analyze, alternatives};
  }

  // One controller per meaning: a late result can never replace user input or
  // survive a change to the word, reading, meaning, or any example field.
  function createController({fields, getContext, suggest, allSuggestions, setStatus, setNavigationState = () => {}, isActive = () => true,
    findAlternatives, canOfferAlternatives = () => true, onAlternatives = () => {}}) {
    let revision = 0, pending = null, observedSignature, observedContext;
    let availableExamples = [], selectedIndex = -1, lookupComplete = false;
    const values = () => fields.map(field => field.value);
    const signature = () => JSON.stringify([getContext(), values()]);
    const ready = () => {
      const context = getContext();
      return Boolean(context.japanese.trim() && context.hiragana.trim() && context.meaning.trim());
    };
    function publishNavigationState() {
      const busy = Boolean(pending);
      setNavigationState({disabled: !ready() || busy || (lookupComplete && availableExamples.length === 0), busy,
        position: selectedIndex < 0 ? 0 : selectedIndex + 1, total: availableExamples.length});
    }
    function refresh() {
      const current = signature();
      const currentContext = JSON.stringify(getContext());
      if (observedContext !== currentContext) {
        observedContext = currentContext;
        availableExamples = [];
        selectedIndex = -1;
        lookupComplete = false;
      }
      const changed = observedSignature !== current;
      if (changed) {
        observedSignature = current;
        revision++;
        pending = null;
        onAlternatives([]);
        if (availableExamples.length) selectedIndex = currentExampleIndex();
      }
      const locked = !ready();
      fields.forEach(field => { field.disabled = locked; });
      if (changed) setStatus("", locked ? "locked" : "ready");
      publishNavigationState();
      return !locked;
    }
    function warn() {
      if (!ready()) setStatus("Fill in Japanese (romaji), hiragana, and the meaning above first.", "warning");
    }
    function applyExample(index) {
      const example = availableExamples[index];
      if (!example) return;
      selectedIndex = index;
      ["romaji", "hiragana", "english"].forEach((key, fieldIndex) => { fields[fieldIndex].value = example[key] || ""; });
      observedSignature = signature();
      fields[1].dataset.manuallyEdited = "false";
      setStatus("", "suggested");
      publishNavigationState();
    }
    function currentExampleIndex() {
      const currentRomaji = values()[0];
      if (!currentRomaji) return -1;
      return availableExamples.findIndex(example => sentenceKey(example.romaji) === sentenceKey(currentRomaji));
    }
    function navigationTarget(direction) {
      const total = availableExamples.length;
      if (!total) return -1;
      const current = currentExampleIndex();
      if (current < 0) return direction > 0 ? 0 : total - 1;
      return (current + direction + total) % total;
    }
    async function getAvailableExamples(context) {
      if (allSuggestions) return allSuggestions(context);
      const first = await suggest(context, []);
      return first ? [first] : [];
    }
    function runRequest(mode, direction) {
      const requestContext = {...getContext()};
      const before = signature(), version = revision;
      onAlternatives([]);
      setStatus("", "loading");
      const request = Promise.resolve().then(() => getAvailableExamples(requestContext)).then(async examples => {
        if (!isActive() || version !== revision || before !== signature()) return;
        availableExamples = examples;
        lookupComplete = true;
        if (mode === "inspect") {
          selectedIndex = currentExampleIndex();
          if (selectedIndex < 0 && values()[0].trim()) {
            const [romaji, hiragana, english] = values();
            availableExamples = [{romaji, hiragana, english}, ...availableExamples];
            selectedIndex = 0;
          }
          return;
        }
        if (!examples.length) {
          selectedIndex = -1;
          if (mode === "focus") {
            setStatus("No matching bundled example. You can enter your own.", "empty");
            if (findAlternatives && canOfferAlternatives()) {
              try {
                const alternatives = await findAlternatives(requestContext);
                if (isActive() && version === revision && before === signature() && canOfferAlternatives()) onAlternatives(alternatives);
              } catch { /* A spelling-search failure does not block manual entry. */ }
            }
          } else setStatus("No more matching examples.", "empty");
          return;
        }
        let target = 0;
        if (mode !== "focus") {
          const current = examples.findIndex(example => sentenceKey(example.romaji) === sentenceKey(values()[0] || ""));
          target = current >= 0 ? (current + direction + examples.length) % examples.length
            : direction > 0 ? 0 : examples.length - 1;
        }
        applyExample(target);
      }).catch(() => {
        if (isActive() && version === revision && before === signature()) {
          lookupComplete = false;
          setStatus("Examples could not be loaded. Enter your own, or focus here to retry.", "error");
        }
      }).finally(() => {
        if (pending === request) pending = null;
        publishNavigationState();
      });
      pending = request;
      publishNavigationState();
      return request;
    }
    function focus() {
      if (!ready()) { warn(); publishNavigationState(); return Promise.resolve(); }
      if (values().some(value => value.trim()) || pending) return pending || Promise.resolve();
      if (lookupComplete && availableExamples.length) {
        applyExample(selectedIndex >= 0 ? selectedIndex : 0);
        return Promise.resolve();
      }
      return runRequest("focus", 1);
    }
    function navigate(direction) {
      if (!ready()) { warn(); publishNavigationState(); return Promise.resolve(); }
      if (pending) return pending;
      if (lookupComplete) {
        if (!availableExamples.length) { publishNavigationState(); return Promise.resolve(); }
        applyExample(navigationTarget(direction));
        return Promise.resolve();
      }
      return runRequest(direction > 0 ? "next" : "previous", direction);
    }
    function inspect() {
      if (!ready() || !values().some(value => value.trim()) || lookupComplete) return pending || Promise.resolve();
      return pending || runRequest("inspect", 0);
    }
    return {refresh, warn, focus, inspect, next: () => navigate(1), previous: () => navigate(-1), wait: () => pending || Promise.resolve()};
  }
  return {createService, createController, senseScore};
});
