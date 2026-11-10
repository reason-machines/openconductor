# File-menu copy path eligibility

## Change

Copy path is always available. With a worktree it copies the absolute file path;
without one it copies the filename. Copy relative path is available only with a
worktree. The existing clipboard writer, notification labels, Open in action,
View action, and Discard changes action are unchanged.

`fileCopyPaths` owns the copy targets. `FileMenuActions` requires Copy path and
makes Copy relative path optional, matching the rendered menu eligibility.

## Reference provenance

The coordinating Session supplied retained REA static proof from the installed
Conductor 0.87.6 frontend `renderApp-D_fmY7hW.js`, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The retained extraction receipt belongs to [the reference Session](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753),
tool-output source `9181bb0b-bc9f-4d41-998b-1f4969d3ed68`, revision
`25651063`, source sequence `1054`. No separate REA result URL was surfaced.
The retained slices have these SHA-256 digests:

- `Svs`: `2276321b09b5d62d934d1a391e9b0317407b6055d8276c73ab1a8334ff48a3aa`.
- `syi`: `f569418d51f7b6b6bc45163ff43bc5b2f5839e2342871e43ce979f76a1611c5e`.

The observations in that receipt are:

- `Svs`, UTF-8 bytes `[2702053,2705864)`: Copy path is unconditional;
  Copy relative path is gated by the workspace-relative target `U`.
- Its callbacks at `[2703790,2703988)` call `n5(n,'path')` and
  `n5(U??n,'relative path')` respectively. Their labels are distinct.
- Its eligibility block is at `[2705208,2705456)`.
- Changes row `syi`, UTF-8 bytes `[2800964,2806810)`, derives
  ``ae=g??m,de=ae?`${ae}/${n}`:n`` and passes `filePath:de,workspacePath:ae`.

These are inert reference observations supplied by the coordinating Session,
not a new extraction or runtime observation by this builder. No extracted
Conductor code was executed.

## Verification

Baseline production source was main `14dc5aa889ea9f9cc0459187e6d43c475f3cbdd7`.
Before extracting a helper or changing production code, the narrow check read
and executed the two existing OpenConductor copy callback expressions in a
Node VM. The clipboard spy observed their actual arguments and availability.

```bash
node --experimental-strip-types --test evidence/diff/file-copy-paths/check-callbacks.mjs
```

[Before](before.tap): expected failure, 6 failed and 4 passed. Missing, null, and
empty worktrees incorrectly hid Copy path and exposed Copy relative path.
Existing worktree callbacks preserved their targets and labels.

```bash
node --experimental-strip-types --test src/features/diff/fileCopyPaths.test.ts evidence/diff/file-copy-paths/check-callbacks.mjs
```

[After](after.tap): passed, 17 tests. This executes the real helper and the
production callback expressions with null, undefined, empty, ordinary,
trailing-slash, root, and space-containing paths. Clipboard labels remain
`path` and `relative path`, and the notification callback identity is preserved.
`git diff --check` also passed.

## Limits

The Node VM check executes callback expressions, not JSX, React, the DOM, or the
native clipboard. Local compilation, builds, dependency installation, app
runtime, browser/server use, native launches, extraction, and workflow dispatch
were excluded by the assigned scope. There is no new screenshot or native
verification. Automatic PR workflows provide broader compilation and tests.
