# Full Disk Access native status command

Conductor Rebuild adds the native `check_full_disk_access` command without changing its Settings row or renderer bridge. The row remains a separate follow-on. No UI or native parity is claimed.

## Source and API

The checked source baseline is main `0d44915a5aefd9b8d4d128d401aea60b47fd9a1f`. A tracked search of `src` and `src-tauri` found no existing Full Disk Access command. That is a source baseline, not an executable failing test. There is no old native command to replay.

`src-tauri/src/full_disk_access/mod.rs` exposes `check_full_disk_access() -> Result<bool, String>` to Tauri. `src-tauri/src/lib.rs` adds only its module declaration and command registration. No backend wrapper is needed for this native-only increment.

On macOS, the adapter supplies `HOME` as an OS path and `File::open` to `probe::check_with`. The helper joins `Library/Application Support/com.apple.TCC/TCC.db` and attempts one read with a one-byte buffer. It returns false only for an open or read error whose kind is `PermissionDenied`. Successful reads, including zero bytes, other handled errors, and absent HOME return true. It does not retry interrupted reads.

The ordinary macOS command returns `Ok(bool)`, not a typed error. The boolean is a fail-open heuristic, not proof that macOS granted Full Disk Access. Exception or unwind behavior is not reconstructed.

On other platforms, the command rejects with `Full Disk Access status is only supported on macOS`. This is an OpenConductor design choice. The packet does not establish Conductor's non-macOS behavior.

## Immutable reference

`reference-v4.tar.gz` preserves the exact supplied packet, SHA-256 `685ac6011116c6153af97ee8d739c914fc452eac23690165c840ff207d3995fc`. Its `current/` snapshots and ownership notes are historical packet material, not this branch's current state.

The packet binds Conductor 0.87.6 arm64 executable SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d` through REA `inspect-macho` evidence `ev_0cf38b016e6c7595876a84f89c11d46541a225caf37f0317089a21ff09d2da67`. Supporting `nm` and `otool` evidence maps command-length 22 at `0x100493a6c`, wrapper `0x10048d2b0`, handler `[0x1006e5f18, 0x1006e6198)`, and its bool-specialized Tauri responder. The handler interval contains 160 instructions.

The packet's `source/provider-gap.json` retains the unavailable REA deep providers. No provider installation or new acquisition occurs here. Static recovery is not original Rust source, decompiler output, or observed execution. The packet's verifier checks retained bytes and anchors, not native behavior.

## Run the bounded checks

From the repository root, run either command. Neither invokes the production adapter or reads real environment or filesystem probe boundaries.

```bash
python3 evidence/settings/full-disk-access-native/verify.py
rustc --edition 2021 --test -D warnings src-tauri/src/full_disk_access/probe.rs -o /tmp/fda-fixtures && /tmp/fda-fixtures
```

The Python check verifies the immutable packet hash, safely extracts regular files into a temporary directory, and runs the packet's inspected data-only verifier. It then compiles the actual pure helper and its dedicated injected fixtures. It does not run the target executable or emulate it.

Five Rust tests cover absent HOME without opening, empty HOME as a present path, both successful read lengths, and open/read classification across 12 error kinds in simple and custom error representations. Fake readers enforce a one-byte buffer and exactly one read. The tests also run through the existing Tauri app test suite on CI.

Four compiled mutants must fail these same fixtures. They change the denied error kind, read length, absent-HOME short circuit, and zero-byte result. These are fixture discrimination checks, not actual pre-fix product behavior. A mutant compilation failure is not accepted as a failed behavior check.

## Verification and boundaries

- Passed on Reason cloud: all 15 retained static checks, five pure fixture tests with warnings denied, and four compiled mutants rejected by assertions.
- Passed on Reason cloud: `git diff --check`.
- Incomplete locally: `CARGO_NET_OFFLINE=true cargo check --locked --all-targets --manifest-path src-tauri/Cargo.toml` cannot resolve uncached `aes-gcm`. No dependency installation or online retry occurred. Exact-head CI owns app check, test, clippy, frontend build, and macOS packaging.
- Not run locally: frontend typecheck because `node_modules` is absent; formatting check because `rustfmt` is unavailable. No installation occurred.
- Not run: production command invocation, real HOME lookup, protected database open/read, native permission state, app launch, provider runtime, mounted UI RED/GREEN, screenshots, or visual parity.

No GeneralPage, notification code, original seven-case FDA UI fixture, frozen notification fixture, permissions, entitlements, capabilities, persistence, or runtime infrastructure changes belong to this increment. The native command must be consumed by a separately owned UI/query follow-on before Settings behavior changes.
