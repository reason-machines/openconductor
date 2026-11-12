# VS Code workspace-context implementation

Conductor Rebuild qualified the unchanged four Rust assertion failures with six passing controls and two mounted header failures with one passing control in automatic run [43143092453](https://github.com/reason-machines/openconductor/actions/runs/43143092453). [Bounded raw evidence](hosted-red.log) and [receipt](hosted-red.json) record that baseline.

## Backend increment

The existing optional FileContext now bounds a VS Code file request to an absolute existing directory, rejects parent traversal and root or descendant symlinks, and confirms canonical containment before launching. Invalid supplied context fails closed. Requests without context, directories, Finder and other editor dispatch retain their previous paths.

Retained `OGe` and the VS Code catalog establish inherited PATH followed by the system and user bundle-bin directories. A successful `code <workspace> --goto <file>` does not fall back. A completed nonzero command uses the existing file-only `open -a Visual Studio Code <file>` fallback and propagates its failure.

Direct process spawn failures propagate without fallback. This is OpenConductor implementation policy, not proven reference parity: the retained `I8` span does not establish how `Kc` translates command lookup failures. No claim is made that the source proves ENOENT behavior.

## Separate safety coverage

The new macOS-only `vscode_workspace_context_safety.rs` is a child module of `commands.rs`. Thirteen invalid-path/context cases and one valid-launch control invoke the frozen real Tauri IPC child in isolated subprocesses. Fake external programs prevent editor activation. This is not Linux unsupported-app rejection counted as safety proof.

Two missing/nonexecutable CLI cases exercise the same private executor with an explicit bin-only PATH and an inert fallback callback. They do not traverse IPC and do not test production installation discovery. Two additional pure tests check PATH ordering. No production test-environment override is introduced.

Compilation and all new behavior checks are NOT_RUN locally. Ordinary existing hosted CI is the execution surface. Native GUI, actual editor activation, installed-app discovery and released-app acceptance remain NOT_RUN.

## Frontend contract migration

Both the old Alacritty VS Code control and the new frozen header test mount the same actual modified primary FileDiffView. The old expectation omits context; the new expectation requires it. Retained `tee` and `uD` establish the workspace-aware call, with no legitimate fixture-specific distinction.

The exact V1 test is archived in [fixture-migration-v2](fixture-migration-v2/). V2 changes only the existing-file VS Code expected payload. The strict [migration verifier](fixture-migration-v2/verify.py) reconstructs the complete installed V2 from that one delta. Actual payloads are never normalized. The deleted-VS-Code control and the sealed ten IPC plus three header cases remain unchanged. Historical JSON pins are unchanged. Three historical Python checkers bind the exact V1 archive and additionally run the strict installed-V2 verifier; their old source expectations are not repinned or relaxed.

FilePathChip adds context only for non-deleted VS Code headers. The installed deleted-file control is unchanged. FileDiffView and the existing IPC adapter need no edits. Every exact-head workflow must pass before merge.
