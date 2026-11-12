# Terminal-dot backend regression proof

Conductor Rebuild verified the terminal-dot delimiter on Cloud352 (`00637189-5c55-416e-b457-ed7419fb739a`) under the separate [STD-V2 grant](ordinary-c18-rust-std-v2-grant.json). The original failed attempt, manifest, lock, logs, frontend fixtures, and assertions remain unchanged.

## Change and source

The only new production change is in `valid_branch_prefix`: reject an original `./` suffix before stripping one optional slash, then allow a final period. All other guards remain. The same production settings validator and naming code now accept `team.` and produce `team.tokyo`; the frozen controls still reject invalid components and preserve other delimiters and modes.

Starting assigned-branch head was `307ab9f7c9ddc41b27dcf346da365a1184c9f539`, after an ordinary conflict-free main incorporation. [Pre-execution qualification](pre-execution.json) records the six exact backend pins and 287 guarded tracked files. The unchanged validator baseline is preserved as [raw source](validate.baseline.rs.txt). No production `oc-scripts`, model, naming, GitPage, frontend, or package dependency changed in this execution.

The separate test-only manifest enables `rustix/std` for the already-locked 1.1.6 version. This cleared the original E0277 setup failure without changing production dependencies or test assertions. It reuses the exact original three-case harness, SHA-256 `92bcfae25ee96df34a6687b450e84b4690800b3b0eaa4104c645f9e1386579ef`.

## Commands and actual outcomes

Every Cargo command ran once, serially and in the foreground, using the installed stable toolchain (`RUSTUP_TOOLCHAIN=stable`). There was no installation, retry, timeout, or dependency upgrade.

1. Restore original locked dependencies: **passed**, exit 0, 0.814265 seconds, 13:15:47.359078–13:15:48.168152 UTC. [Log](restore-fetch.log), [receipt](restore-fetch.result.json).

   ```bash
   nice -n 19 timeout --kill-after=5s 120s cargo fetch --locked --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend/Cargo.toml
   ```

2. Generate the separate STD-V2 lock offline: **passed**, exit 0, 0.105005 seconds, 13:16:46.072783–13:16:46.177979 UTC. [Log](offline-lock.log), [receipt](offline-lock.result.json).

   ```bash
   nice -n 19 timeout --kill-after=5s 60s cargo generate-lockfile --offline --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend-std-v2/Cargo.toml
   ```

3. Baseline RED: **reproduced the intended failure**, exit 101, 19.212140 seconds, 13:17:06.237790–13:17:25.445857 UTC. Exactly one delimiter failure and two passing controls; 27 unrelated tests were filtered out. Compilation completed successfully. [Log](red.log), [receipt](red.result.json).
4. After the sole validator change, identical GREEN: **passed**, exit 0, 0.550205 seconds, 13:18:14.235350–13:18:14.787746 UTC. All three cases passed, none failed or ignored, with the same 27 filtered tests. [Losslessly compressed raw log](green.log.gz), [receipt](green.result.json).

The GREEN terminal output ends with an extra blank line. Its exact bytes are stored as gzip rather than edited to satisfy Git whitespace checks. [The encoding receipt](green-log-encoding.json) records the raw and compressed hashes; decompression reproduces the untouched output.

The RED and GREEN command and environment were identical:

```bash
CARGO_BUILD_JOBS=1 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_TARGET_DIR=e2e-artifacts/dot-prefix-c18/rust-target nice -n 19 timeout --kill-after=5s 120s cargo test --locked --offline --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend-std-v2/Cargo.toml dot_prefix_ -- --nocapture
```

RED failed at `dot_prefix_accepts_delimiter_at_production_settings_boundary`: `validation::validate(&settings).is_ok()` was false for `team.`. Both invalid-ref and other-delimiter controls passed before and after the fix. No assertion or fixture byte changed.

## Lock and resource evidence

All 28 original registry package name, version, source, and checksum tuples are unchanged. The [cache verification](restored-cache-verification.json) checks each downloaded archive against the original lock checksum and compares every extracted file to its archive. This Cargo installation does not create `.cargo-checksum.json`; archive and extracted bytes were verified directly instead.

The new lock differs only by adding the already-resolved `rustix` to the root harness dependency list:

- Original manifest: `e5ba2cba5878e85564af9f5c0ff97281528356747f26dacceed8ddc31d5c2253`.
- Original lock: `ae1cc2d76efd6ed9867bce919be1ff06d20efff0ac88ac2ba7869df9153ed71b`.
- STD-V2 manifest: `5dedf99ee94a0524aa18408f55e6d93146a7d114f73445c03788350f1e148c9c`.
- Frozen STD-V2 lock: `453112cddc4865307bcbfc8bbc52f01884b76d533e9b5526c12cc61d6499d186`.
- Fixed validator: `eb29acf9f9bbf18b58b3cdd792a966fa785fa7509784cea8c6e7e787424d2e2b`.

The target grew from zero to 151,420,462 bytes, below the 2,147,483,648-byte budget. Available disk after GREEN was 40,366,329,856 bytes. Target size, disk, and visible jobs were recorded before and after every phase, not monitored continuously or enforced as a hard aggregate quota.

**BACKEND SLOT RELEASED at 13:19:08.076740 UTC**, with no own runtime jobs visible in this execution namespace. This observation does not cover other Sessions or every process on Cloud352. [The release receipt](slot-release.json) includes each stage, exact source identities, original package tuples, and observation limits. Target artifacts are retained; no background process or watcher remains.

## Limits and delivery

The original E0277 attempt remains a setup failure, not a delimiter RED. This separately admitted run supplies the missing behavior proof. Frontend 13-case and 21-case passes and typecheck are historical results on their recorded inputs, not rerun here.

No screenshot is supplied because browser and native execution were excluded. Full application build, native storage, real Git workspace creation, provider operation, original-app side-by-side parity, package, deployment, and release inclusion remain unverified. The fixed #992 package cut is unchanged. Existing #1170 remains ready against main; merge requires every enabled exact-head check and triggered workflow to pass.
