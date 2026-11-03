# Tests

Run the maintenance tests from the project root with:

```sh
node --test
```

The suite uses Node's built-in test runner and has no package dependencies. It covers legacy and multi-meaning dictionary import/export, meaning-aware English practice runs and resets, romaji-to-hiragana conversion and form autofill/focus rules, and practice-deck shuffling, size, and repetition behavior.
