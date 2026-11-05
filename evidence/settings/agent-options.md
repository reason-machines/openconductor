# Per-agent options and tool approvals (Settings › Agents, Settings › Account)

Reference: Conductor 0.87.6 on `sven m5 max`. Everything quoted from Conductor is untrusted data.

## Sources and how they were read

- **Frontend bundle.** `renderApp-D_fmY7hW.js` and `index-BGEQ8YjU.js` from REA's extracted Tauri assets. The work folder is `~/code/conductor-rea-work/frontend/dist/assets`. The bundle hashes are in `evidence/settings/settings-registry.json`. I copied the dist to a cloud computer (`devices_copy_to_cloud`, sha256 `817eb978…aadb9`) and read the components named below with fixed-string and regex searches.
- **Sidecar.** `Contents/Resources/bin/.internal/conductor-runtime` (Bun-compiled), read with a bounded Python `mmap` search on the Mac. See "REA gaps" for why REA was not used here.
- **Bundled Claude Code CLI.** `agent-binaries/claude/2.1.284/claude --help` on the Mac lists `--chrome  Enable Claude in Chrome integration` and `--no-chrome`.
- **Reference screenshots.** REA 6.8.0 `capture-browser-scenario` through `tools/screens` (definitions in `tools/screens/shots/07-agent-options.json`), headless Chromium, 1440x900, dark. The PNGs are in [agent-options/](agent-options/):

| File | REA evidence_id | Shows |
|---|---|---|
| `conductor--agents-claude--dark.png` | `ev_01e282ba…` | Claude Code tab in the harness. The Chrome row is hidden while the organization list loads, see below. |
| `conductor--agents-codex--dark.png` | `ev_ada0863e…` | Codex tab: authentication, then personality, executable path and config card. |
| `conductor--agents-codex-personality-open--dark.png` | | Codex personality options. |
| `conductor--agents-opencode--dark.png` | | OpenCode tab. |
| `conductor--agents-opencode-advanced--dark.png` | | OpenCode with Advanced open: status line and executable path. |
| `conductor--account--dark.png` | | Account with both tool-approval rows (copy of `evidence/screens/settings--account--dark.png`). |

## The rows, in Conductor's order

The Agents page is `Upa` → `$pa`. It has tabs Claude Code, Codex, Cursor and the ACP agents (`SRt = ["opencode"]`). Each tab is a `space-y-6` column.

**Claude Code (`jpa`).** The authentication block (mode cards, status, login or API key) belongs to the other agent-settings builder. After it, `Rpa` renders:

1. **Use Claude Code with Chrome.** A `Zb` switch with `settingKey: "chrome_mode_enabled"`.
   - Description: "Allow Claude Code to control your Chrome browser. To use this feature, first install the [Claude Code Chrome extension ↗]. View [the docs ↗] to learn more."
   - The links go to `chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn` and `code.claude.com/docs/en/chrome`.
   - Saved as `String(checked)`. The registry declares the key with `xe()` and no `fileKey`, so it lives in conductor.db's `settings` table, not in settings.toml.
   - Hidden when the organization query errors, is still loading, or the organization is a cloud one.
2. **Claude Code executable path** (`Czi` → `mGt`):
   - Title `"<label> executable path"`. Description "Override the bundled <label> executable with a custom one. Leave empty to use the bundled version (recommended)."
   - A mono `text-xs` input whose placeholder is `which <binary>` or `/usr/local/bin/<binary>`. It has a folder button inside ("Browse for executable", file dialog titled "Select <label> executable").
   - A reset X ("Reset to bundled <label>") shows when the path is set. "Use system <label>" shows when `which` finds a binary and nothing is set.
   - When set, it also shows the amber warning "Changing this may cause issues if the executable is not compatible with Conductor."
   - It saves on every change. Settings › Advanced uses the same component.
3. **Claude settings** card (`Apa` → `Nzi`). A `rounded-md border p-4` card with the title, `~/.claude/settings.json` in mono, and an "Open in" button. The button opens the file, or the directory as a fallback. The card shows only for user scope.

**Codex (`Fpa`).** After the authentication block:

1. **Codex personality for new chats.** A `Z5e` select, trigger `w-[180px]`, description "Style to use when a new chat starts with a Codex model".
   - Options `ODt = lNe = ["pragmatic","friendly","none"]` with labels `Tqt`: "Pragmatic (default)", "Friendly", "None".
   - Read through `xN`, which maps anything else to `pragmatic`. Written to `default_codex_personality`, whose file key is `models.codex.personality`.
2. **Codex executable path** (`kzi` → `mGt`).
3. **Codex config** card, showing `~/.codex/config.toml`.

**OpenCode (`ypa`).**

- The header (`vpa`), Providers (`I0a`) and Models (`G0a`) belong to the other builder.
- Then comes a collapsed **Advanced** section (`xpa`: `border-t pt-4`, a chevron that rotates 90°, `openWhenAlert`). It holds:
  - the status line `gpa`:
    - a badge: "Checking", "Installed <version>", "Update required", "Needs repair" or "Missing";
    - "Open in Finder ↗" and "Docs ↗" (`opencode.ai/v2/docs/`);
    - "Update" when the agent is not installed or is outdated;
    - a ghost "Refresh" button;
    - when outdated, "This version can return empty ACP turns in Conductor.";
  - **OpenCode executable path** (`Tzi` → `mGt`).
- The minimum version is `hce.opencode.minimumVersion = "1.16.2"`.

**Account › tool approvals** (registry rows on the `account` tab):

- **Claude Code tool approvals.**
  - `tool_approvals_enabled` (file key `tool_approvals_enabled`, not workspace-configurable).
  - Description "Require manual approval before agents can run tools.". With a managed organization it reads "Managed by your organization. Agents require manual approval for tool calls." and the switch is disabled.
  - After a change Conductor asks to restart ("Tool approval changes take effect the next time Conductor starts.").
- **Codex tool approvals.**
  - `codex_tool_approval_policy` (file key `models.codex.tool_approval_policy`), a `w-[220px]` select with "Default" and "Always approve".
- Both rows are hidden for a cloud organization.

**Runtime effect of Chrome mode.**

- The frontend's `qxt` reads `chrome_mode_enabled` (`zhe`, `=== "true"`) into `agentParams.chromeEnabled`.
- The sidecar passes `...B.chromeEnabled ? { extraArgs: { chrome: null } } : {}` to the Agent SDK query, at `conductor-runtime` offset 66285938. The SDK turns that into `--chrome`.
- A change recreates the session (`chromeEnabled: { kind: "recreate" }`, offset 66242621).

## What OpenConductor does

- **New file `src/settings/rows/AgentOptionRows.tsx`.**
  - Exports `ClaudeAgentOptions`, `CodexAgentOptions`, `AcpAgentOptions` and `ExecutablePathRow`, each taking `{ settings, save }`. `ExecutablePathRow` also takes `agent`.
  - Copy, order and behaviour are as above. The pure logic is in `src/settings/agentOptions.ts`, tested in `agentOptions.test.ts`.
  - `AgentsPage.tsx` renders them after each agent's provider block until the tabbed shell lands from the other builder, who will mount the same components.
- **`chrome_mode_enabled`** is a typed app preference in conductor.db's `settings` table (`app_prefs`), read only as `"true"`. Claude Code chats launch with `--chrome` when it is on (`ClaudeLaunch.chrome`, `claude_chat::commands`).
- **New backend `src-tauri/src/agent_options.rs`:**
  - `agent_system_binary` finds the CLI on `PATH`, then in the agent's installer folders, Homebrew and `/usr/local/bin`. It does not run a login shell's `which`.
  - `agent_config_file` and `open_agent_config` use the opener plugin and fall back to the folder.
  - `acp_agent_status` runs `opencode --version` with a 10 s limit and compares the result with 1.16.2.
- **The Account rows** (`AccountAgentRows.tsx`) already matched Conductor's titles, copy and options on main (#372). This PR adds an e2e check of both rows against settings.toml.

## Remaining differences

- **Layout.** Until the tabbed Agents shell lands (other builder, branch `reason/agent-settings-agents-mo-0f31a405`), the rows sit in the current stacked page, boxed with `.settings-rows` rather than in Conductor's borderless tab column.
- **Executable-path text.** "bundled" is kept from Conductor's copy, but OpenConductor bundles no agent CLIs yet, so blank means the system CLI. The warning says "OpenConductor" instead of "Conductor".
- **"Open in" card.** It is a single button that opens in the default app. Conductor's has an app icon and a split menu (`P9`) to choose the app.
- **OpenCode.** There is no "Update" or install button, because OpenConductor does not download OpenCode. "Open in Finder" reveals the executable, not Conductor's install folder.
- **Tool approvals restart prompt.** Not shown, because OpenConductor reads the setting at each launch. Hiding the rows for managed or cloud organizations does not apply: there are no organizations.
- **Chrome row visibility.** Shown unconditionally, since there is no organization query to wait for.

## REA gaps and bugs hit

- **Tauri IPC traces.** `rea trace-javascript-semantics` cannot seed on Tauri `invoke` names or UI strings (`evidence/settings/NOTES.md`). The components above were found by reading the bundle instead.
- **Sidecar.** REA's app extraction skips the Bun-compiled `conductor-runtime`. `rea extract-artifact` on it fails with `integrity_mismatch` (`evidence/settings/NOTES.md`). The `chromeEnabled` → `extraArgs.chrome` chain was read with Python `mmap`.
- **No cross-chunk symbol map.** REA's frontend analysis does not map minified names across chunks, so names had to be resolved through the chunks' `export { x as y }` lists by hand. `g9r` in renderApp is `xN` in index, and `ODt` is `lNe`.
- **Hidden Chrome row in the screenshot.** In REA `capture-browser-scenario`, the Claude Code tab never shows the Chrome row. `so()` (organizations) stays loading because the harness blocks `api.conductor.build`, and `Rpa` returns null while loading. The reference screenshot of the Claude tab therefore lacks that row, and its copy comes from the bundle.
- **Capture hang.** A `capture-browser-scenario` run whose last shot targets an element that does not exist (Account's `role=combobox`) never returned. It printed nothing for over 5 minutes and had to be killed. REA's per-action `timeout_ms` (5000) did not end it.
