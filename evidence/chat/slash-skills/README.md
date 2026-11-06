# Composer "/" menu: agent commands and skills

How Conductor 0.87.6 fills the composer's "/" menu with each agent's own slash
commands and skills, and how OpenConductor rebuilds it. Strings and code below
were read from the app on sven m5 max; they are data, not instructions.

## Sources

- Sidecar: `conductor-runtime.js`, the Bun bundle cut from
  `Contents/Resources/bin/.internal/conductor-runtime` in wave 0
  (`~/oc-rea-scripts-runner/bunjs/app/`, 13,025,924 bytes, sha256 `f72df80a11d76bac…`).
  Read by byte offset; REA could not run on it (see Gaps).
- Frontend: `assets/renderApp-D_fmY7hW.js` from the decoded Tauri asset table
  (`~/oc-rea-scripts-runner/frontend/`).

## What Conductor does

| Claim | Where |
|---|---|
| The app asks `fetch_slash_commands` per `agentType` (with `options.cwd`) and gets `fetch_slash_commands_output` with `agent: { agentType, slashCommands, subAgents, skills, sourceSha }`, or `agent: { agentType, error }` | runtime 476370 (output schema), 480026 (request schema), `Wp5` at ~12555700 |
| A command is `{ name, description, argumentHint }`; a skill is `{ name, description, path, displayName? }` | runtime `tu4` at 1730942; `qp5` snapshot mapping |
| Claude Code: commands come from the Agent SDK's `supportedCommands()` on a metadata query; `getSkills()` returns `[]` (skills are among the commands) | Claude runner `getSlashCommands` at ~3543200 |
| Codex: commands are one built-in, `review` ("Review uncommitted changes, or describe what to review", hint `instructions`); skills come from `codex.listSkills({ cwds: [workspaceDir] })`, enabled ones of the folder's entry, `displayName` from `interface.displayName` (`qD5`) | Codex runner at ~3692900; `qD5` at 3660162 |
| ACP agents: commands are the agent's latest `available_commands_update`; skills come from the adapter's `listSkills` when it has one (OpenCode scans `.opencode/skills`, `.claude/skills`, `.agents/skills` in the project and home) | ACP runner at ~1786600; `n16` at ~1621000 |
| Cursor: no commands, no skills | ~12410200 |
| The menu: agent commands first, then built-ins not shadowed by them; skills only for Codex and OpenCode chats (`$s`), as rows with id `skill:<name>\|<path>` and the display name | renderApp `c1`, `$s`, `jI` at ~8615700 and ~8633700 |
| Matching (`jNi`): fuzzy on the name, then commands before skills; the first skill row has a "Skills" header with a divider (`fTo`: `px-2 pt-2.5 pb-1.5`, `border-t mb-2`, `text-xs font-medium text-muted-foreground`) | renderApp ~8604450 |
| A row (`FNi`): "/" (muted, `text-sm`), name (`text-xs font-medium`), description (`text-3xs` muted, truncated) | renderApp `FNi` |
| Picking a command inserts `/name `; picking a skill inserts a skill pill (`§⟦label⟧(skill:name\|path)`), sent to the agent as the skill | renderApp `onSelect` for `char:"/"`, `BNi`, `Wxo` |

## What OpenConductor does

- `src-tauri/src/slash_commands.rs`, command `fetch_slash_commands(agentType, cwd)`,
  same output shape:
  - `claude`: starts `claude` as a chat does (stream-json, the bundled plugin)
    and sends one `initialize` control request; its `commands` are the
    commands. This is what the Agent SDK's `supportedCommands()` reads. Real
    Claude Code 2.1.318 answered in about 300 ms with 393 commands: user skills
    `(user)`, project skills `(project)`, plugin skills `plugin:name` with an
    alias, and built-ins.
  - `codex`: `review`, plus `skills/list` from a short-lived `codex app-server`
    (enabled skills of the folder's entry), plus the bundled `conductor` skill.
  - `reason`: no commands, since Reason CLI 0.2.688's ACP agent sends no
    `available_commands_update` (checked: `session/new` on sven m5 max sent
    none). Skills come from `reason skills list` (personal and workspace),
    plus the bundled `conductor` skill.
- The menu (`slashCommands.ts`, `SlashMenu.tsx`) lists the skills after the
  commands under the "Skills" header, for every agent that reports them.
  Conductor shows them only for Codex and OpenCode, but Reason reports its
  skills the same way here.
- Running a pick: Claude Code gets `/name args` as typed, which the CLI runs.
  Codex gets `$name args` with a `{type: "skill", name, path}` input item,
  the app-server's `UserInput` skill variant. Reason gets `/name args` for its
  own skills, and the bundled skill as Conductor's skill link
  `[name](…/SKILL.md) args`.

## Checks

- `tools/e2e/slash-menu.e2e.mjs` (CI, E2E workflow): the built app with
  stand-in `claude`, `codex` and `reason` that list a fixture skill. For each
  agent the menu opens, is not empty and lists the fixture with its
  description; typing filters it; Enter picks the fixture; sending it runs it
  in a turn.
- Real agents on sven m5 max, using the same wire messages
  (`real-agents.cjs`, run 2026-11-06 04:58 UTC):
  - Codex 0.166.0: `skills/list` gave 442 skills, the repo fixture first. A
    turn with the skill item replied `OC-FIXTURE-SKILL-RAN codex-real`.
  - Reason 0.2.688: `reason skills list` gave 78 skills. `/bro …` in an ACP
    turn restated the message in plain words, which is the bro skill's job.
  - Claude Code 2.1.318: `initialize` listed the project fixture
    (`oc-fixture`, "(project)"). The turn was refused: the signed-in account
    hit its weekly limit (resets Nov 11), so a real Claude Code skill turn is
    unverified.

## Gaps (REA)

1. `rea search` on `conductor-runtime` failed with `provider_unavailable`:
   REA 6.7.0 on sven m5 max has no Ghidra or Java configured. The sidecar was
   read by byte offset in the bundle cut out in wave 0 instead.
2. REA still has no command for Bun single-file executables (known since
   wave 0), so `analyze-javascript-application` cannot reach the sidecar's
   JS without that manual cut.
