# Moved inline comment anchors

Conductor Rebuild compared main `248b6c359c830c6ac5e050721bae18e44e168068`
with retained Conductor 0.87.6 source. The current main edit callback discards
`lineAnnotations`, and its comment persistence API cannot update ranges.

## Reference source

The retained renderer is 11,600,457 bytes with SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The literal, inert spans and hashes are in `source.json`.

- `kqo`, UTF-8 `[9628186,9633515)`, retains annotation positions from edit
  change and completion events. It persists them on completion and before save.
- `OMi`, UTF-8 `[9403263,9404772)`, skips remote comments. It calculates the
  difference between the moved terminal line and the stored range's terminal
  line, then shifts both range endpoints by that difference.

These are source observations, not observed reference runtime behavior.
REA's renderer analysis still exhausts its worker heap. The retained bundle
was inspected as inert text, without running Conductor code. This existing
limitation is recorded in `evidence/rea/rea-invocations.tsv`.

## Candidate

The CodeView annotations retain the IDs of comments grouped under each line.
`FileDiffView` remembers Pierre's moved positions and passes them through
`DiffTab` to the review hook on save and edit completion. The hook calculates
absolute range updates from stored comments. Local storage and the new
`diff_comments_update_anchors` IPC command persist those updates.

The database operation scopes updates to the workspace and local inline rows.
It does not alter remote comments or whole-file comments. Absolute endpoints
make a repeated save or completion idempotent. The file-save implementation
and draft lifecycle are unchanged.

## Regression

`movedCommentAnchors.test.ts` mounts the actual `DiffTab`, `FileDiffView`,
`useReviewComments` and `useFileEdit`. It runs the production comment store and
IPC adapter. Pierre's actual `TextDocument` and annotation mapper generate an
insertion before a comment covering lines 3 through 5. The expected persisted
range is lines 4 through 6.

Each layout exercises local storage and the IPC adapter, with either save or
edit completion first. All 12 cases check persistence after remount, repeated
save and completion, replies, and unchanged remote, old-side, other-file and
whole-file comments.

`run-paired.py` substitutes only seven pre-fix frontend modules from the pinned
main into the same test fixture. Baseline proof requires all 12 named cases to
fail with `ERR_ASSERTION` at the expected persisted-range assertion. Candidate
proof requires those same cases to pass. Setup failures do not qualify as RED.
The workflow uploads complete TAP and a phase receipt.

The new database integration tests use actual SQLite operations. They cover
reopening a file-backed database, repeated absolute updates, single-line
ranges, workspace isolation, remote and whole-file exclusion, and invalid
ranges. Existing CI runs these tests with the persistence crate.

## Verification state at publication

Passed on the Reason cloud computer without Node or app execution:

- `python3 evidence/diff/moved-comment-anchors/run-paired.py --self-test`.
  Two valid evidence shapes and seven invalid shapes checked.
- `python3 -m py_compile evidence/diff/moved-comment-anchors/run-paired.py`.
- Retained asset and literal-span hashes, new source manifest, and frozen
  whitespace fixture identity.
- `git diff --check`.

Behavioral RED/GREEN, TypeScript checks, and database tests await hosted CI.
Their results are not established by the source checks above.

The earlier hidden-whitespace proof requalifies only three candidate module
hashes. Its fixture, assertion tail, baseline hashes and workflow are unchanged.
No aggregate or ROW fixture, E1 order, executor, admission or runtime limit changes.

## Limits

CodeView rendering and its DOM editor handle are substituted. The Tauri adapter
uses a test transport backed by the production local store, not the native
command. The separate database tests do not prove real Tauri transport.
Native editing, visual parity and a consuming package remain unverified.
No screenshot is available because native and browser execution are not admitted.
