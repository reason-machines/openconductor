# Observe the QA WebKit datastore

This is a separate native runtime step, not an extension of the headless path
probe's execution grant. Do not run it until the coordinated native evidence
owner has reviewed the exact source/build and received authorization for the
hidden WebKit instance. It must not use installed apps, preserved application
data, credentials or existing native processes.

## What this probe can establish

The QA-only mode uses a minimal application, not ordinary OpenConductor startup.
It requests a hidden, nonfocused window with an inert `about:blank` bootstrap,
requests JavaScript disabled, and denies navigation and new-window requests.
It inspects the actual WKWebView configuration's website datastore on the main
thread and refuses a persistent datastore or visible window.

Tauri's public `with_webview` observation happens **after** webview construction.
The inspection therefore occurs after the inert bootstrap, before any app
content—not before all navigation. No application page, script or remote URL is
provided. Tauri still installs its core initialization scripts; the probe requests
JavaScript disabled and adds no application initialization scripts. Denying
navigation is not a general network sandbox and does not prove that every
possible WebKit network mechanism is disabled.

A passing runtime receipt would establish the observed datastore property for
this exact probe. It does not establish full filesystem/cache isolation,
production authentication, ordinary application startup, or visual parity.
No success receipt from fixture tests or a compiled build is a native runtime
observation. The ordinary GUI gate remains separate.

## Prerequisites

1. Prepare a fresh private root and build the exact committed source with its
   random QA identity and configuration, following
   [the path-preflight procedure](native-qa-isolation.md). Keep compiler output
   outside `$qa` and copy the bundle inside `$qa/app`, retaining
   `qa_app="$qa/app/OpenConductor QA.app"`. The same procedure precreates
   `data/confinement-state`, `tmp/confinement-startup` and
   `tmp/confinement-child` as owned regular single-link mode-0600 files.
2. Run the existing `tools/native_qa.py probe` and retain its path receipt,
   build log, source before/after identity, and binary/configuration hashes.
3. Confirm there is no app-data directory and the settings directory is empty.
   Do not import real account files or start providers, terminals or agents.
4. Obtain the coordinated runtime execution authorization. A path-only grant
   does not authorize this step.

## Explicit runtime command

Only after those prerequisites and authorization, on the authorized Mac:

```bash
python3 tools/native_qa_webkit.py "$qa" "$qa_app" \
  --execute-runtime-probe
```

The verifier refuses a normal/old bundle before execution. It requires a prior
path receipt describing the same binary, configuration, identifier, executable
and prepared source. It starts only the QA probe in a separate process group,
with the isolated environment from `native_qa.environment`, a bounded timeout
and cleanup targeting that process group. It does not terminate preserved app
processes or global WebKit services.

The returned paths must still be confined to the QA root. The verifier rejects
persistent or unobserved datastores, visible or unobserved windows, non-blank
bootstrap URLs, missing control-policy flags, and ordinary database/settings
creation. A successful run writes a private `webkit-receipt.json` containing
binary/configuration hashes and the observation's explicit limitations. Never
reuse a completed runtime fixture or promote it to a blanket safe-GUI claim.

The control-policy fields record the installed/requested probe policy; only the
native datastore persistence and window visibility fields are runtime
observations. Retain this distinction in every report.

## Ordinary main-window prerequisite (still no app admission)

The ordinary QA launch path now stops at a separate main-window prerequisite.
With `OC_NATIVE_QA_ROOT` present it refuses non-macOS/release builds, dev-server
mode, remote frontend assets, multiple windows and any destination other than
the bundled default `main` / `index.html`. Production launches without the QA
environment retain their existing path.

The gate runs before ordinary setup creates databases, settings, agent download
workers or the ordinary UI. It clones the main-window configuration into one
hidden `main` webview, substitutes only an inert `about:blank` bootstrap, requests
JavaScript disabled and denies navigation/new windows. Its main-thread callback
observes that instance's actual datastore persistence and window visibility,
emits its prerequisite result and exits. There is no subsequent replacement
webview and **no app-content navigation**. Plugin registration precedes this
setup gate; this is not a claim that no framework/plugin initialization ran.

A successful prerequisite is deliberately **not an admission token**. No code
reads this receipt to unlock ordinary setup. The gate remains closed until a
separate reviewed change and separately authorized filesystem/cache
write-and-relaunch proof establish isolation. Neither #775's hidden probe nor
this prerequisite proves that behavior.

### Exact-build receipt recipe

Only the sole coordinated native owner may execute this under a separate
prerequisite-only runtime grant. This document grants no launch permission.

1. Check out the exact containing merged commit, verify a clean tree, prepare a
   new root and build its random-identity debug bundle using the
   [path-preflight build recipe](native-qa-isolation.md). Do not reuse the #775
   root or an earlier runtime fixture. That recipe keeps compiler output outside
   `$qa`, stages the bundle at `qa_app="$qa/app/OpenConductor QA.app"` and
   precreates the three required mutable mode-0600 files.
2. Produce `paths-receipt.json` for that exact executable/configuration with
   `tools/native_qa.py probe`. Retain the source SHA, build log and bundle.
3. Execute only the prerequisite wrapper, never `open`, an installed app,
   `cargo tauri dev` or an unwrapped ordinary launch:

   ```bash
   python3 tools/native_qa_ordinary.py "$qa" "$qa_app" \
     --execute-prerequisite
   ```

4. Expected: process exits successfully without app content or an ordinary
   window; private `ordinary-webkit-prerequisite.json` binds the prepared source,
   executable SHA256 and configuration SHA256. It must report `window_label=main`,
   `bootstrap_url=about:blank`, `webkit_data_store_persistent=false`,
   `native_window_visible=false`, `app_content_admitted=false`,
   `ordinary_setup_admitted=false` and `cache_filesystem_verified=false`.
   Missing observations, ordinary-store creation, a stale executable/config,
   timeout, reused fixture or an old binary means refusal and no success receipt.

### Filesystem/cache follow-on boundary

Retain the root and process-scoped logs; do not delete preserved data or kill
existing app/global WebKit processes. An independently authorized filesystem
observer may surround only the prerequisite process group to record its reads
and writes. A snapshot/diff alone is insufficient (transient writes can vanish),
and a trace around the inert prerequisite alone does not exercise app-content
cache behavior. Do not broaden tracing to unrelated processes/user data or
request elevated access implicitly.

The later cache proof must have its own reviewed bounded harness: identify the
exact executable/config, observe writes against the isolated root and preserved
sentinels without reading their contents, perform a synthetic cache/storage write,
terminate only that QA process group, relaunch the same isolated fixture and
verify the specified persistence/nonpersistence contract. It must cover relevant
WebKit child-process writes and retain errors/trace coverage. **That harness,
write-and-relaunch procedure and ordinary content admission are not implemented
or authorized here.** If the observer cannot establish coverage, isolation remains
unverified and the ordinary gate stays closed. Do not use existing receipts,
boolean environment overrides or path-only checks to bypass it.

## Cloud-only validation

```bash
python3 -W error::ResourceWarning -m unittest \
  tools/test_native_qa.py tools/test_native_qa_webkit.py tools/test_native_qa_ordinary.py -v
```

These tests execute small fixture programs, not macOS apps or WebKit. They cover
prerequisite matching, fail-closed receipt validation, ordinary-store refusal,
credential filtering and bounded process termination. Native execution remains
not run until the separate exact-build runtime receipt exists.
