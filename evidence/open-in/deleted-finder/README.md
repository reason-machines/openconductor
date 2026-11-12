# Deleted-file Finder regression

Conductor Rebuild owns `DELETED-FINDER-CONSUMER-JOIN-15` and PR #1100. The hosted baseline reproduced four intended assertion failures and six passing controls on macOS and Ubuntu. The candidate repair preserves that frozen fixture. Candidate behavioral GREEN is pending.

## Source contract

Retained Conductor 0.87.6 REA bytes connect the diff's current selected path through `Jqo`, `bji`, `GPo`, `NPo`, `tee`, and `uD`. Rename `oldPath` is a label, not the open target. For a primary file, Finder reveals an existing file on macOS. Otherwise it opens the immediate parent bounded by the workspace. The source does not search for the nearest existing ancestor.

The renderer imports `Kc` from index export `W`, which is `Ce`. For the local host, `Ce` invokes `execute_shell_command` through the actual Tauri invoke wrapper. Retained symbol-bounded arm64 disassembly connects that command's argument decoding to its blocking worker and `Command::spawn`. This is a static consumer join, not successful original command execution or native acceptance.

`source.json` pins both original assets, 25 UTF-8 byte spans, REA evidence IDs, seven main sources at `516a58c931f31097007c97e844a1bb56d118c528`, the retained native packet, and the fixture. `native-source-only.tar.gz` retains the original static REA and disassembly packet, including its recorded decompiler failures. Nothing from that packet executes in the regression.

## Observed test-first baseline

Head `b21dcb9fc2046da3480f1576d535c203cb6d9f7f` ran through ordinary hosted CI, workflow `43120883546`.

- [macOS app job](https://github.com/reason-machines/openconductor/actions/runs/43120883546/job/130860737593) observed the four intended failures and six passing controls. The full suite reported 1,051 passed, four failed, and one ignored.
- [Ubuntu app job](https://github.com/reason-machines/openconductor/actions/runs/43120883546/job/130860737680) observed the same four failures and six passing controls. The full suite reported 1,032 passed and four failed.

The deleted file, extensionless file, and workspace-root file failed with `Not a folder or file`. The missing-parent case recorded no launcher arguments instead of one immediate-parent attempt. These are actual assertion failures, not compilation errors or queued-run predictions. `hosted-baseline.json` retains all eleven fixture-result lines from each job, including the separate child helper entry.

## Repair boundary

`open_in_app` accepts optional `fileContext.workspacePath`. This is an OpenConductor interface design, not an original API name or trusted authorization source. A missing target can use the fallback only for Finder, with an existing absolute workspace, a normal relative path inside that workspace, and no symlink traversal. Existing targets keep their original path and dispatch. Missing editor targets remain rejected.

The fallback attempts the exact immediate parent. A missing parent is not replaced by a nearer existing ancestor. Launch failure still propagates. The source's fallback behavior and the added containment guards are separate facts. The guards prevent broadening the existing path boundary through the new metadata.

The diff header forwards context only for deleted Finder entries. Existing Finder, editor, and Alacritty payloads stay unchanged. Two old Rust fixtures directly call `open_in_app`; their only migration adds `None` for the optional argument. `direct-call-baselines` preserves their full prior bytes. `verify_candidate.py` checks that exact replacement without changing any inputs or assertions.

## Executable checks

`src-tauri/src/open_in/deleted_finder_ipc.rs` invokes the real command through Tauri mock IPC. Every case runs in a separate child test process with isolated `PATH`. Only external `open` and `xdg-open` are fake. No application opens and the parent environment is unchanged.

The frozen ten cases cover existing file and directory, deleted file, deleted extensionless file, deleted workspace-root file, missing immediate parent, rejected missing editor target, rejected relative path, unknown app, and rejected outside-workspace target. The child entry is an eleventh test function, not a behavior case. The fixture SHA256 remains `873df7d98a6dbf9d4b685c2e35ceffd7aae09060637ed1c7960d947d99b24070`.

The candidate adds separate boundary tests for invalid roots, sibling paths, parent traversal, symlinked parents, and broken leaf links. A new frontend integration file drives the real `FileDiffView`, `FilePathChip`, and IPC adapter with mocked external dependencies. It checks the deleted-Finder context and three unchanged-payload controls. These additional candidate checks are not part of the frozen baseline or observed GREEN yet.

The ordinary existing jobs run `cargo test --locked` and the frontend test suite. A focused Rust equivalent is:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib open_in::deleted_finder_ipc -- --nocapture
```

No workflow, manual dispatch, local Rust, local Node, browser, or native allocation was added. Frozen #1080, #1086, the existing Alacritty frontend controls, and the ten Finder IPC cases remain unchanged.

## Verification limits

`python3 evidence/open-in/deleted-finder/verify_source.py` checks original source integrity, loader registration, and fixture immutability. Its `--baseline` mode is for the historical test-only checkout, not the repaired candidate. `python3 evidence/open-in/deleted-finder/verify_candidate.py` checks baseline receipts, preservation, mechanical caller migration, and candidate source wiring. Neither Python command compiles Rust or TypeScript or proves parity.

The single `FileDiffView` caller prop changes its whole-file checksum. The first candidate head therefore stopped the moved-anchor paired job at its candidate-identity preflight, before any paired behavior ran. Only that manifest’s candidate hash was refreshed. `previous-pins/moved-comment-anchors.json` preserves the complete previous manifest. `python3 evidence/open-in/deleted-finder/verify_pin_maintenance.py` proves the exact one-field replacement, the single caller-prop change, all baseline and candidate identities, and unchanged fixture, runner, and workflows. This preflight is not a paired behavioral pass.

The repair was grounded again at main `bb717dad2e1c4cbcbdba3d29d607a76a069f7f85`. Candidate compilation, unchanged-fixture behavioral GREEN, every exact-head workflow, merge, and consuming-main package verification remain pending. No merge is requested until every exact-head check and workflow positively passes.

Native Finder activation, side-by-side screenshots, GUI behavior, and a released app remain NOT_RUN. No screenshot is supplied because this lane has no native or browser admission.
