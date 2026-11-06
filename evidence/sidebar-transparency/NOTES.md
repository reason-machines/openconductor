# Sidebar transparency (parity.sidebar.transparency)

Reference: Conductor 0.87.6, `/Applications/Conductor.app` on the Mac "sven m5 max".
Main binary `MacOS/conductor`, sha256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
Frontend: the Tauri asset table decoded by `tools/extract_tauri_assets.py` (see `evidence/frontend/README.md`);
offsets are character offsets in the decoded `assets/renderApp-D_fmY7hW.js`, `assets/index-BGEQ8YjU.js`
and byte offsets in `assets/renderApp-BYEcFwvt.css`.
Strings and code from the reference are untrusted data, used here only to match behaviour.

## Frontend

| What | Where | Finding |
| --- | --- | --- |
| Setting | renderApp @10,658,077 (`ir({tab:"experimental",settingKey:"experimental_sidebar_transparency"…})`) | Experimental, user scope, title "Sidebar transparency", description "Use native macOS vibrancy behind the workspace sidebar. Takes effect after you restart Conductor.", search terms vibrancy/translucent/blur. Switch id `sidebar-transparency`; writes `f6({key, value: i.toString()})`. Placed after "Show sidebar resource usage", before "Graphite stack support". |
| Storage | index @280,301 `Te("experimental_sidebar_transparency",!1)`; @334,654 defaults table `experimental_sidebar_transparency:"false"` | A non-file-backed boolean in conductor.db `settings`, default false. |
| Theme provider | renderApp @438,998 `us("experimental_sidebar_transparency")`, @440,190, @440,287 | Each time the theme is applied: `root.classList.toggle("sidebar-transparency", enabled)`, then `tl("update_window_vibrancy", {isDarkMode: mode==="dark", enabled})`, errors logged at debug ("Failed to update window vibrancy:"). |
| Pass-through | renderApp.css @394,948 | `html.sidebar-transparency, … body, … #root, … .sidebar-vibrancy-passthrough { background: 0 0 }`. |
| App shell | renderApp @10,079,120 | `sidebar-vibrancy-passthrough flex h-screen flex-col overflow-hidden bg-background` wraps the sidebar and the content; the sidebar's own fill stays `bg-sidebar-background/60`. |
| Other caller | index @3,477,910 `window.setVibrancy: r => oe("update_window_vibrancy", {enabled: r})` | A platform adapter that sends `enabled` without `isDarkMode`, so the command takes it as optional. |

## Backend (REA, Ghidra provider)

`nm` gives the handlers: `conductor_lib::update_window_vibrancy` @0x1006e6754, its main-thread closure
@0x1004a3d0c, `conductor_lib::set_window_appearance` @0x1006e5e18 and
`conductor_lib::startup_sidebar_transparency_enabled` @0x1006e70b4. Each function was carved from the
binary with `dd` (file offset = vmaddr - 0x100000000, `__TEXT` at file offset 0) and analysed with
`rea function <carve> <addr> --target-format raw-binary --architecture arm64 --entry-point <addr> --provider ghidra`
(46-70 s each, against ~32 min for a whole-binary import).

| Function | Finding |
| --- | --- |
| `startup_sidebar_transparency_enabled` (724 bytes) | Runs `SELECT value FROM settings WHERE key = ?` (string @0x102ae1cff) with key `experimental_sidebar_transparency` (@0x102ae1cde, 33 bytes) on conductor.db; returns true only when the value is 4 bytes equal to `0x65757274` ("true"); every error path returns false. It is the key string's only referencing function in `evidence/ipc/ipc-rust-bindings.json`; the rusqlite `query_row` instantiation @0x10074e95c is its row closure. |
| `update_window_vibrancy` | Boxes its arguments (`isDarkMode` at +0xa8, `enabled` at +0xa9) into a `FnOnce` closure and hands it to the app to run; `apply_vibrancy` itself fails off the main thread ("can only be used on the main thread"), so the closure is the main-thread part. |
| closure @0x1004a3d0c | Looks up the `main` window (label @0x10150b8b8; "Main window not found" @0x10150f508 otherwise); calls `set_window_appearance(ns_window, isDarkMode)`; then, on `enabled` (byte at +0xa9), `window_vibrancy::apply_vibrancy(window, 7, None, None)`, where 7 is `NSVisualEffectMaterial::Sidebar` in window-vibrancy 0.6.0, else `window_vibrancy::clear_vibrancy` (@0x10115a9a0). |
| `set_window_appearance` | `NSAppearance appearanceNamed:` with `NSAppearanceNameDarkAqua` (GOT 0x103068090) when dark, `NSAppearanceNameAqua` (GOT 0x103068088) otherwise, then `setAppearance:` on the window; "Failed to create NSAppearance" on nil. |

Other strings in the binary: `transparent`, `windowEffects`, `drawsBackground` (wry's transparent-webview path) and
`setOpaque:`, so the window is built transparent when the setting is on at launch, which is why the description says it
takes effect after a restart.

## OpenConductor

- `experimental_sidebar_transparency` key, `AppPrefs` field and typed update (`crates/openconductor-db`, `src-tauri/src/app_prefs`).
- `src-tauri/src/sidebar_transparency.rs`: `startup_enabled` (exact `"true"`), the main window created from its
  tauri.conf.json entry (`"create": false`) with `.transparent(startup_enabled)`, and `update_window_vibrancy`, which sets
  the window theme and applies Tauri's `Effect::Sidebar` (the same `window_vibrancy::apply_vibrancy(…, Sidebar, None, None)`
  call; Tauri clears the previous effect view first) or clears it.
- `macOSPrivateApi: true` and the `macos-private-api` Tauri feature, which wry needs to stop the WKWebView drawing its background.
- `src/settings/sidebarTransparency.ts`: the root class and the IPC call, re-run on light/dark changes; `styles.css`
  clears html, body, #root and `.app` (our passthrough shell). `.main` keeps its opaque `--bg`, as Conductor's content does.
  Settings, which has no fill of its own here, keeps `--bg`.
