# Tests

Run the maintenance tests from the project root with:

```sh
node --test
```

The suite uses Node's built-in test runner and has no package dependencies. It covers legacy and multi-meaning dictionary import/export, default dictionary selection and data integrity, meaning-aware English practice runs and resets, clickable review progress ranges and boundaries, pointer-based card swipes and their reveal gate, dictionary menu hover stacking and clickability, inline dictionary entry layout and keyboard flows, romaji-to-hiragana conversion and form autofill/focus rules, and practice-deck shuffling, size, and repetition behavior.
