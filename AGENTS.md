# Project instructions

- Use the Caveman skill for every chat about this project. Read `C:\Users\German\.agents\skills\caveman\SKILL.md` at the start of each new chat and follow it throughout, unless the user asks to stop or use normal mode.
- In the first response of every new chat, state clearly whether Caveman is active. Say `Caveman: active.` after reading the skill. If the skill file is unavailable, say `Caveman: inactive — <reason>` and explain briefly.
- At the start of every new chat, discover Serena's tools and call `initial_instructions` once to verify the connection and active project. If needed, activate this checkout before reporting success. Reuse these instructions and the returned session ID throughout the session.
- Report Serena's status alongside Caveman after the startup checks: `Serena: connected.` only after a successful tool call and confirmation that this checkout is active; otherwise say `Serena: disconnected — <reason>`. If tools are absent, state that they are unavailable in this chat. Installed files or an enabled configuration alone do not prove connection. Continue with bounded local searches when disconnected.

## Efficient project work

- For code, behavior, or build tasks, start at `docs/specs/README.md`, then load only the relevant spec. Skip specs for unrelated requests.
- For every code change or new feature, automatically use Serena to trace the relevant symbols and references before editing, without a user reminder. Scope the trace to the requested behavior; practice grading is only an example. Use symbol overviews, scoped `find_symbol` bodies, and `find_referencing_symbols`; reuse startup instructions and pass the session ID when required. Setup: `.serena/README.md`.
- Do not announce routine Serena use on each task; retain the startup connection status and report failures or material findings.
- Use bounded `rg`/pattern searches for literal text, DOM IDs, dynamic JavaScript wiring, unsupported languages, or when Serena is unavailable. Report unavailability once and continue. Do not dump whole files, corpus parts, source archives, or the complete test suite for a localized task.
- Specs describe current behavior, not future requirements. Code wins on disagreement; inspect relevant tests and update stale documentation in the same change.
- Update the affected spec when changing behavior, data contracts, invariants, or build steps. Keep the index short; add a new subsystem spec only when ownership genuinely differs.
- Serena is read-only here; use existing file tools for edits. Choose task skills selectively; do not load every skill or start extra agents/MCPs by default. See `docs/specs/tooling-research.md` for evaluated options.
- Run focused checks appropriate to changed behavior. Report what ran and any remaining limits; documentation-only changes need link/path checks, not app or corpus builds.
