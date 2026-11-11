# Config sync backend queue packet

Status: source authored only. No Cargo, Rust compiler, formatter, tests, dependency install, provider, app, browser, native, or acquisition command ran in the author lane. This packet is not behavioral or native-parity evidence.

## Production source

The harness imports `src-tauri/src/config_sync/mod.rs` directly. Its tests are the production module's `tests.rs`, not a second implementation. `commands.rs` is deliberately not included by the pure module or this harness. The parent owns Tauri registration and the final integrated PR.

The public wire model uses camelCase serde names. `diff(&Path)` returns `Diff`, and `sync(&Path, &[Selection])` returns `SyncResult` directly, as agreed in the source-author task. That direct result supersedes the older attached contract's `Result<SyncResult, String>` signature. The command adapters can reject IPC with static errors when home resolution, the blocking worker, or the private apply mutex fails.

Boundary Discipline keeps Tauri and home resolution outside the backend. Model the Domain puts categories and directions in enums and distinguishes available source names from all occupied destination names. Config parser and filesystem errors become static messages. Raw MCP values remain inside the Rust module.

## Retained reference basis

Source input was `config-sync-backend-source-7594.tar.gz`, attachment `5cb417a1-56cb-479b-95ce-36beab62b376`, SHA-256 `aa1e02563d5814d882d5b38e2ac62164bb120a6d2c3297ba4ecf7dd396f880b0`. Relevant retained REA spans were `paths.js`, `skills.js`, `copy-skills.js`, `copy-commands.js`, `diff-rules.js`, `mcp-codec-read-write.js`, and `sync-dispatch-and-consumers.js`. No reacquisition or native observation occurred in this lane.

The first eight attached synthetic tests remain byte-for-byte at the start of `tests.rs`. Added cases cover IPC keys, strict selections, name-only reports, empty and duplicate requests, malformed configs and roots, occupied targets and ancestors, frontmatter preservation, quoted names, uppercase Markdown extensions, unsupported MCP fields, known ignored metadata, stale config snapshots, failed-copy cleanup, symlink entries and ancestors, and aliases above the explicit home. None has run.

The root frontmatter follows the retained source exactly, including apostrophe doubling, BOM-aware detection, description, and blank line. Nested `SKILL.md` files and reverse copies retain their original bytes. Discovery accepts case-insensitive Markdown extensions. Copying uses the actual discovered source path rather than reconstructing a lowercase source extension. Same-stem ambiguities are not offered.

MCP fields follow the retained allowlists. Claude accepts absent, `stdio`, or `http` type with command or URL. Codex reverse excludes unknown fields, `enabled = false`, bearer-token variables, and environment-derived HTTP headers. The six retained metadata keys are ignored. Unsupported raw names remain occupied. Unrelated Claude JSON properties and unsupported definitions are retained semantically. Codex text is kept byte-for-byte as a prefix with new serialized sections appended; the combined TOML must parse before any replacement.

## MCP map-key correction and frozen source packet

The earlier unrun 24-case packet is withdrawn. This increment prepares 25 expected Linux cases, including one new forward-and-reverse MCP regression. The source packet is frozen for parent49/e1 admission; no execution or green result is claimed.

Re-reading the retained `mcp-codec-read-write.js` confirms `L$i` preserves `Object.entries` keys and `j$i`/`M$i` quote keys, including backslash, quote, newline, carriage return, and tab escapes. Retained `diff-rules.js` compares names without filesystem filtering. MCP IDs are map keys, not paths. The smallest correction makes `valid_name` accept MCP keys while leaving skill and command component guards unchanged. Fresh diff membership, occupied-name blocking, strict transport conversion, and the two fixed config destinations remain unchanged.

The new `quoted_mcp_map_keys_round_trip_without_becoming_paths` case uses only disposable synthetic homes. It checks exact offered keys, forward JSON-to-TOML conversion, reverse conversion using that TOML in a second home, restored JSON, and the complete fixture directory entries. IDs include `@fixture/service:v1`, a leading dot, backslash/quote, newline/carriage-return/tab, an empty key, `../escape`, and an absolute name confined to the outer synthetic fixture. Only `.claude.json` and `.codex/config.toml` may exist inside each home; the outer fixture must contain only the two homes.

The existing arbitrary-name case is renamed to `unoffered_file_and_mcp_names_do_not_create_config_roots`. Its requests and assertions are unchanged. File categories still reject unsafe names. MCP keys fail in that empty fixture because they are not offered by the fresh diff, not because map keys obey path syntax. No existing assertion or original attached test was weakened. This follows Laziness Protocol for the shared category-specific fix and Test Behavior, Not Implementation for the public diff/sync round trip.

No dependency, Cargo manifest, lockfile, harness entry point, adapter, registration, UI, or shared source changed in this increment. No cache inspection/population or toolchain execution occurred. Reference-source inspection, these unrun behavioral assertions, and native parity remain separate evidence levels.

## Bounded execution packet for e1 only

The author did not run this command. Queue admission and all execution belong to parent49 and e1.

```bash
CARGO_TARGET_DIR=/tmp/oc-config-sync-49-target cargo test --locked --offline --manifest-path evidence/settings/config-sync/behavior/Cargo.toml -- --test-threads=1
```

Use one foreground run with a bounded timeout. Missing offline dependencies or a lock mismatch are failures to report, not permission to install or use the network. The fixtures use `std::env::temp_dir()` plus process and counter IDs for explicit synthetic homes. They never read or set process `HOME`, invoke Tauri home resolution, inspect user configs or credentials, or launch a provider.

Only serde `1.0.229`, serde_json `1.0.154`, and toml `0.8.2` are direct dependencies, pinned to versions already in `src-tauri/Cargo.lock`. The projected lock retains the existing 20-package registry dependency closure and original checksums. Preserve-order features are enabled to retain the existing graph's ordering dependencies. Cargo has not validated that feature graph or this lock projection. No dependency cache was inspected or populated, no target directory was created, and no cache or build-size measurement was made. The projected lock may require queue-side correction using existing versions if Cargo rejects its resolved feature graph.

## Limits and review points

- Home-relative checks reject symlinks at the supplied home, provider roots, ancestors below home, and selected entries. They intentionally do not reject aliases above home, such as macOS `/tmp` and `/var` system aliases. The synthetic alias case is unrun.
- File and directory destinations use create-new operations. Failed copies attempt cleanup only for recorded created entries with matching identity. Directories are removed only when empty. Existing siblings and replacements are not recursively deleted. Empty newly created parent directories may remain after failure. Cleanup is best effort if the filesystem itself refuses access or removal.
- Existing MCP configs are staged in a private create-new temporary file, checked against the read snapshot, then atomically replaced. Missing configs are installed with a no-overwrite hard link. New files use mode `0600` on Unix. This preserves Codex raw text, not its inode, permissions, extended attributes, or modification time. Claude JSON whitespace is reformatted.
- The apply mutex serializes this app's apply commands only. It does not coordinate other editors. Snapshot comparison catches an observed concurrent config change, but there is no cross-process compare-and-swap or descriptor-relative filesystem transaction. Adversarial path swaps between metadata checks and mutation, and an external edit in the final compare-to-rename window, are not proven safe. Unix identity checks are stronger than the non-Unix fallback. This is a local Mac implementation, not a claim of cross-platform race hardening.
- Strict TOML parsing is deliberately safer than the retained section scanner. A malformed unrelated TOML region rejects only the MCP category. A valid inline table that cannot legally accept appended sections fails without changing the file. No rewrite of unrelated TOML is attempted.
- Duplicate identical selections count once. A stale or occupied selection fails. An explicitly requested unsupported MCP source also appears in `unsupportedMcp` by name, never by value.
- The harness does not compile the Tauri adapters, check registration, exercise the mounted UI, or prove reference/native parity. All compile, formatting, unit, integrated IPC, and native behavior checks remain NOT RUN by this source lane.
