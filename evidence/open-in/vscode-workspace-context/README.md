# VS Code workspace context regression baseline

Conductor Rebuild installs the frozen contract on main `c5c1dcefffa5186d24e11491a446616236d3d612`, after [#1100](https://github.com/reason-machines/openconductor/pull/1100) actually merged at `f0c1828b0e23cecb1ee71cd8864669dd38a4c57b`. This change adds tests, evidence, and a macOS-only test module registration. It does not change product behavior.

## Retained source

[Original REA provenance](receipt.json) and [exact source spans](reference/) record Conductor 0.87.6. The source joins the primary diff header to workspace lookup, selected-app resolution, and `code <workspace> --goto <file>`. Its completed-nonzero fallback opens only the file in Visual Studio Code. Static source establishes the contract, not observed execution. Any `fileContext` representation is an OpenConductor design, not original API or trusted authorization.

The old source inquiry remains unchanged and names its historical main. [Fresh binding](fresh-main-binding.json) records the current main blobs separately, with [complete baseline snapshots](baseline/).

## Frozen checks

[The sealed contract](preparation/contract-v1.json) fixes ten real Tauri IPC scenarios and three mounted header payload scenarios. The shared [cases](cases.json) pin literal child argv, call order, no-fallback-on-success, nonzero fallback, and fallback stderr. Only external programs are fake in the Rust stage. The header stage mounts actual FileDiffView, FilePathChip, and the IPC adapter with unrelated rendering dependencies replaced. They are two distinct stages, not a single live end-to-end process.

Four backend scenarios are expected to fail their intended assertions before a fix, with six controls passing. Two header payload scenarios are expected to fail, with one unrelated-app control passing. These are expectations, not observed RED. Loader, compiler, and environment failures do not qualify. The fixture bytes are preserved exactly from preparation. No product change is permitted until ordinary automatic hosted checks reproduce the intended failures.

The new tests run through existing `cargo test --locked` on macOS and `node --test "src/**/*.test.ts"`. Linux does not run the macOS-only editor fixture. No workflow, historical Finder fixture, or paired diff assertion is changed. [Full preparation limits](preparation/README.md) remain part of this contract.

## Verification

- `python3 evidence/open-in/vscode-workspace-context/verify_publication.py` checks fresh-main bindings, retained REA spans, installed fixture bytes, excluded historical fixtures, and #1100 ancestry.
- `python3 evidence/open-in/vscode-workspace-context/preparation/verify_frozen_contract.py --self-test` checks sealed preparation and loader import coverage. Its source-main field remains historical by design.
- `git diff --check` checks whitespace.

These are source and integrity checks only. Rust compilation, TypeScript compilation, mounted behavior, and hosted intended assertion RED are NOT_RUN at publication. No local JS/Rust/provider or native executor is used. No screenshot is provided because no browser/native GUI execution is admitted. Real VS Code/Finder activation, released-app behavior, and visual parity remain NOT_RUN.

Before a later product fix is accepted, workspace containment, traversal and symlink escape need dedicated safety proof alongside the fixed absolute/existing-path controls. No-context paths, other applications, Finder, and nonzero fallback must retain their contracts.
