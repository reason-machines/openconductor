# Rust setup failure before the delimiter regression

Conductor Rebuild ran the admitted backend stages on Cloud352 (`00637189-5c55-416e-b457-ed7419fb739a`). The baseline validator and all three frozen tests remain unchanged. **No Rust regression test executed, and GREEN did not run.**

## Actual terminal results

The [grant receipt](ordinary-c18-rust-grant.json) records the exact foreground, serial commands. Each stage ran once with scheduling priority 19. Test compilation used one build job and no debug information.

1. Lock generation passed, exit 0, at 11:49:08.728305–11:49:09.104043 UTC. Duration was 0.376 seconds within its 60-second cap. [Raw log](lock.log), [terminal receipt](lock.result.json).
2. Locked fetch passed, exit 0, at 11:49:24.332642–11:49:24.802866 UTC. Duration was 0.470 seconds within its 120-second cap. [Raw log](fetch.log), [terminal receipt](fetch.result.json).
3. Baseline RED setup failed, exit 101, at 11:49:40.523990–11:49:55.689844 UTC. Duration was 15.166 seconds within its 120-second cap. [Raw log](red.log), [terminal receipt](red.result.json).

The RED command was:

```bash
CARGO_BUILD_JOBS=1 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_TARGET_DIR=e2e-artifacts/dot-prefix-c18/rust-target nice -n 19 timeout --kill-after=5s 120s cargo test --locked --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend/Cargo.toml dot_prefix_ -- --nocapture
```

Compilation stopped in the production `oc-scripts` dependency with E0277 at `launch.rs:219`, `:220`, and `:239`. Its PTY launch code requires conversion from rustix `Errno` to `std::io::Error` and rustix `OwnedFd` to `std::fs::File`. The compiled dependency lacks those conversions. This is a setup failure, not the intended terminal-dot RED result.

No retry, product edit, assertion change, or subsequent Cargo command ran. All six source pins passed unchanged readback. The [saved validator baseline](validate.baseline.rs.txt) remains exact.

## Lock and resource boundaries

The [generated evidence lock](../backend/Cargo.lock) is 6,696 bytes, SHA-256 `ae1cc2d76efd6ed9867bce919be1ff06d20efff0ac88ac2ba7869df9153ed71b`. Direct versions remain serde `1.0.229`, serde_json `1.0.154`, toml `0.8.2`, and local oc-scripts `0.1.0`. No manifest changed.

Target size was 97,617,627 bytes, below the 2 GiB cap. Home disk had 32,737,071,104 bytes free at release. There was no timeout or resource warning. The [explicit slot release](slot-release.json) at 11:50:18.445929 UTC records no own runtime jobs. ACC was notified immediately, freeing the serialized queue.

## Source-only recovery proposal

A fresh fetch checked main `1286465cb69763efaa1367c49fdebc88ab4da86d`. The production scripts manifest, PTY launch code, app manifest, and validator match that main.

The downloaded `rustix-openpty 0.2.0` manifest disables rustix default features. The compiled rustix fingerprint contains `alloc`, `fs`, `process`, `pty`, `stdio`, and `termios`, but not `std`. In downloaded rustix `1.1.6`, `src/io/errno.rs:57` gates `From<Errno> for std::io::Error` on `std`. Its std polyfill reexports the standard library's owned file-descriptor type. This identifies the missing feature at the conversion boundary.

The [separately versioned test manifest](../backend-std-v2/Cargo.toml) proposes enabling `rustix/std` in this isolated test graph. It reuses the original immutable test file and the already-resolved rustix version. It does not edit `oc-scripts`, any production source, the original manifest, or any assertion. [The recovery request](../backend-std-v2/recovery-request.json) records source hashes and bounded offline commands. **The proposal has not executed; whether it clears setup and reaches the intended RED remains unverified.**

The terminal-dot defect remains unfixed in Rust and blocks #1170's merge. Frontend results remain separately verified. No app build, native behavior, screenshot, provider, package, or release inclusion was checked. The fixed #992 release cut is unchanged.
