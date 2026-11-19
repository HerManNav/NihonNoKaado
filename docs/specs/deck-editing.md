# Deck editing and search

## Entry surfaces

The current-deck list renders an inline entry row above existing cards. Cards show romaji, hiragana, meanings, Edit, and Remove. Inline save prepends a new card; the separate add form appends a new card. Both allow multiple meanings, each with its own three example fields. Save waits for pending suggestions/annotation, then rejects stale results if the form changed or was left. Storage failures show feedback and prevent replacing current in-memory cards with an unsaved result.

Romaji edits auto-fill hiragana until manually edited, unless the reading is empty. Saved readings compact whitespace. Clearing the Japanese input or pressing Escape there clears dependent meaning/example fields. Editing preserves unchanged token annotations; changed examples are analyzed again. Separate-form save/cancel returns to the prior screen and restores deck scroll/card position. Successful add resets entry fields and returns focus to Japanese input.

Duplicates use trimmed, lowercased Japanese headwords. New entry matching an existing word opens an overwrite dialog; cancel preserves cards. Overwrite updates that card's content. Remove deletes the selected card. Clear uses a separate confirmation screen; see [storage](data-storage.md).

## Keyboard and filtering

- Tab from Japanese skips hiragana and focuses meaning; Shift+Tab keeps backward navigation.
- In inline meanings, Tab from the last meaning creates another meaning; Enter advances through meanings or saves from the last.
- Separate add form also supports Enter submit and multiple meanings.
- The Japanese input filters existing deck cards, both in inline deck entry and add-form matches. Results retain source card indices so edit/remove affect the correct card.
- `searchDeckCards` uses case-insensitive, trimmed literal substrings first. Fuzzy whole-word Levenshtein allows 0 edits below 3 query code points, 1 at 3–4, and 2 at 5+. Results sort by distance then original index. Literal highlight ranges map to original UTF-16 offsets and merge overlaps; fuzzy-only matches have no literal highlight. Empty query restores original order.
- Deck tools open with touch/click, keyboard focus, or pointer hover; hover bridge must not intercept option clicks.

## Ownership

`app.js`: `createDeckEntryRow`, `addDeckEntry`, `requestCardOverwrite`, `filterDeckList`, `renderAddDeckMatches`, `startAddingWord`, `startEditingCard`, `cancelCardForm`, `focusDeckCard`, card-form submit/input handlers. `deck-core.js`: `searchDeckCards`, `romajiToHiragana`, `getDeckEntryKeyAction`, `shouldAutoConvertHiragana`, `updateCardAt`, `removeCardAt`. Layout and menu hit areas: `styles.css`.

Example locking, cycling, corrections, and async guards are specified in [example search](example-search.md).

## Evidence

`tests/deck-inline-entry.test.js`, `tests/deck-search.test.js`, `tests/deck-core.test.js`, `tests/card-form-reset.test.js`, `tests/edit-return-position.test.js`, `tests/deck-menu-hover.test.js`, `tests/example-workflow.test.js`. Static/fake DOM checks cover selected paths; they do not establish visual layout or every focus interaction on real devices.
