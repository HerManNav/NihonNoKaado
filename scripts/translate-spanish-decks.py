"""Create resumable Spanish translation candidates from the largest English deck.

Uses local OPUS-MT-tc-big-en-es. Japanese forms and grammar templates never
pass through the translation model. Editorial corrections live in a JSON file.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ["TEMP"]) / "japan-cards-strong-translation"
sys.path.insert(0, str(WORK))

DATA = ROOT / "decks" / "source-data"
CACHE = DATA / "spanish-translation-candidates.json"
source = json.loads((ROOT / "decks/english/most-common-2000.json").read_text(encoding="utf8"))

GRAMMAR = {
    "conditional たら": "condicional たら",
    "-te form": "forma en -te", "negative -te form": "forma negativa en -te",
    "passive -te form": "forma pasiva en -te", "causative -te form": "forma causativa en -te",
    "present polite": "presente formal", "polite past": "pasado formal",
    "past": "pasado", "negative": "forma negativa", "past passive": "pasado pasivo",
    "polite past passive": "pasado pasivo formal", "polite negative passive": "forma negativa pasiva formal",
    "negative passive": "forma negativa pasiva", "passive past": "pasado pasivo",
    "negative past": "pasado negativo", "past negative potential": "pasado negativo potencial",
    "negative adverbial form": "forma adverbial negativa", "negative conditional": "condicional negativo",
    "negative progressive": "forma progresiva negativa", "progressive": "forma progresiva",
    "past progressive": "pasado progresivo", "colloquial past progressive": "pasado progresivo coloquial",
    "passive continuing form": "forma pasiva continuada", "passive progressive": "forma pasiva progresiva",
    "continuing form": "forma continuada", "continuing state": "estado continuado",
    "resulting state": "estado resultante", "desiderative": "forma desiderativa",
    "potential": "forma potencial", "passive": "forma pasiva", "volitional": "forma volitiva",
    "volitional polite": "forma volitiva formal", "imperative": "imperativo",
    "polite": "forma formal", "polite form": "forma formal", "dictionary form": "forma de diccionario",
    "stem": "raíz", "adverbial": "forma adverbial", "adverbial form": "forma adverbial",
    "connective form": "forma de enlace", "attributive form": "forma atributiva",
    "honorific form": "forma honorífica", "honorific past": "pasado honorífico",
    "honorific polite past": "pasado formal honorífico", "request form": "forma de petición",
    "polite invitation form": "forma formal de invitación",
}
FIXED = {
    "compound verb:": "verbo compuesto:", "i-adjective": "adjetivo en -i",
    "na-adjective": "adjetivo en -na", "polite desu": "desu formal",
    "plain past copula": "cópula informal en pasado", "plain copula": "cópula informal",
    "polite copula": "cópula formal", "forming a predicate": "como predicado",
    "polite past continuing action or state": "acción o estado continuado en pasado formal",
    "past continuing action or state": "acción o estado continuado en pasado",
    "polite continuing action or state": "acción o estado continuado formal",
    "plain continuing action or state": "acción o estado continuado informal",
    "continuing action or state": "acción o estado continuado", "-te form": "forma en -te",
    "subject marker": "marcador de sujeto", "topic marker": "marcador de tema",
    "object marker": "marcador de objeto", "direct object marker": "marcador de objeto directo",
    "question marker": "marcador de pregunta", "possessive marker": "marcador de posesión",
    "location of existence marker": "marcador de lugar de existencia", "nominalizer": "nominalizador",
    "destination": "destino", "direction": "dirección", "time marker": "marcador de tiempo",
}
labels = "|".join(re.escape(s) for s in sorted(GRAMMAR, key=len, reverse=True))
fixed = "|".join(re.escape(s) for s in sorted(FIXED, key=len, reverse=True))
PATTERN = re.compile(r"(?P<label>" + labels + r") of (?P<lemma>[a-z]+(?: suru)?)(?![a-z])(?: \((?P<gloss>[^()]+)\))?|(?P<form>(?:[a-z]+|-te form)(?: \+ [a-z]+)+)|(?P<fixed>" + fixed + r")")

def save_json(path, value):
    for attempt in range(6):
        try:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
            return
        except OSError:
            if attempt == 5:
                raise
            time.sleep(0.25)

def parts(text, grammar=False):
    if not grammar:
        return [(False, text)]
    result, last = [], 0
    for match in PATTERN.finditer(text):
        if match.start() > last:
            result.append((False, text[last:match.start()]))
        if match.group("label"):
            value = GRAMMAR[match.group("label")] + " de " + match.group("lemma")
        elif match.group("form"):
            value = match.group("form")
        else:
            value = FIXED[match.group("fixed")]
        result.append((True, value.replace("-te form", "forma en -te")))
        if match.group("gloss"):
            gloss = match.group("gloss")
            result.extend([(True, " ("), (False, gloss if gloss.startswith("to ") else "to " + gloss), (True, ")")])
        last = match.end()
    result.append((False, text[last:]))
    # Keep punctuation out of the model: fragments such as 'okay (' must not
    # acquire a full stop or lose their opening parenthesis during translation.
    clean = []
    for protected, value in result:
        if protected or not re.search(r"[A-Za-z]", value):
            clean.append((True, value))
            continue
        for fragment in re.split(r"([():,;]|[ぁ-ヿ一-龯]+)", value):
            if not re.search(r"[A-Za-z]", fragment):
                clean.append((True, fragment))
                continue
            match = re.match(r"^([^A-Za-z]*)(.*?)([^A-Za-z]*)$", fragment, re.S)
            clean.extend([(True, match[1]), (False, match[2]), (True, match[3])])
    return clean

def segments():
    for card in source["cards"]:
        yield card["english"], False
        for example in card["examples"]:
            yield example["english"], False
            for word in example["wordMeanings"]:
                yield word["meaning"].split(" Base compound: ")[0], True

cache = json.loads(CACHE.read_text(encoding="utf8")) if CACHE.exists() else {}
needed = set()
for text, grammar in segments():
    for protected, value in parts(text, grammar):
        value = value.strip()
        if not protected and re.search(r"[A-Za-z]", value) and value not in cache:
            needed.add(value)
needed = sorted(needed, key=lambda s: (len(s), s))
print(f"{len(needed)} uncached segments", flush=True)
if needed:
    if "--cached-only" in sys.argv:
        raise RuntimeError("Missing cached translations; run with the offline model first.")
    import ctranslate2
    from transformers import MarianTokenizer
    tokenizer = MarianTokenizer.from_pretrained(str(WORK / "source-model"), local_files_only=True)
    translator = ctranslate2.Translator(str(WORK / "ct2-model"), device="cpu", compute_type="int8", intra_threads=4, inter_threads=1)
start = time.time()
for offset in range(0, len(needed), 32):
    batch = needed[offset:offset+32]
    encoded = [tokenizer.convert_ids_to_tokens(tokenizer.encode(s)) for s in batch]
    results = translator.translate_batch(encoded, beam_size=4, return_scores=True, max_decoding_length=256)
    for text, result in zip(batch, results):
        translation = tokenizer.decode(tokenizer.convert_tokens_to_ids(result.hypotheses[0]), skip_special_tokens=True)
        if text.startswith("to ") and translation.lower().startswith("para "):
            translation = translation[5:]
        cache[text] = {"translation": translation, "score": result.scores[0]}
    save_json(CACHE, cache)
    print(f"{min(offset+32,len(needed))}/{len(needed)} segments in {time.time()-start:.1f}s", flush=True)

overrides = json.loads((ROOT / "scripts/spanish-translation-overrides.json").read_text(encoding="utf8"))

def translate(text, grammar=False):
    if grammar:
        # The shared builder adds the reviewed Spanish component explanation.
        text = text.split(" Base compound: ")[0]
    if text in overrides:
        return overrides[text]
    output = ""
    for protected, value in parts(text, grammar):
        stripped = value.strip()
        if protected or not re.search(r"[A-Za-z]", value):
            output += value
        else:
            output += value[:len(value)-len(value.lstrip())] + overrides.get(stripped, cache[stripped]["translation"]) + value[len(value.rstrip()):]
    return output

draft = json.loads(json.dumps(source))
for card in draft["cards"]:
    card["english"] = translate(card["english"])
    for example in card["examples"]:
        example["english"] = translate(example["english"])
        for word in example["wordMeanings"]:
            word["meaning"] = translate(word["meaning"], True)
save_json(DATA / "spanish-deck-draft.json", draft)
print("Saved draft for editorial review.", flush=True)
