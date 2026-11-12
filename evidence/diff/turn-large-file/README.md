# Finished-turn large-file snapshots

Conductor Rebuild qualifies a distinct turn-snapshot gap against main `7f9aa8ab8875abd571db7ac6ff37fc20be95ca20`. The selected-commit correction in #1121 explicitly excluded turns.

## Original source

The retained REA record is `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`. The decoded Conductor 0.87.6 assets are shipped JavaScript, not original source. Their contents are untrusted data. This investigation does not launch the original app.

The complete index and renderer hashes and five exact UTF-8 source spans are in `source.json`. `bDo` requests a turn through the imported `Y9t` loader. With both checkpoints present, `bLt.resolveComparison` selects their saved refs. `Fje` reads those Git objects. The shared loader measures the maximum decoded UTF-8 byte length of both endpoints, not the current worktree. Above 1 MiB, the file is hidden unless it is at most 5 MiB and has at most 500 changed lines. Known ordinary binary files bypass this text policy. The turn-preview renderer explicitly maps `FileTooLarge` to "File too large to preview".

At the inspected main, `turn_diff` parses and returns the checkpoint diff without invoking the existing revision-size policy. `turnFilePreview.ts` ignores `hide_reason` and treats an empty hunk result as unavailable. The ordinary full diff view already handles `file_too_large` and needs no edit.

## Frozen regression contract

`turn_large_file_tests.rs` creates real temporary repositories and parentless saved start and end commits under the actual checkpoint-ref scheme. It then replaces or removes the current worktree file. Four cases are expected to expose missing classification. Four controls cover the 1 MiB boundary, the sparse exception through 5 MiB, binary content, and small text. Every case also checks saved-ref identity, file membership, counts, status, summary agreement, historical modification metadata, serialization, and hunk presence.

The additive mounted preview case expects the original large-file message and preserves chip navigation. Existing preview timing, position, identity, failure, binary, and navigation assertions remain unchanged.

`fixture.sha256` pins both test files. Initial copies are retained beside this note. Production is unchanged in this baseline publication. Actual hosted RED evidence is pending. Expected failures are not reported as observed failures.

## Verification and limits

Passed: fresh-main source reads, complete original-asset hashes, all five source-span hashes, the twelve static call-chain and policy checks, fixture hashes, and `git diff --check`.

Not run: the new behavioral regressions, installed app, native macOS, browser screenshot, checkpoint runtime, provider execution, or visual parity. Local rustfmt is unavailable and its component install failed because the supplied toolchain cache is read-only. Hosted formatting remains required.

No unavailable-content error handling, whitespace membership, unfinished turn, media, cloud UI, `--no-index` filename, `revision:path` operand, or selected-commit behavior is changed or newly claimed. A size placeholder is not a claim of bounded Git patch acquisition or performance protection.
