# Tests

Run the maintenance tests from the project root with:

```sh
node --test
```

The suite uses Node's built-in test runner and has no package dependencies. It covers dictionary import/export and starter data, English practice and session progress, card editing and swipes, romaji conversion, inflection rules and homograph ranking, and revealed-card popup behavior for mouse and touch. It also verifies that the preserved dictionary sources reproduce the published lookup and that PWA precache paths exist.
