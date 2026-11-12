# Literal selected-file paths

Conductor Rebuild adds an eight-case regression for a selected filename being interpreted as a Git pattern. This first publication contains tests and evidence only. The product producer remains unchanged.

## Source contract

Retained REA extraction identifies Conductor 0.87.6 with evidence ID `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`. The complete index asset and two complete spans are identity-verified in [the source packet](source.json). They are read as data, never executed. Original renderer semantic analysis exhausted its worker heap, so this record uses retained extracted bytes rather than a new parsed module graph.

The tracked-patch builder `Dje` prefixes its selected path with `:(literal)`. Its sole direct caller, `Fje.getFileDiffPatch`, uses that builder for tracked patches and preserves a raw filename for `--no-index`. The retained loader reaches the tracked-patch builder under remote patch conditions. Local full-content loading uses revision reads instead. This is an extracted-source contract, not observed local Conductor behavior.

At inspected main `26f8345401efb021bef2f12b17815eba6c57170c`, four selected-path arguments in `git.rs` are passed as raw Git pathspecs. Selecting `q?.txt` or `q[0].txt` can include `q0.txt`. The frontend's full-content loader consumes the first returned file. The correction will literalize only the selected pathspec in worktree diff, untracked enumeration, turn diff, and selected-commit diff. It will not prefix the filesystem operand to `--no-index` or a `revision:path` Git object expression.

## Failing-before proof

On Reason Cloud, the actual standalone Rust backend and disposable Git repositories reproduce six exact path-membership failures and two passing controls. [The raw output](baseline-local.log) records six cases returning a sibling before any product fix. The fixtures cover substantive text modifications, untracked filenames, selected-commit endpoints, turn checkpoints, question marks, brackets, ordinary names, and no path filter. Successful cases iterate whitespace on and off and default and whole-file context. A failing case stops at its first membership assertion, so its later iterations are not yet verified.

The frozen fixture identity is in [fixture.sha256](fixture.sha256). The existing automatic Diff and Tauri workflows run these registered tests without a new workflow, manual dispatch, or rerun.

Commands run:

- PASS for the intended RED: `DIFF_HARNESS_DIR="$PWD/.rea-work/literal-selected-path/harness" CARGO_BUILD_JOBS=1 tools/diff/run-rust-tests.sh literal_selected_paths -- --nocapture`. Compilation passed. The test command exited 101 with 6 failed, 2 passed, 0 ignored. Clippy was not reached after the assertion failures.
- PASS: `python3 evidence/diff/literal-selected-path/verify_source.py --baseline --index .rea-work/pzi-wzi-source-loan/index-BGEQ8YjU.js` verifies the original asset, both spans, five historical source inputs, current unchanged product, and fixture identity.
- PASS: `git diff --check`.
- NOT RUN: local rustfmt, because installing the missing component was refused by the read-only toolchain filesystem. Hosted formatting remains required.
- NOT RUN: installed app, browser, provider, native or visual parity. No screenshot is claimed for this backend-only regression.

## Scope limits

No request scheduling, capacity, deduplication, cache, renderer, DTO, list membership without a path filter, or shared fixture changes are included. No new claim is made for renames, directories, invalid UTF-8 filenames, external launch environments, or performance. The All case exercises the merge-base producer with worktree edits, not committed branch history. Turn whitespace handling differs from worktree and selected-commit handling, so the cases use substantive changes rather than whitespace-only membership expectations.

Boundary Discipline keeps the correction at the Git pathspec boundary, rather than filtering away sibling results after parsing. Test-first delivery preserves the same expected membership and text assertions before the producer changes.
