# Read errors retain their text

Conductor Rebuild. Versioned source successor to immutable packet `cfc2fe64`. Checked against default-branch commit `b35aeedc5ff71381e2f740367233462b500810c9` on Reason Cloud. Product and live tests are unchanged. This packet is source-ready, unapplied, and unexecuted.

## The correction stays in exact Read

A supported local Claude `tool_result` can carry `is_error: true` and nonempty string content. The mapper retains that text independently of failed status. The wire, Reason event adapter, reducer, view, and Transcript retain those independent fields. The current Read arm consumes `output`, which the shared Row binding sets to undefined on errors. Failed Read is not in the independent error-row registry. The user consequently gets a `Reading` header with no reachable error text.

The smallest counterexample is an ordinary Read for `/repo/missing.txt`, offset 7, failed status, and string output `Permission denied`. This is a source-derived accepted counterexample, not a recorded provider scenario.

The proposed product patch adds `readResult = name === "Read" ? result : output` inside the existing read arm and passes it to the existing `readContent` and `readLabel` calls. All success cases retain the same value. Exact NotebookRead still consumes the previous `output`, so its behavior does not widen. The shared output binding, helpers, parsers, NumberedCode, RowShell, image registry, CSS, persistence, providers, and I/O remain unchanged. No forced-open state is added.

## Retained reference witness

Original Conductor 0.87.6 static REA receipt is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The original renderer semantic pass exhausted heap and skipped the renderer. These are retained shipped-byte observations, not a successful semantic rerun or a current installed/native observation.

The unchanged original packet contains both full assets and fourteen exact spans, with byte ranges and SHA-256 identities in `source-receipt.json`:

- `D1o`, `L1o`, `O1o`, and `Qpo` map Read to the registered read renderer. `hIt` passes the selected component its original `toolResult` without suppressing it by error flag.
- Complete `O0o`, renderer UTF-8 bytes `[7816650,7817911)`, consumes string `toolResult.content` directly. It has no `is_error` gate. It cleans the content with `L0o`, selects `Read N lines` or `Read image` from cleaned content and path, and provides lines plus input offset to `w0o`.
- `L0o` removes the specific system reminder and numbered-line prefixes, then trims. `w0o` renders the content as numbered text. Complete `Mu` retains the controlled disclosure behavior. No independent error row appears in `O0o`.
- For the failed-PNG label control, the same `O0o` content path selects `Read image` when cleaned content is nonempty. The retained `oJ` import, `ole` export, image registry, and path predicate establish PNG membership. `O0o` sets `isCollapsible` false for it. This witness supports the restored label, not an image preview or new I/O.

The original receipt and assets remain immutable. This packet copies eighteen current-main sources so a reviewer can independently follow local Claude mapping through `wire.rs`, `reason.ts`, reducer, `view.ts`, and `Transcript.tsx` into the exact Read consumer. It does not assert that a running Conductor app actually displayed this synthetic failure.

## Why two live expectations need explicit successors

The complete provider snapshots for [PR #1004](https://github.com/reason-machines/openconductor/pull/1004) and [PR #1200](https://github.com/reason-machines/openconductor/pull/1200) are in `provenance`. Both snapshots report complete discussion, review, inline-comment, and review-thread sections with no entries. That bounds the inspected provider evidence; it is not proof of every historical conversation.

PR #1004 added syntax highlighting. Its test-only commit `c53cbb9a` froze the Read regression for the syntax correction. The error case was one of the passing baseline controls, while 21 syntax assertions failed. Its ordinary failed-text assertion required no disclosure or lines. The evidence note scopes the change to Read syntax and explicitly leaves error behavior alone. That is baseline preservation for that correction, not evidence of a permanent product requirement to discard error text.

PR #1200 added image-path disclosure gating. Its exact sealed fixture reproduced 12 disclosure failures and 16 passing controls. The `failed-text` case was a passing control for unchanged status/result behavior, not the image-gate defect. Its PR body says statuses and tool-result bytes remain unchanged. That scope does not establish a permanent failed-text suppression contract.

Root and ledger explicitly reconciled the two ordinary failed-text controls as scope-limited baselines for this versioned successor. No permanent Sven suppression instruction was found in the bounded evidence they retained. Their disposition does not permit changing any unrelated frozen expectation.

The migration is explicit and test-strengthening:

1. Keep the original #1004 and #1200 files in `archive`, byte-for-byte. Keep `cfc2fe64`, #847, TodoRead inputs, preview packets, and all other unpublished work unchanged.
2. In the successor syntax regression, replace only the failed `Permission denied` branch with positive assertions for a collapsed clickable `Read 1 lines` header, error status, line 7 text, collapse, reopen, and no independent error chip. Keep the empty-result branch and every preceding syntax assertion unchanged.
3. In the successor image fixture, change only `failed-text` to expandable with exact line 7 `Cannot read text`. Keep `errorRows: 0`, all other case data, and all 27 other cases identical. The `failed-image` disclosure expectation remains non-collapsible. The live image test changes only its exact input-file digest to the new successor digest; the integrity assertion remains enforced.

No assertion is skipped, disabled, deleted to get green, or accepted as passing without execution. The historical `baseline_prediction` annotation in the image input remains historical metadata, not a measured result for this successor.

## Regression source and unmeasured predictions

The new `readErrorResult.test.ts` drives actual `applyReasonPayload` to reducer to `buildRows` to the transpiled actual `ConductorToolRow`, using real React, react-test-renderer, and the real existing highlighter. It does not stub result selection, cleaning, label, shell, or numbered content. Unrelated Markdown, links, and backend open effects throw. File opening is a captured callback only.

Its twelve top-level cases cover failed plain text, numbered text, literal markup, reminder removal, successful text, pending and empty states, and image disclosure. Each asserts status, exact normalized input and result retention, content-derived header, controlled disclosure, exact cleaned lines and offsets, collapse and reopen, badge navigation, absence of an extra error row, and literal safety where content opens. Within the failed-permission case it also checks unchanged failed NotebookRead and that structured rawResult does not override the accepted flattened text.

Predicted baseline is five intended label failures with seven passing controls. The exact Read candidate is predicted to pass all twelve. These are design predictions, not executed RED or GREEN. The alias and structured-result supplemental assertions run after the primary failed-permission assertion passes. Their baseline execution is therefore not claimed.

## Checks actually run

`python3 .rea-work/read-error-successor-b35aeedc-be7/prepare-successor.py` passed its source-only checks. It verified the two original asset identities, fourteen original reference spans, eighteen fresh-main snapshots, exact minimal product reversal, identical syntax prefix, exact image-fixture digest rollover, 27 unchanged image cases, three original archived files, twelve written cases, and empty tracked/staged diffs. It does not execute original or product JavaScript.

`git diff --check` passed for the unchanged tracked tree. `git apply --numstat` parsed both unapplied patch files. Neither command is a mounted behavior test or TypeScript syntax check. The source was manually reviewed, including the assertions while literal content is actually open.

No TypeScript parser check, mounted RED, mounted GREEN, adjacent test, typecheck, build, CI, browser, native, provider, package, or deployment check has run for this successor. No screenshot exists because no browser/native execution has been admitted. Source evidence does not establish native parity.

## Allocation and publication blockers

ACC `acc3b5c5-8a01-407e-b474-42e914e3cf90` retains the existing serialized allocation route and Read entry. This packet does not create a runner, new queue row, install, build, native owner, or execution admission. `VALIDATION.md` provides exact commands for that route after a matched source/dependency binding and finite grant.

The Session's assigned branch remains `reason/openconductor-sol-worksp-be7a40e4`. Live PR #847 is still open and frozen. The currently advertised `pr_open` would adopt that existing PR; its branch/head fields are not a separately authorized publication-target selector. No supported independent target-selection operation is advertised. Root confirmed that this Session must preserve #847 and its assigned branch, not publish into it, switch branches, or start a replacement Session. Standalone PR publication remains blocked until a supported fresh-main binding is available.

The workspace checkpoint failed because its 130.7 MiB payload exceeded the 128 MiB limit. No new portable whole-workspace checkpoint was saved. All live files and 24 unpublished commits were preserved. The finalized source packet is separately attached so this candidate does not rely only on that failed checkpoint. This is not a backup of every other unpublished file or commit.

Fix Root Causes kept the correction at the exact Read consumer rather than inventing events or a second error component. Test Behavior, Not Implementation shaped the real-module regression around the visible header, error text, file navigation, and disclosure.
