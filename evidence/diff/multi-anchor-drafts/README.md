# Independent new inline drafts

Conductor Rebuild owns `DIFF-MULTI-ANCHOR-NEW-DRAFTS-DE6`.

## Source contract

The retained Conductor 0.87.6 renderer and index came from the authorized Mac. This unit reuses those exact bytes and historical REA artifact identity without running the reference JavaScript. `source.json` records eleven complete spans, both asset hashes and the checked main commit.

`OMi` rejects only another draft at the same workspace/file/side/range. A different anchor gets an independent comment ID. The index `createComment` method appends that draft to the workspace collection, while `Pae` stores edited bodies by comment ID. Both annotation callers pass the full eligible collection to the viewer. Starting a second draft does not delete the first.

At main `15e87440daa703030f4c402e7a41b9221a149768`, `useReviewComments` retains only one `Composing` value. Starting another anchor replaces the previous body and annotation. The earlier hide/remount repair deliberately covered one draft, not simultaneous drafts.

## Mounted regression

`src/features/diff/multiAnchorDrafts.test.ts` loads the complete production ReviewComments module, mounts its actual hook with real React, and renders its actual anchors and annotation Composers. External storage, keybindings, markdown and dialog boundaries are inert substitutes. It does not stub the production hook or invoke private state setters.

Thirteen cases cover distinct line anchors, returning to an existing anchor, paths, old/new sides, overlapping ranges, isolated discard/save, actual annotation hide/remount, failed save, late save, duplicate clicks, workspace isolation and stale cancelled callbacks. The source-qualified expectation is nine baseline failures and four passing controls. Actual counts must come from hosted execution, not this expectation.

The fixture was published before any product change. Its SHA-256 is pinned in `source.json` and remains unchanged. Automatic hosted head `09fa14eebc236ab7d02abb6cffbcb7a4f1b7385d` reproduced all nine intended assertion failures and four passing controls. The entire Diff suite passed 448 cases and failed only those nine. Each failure lost the earlier exact body, returning undefined or an empty string. See [the hosted job](https://github.com/reason-machines/openconductor/actions/runs/43115355531/job/130841811973), `hosted-red.json` and the JSON-escaped assertion excerpt in `hosted-red.log.json`. The same bytes must pass after the minimal fix. Existing automatic frontend and Diff test jobs execute them. No new executor, workflow dispatch or local Node run is introduced.

To reproduce against the baseline in an admitted runtime:

```bash
DIFF_MULTI_DRAFT_REF=15e87440daa703030f4c402e7a41b9221a149768 node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap src/features/diff/multiAnchorDrafts.test.ts
```

Run the same command without `DIFF_MULTI_DRAFT_REF` for the candidate.

## Design boundary

Model the Domain selects a collection of new drafts, not another body slot or a new persistence service. Each existing `Composing` identity keeps workspace, path, side, start/end, generation ID and exact body. Test Behavior, Not Implementation keeps the assertions on rendered inputs, annotation presence and submitted payloads rather than that collection's shape.

Distinct ending-line anchors render independent editors. For different ranges sharing an ending-line annotation, preserve every body and show only the latest selected range. Reselecting a retained range restores its body. This compatibility boundary preserves the frozen remount fixture's single-editor expectation. It is not a claim of full original same-ending-line simultaneous native parity.

Opening a distinct anchor retires only untouched drafts whose raw body is exactly empty. Typed whitespace is retained without trimming. Changes and cancels from a retired generation cannot recreate that draft or overwrite a survivor. Simultaneous untouched empty editors remain outside this bounded repair.

The correction stays inside ReviewComments composing state, line-click handling, anchors and annotations. Do not change saved-edit maps, replies, backend persistence, WorkspaceView or existing fixture bodies. `source.json` pins every existing Diff test for preservation checks.

## Evidence limits

Source integrity checks passed on Reason cloud, and hosted behavioral RED passed its qualification gate. Candidate hosted GREEN is pending. No local Node, typecheck, browser DOM, native event delivery, screenshot, original app execution or SQLite check ran. The mounted test does not prove Pierre hit testing or visual parity. Real-DOM gutter acceptance is a separate, parked unit. Packaging, when verified after merge, is static evidence rather than installed-app acceptance.
