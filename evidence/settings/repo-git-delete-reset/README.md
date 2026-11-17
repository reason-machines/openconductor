# Repository archive setting Reset

Conductor Rebuild publishes SAME49's unchanged, validated Reset correction. SAME49 retains source, verification and correctness ownership; D7 owns this standalone publication. Only `src/settings/rows/RepoGitRows.tsx` and its new `repoGitDeleteReset.test.ts` fixture change outside this evidence directory.

The configured repository-local "Delete branch on archive" row gains a Reset action. Reset calls the existing `repoSettingsSetLocal(path, key, null)` removal path and refresh hook, rather than writing `false`. Toggle writes and other settings are unchanged.

## Source and immutable proof

[Original qualified delivery](qualified-delivery.tar.gz), attachment `67a69cf1-3d20-43c3-90cc-1d5d4e2dfed1`, is retained byte-for-byte, 78,623 bytes, SHA256 `3ca5a2c32aab0782795e696f9cfda5983e8cfe6d0d3f9eba4a30de6e6c9bdaf5`. Its `MANIFEST.json` binds every source/proof file. It contains only the Reset delivery, not SAME49's mixed branch. Archived Python drivers and inert fixture references are retained evidence, not new executable integration.

`proof/rea/source.json` and nine reference spans bind the retained Conductor 0.87.6 shipped renderer/index evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. This is historical REA source evidence, not a fresh native comparison. The retained REA semantic analysis exhausted heap; bounded original byte spans supply the recorded source evidence.

Qualified main: `a66b72e9fc3790a0c93ac614a901da727929c5d9`.

- Baseline component SHA256: `39d30b59f842848c452fa2d1e035e701d11891492b06f5269f4bc18398ba10ca`.
- Delivered component SHA256: `df848021c3b635be54ea011775ddab9b0e4b4372baa27160bb771e816af0a9cb`.
- Qualified test SHA256: `5fea1c01b53720fb55577bfdd6831c7109f1c69d5a196340d9d5ecc63efdffc6`.
- Original application patch SHA256: `e635f6390bddb0388ae3fb78bc20c94282119de8951d075b1f5c29e1737c8ff7`.

D7 preserved its assigned branch and original `09a6f114` backup, normally merged main, and verified its entire tracked tree equalled main before application. All 17 registered source/dependency footprints, Cargo.lock, 57 archived member hashes and patch applicability passed. The two delivered files match the exact validated output. Held MCP, TodoRead, display-cap and other pending work is excluded.

## Executed validation retained from SAME49

These checks ran in SAME49's serialized Cloud355 unit, not again during publication. Full commands, environment, TAP, exits, dependency binding and original cleanup receipts are under `proof/0107/` in the archive.

Identical baseline and candidate command, with `NODE_OPTIONS=--max-old-space-size=1024`:

```bash
nice -n 19 timeout --kill-after=5s 120s node --test --test-concurrency=1 src/settings/rows/repoGitDeleteReset.test.ts
```

- Baseline reproduced the failure: exit 1, nine collected, five passing controls and four intended assertion failures, 0.880 seconds.
- Candidate passed: exit 0, all nine passed, 1.152 seconds.
- Both runs had zero skipped, cancelled or todo cases.

Adjacent tests passed, exit 0, all five passed, 0.585 seconds, with the same 1024-MiB heap bound:

```bash
nice -n 19 timeout --kill-after=5s 120s node --test --test-concurrency=1 src/settings/rows/rowModel.test.ts src/settings/prefs.test.ts
```

Typecheck passed, exit 0, 38.798 seconds, with `NODE_OPTIONS=--max-old-space-size=1536`:

```bash
nice -n 19 timeout --kill-after=5s 180s node node_modules/typescript/bin/tsc --noEmit
```

The earlier exact locked Rust generic-removal test passed once in `proof/0101/` and was explicitly reused under identical backend/Cargo.lock/argv bindings, not rerun. It does not prove the exact flag's persisted filesystem roundtrip:

```bash
nice -n 19 timeout --kill-after=5s 300s cargo test --locked --manifest-path crates/scripts/Cargo.toml config::effective_tests::local_writes_set_and_remove_only_known_keys -- --exact
```

The original `0101` typecheck failure, TS2550 on `Object.hasOwn`, is retained. The separately qualified `5fea1c01` fixture fixes that target-compatibility issue without changing assertions; it is the fixture actually executed and delivered.

## Timing deviation and limits

Source/setup took 59.36 seconds against a 30-second allocation. The original driver did not stop at that allocation. Total execution was 100.924 seconds within the 650-second cap, but not every timing bound passed. No tests were rerun to conceal the deviation. Future driver enforcement is archived as source/AST inspection only and was not executed.

Original release `2026-11-13T01:12:02.219566Z` records no owned jobs, servers or runtime. Publication ran no Node/npm, install, test, build, native/browser, provider or package command. Only ordinary PR-triggered CI is requested; no manual workflow dispatch is authorized here.

Actual Base UI menu behavior, hover, layout, keyboard focus, exact-flag filesystem persistence, native parity and side-by-side appearance remain unverified. No screenshot exists because browser/native execution was excluded. Package inclusion and native acceptance remain with the existing serialized release owner, not this publication unit. Exact-head hosted CI and merge are separate from the retained local validation.
