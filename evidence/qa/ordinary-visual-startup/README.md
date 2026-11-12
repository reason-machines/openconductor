# Ordinary visual-startup profile

Conductor Rebuild initially read default head `1d9c4027909205d1dba9006031d922a5f2f2287a`
and refreshed against `0a05d2958` before standalone publication. The normal
startup body remains unchanged apart from selecting this opt-in profile first.
Normal setup installs bundled tools, sweeps attachments, requests agent downloads,
opens/migrates databases and imports workspace data before creating the window.
The existing native QA gate opens a hidden JavaScript-disabled about:blank view
and exits. It cannot provide ordinary frontend acceptance.

## Restricted composition

An unset `OC_VISUAL_QA_ROOT` preserves normal startup. An explicit request requires
a packaged macOS debug build and a fresh, canonical, owner-private directory.
The profile reserves it once and rejects symlinks, traversal, reuse and competing
requests. A malformed request exits, never falls back to normal startup.

`lib.rs` selects the profile before constructing the normal builder, plugins or
managed state. `main.rs` rejects profile requests before bundled-tool dispatch.
The profile sets private HOME, CFFIXED_USER_HOME, XDG, settings, sidecar and temp
roots before constructing its builder. Its first custom plugin checks every
actual Tauri app-directory resolver, settings, temp, database and sidecar path.
The checks repeat before database creation in setup. Environment strings alone
are not treated as proof of resolved paths.

The restricted builder has no third-party plugins, product menu handler, agent
installer, bundled-tool installation, attachment sweep, workspace registry import,
legacy repository migration, environment import or upstream Git backfill. Only
15 explicitly listed private DB/settings/layout commands are registered.
The [empty Home startup correction](private-reads/README.md) adds the existing
navigation-section and subsystem-storage getters with private managed state. Its
SettingsService receives a new MemorySecretStore directly. No production default
store, CLI status/credential lookup, terminal, shell, provider, clone or process
handler is constructed or registered. Unknown commands remain errors, not
synthetic success. Plugin commands cannot bypass an application allowlist because
the fs, shell, HTTP, opener, store, SQL, updater, deep-link and other third-party
plugins are absent altogether.

The visible main window uses the ordinary bundled index.html and React tree with
JavaScript enabled. It is not demo state or the native QA about:blank bootstrap.
The initial fresh profile shows onboarding; its local Continue action can write
only private settings and onboarding state. Views needing omitted backend commands
or plugins are unsupported in this profile and remain NOT_RUN, not parity passes.
This profile does not authorize clone/provider acceptance or full backend parity.

Boundary Discipline keeps request and filesystem validation in one profile.
Model the Domain gives the reserved profile ownership of all derived paths.
A normal-backend design was rejected because JS startup independently starts the
Reason installer, Xcode shell checks, binary retries and separate credential probes.
Those bypasses would require many product adapters. Restricted composition leaves
the existing normal builder unchanged and makes the excluded operations explicit.

## Pinned WebKit contract

Cargo.lock pins Tauri 2.12.5, tauri-runtime 2.12.2, tauri-runtime-wry 2.12.3,
tauri-utils 2.10.2, Wry 0.57.1, objc2 0.6.5 and objc2-web-kit 0.3.2.
The exact published archives, plus dirs 7.0.0 and dirs-sys 0.5.0, were downloaded
as inert source and all nine SHA-256 values matched the lockfile.

- Wry `src/web_context.rs:102–110` ignores data_directory on non-GTK platforms.
  It is not a macOS storage-root control.
- Wry `src/wkwebview/mod.rs:252–290` accepts an injected native configuration and
  preserves its websiteDataStore, ahead of incognito/UUID selection. Navigation
  occurs during construction at lines 710–715.
- Tauri `src/webview/webview_window.rs:1457–1468` exposes
  with_webview_configuration. The adapter uses it before build.
- objc2-web-kit `WKWebViewConfiguration.rs:171–181,369–371` and
  `WKWebsiteDataStore.rs:44–60` provide the unsafe main-thread methods used here.
  The adapter creates a fresh nonPersistentDataStore, checks isPersistent=false,
  attaches it, and checks the configuration again before passing it to Tauri.
- The same ordinary webview gets a post-construction with_webview readback.
  A persistent result exits. This is additional runtime evidence, not a substitute
  for pre-construction selection.
- A UUID datastore was rejected. It is persistent, chooses no arbitrary run root,
  and Wry can fall back to the default store before macOS 14.
- Tauri's core path plugin registers resolver state without creating directories.
  Its app-directory getters only resolve paths. Core runtime/framework activity
  can precede the custom plugin; absence of every OS cache/log write is NOT proved.

The adapter uses no private WebKit SPI and makes no OS-sandbox claim. Nonpersistent
website data is not equivalent to comprehensive filesystem containment.

## Receipt contract

A successful launch writes `visual-startup-receipt.json` under that run's reserved
root. The receipt includes its schema version, compile-time GITHUB_SHA when set,
actual executable path and SHA-256, profile root and actual resolved destinations,
prebuild nonpersistent selection and same-webview isPersistent readback. It labels
third-party plugins and dangerous handlers not registered, memory-only secrets,
skipped installers/imports, missing full-backend parity and missing OS filesystem
observation. Package identity still needs the external package/executable receipt.
No native receipt has been produced by this source-only work.

## Verification

Passed on Reason Cloud:

```bash
rustc --edition=2021 -D warnings --test --cfg workspace_std_only src-tauri/src/visual_qa_profile.rs -o /tmp/oc-visual-profile-tests
/tmp/oc-visual-profile-tests
python3 evidence/qa/ordinary-visual-startup/verify_boundary.py
git diff --check
```

All nine real-filesystem tests passed. They cover absent request, release refusal,
private separate roots, existing-state reuse, malformed paths, resolver escape,
symlinks, shared-root permissions and simultaneous requests. Static composition
checks passed. They are source-contract checks, not observations of native IPC.
The existing workspace-tests workflow runs both checks on Linux and macOS.

Pending: full adapter cargo check/test/clippy and automatic macOS package on the
standalone PR. Native resolved-path/write observation, installed identity, actual
WebKit readback, visual behavior and clone/provider acceptance are NOT_RUN.
No screenshot exists because native execution remains with E1. This change does
not install, launch or provision anything on Sven's Mac or touch protected apps,
processes, credentials, repositories or workspaces.
