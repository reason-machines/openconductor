# Composer first-visual-line queue focus

Conductor Rebuild prepared this isolated change from main `248b6c359c830c6ac5e050721bae18e44e168068`. The two-module candidate is `c59ebfe2273ee7d0132ada0628842f9b4fe3652f`. SAME135 observed the original selected caret-four RED, then a failed candidate run with nineteen passes and one mention-menu setup failure. V2 corrects only that fixture setup. V2 runtime is not run. The existing serialized queue still owns execution; this source preparation adds no runtime, publication or native admission.

## Retained reference

The uploaded archive has SHA-256 `ac5513dd23c6bf905f01270d91fd10bb43d76020194b8d7abbb9a05dd091ef7e`. Its member names were inspected before extraction. All members were relative files or directories, with no links, absolute names or parent traversal. Only the source manifest, verifier text and retained renderer were extracted to a private preparation folder. The retained verifier and renderer were never executed.

The 11,600,457-byte shipped renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. All seven spans in [the existing reference record](../queue-focus-control/reference-spans.json) match its exact byte slices and hashes. The earlier REA evidence identifier is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. That analysis exhausted its worker heap. The retained bytes do not establish a semantic graph, original source, native behavior or side-by-side parity.

The compiled `$5o` predicate returns true for an empty editor. Otherwise it requires a collapsed selection in the first textblock and asks `view.endOfTextblock("up")`. The visible `lHt` handler gives suggestions precedence, excludes composition and all four modifiers, then calls this predicate before the queue-focus callback. `ITo` disables the callback during queue editing. The visible queue registers only when nonempty and available.

Main's Composer requires linear offsets zero and zero. The counterexample is `keep this draft`, collapsed caret at offset four, first textblock and a true upward textblock-boundary answer, with a nonempty queue and no editing, suggestions, composition or modifiers.

## Intended shape

Composer remains the sole owner of key policy and queue focus. ComposerEditor owns the editor document and view geometry. The optional handle query `atTop?(): boolean` hides Tiptap types and computes the reference predicate only when asked. Composer calls it only for eligible plain Up after suggestion, queue and editing guards. A false query result stays false. Nullish fallback to the old offset-zero check preserves existing boundary mocks without modifying their bytes.

The alternative optional editor callback would move part of the policy to the adapter and require another offset-zero path for frozen Composer-only fixtures. A required handle member would force changes to sealed typed mocks. Both alternatives were rejected in favor of one event-policy path and an optional query. Only an existing last queue row can consume the event and stop propagation.

## New regression

[The active V2 regression](../../../../src/features/chat/composerFirstVisualLine.test.ts) mounts both full production Composer and ComposerEditor modules. [The original V1 bytes](v1/composerFirstVisualLine.ts.txt) are preserved outside automatic test discovery, alongside the original TAP and terminal receipts. It constructs the document, selection, schema and history using the actual headless Tiptap Editor and production extensions. The outer editor view, layout answer and DOM focus endpoint are substituted explicitly. Surrounding preference, shortcut-registration and menu-rendering boundaries are inert; production suggestion matching and state remain active. This is not real browser geometry or native focus proof.

The cases cover a nonzero first-line caret, an empty document, later soft-wrapped line in the same paragraph, a hard break, second paragraph, noncollapsed selection, Shift/Meta/Control/Alt, event/view/key-code composition, no queue, queue edit mode, missing last row, another key and slash/mention precedence. Each key asserts unchanged real document/selection transaction state and undo/redo depths. Draft, queue, submission and stop callbacks fail if invoked.

The fifteen fixtures already on main remain byte-identical. The packet's sixteenth fixture, unmerged `composerSuggestionKeys.test.ts` (Keys36), is intentionally absent and is neither copied nor published. [The original source manifest](source.json) remains byte-identical and historical, including its preparation-time check statuses and excluded fixture hash. [The V2 manifest](setup-v2.json) pins the active successor, preserved V1, unchanged candidate modules and original results.

## V2 corrects mention setup, not product behavior

V1 omitted `workspacePath`, which production requires to derive a mention query and mount `FileMentionMenu`. Its unconditional file-search rejection also refused the legitimate initial empty-query search. The candidate run therefore failed before the mention key assertion. The same setup would fail on baseline by source inspection; that specific baseline control was not run.

V2 supplies `/fixture/first-visual-line-mention` only to the mention control. The backend boundary requires exactly one `fuzzyFilterFiles(path, "", false)` call and returns `Promise.resolve([])`. Existing terminal and directory actions provide the two real suggestion items. Every other case keeps no workspace path and rejects every search. The suggestion tests assert the expected search receipt before Up and unchanged after Up. All original twenty-case key, document, history, geometry and queue assertions remain unchanged. The static verifier compares their exact source after removing only the explicit setup additions. [The setup-only patch](setup-v2.patch) records every fixture change.

## Recorded V1 results

- **Qualified selected RED.** SAME135 ran the original fixture against `248b6c35`. The caret-four focus assertion failed `false !== true`, with no setup error. One selected test failed; controls were not run. [Original TAP, losslessly gzip-wrapped](v1/baseline.tap.gz) and [terminal receipt](v1/baseline-receipt.json) remain exact.
- **Failed candidate, not GREEN.** SAME135 ran the unchanged V1 fixture against `c59ebfe`. Nineteen cases passed. The mention case failed with `No instances found with node type: FileMentionMenu` before the key assertion. [Original TAP, losslessly gzip-wrapped](v1/candidate.tap.gz) and [terminal receipt](v1/candidate-receipt.json) remain exact. The unit released at `2026-11-11T15:52:12.879360Z`. V2 does not relabel this result.

## Static preparation checks

Passed on Reason cloud, without Node or app execution:

```bash
python3 evidence/chat/composer/first-visual-line/verify-source.py \
  --renderer .source-prep-39955/renderApp-D_fmY7hW.js
git diff --check
```

The verifier checks seven retained spans, nine original source pins, fifteen frozen fixtures, both fixture identities, unchanged original behavioral assertions and key-state checks, the two unchanged candidate modules, and four original result files. The original renderer, source manifest and frozen fixtures remain unchanged. V1 lives in a `.ts.txt` evidence file, not a duplicate `.test.ts` file. Only the V2 path is active in automatic discovery. Type-only derivation of the backend search signature adds no runtime import or dependency.

## Delivery and runtime plan

This is source-packet preparation only. Do not launch the commands below without E1 routing the existing SAME135 runner after the reserved 9eb pair and any actually earlier eligible lease have released. Retain the existing 393-package closure and Node pin. No install, retry, new executor or broadened resource allowance is implied.

1. Qualify V2 setup against the original product source. Select only the two suggestion controls. Both must pass, including exact search receipt assertions. Loader, setup or unexpected-search failures stop the unit.

```bash
COMPOSER_FIRST_VISUAL_LINE_SOURCE_REF=248b6c359c830c6ac5e050721bae18e44e168068 \
  node --max-old-space-size=384 --experimental-strip-types --test --test-concurrency=1 \
  --test-name-pattern="(slash|mention) suggestion navigation takes precedence over queue focus" \
  src/features/chat/composerFirstVisualLine.test.ts
```

2. After that unit releases and the candidate unit is routed, run all twenty cases with the same exact V2 bytes and unchanged `c59ebfe` product modules. The source-ref variable must be absent.

```bash
env -u COMPOSER_FIRST_VISUAL_LINE_SOURCE_REF \
  node --max-old-space-size=384 --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/composerFirstVisualLine.test.ts
```

Use the existing runner's `nice 19`, ninety-second timeout plus five-second kill grace, one worker, outer hundred-second supervisor, private-tree limit of 96 MiB and observed-growth limit of 16 MiB, subject to its actual routing receipt. These command examples are not grants.

Relevant unchanged regressions and typecheck need their separately routed units. Only after verified V2 qualification and candidate results may delivery proceed to a ready PR against main, never stacked. Preserve V1 evidence and original manifest in that PR, keep just V2 active in discovery, and retain the Keys36 exclusion. Merge only when every check passes, then follow the consuming build without inferring native admission.

Not run for V2: baseline controls, candidate behavior, regressions, typecheck, build, real browser layout, screenshot, native app, provider execution or consuming build. No screenshot exists because browser and native execution are not admitted. No PR or publication was made during this preparation.
