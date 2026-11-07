// Spanish translations for cards 51–100; the first 50 are shared with the
// existing reviewed starter deck. Fields named "english" are part of the format.
import { readFileSync, writeFileSync } from "node:fs";

const translations = [
  ["ser (cópula clásica o literaria)", "La constancia es fuerza.", ["continuidad", "marcador de tema", "fuerza", "es"]],
  ["pregunta, problema (de un examen)", "¿Cuál es la respuesta a esta pregunta?", ["esta", "pregunta", "marcador de posesión", "respuesta", "marcador de tema", "qué", "es", "marcador de pregunta"]],
  ["ojo", "Tienes los ojos grandes.", ["ojo", "marcador de sujeto", "grande (adjetivo en -i + desu formal)", "grande (adjetivo en -i + desu formal)", "suaviza la afirmación"]],
  ["región, zona, distrito", "Esta zona es segura.", ["esta", "zona", "marcador de tema", "seguro (adjetivo en -na + cópula informal, como predicado)", "seguro (adjetivo en -na + cópula informal, como predicado)"]],
  ["tres", "Quedemos a las tres.", ["tres", "hora", "marcador de tiempo", "forma volitiva formal de au (encontrarse)"]],
  ["jugador, atleta, competidor", "Él es jugador de béisbol.", ["él", "marcador de tema", "béisbol", "jugador", "es"]],
  ["empresa, negocio", "Trabajo en una empresa grande.", ["grande", "empresa", "en", "forma progresiva formal de hataraku (trabajar); hataraite + imasu, forma en -te + iru"]],
  ["relación, conexión", "La relación entre los dos es buena.", ["dos personas", "marcador de posesión", "relación", "marcador de tema", "buena"]],
  ["otra vez, de nuevo", "Volvamos a vernos.", ["otra vez", "forma volitiva formal de au (encontrarse)"]],
  ["economía", "La economía de Japón está creciendo.", ["Japón", "marcador de posesión", "economía", "marcador de tema", "crecimiento", "forma continuada informal de seichou suru (crecer); shite + iru, forma en -te + iru"]],
  ["ahora, en este momento", "¿Qué hora es ahora?", ["ahora", "qué hora", "es", "marcador de pregunta"]],
  ["miembro de un comité", "Ella es la representante de la clase.", ["ella", "marcador de tema", "clase", "miembro de un comité", "es"]],
  ["tiempo", "No tengo tiempo.", ["tiempo", "marcador de sujeto", "no tener"]],
  ["representante, delegado", "Él participó como representante de Japón.", ["él", "marcador de tema", "Japón", "representante", "como", "participar (verbo compuesto: shutsujou + shita, pasado de shutsujousuru)", "participar (verbo compuesto: shutsujou + shita, pasado de shutsujousuru)"]],
  ["país, nación", "¿De qué país eres?", ["cuál", "país", "desde", "pasado formal de kuru (venir)", "marcador de pregunta"]],
  ["que (comparación)", "Me gusta más el invierno que el verano.", ["verano", "que", "invierno", "marcador de sujeto", "gustar (adjetivo en -na + cópula formal, como predicado)", "gustar (adjetivo en -na + cópula formal, como predicado)"]],
  ["muchos, mucho; gran cantidad; mayoría", "Participaron muchas personas.", ["muchos", "marcador de posesión", "persona", "marcador de sujeto", "pasado de sankasuru (participar); verbo compuesto sanka + shita"]],
  ["mientras (se hace algo)", "Estudio mientras escucho música.", ["música", "marcador de objeto directo", "escuchar", "mientras", "estudiar (verbo compuesto: benkyou + suru, forma de diccionario de benkyousuru)"]],
  ["uno mismo, yo mismo, tú mismo", "Por favor, intenta hacerlo tú mismo.", ["tú mismo", "por uno mismo", "forma en -te de yaru (hacer)", "forma en -te de miru (intentar)", "por favor"]],
  ["porque, ya que, puesto que", "Como está lloviendo, no voy a salir.", ["lluvia", "marcador de sujeto", "forma progresiva informal de furu (llover); futte + iru, forma en -te + iru", "ya que", "no salir (negativo de dekakeru)"]],
  ["anuncio, publicación", "Anunciamos el nuevo producto.", ["producto nuevo", "marcador de objeto directo", "anunciar (verbo compuesto: happyou + shita, pasado de happyousuru)", "anunciar (verbo compuesto: happyou + shita, pasado de happyousuru)"]],
  ["participación", "Participaré en la reunión.", ["reunión", "marca el evento en que se participa", "participar (verbo compuesto: sanka + suru, forma de diccionario de sankasuru)", "participar (verbo compuesto: sanka + suru, forma de diccionario de sankasuru)"]],
  ["necesario, requerido", "Necesito dinero.", ["dinero", "marcador de sujeto", "necesario (adjetivo en -na + cópula formal, como predicado)", "necesario (adjetivo en -na + cópula formal, como predicado)"]],
  ["debido a, causado por", "Los daños causados por el terremoto se están extendiendo.", ["terremoto", "debido a", "daños", "marcador de sujeto", "forma progresiva informal de hirogaru (extenderse); hirogatte + iru, forma en -te + iru"]],
  ["todo el país, a nivel nacional", "Se vende en todo el país.", ["a nivel nacional", "en (lugar de la acción)", "se vende (forma pasiva continuada de hanbai suru); hanbaisarete + iru, forma en -te + iru"]],
  ["si, en el caso de", "Si es solo hasta ese punto, no hay problema.", ["este", "grado", "si", "estar bien (adjetivo en -na + cópula informal, como predicado)", "estar bien (adjetivo en -na + cópula informal, como predicado)"]],
  ["información, datos, noticias", "Te proporcionaremos la información más reciente.", ["más reciente", "marcador de posesión", "información", "marcador de objeto directo", "proporcionar"]],
  ["eso (cosa)", "¿Qué es eso?", ["eso", "marcador de tema", "qué"]],
  ["casa, hogar", "Voy a casa.", ["casa", "destino", "presente formal de kaeru (volver a casa)"]],
  ["sociedad, comunidad", "Sigo las normas de la sociedad.", ["sociedad", "marcador de posesión", "norma", "marcador de objeto directo", "respetar"]],
  ["negocio, empresa, proyecto", "Empezar un nuevo negocio.", ["nuevo", "negocio", "marcador de objeto directo", "empezar"]],
  ["a partir de, mayor o igual a", "Solo pueden entrar las personas de 20 años o más.", ["veinte años", "o más", "marcador de posesión", "persona (formal)", "solo", "entrada", "presente formal de dekiru (poder)"]],
  ["tiempo, paso del tiempo, meses y días", "El tiempo pasa rápido.", ["tiempo", "marcador de sujeto", "transcurrir", "nominalizador", "marcador de tema", "rápido"]],
  ["pensamiento, sentimiento, emoción", "Poner los sentimientos en palabras.", ["sentimiento", "marcador de objeto directo", "palabra", "destino", "hacer"]],
  ["tienda, comercio", "¿Hasta qué hora está abierta esta tienda?", ["esta", "tienda", "marcador de tema", "qué hora", "hasta", "forma progresiva formal de aku (abrirse); aite + imasu, forma en -te + iru", "marcador de pregunta"]],
  ["años, paso del tiempo", "Han pasado muchos años.", ["largo", "años", "marcador de sujeto", "pasado de tatsu (pasar)"]],
  ["gobierno, administración", "El gobierno anunció una nueva política.", ["gobierno", "marcador de tema", "nuevo", "política", "marcador de objeto directo", "anunciar (verbo compuesto: happyou + shita, pasado de happyousuru)", "anunciar (verbo compuesto: happyou + shita, pasado de happyousuru)"]],
  ["cien millones; 100.000.000", "La población mundial ha superado los ocho mil millones.", ["mundo", "marcador de posesión", "población", "marcador de tema", "cien millones", "contador de personas", "marcador de objeto directo", "pasado de koeru (superar)"]],
  ["encima, parte superior", "El libro está sobre el escritorio.", ["libro", "marcador de tema", "escritorio", "marcador de posesión", "encima", "marcador de lugar de existencia", "presente formal de aru (existir)"]],
  ["dirigido a, destinado a, para", "Este libro está dirigido a niños.", ["este", "libro", "marcador de tema", "niños", "dirigido a", "es"]],
  ["hablar, conversar", "Hablo japonés.", ["idioma japonés", "marcador de objeto directo", "hablar"]],
  ["esta vez, ahora", "Esta vez no salió bien.", ["esta vez", "marcador de tema", "no servir (adjetivo en -na + cópula informal en pasado, como predicado)", "no servir (adjetivo en -na + cópula informal en pasado, como predicado)"]],
  ["mujer, persona de sexo femenino", "Viajé en el vagón exclusivo para mujeres.", ["mujer", "uso exclusivo", "vagón de tren", "marcador de lugar de existencia", "pasado formal de noru (subir a un vehículo)"]],
  ["posible, factible, viable", "¿Es eso posible?", ["eso", "marcador de tema", "posible (adjetivo en -na + cópula formal, como predicado)", "posible (adjetivo en -na + cópula formal, como predicado)", "marcador de pregunta"]],
  ["periódico", "Salía en el periódico.", ["periódico", "marcador de lugar de existencia", "aparecer en una publicación (notte + ita: forma en -te + iru, acción o estado continuado en pasado)"]],
  ["turismo, visita turística", "Fui de turismo a Kioto.", ["Kioto", "destino", "turismo", "marcador de propósito", "pasado formal de iku (ir)"]],
  ["actividad, acción", "Participar en actividades de voluntariado.", ["voluntariado", "actividad", "destino", "participar (verbo compuesto: sanka + suru, forma de diccionario de sankasuru)"]],
  ["selección, antología", "Publicaron una selección de obras maestras.", ["obra maestra", "selección", "marcador de objeto directo", "publicar (verbo compuesto: shuppan + shita, pasado de shuppansuru)", "publicar (verbo compuesto: shuppan + shita, pasado de shuppansuru)"]],
  ["punto, puntuación", "Saqué 100 puntos.", ["punto", "marcador de objeto directo", "obtuvo (pasado de toru)"]],
  ["pensamiento, idea, opinión", "Tengo una buena idea.", ["bueno", "idea", "marcador de sujeto", "presente formal de aru (tener)"]],
];

const root = new URL("../decks/", import.meta.url);
const source = JSON.parse(readFileSync(new URL("english/most-common-100.json", root), "utf8"));
const first = JSON.parse(readFileSync(new URL("spanish/most-common-50-es.json", root), "utf8"));
if (first.cards.length !== 50 || translations.length !== 50) throw new Error("Expected two sets of 50 translations.");
source.cards.splice(0, 50, ...first.cards);
for (const [offset, [meaning, sentence, words]] of translations.entries()) {
  const card = source.cards[offset + 50];
  const example = card.examples[0];
  if (words.length !== example.wordMeanings.length) throw new Error(`Annotation count mismatch for ${card.japanese}.`);
  card.english = meaning;
  example.english = sentence;
  example.wordMeanings.forEach((word, i) => { word.meaning = words[i]; });
}
source.name = "Japonés más frecuente — 100 palabras (español)";
source.source += " Spanish translations prepared for Japanese Cards.";
writeFileSync(new URL("spanish/most-common-100-es.json", root), `${JSON.stringify(source, null, 2)}\n`);
