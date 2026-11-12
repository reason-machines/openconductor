# Selected-commit large-file policy

Conductor Rebuild adds the eight previously prepared selected-commit regression cases without changing their assertions or case values. Layout and formatting trailing commas are normalized before the first hosted run, then the fixture hash is frozen in `source.json`. The first publication contained tests and source evidence only. Hosted job 130933738756 then reached all eight cases: four intended hide-reason failures, four passing historical controls, and eight passing pre-existing worktree controls. The selected-commit helper fix follows that qualified RED without changing any fixture assertion or case value.

## Source contract

Retained REA evidence `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5` identifies Conductor 0.87.6. The copied source slices and their asset byte offsets are pinned in `source.json`. This is static evidence, not an observed Conductor run.

The selected-commit full-content loader reads the first parent at `oldPath ?? filePath` and the selected revision at `filePath`. It measures the maximum UTF-8 encoded length of the decoded strings. It does not stat the current worktree. Text above 1 MiB can render only when its size is at most 5 MiB and the unfiltered endpoint numstat has at most 500 changed lines. Text above 5 MiB is hidden regardless of the line count. The byte measurement is not raw Git blob size.

At inspected main `649f47b9d80eb1d7510c2b405b25e026ffddf78b`, the selected-commit producer returns before the existing worktree classifier. The new fixture covers an oversized parent with a small selected file, a missing current worktree file, strict threshold boundaries, dense changes, binary content, and small text. Four cases are expected to expose the missing classification. Four cases are controls. Each case also checks path membership, counts, binary state, summary agreement, serialized hide reason, and hunk presence.

## Verification

Run `python3 evidence/diff/historical-large-file/verify_source.py` for source and fixture integrity. Run `cargo test --locked historical_large_file_placeholder -- --nocapture` in `src-tauri` for the behavioral regression. The existing automatic CI Tauri jobs execute the full test suite on macOS and Linux. No workflow or shared evidence runner is changed.

Source and fixture integrity PASS, `git diff --check` PASS. Initial Diff CI failed formatting before running behavior, but the separate automatic large-file job ran the tests and proved the intended RED. The four failures were all `hide_reason: None` instead of `Some("file_too_large")`. The [raw hosted log](hosted-red.log) and [receipt](hosted-red.json) retain that result. Two formatting-only corrections follow the run; the initial tested fixture is preserved as `fixture-initial.rs.txt`. Hosted [GREEN at 7133ea55](hosted-green.json) proves all eight historical cases and all eight existing worktree cases, with zero ignored tests. The existing mounted-renderer cases also pass. The [raw GREEN output](hosted-green.log) is retained. Separate Diff CI still requested one helper-signature layout correction, which changes no behavior or fixtures. Full exact-head CI after that correction remains pending. Local rustfmt is NOT_RUN because the toolchain component is unavailable. Installed-app and native UI verification are NOT_RUN. No local or native runtime is admitted by this change.

## Scope

The fix is limited to the selected-commit backend producer. It reads decoded Git contents at both endpoints, measures the maximum UTF-8 byte length, and uses plain endpoint numstat with literal old and current paths. Expected absent sides of added or deleted files have zero length. A failed Git read leaves classification unchanged rather than treating the failure as empty content. DTOs, the renderer, current worktree classification, changed-file membership, counts, whitespace handling, rename paths, and the existing frontend allow-large policy stay unchanged. Root and merge commits, symlinks, media, remote patches, turn comparisons, unavailable content, and same-end legacy comparisons have no new parity claim. There is no performance or bounded-acquisition claim.

Model the Domain shaped the fixture as one eight-case data table rather than eight separate setups. Test-first delivery preserves that table before any product edit.
