# Serena project setup

Serena 2.1.0 is the default code-discovery MCP for this project. Caveman remains the response-style default. `project.yml` is shared; local executable paths, caches, and user state are not.

## Another developer's Windows setup

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then:

```powershell
uv tool install --python 3.13 serena-agent==2.1.0
```

Copy the `[mcp_servers.serena]` section in `codex-config.example.toml` into this trusted project's `.codex/config.toml`, replacing its executable and checkout paths with absolute paths for your machine. Preserve existing configuration. This local file is ignored by Git; commit the example and `project.yml` instead. Codex also accepts equivalent settings in its MCP configuration UI.

The installed executable normally lives at `$env:USERPROFILE\.local\bin\serena.exe`. The explicit project and context paths avoid Codex Desktop starting Serena in another working directory. `codex-context.yml` is a single-project variant of Serena's Codex context so the six-tool project allowlist also limits MCP tool discovery. Dashboard, browser auto-open, and GUI log windows are disabled for this connection. Start a new Codex chat or reconnect MCP servers after configuration changes.

## Default usage

At each new chat's startup, report `Serena: connected.` alongside Caveman only after a successful Serena tool call and confirmation that this checkout is active. Otherwise report `Serena: disconnected — <reason>` and continue with bounded local searches. Configuration alone is not a live connection check. Reuse the startup `initial_instructions` result rather than reading it twice.

1. Read the spec index and only the matching spec.
2. Read `initial_instructions` once per session and confirm/activate this checkout. Pass the returned session ID to tools that require it. Serena line numbers are zero-based; convert when citing source lines to people.
3. Use `get_symbols_overview` to locate ownership, `find_symbol` for the relevant body, and `find_referencing_symbols` for semantic callers.
4. Keep queries scoped to known paths and output bounded. Use `search_for_pattern` or `rg` for strings, DOM IDs, dynamic wiring, and unresolved cross-file browser globals.
5. Use existing file tools for changes. Serena is configured read-only and does not expose edit, shell, or memory tools here.

The TypeScript server covers the main JavaScript and maintenance `.mjs` files. Native Java and Python translation code use targeted shell searches; extra language servers are not started by default. Dictionary/source data, generated Android copies, dependencies, and build output are excluded. `.gitignore` is respected.

## Troubleshooting and limits

- If Serena is unavailable, report that once and use bounded `rg`/source reads; do not block the task.
- First startup may download a managed language server and warm its cache. MCP startup timeout is 120 seconds.
- User configuration/logs/dependencies live outside this repository; symbol caches are ignored. Do not commit either.
- If symbols appear absent, check ignored paths and supported language before concluding code does not exist. Dynamic JavaScript references need a targeted text check.
- Installation and successful symbol retrieval do not establish token savings. Compare real tasks before claiming a reduction.

## Verified on this checkout

On 2026-11-19, Codex resolved the project-local enabled MCP entry. Serena indexed 70 JavaScript/.mjs files. A stdio MCP client verified exactly six tools, project activation, retrieval of `startPractice` in 1,663 output characters, its `startButton` event-listener reference, and the `deck-core.js` symbol overview. This was a direct protocol check; the current chat's tool catalog does not hot-load the new server. Start a new chat or reconnect to use it through normal Codex tool discovery.

See [official Serena Codex setup](https://oraios.github.io/serena/02-usage/030_clients.html#codex-cli-and-app) and [tooling assessment](../docs/specs/tooling-research.md).
