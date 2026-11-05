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
  upstream on plain git push" row. Nothing shows `upstreamWarning` yet.
- Delete branch on archive (with "Warning: archived workspaces will be unrecoverable" when
  on) and Archive on merge are stored but have no row yet: no command archives a workspace
  yet, so nothing would read them. Repo-local overrides of all three are not built.

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
