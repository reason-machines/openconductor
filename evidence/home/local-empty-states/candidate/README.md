# Home local empty-state regression

Conductor Rebuild reproduced the settled archived-only empty-action mismatch and corrected it in an isolated source snapshot. The same nine-case fixture failed once before the correction and passed unchanged afterward. All thirteen related helper tests passed.

The production checkout and PR #1011 contain no changes from this unit. The separate main-based delivery owner must apply `unapplied.patch` and copy the frozen fixture to `src/components/homeEmptyAction.test.ts`.

## Source and scope

The baseline snapshot is default main `385ccb5229f56ff33903f034352eaa9827c40f0e`. Current main advanced to `b34ba2de9ad45365715d21a0bfe24d9c36b335fb` when installer diagnostics #1015 merged. Before execution, all thirteen scoped source files from that head matched the baseline byte for byte. `admission-recheck.json` records the current head and complete unchanged input closure. The preparation receipts remain historical records of the original snapshot.

The retained complete Conductor `UJo` and `MJo` declarations, REA provenance, exact UTF-8 and UTF-16 offsets, and limitations are in `../source/`. With settled local inputs, known repositories, and reference `U` explicitly undefined, `Or` uses the pre-archive workspace count to choose the empty-state action. The old helper excluded archived records and offered Create when such records were the only entries. The correction counts all supplied repository workspace records before filtering.

`unapplied.patch` changes only the two `emptyAction` predicate lines, their existing documentation, and the existing helper assertion for the archived-only case from Create to Clear. That assertion change intentionally aligns the old expectation with the source-backed behavior after the new regression observed the intended failure. It is not skipped or weakened. The new fixture keeps all eight controls and every assertion unchanged.

No selection, search, filter implementation, header Create, icon, unarchive, loading, native, or provider behavior is edited. The helper has one production caller in AllWorkspaces.

## Actual verification

The fixture mounts the production AllWorkspaces renderer and real `homeRows`, `groupByDate`, empty-action helper, status functions, and workspace labels. Persistence, archive I/O, status subscriptions, and decorative components are mocked boundaries. Archive I/O returns an empty list. The regression explicitly supplies one archived record in a known repository's props.

All three foreground commands ran once on Reason Cloud 298, computer `2f55d343-d8e8-5df2-a012-bba9ca8cf476`, under the sole serialized admission `cd5e6058` and its clarifications. No installation occurred. The existing isolated nine-package, lock-derived dependency closure was reused unchanged.

Baseline and corrected runs used the identical command from the isolated snapshot:

```bash
NODE_OPTIONS=--max-old-space-size=384 nice -n 19 timeout --kill-after=5s 90s \
  node --test --test-concurrency=1 src/components/homeEmptyAction.test.ts
```

- **Expected failure observed.** Baseline exited 1 in 1.787 seconds. Exactly one assertion failed and eight tests passed. The archived-only empty state rendered `Create a workspace`; the fixture expected `Clear filters`.
- **Passed.** After the exact frozen helper and supporting-assertion correction, the same fixture exited 0 in 1.531 seconds. Nine tests passed, with zero failures, skips, cancellations, or todos.
- **Unchanged fixture.** SHA-256 before and after both runs is `0368e970513156b1446366774d85ec3461c3358ca12328a5d6d40fec32daae49`.

The related helper command also ran once:

```bash
NODE_OPTIONS=--max-old-space-size=384 nice -n 19 timeout --kill-after=5s 90s \
  node --test --test-concurrency=1 src/home/allWorkspaces.test.ts
```

It passed all thirteen tests, exited 0 in 0.316 seconds, and had no skips, cancellations, or todos. Exact commands, source digests, times, exits, output hashes, and TAP output are retained in `red.json`, `green.json`, `related.json`, and their adjacent logs. `run.py` verifies frozen inputs before each command and verifies the fixture digest afterward.

All three bounded foreground commands terminated. No server, watcher, provider operation, full dependency installation, compiler, native app, browser, or reference JavaScript execution was started. The sole local slot was released after the checks.

## Limits

These checks prove synthetic production-component branch and callback behavior. They are not a mounted-reference comparison, native acceptance, or visual parity. No screenshot was captured because browser and native execution were outside this admitted unit.

Production reachability of archived records in repository props remains unverified. The reference owner preference is fixed to undefined, not inferred from saved defaults. This unit makes no claim about loading integration, `g5`, the generic `tt` button, the actual Create operation, or other missing declarations. Those source boundaries remain documented in `../source/README.md`.

Broader tests, typecheck, and builds were not run locally. The separate ready PR's normal exact-head hosted CI owns those checks. Delivery must remain main-based and separate from #1011, with every check passing before protected merge and consuming-package follow-through afterward.
