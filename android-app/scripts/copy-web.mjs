import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.resolve(projectDirectory, "..");
const webDirectory = path.join(projectDirectory, "www");
const sharedFiles = ["index.html", "styles.css", "app.js", "export-storage.js", "dictionary-core.js", "word-form-lookup.js", "language.js"];

await mkdir(webDirectory, { recursive: true });
await Promise.all(sharedFiles.map((file) => copyFile(
  path.join(sourceDirectory, file),
  path.join(webDirectory, file),
)));
// Source archives are for maintenance only; ship the files the app can fetch.
const dictionaryDirectory = path.join(sourceDirectory, "dictionaries");
const runtimeDictionaries = (await readdir(dictionaryDirectory)).filter((file) =>
  file === "manifest.json" || /^most-common-\d+\.json$/.test(file)
  || /^romaji-english-.*\.json(?:\.gz)?$/.test(file));
const bundledDictionaries = path.join(webDirectory, "dictionaries");
// Clear the generated copy so older builds cannot leave source archives behind.
await rm(bundledDictionaries, { recursive: true, force: true });
await mkdir(bundledDictionaries, { recursive: true });
await Promise.all(runtimeDictionaries.map((file) => copyFile(
  path.join(dictionaryDirectory, file), path.join(bundledDictionaries, file),
)));

console.log(`Copied ${sharedFiles.length} shared web app files and default dictionaries into android-app/www.`);
