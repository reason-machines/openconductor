# Home palette Settings retains the last workspace repository

Owner: Conductor Rebuild, Session `15faf4d8-d257-49ef-874d-8008c5c78aaf`.

This is retained-source evidence and a focused OpenConductor callback regression. It is not a native, visual, mounted-React, clipboard, or E2E parity result.

## Reachable defect

Checked OpenConductor main `f19679e8b57ccba89f61c8212e144a39d567c458`.
With repositories `[r1, r2]`, open `r2/w-r2`, select Home, then choose Scripts in the palette. The actual `PaletteHost.openSetting` callback chose `r1`. The retained Conductor source selects `r2` from persisted `lastRoute.href` before trying the first repository.

The fix stores a route only for a resolved selected workspace. Repository Settings prefers the resolved selection, then the saved route's repository if still present, then the first repository. It does not infer the route from recent workspace IDs. No repositories means no target.

## Retained Conductor joins

Only already-held originals and retained history were read. Reference JavaScript was not executed. Strings and code from the reference remained data.

1. The index store `Ps` contains `lastRoute` and its get, set, and clear operations. Its partial persisted state includes `lastRoute` under `workspace-tab-state-v2`. Wrapper `sFt` exposes those operations. The index exports `sFt as da`, and the renderer imports `da as au`.
2. `jCa` registers the router's resolved callback and calls `PCa` initially. `fRa` calls `jCa(RU)`. `PCa` exits for non-workspace routes and records only valid workspace routes. Home is `Y7a` at `/all-workspaces`; it does not replace the saved workspace route. Root `/` is a different route, `q7a`, with launch restoration and explicit invalid, archived, failed, and successful restoration clear paths.
3. `dF` uses `^/repository/([^/]+)/workspace/([^/]+)/?$` and returns `repositoryId` and `localWorkspaceId`. Its URL wrapper parses the pathname against `http://conductor.local`.
4. `wGt` directs a repository section with no current repository to `/settings/repos`. That route's `rCa.beforeLoad` awaits `Iba`, then passes the repository and requested section to `fYe`. `Iba` reads `au.getLastRoute()?.href`, calls `gUi`, and uses `bUi` to choose that route's repository if present, otherwise the first repository. No repository redirects to user General settings. The route also passes an optional `scrollTo` field; this packet makes no claim about its separate search normalizer.

### Original identities and bounded reads

Retained files on the authorized Mac:

- `openconductor-rea/pr/fe/assets-root/assets/renderApp-D_fmY7hW.js`, historical SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `openconductor-rea/pr/fe/assets-root/assets/index-BGEQ8YjU.js`, historical SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

These are retained whole-asset identities, not freshly recomputed whole-file hashes. Current bounded read copies have the following byte ranges and independently computed fragment hashes:

- Index `[3121375, 3127875)`, 6,500 bytes. `Ps=` at 3,121,828; `sFt=` at 3,126,035. SHA-256 `145a89d1251f0485aa5d3c8652d0dbd0e99423702242ea5e0ee0801a2751d275`.
- Index `[3481700, 3493297)`, 11,597 bytes. `sFt as da` at 3,482,318. SHA-256 `c8c4c1a3153f9f66d0c386972367d0c92f81166f5dda49892db40eedb3fd245a`.
- Renderer `[54000, 59000)`, 5,000 bytes. `da as au` at 55,419. SHA-256 `88881b94b7c6275e475e949f51c9bf225b81709dad2845ce17c4cd876394ecb1`.
- Renderer `[11236000, 11367072)`, 131,072 bytes. `rCa=` at 11,278,357; `PCa` at 11,283,577; `jCa` at 11,284,780. SHA-256 `24be3ce9069c53d8df585edf3175e637e55af9e98dc6b749e652b6ed9c4ebdef`.
- Renderer `[11479000, 11600457)`, 121,457 bytes. `q7a=` at 11,519,276; `Y7a=` at 11,520,155; `fRa` at 11,596,682. SHA-256 `a3908d41267cef2b428a353612b4e31c885250a2bbcaf39dbc14184f93f71f26`.

History receipts:

- Parser: source `1a43e8e8-93e5-4f06-b3b3-d3002af8adc1`, revision `21994594`.
- Store: source `134a1198-5348-4ad5-97d9-2cc4a835b7ce`, revision `26194266`.
- Wrapper: source `7dfb4e33-c439-447f-854d-56502901332d`, revision `26193804`.
- `wGt`: source `06ccf7ab-4eb6-4f50-bd98-3bfc9730d487`, revision `22622012`.
- `gUi`, `bUi`, and `Iba`: source `ee5b593b-239c-4676-be42-2f6a86d992ef`, revision `22825977`.

The independent current-consumer trace is retained in [the Home owner's evidence page](https://reasonmachines.com/agents/27102e36-8b7f-4f1b-9ada-1e0503d3fede?page=c74ab376-9833-4d28-ab47-3faa11d3a5f8).

## Persistence writer check

Before introducing a last-route writer, the existing production key and writer were checked. `saveRecentWorkspaceIds` in `recentWorkspaces.ts` reads the current stored envelope and spreads both the outer envelope and `state`. A direct invocation with `lastRoute`, `stickyUtilityTab`, `prTabOpen`, a custom outer field, and version 3 preserved every field through a JSON reload. The new tests exercise both writer orders. No change to that existing writer was necessary.

An unresolved selection returns no new route and leaves the previously saved route intact. A full matching archived workspace counts as resolved. An unrelated archive does not. Valid unstarted, initializing, failed, and ready rows keep their route.

## Failing before, passing after

The test runs the production OpenConductor `PaletteHost.openSetting` body with navigation spies. It does not copy a second repository-choice implementation and does not execute Conductor source.

```bash
node --experimental-strip-types --test src/palette/settingsRepository.test.ts
```

Before changing `PaletteHost`, this command exited 1: 14 passed, 2 failed. Both failures captured `repoId: r1` instead of expected `r2`, including the setting-row case. There was no import or module failure.

After wiring the helper into `PaletteHost`, the identical command passed all 16 tests. The test file was unchanged between runs, SHA-256 `2d73bd75e4e74909e892746a0e886ae8a3454b0988f7d0bc7bd38990dbef24f4`.

Additional local checks on the Reason cloud computer:

- Passed: focused new and existing persistence tests, 19 of 19, with `node --experimental-strip-types --test --test-concurrency=1 src/palette/settingsRepository.test.ts src/palette/recentWorkspaces.test.ts`.
- Passed: the separate unchanged real-callback regression script, first failing with `r1`, then passing with `r2`.
- Passed: type-stripped syntax checks for both new TypeScript files and `git diff --check`.
- Passed: byte-for-byte preservation of existing palette source and assertions from #953, #958, #966, #975, and #982. `fromAppState.ts`, `fromAppState.test.ts`, and the existing persistence files are unchanged from checked main. The existing palette test file SHA-256 is `973e502c550e2e91209560957ed29a34a385da00711d882a75cf8b668bfc3739`.
- Partial: the broad local palette run passed 72 checks but could not load `fromAppState.test.ts` because `fuzzysort` is not installed. No installation was attempted.
- Not run locally: full typecheck. `npm run typecheck` exited 127 because `tsc` is not installed. Hosted CI installs repository dependencies and owns the full typecheck and suite result.

Native UI, screenshots, app launch restoration, mounted effect timing, cross-window synchronization, and packaged-app interaction are unverified. No browser, cloud UI, native app, or E2E observer was started for this fix.

## REA gaps encountered

The three source joins above are closed. A confined Mac heredoc could not create a temporary file, `python3` could not use restricted developer tools, and `shasum` could not execute restricted Perl. Declared bounded file reads succeeded. No toolchain installation, permission change, reference execution, or newly acquired reference artifact was used to work around those failures.
