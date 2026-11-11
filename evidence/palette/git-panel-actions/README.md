# Palette Git-panel commands

Conductor Rebuild restores four omitted commands using retained Conductor 0.87.6 shipped-source evidence. This is source and callback proof, not native, visual, mounted-React or E2E acceptance.

## Source identity and causal chain

- Held renderer identity: SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. This is the producer's retained whole-asset receipt, not a new whole-asset acquisition or rehash.
- Held `m_a` excerpt: 33,696 bytes; SHA-256 `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`, rechecked locally. Its producer message is `67527dab-e807-4b15-b0af-7ca073ee69a2`; local analysis keeps the excerpt under `.oc-tmp/semantic-rea/palette.js` without executing it.
- The excerpt binds `jn` from the current workspace route, then `Ft=Wd(jn??"")`. It computes `Tr` from the resolved workspace through `pPt(...) === "active"`. All four rows and all four selection handlers use that gate.
- `show-changes` calls `Ft.setGitPanelState({gitPanelActiveTab:"changes",gitPanelDiffScope:{type:"all"}})`.
- `show-uncommitted-changes` calls the same function with `changes` and `{type:"uncommitted"}`.
- `show-all-files` sets `gitPanelActiveTab:"tree"`; `show-checks` sets `gitPanelActiveTab:"pr-status"`. OpenConductor's existing corresponding tabs are `files` and `checks`.
- The rows occur after File picker/Search in files and before Show notes/Link issue/Copy URL. Their four titles and keyword arrays are preserved. No shortcut is invented for them.
- The held `Wd` source is UTF-8 `[2148617,2152120)` in that renderer. Receipt: source `b2f38de5-90c7-48f6-9102-7758b191349b`, revision `26195943`, from the [diff source investigation](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753). Its reported SHA-256 is `8e3d8ea4ccd0b083eb63a3aeddf52d7fab109c51e9ee0fef202f4fb13d8857d8`. `setGitPanelState:w` preserves the route search, conditionally replaces `gitPanelTab`/`gitDiff`, and replaces the route; it does not open a center diff or toggle sidebar visibility.
- The retained `fLn/Qls` source encodes/decodes `all`, `uncommitted`, commit and turn scopes. Receipt: source `9dac3782-2f69-4420-9845-377941b014cb`, revision `26194182`, read at character offset 1500. No reference JavaScript was executed.
- The active local-workspace gate follows the already-shipped [File picker eligibility receipt](../file-picker-eligibility/README.md). Initializing, setting-up, failed and legacy local rows remain eligible; archived/unstarted/missing/wrong-repository rows do not.

The retained source shows icon symbols `GVe`, `jQe` and `py`; this unit does not establish their full glyph definitions or visual equivalence. The added row icons are not a native/visual parity claim.

## Current source and minimal fix

The comparison was made against main `ce6a72b933f70869558d97a56946cbd1d5859e43` with assigned-branch merge `dfc31d44cc71777cd59ac3d047ffba8bb2f255c4` initially byte-identical to it. Before publication, main was refreshed to `a588bddd7f56be4493644dae4c41952919e56f6a`; only unrelated Dart-highlighting files had changed. That head was merged and the unchanged 19-test suite passed again. The existing adapter omitted every one of the four commands, although the workspace already had Changes, All files and Checks tabs.

The collision ledger explicitly cleared exactly these six paths. No `App.tsx`, global keybinding registry, cloud UI, notes surface, native/provider path or protected #847/#916 resource changed.

1. `fromAppState.ts` shares the resolved-active-workspace predicate with File picker and exposes `workspacePaletteData`, which inserts the four context-only rows before Copy URL. The base adapter's legacy list contract stays intact.
2. `PaletteHost.tsx` consumes `workspacePaletteData` in its actual data memo and adds handlers and row icons. The actual existing selection dispatcher is unchanged.
3. `gitPanelActions.ts` carries a typed request keyed by repository and workspace. Only the latest unconsumed request for that target is retained; consumption removes it. Unknown/ineligible requests do nothing.
4. `WorkspaceView.tsx` owns the selected right-panel tab and request effect outside the conditionally mounted `RightPanel`. A hidden panel therefore does not lose the request. Existing turn-file selection and the Uncommitted shortcut still set the shared tab. Changes requests use the existing `diff.update({scope})`, which clears a selected turn; files/checks do not alter scope or center view.
5. The new regression file executes the exact data-memo factory extracted from PaletteHost with the real adapter exports, its actual action table/selection callback, and the actual workspace request-effect callback. It also executes the two frozen legacy fixture/equality blocks without modifying their bytes.
6. This receipt records the evidence and limits.

Show notes remains excluded: the current workspace model has no notes surface, as documented in `src/features/chat/forkWorkspace.ts`. No speculative notes product was added.

## Reproduction and verification

Run on Reason Cloud, one test worker, no install or heavy build:

```bash
node --experimental-strip-types --test --test-concurrency=1 src/palette/gitPanelActions.test.ts
```

- Initial meaningful RED before the three existing product files were changed: **3 passed, 16 failed**. Every failure was an assertion, not a missing module/import/syntax failure. The new typed request bridge was present, but not integrated into the adapter, host or consumer.
- Initial unchanged GREEN after integration: **19 passed, 0 failed**, no skips/cancellations. That historical test-file SHA-256 was `719b757f00088204fd4d47c2a331a1b1f032fc8c9af29d7c451f479ad5369ff2`.
- The earlier independent base-adapter scratch regression changed from **0 passed, 4 failed** to **4 passed, 0 failed** before the CI correction below. That scratch check is superseded by current tests of the exact host data factory; the base adapter no longer owns the new context-only rows.
- Covered: exact four targets, row order, real host-to-bridge callbacks, actual consumer effect, All versus Uncommitted scope, files/checks scope preservation, delivery before the owner subscribes, cleanup, latest-request replacement, repository/workspace isolation, active lifecycle states, invalid selections, unknown actions, and current File picker/Copy URL callback preservation.
- The effect is executed with state-setter and diff-boundary spies, not mounted through React. The tests do not prove paint/effect scheduling, actual panel rendering, center rendering, or browser/native interaction. Hidden-panel proof establishes that the owning effect and state no longer live in the hidden subtree; it is not a screenshot.

Broader command:

```bash
node --experimental-strip-types --test --test-concurrency=1 src/palette/*.test.ts
```

**Current local result is partial: 93 passed, 1 test-file failure.** The existing `fromAppState.test.ts` cannot import the locally absent `fuzzysort` package through the keybindings fuzzy matcher. This is not credited as a passing suite. The existing #953/#958/#966/#975/#982 regression files and assertions are byte-for-byte unchanged. Hosted CI must supply dependency-backed typecheck, build and complete tests.

Passed: type-stripped syntax checks for both new TypeScript files; `git diff --check`; six-path scope inspection. Local typecheck/build were not run because dependencies are unavailable and installation/heavy builds are excluded from this lane.

No browser, native app, new acquisition, real provider or duplicate E2E observer was started. No screenshot is provided because this work is restricted to retained-source and lightweight callback checks. All exact-head workflows must pass before protected merge. Consuming-main CI/package/keybinding/artifact checks remain a separate post-merge receipt, not native acceptance.

## CI integration correction

The first published head `ff6aa57b3e58a8fab3f1e2440c193f2247ce3a3d` passed hosted TypeScript checking, but both frontend jobs failed the same two existing archived-selection assertions. Those assertions compare the entire archived/active base action lists, excluding only File picker and Archive workspace. Adding context-only rows inside the base list broke that existing contract. No frozen test or assertion was changed or weakened.

The correction keeps `paletteDataFromState` as the legacy base adapter and composes the four rows through `workspacePaletteData`, which the actual PaletteHost data memo now calls. The new regression executes that exact memo factory with the real exported adapters, not a test-only alternate route. Its original 19 command/control assertions remain unchanged.

- Both actual frozen fixture/equality blocks were executed locally before correction, without importing their unrelated fuzzy-search dependency: **0 passed, 2 assertion failures**. The unchanged scratch runner SHA-256 is `adb388a05e09f6da9438cea997d8e562646264a09228cfe69852eb10ab744232`; after correction the same runner passed **2/2**.
- The tracked suite now also executes those frozen blocks. Before the product correction it reported **19 passed, 2 failed**; after correction the unchanged suite passed **21/21**. Current test-file SHA-256 before/after that correction is `ee144a86090a6079546c2abedb157ed1a5083fea95bd38dd318cbe5fba4fdb6e`.
- Running the tracked suite and independent frozen-block runner together passed **23/23**, consisting of 21 tracked cases plus duplicate execution of the two legacy controls, not 23 distinct behaviors.
- The frozen `fromAppState.test.ts` SHA-256 stayed `973e502c550e2e91209560957ed29a34a385da00711d882a75cf8b668bfc3739`.
- The prior local broad result was 91 passed plus the unavailable import. The current result is 93 passed plus that same import gap. Full hosted checks must rerun on the corrective published head; the earlier typecheck pass does not verify this later head.

## REA gaps

The earlier semantic REA loose-file mode was unsupported, and the directory attempt timed out with zero parsed functions. Its retained checks explicitly mark that attempt unsuccessful. Those attempts are not semantic proof. This unit instead uses the retained static source chain above, treating all reference text as untrusted data. Full glyph resolution, mounted rendering and side-by-side visual parity remain unverified.
