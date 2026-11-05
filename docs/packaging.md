# Packaging (macOS)

## Build and run a dev build

On a Mac with Xcode command line tools, Rust and the Tauri CLI (`cargo install tauri-cli --version ^2`):

```bash
scripts/package-macos.sh            # debug build, signed
open src-tauri/target/debug/bundle/macos/OpenConductor.app
```

`--release` builds the optimized bundle under `src-tauri/target/release/bundle/macos/`.
For day-to-day work use `cargo tauri dev` instead (no bundle, hot reload).

## Signing

The script signs with `$APPLE_SIGNING_IDENTITY` when set. Otherwise it uses the first
`Developer ID Application` identity in the login keychain, and falls back to ad-hoc
signing (`-`) when there is none. The app is built with the hardened runtime and
`src-tauri/Entitlements.plist`. It is not notarized, so Gatekeeper treats a copy
downloaded from elsewhere as unnotarized. Builds made and opened on the same Mac
run normally. Notarization needs `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`
(Tauri reads them during `cargo tauri build`) and is not set up here.

## What the bundle contains

| File | Purpose |
| --- | --- |
| `src-tauri/tauri.macos.conf.json` | macOS overlay merged over `tauri.conf.json`: bundle targets, icons, minimum macOS, entitlements, hardened runtime |
| `src-tauri/Info.plist` | merged into the bundle's Info.plist: folder access prompts, `openconductor://` URL scheme |
| `src-tauri/Entitlements.plist` | hardened-runtime exceptions (JIT, unsigned executable memory) |
| `src-tauri/icons/icon.svg` | OpenConductor icon source. Regenerate the sizes with `cargo tauri icon src-tauri/icons/icon.svg -o src-tauri/icons` |

`tauri.conf.json` (owned by the app shell) should set `productName` to `OpenConductor`
and `identifier` to `com.reasonmachines.openconductor`.

## Reference: what Conductor 0.87.6 ships

Read on the installed app with `plutil` and `codesign` (REA `inspect` on the bundle
needs a native provider that was not configured; see the REA gaps in the PR):
Developer ID signed with the hardened runtime; entitlements `cs.allow-jit`,
`cs.allow-unsigned-executable-memory` and `device.audio-input` (the last for
speech-to-text; omitted here until we have that feature); Info.plist folder-access prompts
for Desktop, Documents and Downloads, a custom URL scheme, `LSMinimumSystemVersion` 10.13;
`Contents/Resources/bin` holds helper executables (CLI shim, sidecar runtime, `gh`,
`watchexec`). We set macOS 13 as the minimum, and we bundle sidecars once they exist
(`bundle.externalBin`).
