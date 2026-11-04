const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { gunzipSync } = require("node:zlib");

const root = path.join(__dirname, "..");
const source = path.join(root, "dictionaries/source-data/jmdict-eng-3.6.2+20261102210542.json.tgz");
const frequency = path.join(root, "dictionaries/source-data/ja_full-OpenSubtitles2018.txt");
const learnerIndex = path.join(root, "dictionaries/source-data/tkg-entries-index-32c267cb.json");
const published = path.join(root, "dictionaries/romaji-english-jmdict-2026-11-02.json.gz");
const builder = path.join(root, "scripts/build-romaji-lookup.mjs");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

test("preserved sources reproduce the published lookup without changing either source", { timeout: 30_000 }, () => {
  const sourceBefore = sha256(readFileSync(source));
  const frequencyBefore = sha256(readFileSync(frequency));
  const learnerIndexBefore = sha256(readFileSync(learnerIndex));
  const tempDirectory = mkdtempSync(path.join(tmpdir(), "japan-cards-lookup-"));
  const rebuilt = path.join(tempDirectory, "romaji-english.json.gz");
  try {
    execFileSync(process.execPath, [builder, source, rebuilt], { cwd: root, encoding: "utf8" });
    assert.equal(sha256(gunzipSync(readFileSync(rebuilt))), sha256(gunzipSync(readFileSync(published))));
    assert.equal(sha256(readFileSync(source)), sourceBefore);
    assert.equal(sha256(readFileSync(frequency)), frequencyBefore);
    assert.equal(sha256(readFileSync(learnerIndex)), learnerIndexBefore);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
