# Literal selected-file paths

Conductor Rebuild fixes a selected filename being interpreted as a Git pattern. The initial publication contained only an eight-case regression and evidence. The same cases then reached six intended membership failures and two passing controls in automatic hosted CI before the minimal producer correction.

## Source contract

Retained REA extraction identifies Conductor 0.87.6 with evidence ID `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`. The complete index asset and two complete spans are identity-verified in [the source packet](source.json). They are read as data, never executed. Original renderer semantic analysis exhausted its worker heap, so this record uses retained extracted bytes rather than a new parsed module graph.

The tracked-patch builder `Dje` prefixes its selected path with `:(literal)`. Its sole direct caller, `Fje.getFileDiffPatch`, uses that builder for tracked patches and preserves a raw filename for `--no-index`. The retained loader reaches the tracked-patch builder under remote patch conditions. Local full-content loading uses revision reads instead. This is an extracted-source contract, not observed local Conductor behavior.

At inspected main `26f8345401efb021bef2f12b17815eba6c57170c`, four selected-path arguments in `git.rs` are passed as raw Git pathspecs. Selecting `q?.txt` or `q[0].txt` can include `q0.txt`. The frontend's full-content loader consumes the first returned file. The correction literalizes only the selected pathspec in worktree diff, untracked enumeration, turn diff, and selected-commit diff. It does not prefix the filesystem operand to `--no-index` or a `revision:path` Git object expression.

## Failing-before proof

On Reason Cloud, the actual standalone Rust backend and disposable Git repositories reproduce six exact path-membership failures and two passing controls. [The raw output](baseline-local.log) records six cases returning a sibling before any product fix. The fixtures cover substantive text modifications, untracked filenames, selected-commit endpoints, turn checkpoints, question marks, brackets, ordinary names, and no path filter. Successful cases iterate whitespace on and off and default and whole-file context. A failing case stops at its first membership assertion, so its later iterations are not yet verified.

The current fixture identity is in [fixture.sha256](fixture.sha256). Initial hosted Diff jobs stopped at one call-layout formatting difference before behavior. The initial tested fixture and digest remain in [fixture-initial.rs.txt](fixture-initial.rs.txt) and [fixture-initial.sha256](fixture-initial.sha256). The [formatting record](formatting-maintenance.json) proves the sole substitution expands one function call and adds a trailing comma. Every argument and assertion is unchanged. The existing automatic Diff and Tauri workflows run these registered tests without a new workflow, manual dispatch, or rerun.

Commands run:

- PASS for the intended RED: `DIFF_HARNESS_DIR="$PWD/.rea-work/literal-selected-path/harness" CARGO_BUILD_JOBS=1 tools/diff/run-rust-tests.sh literal_selected_paths -- --nocapture`. Compilation passed. The test command exited 101 with 6 failed, 2 passed, 0 ignored. Clippy was not reached after the assertion failures.
- PASS: `python3 evidence/diff/literal-selected-path/verify_source.py --baseline --index .rea-work/pzi-wzi-source-loan/index-BGEQ8YjU.js` verifies the original asset, both spans, five historical source inputs, current unchanged product, and fixture identity.
- PASS: `git diff --check`.
- NOT RUN: local rustfmt, because installing the missing component was refused by the read-only toolchain filesystem. Hosted formatting remains required.
- NOT RUN: installed app, browser, provider, native or visual parity. No screenshot is claimed for this backend-only regression.

## Correction and passing-after proof

[Hosted baseline job 130976182524](https://github.com/reason-machines/openconductor/actions/runs/43156073085/job/130976182524) at head `484ea95241be024189b4101bbd0badafbd137b1c` passes rustfmt and reaches all eight cases. Its complete retained [job record](hosted-red.json) proves six sibling-membership failures and both passing controls, with zero ignored tests. This is actual assertion RED, not the earlier formatting failure.

The fix follows that hosted result. Before changing the producer, main `1d9c4027909205d1dba9006031d922a5f2f2287a` was fetched and integrated. Its `git.rs` is identical to the original inspected producer. The only product changes are three local literal-pathspec bindings and four uses at the reserved selected-path sites. The formatted fixture remains byte-identical.

PASS on Reason Cloud: `env -u GIT_LITERAL_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS DIFF_HARNESS_DIR="$PWD/.rea-work/literal-selected-path/harness" CARGO_BUILD_JOBS=1 tools/diff/run-rust-tests.sh` runs the actual corrected backend and Git. All 79 tests pass with zero failed, ignored or filtered, including all eight unchanged new cases and existing large-file, whitespace, checkpoint, parser, discard and write tests. [Raw output](candidate-local.log) records the result. Clippy is NOT_RUN locally because its component is not installed. Hosted clippy and all exact-head workflows remain required.

PASS after the correction: fixture digest, complete original source integrity, historical source pins and `git diff --check`. Hosted candidate, consuming-main package and installed/native UI remain separately unverified until their actual checks run.

## Scope limits

No request scheduling, capacity, deduplication, cache, renderer, DTO, list membership without a path filter, or shared fixture changes are included. No new claim is made for renames, directories, invalid UTF-8 filenames, external launch environments, or performance. The All case exercises the merge-base producer with worktree edits, not committed branch history. Turn whitespace handling differs from worktree and selected-commit handling, so the cases use substantive changes rather than whitespace-only membership expectations.

Boundary Discipline keeps the correction at the Git pathspec boundary, rather than filtering away sibling results after parsing. Test-first delivery preserves the same expected membership and text assertions before the producer changes.
