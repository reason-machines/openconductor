# `.bin-source-markers.json` (`persistence.bin-source-markers`)

Parent REA ledger obligation `pkg.first-run-bootstrap` ("First run copies bundled bin/ toolchain into App Support").

## Conductor 0.87.6

- REA `capture-process` of a first start under a throwaway HOME ([`../../runtime/first-run-files.tsv`](../../runtime/first-run-files.tsv), [`../../runtime/README.md`](../../runtime/README.md)) leaves `Library/Application Support/com.conductor.app/.bin-source-markers.json` (1,058 bytes, mode 0600). Read on Sven's Mac from that throwaway home (REA test data, not Sven's own app data): one object with 12 keys, exactly the bundled `bin/` files (`gh`, `watchexec`, `checkpointer.sh`, `git-busy-check.sh`, `spotlighter.sh`, `conductor`, `.internal/{actions,agent-launcher,conductor-runtime,internal,logger,sidecar}`), each `{"created_ms", "modified_ms", "size"}` of the file in `Contents/Resources/bin/` (for example `"gh": {"created_ms": 1790625354000, "modified_ms": 1790625354000, "size": 40024608}`; the sizes match the bundle).
- `strings` on `Contents/MacOS/conductor`: source path `src-tauri/src/binary_manager.rs`; messages "Failed to write bin source markers: ", "Failed to serialize bin source markers: ", "Failed to create bin directory: ", "Failed to resolve bin directory: ".
- Not observed: the exact skip rule. The markers record the source, not the installed copy, so the rebuild copies a file when the source differs from its marker or the installed copy is missing.

## Rebuild

| Part | Where | Tests |
|---|---|---|
| Marker type, load (missing or unreadable is empty), atomic save, install decision | [`bin_source_markers.rs`](../../../src-tauri/src/bin_source_markers.rs) | `bin_source_markers::tests::*` |
| `bundled_bin::install` records a marker per installed source file (keys `/`-separated under `bin/`), skips files whose source matches, drops markers of removed sources; replaces the earlier same-length check | [`bundled_bin.rs`](../../../src-tauri/src/bundled_bin.rs) | `bundled_bin::tests::records_source_markers_and_reinstalls_same_size_updates` and the existing install tests |

Differences: on file systems without a creation time `created_ms` falls back to the modification time. Keys are written sorted.

## REA

No REA tool returns this file's semantics: `inspect --provider ghidra` / `search` time out or cost ~30-40 min per call on the 70 MB binary (see `rea-test-report.md`), and REA's string search does not split Rust's packed literal blobs, so the messages above came from `strings`.
