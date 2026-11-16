// Deterministic explanations and word boundaries shared by both deck builders.
export function applyLearnerGrammarTips(example, language, components) {
  const es = language === 'es';
  const words = example.wordMeanings;
  const spans = [...example.romaji.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
  const replacements = [];
  const output = [];
  const stems = Object.keys(components).filter(s=>!s.includes(' ')).sort((a,b)=>b.length-a.length);
  for (const [i, word] of words.entries()) {
    let parts = [word.romaji], meaning = word.meaning;
    if (word.romaji === 'datta') {
      meaning = es ? 'era, fue; eran, fueron (datta: pasado de la cópula da)' : 'was/were (datta: past form of the copula da)';
    }
    if (/^(?:otodoke|onegai)shimasu$/.test(word.romaji)) {
      const request = word.romaji.startsWith('onegai');
      parts = [request ? 'onegai' : 'otodoke', 'shimasu'];
      meaning = request
        ? es ? 'Petición formal: onegai (petición; o- formal + negai, de negau: desear/pedir) + shimasu (presente formal de suru: hacer).' : 'Polite request: onegai (request; polite o- + negai, from negau: wish/request) + shimasu (polite non-past of suru: do).'
        : es ? 'Entregar (forma humilde): otodoke (o- formal + todoke, raíz de todokeru: entregar) + shimasu (presente formal de suru: hacer).' : 'Deliver (humble form): otodoke (polite o- + todoke, stem of todokeru: deliver) + shimasu (polite non-past of suru: do).';
    } else {
      const stem = stems.find(s=>word.romaji.startsWith(s) && /^(?:suru|shita|shimasu|shimashita|shinai|shinakatta|shimasen|shimasendeshita|shite(?:iru|imasu|ita|imashita)?|sareta|sareru|sarete(?:iru|imasu)?)$/.test(word.romaji.slice(s.length)));
      if (stem && /(?:Base compound|Verbo base):/.test(meaning)) parts = [stem, word.romaji.slice(stem.length)];
    }
    const question = /^(.*(?:masu|mashita|masen))ka$/.exec(word.romaji);
    if (question) parts = [question[1], 'ka'];
    const polite = /^(.*?)(mashita|masen|masu)(?:ka)?$/.exec(word.romaji);
    if (polite && parts.length < 3 && !/shimasu|shimashita/.test(word.romaji)) {
      const lemma = word.entryId?.slice(6) || ({ikimashitaka:'iku',dekimasuka:'dekiru',yomimasuka:'yomu'})[word.romaji];
      if (lemma && lemma !== word.romaji) {
        const form = es ? ({mashita:'pasado formal',masen:'negativo formal',masu:'presente/futuro formal'})[polite[2]] : ({mashita:'polite past',masen:'polite negative',masu:'polite non-past'})[polite[2]];
        meaning += es ? ` Formación: ${lemma} → ${polite[1]}- (raíz) + -${polite[2]} (${form}).` : ` Formation: ${lemma} → ${polite[1]}- (stem) + -${polite[2]} (${form}).`;
      }
    }
    if (question) meaning += es ? ' ka: partícula interrogativa.' : ' ka: question particle.';
    if (parts.length>1) replacements.push([spans[i].index,spans[i][0].length,parts.join(' ')]);
    for (const romaji of parts) output.push({...word,romaji,meaning});
  }
  for (const [at,length,text] of replacements.reverse()) example.romaji=example.romaji.slice(0,at)+text+example.romaji.slice(at+length);
  example.wordMeanings=output;
  if (example.romaji === 'kochira koso, yoroshiku onegai shimasu.') {
    example.english = es ? 'El placer es mío. Encantado de conocerte también.' : 'The pleasure is mine. Nice to meet you too.';
    const first = es ? 'kochira koso: el placer es mío; igualmente. kochira: yo/mi parte; koso: énfasis recíproco.' : 'kochira koso: the pleasure is mine; likewise. kochira: me/my side; koso: reciprocal emphasis.';
    const greeting = es ? 'yoroshiku onegai shimasu: encantado de conocerte (saludo convencional). yoroshiku: bien/favorablemente; implica «trátame bien, por favor». onegai: petición (o- formal + negai, de negau: desear/pedir); shimasu: presente formal de suru (hacer).' : 'yoroshiku onegai shimasu: nice to meet you (conventional greeting). yoroshiku: well/favorably; implies "please treat me well". onegai: request (polite o- + negai, from negau: wish/request); shimasu: polite non-past of suru (do).';
    example.wordMeanings.forEach(w=>{w.meaning=['kochira','koso'].includes(w.romaji)?first:greeting;});
  }
}
