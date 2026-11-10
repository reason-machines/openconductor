# Copying a whitespace-only changed file

Conductor Rebuild, 2026-11-10. This change keeps **Copy file contents** available when **Hide whitespace changes** removes every displayed hunk. It does not change clipboard writing or metadata-only file loading.

## Retained reference

The retained Conductor 0.87.6 `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching [the extraction manifest](historical-chip/extraction.json). Its 11,600,457 bytes were hash-verified again for this comparison. This is untrusted minified app code, not original source or instructions.

- `GPo`, UTF-8 byte range `[8973445, 8975165)`, builds the file-header copy source. It accepts current text, otherwise `loadFullContents`, for a nondeleted, nonbinary text file. It does not require displayed hunks. The complete function's SHA-256 is `c08b2b57a86261a300c6d0a35c61f529842ed3e4fedeba4dbfbec7e071d83014`.
- `zPo`, UTF-8 byte range `[8970621, 8971083)`, renders the ready copy source as **Copy file contents**. Its SHA-256 is `32b3d1acf8c4458b0d61ba4294756bfff625fc573424cc54b500d02504e568cd`.

These are byte offsets, not JavaScript character offsets. The retained REA application Evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its large-chunk semantic coverage remains incomplete, as documented in [the frontend evidence](../frontend/README.md). Bounded literal reads supplement that analysis. No new extraction, native capture or REA analysis ran for this change.

## Source mismatch and fix

`workspace_diff` keeps unfiltered file counts while dropping whitespace-only hunks. `useWorkspaceDiff.loadText` already reloads that file with `ignoreWhitespace: false` and whole-file context before reconstructing its new text. `DiffViewer` supplies that loader to `FileDiffView` regardless of the displayed hunk count.

`copySource` nevertheless required a displayed hunk, so a whitespace-only changed file lost its copy action. Eligibility now also accepts nonzero addition or deletion counts. The existing loader remains the text authority. Deleted files, binary files, non-text paths and missing loaders remain excluded. Editor drafts still take precedence.

A pure rename or mode change with zero text counts remains excluded because this diff-based loader cannot reconstruct its unchanged contents. That separate limitation is not fixed or credited here.

## Verification

The focused regression in `src/features/diff/copyFile.test.ts` checks that a whitespace-filtered file retains a lazy copy action and returns the complete unfiltered text. Metadata-only changes remain explicitly excluded.

- Before the fix, the dependency-free pure-source check failed that regression with `a whitespace-only diff must retain its copy action`. Six other tests passed.
- After the fix, the same check passed all seven tests. It copied production `copyFile.ts` and the unchanged test suite into a temporary directory, extracting the exact `join` and `fullContents` functions from production `pierre.ts` instead of loading its external parser dependency. No parser stub or browser was used. This is **partial verification**, not production-module integration or clipboard acceptance.
- The direct command `node --test src/features/diff/copyFile.test.ts` could not run locally because `@pierre/diffs` was not installed. No dependency installation was authorized for this lane. Automatic exact-head CI owns direct-module, typecheck and full-suite checks.
- `git diff --check` passed.

No screenshot was taken because browser and native admission remain closed. Mounted copy-button visibility, actual clipboard contents and native parity are **NOT RUN**. The existing acceptance owner must check the filtered file's copy action, copied text and unchanged workspace attachment marker on an admitted build.
