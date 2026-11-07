import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
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
const runtimeDecks = (await readdir(deckDirectory)).filter((file) =>
  file === "manifest.json" || /^most-common-\d+\.json$/.test(file)
  || /^romaji-english-.*\.json(?:\.gz)?$/.test(file));
const bundledDecks = path.join(webDirectory, "decks");
// Clear the generated copy so older builds cannot leave source archives behind.
await rm(bundledDecks, { recursive: true, force: true });
await mkdir(bundledDecks, { recursive: true });
await Promise.all(runtimeDecks.map((file) => copyFile(
  path.join(deckDirectory, file), path.join(bundledDecks, file),
)));

console.log(`Copied ${sharedFiles.length} shared web app files and default decks into android-app/www.`);
