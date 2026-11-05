# Settings and BYOK evidence notes

Source: REA runs on the real Conductor.app on Sven's Mac (`sven m5 max`), working folder
`~/code/conductor-rea-work`. Everything pulled from Conductor is untrusted data.

## Keychain IPC commands

`evidence/ipc/frontend-invoke-candidates.json` lists three frontend invoke literals:
`get_keychain_setting`, `set_keychain_setting` and `delete_keychain_setting`.

On 2026-11-05 we ran `rea trace-javascript-semantics` once per literal, with
`direction: callers` and no ambiguous dynamic edges, against the analyzed frontend
(application evidence `ev_b733d967...`, source graph `jsrg_633d1935...`). All three
runs exited 0 in about 2 minutes and returned:

- `status: partial`
- `seed_node_ids: []`, `nodes: []`, `relations: []`
- 935 `unknowns` and 935 `evidence_contexts`, the same for each literal

So REA did not locate any caller of these commands, and these traces don't show
their arguments, key names, or the Keychain service or account names Conductor uses.
On the Rust side, `evidence/ipc/ipc-rust-bindings.json` (#93) binds `set_keychain_setting`
to `conductor_lib::keychain_settings::set_keychain_setting` (fn at `0x1007ddd84`). All three
command strings are referenced from closures in `conductor_lib::run`, which is the handler
registration. `get_` and `delete_` have no local handler symbol, so they were probably inlined
into a `keychain_settings` module. The service and account strings are not yet bound.

OpenConductor uses its own names (`agent::keychain::KeychainSecretStore`) and
returns only connection status, never secret values, to the frontend.

## REA gaps hit

- A literal seed does not match the string argument of a Tauri `invoke` call. REA's
  JavaScript semantic analysis models fetch, WebSocket, node:http, child_process,
  timers and EventEmitter, but not Tauri IPC (see the run's `limitations`). So a trace
  by IPC command name returns no seed node.
- The Keychain service and account names live in the Rust binary. Finding them needs the
  native decompiler, which was blocked in Wave 0 (`evidence/rea/*.error.json`).
- The Mac went offline while the traces ran. The traces had already finished and their
  outputs were intact, so we didn't rerun anything.

## Settings pages

Source: `evidence/settings/settings-registry.json`, pulled on 2026-11-05 from Conductor's
frontend bundle (`renderApp-D_fmY7hW.js`, sha256 in the file) inside the REA-extracted Tauri
assets on `sven m5 max`. Conductor registers every settings row in one registry with `tab`,
`settingKey`, `scopes`, `title` and `description`; the file lists the rows a regex over those
registrations found.

- Navigation (`jWt` in the bundle): Personal = General, Account, Appearance, Default models
  (`models`), Git, Ports; Agents & environment = Agents (`providers`), Environment;
  Repositories = Scripts, Actions, Misc; More = Experimental, Advanced.
- So the "Agents" page is the `providers` route, and Theme lives on Appearance, not General.
  Our Theme row moved to Appearance with that page; it is still stored as `general.theme`.
- Git, user scope: Git identity (cloud only), Open pull requests in (GitHub, Linear,
  Graphite), Branch name prefix, Rename workspace when branch is named, Delete branch on
  archive, Archive on merge, Automerge, Treat optional checks as blocking, Set upstream on
  plain git push, Use GitHub stacked PRs.
- Branch name prefix: radios "GitHub username" (with ` (<login>)` when known), "Custom" and
  "None". Custom shows an input with placeholder `e.g. feature/ or myname-`, saves on blur
  and shows `Preview: <prefix>tokyo`.

OpenConductor's Git page shows only Branch name prefix, the one Git row whose setting our
code reads (`src/workspace/naming.ts`). Divergences: Conductor joins the custom prefix to the
name as a raw string (`myname-tokyo`); our naming slugifies each `/` part and joins with `/`,
so a trailing `/` is dropped on save and the preview comes from our real resolver.

### Git flags: archive and push upstream

Source: the same REA-extracted assets, `index-BGEQ8YjU.js` (settings defaults and the
workspace-creation service) and `renderApp-D_fmY7hW.js` (the rows).

- Defaults in the settings table: `delete_branch_on_archive` false, `archive_on_merge`
  unset (the row reads it as false), `worktree_push_auto_setup_remote` unset and treated as
  on (the row defaults to `true`; repo scope is on unless the value is `"false"`). All three
  are user and workspace (repo-local) scoped; the rebuild stores the user values under
  `[git]` in `settings.toml`.
- Push upstream, run on each new workspace unless the setting is `false`: if
  `git config --worktree --get push.autoSetupRemote` already has a value, nothing changes.
  Otherwise, when shared config sets `core.worktree` or `core.bare = true`, it writes
  nothing and warns ("Couldn't configure Git push upstream settings. PR info may be less
  reliable until this branch has an upstream.") unless `push.autoSetupRemote` is already
  true. Else it runs `git config extensions.worktreeConfig true` in the main repository and
  `git config --worktree push.autoSetupRemote true` in the new worktree; a failure gives
  the same warning and the workspace is still created.
- The rebuild does the same in `workspace::git::configure_push_upstream`, called by
  `create_workspace` when `git.worktree_push_auto_setup_remote` is on, and returns the
  warning as `upstreamWarning` on the created workspace. The Git page shows the "Set
  upstream on plain git push" row.
- Conductor passes the warning up as the create step's `auxiliaryFailureMessage` (joined
  with other non-fatal issues, such as a failed `.worktreeinclude` copy, by a space) and shows
  it with `notifications.workspaceError({ message, localWorkspaceId, duration: Infinity })`,
  an error toast that stays until dismissed, with a "View logs" action when the create step
  wrote an initialization log (`index-BGEQ8YjU.js`, sha256 `b5b01f33…dbf3`). The rebuild's
  Create-workspace dialog shows `upstreamWarning` as a sticky error toast the same way. Not
  built: the "View logs" action (we write no initialization log).
- Startup backfill: once per app run, after the first workspace list load
  (`configureGitPushAutoSetupRemoteForLoadedWorkspaces`, guarded by
  `hasBackfilledGitPushAutoSetupRemote`), Conductor's `zYe` walks every loaded workspace
  and skips archived ones, ones with no path, remote hosts and folders that no longer exist.
  For each workspace whose setting is not `false` (`lre`, workspace-scoped), `RYe` applies
  the same steps as creation only when `git config --worktree --get push.autoSetupRemote`
  has no value. Nothing is shown: `cre` logs its skip warning and `zYe` logs thrown errors
  ("Failed to configure Git push upstream settings for workspace <id>: ...").
- The rebuild runs `WorkspaceService::configure_push_upstream_for_existing` on a background
  thread from app setup. It covers every active workspace of every registered repository,
  skips archived and missing ones and repositories that can no longer be listed, and logs
  each workspace it could not configure to stderr. Each workspace uses its effective value
  (user, repository, workspace and local settings files, see "Prompts, git flags and
  environment"), as `lre` does; unreadable settings count as on, Conductor's "not false".
- Delete branch on archive (with "Warning: archived workspaces will be unrecoverable" when
  on) and Archive on merge are stored and resolve per repository, but nothing consumes them
  yet: the app's archive only marks the database row (`db_archive_workspace`) and keeps the
  worktree, and no in-app merge archives.

## REA gaps hit (settings pages)

- `rea trace-javascript-semantics` with a literal seed `"Branch name prefix"` (a UI string in
  a settings-row registration) exited 0 in 33 s with `status: partial`, 0 seed nodes, 0 nodes
  and the same 935 unknowns as the keychain traces. So literal seeds miss plain UI strings
  too, not only Tauri `invoke` names; REA could not place the row in its module. The registry
  above was read from the shipped bundle instead.
- REA has no extractor for app-defined registries such as this settings-row table; the copy
  catalog gives the strings alphabetically with no page, key or scope.

## Default models

Source: Conductor's `renderApp-D_fmY7hW.js` (same bundle as above), read on `sven m5 max`
on 2026-11-05.

- Rows on the `models` tab: Default model ("Model for new chats"; rendered as a "Loadout"
  model picker with effort and fast mode per model), Codex personality, Claude output style
  ("Choose which output style to apply to new chats. Existing chats do not change."), Review
  model, and Default to plan mode in new chats.
- Model catalog per agent (the bundle's `ZHe` table), in Conductor's order:
  - claude: fable-5-1, fable-5, opus-5-5-1m, opus-5-1m, opus-4-8-1m, opus-4-8, opus-4-7-1m,
    opus-4-7, opus-4-6-1m, sonnet-5-5-1m, sonnet-5-1m, sonnet-4-6-1m, sonnet-4-6, haiku-4-5
  - codex: gpt-5.5, gpt-5.4, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.3-codex-spark,
    gpt-5.3-codex, gpt-5.2-codex, gpt-6-astra, gpt-6-sol, gpt-6-luna, gpt-daybreak-blue-latest
  - cursor: auto, composer-2.5, grok-4.7, grok-4.6, grok-4.5
  - accepted Claude aliases: opus-1m, opus, sonnet, haiku
- Fallback model per agent: claude opus-5-1m, codex gpt-5.6-sol, cursor composer-2.5.
- Effort levels per agent: claude low..max; codex none, low..max, ultra; cursor low..xhigh.

OpenConductor's Default models page shows only Default model, as a plain select grouped by
agent, because the only reader is the new-workspace dialog's first chat
(`src/settings/models.ts` `newChatModel`). No agent launch consumes it yet (the dialog's
first session is "agent runtime pending"). Divergences: no loadout picker, no per-model
effort or fast mode; display names are derived from ids (`opus-5-5-1m` is "Opus 5.5 (1M)")
because the bundle holds no labels for them; our stored default stays `opus` (a Conductor
alias) rather than Conductor's `opus-5-1m` fallback. Not built: Codex personality, Claude
output style, Review model, Default to plan mode.

## Agents

Conductor's Agents page is the `providers` route (`jWt` nav, see "Settings pages"). Its
copy (`evidence/frontend/copy-catalog.json`) offers: Anthropic API key or auth token with a
base URL override; Amazon Bedrock (region, named AWS profile, Bedrock API key); Google
Vertex AI (GCP project, service account file); Microsoft Foundry; a custom provider; Codex
via ChatGPT, an OpenAI API key (base URL, organization, project), OpenRouter or Vercel AI
Gateway; a Cursor API key; OpenCode. Its only registry row on this tab is
`chrome_mode_enabled` ("Use Claude Code with Chrome"); the provider forms are registered
through another call shape the registry regex does not catch.

OpenConductor's Agents page (`src/settings/AgentsPage.tsx`) shows one card per agent
(Claude Code, Codex, Cursor, OpenCode) with a provider picker, that provider's options and
its key fields, built on `connect_provider` / `disconnect_provider` / `provider_status`.
Keys are write-only: a stored key shows only as stored, and leaving its field blank keeps
it. Divergences and gaps:

- Conductor's key commands return key values to its frontend (Reveal API key); ours never
  do, so there is no Reveal.
- Not built: "Use Claude Code with Chrome", the custom provider, per-provider model
  overrides (stored ones are kept on save), Conductor's provider search, and validating a
  key against the backend ("Could not validate this API key.").
- The Reason agent is ours, not Conductor's, and has nothing to configure, so it has no card.
- Layout is not compared against Conductor: no screenshot of its providers page exists
  (native capture blocked, `evidence/providers/README.md`).

## Appearance page

Source: the same `renderApp-D_fmY7hW.js` bundle and `evidence/frontend/css-tokens.json`.
Conductor's Appearance rows (registry order): Colored sidebar diffs, Code ligatures, Theme,
Low-contrast dark mode, App zoom, Accessible colors, Code theme, Mono Font, Markdown Style,
Terminal font. Values read from the bundle:

- App zoom (`zoom_level_v2`): a select of 50% to 300% in 10% steps (`lOt=50`, `WBi=300`,
  `nYe=10`), stored as a fraction (`dsi(e/100)`), default 1. `view.zoomIn` / `view.zoomOut`
  step it by 10% and clamp (`xZn`); its help text names those shortcuts.
- Low-contrast dark mode (`low_contrast_dark_mode`): toggles class `low-contrast-dark` on
  the root; the tokens are `html.dark.low-contrast-dark` in css-tokens.json.
- Mono Font (`mono_font`): `["Geist Mono","iA Writer Mono"]` plus "Custom..." with an input
  ("Enter font name...", "Enter font name exactly as installed on your system") and a
  three-line preview. Conductor bundles Geist Mono and defaults to it.

OpenConductor's Appearance page (`src/settings/AppearancePage.tsx`) has Theme, Low-contrast
dark mode, App zoom and Mono Font, stored under `[appearance]` with Conductor's key names
(Conductor keeps them in its settings table, not settings.toml). ⌘+ / ⌘− / ⌘0 change the
zoom anywhere in the app. Divergences and gaps:

- Zoom is CSS `zoom` on the document, not the webview's zoom.
- No font is bundled, so the default is "System default" (the built-in mono stack), and
  Geist Mono / iA Writer Mono apply only when installed. Font names that could end a CSS
  string (quotes, `\`, `;`, braces, `<>`) are refused, in the UI and in `validate`.
- The App zoom help text does not name the shortcuts, since overrides can change them.
- Not built: Colored sidebar diffs, Code ligatures, Accessible colors, Code theme,
  Markdown Style.
- Terminal font (`terminal_font_family`, `terminal_font_size`) is built by the terminal
  area; see `evidence/terminal/NOTES.md`.

## Settings routes

Source: Conductor 0.87.6 `renderApp-D_fmY7hW.js`, REA-extracted Tauri assets on `sven m5 max`
(`~/code/conductor-rea-work/frontend/dist/assets`), read by the Settings twin Session 6020ca9e on
2026-11-05. Conductor builds the tree with TanStack `Ha({getParentRoute,path})` under `/settings`.

- `/settings` index (`nCa`, search `tab`, `repoId`, `cloudProjectId`, `providerTab`, `scrollTo`):
  `cloudProjectId` opens `/settings/cloud/$cloudProjectId`; `tab=repo-<id>` opens
  `/settings/repos/<id>/misc`; a repo section tab (`environment`, `git`, `scripts`, `actions`,
  `misc`) with `repoId` opens that repo's section, without one the repo-only sections go to
  `/settings/repos?section=<tab>` (`environment` and `git` have user pages); any other tab goes
  through `Jse` (tab to path), unknown tabs to General. All redirects replace history.
- `/settings/user/` opens General. `/settings/repos` opens the repo of the last workspace viewed,
  else the first selectable repo, else General; `/settings/repos/$repoId/` opens `environment`.
- Every `/settings/organization/*` page (`computer`, `environment`, `mcp`, `prompts`,
  `repositories/$owner/$repo{,/git,/scripts}`, plus `github`, `members`, `preferences`,
  `mcp-servers`) is wrapped in `lW`, which redirects to `/settings/user/general` unless the active
  organization is a cloud one; `/settings/cloud/*` needs a personal cloud account (`Jna`). Ports is
  listed only for a cloud org and Internal only for internal builds.
- Navigation (`jWt`, `dti`, `I9a`, `A9a`): Personal [General, Account, Appearance, Default models,
  Git, Ports], Agents & environment [Agents, Environment] followed, for a local org, by a
  Repositories list where the active repo expands to its sections; More [Experimental, Advanced].
- Scope by path (`S9a`): `/settings/repos` is "workspace" and edits
  `<repo>/.conductor/settings.local.toml`; user pages edit `<config dir>/settings.toml`.

OpenConductor (`src/settings/routes.ts`) has the same tree and redirects. Every OpenConductor user
is local, so the organization and cloud routes, Ports and Internal all resolve to General, as
Conductor does for a local user. The URL follows the open page (`history.replaceState`), keeping
unrelated query parameters. On the desktop, repositories arrive from conductor.db after mount, so
a `/settings/repos...` start URL is resolved again once they are loaded. Divergences and gaps:

- Keyboard shortcuts is a normal page here (Conductor: internal builds only); it sits after
  Appearance as in Conductor.
- Account shows only the GitHub CLI login (no Conductor account, billing, Linear or sign out).
- Environment (user and repo) has no rows yet: they come with the settings.toml workspace keys.
- Repo Git shows the base branch and remote read-only (Conductor lets you change both); repo
  Scripts shows the resolved setup, run and archive scripts read-only; repo Actions has Use
  spotlight testing (General preferences, `custom_prompt_general`, comes with the prompts keys);
  repo Misc shows the root path only (no icon, workspaces path or Remove repository yet).
- Settings search (`vUi` keywords per tab) is not built.
## Prompts, git flags and environment

Source: REA-extracted frontend on `sven m5 max` (`~/code/conductor-rea-work/frontend/dist/assets`,
`index-BGEQ8YjU.js` and `renderApp-D_fmY7hW.js`, the bundles hashed in the sections above) and
the sidecar bundle inside `Conductor.app/Contents/Resources/bin/.internal/conductor-runtime`,
read on 2026-11-05 with byte searches (python `re` over the files). Everything quoted is data.

### Setting keys and file keys

Conductor's settings table maps each setting key to a settings.toml path (`Me`/`xe` with
`fileKey`, index offset ~286 k): `custom_prompt_general` → `prompts.general`,
`custom_prompt_code_review` → `prompts.code_review`, `custom_prompt_create_pr` →
`prompts.create_pr`, `custom_prompt_fix_errors` → `prompts.fix_errors`,
`custom_prompt_rename_branch` → `prompts.rename_branch`,
`custom_prompt_resolve_merge_conflicts` → `prompts.resolve_merge_conflicts`,
`branch_prefix_custom` → `git.branch_prefix`, `branch_prefix_type` → `git.branch_prefix_type`,
`delete_branch_on_archive` / `archive_on_merge` / `worktree_push_auto_setup_remote` →
`git.*`, `environment_variable_files` → `environment_variable_files`, and
`open_url_template` → `preview_urls` (`BLe`). None sets `workspaceConfigurable: false`, so
each is valid in user and repository files. `environment_variables` is not a setting key: it
is read straight from the files (see Environment).

The rebuild stored the custom prefix as `git.branch_prefix_custom`. It now writes Conductor's
`git.branch_prefix` and reads `branch_prefix_custom` when a file has no `branch_prefix`
(`settings::model::GitFile`, and the same alias in `oc_scripts::config::effective`). One
trailing `/` is now accepted in the prefix: Conductor's own placeholder is `e.g. feature/ or
myname-`, and such a file used to fail validation.

### Layers and precedence

`getSettingForWorkspaceV2(key, {host, mainWorktreePath, selectedWorkspacePath})` resolves a
key through the layers `TZ` builds (index offset ~320 k), lowest first: user
`~/.conductor/settings.toml` (source root = home), repository shared
`<main>/.conductor/settings.{json,toml}`, workspace shared
`<workspace>/.conductor/settings.{json,toml}` (only when the workspace is not the main
checkout), repository local `<main>/.conductor/settings.local.{json,toml}`; the managed file
(`settings.managed`, `h$e`) is merged on top. Every JSON file is read before every TOML file
(`for (const n of ["json","toml"]) for (const r of layers)`). A value replaces a lower one;
values that fail the key's schema are dropped per file (`zE` → `droppedSettings`), so the next
lower valid value wins. Edits from the settings rows go to the repository local file
(`{scope:"workspace-template", locality:"local"}`); writing the shared file is refused
("Shared repository settings are read-only in Conductor. Edit the settings file directly.").

The rebuild resolves these keys in `oc_scripts::config::effective` (`load_effective`) with
the same layer list and drop rule. Its user layer is the app's own
`$OPENCONDUCTOR_HOME/settings.toml` (`settings::effective::paths`), and repository shared
files are read from the working tree, as `TZ` does. Edits go through
`set_local_value` (IPC `repo_settings_set_local`), which accepts only these keys and prunes
tables a removal empties, like Conductor's `tZ`.

### Prompts

- Each action reads the effective workspace value (`tPt` → `getSettingForWorkspaceV2`), so a
  repository value replaces the user's; they are not appended. Cloud workspaces instead read
  the organization's shared and personal prompts from the server (`bg` → `GV`), which is the
  `/settings/organization/prompts` page ("Applied to your chats in this organization,
  alongside shared prompts.").
- Where each one goes (`wg` prompt builders, index offset ~2.49 M): code review `gue`,
  create PR `hue`, fix errors `mue` ("Fix the failing CI actions. I've attached the failure
  logs."), resolve conflicts `vue` (after the forge's rebase/merge instruction), branch rename
  `fue` (the model prompt that names the branch from the first message). Each appends `_g`:
  a blank value adds nothing; otherwise a block saying the user's preferences take precedence
  over the defaults, then `<user-preferences>` … `</user-preferences>`.
- `general` is not a system prompt: for the first message of a new chat the app sends
  `firstMessage.generalPreferences` and the runtime (`conductor-runtime`, `nQ4` / `lU6`)
  appends `\n<user-preferences>\n{general}\n</user-preferences>` to that first message,
  after its own `<system_instruction>` context block.
- UI: repository Settings › Actions has six rows (`S6e` and the General row, scopes
  `["workspace"]`): Code review / Create PR / Fix errors / Resolve conflicts / Branch rename
  preferences, then General preferences ("Add custom instructions sent to the agent at the
  start of every new chat.", placeholder "Add custom instructions for all agents working in
  this repo.", no Preview). Each is a textarea that saves trimmed text on blur, shows a
  "Customized" badge when set, and a "Preview" dialog of the full prompt (`getPromptPreview`).
  There is no user-scope prompts row: user values come from the user file only.
- Migration: `repo_custom_prompt_file_migration_complete` (settings table) guards a one-time
  move of the old `repos.custom_prompt_*` columns into each repository's shared settings file
  (`iIt`/`oIt`), after which the columns are set to NULL. The rebuild never had those columns,
  so there is nothing to migrate; the flag is not used.

### Git flags

`branch_prefix_type` and the custom prefix are read at user scope only (`C2`:
`getSettingForUserV2("branch_prefix_type")`, `getSetting("branch_prefix_custom")` with `//+`
collapsed to `/`), even though repository files may contain them. The three flags resolve
per workspace (`lre` → `getSettingForWorkspaceV2(C0, …) !== false` for push upstream).

### Preview URLs

`preview_urls` is an array of `{ name?, url }` (`sLe`/`nLe`: entries with other keys are
dropped; a string value is parsed as JSON, else taken as one URL). Repository Settings › Misc
row "Preview URLs" edits it: the first URL is the default, others appear in the Open menu, and
`$CONDUCTOR_PORT` / `$((CONDUCTOR_PORT + 1..9))` are expanded.

### Environment

`wLe` / `SLe` / `Px` (index offset ~273 k) build the variables per context (`local`, `cloud`),
layer by layer in the order above:

1. `environment_variable_files` (every layer): an array of paths, or one per line. A path is
   used as is when absolute, `~` and `~/…` expand to home, otherwise it resolves against the
   settings file's folder when that file exists, else against the layer's root (repository
   or home) (`ALe`). Missing files are logged and skipped. Each file is parsed as dotenv
   (`RLe`): blank and `#` lines skipped, optional `export `, `NAME=value` with
   `^[A-Za-z_][A-Za-z0-9_]*$`, double quotes with `\n` `\r` `\t` escapes, single quotes literal,
   unquoted values end at a ` #`. Variables apply to local and cloud.
2. `environment_variables` (repository and workspace layers only, `s.workspace`): top-level
   string entries apply to both contexts, `.local` and `.cloud` to one. `"<none>"` deletes the
   variable from lower layers; `"conductor-keychain"` reads the value from the Keychain
   (`file-env:<scope>:<key>`); non-string values are skipped.
3. Managed `environment_variables.local` / `.cloud` override everything (`getManagedEnvVars`).

Stored variables from the Environment page's own table (`env_vars`) are layered over the
file values unless the file pins the key (`xz`). Consumers (`ng(…, {context:"local"})`): the
setup script's env (offset ~1.01 M), terminals (`{...shellEnv, ...settingsEnv, ...}`, offset
~2.93 M) and agent launches (offset ~2.97 M, which drop `ANTHROPIC_API_KEY` /
`ANTHROPIC_AUTH_TOKEN` unless `claude_provider` is `custom`).

The rebuild implements 1–3 in `oc_scripts::config::effective` (`resolve_effective`,
`parse_dotenv`, `resolve_env_file`). Divergence: `"conductor-keychain"` values are skipped
with a warning (the rebuild has no per-variable Keychain store); the `env_vars` table is not
built.

### Consumers in the rebuild

| Key | Consumer | Status |
| --- | --- | --- |
| `prompts.code_review` | Review button (`buildReviewPrompt`, appended after the default as `gue` + `_g`) | wired, via `useRepoSettings` |
| `prompts.create_pr` | `pr_create_prompt` (appended when the caller gives no instructions) | wired; no Create PR button calls the command yet |
| `prompts.general` | first message of a new Reason chat (`sendReason`, `<user-preferences>` block as `lU6`) | wired |
| `prompts.fix_errors` | Fix errors action | missing: no Fix errors button or CI-log flow |
| `prompts.resolve_merge_conflicts` | Resolve conflicts action | missing: the header computes the conflict state but has no action |
| `prompts.rename_branch` | model-generated branch name | missing: the rebuild names branches with a local heuristic (`branchNameFromMessage`), no model call |
| `git.worktree_push_auto_setup_remote` | `create_workspace` and the startup backfill | wired, effective per repository / workspace |
| `git.branch_prefix`, `git.branch_prefix_type` | Create-workspace naming | user scope, as Conductor's `C2` |
| `git.archive_on_merge`, `git.delete_branch_on_archive` | archive | missing (see "Git flags: archive and push upstream") |
| `preview_urls` | terminal panel Open URLs | missing: the terminal panel has no Open URL control |
| `environment_variable_files`, `environment_variables.*` | setup / run / archive scripts (`ScriptService::set_settings_env`), terminals (`pty_spawn`) | wired; local context |
| same | agent launches | missing: Claude/Codex launches are not built, and Reason runs one ACP process for every chat, so a per-workspace environment cannot reach it |

`create_workspace` resolves the push-upstream flag for the repository root before the
worktree exists, so a value in the new workspace's own `.conductor/settings.toml` is not
seen at creation (Conductor reads it with the new worktree path); the startup backfill does
see it.

### Settings rows

Row components live in `src/settings/rows/` and are mounted by the page owner:
`RepoActionsRows` (repository Actions: Code review, Create PR and General preferences, with
Conductor's titles, descriptions, "Customized" badge and placeholder `vzi`), `RepoGitRows`
(repository Git: Set upstream on plain git push), `RepoEnvironmentRows` (repository
Environment: env files with "N variables loaded", variables per context with their source,
add and remove) and `UserEnvironmentRows` (user Environment: env files). Following this
repository's rule of showing only rows whose setting is read, Fix errors, Resolve conflicts
and Branch rename preferences, Delete branch on archive, Archive on merge and Preview URLs
have no row yet. Not built: the prompt Preview dialog (`getPromptPreview`), Keychain-stored
variable values, and Conductor's per-variable copy button.

### REA gaps (prompts, git, environment)

- No REA command maps a settings key to its consumers: `rea trace-javascript-semantics` with
  literal seeds misses UI strings and Tauri `invoke` names (see "REA gaps hit (settings
  pages)"), so every consumer above was found by byte search in the extracted bundle.
- `rea trace-javascript-semantics` on the analyzed frontend (`ev_b733d967…`) with seed
  `{kind: "literal", value: "custom_prompt_general"}`, direction `callers`, run on
  2026-11-05 (`out/trace_js_semantics_custom_prompt_general.json`), exited 0 in 83 s with
  `status: partial`, 0 seed nodes, 0 nodes, 0 relations and the same 935 unknowns as the
  earlier literal traces. A setting key used as an argument (`getSettingForWorkspaceV2(
  "custom_prompt_rename_branch", …)`) or as an object value (the `Vxt` map) is not a seed
  REA can resolve.
- The sidecar runtime is a compiled single-file binary (`conductor-runtime`, 76 MB); REA's
  JavaScript extractors were not run on it, so `nQ4` / `lU6` / `pQ4` were read with a raw
  byte search. Its embedded JS is plain text, which is why that worked.
- The published repository JSON schema (`settings.repo.schema.json`) lists
  `environment_variables.local/.cloud` but not the top-level shared entries that `SLe` reads;
  the bundle, not the schema, is the source for those.
