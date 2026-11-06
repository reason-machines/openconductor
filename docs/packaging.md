# Packaging OpenConductor for macOS

## Local signed build

```bash
npm ci
scripts/package-macos.sh              # debug build
scripts/package-macos.sh --release    # optimized build
scripts/package-macos.sh --identity - # force ad-hoc signing
```

The script builds `OpenConductor.app` with Tauri and signs it with the hardened runtime and `src-tauri/Entitlements.plist`. It picks the signing identity in this order:

1. `--identity NAME`
2. `$APPLE_SIGNING_IDENTITY`
3. the first `Developer ID Application` identity in your keychain
4. ad-hoc (`-`)

It then runs `codesign --verify --deep --strict` and prints the bundle path on its last line, for example `src-tauri/target/debug/bundle/macos/OpenConductor.app`.

To build with working updates, set `OPENCONDUCTOR_UPDATER_PUBKEY` to the public key from `npx tauri signer generate`, and to publish an update, also set `bundle.createUpdaterArtifacts` to `true` and provide `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) so the bundler writes and signs the update archive. Without the public key the app still checks for updates but can't install any.

The build is not notarized. Gatekeeper accepts a Developer ID build on the Mac that built it; on another Mac, or after a download, macOS blocks it until it is notarized.

## Check a bundle

```bash
python3 tools/check_macos_bundle.py src-tauri/target/debug/bundle/macos/OpenConductor.app \
  --signing developer-id --report bundle-check.json
```

The checker compares the bundle with `src-tauri/tauri.conf.json` and with REA's reference of Conductor's Info.plist keys and entitlements (`evidence/packaging/conductor-reference.json`). Any key we leave out on purpose must be listed in `evidence/packaging/divergences.json` with a reason. Use `--signing adhoc` for ad-hoc builds, or `--skip-codesign` to check only the Info.plist on any OS.

## What the bundle contains

- Bundle ID `com.reasonmachines.openconductor`, minimum macOS 12.0, category developer tools.
- URL scheme `openconductor://`. `openconductor://workspace?id=<id>` (the sidebar's Copy link) selects that workspace, whether it launched the app or arrives while it runs (`src/workspace/useWorkspaceDeepLinks.ts`, through `tauri-plugin-deep-link`'s `getCurrent` and `deep-link://new-url`).
- `Contents/Resources/conductor-skill/`, where Conductor ships its agent skill: OpenConductor's own Claude Code plugin (`openconductor`, skill `conductor`) from `src-tauri/resources/conductor-skill/`, describing OpenConductor's workspaces, repository settings, scripts, files to copy, Spotlight and checkpoints. Every `ClaudeLaunch` passes it with `--plugin-dir`. Check it with `claude plugin validate src-tauri/resources/conductor-skill`.
- Folder-access prompts for Desktop, Documents and Downloads, for repositories stored there, and a microphone prompt for dictating messages.
- Entitlements `com.apple.security.cs.allow-jit` and `com.apple.security.cs.allow-unsigned-executable-memory`, which the WebKit JavaScript engine needs under the hardened runtime, and `com.apple.security.device.audio-input`, without which the hardened runtime denies the microphone. Conductor 0.87.6 signs the same three (`evidence/packaging/conductor-reference.json`).
- `tauri-plugin-updater`, which Conductor links, with the four commands Conductor's frontend calls (`check`, `download`, `install`, `download_and_install`, granted by `updater:default`). It checks `latest.json` on this repository's latest GitHub release. `tauri.conf.json` ships an empty public key; a release build bakes in the real one from `OPENCONDUCTOR_UPDATER_PUBKEY` at compile time. With an empty key every install fails signature verification, so an unsigned build never installs an update. The app doesn't call the updater itself yet; Conductor's own update flow (`conductor_lib::updater`, the `check_for_updates` command and `manual_update_status` events) hasn't been traced with REA.
- Icon from `src-tauri/icons/icon.svg`; regenerate every size with `scripts/gen-icons.sh`.
- `Contents/Resources/bin/`, copied into `$APPDATA/bin/` at startup like Conductor's: the pinned `gh`, and `checkpointer.sh`, `git-busy-check.sh` and `spotlighter.sh`. The scripts are shims (`src-tauri/resources/bin-tools/`) that run the app binary in tool mode (`openconductor --tool <name>`), so they reuse the native checkpoint and Spotlight code and keep the command line, output and exit codes of Conductor's scripts. `spotlighter.sh` runs the Spotlight watch loop on the current workspace into `$CONDUCTOR_ROOT_PATH` until it gets SIGINT, SIGTERM or SIGHUP. In `$APPDATA/bin/`, `.internal/openconductor` links to the running app binary. Test them without building the app with `scripts/test-bin-tools.sh`.

## CI

- `ci.yml` runs the checker's unit tests on every PR.
- `package-macos.yml` builds and ad-hoc signs the app on `macos-latest`, runs the checker with `--signing adhoc`, and uploads the zipped app and the check report. It runs on pushes to `main` and on PRs that touch packaging.

## Changing the contract

- New Info.plist key or entitlement: edit `src-tauri/Info.plist` or `src-tauri/Entitlements.plist`, rebuild and rerun the checker.
- New REA evidence from a newer Conductor: rerun `python3 tools/packaging_ref.py` and commit the new reference. CI fails if the committed copy does not match the evidence.

REA results for our own Developer ID build, and the REA gaps hit, are in `evidence/packaging/README.md`.
