# Workspace text reader and editor validation

Conductor Rebuild validated the unchanged nine-file core from `669170efe013ea32fa60fff782a1a5ca242026a5` after merging main `a66b72e9fc3790a0c93ac614a901da727929c5d9` into the assigned branch. The tested product tree is `7adf542cb1fddc7ebd36f9ad3cb71283088ed697`. The original nine file contents and all 419 frozen input hashes remained unchanged. Caller navigation, raw-layout and shortcut candidates are not included.

## Scope

The core adds a descriptor-confined `workspace_read_text` command and a reusable `WorkspaceFileView` for existing UTF-8 workspace files without requiring a Git change or Markdown extension. It reuses the existing editor and save port. Target-keyed pending-save completion prevents replacement readers from publishing pre-save text. Required `readOnly` and view visibility restrict editing and saving.

This PR does not connect the component to workspace navigation. That caller is a separate dependent change, to be delivered against main after this core merges. It does not claim full app or native parity.

[The original source contract](source-contract-original.md) is retained verbatim as historical context. Its original unrun statements are superseded only by the actual results below. Baseline is **NOT_DEFINED/NOT_AUTHORED**, because this is new-feature candidate validation, not a bug regression. Missing dependencies are not behavioral failures.

## Actual checks on Reason Cloud

The current allocation was `ACC_DE6_CORE33_CANDIDATE_20261113T0122`, with a 2700-second inclusive bound. [Source binding](source-binding.json), [terminal receipt](terminal-receipt.json), full logs and the current resource wrapper are retained beside this file. Resource measurements are partial sampled owned-process accounting, not exact peak memory or private-cgroup capacity proof.

1. Dependency restoration passed. `npm ci --ignore-scripts --no-audit --no-fund` completed in 7.26 seconds without changing the npm lockfile.
2. The original real Tauri command **failed during platform setup**, with exit 101 after 108.97 seconds. `glib-sys` could not find `glib-2.0 >= 2.70` or `glib-2.0.pc`. **No Rust test executed and no Rust credit is claimed.** No standalone reader extraction or feature changes were substituted.
3. The original Node target passed **94 tests, zero failures and zero skips**. This includes 20 component/save-hook cases, seven read-lifecycle cases, and 67 existing adjacent cases. The four deferred-save cases are within the twenty, not additional cases.
4. `npm run typecheck` passed in 36.98 seconds.

The original commands were run in order:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace_file::tests
node --experimental-strip-types --test src/features/files/readText.test.ts src/features/files/WorkspaceFileView.test.ts src/features/files/readMarkdown.test.ts src/features/files/filePreviewWiring.test.ts src/features/diff/editorContents.test.ts src/features/diff/EditInViewer.test.ts src/features/diff/copyFile.test.ts src/features/diff/wholeFileRefresh.test.ts
npm run typecheck
```

The current allocation added `nice -n 19`, `CARGO_BUILD_JOBS=1`, `RUST_TEST_THREADS=1`, Node `--test-concurrency=1`, and heap limits of 1024 MiB for Node and 1536 MiB for typecheck. These are current resource controls, not historical fixture flags. Each stage receipt records its full actual arguments, environment additions, exit, duration and log hashes.

Cargo automatically added a `sqlx` dependency edge to its lockfile. That change was restored to the exact original bytes and is not part of this PR. The current-main manifest already contains the dependency; the lock discrepancy is a separate prerequisite issue, not a core change.

## Remaining qualification

The six new Rust cases and original Markdown controls still require the original real Tauri target on an SDK-qualified platform. All exact-head checks must pass before merge. Read-only inspection found no installed GLib, GTK or WebKitGTK development packages on this cloud machine. No package installation or second runtime was started after release.

Browser, native, package and screenshot checks were **not run**. The allocation excluded those surfaces, and this component is not yet wired into navigation. The React fixture uses real React and the production component/save hook, but substitutes renderer drawing and desktop transport. Its pass does not prove Pierre rendering or native behavior.

Cleanup removed only this run's newly created `node_modules` and `src-tauri/target`. Both lockfiles and all frozen input hashes were verified unchanged. Terminal owned jobs, servers and runtime are empty. Merge remains blocked on real Rust qualification; later caller, raw-layout and shortcut work must stay separate.
