# Home local loading and empty states

Conductor Rebuild completed source-only unit `ACQ-HOME-LOCAL-EMPTY-271-02` against default main `4739c9c029f87c64901a2431de6032b81f2b7348`.

## Result

For settled local inputs with undefined reference owners, no project filter, active archive mode, and only archived workspace records in known repositories, retained Conductor offers **Clear filters**. Current `emptyAction` offers **Create a workspace**.

The reference `Or` predicate checks the length of `it`, before archive and query filtering. Current `emptyAction` checks whether any repository workspace has a non-archived status. The difference is about the empty-state button, not the always-present header Create button. It is a source difference, not a demonstrated user-facing defect.

The static comparison covers twelve same-input cases. Eight settled controls match, one settled case differs, and three loading cases lack an equivalent input in the permitted current component contract. Neither application ran.

## Declaration, caller, and visible consumer

- Complete retained `UJo` supplies workspace, repository, and local-context loading flags through `Xh`, `nF`, and `so`. For the local branch, `Ye` is an empty array and pinned items are empty. The known-repository workspace list becomes `it` before archive filtering.
- `Jo` selects the Loading workspaces status before either rows or No matching workspaces. `dr` selects rows. In an empty list, `Or` selects Create a workspace, otherwise `mr` selects Clear filters.
- Complete retained `MJo` supplies `J`. Its Clear callback empties projects and owners and sets archive mode to all. Neither that callback nor the current callback clears the text query.
- Current `AllWorkspaces` calls `emptyAction(repos, filters)` and branches on nonempty date groups. The helper's return value controls its two empty-state buttons. Both Create call sites invoke the supplied Create callback without a disabled prop. Current Clear invokes `setFilters(CLEARED_FILTERS)`.
- Reference Create invokes the result of `g5()` with no arguments. The generic `tt` button's implementation is not present, so its actual enabled state and creation outcome remain unverified.

`anchors.json` contains twenty-two exact source fragments with digests, current-main line references, or original half-open UTF-8 byte and UTF-16 code-unit offsets. The two complete reference declarations match their hashes in the prior retained-source packet. The two current snapshots match Git objects at the named main commit.

## Focused regression design

No test file was written or executed.

Mount the production component with a known repository containing one archived workspace, active archive mode, and an empty query. Inspect only the empty-state container. Expect No matching workspaces, Clear filters, and no empty-state Create action. The global header Create button remains present. Drive Clear and inspect its saved filter value, all mode, and preserved query. Include truly empty, project-filtered empty, archived-filtered empty, all-mode query miss, and nonempty-list controls.

This component test would demonstrate the current synthetic component behavior. A matching real app input and the reference owner preference must be established separately before declaring native behavior or parity.

## Source boundaries

The following declarations or integrations are not closed by the available packet:

- `g5`, the Create callback implementation, and `tt`, the reference button implementation.
- `LJo` and actual persisted preference inputs. This comparison explicitly fixes `U` to undefined; it does not assume every local saved preference has that value.
- `Xh`, `nF`, and `so` implementations and loading transitions.
- OpenConductor's caller and loading integration. The permitted component Props have no loading input, and its body has no initial Loading workspaces branch. That bounded absence does not prove the caller mounts it while loading.

The original renderer upload is not placed in this recovered checkout. This unit reused complete retained declaration bytes and their established REA provenance. There was no new acquisition or reference JavaScript execution. The inherited semantic-renderer limitation is unchanged.

## Checks actually run

On Reason Cloud 298, computer `2f55d343-d8e8-5df2-a012-bba9ca8cf476`:

```bash
python3 evidence/home/local-empty-states/source/prepare.py
git diff --check
```

Passed. The script checks fixed-source fragments and computes a truth table from manual predicate transcriptions. It is not a component or app test. An independent file-digest check also passed for every file listed in `receipt.json`.

Product files and test files are unchanged. No dependency installation, component runtime, typecheck, build, browser, provider call, native action, new REA acquisition, PR publication, or CI dispatch occurred. The review page was not browser-verified.

The review page is retained as `review.html`, shown as [Home local empty states](https://reasonmachines.com/agents/27102e36-8b7f-4f1b-9ada-1e0503d3fede?page=0a33b4d6-065e-42e0-ad37-ba4a1c266bca). Its page ID is `0a33b4d6-065e-42e0-ad37-ba4a1c266bca`.

PR #1011 remains owned by the existing subscription. This unit does not change its selection fix or start another observer.
