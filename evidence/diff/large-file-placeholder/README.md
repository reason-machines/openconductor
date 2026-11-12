# Large-file placeholder regression

This unit covers existing tracked, nonmedia text files in the uncommitted Diff view. It leaves the file in the changes list and renders the body placeholder when the current file exceeds the reference size policy.

## Reference evidence

The retained REA record `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5` identifies Conductor 0.87.6. `source.json` pins the complete renderer and index asset identities, byte spans, extracted functions, and the baseline main commit. The original app has not been executed for this unit.

The index loader `bLt.load` checks the current worktree stat before reading text. Files up to and including 1 MiB are allowed. Files above 1 MiB through 5 MiB are allowed only when the unfiltered Git changed-line count is known and at most 500. Files above 5 MiB are hidden even when the change is small. `Mqo` resolves the hide reason before mounting its text renderer. `Jqo` retains the selected file and supplies its current path.

## Frozen behavioral checks

`cases.json` defines eight real temporary tracked Git-file cases. Four oversized cases must show `File too large to display`. Four controls retain the 1 MiB boundary, the 500-line exception through 5 MiB, and ordinary binary handling.

The Rust tests invoke the actual `workspace_diff` and `list_changes` producers. They serialize their actual DTOs before asserting the size policy, so the mounted renderer receives backend output even on a failing baseline. No fixture injects `hide_reason` or fabricates a backend response. The renderer test mounts the current `FileDiffView` in unified, split and file layouts. It checks the placeholder, the absence or presence of CodeView, the retained header, and the existing Viewed action. Pierre drawing and external/native controls are boundary substitutes, not native UI proof.

The automatic hosted workflow runs:

```bash
python3 evidence/diff/large-file-placeholder/verify_source.py
bash tools/diff/run-rust-tests.sh large_file_placeholder -- --nocapture
node --experimental-strip-types --test tests/diff/largeFilePlaceholder.mounted.test.mjs
```

Set `DIFF_PLACEHOLDER_DTOS` to the same temporary directory for the two behavioral commands. The workflow preserves both logs and DTOs as `large-file-placeholder-proof`. Both behavioral outcomes must succeed. A compiler, dependency, startup or missing-artifact error is not the intended behavioral failure.

At head `f98dd96`, hosted run `43126179063` produced four intended backend failures and four passing controls, plus the same four failures and four passing controls in the mounted renderer. The missing size hide reason and placeholder assertions failed, not setup or compilation. `hosted-red.json` and the redacted artifact logs preserve that result. The job incorrectly reported success because `tee` masked the command exit codes. A harness-only correction adds explicit `pipefail` to both commands before any product repair.

Product code remains unchanged in this baseline. The same fixture hashes must pass after the repair. A successful workflow conclusion without successful behavioral logs is not evidence of a pass.

## Limits

Historical and turn comparisons, a large old revision with a small or missing current file, media previews, tree view, and unavailable-content errors are outside this bounded repair. This does not prove early bounded Git patch acquisition or native performance protection. Native stat and read implementations have not been dynamically observed. No screenshot, native UI, SQLite, installed-package or restart check has run. The separate same-end and empty-editor comment residuals remain unchanged.
