# GitHub fallback publication preparation

Conductor Rebuild prepared this source-only integration against fetched main `09b1c998acb093f4d905d5ef844c80136ea987f6`. It does not apply either product change or authorize execution.

## Publication candidate

[publication.patch](publication.patch) combines the two owned generic fallback corrections without changing their classifiers or callers. Its four target files are:

- `src/state/githubRepoDialog.ts`, with the two previously qualified final returns.
- `src/state/githubRepoDialog.test.ts`, with only the existing contrary timeout assertion migrated.
- `src/state/githubOwnerErrorFallback.test.ts`, an import-only derivative of the frozen eight-case fixture.
- `src/state/githubOrgsErrorFallback.test.ts`, an import-only derivative of the separate frozen three-case fixture.

The derivative copies make the existing cases discoverable by the unchanged CI command `node --test "src/**/*.test.ts"`. Reversing their sole import substitution reproduces each original fixture byte for byte. They add no assertions or runtime request. The original packets in commits `6ad62c23` and `bf3e98ac` remain unchanged.

The original PR [#1186](https://github.com/reason-machines/openconductor/pull/1186) is merged. It is not a publication target for these pending corrections. This Session retains its assigned branch; a later ready PR must target main after authorized behavioral validation and branch integration.

## Reproduce source preparation

```bash
python3 evidence/dialogs/github-fallback-integration/prepare_source.py --base origin/main
python3 evidence/dialogs/github-owner-fallback-source/verify_source.py
python3 evidence/dialogs/github-orgs-fallback-source/verify_source.py
git diff --check
```

The preparation script reads the exact base from Git, checks all retained spans and packet identities, and requires the qualified current-source identities to match. It generates the publication patch and import-only fixture copies, then checks patch applicability using a disposable index. It never updates the product checkout, executes a fixture, installs dependencies, or launches an app. [source-integration.json](source-integration.json) records the source hashes and fourteen unchanged protected inputs.

These source checks passed. Both original fixtures remain unexecuted. No TypeScript parse, typecheck, build, browser, GitHub request, packaged app, or native check ran.

## Existing execution boundaries

ACC retains the only existing intake and serialized runtime authority. Its owner-eight contract-shape acceptance is not admission. The separate organizations-three proposal has no inherited grant.

Do not apply the combined publication patch under an owner-only admission. An admitted owner-only run uses that packet's original patch and frozen fixture; an organizations-only run uses its own. Preserve the separate proposed ceilings of 60 seconds total and 20 seconds per invocation, or the narrower actual ACC grant. Neither budget may be borrowed by the other packet. Run the existing state suite only when that admission includes it.

A later combined publication must preserve both original fixtures and document their independently admitted baseline/candidate results. New CI copies are the same assertions, not extra case coverage. Source applicability is not behavioral proof, and pure-helper results would not prove native rendering or real GitHub failure behavior.

No runtime row, duplicate publisher, workflow change, new helper, dependency repair, or native activity is introduced by this directory.
