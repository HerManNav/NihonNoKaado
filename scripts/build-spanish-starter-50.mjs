// Hand-translated Spanish version of the first starter deck. The app's import
// format calls the meaning field "english" even when it contains another language.
import { readFileSync, writeFileSync } from "node:fs";

const translations = [
  ["nominalizador", "Quiero el rojo.", ["rojo", "nominalizador", "marcador de objeto", "querer (algo)"]],
  ["marcador de destino o dirección", "Voy a la escuela.", ["escuela", "destino", "ir"]],
  ["marcador de sujeto", "Está lloviendo.", ["lluvia", "marcador de sujeto", "forma en -te de furu (caer lluvia); acción o estado continuado (futte + iru)", "forma en -te de furu (caer lluvia); acción o estado continuado (futte + iru)"]],
  ["en (lugar donde ocurre una acción)", "Estudio en la biblioteca.", ["biblioteca", "en", "presente formal de benkyousuru (estudiar); verbo compuesto benkyou + shimasu"]],
  ["y (entre sustantivos)", "¿Qué prefieres, café o té?", ["café", "y", "té negro", "cuál", "marcador de sujeto", "bueno (adjetivo en -i + desu formal)", "bueno (adjetivo en -i + desu formal)", "marcador de pregunta"]],
  ["también", "Yo también iré.", ["yo", "también", "ir"]],
  ["hacer, realizar", "¿Qué harás?", ["qué", "marcador de objeto directo", "hacer"]],
  ["existir, estar (seres vivos)", "Hay muchos pájaros en el parque.", ["parque", "marcador de lugar de existencia", "pájaro", "marcador de sujeto", "muchos", "presente formal de iru (existir)"]],
  ["forma atributiva de la cópula", "Una habitación tranquila.", ["tranquilo", "forma atributiva de la cópula", "habitación"]],
  ["desde (punto de partida)", "Está a diez minutos a pie de la estación.", ["estación", "desde", "forma en -te de aruku (caminar)", "diez minutos", "es"]],
  ["día", "Es un día agradable, ¿verdad?", ["agradable", "día", "es", "busca confirmación"]],
  ["cosa, asunto (abstracto)", "Olvidé algo importante.", ["importante", "cosa", "marcador de objeto directo", "pasado formal de wasureru (olvidar)"]],
  ["y, entre otras cosas", "Cuando hace calor, el agua, el té y otras bebidas saben bien.", ["calor", "cuando", "marcador de tema", "agua", "entre otras cosas", "té", "marcador de sujeto", "sabroso"]],
  ["inexistente; no hay", "No hay agua.", ["agua", "marcador de sujeto", "no hay"]],
  ["persona, ser humano", "Hay una persona.", ["persona", "marcador de sujeto", "existir"]],
  ["año", "Este año estoy ocupado.", ["este año", "marcador de tema", "ocupado"]],
  ["existir, haber (objetos inanimados)", "Hay un libro.", ["libro", "marcador de sujeto", "existir"]],
  ["mercado, feria, bazar", "Compré verduras en el mercado matutino.", ["mercado matutino", "en", "verdura", "marcador de objeto directo", "pasado de kau (comprar)"]],
  ["persona, quien", "Solo se permite la entrada al personal autorizado.", ["relacionado (personas)", "persona", "solo", "entrada a una habitación", "permitido"]],
  ["marcador de pregunta", "¿Qué es esto?", ["esto", "marcador de tema", "qué", "es", "marcador de pregunta"]],
  ["blanco, objetivo, diana", "Dio en el blanco.", ["blanco", "marcador de objetivo", "pasado de ataru (dar en)"]],
  ["ser, estar (cópula informal)", "Soy estudiante.", ["yo", "marcador de tema", "estudiante", "soy"]],
  ["luna", "La luna es hermosa.", ["luna", "marcador de sujeto", "hermoso (adjetivo en -na + cópula informal, como predicado)", "hermoso (adjetivo en -na + cópula informal, como predicado)"]],
  ["apariencia, manera, modo", "Parece que va a llover.", ["lluvia", "marcador de sujeto", "caer", "apariencia", "es"]],
  ["mejor, preferible", "Aun así es mejor (que la alternativa).", ["todavía", "mejor (adjetivo en -na + cópula informal, como predicado)", "mejor (adjetivo en -na + cópula informal, como predicado)"]],
  ["hasta (límite temporal)", "Estuve despierto hasta las doce.", ["hora", "hasta", "pasado progresivo de okiru (estar despierto); okite + imashita, forma en -te + iru en pasado formal"]],
  ["llamado, conocido como", "Llamó una persona llamada Tanaka.", ["Tanaka", "llamado", "alguien", "de", "llamada telefónica", "marcador de sujeto", "pasado de aru (existir)"]],
  ["marcador de dirección o destino", "Ir a Tokio.", ["Tokio", "dirección", "ir"]],
  ["como, en calidad de", "Trabajar como profesor.", ["profesor", "como", "trabajar"]],
  ["prefectura", "Vivo en la prefectura de Chiba.", ["Chiba", "prefectura", "marcador de lugar de existencia", "forma progresiva formal de sumu (vivir); sunde + imasu, forma en -te + iru"]],
  ["reunión, encuentro, fiesta", "¿A qué hora empieza la reunión?", ["reunión", "marcador de tema", "a qué hora", "desde"]],
  ["este, esta (delante de un sustantivo)", "Este libro es interesante.", ["este", "libro", "marcador de tema", "interesante (adjetivo en -i + desu formal)", "interesante (adjetivo en -i + desu formal)"]],
  ["China, República Popular China", "He estado en China.", ["China", "destino", "pasado de iku (ir)", "nominalizador", "marcador de sujeto", "existir"]],
  ["volverse, llegar a ser", "Ha llegado la primavera.", ["primavera", "en (estado resultante)", "pasado de naru (llegar a ser)"]],
  ["para, por el bien de; con el fin de", "Lo hice para mi hijo.", ["niño", "marcador de posesión", "para", "con el fin de", "hecho (pasado de tsukuru)"]],
  ["ese, esa (delante de un sustantivo)", "Dame ese libro, por favor.", ["ese", "libro", "marcador de objeto directo", "por favor"]],
  ["querer (hacer algo)", "Quiero beber agua.", ["agua", "marcador de sujeto", "beber", "querer"]],
  ["tiempo, momento", "El tiempo pasa rápido, ¿verdad?", ["tiempo", "marcador de sujeto", "transcurrir", "nominalizador", "marcador de tema", "rápido (adjetivo en -i + desu formal)", "rápido (adjetivo en -i + desu formal)", "busca confirmación"]],
  ["delante, parte delantera", "Mira hacia delante.", ["delante", "marcador de objeto directo", "forma en -te de miru (mirar)"]],
  ["aproximadamente, alrededor de", "Participaron unas diez personas.", ["aproximadamente", "contador de personas", "marcador de sujeto", "pasado de sankasuru (participar); verbo compuesto sanka + shita"]],
  ["yen (moneda japonesa)", "Esto cuesta cien yenes.", ["esto", "marcador de tema", "cien", "yen", "es"]],
  ["pueblo, ciudad", "Este pueblo es tranquilo.", ["este", "pueblo", "marcador de tema", "tranquilo (adjetivo en -na + cópula formal, como predicado)", "tranquilo (adjetivo en -na + cópula formal, como predicado)"]],
  ["diez", "Llegaré en diez minutos.", ["minutos", "en", "presente formal de tsuku (llegar)"]],
  ["después, más tarde", "Después de almorzar, dormí una pequeña siesta.", ["almuerzo", "marcador de posesión", "después", "un poco", "siesta", "marcador de objeto directo", "pasado de suru (hacer)"]],
  ["mundo, Tierra", "El mundo es vasto.", ["mundo", "marcador de tema", "amplio"]],
  ["poder, ser capaz de", "Sé hablar japonés.", ["idioma japonés", "marcador de objeto", "ser capaz de"]],
  ["-idad; naturaleza, cualidad", "La relevancia es alta.", ["relevancia", "marcador de sujeto", "alto"]],
  ["torneo, competición", "El mes que viene participaré en un torneo de tenis.", ["el mes que viene", "tenis", "marcador de posesión", "torneo", "marcador de lugar de existencia", "participar"]],
  ["esto (cosa)", "¿Qué es esto?", ["esto", "marcador de tema", "qué", "es", "marcador de pregunta"]],
  ["¡ah!, ¡oh!, ¡uy!", "¡Ah, cuidado!", ["¡ah!", "peligroso"]],
];

const source = JSON.parse(readFileSync(new URL("../dictionaries/most-common-50.json", import.meta.url), "utf8"));
if (translations.length !== source.cards.length) throw new Error("Translation count does not match the source deck.");
source.name = "Japonés más frecuente — 50 palabras (español)";
source.source += " Spanish translations prepared for Japanese Cards.";
for (const [index, card] of source.cards.entries()) {
  const [meaning, sentence, words] = translations[index];
  const example = card.examples[0];
  if (words.length !== example.wordMeanings.length) throw new Error(`Annotation count mismatch for ${card.japanese}.`);
  card.english = meaning;
  example.english = sentence;
  example.wordMeanings.forEach((word, wordIndex) => { word.meaning = words[wordIndex]; });
}
writeFileSync(new URL("../dictionaries/most-common-50-es.json", import.meta.url), `${JSON.stringify(source, null, 2)}\n`);
