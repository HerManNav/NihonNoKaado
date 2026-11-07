import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.resolve(projectDirectory, "..");
const webDirectory = path.join(projectDirectory, "www");
const sharedFiles = ["index.html", "styles.css", "app.js", "export-storage.js", "deck-core.js", "word-form-lookup.js", "language.js"];

await mkdir(webDirectory, { recursive: true });
await Promise.all(sharedFiles.map((file) => copyFile(
  path.join(sourceDirectory, file),
  path.join(webDirectory, file),
)));
// Source archives are for maintenance only; ship the files the app can fetch.
const deckDirectory = path.join(sourceDirectory, "decks");
const catalog = JSON.parse(await readFile(path.join(deckDirectory, "manifest.json"), "utf8"));
const runtimeDecks = ["manifest.json", ...catalog.decks.flatMap((deck) => [deck.file, deck.spanishFile].filter(Boolean)),
  ...(await readdir(deckDirectory)).filter((file) => /^romaji-english-.*\.json(?:\.gz)?$/.test(file))];
const bundledDecks = path.join(webDirectory, "decks");
// Clear the generated copy so older builds cannot leave source archives behind.
if (path.resolve(bundledDecks) !== path.resolve(projectDirectory, "www", "decks")) throw new Error("Unexpected generated deck directory.");
await rm(bundledDecks, { recursive: true, force: true });
await mkdir(bundledDecks, { recursive: true });
await Promise.all(runtimeDecks.map(async (file) => {
  const from = path.resolve(deckDirectory, file), to = path.resolve(bundledDecks, file);
  if (!from.startsWith(deckDirectory + path.sep) || !to.startsWith(bundledDecks + path.sep)) throw new Error("Invalid catalog path.");
  await mkdir(path.dirname(to), {recursive:true});
  await copyFile(from, to);
}));

console.log(`Copied ${sharedFiles.length} shared web app files and default decks into android-app/www.`);
