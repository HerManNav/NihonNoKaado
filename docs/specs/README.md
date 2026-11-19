# Feature spec index

Current-state map, established from source and tests on 2026-11-19. These files help locate work without rereading the whole repository. They are not proposals or proof that all behavior is correct. Source and tests remain authoritative. Update the relevant spec alongside changes.

Read this index and one matching spec; follow another link only when the task crosses that boundary.

| Task or feature | Spec |
| --- | --- |
| Startup, language, settings/about, screens, system Back | [Navigation and language](navigation-language.md) |
| Inline entry, card form, editing, duplicate overwrite, deck filtering | [Deck editing](deck-editing.md) |
| JSON compatibility, persistence, identity, learning history, export | [Data and storage](data-storage.md) |
| Sessions, grading, gestures, progress/review, summary | [Practice](practice.md) |
| Example fields, matching, previous/next, typo corrections, caches | [Example search](example-search.md) |
| Word popup, contextual annotations, inflections, romaji conversion | [Word lookup](word-lookup.md) |
| Starter decks, Spanish generation, provenance, corpus/lookup rebuilds | [Content pipeline](content-pipeline.md) |
| Browser, PWA cache, Android copy/build/native integration | [Platforms](platforms.md) |
| Find relevant tests, commands, evidence limits | [Test map](test-map.md) |
| Skills/MCP assessment and token-saving workflow | [Tooling research](tooling-research.md) |
| Install/configure default Serena code discovery | [Serena setup](../../.serena/README.md) |

## Architecture in one screen

No frontend framework or root package installation. `index.html` and `styles.css` define the UI; `app.js` owns DOM wiring, state, persistence, navigation, and practice. Pure helpers in `deck-core.js`, `example-search.js`, `example-suggestions.js`, and `word-form-lookup.js` expose browser globals and CommonJS exports. `language.js` handles UI translation and the language gate. Runtime data lives in `decks/`; maintenance inputs live in `decks/source-data/` and `scripts/`. Android copies runtime assets; PWA wraps the root app in an iframe.

## Reading and maintenance rules

- Prefer Serena's scoped symbol and reference queries for code discovery. Use bounded `rg` for literal strings, dynamic wiring, unsupported languages, or unavailable Serena.
- Read the owning test file when changing a contract; use [test map](test-map.md) to find it.
- Do not read generated JSON or compressed archives as ordinary code context. Inspect metadata or selected records with a script when data is the task.
- Keep behavior, invariants, source symbols, and evidence in each spec. Prefer stable symbols over fragile line numbers.
- Do not duplicate every assertion or copy implementation. Add a concrete limitation when behavior is unverified.
- Baseline includes existing working-tree app edits; specs describe the checkout, not only committed HEAD.
