# Navigation and language

## Behavior

- First launch without a saved language shows English/Spanish choice. A valid saved choice skips the selector on later launches; the old session-only preference migrates to local storage.
- Choosing a language for entry shows a staged 1.5-second animation ending at 80%, followed by fade into the app. This is a timed presentation, not measured deck/download progress.
- Changing language sets a pending session preference and reloads. Spanish translation traverses UI text/attributes and observes added nodes; alert/confirm/prompt messages are translated too. Existing card content is not translated in place.
- Settings offers Language and About. Returning from the settings selector or choosing the same language restores the app without repeating entry loading. About contains attribution/source information.
- Home selects practice direction and session size; its plus opens the current deck. Deck tools expose import/defaults, export, and clear. Their return screen is remembered.
- Screen changes use View Transitions when available. Leaving practice cancels timers and dismisses popup state.

## Back priority

`JapaneseCardsHandleBack` dismisses overwrite dialog, language selector, word popup, and open deck menu before screen navigation. It cancels default-load confirmation when not loading; exits forms through their cancellation path; blocks export navigation while saving; returns About to Settings; returns deck features to their caller; returns practice/deck/settings to Home. At the root it returns false so Android can perform its normal Back behavior.

## Ownership and contracts

| File | Symbols / contract |
| --- | --- |
| `app.js` | `screens`, `showScreen`, `returnFromDeckFeature`, `openSettings`, `JapaneseCardsHandleBack` |
| `language.js` | `startSelection`, `showLanguageSelector`, `returnToAppFromLanguageSelector`, `JapaneseCardsLanguageNavigation` |
| `index.html`, `styles.css` | Screen IDs, language gate, settings/about, responsive transitions and ARIA attributes |

Storage: `japanese-cards.current-language` in local/session storage, plus session `pending-language` and `return-to-settings` keys under the same prefix. Practice direction (`japanese`/`english`) is separate from UI/content language (`en`/`es`). Default import chooses `spanishFile` when Spanish is active; switching UI language does not replace the active deck.

## Evidence and limits

`tests/language-selection.test.js` covers saved preference, migration, staged animation, settings return, and translations. `tests/word-popup-interactions.test.js` covers system Back priorities. `tests/ui-configuration.test.js` checks screen wiring/configuration. These use fake DOM or static assertions; real-device transitions and native Back need device verification when changed.
