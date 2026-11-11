# Hidden-whitespace editing

Conductor Rebuild. Candidate implementation, not observed RED/GREEN.

## Change

The diff viewer acquires complete unfiltered old and new text before enabling hidden-whitespace editing in Unified, Split or Entire-file view. Whitespace filtering applies to Pierre's presentation, not the editor buffer or saved contents.

The candidate changes five production files:

- `useWorkspaceDiff.ts` requests whole-file context with `ignoreWhitespace: false`.
- `DiffViewer.tsx` also waits for that request in hidden-whitespace Entire-file view. Existing logical-key, cancellation and same-revision freshness gates remain unchanged.
- `editable.ts` requires a current unfiltered response when whitespace is hidden. Missing, binary, deleted and metadata-only contents remain read-only. A genuinely emptied file still has a deletion hunk and remains editable.
- `FileDiffView.tsx` uses the full source for read-only Entire-file items too, and forwards the presentation flag into editable metadata construction.
- `pierre.ts` retains that flag when reparsing the full draft.

The editor's existing draft, save-shortcut, write IPC and error-handling code is unchanged. Saving is a whole-file write of the editor buffer. This change does not add atomic disk-conflict detection.

## Reference

[The retained-source qualification](reference-source.json) records the exact asset identities and 13 byte spans. Shipped Conductor's `bji` selects a full-text loader for editable local text files. The `Y9t`/`bLt` chain reads raw old and new text. `Mqo` forwards those strings through `jqo` to `kqo`. That consumer filters display metadata while keeping the editable document, and `_qo`/`Dqo`/`Zjt` pass the complete editor string to the write service.

These are inert shipped-JavaScript source observations, not original-source access or native execution. No reference JavaScript was evaluated. No new REA call failed in this continuation; existing large-bundle semantic-analysis limits remain.

## Regression contract

The original downstream eligibility assertions remain byte-identical at SHA-256 `9e2323001151099dc53928a8b3276c82729ca3b4783fb7ab5baea51bb6703c0a`. They are retained separately from the new integration regression and must not be rewritten to make a run pass.

`src/features/diff/hiddenWhitespaceEditing.test.ts` drives the production workspace hook, API request construction, DiffTab, FileDiffView, Pierre metadata, draft hook and save-key handler. The fixture creates real disposable Git repositories and uses real Git patches for its IPC responses. Its save bridge writes the actual requested bytes into the disposable file.

The integration assertions cover all three layouts with and without a final newline, exact tabs and untouched regions, whitespace-filtered metadata, full-load failure, refresh freshness, save rejection, mode-only and emptied files, binary/deleted/whitespace-only controls, and genuine read-only commit history.

The bridge replaces Tauri IPC and Pierre's rendered CodeView/editor handle. It does not execute the Rust diff backend, a real DOM editor, the installed app or reference JavaScript. A passing fixture would prove only the exercised frontend request/editor-item/save-handler contract and disposable-file write, not native or visual parity.

Use the sealed fixture unchanged for both baseline and candidate. Its baseline selector changes only the five production modules:

```bash
DIFF_WHITESPACE_REGRESSION_REF=2b079f13e07b580d26191f7f1f50b4d21e62174e \
  node --experimental-strip-types --test --test-concurrency=1 src/features/diff/hiddenWhitespaceEditing.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/features/diff/hiddenWhitespaceEditing.test.ts
```

The portable execution archive also retains those source trees, the original downstream fixture and its real-Git input-preparation script. The existing E1 executor must admit execution in its older queue order, then reconcile the current main and exact input identities. A setup/import failure is not behavioral RED. Preserve complete TAP and terminal/resource receipts. Do not infer test counts from the source.

## Verification and delivery state

- Passed on the Reason cloud computer: retained-source qualification against baseline main `2b079f13e07b580d26191f7f1f50b4d21e62174e`, exact original-fixture identity and `git diff --check`.
- Passed before publication against fetched main `d8f6bdfd26370491295f38ffecd7090c71a2a6db`: all 29 sealed main inputs are unchanged; both retained assets, all 13 reference spans and all 64 sealed baseline/candidate files match. The integration fixture, assertion tail and original downstream fixture retain their frozen hashes. [The publication source receipt](publication-source-check.json) records this source-only check. Main was merged into the assigned branch without altering the candidate or fixtures.
- Source review by `byok:openai-codex:gpt-6.1-sol` recommended the single raw whole-file source and identified the Entire-file and metadata-only safety additions included here. This is not an independent model-family review or runtime acceptance.
- Not run: Node baseline/candidate, full typecheck/build, Rust, DOM/native, save-through-real-IPC, package consumption or side-by-side parity. No screenshot exists because browser/native execution was not admitted.

The frozen aggregate HEADER/summary reservation, ROW fixtures/hooks, WorkspaceView, backend and queue order are unchanged. This source-verified candidate is being published ready against main with behavioral and native gaps explicit. Product acceptance and merge still require actual E1 RED/GREEN with unchanged assertions and all exact-head workflows green. Consuming-package and installed-app verification follow the merge; publication is not behavioral proof.
