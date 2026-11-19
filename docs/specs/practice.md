# Practice sessions

## Selection and prompts

Home offers Japanese-first or English-first and sizes 5, 10, 20, Whole deck. Empty deck cannot start. The current Whole deck target is the sum of card meaning counts in both directions. This can repeat multi-meaning cards in Japanese-first sessions; do not assume the target equals card count.

Japanese-first uses weighted random permutations without replacement within a batch; batches repeat for a larger target, avoiding identical adjacent cards across batches when possible. Reveal shows all meanings/examples. English-first draws a card by weight, selects an unseen meaning, and keeps the card in the pool until all its meanings have appeared. The pool resets after all meanings are exhausted. Prompt is the selected translation; reveal shows Japanese and its corresponding example. Weights are snapshotted at session start, so current grades affect later sessions.

## State and gestures

`practicePhase` guards guessing, flipping, revealed, confirmingCorrect, committingMiss, exiting, and complete states. Tap/Space reveals first; another action confirms correct. Left swipe on a revealed active card grades correct. Remember me later/downward drag grades incorrect. Short, cancelled, or unrevealed drags do not grade. Review via progress dots/right swipe shows earlier revealed cards without grading; left swipe during review advances through history toward the current card.

Grade commit is guarded by session position, phase, direction, and existing grade. Animation completion and timers must never double-grade or advance after leaving practice. Correct click feedback pulses 360 ms, holds 150 ms, then exits for 190 ms; a revealed left swipe starts the exit directly. Reduced-motion handling retains visible correct feedback. Popup dismissal consumes the relevant touch action before card advancement/miss grading.

Progress tracks completed/current/review positions and shown indices. Future unseen dots cannot jump ahead. Summary counts attempt grades and lists every missed attempt, including repeated misses of the same word. Learning history is local per deck/direction; see [data and storage](data-storage.md).

## Ownership and evidence

`app.js`: `startPractice`, `renderPracticeCard`, `commitCurrentGrade`, `confirmCurrentCorrect`, `commitCurrentMiss`, `reviewPracticeCard`, `renderSessionProgress`, `renderPracticeSummary`, `cancelPracticeTimers`, flashcard drag handlers. `deck-core.js`: `createPracticeDeck`, `createMeaningPracticeRun`, `getSessionProgressState`, `nextReviewIndex`.

`tests/deck-core.test.js` checks sampling/meaning runs/progress. `tests/practice-swipe.test.js` checks grade guards, timing, review, summary, history, cancellation, and popup interactions. `tests/all-default-decks-behavior.test.js` checks shipped cards through core behavior. Fake event/timer tests cannot fully establish real touch physics, rendered transitions, or accessibility.
