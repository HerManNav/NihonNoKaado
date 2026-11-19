# Token-efficient workflow and tooling research

Research/setup date: 2026-11-19. Recommendations below are a project-specific assessment, not measured savings. A later user request authorized installing Serena 2.1.0 and making it this project's default for code discovery. See [setup and verification](../../.serena/README.md). No external account or model provider is required for this local setup.

## Recommended default

Use the small root `AGENTS.md`, this spec index, and Serena's scoped symbol/reference queries. Keep bounded `rg`/source reads for text, dynamic wiring, unsupported languages, or unavailable Serena. Keep specs in Git and update them with behavior changes. Do not auto-load every spec or add an extra memory database containing duplicate versions.

Caveman shortens visible replies; it does not by itself constrain source-reading volume or guarantee lower reasoning-token usage. Avoid dumping huge data assets, entire test suites, and broad tool schemas into conversation. Filter tool discovery to relevant names/descriptions and return compact results from scripts. Batch independent searches; keep dependent edits/checks sequential.

OpenAI recommends small durable guidance and task-triggered skills whose metadata loads first, with detailed instructions/resources loaded as needed. See [Codex customization](https://learn.chatgpt.com/docs/customization/overview), [AGENTS guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md), and [skills](https://learn.chatgpt.com/docs/build-skills). Local skills referenced below are personal installations and may be unavailable to another developer; the repo's workflow must still work using its Markdown and shell tools.

## Skills already available

| Skill | Use / assessment |
| --- | --- |
| `caveman` | Keep as requested default response style; human-maintained specs use ordinary clear prose |
| `investigate-first` | Unknown/intermittent failures or performance diagnosis; reduces speculative edits |
| `surgical-patch` | Small bug/behavior change at its responsible layer |
| `lean-build` | New feature: reuse existing code and define a concrete stop condition |
| `safe-refactor` | Structural changes that must preserve behavior |
| `migration` | Storage/JSON/schema/dependency transitions requiring compatibility |
| `verify-and-stop` | Validation-only requests without scope expansion |
| `caveman-explore` / `cavecrew` | Optional bounded localization/delegation when a broad search is necessary; orchestration and child contexts still cost tokens |
| `caveman-learn` | Future measurement/report workflow if Caveman telemetry is set up; not evidence that this project currently has cost data |
| `caveman-compress` | Not a default here: invokes another model provider, compresses a named file, and creates an external backup; ordinary small maintained docs need no such step |

Pick one workflow matching the task rather than invoking the whole catalog. The public [Skills directory](https://skills.sh/) was checked; popular framework/design/browser skills do not directly solve code discovery in this plain JavaScript app. Existing local workflows and repo docs already cover the immediate need, so no additional marketplace skill is recommended on popularity alone.

## MCP and browser candidates

| Candidate | Actual capability | Fit and decision |
| --- | --- | --- |
| [Serena](https://github.com/oraios/serena) | Language-server-backed symbol overview, definitions/references, retrieval and editing; supports JavaScript | Installed and verified via stdio MCP; project default for discovery. Six tools exposed in a single-project read-only context. Corpus/generated/dependency paths excluded. Main JS/.mjs indexed; Java/Python use targeted text search. Browser globals/dynamic wiring still need text checks. Normal Codex tool discovery needs a new chat/reconnect |
| [Context7](https://github.com/upstash/context7) | `resolve-library-id` and `query-docs` for current library documentation | Useful for Capacitor or dependency migrations; it does not index this app's private/local feature behavior. Use only for such questions; official library docs may suffice |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Persistent browser automation through structured page state | Useful for UI diagnosis, not general code discovery. Existing browser/computer tools may suffice. Microsoft explicitly recommends considering CLI + skills for coding-agent token efficiency; rich trees/tool schemas can cost more context |
| Generic filesystem/Git MCP | File and repository actions | Existing shell/file tools already provide these capabilities; adding an overlapping server has no established benefit here |
| Memory/vector/search service | Indexed retrieval of prior context | Consider only after local specs and symbol retrieval demonstrably fail; duplicate/stale memory and indexing overhead need justification |

MCP capabilities and tool output can reduce or increase context use depending on retrieval quality, schema size, result bounds, and client discovery. No fixed savings percentage is defensible without measuring this checkout. Vendor claims are not benchmark results for this project.

## How to measure Serena's benefit

Use the same three representative tasks before and after: locate a form bug, trace a practice/history change, and locate a morphology regression. Record model/effort, correctness, task time, input/output/cache tokens if exposed, tool calls, and source/result volume. Include server setup/indexing and doc maintenance time. Keep the tool only if it improves repeated work without hiding references or increasing failures. A single successful query or fewer visible words is insufficient evidence of overall savings.

Installation verification establishes a functioning MCP connection, not measured cost reduction. It does not change the user's chosen model.
