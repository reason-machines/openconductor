# Repository-icon Favicon help action

Conductor Rebuild checked current main
`26f8345401efb021bef2f12b17815eba6c57170c`. The Favicon tab in
`RepoIconDialog.tsx` has explanatory text but no help action.

## Retained real-app source

The existing Conductor 0.87.6 source archive has SHA-256
`c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d` and REA lineage
`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
The historical renderer semantic analysis exhausted its heap. This increment
reads the retained shipped bytes as inert data and introduces no new REA gap.
It does not evaluate or import extracted target code.

Both complete assets were rehashed. Renderer `renderApp-D_fmY7hW.js` is
11,600,457 bytes with SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Index `index-BGEQ8YjU.js` is 3,493,297 bytes with SHA-256
`b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Ten exact byte spans and four baseline source identities are recorded in
[source.json](source.json). The complete `Lya` dialog delegates to `dUi`, whose
Favicon branch renders `pba`. Its note renders a button labeled Learn more in
all three preview branches. That button calls `mba`, which calls
`vs(l3.repoIconFaq).fireAndForget()`. Renderer imports and index exports resolve
`l3` to the `sSt` URL registry and `vs` to `Rue`. `Rue` invokes
`plugin:opener|open_url`. This is static declaration evidence, not an observed
click or browser launch.

## OpenConductor adaptation

The restored action uses the existing `openUrl` boundary. Its destination is
[OpenConductor's repository-icon documentation](../../../docs/repository-icons.md),
not the vendor FAQ. The new document describes current favicon precedence,
local-file detection, size limits, and custom icons from the inspected
OpenConductor source. This destination is an intentional product adaptation,
not URL parity with Conductor.

No icon lookup, persistence, tab selection, clear behavior, shared dialog,
clone flow, onboarding, or native execution changes belong to this unit.

## Regression-only checkpoint

The frozen `repoIconFaviconHelp.test.ts` mounts the actual production picker
with real repository-icon helpers. Modal chrome, glyphs, favicon lookup, and
external URL opening are inert boundary substitutes. No images or URLs are
fetched. Six cases cover the missing help button across detected favicon,
GitHub avatar, and repository initial, with or without an explicit icon.
Three controls retain existing preview, selection, and clearing behavior.

The help cases require exactly one action, exactly one call to the independent
expected OpenConductor docs URL, no icon mutation, no dismissal, and the same
selected tab. Test Behavior, Not Implementation shaped these assertions.
The fixture hash is recorded before any production correction.

Passed on Reason Cloud:

```bash
python3 evidence/dialogs/repo-icon-faq/verify_source.py --assets artifacts/dialogs-icons-source-6013
node --experimental-strip-types --check src/components/repoIconFaviconHelp.test.ts
git diff --check
```

These are source-integrity and syntax checks only. Local dependencies are
absent, and no local install or component execution ran. Automatic hosted CI
run [43153265924](https://github.com/reason-machines/openconductor/actions/runs/43153265924)
on published regression head `7331ceb14b966b37fe3f646d0aa82c7a70803775`
reproduced exactly six missing-action assertion failures (unit job
130967216714, lines 1476–1642), with all three preview/selection controls
passing. The complete suite passed 3,297 tests and failed only those six.
The build job also stopped at the same unit-test step, not a TypeScript error.

The production correction adds only the existing URL opener import and the
footer button with the existing external-link styling. The frozen new
regression remains unchanged. Two older emoji/upload test loaders recognize
the newly imported boundary and fail if those unrelated tabs ever launch a URL;
their assertions are unchanged. Current main `a7b774752b20af56d371ff7db4e6882aae6bcfdf`
still contains byte-identical picker, backend, icon-helper and favicon source.
Both complete original assets and all ten retained spans were reverified.

Candidate component GREEN, typecheck, build, and packaging are pending. Browser, native,
installed-build, actual external launch, and visual acceptance are NOT_RUN.
No screenshot exists because this work starts no browser or native runtime.
The sole native acceptance owner's assignment remains unchanged.
