# GitHub confirmation ignores backdrop presses

Conductor Rebuild traced the retained Conductor dialog's mounted controller to
its shared alert-dialog state and outside-press predicate. The GitHub
confirmation declares pointer dismissal disabled. OpenConductor main
`a588bddd7f56be4493644dae4c41952919e56f6a` omitted its existing per-dialog
`disablePointerDismissal` prop, so a backdrop press called `onClose`.

## Retained-source boundary

[The source receipt](reference.json) records the immutable archive identity,
both full asset hashes, exact UTF-8 half-open spans, literals and binding joins.
The original REA renderer semantic pass exhausted heap. This closure reads its
retained shipped bytes without executing reference JavaScript.

The closed route is `dbi` to `Tg`, `Oos`, `_3i`, `Vrs` and `SZ`.
`_3i("alert-dialog", ...)` forces `disablePointerDismissal` true.
`Vrs` returns false for outside presses while that flag is true.
`SZ` checks that predicate before requesting `setOpen(false)`.
The original index exports and renderer imports also close the `HI` active-ID
store and `yas(false)` callback route for this same dialog.

The source check passed archive safety, both original asset identities, 21
prior unique spans and 18 new spans. This does not prove a real pointer event,
Escape key, native dismissal or mutation outcome.

## Behavioral regression

The focused test renders OpenConductor's actual `GitHubRepoDialog` and actual
`Modal` with React's test renderer. It stubs only backend requests, the motion
ref and the close icon. A stateful parent removes the dialog when `onClose`
runs. Creation remains unresolved for the pending cases.

Run with the repository's installed dependencies:

```bash
node --experimental-strip-types --test src/components/githubRepoDismissal.test.ts
```

On Reason Cloud, the same command used an isolated prefix containing the
lockfile's React 18.3.1, react-test-renderer 18.3.1 and TypeScript 5.9.3:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test src/components/githubRepoDismissal.test.ts
```

Before the production change, 9 tests ran. Seven controls passed and both
backdrop assertions failed for the intended reason:

```text
not ok 1 - GitHub repository dialog ignores backdrop presses before creation
expected: 0
actual: 1
not ok 5 - GitHub repository dialog ignores backdrop presses while creation is pending
expected: 0
actual: 1
# tests 9
# pass 7
# fail 2
```

Cancel, Escape and the explicit header close passed before and during pending
creation. The ordinary Modal's default backdrop dismissal also passed.
These are synthetic handler tests, not browser, native or physical-input tests.

## Fix and verification

The fix adds only the existing `disablePointerDismissal` prop to
`GitHubRepoDialog`'s Modal. The same nine tests pass without changing the test
file between RED and GREEN. The original name and state regression suites also
pass, for 20 passing tests and no failures:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test \
  src/components/githubRepoDismissal.test.ts \
  src/components/githubRepoName.test.ts src/state/githubRepoDialog.test.ts
```

Shared Modal, App mounting, owner retries, validation and pending submit remain
untouched. The regression-only commit is `f6a21f24a`. The fix follows it in
history. Hosted full-suite, typecheck, build and packaging results are separate
checks, not established by these focused component tests.

No build, native launch, browser interaction, screenshot, real GitHub creation,
external privacy proof or visual-parity acceptance ran. Runtime and native
verification remain with their existing sole owners.
