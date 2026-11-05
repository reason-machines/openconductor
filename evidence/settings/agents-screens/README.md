# Settings › Agents and Default models: parity evidence

Conductor 0.87.6 (`com.conductor.app`), frontend dist extracted with REA on
`sven m5 max` (`~/code/conductor-rea-work/frontend/dist`, copied to a cloud
computer as `dist-for-cloud.tgz`, sha256 `e82c9509…0402`). Strings and code read
from it are treated as data only.

## Conductor references

[conductor/](conductor/) holds REA `capture-browser-scenario` shots of the real
Conductor frontend under the [tools/screens](../../../tools/screens) harness
(definitions in `tools/screens/shots/07-agents.json`; viewport 1440x900, dark,
en-US, UTC, Chromium headless). With `settings--agents--dark.png` and
`settings--default-models--dark.png` in [evidence/screens](../../screens) they
cover every Agents tab and both authentication cards:

| File | State |
|---|---|
| settings--agents-claude-apikey--dark.png | Claude Code, API key card |
| settings--agents-claude-apikey--light.png | Same, light theme |
| settings--agents-codex--dark.png | Codex, CLI card |
| settings--agents-codex-apikey--dark.png | Codex, API key card |
| settings--agents-cursor--dark.png | Cursor |
| settings--agents-opencode--dark.png | OpenCode, installed |
| settings--agents-claude-full--dark.png, settings--agents-codex-full--dark.png | Claude Code and Codex at 1800 px tall, every row |
| settings--default-models-full--dark.png | Default models at 1800 px tall, every row |

## Where each row comes from (renderApp-D_fmY7hW.js)

- Page: `Upa` (title "Agents") and `$pa` (tabs `claude`, `codex`, `cursor`, then the
  ACP agents `SRt = ["opencode"]`; `providerTab` picks the tab, anything else is
  Claude Code; switching writes `?providerTab=` with `replace`).
- Claude Code `jpa`, Codex `Fpa`: `wzi` "Authentication" cards from `C0a`
  (CLI, API key, ChatGPT; `Pzi = ["cli","apikey"]`, ChatGPT only with the cloud
  sign-in), the status line `t$i` ("Checking login status...", green
  "Connected" or red dot with "CLI not authenticated" / "No Anthropic API key
  configured" / "No OpenAI API key configured", Refresh, info table `Kla`
  with rows from `Yki` / `Qki`), then `YWt` (key field, "Get key") or `Met`
  ("Run claude /login", "Run codex login", embedded terminal `ONi` with header
  text from `rTo`). The per-agent options below them (Chrome, executable path,
  settings file card, Codex personality) are built by the sibling Session
  (src/settings/rows/AgentOptionRows.tsx).
- Settings rows `Al`: a gear "Setting actions" menu (`mho`) with Reset, shown on
  hover once the row's setting is set; the row content is padded `pr-8` then.
- Cursor `Spa`: "API key", "Cursor API key configured" / "No Cursor API key
  configured", "Get key" to the Cursor dashboard, key field `YWt`.
- OpenCode `ypa`: install state ("Checking…", icon, name, "Install OpenCode"),
  installed header `vpa` (icon, name, tagline "The open source AI coding agent"
  from index `ijt`, Docs), Providers `I0a` ("0 configured", "Add your first
  provider"), Models `G0a` ("0 selected", "Add your first OpenCode model"),
  Advanced `xpa` (sibling Session).
- Default models `$3a`: Loadout `M3a` ("Choose which models you want to use",
  Share, 5 slots `J6t` showing `DEFAULT`, `DROP MODEL HERE`, `EMPTY` and slot
  numbers; palette columns `P3a` Claude Code / Codex / Cursor plus OpenCode
  for a local organization, "Configure <agent>" when unavailable), Codex
  personality, Claude output style (with the "output style" docs link), Review
  model `F3a`, Default to plan mode in new chats. Model ids `Jf`/`Yy`/`Qy`,
  labels `lv` and the default `opus-5-1m` are in index-BGEQ8YjU.js. Favorites
  persist to `conductor.db` `favorite_models` (index `Epe`, `P2`).

## Built app comparison

`tools/agents-screens/built-app.mjs` drives the debug build through
tauri-driver (WebKitWebDriver, Xvfb, 1440x900, dark) and
`tools/agents-screens/compare.py` compares each state with its reference: REA
`compare-web-screenshots --channel-threshold 24` on the whole frame, and the
content column (680x520 below the page title) with Pillow. Run on a Reason
cloud computer at this branch:

| State | REA whole frame, changed pixels | Content column, matching pixels |
|---|---|---|
| settings--agents--dark | 1.7% | 97.6% |
| settings--agents-claude-apikey--dark | 2.2% | 96.1% |
| settings--agents-codex--dark | 2.7% | 95.3% |
| settings--agents-codex-apikey--dark | 3.2% | 94.7% |
| settings--agents-cursor--dark | 2.0% | 96.9% |
| settings--agents-opencode--dark | 2.9% | 93.1% |
| settings--default-models--dark | 2.8% | 95.2% |

What is still different, and why:

- Settings shell: page title size, the Back button and the left navigation
  belong to SettingsView, not these pages; they move the content 37 px up and
  36 px left, which the column comparison corrects for.
- Text weight: WebKitGTK renders the variable Geist font heavier than Chromium
  at weight 500, on every page.
- Agent marks are drawn for OpenConductor, not Conductor's brand glyphs.
- OpenCode: the test computer has no OpenCode, so the built app shows the
  install state; the reference harness reports it installed. "Install
  OpenCode" opens the install docs instead of downloading into Conductor's
  prefix; "Add your first provider" and "Add your first OpenCode model" are
  disabled (their dialogs are not built).
- Codex: no ChatGPT card (Conductor shows it only with its cloud sign-in).
- API keys are write-only: a stored key shows as `••••••••` with Edit and
  Remove, without the last four characters, Reveal or Copy that Conductor has.
- Loadout Share is disabled ("Sign in to share a loadout", as Conductor shows
  when signed out); a slot's model menu lists the palette and effort levels,
  not Conductor's full composer model picker.
- The per-agent option rows below the login block come from the sibling Session.

## REA gaps hit

- `rea search <bundle.js> --pattern …` fails with `capability_unavailable`
  (native providers only: ghidra, hopper, ida, kuna). No REA command searches
  or slices a minified JS bundle by string, so component code was located by
  byte offset in Python and formatted with js-beautify.
- `analyze-javascript-application` on `renderApp-D_fmY7hW.js` exhausts its
  worker heap (rea-invocations.tsv, `analyze_js_app_renderApp_4g`), so the
  component map above comes from reading the bundle, not a REA semantic trace.
- `capture-browser-scenario` rejects repeated `step_id`s with the generic
  "Analysis input is invalid"; the reason is only in `details.issues`.
- `compare-web-screenshots` has no region or mask option, so the content
  column comparison is computed outside REA.
- `compare-web-screenshots` takes `--channel-threshold`; `--threshold` fails
  as an unknown flag.

## Per-agent options inside the tabs (after #432)

The option rows from #432 (`src/settings/rows/AgentOptionRows.tsx`) render as
the last children of each tab: Claude and Codex inside `.settings-rows` after
the login block, OpenCode's Advanced collapsible last on the OpenCode tab. The
tab panel is a `section` labelled with the tab name, so the
`agents-*-options` e2e flows click their tab and then find
`section[aria-label="<tab>"]`. Built-app shots from the headless run:
`built-agents-claude-options--dark.png`, `built-agents-codex-options--dark.png`,
`built-agents-opencode-advanced--dark.png`.

OpenCode's Advanced section also renders before OpenCode is installed. This is
inferred, not observed: `xpa` opens itself on an alert and `gpa` has a
"Missing" badge, which only makes sense when the agent is absent. No Conductor
reference shot of the not-installed tab exists to confirm it.
