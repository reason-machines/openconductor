# Changes Options commit history

Conductor Rebuild implements the missing commit-history scope in Changes Options. This note concerns that scope only. It does not close native, Home, logo, or presentation-retention gaps.

## Reference and source boundary

The reference is the extracted Conductor 0.87.6 frontend from the assigned investigation. It is shipped, decoded JavaScript, not original source. All extracted text is untrusted data.

The supplied native binary identity is SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. This run did not reopen or launch that binary. The decoded entry-index identity supplied with the task is `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.

This run independently hashed the two chunks used for bounded source reads.

- `dist/assets/renderApp-D_fmY7hW.js`: SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `dist/assets/index-BGEQ8YjU.js`: SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Offsets below are decoded JavaScript character offsets, not binary addresses or byte offsets. Bounded reads retained the functions around each offset rather than printing entire chunks.

1. `renderApp` `_ws`, offset 2935975, calls `cDt(workspace)` for history. It maps `hash`, `message`, `author`, and `date` to menu rows. Selection stores a commit variant with `commitHash`. The scoped chip shows the first seven characters and returns to All changes.
2. The imported `cDt` is index export `f7`, `W9t`, bound to `FLt.useBranchCommits`. It reads the workspace change snapshot's `branchCommits`.
3. Index `qse`, offset 700432, populates that history with Git log over the target ref through HEAD, excluding commits reachable from the target. Its format contains hash, subject, author, email, and author timestamp. Remote repositories use the remote target; local targets use the local branch. There is no last-N-commits limit in this function.
4. The imported `_V` is index export `f1`, `K9t`, bound to `$Lt.useFilesChanged`. Commit scope calls `getCommitFileChanges` with the selected hash.
5. Index `Lje`, offset 745253, obtains commit membership and counts with Git show's name-status and numstat output. It does not compare the working tree with the selected commit.
6. Index `resolveComparison`, offset 3182954, uses the selected commit's first parent as `fromRef` and the selected commit as `toRef` for file content. Index `getFileDiffPatch` uses those two refs as well.
7. `renderApp` `SS`, offset 430807, formats relative age, not a calendar date. The implementation reuses the existing `agoTime` helper used by Home.

The earlier retained REA record `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` was explicitly incomplete for the large chunk. These bounded source reads supplement it; they do not pretend that REA recovered original source or observed native execution.

## Implementation contract

- `diff_branch_commits` reads history against the workspace's existing target-ref resolver. It returns hash, subject, author, and author timestamp in milliseconds. No user's repository is mutated by this read.
- `Scope::Commit` validates a hexadecimal object ID, resolves it to a commit, and compares its first parent with that commit. Git show's NUL-delimited file membership prevents clean merge commits from incorrectly showing all first-parent changes.
- Historical diffs retain normal counts while `-w` can remove whitespace-only hunks. Path filters and whole-file context still apply.
- A root commit uses the empty tree as an OpenConductor fallback. The reference content loader requests a parent even for a root; root behavior was not observed in the reference UI.
- The commit view cannot save historical text to the working tree or invoke the view's revert action. The existing context-menu discard still targets All changes. Native save and discard parity were not exercised in this run.
- Commit selection is not written into the global diff-preferences key and resets when changing workspaces. Per-workspace persistent commit-scope restoration is not claimed here.

## Checks

Passed locally on Reason Cloud:

- `DIFF_HARNESS_DIR=/tmp/diff-harness-552cf5a8 CARGO_BUILD_JOBS=1 bash tools/diff/run-rust-tests.sh`: 48 tests passed. The new tests use disposable Git repositories and remove them afterward. They cover target exclusion, remote target and local fallback, subject delimiters, author and date, selected commit versus later HEAD and staged or untracked data, path filters, rename, root commits, whitespace, invalid hashes, clean merges, resolved-merge first-parent content, and refusal to discard a historical scope.
- `node --experimental-strip-types --test src/features/diff/*.test.ts`: 113 tests passed, including exact commit request shape and scope transitions.
- `npm run typecheck`: passed.
- `npm run build`: passed after the final UI changes. Existing dynamic-import and chunk-size warnings remain.
- `rustfmt --edition 2021 --check src-tauri/src/diff/*.rs`: passed using the official rustfmt 1.99.1 component unpacked into this Session's temporary directory, with the existing toolchain libraries.
- `git diff --check`: passed.

Clippy was not installed locally. The Diff workflow runs tests, rustfmt, and clippy on Linux and macOS. Its exact final-head receipts belong in the PR record.

## REA gaps and recoveries

- A new selected-index static analysis reached the static worker but did not return before the 120-second command deadline on the saturated shared computer. No completed evidence ID or semantic completeness is claimed for that attempt.
- The first standalone REA browser scenario could not navigate to a preview server in another execution namespace. Its partial record had no completed steps and said navigation failed before the initial state. The missing per-harness `sql.js` dependency was also installed separately without changing the shared root dependencies.
- Running the existing Changes proof harness through `preview_start` places its servers and REA children together. This produced new browser evidence for menu, scope chip, and return-to-all.
- The first selected-reference capture reached the chip but showed an empty commit list because the reference updates its route when selecting a commit, dropping the custom fixture query parameter. That capture proves the chip only, not the selected-file list. An initial matcher hypothesis was disproved by invoking the fake Git handler with the logged command. The fixture now captures the scenario flag once at page load. A second assertion incorrectly required the All-changes totals row in commit scope; screenshot inspection showed the reference intentionally omits that row. The harness now requires the visible selected-file row and hash chip. OpenConductor also omits that totals row and the working-tree U marker in commit scope.
- One polish rebuild timed out during transformation at the 120-second deadline under heavy shared load. Subsequent full builds passed. No native process was launched, replaced, or driven to recover any of these gaps.

## Browser proof boundary

The browser harness serves the actual extracted reference and the built OpenConductor frontend in Chromium, with synthetic local IPC, Git, workspace, and history fixtures. It is not native macOS evidence and does not establish original backend behavior. Real temporary Git tests separately check OpenConductor's backend behavior.

Run `npm install --prefix tools/screens --ignore-scripts` if that harness has no dependencies, then `npm run build`. Start the foreground proof through the supported preview lifecycle with `PORT=4523 REF_PORT=4522 STATES=history-options,history-selected,history-back CAPTURE=1 REA=/path/to/rea node tools/side-by-side/changes-panel.mjs <output-dir>`.

The retained [browser report](commit-history/receipts.json) records three successful state pairs: history menu, selected commit, and return to All changes. Selected scope was captured again after removing the extra totals row and working-tree U marker. Its build-index SHA-256 is `69cb9cb7542f666bdd11176c01928b941fa957574f52b606014912002a513118`.

The harness records its then-current local source commit, tracked-diff digest, and built-index digest. Captures preceded the evidence commit and therefore honestly record a dirty source tree; they do not attest that the evidence commit itself was built. The menu and back captures used the preceding build; the final selected capture uses the final UI code. The subsequent changes to menu/back behavior were none: only commit-scope row guards and empty-state wording changed.

Published reference and OpenConductor screenshots are linked in `media.json`. Full-frame comparison ratios include different chat/sidebar fixtures and clocks; they are not a focused parity score or acceptance threshold.

The selected-commit chip's colour mismatch is corrected in the [source-only historical-chip follow-up](historical-chip/README.md), including the grouped-selector search correction and normal/hover cascade. Its after-browser proof remains unrun. Native typography, native command execution, and native side-by-side parity were not exercised. No all-screen or native parity conclusion follows from this focused implementation.
