# Clone inputs stay editable during a pending request

Conductor Rebuild removed only `disabled={pending}` from the clone URL and
location inputs. Editing either field changes the form, not the arguments of
the clone already in flight. The pending submit guard, Browse and recent-repo
buttons, progress log, errors, preferences and shared dialog code are unchanged.

## Retained source

[The exact-span receipt](reference.json) records the held archive and both
original asset identities. The full `los` form passes neither input a disabled
prop. Its same-renderer `Qo` wrapper forwards those props to a native input
without adding disabled. The only disabled prop in `los` belongs to the primary
clone button.

The direct `$3i` mount passes only the success callback to `los`. Its `kg` root
and `nd` content receive no clone-pending state. Those complete source spans
contain no pending or inert guard. This closes the local source-prop chain,
not every possible global overlay, CSS condition or native input behavior.

The source counterexample was checked against authoritative main
`c91751164fffa84f524d5e6f30144f869efb76ad`. That version explicitly disables
both inputs while pending. Both asset hashes, all nine exact spans and archive
member safety passed; reference JavaScript was not executed. The original REA
semantic renderer analysis exhausted its heap, so these checks use retained,
hash-verified shipped bytes instead of claiming a successful semantic analysis.

## Regression proof

The test mounts the actual `CloneGitHubRepoDialog` and actual `DialogFrame`
source using React test renderer. Base UI portal/popup primitives, motion,
shortcut matching and backend calls are stubbed. Clone completion is controlled
by a synthetic unresolved promise. No real clone or folder picker runs.

Before the production edit:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test src/components/cloneRepoInputs.test.ts
```

Result: **3 passed, 2 failed**. Only these assertions failed:

```text
url must not be disabled while cloning
location must not be disabled while cloning
```

The regression-only commit precedes the two-prop fix in local history. The test
file is unchanged across RED and GREEN:
`1d0d7ce7a9ba5a9bf5112050a4f09d92a1bcb296528e9119ca928ad2bca4e6a4`.

After the edit:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test \
  src/components/cloneRepoInputs.test.ts src/state/cloneDialog.test.ts \
  src/components/githubRepoDismissal.test.ts src/components/githubRepoName.test.ts \
  src/state/githubRepoDialog.test.ts
```

Result: **33 passed, 0 failed**. The five new component checks cover ordinary
editing, both pending inputs, captured request arguments, repeated submission,
progress, unchanged Browse/recent controls and retry after rejection.
`git diff --check` also passed.

## Acceptance limits

Full typecheck, build and hosted suites are left to CI. No screenshot is
included because this lane has no browser or native execution admission.
Physical input, focus, keyboard shortcut delivery, visual parity, real clone
outcomes and the installed macOS app remain unverified. Synthetic component
handlers and static reference source are not native acceptance.
