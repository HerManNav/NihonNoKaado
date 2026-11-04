const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in app.js`);
  const next = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, next === -1 ? undefined : next);
}

test("pointer gestures use one drag path for mouse and touch with visible card feedback", () => {
  assert.match(app, /flashcard\.addEventListener\("pointerdown", startFlashcardDrag\)/);
  assert.match(app, /flashcard\.addEventListener\("pointermove", moveFlashcardDrag\)/);
  assert.match(app, /flashcard\.addEventListener\("pointerup", endFlashcardDrag\)/);
  assert.match(styles, /\.flashcard\s*\{[^}]*touch-action:\s*pan-y/s);
  assert.match(styles, /\.flashcard\.is-dragging\s*\{[^}]*translate3d\(var\(--drag-x/s);
  assert.match(styles, /\.flashcard\.is-swipe-exit-left, \.flashcard\.is-swipe-exit-right\s*\{[^}]*opacity:\s*0/);
  assert.match(styles, /\.flashcard\.is-swipe-exit-left\s*\{[^}]*translate3d\(-115%/);
  assert.match(styles, /\.flashcard\.is-swipe-exit-right\s*\{[^}]*translate3d\(115%/);
});

test("forward swipes require the answer, while reverse swipes revisit prior cards", () => {
  const navigation = functionSource("navigateWithFlashcardSwipe");
  assert.match(navigation, /if \(reviewIndex === null && !answerRevealed\) return false/);
  assert.match(navigation, /if \(currentIndex <= 0\) return false/);
  assert.match(navigation, /reviewIndex = currentIndex - 1/);
  assert.match(navigation, /finishPracticeAdvance\(\)/);
});

test("a rejected forward swipe shows proportional red feedback, jitter, and a fading hint", () => {
  const drag = functionSource("moveFlashcardDrag");
  const denied = functionSource("showSwipeDeniedFeedback");
  const reveal = functionSource("revealAnswer");
  assert.match(drag, /reviewIndex === null && !answerRevealed && deltaX < 0/);
  assert.match(drag, /const redTint = Math\.min\(0\.38, Math\.abs\(ratio\) \* 0\.75\)/);
  assert.match(denied, /swipeRevealHint\.classList\.add\("is-attention"\)/);
  assert.match(denied, /flashcard\.classList\.add\("is-denied-jitter"\)/);
  assert.match(reveal, /swipeRevealHint\.classList\.remove\("is-attention"\)/);
  assert.match(reveal, /swipeRevealHint\.classList\.add\("is-fading"\)/);
  assert.match(styles, /\.swipe-reveal-hint\.is-attention\s*\{\s*animation:\s*reveal-needed-blink/);
  assert.match(styles, /@keyframes reveal-needed-blink/);
});

test("the reveal hint reserves its layout space after fading", () => {
  assert.match(html, /id="swipe-reveal-hint"[^>]*class="swipe-reveal-hint is-hidden"/);
  assert.match(styles, /\.swipe-reveal-hint\s*\{[^}]*min-height:\s*18px/s);
  assert.match(styles, /\.swipe-reveal-hint\.is-hidden\s*\{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(styles, /\.swipe-reveal-hint\.is-hidden\s*\{[^}]*display:\s*none/s);
});

test("card clicks and swipes share forward animation and card text is not selectable", () => {
  const clickAction = functionSource("handleFlashcardAction");
  const advance = functionSource("advancePractice");
  assert.match(clickAction, /reviewIndex !== null[\s\S]*?transitionFlashcardSwipe\(-1/);
  assert.match(advance, /transitionFlashcardSwipe\(-1, \(\) => finishPracticeAdvance\(\)\)/);
  assert.match(styles, /\.flashcard, \.flashcard \*\s*\{[^}]*-webkit-user-select:\s*none[^}]*user-select:\s*none[^}]*-webkit-touch-callout:\s*none/s);
  assert.doesNotMatch(app, /getSelection|hasSelectedTextInFlashcard|flashcardSelectionPointerId/);
  assert.doesNotMatch(styles, /practice-example[^\n]*user-select:\s*text/);
});
