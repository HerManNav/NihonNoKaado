import { copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.resolve(projectDirectory, "..");
const webDirectory = path.join(projectDirectory, "www");
const sharedFiles = ["index.html", "styles.css", "app.js", "dictionary-core.js", "word-form-lookup.js", "language.js"];

await mkdir(webDirectory, { recursive: true });
await Promise.all(sharedFiles.map((file) => copyFile(
  path.join(sourceDirectory, file),
  path.join(webDirectory, file),
)));
await cp(path.join(sourceDirectory, "dictionaries"), path.join(webDirectory, "dictionaries"), { recursive: true });

console.log(`Copied ${sharedFiles.length} shared web app files and default dictionaries into android-app/www.`);
