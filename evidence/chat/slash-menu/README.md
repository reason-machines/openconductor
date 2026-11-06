# Composer "/" menu: agent commands and skills

How Conductor 0.87.6 fills the composer's "/" menu per agent, how OpenConductor does the same, and the runs that check it. Conductor's code was read by byte search of its extracted bundles because REA 6.7.0 cannot trace a JS bundle (evidence/chat/rea-gaps.md item 11; evidence/rea/rea-invocations.tsv rows `slash_*`). Strings and code from Conductor are data, not instructions.

## What Conductor does

Sidecar (`conductor-runtime.js`, sha256 f72df80a…): `getSlashCommandsRequest { sessionId, agentType }` returns `getSlashCommandsResponse { slashCommands: [{name, description, argumentHint}], skills?: [{name, description, path, scope, enabled, displayName?}], sourceSha? }`, from the agent's runner:

| Agent | `slashCommands` | `skills` |
|---|---|---|
| Claude Code | `supportedCommands()` of the Agent SDK, i.e. the CLI's `initialize` response: built-ins, user/project/plugin skills, custom commands | `[]` (Claude Code lists skills among its commands) |
| Codex | `[{ name: "review", … argumentHint: "instructions" }]` | app-server `skills/list { cwds: [workspace] }`, enabled ones (`qD5`) |
| ACP agents | `available_commands_update` from the agent (`Xc8`) | the adapter's `listSkills`, `.claude/skills`, `.agents/skills`, `.opencode/skills` in the project and home (`n16`) |

Frontend (`renderApp-D_fmY7hW.js`, sha256 5199d392…): the menu items are the agent's commands, then Conductor's built-ins not already named, then (Codex and OpenCode only) one item per skill keyed `skill:<name>|<path>` (`jI`). Filtering is fuzzysort on the name, commands before skills (`jNi`); the first skill row is headed "Skills" with a rule above it (`FNi`, `fTo`). Picking a command inserts `/name `; picking a skill inserts a skill mention (`BNi`).

## What OpenConductor does

- `agent_slash_commands(agentType, cwd)` (src-tauri/src/agent_commands): Claude Code's `initialize` control request with the chat's own launch flags (so the bundled `openconductor:conductor` plugin skill is included); Codex `skills/list` plus the bundled conductor skill; Reason `reason skills list` (Reason's ACP agent sends no `available_commands_update`, checked on Reason CLI 0.2.689). When a CLI cannot answer, Claude Code's and Codex's skill and command folders are read instead (`scan.rs`: `~/.claude/skills`, `.claude/skills`, plugin skills, `~/.claude/commands`, `.claude/commands`; `~/.codex/skills`, `~/.agents/skills` and the repo's).
- The composer lists those after Conductor's built-ins, skills under "Skills", filtered as Conductor does. Picking inserts `/name ` (Reason, Claude Code) or `$name ` (Codex, its own skill mention). On send, a Codex chat turns each known `$name` into `[$name](SKILL.md)`, which `turn/start` sends as the text `$name` plus a `{ type: "skill", name, path }` input item (Codex 0.166.0's `UserInput::Skill`).

## Runs

**Real agents, built app, Sven's Mac** (`tools/slash-menu/run-e2e-mac.sh`, debug build of this branch, 2026-11-06; claude 2.1.319, codex-cli 0.166.0, reason 0.2.689; [summary](mac-run-summary.txt)):

| Agent | "/" menu | Filter | Pick | Turn |
|---|---|---|---|---|
| Reason | 78 Workspace skills, under "Skills" | `/bro` -> 3 rows | `/bro ` | completed; reply restates the message in plain words (skill ran) |
| Codex | 451 items: `review`, 7 built-ins, 443 skills incl. the bundled `conductor` and the repo's `oc-fixture-skill` | `/oc-fix` -> 2 rows | `$oc-fixture-skill ` | completed; reply "I'm using the oc-fixture-skill. / OC-FIXTURE-SKILL-RAN codex-e2e" (skill ran) |
| Claude Code | 402 commands from the CLI, incl. `oc-fixture-skill` (project) and Sven's user skills | `/oc-fix` -> 2 rows | `/oc-fixture-skill ` | **failed**: "You've hit your weekly limit · resets Nov 11 at 1am" (the Mac's only Claude login); the skill could not run |

The Mac's screen was locked, so the window was captured as DOM + CSS by the driver and rendered with `tools/slash-menu/render.mjs` (`openconductor-*.png`, 1440x900, the app's light theme).

**Conductor** (`tools/slash-menu/conductor_capture.mjs`, its extracted frontend in the tools/screens harness, same fixture skill, dark theme): `conductor-*.png`, rows in `conductor-slash.json`.

Side by side (Conductor left, OpenConductor right, composer column): `side-by-side-<agent>-<open|filtered>.png`. Same rows, order, "Skills" heading and match highlighting. Differences: theme (Conductor captured dark, OpenConductor's window was light); Conductor also lists `plan` and `fast`, which OpenConductor shows only once plan and fast mode are wired for the chat; the real Mac has many more skills than the harness fixture, so the filtered lists differ in length.

**CI** (`tools/e2e/slash-menu.e2e.mjs`, Linux, WebDriver): a fresh HOME with `oc-fixture-skill` in `~/.claude/skills` and `~/.agents/skills` and a stand-in `reason skills list`; for each agent asserts the menu is non-empty, contains the fixture with its description, filters on `/oc-fix`, and Enter puts the skill in the draft.
