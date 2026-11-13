# Clone fields stay editable during a pending request

Conductor Rebuild removed only `disabled={pending}` from the clone URL input,
location input and Browse button. Editing the form does not change the arguments
of the clone already in flight. The pending-submit guard, recent-repo buttons,
progress log, errors, preferences and shared dialog code are unchanged.

## Retained source

[The exact-span receipt](reference.json) records the held archive and both
original asset identities. The full `los` form passes neither input a disabled
prop. Its same-renderer `Qo` wrapper forwards those props to a native input
without adding disabled. Browse passes its click handler to `tt` without a
disabled prop. The complete `tt` → `r_` → `S3i` → `Es` composition/render path
preserves those props with empty default state and no disabled injection. The
only disabled prop in `los` belongs to the primary clone button.

The direct `$3i` mount passes only the success callback to `los`. Its `kg` root
and `nd` content receive no clone-pending state. Those complete source spans
contain no pending or inert guard. This closes the local source-prop chain,
not every possible global overlay, CSS condition or native input behavior.

The source counterexample was checked against authoritative main
`c91751164fffa84f524d5e6f30144f869efb76ad`. That version explicitly disables
all three controls while pending. Both asset hashes, all 17 exact spans and
archive member safety passed; reference JavaScript was not executed. The
original REA semantic renderer analysis exhausted its heap, so these checks use
retained, hash-verified shipped bytes instead of claiming a successful semantic
analysis.

## Regression proof

The test mounts the actual `CloneGitHubRepoDialog` and actual `DialogFrame`
source using React test renderer. Base UI portal/popup primitives, motion,
shortcut matching and backend calls are stubbed. A synthetic unresolved promise
controls clone completion. The folder picker returns a synthetic directory.
No real clone or native folder picker runs.

Before the production edit, the component source was byte-identical to main
`c91751164`:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test src/components/clonePendingInputs.test.ts
```

Result: **3 passed, 3 failed**. Only these assertions failed:

```text
url must not be disabled while cloning
location must not be disabled while cloning
Browse must not be disabled while cloning
```

The regression-only commit precedes the three-prop fix in local history. The
test file is unchanged across this RED and GREEN run:
`28c6f0549a2afdfe3d52fa8b16ac8e734b50b5dfe5e7cdcbba54344de7bd8e88`.

After the edit:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test \
  src/components/clonePendingInputs.test.ts src/state/cloneDialog.test.ts \
  src/components/githubRepoDismissal.test.ts src/components/githubRepoName.test.ts \
  src/state/githubRepoDialog.test.ts
```

Result: **34 passed, 0 failed**. The six new component checks cover ordinary
editing, both pending inputs, pending Browse selection, captured request
arguments, repeated submission, progress, unchanged recent controls and retry
after rejection. `git diff --check` also passed.

## Acceptance limits

Full typecheck, build and hosted suites are left to CI. No screenshot is
included because this lane has no browser or native execution admission.
Physical input, focus, keyboard shortcut delivery, visual parity, real clone
outcomes and the installed macOS app remain unverified. Synthetic component
handlers and static reference source are not native acceptance.
