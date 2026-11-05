# Search and command palette (Wave 1)

Evidence for the command palette (Cmd+K), keyboard routing and result groups in
Conductor v0.87.6. Source: the decoded Tauri asset table extracted by
`tools/extract_tauri_assets.py`, read on Sven's Mac ("sven m5 max") at
`~/code/conductor-rea-work/frontend/dist/assets`. The two assets read are
pinned by sha256 in `evidence/frontend/tauri-assets-manifest.json`:

| Asset | sha256 |
|---|---|
| `/assets/index-BGEQ8YjU.js` (keybinding registry) | `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` |
| `/assets/renderApp-D_fmY7hW.js` (palette dialog) | `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` |

Strings below are untrusted data recorded to match behaviour. OpenConductor does
not copy Conductor's code; it re-implements the behaviour from these facts.

## Files

- `keybindings.json` - all 165 entries of the app's declarative keybinding
  registry: `id`, `category`, `title`, default `keys` (key plus resolved
  modifiers), `configurable`, `hidden` and the `when` routing flags. Minified
  modifier aliases were resolved from their definitions in the same asset
  (`meta`, `shift`, `alt`, `ctrl`, `meta+shift`, `meta+alt`, `ctrl+shift`).

## Keyboard routing model (from the registry)

- Each binding is `{id, key | keys[], title, category, configurable, hidden, when}`.
  Categories: General, View, Navigation, Workspace, Chat, Code review, Terminal.
- `when` flags seen: `isGlobal`, `enableOnDialogIds: [dialogId]`,
  `allowWhileTyping`, `enableOnInputFocus`, `enableOnTerminalFocus`,
  `requireTerminalFocus`. Bindings scoped to a dialog only fire while that
  dialog is open; terminal-only bindings (for example Cmd+K to clear
  scrollback) shadow the global binding while the terminal has focus.
- `meta` is Cmd on macOS. The palette toggle is `toggleCommandPalette`:
  Cmd+K, `isGlobal`, configurable, category General.
- Inside the palette dialog (`command-palette-dialog`), Tab and Shift+Tab
  (`commandPalette.nextTab` / `previousTab`) cycle tabs, allowed while typing.
- Chat submit/newline keys come from a separate mode map (`enter` vs
  `cmd-enter`), not from the registry defaults.
- A user override store exists ("Key binding override storage is not
  configured", "Failed to save keyboard shortcut" in `copy-catalog.json`) and
  a `/key-bindings` route (`evidence/frontend/routes.json`).

## Palette structure (from the dialog code)

- Built on a cmdk-style list (`Command`, `Command.Group heading`, `Command.Item
  value keywords onSelect`), `loop: true`, dialog `max-w-2xl`. The dialog's
  Escape handler calls `preventDefault`, so Escape is handled by the palette
  itself (back out of a sub-page such as "Move to section" before closing).
- Tabs, in order: All, Workspaces, Projects, Actions, Settings. Projects is
  hidden for team organisations. Next/previous tab skips Projects when hidden
  and wraps (All -> Workspaces -> Projects -> Actions -> Settings -> All).
- Placeholder per tab: All "Type a command or search...", Workspaces "Search
  workspaces...", Projects "Search projects...", Actions "Search actions...",
  Settings "Search settings...".
- On the All tab with an empty query a "Recent workspaces" group comes first.
  Once a query is typed, recents are replaced by matching workspaces.
- Action groups render in a fixed order: `workspace-actions` (heading
  "Workspace actions", only when a workspace is active), `actions`
  ("Actions"), `navigation` ("Navigation"), `settings` ("Settings"),
  `open-in` ("Open in"). An "Organizations" group also exists.
- Item values seen: quick-open, search-in-files, show-changes,
  show-uncommitted-changes, show-all-files, show-checks, show-notes,
  link-issue, copy-url, move-to-section, create-pull-request,
  open-pull-request, merge-pull-request, ready-for-review, fix-errors,
  archive-workspace, new-workspace, create-section, add-project, toggle-theme,
  toggle-left-sidebar, toggle-right-sidebar, toggle-zen-mode, send-feedback,
  submit-prompt, show-shortcuts, check-for-updates, open-changelog,
  open-passport, go-to-next-unread, settings, view-team,
  view-archived-workspaces, open-docs. Items carry `keywords` (for example
  quick-open: quick, open, file, search, find, picker).
- Command filter: a fuzzy command score over value plus keywords, returning
  the score when it is above `0.2` and `0` (hidden) otherwise.
- Workspace and project results are filtered with their own matchers (project:
  every whitespace-separated query token must be a substring of the lowercased
  name), sorted, and capped at 50 results.
- Empty state on a non-All tab: "No matching {tab}".

## REA gaps hit

1. `rea search <asset.js> toggleCommandPalette` fails with
   `capability_unavailable` / `target_unsupported`: no provider (ghidra,
   hopper, ida, kuna) accepts a JavaScript artifact target, and Ghidra is not
   configured on the Mac (no `GHIDRA_INSTALL_DIR`, no Java runtime). String
   search over JS bundles therefore had to be done with a Python reader over
   the decoded asset.
2. The committed `rea analyze-javascript-application` Evidence
   (`evidence/frontend/rea-analyze-javascript-application.json.gz`) keeps no
   string literals in its semantic graph, so object-literal tables such as the
   keybinding registry cannot be recovered from REA Evidence alone.
