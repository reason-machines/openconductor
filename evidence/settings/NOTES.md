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

Historical implementation note, not a user-owned design decision or parity proof: the
original rebuild exposed only Branch name prefix and slugified custom prefixes, so
`myname-` became `myname/tokyo`. The focused [custom-prefix fix](custom-prefix/README.md)
preserves the custom delimiter in the frontend resolver and Rust branch helper. Settings
storage and validation are unchanged. Native event delivery and visual parity remain unverified.

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
  on) and Archive on merge are stored and resolve per repository. The full archive
  (`archive_workspace`, see `evidence/archive/NOTES.md`) reads Delete branch on archive per
  workspace while the worktree still exists and deletes the branch with `git branch -D`,
  never the repository's default branch.

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

OpenConductor's Default models page (`src/settings/DefaultModelsPage.tsx`) now follows that
layout: the Loadout (five slots, slot 1 the default model, palette columns per agent, stored in
`conductor.db` `favorite_models`), Codex personality, Claude output style, Review model and
Default to plan mode in new chats, with Conductor's model labels (`lv`). Differences and the
built-app comparison: [agents-screens/README.md](agents-screens/README.md).

## Agents

Conductor's Agents page is the `providers` route (`jWt` nav, see "Settings pages"). Its
copy (`evidence/frontend/copy-catalog.json`) offers: Anthropic API key or auth token with a
base URL override; Amazon Bedrock (region, named AWS profile, Bedrock API key); Google
Vertex AI (GCP project, service account file); Microsoft Foundry; a custom provider; Codex
via ChatGPT, an OpenAI API key (base URL, organization, project), OpenRouter or Vercel AI
Gateway; a Cursor API key; OpenCode. Its only registry row on this tab is
`chrome_mode_enabled` ("Use Claude Code with Chrome"); the provider forms are registered
through another call shape the registry regex does not catch.

OpenConductor's Agents page (`src/settings/AgentsPage.tsx`) now follows Conductor's tabbed page
(Claude Code, Codex, Cursor, OpenCode; Authentication cards, status line with Refresh, login
terminal or API key field), built on `connect_provider` / `disconnect_provider` /
`provider_status` plus `cli_login_status` for the CLIs' own login. Keys stay write-only. Rows,
sources, the built-app comparison and the remaining differences:
[agents-screens/README.md](agents-screens/README.md).

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
  repo Misc shows the root path and the workspaces path (no icon or Remove repository yet).
  Advanced has the root directory row (`advanced:conductor-root`) and Scrollback limit.
- Settings search (`vUi` keywords per tab) is not built.

## Models and providers (settings.toml.models, settings.toml.providers)

Sources, read on `sven m5 max` on 2026-11-05 with REA's extracted frontend
(`~/code/conductor-rea-work/frontend/dist/assets`, `index-BGEQ8YjU.js`, `renderApp-D_fmY7hW.js`),
`main_strings.txt` (strings of the Conductor binary) and the agent CLIs Conductor bundles in
`~/Library/Application Support/com.conductor.app/agent-binaries` (Claude Code 2.1.284, Codex 0.156.1).
Key names, defaults and enums only; no user values were read.

- Setting key to file key table (`index`, `oZ`): `default_model` -> `models.default`,
  `review_model` -> `models.review`, `default_fast_mode` / `review_fast_mode` / `default_plan_mode`
  -> `models.*`, `default_codex_thinking_level` / `review_codex_thinking_level` ->
  `models.codex.{default,review}_thinking_level`, `default_codex_personality` ->
  `models.codex.personality`, `default_claude_personality` -> `models.claude_code.personality`,
  `default_claude_effort_level` / `review_claude_effort_level` ->
  `models.claude_code.{default,review}_effort_level`, `codex_tool_approval_policy` ->
  `models.codex.tool_approval_policy`, `visible_provider_models` -> `models.visible_provider_models`,
  `claude_executable_path` -> `claude_code_executable_path`, and `codex_executable_path`,
  `opencode_executable_path`, `claude_provider`, `codex_provider`, `bedrock_region`,
  `vertex_project_id`, `ssh_key_path`, `tool_approvals_enabled` under their own names at top level.
  Every `models.*` key except `models.visible_provider_models` has `workspaceConfigurable: false`,
  as has `tool_approvals_enabled`; the provider, executable, region, project and SSH keys default to
  workspace configurable. OpenConductor's `settings::layers::REPO_KEYS` is that list.
- Defaults and enums (`wN` registry): `default_fast_mode` false, `tool_approvals_enabled` false,
  `codex_tool_approval_policy` `default` (`default`, `always_approve`), `default_claude_personality`
  `default` (`default`, `proactive`, `concise`, `explanatory`, `learning`); the session schema's
  Codex personality is `none`, `friendly`, `pragmatic` and its thinking levels `none`, `low`,
  `medium`, `high`, `xhigh`, `max`, `ultra`. The others have no default.
- `claude_provider` (renderApp providers page): `custom` when the user picks API key, `default`
  for the CLI login; a binary migration rewrites the removed `openai` to `default`. `codex_provider`:
  `custom`, `chatgpt_sign_in`, anything else normalised to `default` (`TBe`).
- Launch (`Ohe` in index): reads `claude_executable_path`, `claude_provider`, `codex_executable_path`,
  `codex_provider` for the workspace (`getSettingForWorkspace`, else repo, else user), passes a path
  only for a local host and only when set, and strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`
  (Codex: `CODEX_API_KEY`, `AI_GATEWAY_API_KEY`, `OPENAI_BASE_URL`) unless the provider is `custom`.
  OpenCode runs as `<opencode_executable_path or opencode> acp`. Blank paths count as unset (`qx`).
- `bedrock_region` and `vertex_project_id` are registered and file-backed but no 0.87.6 code reads
  them (3 hits each in index, all registry); Bedrock and Vertex are chosen with
  `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` environment variables. A binary migration
  turned the old `vertex_project_id` into `CLAUDE_CODE_USE_VERTEX=true` plus
  `ANTHROPIC_VERTEX_PROJECT_ID`.
- `tool_approvals_enabled`: chats require approval when it or the account's
  `requiresToolApprovals` is set; the Big terminal presets switch from
  `claude --dangerously-skip-permissions` to `claude` (`GN` / `kBe`). `codex_tool_approval_policy =
  always_approve` answers every Codex tool approval with `always_allow`.
- `ultracode` as a Claude effort, from definition to argv (Conductor 0.87.6, read 2026-11-05 on
  sven m5 max; scans in `out/settings/ultracode.txt`, `ultracode-launch.txt`, `runtime-effort.txt`
  in the REA work folder):
  1. Defined: `Wv = ["low","medium","high","xhigh","max","ultracode"]` with label `Ultracode` and
     description "Ultracode runs at extra-high effort with dynamic workflow orchestration."
     (`index-BGEQ8YjU.js` @294871); `agentParams.effortLevel` for Claude is `KXe`, the same six
     (@1079353). The session config's `thinkingLevel` enum has no `ultracode` (`pE` @143413), only
     `none`..`ultra` plus a separate `ultracode: boolean`.
  2. Frontend session config: `roe(t) { return t==="ultracode" ? "xhigh" : t }` and
     `fit(t)` = `agentParams.effortLevel==="ultracode" ? true : undefined`; `Gd` builds
     `thinkingLevel: roe(...)`, `ultracode: thinkingLevel==="ultracode" ? true : undefined`
     (@1375824, @1377977). `ioe` maps `xhigh` + `ultracode` back to `ultracode` for display.
  3. Sidecar, `Contents/Resources/bin/.internal/conductor-runtime` (Bun-compiled Mach-O, 76 MB,
     sha256 `5723ead4...6eac0d`): `ly7` returns `"xhigh"` for Claude `effortLevel === "ultracode"`
     and `dy7` returns `ultracode: true` (@75245342), the same mapping as `roe` / `fit`.
  4. Sidecar launch builder: the Agent SDK query options are `effort: oB4(B.thinkingLevel)` (`oB4`:
     `none` -> unset, `ultra` -> `max`, else unchanged, so `xhigh` stays `xhigh`) and
     `settings: qB5(B)`, where `qB5` collects `outputStyle`, `fastMode` and `ultracode: true`
     (@66285521, @66239283). The SDK's argv builder pushes `--effort <options.effort>` (@66167585)
     and puts `settings` (JSON-serialized by `B8` when it is an object, @65501644) into its
     extra-args map, which becomes `--settings <json>` (`ve6`, @65477838).
  5. Claude Code's settings schema, embedded in the same binary, documents `ultracode`: "Enable
     ultracode for the session: standing dynamic-workflow orchestration at any effort level.
     Session-scoped, typically provided via --settings or the apply_flag_settings control
     request" (@65371553).
  So a Conductor `ultracode` chat runs `claude --effort xhigh --settings '{"ultracode":true,...}'`.
  OpenConductor's `claude_launch` does the same: `EffortLevel::cli_value` gives `xhigh` and
  `ultracode: true` joins `outputStyle` / `fastMode` in `--settings` (test
  `ultracode_parses_round_trips_and_launches_as_xhigh`). Not observed in a running process: no
  `ultracode` chat was started to capture the sidecar's actual argv.
- The sidecar also sends Claude `thinking` (`HB5`: `--thinking adaptive` for adaptive models, else
  `--max-thinking-tokens <budget>`, `--thinking disabled` for `none`) and always
  `permissionMode: "bypassPermissions"`, answering approvals in-process. OpenConductor's launch
  builder passes neither yet; recorded here, not changed in this PR.
- With no `models.review`, a review runs on Conductor's built-in Claude default `opus-5-1m`, not
  `models.default` (evidence/pr/ai-review.md); `settings::launch::REVIEW_FALLBACK_MODEL`.
- `visible_provider_models` is a JSON string, an object keyed by provider (`claude`, `codex`,
  `cursor`, `opencode`, `pi`) of `provider:model` ids; bad JSON or entries are ignored (`hee`).
- Bundled CLIs: `claude --help` lists `--effort <level>` (low, medium, high, xhigh, max) and
  `--settings <file-or-json>`; its strings hold the `outputStyle` and `fastMode` settings and the
  built-in output styles Explanatory, Learning, Proactive and Concise. Codex's strings hold a
  `Personality` enum `friendly`/`pragmatic`, `model_reasoning_effort`, `service_tier` and `fast`.

OpenConductor (`src-tauri/src/settings/model.rs`, `launch.rs`, `layers.rs`):

- Every key above parses from `settings.toml` under Conductor's path, round-trips, and is validated
  (paths single-line; provider, region and project without whitespace; enums exact).
- Provider precedence, highest first: `[providers.<agent>]` (ours), then `claude_provider` /
  `codex_provider`, then the CLI login. A repository or managed layer that sets the top-level key
  replaces a lower `[providers.<agent>]` table. `claude_provider = "custom"` is the Anthropic API
  with the Keychain key; `bedrock` / `vertex` are OpenConductor values that use `bedrock_region` /
  `vertex_project_id` (Vertex region `global`), because Conductor 0.87.6 has no reader for those
  keys. `codex_provider = "custom"` is the OpenAI API; `chatgpt_sign_in` and `default` are Codex's
  login.
- `settings::launch::claude_launch` / `codex_launch` / `opencode_acp_command` build the agent
  command from settings: executable path, provider env, model (`opus-5-5-1m` -> `--model
  claude-opus-5-5[1m]`, Conductor's mapping), `--effort`, `--settings
  {"outputStyle", "fastMode"}`, `--permission-mode plan` for a new chat with plan mode on, else
  `default` with tool approvals on and `bypassPermissions` with them off; Codex `-c model`,
  `model_reasoning_effort` (`max` and `ultra` run as `xhigh`, Codex's top level), `personality`,
  `service_tier="fast"`. `Settings::codex_auto_approval` answers Codex approvals for
  `always_approve`.
- `get_repo_settings` (Tauri) merges user < repo shared (from `origin/<default branch>`) < repo local
  < managed through `oc_scripts::config::load_layers`; repository files set only `REPO_KEYS`.

Consumers still missing: no chat runner calls `claude_launch` / `codex_launch` yet (the
new-workspace dialog's first session is "agent runtime pending"), so the model, effort, output
style, fast and plan mode keys reach a real agent only once it does; nothing in the rebuild uses
`ssh_key_path` (no cloud workspaces). Codex plan mode (Conductor's `collaborationMode: plan` per
turn) is not passed. Not verified against a running agent: apart from `--effort` and `--settings`
(read from Conductor's sidecar above), the CLI option mapping is from the bundled binaries' help
and strings.

### REA gaps hit (models and providers)

- Conductor's sidecar, which turns the session config (`claudePersonality`, `effortLevel`,
  `fastMode`, `personality`) into Claude Agent SDK and Codex options, is not in REA's extracted
  artifacts: `grep -c` of `outputStyle`, `effortLevel`, `fastMode`, `claudePersonality` in
  `main_strings.txt` is 0, and no sidecar JS exists outside `frontend/dist` in the work folder.
  It is the Bun-compiled `Contents/Resources/bin/.internal/conductor-runtime`, whose embedded JS
  REA's app extraction skipped. REA 6.7.0 has no Bun standalone-binary command (`rea --help` has
  `inspect-go-binary` and `inspect-rust-binary`; `analyze-javascript-application` takes only ASAR or
  a directory). REA bug: `rea extract-artifact <conductor-runtime>` fails with
  `integrity_mismatch` ("Regular artifact entry is missing from inventory: slices/arm64"), and
  still fails the same way with `--integrity-policy record-and-continue`, the retry its own
  remediation recommends. The sidecar was read with a bounded Python `mmap` search of the binary
  instead; the `ultracode` / `--effort` / `--settings` chain above comes from there.
- Minified names differ between chunks (`pni`, `hni`, `XA` in renderApp are `XN`, `TBe`, `qx` in
  index); REA's frontend analysis gives no cross-chunk symbol map, so definitions were found by
  grepping each chunk.
- One `devices_exec` call is capped at 60 s: `strings | grep -E '.{0,120}...'` over the 55 MB Claude
  binary timed out twice; dumping strings to `out/cli/` in the background, then fixed-string greps,
  worked.

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
| `git.delete_branch_on_archive` | `archive_workspace` (`evidence/archive/NOTES.md`) | wired, effective per workspace |
| `git.archive_on_merge` | archive on merge | see `evidence/pr/NOTES.md` |
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

## App preferences in the settings table

Source: REA-extracted frontend on `sven m5 max` (`~/code/conductor-rea-work/frontend/dist/assets`,
`index-BGEQ8YjU.js` and `renderApp-D_fmY7hW.js`), read with `grep -lwF` and a context dump of every
occurrence of each key, 2026-11-06. Key names and code only; no values were read from Conductor's
`conductor.db` or `settings.toml`.

Conductor's settings registry (`index-*.js`, `Te`/`Pe`/`yl` declarations and the `oZ` type map) marks
each key file-backed (`Me({fileKey})`, lives in `settings.toml`) or non-file-backed (`Me()`/`xe()`,
lives in the `settings` table). Every key below is non-file-backed, so OpenConductor stores it in
`conductor.db` through `crates/openconductor-db/src/app_settings.rs` and decodes it in
`src-tauri/src/app_prefs/` (typed `get_app_prefs`, `set_app_pref`, `record_open_in`,
`client_instance_id`, `graphite_cli_installed`; no untyped key/value command).

| Key | Default and encoding (REA source) | Consumer in OpenConductor |
| --- | --- | --- |
| `code_theme` | `yl("code_theme", _N, "default")`; `_N` = default, catppuccin-latte, -macchiato, -mocha, dracula, nord, tokyo-night, gruvbox-dark, solarized-dark; labels from `zPt` | Appearance row and diff highlighting built by the diff area (`DiffAppearanceRows.tsx`), stored in `settings.toml` `[appearance]` for now |
| `colored_sidebar_diffs` | `Te(...,!1)`; `"true"`/`"false"`; sidebar row mutes counts unless selected or on (`eea`) | Appearance row and sidebar colors built in `AppearancePage.tsx` / `appearance.ts`, stored in `settings.toml` `[appearance]` for now |
| `file_ligatures_enabled` | unset reads as on (`v5t`: `data ? data==="true" : true`) | Appearance row built by the diff area, stored in `settings.toml` `[appearance]` for now |
| `garry_mode` | `Te(...,!1)`; toggled by `toggleGarryMode` | General row; `Transcript expandToolsByDefault`; ⌃O in `App.tsx` |
| `experimental_show_agent_cost` | `Te(...,!1)`; read as `value==="true"` (or internal users unless `"false"`, `Y$e`) | Experimental row |
| `experimental_tab_freak_mode` | `Te(...,!1)`; limit `iFt` = 10 on, 5 off, counting chats + terminals + browser (`oFt`) | Experimental row; terminal "+" and `startTab` limit |
| `graphite_disabled` | `Te("graphite_disabled")`; disabled only when `"true"` (`ZUt`, `D9t`); row checked = gt installed && !disabled, reset writes `true` | Experimental row with "Install gt to enable." |
| `default_open_in`, `open_in_mru_order` | MRU is a JSON string array of `app|local` / `app|remote`, newest first (`qzt`, `Hzt`, `UBe`, `HBe`); effective default = MRU[0] without suffix, else `default_open_in` (`l5t`) | `record_open_in` command |
| `left_panel_visible`, `right_panel_visible` | unset reads as shown (`h5t`, `d5t`); written as `t.toString()`; zen mode sets both to `!left && !right` | `App.tsx` sidebar (`panelPrefs.tsx`), `WorkspaceView` right panel, ⌥⌘B, ⌘. |
| `left_panel_width` | `parseInt`, default 256 (`mBe`); written `Math.round(w)`; drag range 192 to 480 (`Zsa`, `eoa`), saved on commit | `.app` `--sidebar-width` and a drag handle |
| `onboarding_step`, `first_time_onboarding_step` | `parseInt(?? "0")`, `parseInt(?? "1")`; 999 = done (`_5t`) | stored and exposed only |
| `last_clone_directory` | plain path, deleted when the data folder moves | clone and quick-start dialogs (`backend.ts`), localStorage value moved over once |
| `last_seen_announcement` | announcement id; banner hidden when it equals the latest id (`Ena`) | stored and exposed only |
| `client_instance_id` | `crypto.randomUUID()` stored on first read (`uue`) | `client_instance_id` command |
| `roundhouse_client_user_id` | cloud sign-in user id; get/update/delete (`sWe`, `nWe`, `rWe`) | stored and exposed only |

Missing consumers: the rebuild has no cloud workspaces (agent cost, Roundhouse), no "Open in" menu
(MRU is recorded by `record_open_in` but nothing calls it yet), no onboarding, no announcements banner,
no Graphite stack UI (only the toggle and the `gt` check), and no syntax highlighter, so a code theme
sets only the code view's foreground and background, not token colors. The sidebar flag in localStorage
(`UiPrefs.sidebarVisible`) is not migrated: the table cannot tell "unset" from "shown".

### Composer send settings (`message_send_key`, `default_message_send_mode`)

Source: plain byte-offset reads of `renderApp-D_fmY7hW.js` and `index-BGEQ8YjU.js` on `sven m5 max`
(Conductor 0.87.6, 2026-11-06; `rea search` on the bundle has no JavaScript provider, logged in
`../rea/rea-invocations.tsv` rows `composer_send_*`). Both keys are non-file-backed rows of `conductor.db`'s
`settings` table: `message_send_key` is a typed app preference (`src-tauri/src/app_prefs`),
`default_message_send_mode` a table pref overlaid on the General section (`src-tauri/src/settings/table_prefs.rs`,
`src/settings/prefs.ts`).

| Row (tab General) | Conductor | OpenConductor |
| --- | --- | --- |
| "Send messages with" / "Choose which key combination sends messages" | Options `enter` "Enter", `cmd-enter` "⌘ Enter"; shows "Custom" when the four send commands match neither preset (`CQt`); detail "Use <new-line key> for new lines"; reset goes to Enter. Choosing writes the preset to `chat.newLine`, `chat.submitMessage`, `chat.submitOppositeFollowUp`, `chat.question.submit` in `keybinding_overrides_v1`, then the legacy `message_send_key` (`RQt`). At startup a legacy `cmd-enter` fills each send command that has no override with the ⌘ Enter preset (`HUt`). | `SendKeyRow` on the General page; `composerSettings.chooseSendKey`, `overrides.sendKeyPresetUpdates`, `overrides.migrateLegacySendKey` (run by `main.tsx` before the keybindings load). The composer reads the overrides live, so the change applies at once. |
| "Follow-up behavior" / "Queue messages to send after the agent finishes, or steer the agent mid-turn." | Options `queued` "Queue", `steering` "Steer"; reads `queued` only for that exact value, otherwise `steering` (`qQt`); detail "Use <opposite key> to queue" (or "to steer"). Hidden while the feature-flag setting `queue_messages_disabled` is `"true"` (`P5t`). | Same row and detail on the General page; the `default_message_send_mode` table pref, read live by `useFollowUpMode` (the row announces saves with `SETTINGS_CHANGED`) and passed by the chat view to the one `Composer` that serves Reason, Codex and Claude Code chats. Divergence: always shown, the rebuild has no feature flags. |

### REA gaps (app preferences slice)

- `grep -l` with a quoted-key regex through `devices_exec` (zsh, nested quotes) matched nothing; plain
  `grep -lwF` worked. Not an REA bug, but REA has no "find setting key" query over the extracted bundle,
  so every claim above comes from text search plus reading minified code, not from an REA trace.
- Minified exports: hooks are re-exported under two-letter aliases (`p5t as og`, imported as `oEr`), which
  REA's JavaScript semantic analysis does not resolve across chunks; we followed them by hand.

### Appearance keys in the settings table

Conductor stores these six keys in `conductor.db`'s `settings` table, not in `settings.toml`. REA source:
the REA-extracted `index-BGEQ8YjU.js` and `renderApp-D_fmY7hW.js` on `sven m5 max`, key names and code
only.

| Key | Registry declaration (no `fileKey` = settings table) | Reader hook | Setter (`updateSetting` -> `INSERT OR REPLACE INTO settings`) |
| --- | --- | --- | --- |
| `zoom_level_v2` | `Pe("zoom_level_v2")`, `zoom_level_v2:Me()` | `C5t`: `parseFloat(data)`, else 1 | `m6t`: `t.toString()` |
| `mono_font` | `Pe("mono_font")`, `mono_font:Me()` | `m5t`: `data ?? "Geist Mono"` | `Xzt` (debounced) |
| `low_contrast_dark_mode` | `Te("low_contrast_dark_mode",!1)`, `xe()` | `us(...)` | `L6t`: `t.toString()` |
| `code_theme` | `yl("code_theme",_N,"default")`, `_l(_N)` | `us(...)`, `Dgi` | `F6t` |
| `colored_sidebar_diffs` | `Te("colored_sidebar_diffs",!1)`, `xe()` | `us(...)` in the sidebar row | `D6t`: `t.toString()` |
| `file_ligatures_enabled` | `Te("file_ligatures_enabled")`, `xe()` | `v5t`: unset = on | `Jzt`: `t.toString()` |

File-backed keys use `Me({fileKey: ...})` / `xe({fileKey: ...})` instead (for example
`default_model: Me({fileKey:"models.default"})`), and only those go through the file writer `NN`.

OpenConductor follows this through `src-tauri/src/settings/db_backed.rs`. The settings service overlays
the table's values on `get_settings`, writes changed values to the table on save (an empty font deletes
the row), and leaves these keys out of `settings.toml`. At startup, values an older build wrote to
`[appearance]` move into the table. A row the table already has wins. Then the keys are dropped from
the file. The frontend still sees them as `settings.appearance.*`, so the Appearance page, the diff
viewer and the sidebar are unchanged. `terminal_font_family`, `terminal_font_size` and `color_vision`
now follow that same table route. Their key-specific readers, setters, reachable Appearance rows,
non-file-backed classification and exclusion from secure storage are recorded in
[Terminal Appearance persistence](terminal-appearance-persistence.md). The legacy TOML upgrade is
OpenConductor compatibility policy, not an observed Conductor migration.
