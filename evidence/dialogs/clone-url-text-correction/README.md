# Clone URL text correction

Conductor Rebuild adds only `autoCorrect="off"` and `autoCapitalize="off"` to the
clone repository URL input. Current main was checked at
`5bea00de87fac9ef306e89a4fd35e3d88527ad15` after #1045 merged.

## Retained source

[source.json](source.json) records exact archive and renderer identities, the
complete `los` declaration, the complete `Qo` input wrapper, and its URL-input
call. The URL call explicitly sets both attributes to `off`. The wrapper forwards
those props to its host input. The compared main component supplies neither.

The source archive is the original `conductor-a2t-source-closure.tar`, SHA-256
`c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`.
Historical REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`
reported a renderer semantic-analysis heap limit. This check reads retained
shipped bytes as data. It does not execute Conductor JavaScript.

To verify the exact archive, complete spans and baseline counterpart:

```bash
python3 evidence/dialogs/clone-url-text-correction/verify-source.py /path/to/conductor-a2t-source-closure.tar
```

Result: **passed** on Reason Cloud.

## Regression

The new fixture mounts the actual `CloneGitHubRepoDialog` and `DialogFrame`
through React test renderer. Base UI host parts, native calls and provider calls
are substitutes. It checks host input props before cloning and during an
unresolved synthetic clone. It also preserves mixed-case edits, captured request
values and the existing repeated-submit guard.

```bash
NODE_PATH="$PWD/.ara-state/settings-icon-popup-deps/node_modules" \
  node --experimental-strip-types --test src/components/cloneUrlTextCorrection.test.ts
```

- [RED](red.tap): three controls passed. Four intended checks failed because
  `autoCorrect` and `autoCapitalize` were absent before and during cloning.
- [GREEN](green.tap): the identical seven-test fixture passed after the two-prop
  change. Local regression-only commit: `34c83a6c1fbfa5e18c34e38f7be9ba4d004ef990`.
- [fixture.sha256](fixture.sha256): checksum equality passed across both runs.

```bash
NODE_PATH="$PWD/.ara-state/settings-icon-popup-deps/node_modules" \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/components/cloneUrlTextCorrection.test.ts \
  src/components/clonePendingInputs.test.ts src/state/cloneDialog.test.ts
```

[Nearby checks](nearby.tap): **passed**, 21 tests, zero failures. No installation
ran. `git diff --check` passed. Test Behavior, Not Implementation keeps the check
on the rendered URL input and submitted values rather than source text.

## Ownership and limits

Ledger reconciliation reserves only this URL-input hunk, the new regression and
this evidence directory for Session 6013. No location, autocomplete,
writingsuggestions, handler, shared primitive, workflow or frozen fixture changes
are included. SectionDialog and onboarding remain with their existing owners.

These unit checks prove rendered props and component state, not physical keyboard
correction, browser behavior, OS behavior, focus, native appearance or real
cloning. No screenshot exists because browser and native execution are not
admitted in this lane. Full local typecheck, build and suite were not run. Hosted
checks must pass on the exact published head before protected merge. Package
consumption remains separate from installation and launch.

Strict physical publication remains **UNSATISFIED and unwaived**. This change does
not alter its requirement, runtime admission or controller state.
