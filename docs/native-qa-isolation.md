# Verify native QA paths without opening a window

Use a fresh debug build for native QA. Do not run an installed bundle, reuse its
application data, or assume that changing `HOME` isolates macOS storage.

The QA configuration uses Tauri's supported `appDirectoriesOverride`, a random
bundle identifier, and nonpersistent (`incognito`) webviews. The debug-only
`--oc-qa-paths` mode reports resolved paths without starting normal app services,
application plugins, downloads, migrations, or a webview. Tauri's core builder
still initializes its internal plugins. Release builds refuse this flag.
The Python verifier never starts the GUI.

## Prepare and build on the authorized Mac

1. Commit the source changes. Record the checkout's exact commit:

   ```bash
   git rev-parse HEAD
   git status --short
   ```

2. Choose a new path in the current Session's own scratch folder. Its parent must
   already exist and be canonical. Do not point it at an existing app-data folder:

   ```bash
   qa="$PWD/.native-proof/qa-$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$PWD/.native-proof"
   python3 tools/native_qa.py prepare "$qa"
   ```

   Preparation refuses an existing root or uncommitted tracked source changes.
   It creates an owned mode-0700 root, a manifest and `tauri.qa.json`.
   Before any probe, precreate the runner's three mutable files:

   ```bash
   python3 - "$qa" <<'PY'
   import os
   from pathlib import Path
   import sys

   root = Path(sys.argv[1])
   for relative in (
       "data/confinement-state",
       "tmp/confinement-startup",
       "tmp/confinement-child",
   ):
       with (root / relative).open("xb") as stream:
           os.fchmod(stream.fileno(), 0o600)
   PY
   ```

   These must be owned regular files with one hard link and mode 0600.
   Exclusive creation refuses existing files. Keep the root and all staged
   parent directories owned and free of symlinks, as required by
   [the launcher's staging contract](../tools/native_qa_runner.py).
   This does not add write permissions to the confinement policy.

3. Build the QA bundle into a separate target directory outside `$qa`.
   Do not replace a running build, install it in `/Applications`, or change the
   user's signing credentials:

   ```bash
   build_target="${qa}-build"
   CARGO_TARGET_DIR="$build_target" CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0 \
     APPLE_SIGNING_IDENTITY=- \
     npx --no-install tauri build --debug --bundles app --config "$qa/tauri.qa.json"
   ```

   This uses the base configuration's resources; it does not require fetching
   optional bundled agent tools. Check Mac disk capacity before building.
   Retain the build log and exact source commit alongside the manifest.
   After a successful build, copy the bundle into a new code directory inside
   the QA root. Do not put code in the runner's mutable data directories:

   ```bash
   mkdir -m 700 "$qa/app"
   qa_app="$qa/app/OpenConductor QA.app"
   cp -R "$build_target/debug/bundle/macos/OpenConductor QA.app" "$qa_app"
   ```

   The runner requires the executable inside `$qa`, outside its mutable data
   directories. It scans the whole root and refuses symlinks, hard-linked
   regular files, unowned objects and unreadable directories. Keep compiler
   output outside the root. Do not loosen the policy to bypass a refusal.

4. Verify the headless receipt using the staged bundle:

   ```bash
   python3 tools/native_qa.py probe "$qa" "$qa_app"
   ```

   The verifier checks the bundle's identity and preflight capability marker
   **before executing it**. It supplies only an isolated environment, runs
   `--oc-qa-paths`, then checks the returned executable, identifier and resolved
   database, cache, settings, workspace and Tauri directory paths. All must be
   inside the fresh QA root. The main data path must exactly match the configured
   override. The probe must not create app-data or settings stores.

   Success writes `paths-receipt.json`, with binary and configuration SHA-256
   hashes. `prepared_source_sha` names the checkout recorded at preparation;
   it is not an independent attestation that a supplied binary came from it.
   Keep the build log, before/after checkout identity and binary hash together.

## Keep native input separate

A successful path probe establishes resolved native storage paths, **not native
visual parity or WebKit runtime behavior**. `webview_incognito` records the
requested configuration, not an observed WKWebsiteDataStore property. The probe
creates no webview, so it cannot observe that property's runtime value.

Before GUI launch or input, obtain the coordinator's explicit native slot and
coordinate with the existing sign-in/native owner. Require a runtime receipt
covering the actual WebKit datastore/cache behavior as well as the database,
cache and workspace paths. Do not promote a build check or a fixture test to
that proof. The native input gate remains closed when this receipt is missing.

Use the same prepared QA configuration and isolated environment for any later
approved native run. `native_qa.environment` defines that environment, including
`OC_NATIVE_QA_ROOT`, `OC_E2E_OUT` (the debug provider-secret store is in memory),
`OPENCONDUCTOR_HOME` and fresh CLI homes. Ambient API keys and sidecar path
overrides are not forwarded. Do not import real account files or credentials,
change keychain search lists, or touch preserved app processes and workspaces.

All QA launchers disconnect caller stdin with `subprocess.DEVNULL` and close
ambient nonstandard descriptors. Captured stdout/stderr remain receipt channels.
The portable stdin regression uses a disposable writable canary and a calibrated
inheriting control; it does not establish App Sandbox, WebKit/XPC confinement or
protection against other ambient authority.

The QA guard refuses invalid roots or paths before normal startup writes. It is
not an OS sandbox: launching agents, terminals, selecting external repositories
or signing in has separate effects and is outside this headless procedure.

## Run the verifier tests on cloud

```bash
python3 -W error::ResourceWarning -m unittest tools/test_native_qa.py tools/test_native_qa_stdio.py -v
```

These tests execute fixture scripts, not macOS apps. Native bundle compilation
and runtime proof must be reported separately.
