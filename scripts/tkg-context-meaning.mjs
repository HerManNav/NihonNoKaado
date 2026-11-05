// Contextual, single-sense annotations for the romaji shown on default cards.
// Source links identify the Japanese lexeme; the example's English and the
// linked entry's numbered definitions identify its sense. Ambiguous results
// are kept visible in `review` for editorial inspection.

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const FURIGANA = /\{[^{}|]+\|([^{}]+)\}/g;
const ENGLISH_STOP = new Set('a an and are as at be been being by can did do does for from had has have he her him his i in is it its me my of on or our she that the their them there they this to was were we will with you your'.split(' '));
const SENSE_STOPS = new Set('to a an the of in on at by with for from as is are be being used means mean indicates marks marker expression expresses something someone thing things person people another other form can also often usually certain indicates where when who what how action state'.split(' '));

function kanaOnly(value) {
  return Array.from(String(value ?? ''), char => {
    const code = char.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
  }).join('');
}

function cleanKana(value) {
  return kanaOnly(String(value ?? '').replace(FURIGANA, '$1'));
}

// This is intentionally the same transliteration as space-example-romaji.mjs,
// which generated the word spaces in the stored examples.
function kanaToRomaji(value) {
  const kana = kanaOnly(value);
  const syllables = {
    きゃ:'kya',きゅ:'kyu',きょ:'kyo',ぎゃ:'gya',ぎゅ:'gyu',ぎょ:'gyo',
    しゃ:'sha',しゅ:'shu',しょ:'sho',じゃ:'ja',じゅ:'ju',じょ:'jo',
    ちゃ:'cha',ちゅ:'chu',ちょ:'cho',にゃ:'nya',にゅ:'nyu',にょ:'nyo',
    ひゃ:'hya',ひゅ:'hyu',ひょ:'hyo',びゃ:'bya',びゅ:'byu',びょ:'byo',
    ぴゃ:'pya',ぴゅ:'pyu',ぴょ:'pyo',みゃ:'mya',みゅ:'myu',みょ:'myo',
    りゃ:'rya',りゅ:'ryu',りょ:'ryo',うぃ:'wi',うぇ:'we',うぉ:'wo',
    ふぁ:'fa',ふぃ:'fi',ふぇ:'fe',ふぉ:'fo',
  };
  const base = {
    あ:'a',い:'i',う:'u',え:'e',お:'o',か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',
    が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',
    ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',
    だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',
    は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
    ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',
    や:'ya',ゆ:'yu',よ:'yo',ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',わ:'wa',を:'wo',
    ん:'n',ゔ:'vu',ゐ:'wi',ゑ:'we',ゕ:'ka',ゖ:'ke',
  };
  const output = [];
  for (let i = 0; i < kana.length;) {
    const pair = kana.slice(i, i + 2), char = kana[i];
    if (char === 'っ') {
      const next = syllables[pair.slice(1)] || base[kana[i + 1]] || '';
      output.push(next.startsWith('ch') ? 't' : next[0] || ''); i++; continue;
    }
    if (char === 'ん') {
      output.push(/[あいうえおやゆよ]/.test(kana[i + 1] || '') ? "n'" : 'n'); i++; continue;
    }
    if (char === 'ー') {
      const previous = output.join('').match(/[aeiou](?!.*[aeiou])/);
      output.push(previous?.[0] || '-'); i++; continue;
    }
    if (syllables[pair]) { output.push(syllables[pair]); i += 2; continue; }
    if ('ぁぃぅぇぉ'.includes(char)) { output.push(({ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o'})[char]); i++; continue; }
    output.push(base[char] || char); i++;
  }
  return output.join('');
}

function letters(value) { return String(value ?? '').toLowerCase().replace(/[^a-z]/g, ''); }
function readingRomaji(entry) { return kanaToRomaji(entry?.reading || ''); }
function getEntry(entriesById, id) { return entriesById instanceof Map ? entriesById.get(id) : entriesById?.[id]; }
function getIndexRow(indexById, id) { return indexById instanceof Map ? indexById.get(id) : indexById?.[id]; }
function indexStub(row) {
  return row ? { id:row.id, reading:row.reading, gloss:row.gloss, indexOnly:true,
    part_of_speech:row.part_of_speech, definitions:[{sense_number:1,gloss:row.gloss}] } : undefined;
}
function entriesArray(entriesById) { return entriesById instanceof Map ? [...entriesById.values()] : Object.values(entriesById || {}); }
const readingIndexCache = new WeakMap();
const formIndexCache = new WeakMap();
function readingIndex(entriesById, indexById) {
  const key = indexById || entriesById;
  if (readingIndexCache.has(key)) return readingIndexCache.get(key);
  const result = new Map();
  const source = indexById instanceof Map ? indexById.values() : indexById ? Object.values(indexById) : entriesArray(entriesById);
  for (const row of source) {
    const romaji = letters(kanaToRomaji(row.reading));
    if (!romaji) continue;
    if (!result.has(romaji)) result.set(romaji, []);
    const entry = getEntry(entriesById, row.id) || indexStub(row);
    if (entry) result.get(romaji).push(entry);
  }
  readingIndexCache.set(key, result);
  return result;
}
function formIndex(entriesById) {
  if (formIndexCache.has(entriesById)) return formIndexCache.get(entriesById);
  const result = new Map();
  for (const entry of entriesArray(entriesById)) {
    for (const form of entry.conjugation?.forms || []) {
      for (const polarity of ['affirmative','negative']) {
        const surface = cleanKana(form[polarity]);
        const romaji = letters(kanaToRomaji(surface));
        if (!romaji) continue;
        if (!result.has(romaji)) result.set(romaji, []);
        result.get(romaji).push({ entry, surface, label: form.label, polarity });
      }
    }
  }
  formIndexCache.set(entriesById, result);
  return result;
}

function sourcePieces(japanese) {
  const pieces = [];
  for (const match of String(japanese ?? '').matchAll(/⟦(.*?)⟧|([^⟦]+)/gs)) {
    const inner = match[1];
    if (inner !== undefined) {
      const arrow = inner.indexOf('→');
      const colon = inner.lastIndexOf('：');
      const written = arrow < 0 ? inner : inner.slice(0, arrow);
      pieces.push({ surface: cleanKana(written), written, entryId: colon > arrow ? inner.slice(colon + 1).trim() : undefined });
    } else pieces.push({ surface: cleanKana(match[2]), written: match[2] });
  }
  let joined = '';
  for (const piece of pieces) {
    piece.start = letters(kanaToRomaji(joined)).length;
    joined += piece.surface;
    piece.end = letters(kanaToRomaji(joined)).length;
  }
  return { pieces, romanized: letters(kanaToRomaji(joined)) };
}

function visibleTokens(romaji) {
  let offset = 0;
  return [...String(romaji ?? '').matchAll(WORD)].map(match => {
    const token = { romaji: match[0], start: offset, end: offset + letters(match[0]).length };
    offset = token.end;
    return token;
  });
}

function definition(entry, number) {
  return entry?.definitions?.find(item => Number(item.sense_number) === Number(number));
}

function oneGloss(gloss, sentence = '') {
  // Split alternatives outside parentheses; keep only one contextual phrase.
  const parts = [];
  let depth = 0, current = '';
  for (const char of String(gloss ?? '')) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0,depth-1);
    if (depth === 0 && /[;,/]/.test(char)) { parts.push(current.trim()); current = ''; }
    else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  const words = englishWords(sentence);
  const ranked = parts.map((part,index) => ({part,index,score:senseScore({gloss:part},words)}))
    .sort((a,b)=>b.score-a.score || a.index-b.index);
  const selected = ranked[0]?.part || String(gloss ?? '');
  return selected.replace(/\s*\([^)]*\)\s*$/g,'').trim() || selected.replace(/^\((.*)\)$/,'$1').trim();
}

function englishWords(value) {
  return new Set((String(value ?? '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [])
    .map(word => word.replace(/'s$/, ''))
    .filter(word => word.length > 2 && !ENGLISH_STOP.has(word)));
}

function variants(word) {
  const out = [word];
  if (word.endsWith('ies')) out.push(`${word.slice(0,-3)}y`);
  if (word.endsWith('ed')) out.push(word.slice(0,-2), `${word.slice(0,-2)}e`);
  if (word.endsWith('ing')) out.push(word.slice(0,-3), `${word.slice(0,-3)}e`);
  if (word.endsWith('s')) out.push(word.slice(0,-1));
  if (word.endsWith('ily')) out.push(`${word.slice(0,-3)}y`);
  if (word.endsWith('ly')) out.push(word.slice(0,-2));
  return out;
}

function senseScore(def, sentence) {
  const words = englishWords(`${def.gloss || ''} ${def.explanation || ''}`);
  const head = englishWords(def.gloss || '');
  let score = 0;
  for (const word of sentence) {
    const forms = variants(word);
    if (forms.some(form => head.has(form))) score += 5;
    else if (forms.some(form => words.has(form)) && !SENSE_STOPS.has(word)) score += 1;
  }
  return score;
}

function findMatchingSense(entry, sourceExample) {
  const english = String(sourceExample?.english ?? '').trim();
  const surface = sourcePieces(sourceExample?.japanese).pieces.map(piece => piece.surface).join('').replace(/\s/g,'');
  const japaneseMatches = [];
  for (const example of entry?.examples || []) {
    if (sourcePieces(example.japanese).pieces.map(piece => piece.surface).join('').replace(/\s/g,'') !== surface) continue;
    if (example.sense_numbers?.length === 1) japaneseMatches.push(example);
    if (String(example.english ?? '').trim() === english && example.sense_numbers?.length === 1) {
      return Number(example.sense_numbers[0]);
    }
  }
  if (japaneseMatches.length && new Set(japaneseMatches.map(example => Number(example.sense_numbers[0]))).size === 1) {
    return Number(japaneseMatches[0].sense_numbers[0]);
  }
  return undefined;
}

function explicitGrammarSense(entry, token, tokens, index, sourceExample, sourcePiece) {
  const id = entry?.id;
  const previous = tokens[index-1]?.romaji.toLowerCase();
  const next = tokens[index+1]?.romaji.toLowerCase();
  const sentence = tokens.map(item => item.romaji.toLowerCase()).join(' ');
  const english = String(sourceExample?.english ?? '').toLowerCase();
  const following = tokens.slice(index + 1).map(item => item.romaji.toLowerCase()).join(' ');
  if (id === '01107_hoshii') return /(?:te|de)$/.test(previous || '') ? 2 : 1;
  if (id === '00118_ii') return /\b(may|can i|is it okay|all right|allowed)\b/.test(english) ? 2 : 1;
  if (id === '00514_hayai') {
    if (/速/.test(sourcePiece?.written || '')) return 1;
    if (/早/.test(sourcePiece?.written || '')) return 2;
    return /\b(fast|quick|quickly|speed)\b/.test(english) ? 1 : 2;
  }
  if (id === '00797_mondai') return /\b(question|test|exam|homework)\b/.test(english) ? 1 : 2;
  if (id === '00521_okiru' && /\b(up until|stay up|stayed up|was up)\b/.test(english)) return 'stay awake';
  if (id === '00521_okiru') return /\b(occur|occurred|happen|happened|arose|crisis|disaster|explosion|conflict|problem)\b/.test(english) ? 2 : 1;
  if (id === '00615_agaru') return /\b(price|profit|rate|level|grade|index|went up|rose|increased|improved)\b/.test(english) ? 1 : undefined;
  if (id === '00513_deru') {
    if (/\b(attend|participate|took part|competed)\b/.test(english)) return 3;
    if (/\b(appear|appeared|came out|come out|came up|result|tear|delay|occurred|produced)\b/.test(english)) return 2;
    if (/\b(leave|left|go out|went out|depart)\b/.test(english)) return 1;
  }
  if (id === '01164_koto') return /(?:ru|tta|ita|shita|masu|nai)$/.test(previous || '') ? 2 : 1;
  if (id === '02473_he') return 1;
  if (id === '06802_toshite') return /\b(regard|regarded|consider|considered|treat|treated)\b/.test(english) ? 2 : 1;
  if (id === '01172_keikaku') return /^su(?:ru|r|shi)/.test(next || '') ? 2 : 1;
  if (id === '01118_nai') return /\b(don.t have|doesn.t have|have no|has no|without)\b/.test(english) ? 2 : 1;
  if (id === '00500_takai') {
    if (/\b(expensive|pricey|costly|high price|high cost)\b/.test(english)) return 2;
    if (/\b(tall|height|mountain|building)\b/.test(english)) return 1;
    if (/\b(quality|degree|level|fever|temperature|rate|reputation)\b/.test(english)) return 3;
  }
  if (id === '00484_mo') {
    if (/\b(both|neither|nor)\b/.test(english) || tokens.filter(item => item.romaji.toLowerCase() === 'mo').length > 1) return 3;
    if (/\b(even)\b/.test(english)) return 2;
    if (/\b(as many as|as much as)\b/.test(english)) return 4;
    return 1;
  }
  if (id === '01970_naru') return /\b(result|ended up|turn out|turned out)\b/.test(english) ? 2 : 1;
  if (id === '01143_naru') return /\b(thunder|stomach|rumble|growl)\b/.test(english) ? 2 : 1;
  if (id === '09869_ji') return /\b(o'clock|am|pm|hour|time)\b/.test(english) || /\d/.test(sourceExample?.japanese || '') ? 1 : 2;
  if (id === '01519_yume') return /\b(aspiration|goal|ambition|hope|participate|become|future)\b/.test(english) ? 2 : /\b(sleep|slept|night|had a dream)\b/.test(english) ? 1 : undefined;
  if (id === '00422_wo') {
    if (/\b(cross|crossed|traverse|traversed|through|along|across)\b/.test(english)
      && /\b(wataru|watatta|aruku|aruita|hashiru|hashitta|susumu|susunda)\b/.test(following)) return 2;
    if (/\b(leave|left|depart|departed|graduate|graduated)\b/.test(english)
      && /\b(deru|deta|sotsugyousuru|sotsugyoushita|saru|satta)\b/.test(following)) return 3;
    return 1;
  }
  if (id === '02899_kudasai') return /(?:te|de)$/.test(previous || '') ? 2 : 1;
  if (id === '09473_ka') {
    if (index === tokens.length - 1) return 1;
    if (/\b(or)\b/.test(english)) return 2;
    if (/\b(whether|if)\b/.test(english)) return 3;
    return undefined;
  }
  if (id === '00119_iku') return /(?:te|de)$/.test(previous || '') ? 2 : 1;
  if (id === '00392_suru') {
    if (previous === 'ni') return 2;
    if (/\b(necktie|tie|watch|necklace|ring)\b/.test(english) && /\b(wear|wore|put on)\b/.test(english)) return 3;
    if (/\b(cost|costs|priced)\b/.test(english)) return 4;
    return 1;
  }
  if (id === '00006_aru') {
    // General existence is the ordinary interpretation. Possession, events,
    // and other uses remain available through exact source sense tags.
    if (/\b(have|has|had)\b/.test(english) && !/\b(there is|there are|there was|there were)\b/.test(english)) return 2;
    return 1;
  }
  if (id === '01292_kare' || id === '01286_kanojo') return 1;
  if (id === '00495_iru' && /(?:te|de)$/.test(previous || '')) return 'progressive';
  if (id === '00495_iru') return /\b(have|has|had)\b/.test(english) && !/\b(there is|there are|there was|there were)\b/.test(english) ? 3 : 1;
  if (id === '00254_kuru') return /(?:te|de)$/.test(previous || '') ? 2 : 1;
  if (id === '00051_ga') return /\b(hoshii|hoshikatta|suki|kirai|wakaru|wakar|dekiru|dekinai)\b/.test(sentence) ? 2 : 1;
  if (id === '09472_no') {
    if (next === 'desu' || next === 'da' || next === 'deshita' || next === 'datta') return 3;
    if (['ga','wo','ni','de','ha'].includes(next) && previous && !['watashi','boku','anata','kare','kanojo','dare'].includes(previous)) return 2;
    return 1;
  }
  if (id === '00079_ha') return 1;
  if (id === '00314_ni') {
    if (previous === 'ji' || previous === 'fun' || previous === 'pun'
      || /\b(o'clock|monday|tuesday|wednesday|thursday|friday|saturday|sunday|noon)\b/.test(english)) return 3;
    if (previous === 'issho') return 'together (with issho)';
    if (previous === 'tame') return 'for the purpose of';
    if (/^(naru|natta|narimasu|narimashita|naritai)$/.test(next || '')) return 'into (resulting state)';
    if (/\b(naru|natta|narimashita|shita|shimasu|suru|shite)\b/.test(following)
      && /\b(became|become|make|made|turn|turned|keep|kept)\b/.test(english)) return 'into (resulting state)';
    if (/\b(shuzai|benkyou|sanpo|kaimono|ryokou)\b/.test(previous || '')
      && /\b(iku|ikimasu|itta|kuru|kimashita|kita|kaeru|kaerimasu)\b/.test(following)) return 5;
    if (/\b(telephone|phone|call|ask|tell|give|gave|send|sent|show|told|asked)\b/.test(english)
      && /\b(denwa|kiku|kiite|ageru|ageta|okuru|okutta|miseta|iimashita)\b/.test(following)) return 4;
    if (/\b(elected|chosen|praised|scolded|invited|criticized)\b/.test(english)) return 6;
    if (/\b(iku|ikimasu|itta|kuru|kimashita|kita|kaeru|kaerimasu|modoru|hairu|hairimasu)\b/.test(following)) return 1;
    if (['iru','imasu','aru','arimasu','sundeiru','sundeimasu'].includes(next)) return 2;
    if (/\b(to|into|toward|towards)\b/.test(english)) return 1;
    if (/\b(at|in|on)\b/.test(english)) return 2;
    return undefined;
  }
  if (id === '00502_de') {
    if (/\b(by|using|with)\b/.test(english)) return 2;
    if (/\b(at|in)\b/.test(english)) return 1;
    return undefined;
  }
  if (id === '00504_kara') {
    if (/(?:te|de)$/.test(previous || '')) return 3;
    if (/\b(because|since|so)\b/.test(english)) return 2;
    if (/\b(made from|made of)\b/.test(english)) return 4;
    return 1;
  }
  if (id === '00512_to') {
    if (/\b(iu|iimashita|itta|omou|omotta|kangaeru|kotaeta|kotaeru|kaitearu|yobu|yonda)\b/.test(following)) return 3;
    if (/\b(onaji|chigau|chigaimasu|nita|niteiru|douyou)\b/.test(following)) return 5;
    if (/\b(if|when|whenever)\b/.test(english) && /\b(naru|naruto|koeru|kiku|toranai|furu)\b/.test(previous || '')) return 4;
    if (/\b(with|together)\b/.test(english)) return 2;
    if (/\b(if|when|whenever)\b/.test(english)) return 4;
    if (/\b(as|same as|different from)\b/.test(english)) return 5;
    return 1;
  }
  if (id === '00490_made') {
    if (/\b(even)\b/.test(english)) return 3;
    if (/\b(until|by)\b/.test(english)) return 1;
    if (/\b(as far as|to the|up to)\b/.test(english)) return 2;
    return undefined;
  }
  if (id === '09474_ne') return /\?|isn.t it|right\?|don.t you|didn.t/.test(english) ? 1 : 2;
  return undefined;
}

function selectSense(entry, { card, sourceEntry, sourceExample, token, tokens, index, sourcePiece }) {
  const definitions = entry?.definitions || [];
  if (!definitions.length) return { gloss: oneGloss(entry?.gloss), confident: false, reason: 'missing definitions' };
  if (entry?.id === sourceEntry?.id) {
    const numbers = (sourceExample?.sense_numbers || []).map(Number);
    if (numbers.length === 1 && definition(entry, numbers[0])) return { def: definition(entry, numbers[0]), confident: true, evidence: 'source sense' };
    if (numbers.length > 1) {
      const allowed = definitions.filter(def => numbers.includes(Number(def.sense_number)));
      const sentence = englishWords(sourceExample?.english);
      const ranked = allowed.map(def => ({def, score:senseScore(def,sentence)})).sort((a,b) => b.score-a.score);
      if (ranked.length && ranked[0].score >= 5 && ranked[0].score > (ranked[1]?.score || 0) + 1) {
        return {def:ranked[0].def,confident:true,evidence:'sentence among source senses'};
      }
      const cardGloss = String(card?.english || '').trim();
      const cardMatch = allowed.find(def => def.gloss?.trim() === cardGloss);
      if (cardMatch) return {def:cardMatch,confident:true,evidence:'card sense among source senses'};
      const cardWords = englishWords(cardGloss);
      const byCard = allowed.map(def => ({def,score:senseScore(def,cardWords)})).sort((a,b)=>b.score-a.score);
      if (byCard[0]?.score >= 5 && byCard[0].score > (byCard[1]?.score || 0)) {
        return {def:byCard[0].def,confident:true,evidence:'card gloss among source senses'};
      }
    }
  }
  const matching = findMatchingSense(entry, sourceExample);
  if (matching && definition(entry, matching)) return { def: definition(entry, matching), confident: true, evidence: 'matching source example' };
  const grammar = explicitGrammarSense(entry, token, tokens, index, sourceExample, sourcePiece);
  if (grammar === 'progressive') return { gloss: 'ongoing action (after -te form)', confident: true, evidence: 'auxiliary grammar' };
  if (typeof grammar === 'string') return { gloss: grammar, confident: true, evidence: 'grammar' };
  if (grammar && definition(entry, grammar)) return { def: definition(entry, grammar), confident: true, evidence: 'grammar' };
  if (definitions.length === 1) return { def: definitions[0], confident: true, evidence: 'only sense' };
  const sentence = englishWords(sourceExample?.english);
  const ranked = definitions.map(def => ({ def, score: senseScore(def, sentence) })).sort((a,b) => b.score - a.score);
  if (ranked[0].score >= 5 && ranked[0].score > ranked[1].score + 1) return { def: ranked[0].def, confident: true, evidence: 'English context' };
  return { def: ranked[0].def, confident: false, reason: 'sense ambiguous', scores: ranked.slice(0,3).map(item => [item.def.sense_number,item.score]) };
}

function grammaticalForm(entry, surface) {
  const clean = cleanKana(surface).replace(/[^\p{Script=Hiragana}]/gu, '');
  if (!clean || clean === cleanKana(entry?.reading)) return undefined;
  for (const form of entry?.conjugation?.forms || []) {
    for (const polarity of ['affirmative','negative']) {
      if (cleanKana(form[polarity]) === clean) return `${polarity === 'negative' ? 'negative ' : ''}${form.label.toLowerCase()}`;
    }
  }
  const polite = entry?.conjugation?.forms?.find(form => form.label === 'Present polite')?.affirmative;
  const stem = cleanKana(polite).replace(/ます$/, '');
  if (stem && stem !== cleanKana(polite)) {
    for (const [ending,label] of [
      ['たくなかった','past negative desiderative'],['たくない','negative desiderative'],
      ['たかった','past desiderative'],['たい','desiderative'],
    ]) {
      if (clean === `${stem}${ending}`) return label;
    }
  }
  return undefined;
}

function formatMeaning(entry, selection, surface, sentence) {
  let base = selection.gloss || oneGloss(selection.def?.gloss || entry.gloss, sentence);
  if (entry.id === '01107_hoshii' && selection.def?.sense_number === 1) base = 'want (something)';
  if (entry.id === '12563_toku' && selection.def?.sense_number === 2) base = 'good deal';
  const form = grammaticalForm(entry, surface);
  if (!form || form === 'present') return base;
  const lemma = readingRomaji(entry);
  const action = entry.id === '00839_furu' ? 'fall as rain'
    : entry.id === '00254_kuru' ? 'come'
    : entry.id === '00119_iku' ? 'go' : base.replace(/^to\s+/, '');
  const adjective = /adjective/.test(entry.part_of_speech || '');
  if (adjective) {
    if (form === 'past') return `was ${action} (past of ${lemma})`;
    if (form === 'negative past') return `was not ${action} (past negative of ${lemma})`;
    if (form === 'negative present') return `not ${action} (negative of ${lemma})`;
    return `${form} of ${lemma} (${action})`;
  }
  if (form === 'past') return `past of ${lemma} (${action})`;
  if (form === 'past polite') return `polite past of ${lemma} (${action})`;
  if (form === 'negative past' || form === 'negative past polite') return `negative past of ${lemma} (${action})`;
  if (form === 'て form') return `-te form of ${lemma} (${action})`;
  if (form === 'desiderative') return `want to ${action} (desiderative of ${lemma})`;
  if (form === 'negative desiderative') return `do not want to ${action} (negative desiderative of ${lemma})`;
  if (form === 'past desiderative') return `wanted to ${action} (past desiderative of ${lemma})`;
  if (form === 'past negative desiderative') return `did not want to ${action} (past negative desiderative of ${lemma})`;
  if (form.includes('ている')) {
    const negative = form.startsWith('negative');
    const past = form.includes('past');
    return `${negative ? 'negative ' : ''}${past ? 'past ' : ''}progressive of ${lemma} (${action})`;
  }
  if (form === 'negative present' || form === 'negative present polite') return `not ${action} (negative of ${lemma})`;
  return `${form} of ${lemma} (${action})`;
}

function candidatesForUnlinked(token, sourceEntry, entriesById, indexById) {
  const key = letters(token.romaji);
  const results = [];
  const seen = new Set();
  const add = entry => { if (entry && !seen.has(entry.id)) { seen.add(entry.id); results.push(entry); } };
  if (letters(readingRomaji(sourceEntry)) === key) add(sourceEntry);
  for (const entry of readingIndex(entriesById, indexById).get(key) || []) add(entry);
  if (!results.length) {
    const ownerForm = (formIndex(entriesById).get(key) || []).find(item => item.entry.id === sourceEntry?.id);
    if (ownerForm) add(ownerForm.entry);
    for (const form of formIndex(entriesById).get(key) || []) add(form.entry);
  }
  return results;
}

function jmdictCandidate(token, jmdict) {
  const key = letters(token.romaji);
  const heads = jmdict?.heads?.[key] || [];
  if (!heads.length) return undefined;
  return { romaji:key, meaning:heads[0][0], alternatives:heads.map(item => item[0]) };
}

/** Annotate every UI-visible romaji word of one default-deck example. */
export function annotateExample({ card, example, sourceEntry, sourceExample, entriesById, indexById, jmdict }) {
  const tokens = visibleTokens(example?.romaji);
  const { pieces, romanized } = sourcePieces(sourceExample?.japanese);
  const visible = tokens.map(token => letters(token.romaji)).join('');
  const review = [];
  if (romanized !== visible) review.push({ type: 'alignment', romaji: example?.romaji, source: sourceExample?.japanese, romanized, visible });
  const wordMeanings = tokens.map((token, index) => {
    const overlaps = pieces.filter(piece => piece.end > token.start && piece.start < token.end)
      .map(piece => ({piece, length: Math.min(piece.end, token.end) - Math.max(piece.start, token.start)}))
      .sort((a,b) => b.length - a.length);
    const linked = overlaps.find(item => item.piece.entryId)?.piece;
    const best = linked || overlaps[0]?.piece;
    let entry = getEntry(entriesById, best?.entryId) || indexStub(getIndexRow(indexById, best?.entryId));
    let surface = best?.surface || '';
    if (!entry && !best?.entryId && sourceEntry &&
      (letters(readingRomaji(sourceEntry)) === letters(token.romaji)
      || (sourceEntry.conjugation?.forms || []).some(form => [form.affirmative,form.negative].some(value => letters(kanaToRomaji(cleanKana(value))) === letters(token.romaji))))) {
      entry = sourceEntry;
    }
    if (!entry) {
      const candidates = candidatesForUnlinked(token, sourceEntry, entriesById, indexById);
      if (candidates.length === 1) entry = candidates[0];
      else if (candidates.length > 1) {
        const sentence = englishWords(sourceExample?.english);
        const scored = candidates.map(item => ({entry:item, score: Math.max(0,...(item.definitions || []).map(def => senseScore(def,sentence)))})).sort((a,b) => b.score - a.score);
        entry = scored[0].entry;
        if (scored[0].score < 5 || scored[0].score === scored[1].score) review.push({ type:'lexeme', index, romaji:token.romaji, candidateIds:scored.slice(0,5).map(item => item.entry.id) });
      }
    }
    const fallback = jmdictCandidate(token, jmdict);
    if (fallback && !best?.entryId && entry?.id !== sourceEntry?.id) {
      const sentence = englishWords(sourceExample?.english);
      const tkgScore = entry ? Math.max(0,...(entry.definitions || []).map(def => senseScore(def,sentence))) : 0;
      const ranked = fallback.alternatives.map(gloss => ({gloss, score:senseScore({gloss},sentence)}))
        .sort((a,b) => b.score - a.score);
      const jmdictScore = ranked[0].score;
      if (!entry || jmdictScore >= 5 && jmdictScore > tkgScore) {
        if (entry) review.push({ type:'lexeme', index, romaji:token.romaji, candidateIds:[entry.id], jmdictMeaning:fallback.meaning });
        return { romaji:token.romaji, meaning:ranked[0].gloss };
      }
    }
    if (!entry) {
      review.push({ type:'missing entry', index, romaji:token.romaji, sourcePiece:best?.surface, sourceId:best?.entryId });
      return { romaji:token.romaji, meaning:'Meaning needs review' };
    }
    const selection = selectSense(entry, { card, sourceEntry, sourceExample, token, tokens, index, sourcePiece:best });
    if (!selection.confident) review.push({ type:selection.reason || 'sense', index, romaji:token.romaji, entryId:entry.id, scores:selection.scores });
    if (best?.entryId && overlaps.some(item => item.piece.entryId && item.piece.entryId !== best.entryId)) review.push({ type:'multiple links', index, romaji:token.romaji });
    const item = { romaji:token.romaji, meaning:formatMeaning(entry, selection, surface, sourceExample?.english) };
    if (entry.id) item.entryId = entry.id;
    if (!entry.indexOnly && selection.def?.sense_number) item.senseNumber = Number(selection.def.sense_number);
    return item;
  });
  void card;
  return { wordMeanings, review };
}
