# Tests

Run the maintenance tests from the project root with:

```sh
node --test
```

The suite uses Node's built-in test runner and has no package dependencies. It covers dictionary import/export and starter data, English practice and session progress, card editing and swipes, romaji conversion, inflection rules and homograph ranking, and revealed-card popup behavior for mouse and touch. It also verifies that the preserved dictionary sources reproduce the published lookup and that PWA precache paths exist.

`independent-translation-reference.test.js` checks published lexical meanings, homographs, conjugations, and invalid forms against source-linked references outside the JMdict build. The references are written directly into the tests, so they are reviewable and do not depend on a live website during a test run. These cases are a finite cross-check; they do not establish the accuracy or frequency order of every dictionary sense. The popup interaction tests use a small fake DOM and do not substitute for a browser check on actual devices.
