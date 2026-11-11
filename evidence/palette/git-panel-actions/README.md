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

1. `fromAppState.ts` adds the four declarations in source order and shares the resolved-active-workspace predicate with File picker.
2. `PaletteHost.tsx` adds handlers and row icons. The actual existing selection dispatcher is unchanged.
3. `gitPanelActions.ts` carries a typed request keyed by repository and workspace. Only the latest unconsumed request for that target is retained; consumption removes it. Unknown/ineligible requests do nothing.
4. `WorkspaceView.tsx` owns the selected right-panel tab and request effect outside the conditionally mounted `RightPanel`. A hidden panel therefore does not lose the request. Existing turn-file selection and the Uncommitted shortcut still set the shared tab. Changes requests use the existing `diff.update({scope})`, which clears a selected turn; files/checks do not alter scope or center view.
5. The new regression file exercises the adapter, actual extracted action table/selection callback, and actual extracted workspace request-effect callback.
6. This receipt records the evidence and limits.

Show notes remains excluded: the current workspace model has no notes surface, as documented in `src/features/chat/forkWorkspace.ts`. No speculative notes product was added.

## Reproduction and verification

Run on Reason Cloud, one test worker, no install or heavy build:

```bash
node --experimental-strip-types --test --test-concurrency=1 src/palette/gitPanelActions.test.ts
```

- Meaningful RED before the three existing product files were changed: **3 passed, 16 failed**. Every failure was an assertion, not a missing module/import/syntax failure. The new typed request bridge was present, but not integrated into the adapter, host or consumer.
- Unchanged GREEN after integration: **19 passed, 0 failed**, no skips/cancellations.
- Test-file SHA-256 before and after: `719b757f00088204fd4d47c2a331a1b1f032fc8c9af29d7c451f479ad5369ff2`.
- The earlier independent adapter-only scratch regression also changed from **0 passed, 4 failed** to **4 passed, 0 failed** without changing its four assertions.
- Covered: exact four targets, row order, real host-to-bridge callbacks, actual consumer effect, All versus Uncommitted scope, files/checks scope preservation, delivery before the owner subscribes, cleanup, latest-request replacement, repository/workspace isolation, active lifecycle states, invalid selections, unknown actions, and current File picker/Copy URL callback preservation.
- The effect is executed with state-setter and diff-boundary spies, not mounted through React. The tests do not prove paint/effect scheduling, actual panel rendering, center rendering, or browser/native interaction. Hidden-panel proof establishes that the owning effect and state no longer live in the hidden subtree; it is not a screenshot.

Broader command:

```bash
node --experimental-strip-types --test --test-concurrency=1 src/palette/*.test.ts
```

**Partial: 91 passed, 1 test-file failure.** The existing `fromAppState.test.ts` cannot import the locally absent `fuzzysort` package through the keybindings fuzzy matcher. This is not credited as a passing suite. The existing #953/#958/#966/#975/#982 regression files and assertions are byte-for-byte unchanged. Hosted CI must supply dependency-backed typecheck, build and complete tests.

Passed: type-stripped syntax checks for both new TypeScript files; `git diff --check`; six-path scope inspection. Local typecheck/build were not run because dependencies are unavailable and installation/heavy builds are excluded from this lane.

No browser, native app, new acquisition, real provider or duplicate E2E observer was started. No screenshot is provided because this work is restricted to retained-source and lightweight callback checks. All exact-head workflows must pass before protected merge. Consuming-main CI/package/keybinding/artifact checks remain a separate post-merge receipt, not native acceptance.

## REA gaps

The earlier semantic REA loose-file mode was unsupported, and the directory attempt timed out with zero parsed functions. Its retained checks explicitly mark that attempt unsuccessful. Those attempts are not semantic proof. This unit instead uses the retained static source chain above, treating all reference text as untrusted data. Full glyph resolution, mounted rendering and side-by-side visual parity remain unverified.
