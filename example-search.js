(function exposeSearch(root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./word-form-lookup.js") : root.JapaneseWordFormLookup);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JapaneseExampleSearch = api;
})(globalThis, function createSearch(wordForms) {
  const {parseContinuousForm,describeContinuousForm,continuousForms} = wordForms;
  const tokens = value => String(value || "").match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];
  const text = value => String(value || "").normalize("NFKC").toLowerCase().replace(/’/g, "'").replace(/[\u200b\ufeff]/g, '').trim();
  const kanaRows = [
    ["あいうえお", ["a","i","u","e","o"]], ["かきくけこ", ["ka","ki","ku","ke","ko"]],
    ["がぎぐげご", ["ga","gi","gu","ge","go"]], ["さしすせそ", ["sa","shi","su","se","so"]],
    ["ざじずぜぞ", ["za","ji","zu","ze","zo"]], ["たちつてと", ["ta","chi","tsu","te","to"]],
    ["だぢづでど", ["da","ji","zu","de","do"]], ["なにぬねの", ["na","ni","nu","ne","no"]],
    ["はひふへほ", ["ha","hi","fu","he","ho"]], ["ばびぶべぼ", ["ba","bi","bu","be","bo"]],
    ["ぱぴぷぺぽ", ["pa","pi","pu","pe","po"]], ["まみむめも", ["ma","mi","mu","me","mo"]],
    ["やゆよ", ["ya","yu","yo"]], ["らりるれろ", ["ra","ri","ru","re","ro"]],
    ["わをんゔぁぃぅぇぉ", ["wa","wo","n","vu","a","i","u","e","o"]],
  ];
  const kana = Object.fromEntries(kanaRows.flatMap(([letters, syllables]) => [...letters].map((char, i) => [char, syllables[i]])));
  const pairs = {};
  for (const [char, stem] of Object.entries({き:"ky",ぎ:"gy",し:"sh",じ:"j",ち:"ch",に:"ny",ひ:"hy",び:"by",ぴ:"py",み:"my",り:"ry"})) {
    for (const [small, vowel] of [["ゃ","a"],["ゅ","u"],["ょ","o"]]) pairs[char + small] = stem + vowel;
  }
  Object.assign(pairs, {うぃ:"wi",うぇ:"we",うぉ:"wo",ふぁ:"fa",ふぃ:"fi",ふぇ:"fe",ふぉ:"fo",てぃ:"ti",でぃ:"di",とぅ:"tu",どぅ:"du"});
  function romanizeReading(value) {
    const normalized = text(value);
    if (!/[\u3040-\u30ff]/.test(normalized)) return normalized;
    const input = Array.from(normalized, char => {
      const code = char.codePointAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
    }).join("");
    let result = "";
    for (let i = 0; i < input.length; i++) {
      const char = input[i], pair = input.slice(i, i + 2);
      if (pairs[pair]) { result += pairs[pair]; i++; }
      else if (char === "っ") {
        const next = pairs[input.slice(i + 1, i + 3)] || kana[input[i + 1]] || "";
        result += next.startsWith("ch") ? "t" : next[0] || "";
      } else if (char === "ー") result += result.match(/[aeiou](?!.*[aeiou])/)?.[0] || "";
      else if (char === "ん" && /[あいうえおやゆよ]/.test(input[i + 1] || "")) result += "n'";
      else result += kana[char] || char;
    }
    return result;
  }
  function wordKey(value) {
    return romanizeReading(value).replace(/ā/g,"aa").replace(/ī/g,"ii").replace(/ū/g,"uu")
      .replace(/ē/g,"ee").replace(/ō/g,"oo").replace(/ou/g,"oo").replace(/ei/g,"ee")
      .replace(/sha/g,"sya").replace(/shu/g,"syu").replace(/sho/g,"syo").replace(/shi/g,"si")
      .replace(/cha/g,"tya").replace(/chu/g,"tyu").replace(/cho/g,"tyo").replace(/chi/g,"ti")
      .replace(/ja/g,"zya").replace(/ju/g,"zyu").replace(/jo/g,"zyo").replace(/ji/g,"zi")
      .replace(/tsu/g,"tu").replace(/fu/g,"hu").replace(/[\s\-·・]/g, "");
  }
  const wordKeys = value => {
    const key = wordKey(value);
    return !key ? [] : key.includes("'") ? [key, key.replace(/'/g, "")] : [key];
  };
  const sentenceKey = value => tokens(value).map(text).join(" ");
  const bracketClose = {'(':')','[':']','{':'}','【':'】'};
  const closingBrackets = new Set(Object.values(bracketClose));
  const protectedMeaningText = /\b(?:e\.g\.|i\.e\.|a\.m\.|p\.m\.|u\.s\.(?:a\.)?|etc\.|vs\.|mrs?\.|ms\.|dr\.|st\.|no\.|adj\.|adv\.|abbr\.|n\.|v\.|w\/o\b|w\/|n\/a\b|i\/o\b|more or less|sooner or later|give or take|whether or not|all or nothing|now or never)/g;
  const apostrophe = (input, i) => input[i] === "'" && /\p{L}/u.test(input[i - 1] || '') && /\p{L}/u.test(input[i + 1] || '');
  const pairedQuote = (input, i) => /["']/.test(input[i]) && !apostrophe(input, i) && input[i - 1] !== '\\'
    && input.indexOf(input[i], i + 1) !== -1;
  // Separators inside nested notes, quotations, abbreviations and numbers are
  // literal text. Even an unfinished note must not turn "bus" into a new sense.
  function meaningParts(value) {
    const input = text(value).replace(/[“”]/g, '"');
    const parts = [];
    const stack = [], protectedRanges = [...input.matchAll(protectedMeaningText)].map(match => [match.index, match.index + match[0].length]);
    let quote = '', part = '';
    const append = () => { if (meaningHead(part)) parts.push(part.trim()); part = ''; };
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (quote) {
        part += char;
        if (char === quote && !apostrophe(input, i) && input[i - 1] !== '\\') quote = '';
        continue;
      }
      if (pairedQuote(input, i)) { quote = char; part += char; continue; }
      if (bracketClose[char]) { stack.push(bracketClose[char]); part += char; continue; }
      if (closingBrackets.has(char)) { if (stack.at(-1) === char) stack.pop(); part += char; continue; }
      const protectedChar = protectedRanges.some(([start, end]) => i >= start && i < end);
      const numeric = /\d/.test(input[i - 1] || '') && /\d/.test(input[i + 1] || '');
      const numericComma = char === ',' && numeric && /^\d{3}(?:\D|$)/.test(input.slice(i + 1));
      const alternativeOr = input.slice(i, i + 2) === 'or' && /\s/.test(input[i - 1] || '') && /\s/.test(input[i + 2] || '');
      const separator = !stack.length && !protectedChar && (/[;|\n。]/.test(char)
        || char === '/' && !numeric || char === ',' && !numericComma || char === '.' && !numeric || alternativeOr);
      if (separator) { append(); if (alternativeOr) i++; }
      else part += char;
    }
    append();
    return [...new Set(parts)];
  }
  function meaningHead(value) {
    const input = text(value).replace(/[“”]/g, '"').replace(/^(['"])(.*)\1$/s, '$2');
    const stack = [];
    let head = '', quote = '';
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (quote) {
        if (!stack.length) head += char;
        if (char === quote && !apostrophe(input, i) && input[i - 1] !== '\\') quote = '';
      } else if (pairedQuote(input, i)) { quote = char; if (!stack.length) head += char; }
      else if (bracketClose[char]) { if (!stack.length) head += ' '; stack.push(bracketClose[char]); }
      else if (closingBrackets.has(char)) { if (stack.at(-1) === char) stack.pop(); }
      else if (!stack.length) head += char;
    }
    return head.replace(/^(['"])(.*)\1$/s, '$2').replace(/\bw\/o\s*/g, 'without ').replace(/\bw\/\s*/g, 'with ')
      .replace(/\b(don't|doesn't|didn't)\b/g, 'do not').replace(/\b(isn't|aren't|wasn't|weren't)\b/g, 'not')
      .replace(/\s+/g, ' ').trim();
  }
  const stop = new Set("a an the to of for in on as and or be is are it i my you your he she we they was were with at from something someone thing person used meaning marker".split(" "));
  const irregular = {ate:"eat",eaten:"eat",went:"go",gone:"go",came:"come",coming:"come",bought:"buy",brought:"bring",made:"make",making:"make",saw:"see",seen:"see",took:"take",taken:"take",taking:"take",gave:"give",given:"give",giving:"give",ran:"run",wrote:"write",written:"write",writing:"write",thought:"think",taught:"teach",caught:"catch",found:"find",said:"say",told:"tell",children:"child",people:"people",feet:"foot",teeth:"tooth",mice:"mouse"};
  function stem(word) {
    if (irregular[word]) word = irregular[word];
    if (word.length <= 3) return word;
    let result = word.replace(/ies$/, "y").replace(/(?:ing|ed)$/, "").replace(/(ch|sh|ss|x|z)es$/, "$1");
    if (result === word && !/(?:ss|us|is)$/.test(word)) result = result.replace(/s$/, "");
    if (/(?:ing|ed)$/.test(word)) result = result.replace(/([bdgmnprt])\1$/, "$1");
    return result.length > 3 ? result.replace(/e$/, "") : result;
  }
  const content = value => new Set((text(value).replace(/['’]s\b/g, "").match(/[\p{L}]+/gu) || []).filter(word => !stop.has(word)).map(stem));
  function overlap(a, b) {
    const left = content(a), right = content(b);
    if (!left.size || !right.size) return 0;
    return [...left].filter(word => right.has(word)).length / Math.max(left.size, right.size);
  }
  const phrase = value => text(value).replace(/^to\s+/, "").replace(/^(?:do|does|did)\s+(?=not\b)/, '')
    .replace(/["“”]/g, "").replace(/\s+/g, " ");
  function pairScore(query, gloss) {
    const queryBase = phrase(meaningHead(query)), glossBase = phrase(meaningHead(gloss));
    if (!queryBase || !glossBase) return 0;
    if (phrase(query) === phrase(gloss)) return 3;
    if (queryBase === glossBase) {
      // Notes are optional. When both sides explicitly qualify a homograph,
      // retain the existing protection against conflicting sense qualifiers.
      if (/[([{【]/.test(query) && /[([{【]/.test(gloss) && overlap(query, gloss) < 0.75) return 0;
      return 2.8;
    }
    if (/\b(?:not|without|never)\b/.test(queryBase) !== /\b(?:not|without|never)\b/.test(glossBase)) return 0;
    const score = overlap(queryBase, glossBase);
    return score >= 0.75 ? 1.5 + score : 0;
  }
  function senseScore(meaning, gloss) {
    if (text(meaning) === text(gloss) && meaningHead(meaning)) return 3.2;
    let best = 0;
    for (const query of meaningParts(meaning)) for (const sense of meaningParts(gloss)) best = Math.max(best, pairScore(query, sense));
    return best;
  }
  function naturalness(example) {
    const count = tokens(example.romaji).length;
    let score = count >= 3 && count <= 12 ? 1 : count <= 20 ? 0.5 : 0;
    score += Math.max(0, 1 - Math.abs(7 - count) / 12);
    if (/^[A-Z](?:.*)[.!?]$/.test(example.english) && !/^To\s/.test(example.english)) score += 0.7;
    if (/\b(?:someone|somebody|something|XXX)\b|\.{3}|…/i.test(example.english)) score -= 1;
    return score;
  }
  // A missing long vowel is a particularly common romaji typo. Bound the
  // distance calculation so unrelated dictionary keys are cheap to discard.
  function spellingDistance(left, right, limit = 2) {
    left = text(left); right = text(right);
    if (Math.abs(left.length - right.length) > Math.ceil(limit / 0.35)) return Infinity;
    const vowel = char => /[aeiou]/.test(char || '');
    const insertion = (word, i) => vowel(word[i]) ? word[i] === word[i - 1] || word[i] === word[i + 1] ? 0.35 : 0.7 : 1;
    let previousPrevious;
    let previous = [0];
    for (let j = 0; j < right.length; j++) previous.push(previous[j] + insertion(right, j));
    for (let i = 1; i <= left.length; i++) {
      const current = [previous[0] + insertion(left, i - 1)];
      for (let j = 1; j <= right.length; j++) {
        current[j] = Math.min(previous[j] + insertion(left, i - 1), current[j - 1] + insertion(right, j - 1),
          previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : vowel(left[i - 1]) && vowel(right[j - 1]) ? 0.7 : 1));
        if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
          current[j] = Math.min(current[j], previousPrevious[j - 2] + 0.75);
        }
      }
      // A transposition on the next row can still use the preceding row.
      if (Math.min(...current) > limit + 1) return Infinity;
      previousPrevious = previous; previous = current;
    }
    return previous[right.length] <= limit ? previous[right.length] : Infinity;
  }
  return {tokens, text, wordKey, wordKeys, romanizeReading, sentenceKey, meaningParts, meaningHead, overlap, senseScore, naturalness, spellingDistance,
    parseContinuousForm,describeContinuousForm,continuousForms};
});
