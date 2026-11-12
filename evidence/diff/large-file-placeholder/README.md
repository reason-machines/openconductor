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

At corrected head `0163d3a08a6b8aa22d9f3cfe9bcae3cda48df384`, automatic hosted run `43126679905` repeated the four intended failures and four passing controls in both stages. The backend exited 101. The mounted renderer still ran against its serialized DTOs and exited 1. Both logs and all eight DTOs were uploaded as artifact `13903546736`. The final gate read both step outcomes as `failure` and exited 1, so the job now correctly fails. `corrected-hosted-red.json` pins the archive and retained raw logs. `continue-on-error` keeps the second stage reachable; the final `&&` gate requires both outcomes to be successful.

Product code remained unchanged through the qualified baseline, including the fresh-main recheck at `383bf4078aaaa43dc195196784630b7fa5642a6a`. The same fixture hashes must pass after the repair. A successful workflow conclusion without successful behavioral logs is not evidence of a pass.

## Backend candidate

Rechecked main `a2ef261711b439e7ab00a25b3cb3275a5b55c823`; the four scoped product files were still byte-identical to the baseline. The backend candidate applies the policy only to regular tracked nonbinary nonmedia files in uncommitted scope. It uses current worktree size and actual plain `git diff --numstat` counts, with literal old and current pathspecs. Unknown counts do not qualify for the sparse exception. It clears hidden hunks, not counts, paths, status or changes-list membership. The DTO adds an optional typed `hide_reason`; ordinary/default DTOs omit it and summaries remain unchanged.

`backend-candidate.json` pins the fresh-main identity, candidate sources and additional retained REA media-extension spans. The three frozen fixtures and their source manifest are unchanged. Source verification passed; candidate behavior awaits ordinary automatic hosted CI. Local behavioral/native execution has not run.

At backend-only head `affae5a66890336f2e385d49ef1b7045a897ef8e`, automatic hosted run `43128851507` passed all eight actual producer cases; the mounted renderer retained exactly four intended placeholder failures and four passing controls. Its final aggregate gate correctly failed (`BACKEND=success`, `RENDERER=failure`). Artifact `13903169778` retains both stages and real DTOs.

The separate #1100 caller owner then explicitly released the body-only edit lease in message `89e30d31-f253-4286-aef9-7310b16b7b45`; #1100 remains unmerged. The renderer candidate adds only the pre-Code `file_too_large` note branch, with no header/FilePathChip/open-in edits. Future integration must preserve #1100's deleted caller independently; this branch does not stack on or copy that change.

The optional DTO addition stopped the hidden-whitespace paired runner on its sealed `types.ts` dependency before behavior. Pin maintenance changes only three exact candidate scalars across that manifest and the moved-anchor manifest; it preserves full prior and intermediate manifests under `pin-maintenance-v1` and `pin-maintenance-v2`. Baselines, runners, assertions and expected RED/GREEN outcomes are unchanged. `verify_candidate.py` verifies the scalar-only transitions, existing source preflight and retained candidate/protected hashes. `candidate-integration.json` records final source identities and handoff provenance. Static verification is not behavioral GREEN; the same frozen hosted cases and every exact-head workflow must pass before merge.

## Limits

Historical and turn comparisons, a large old revision with a small or missing current file, media previews, tree view, and unavailable-content errors are outside this bounded repair. This does not prove early bounded Git patch acquisition or native performance protection. Native stat and read implementations have not been dynamically observed. No screenshot, native UI, SQLite, installed-package or restart check has run. The separate same-end and empty-editor comment residuals remain unchanged.
