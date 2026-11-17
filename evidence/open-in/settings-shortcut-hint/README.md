# Settings path shortcut hints

Conductor Rebuild owns `ICON-SETTINGS-SHORTCUT-HINT-15`.

## Source contract

The retained Conductor renderer sends `workspaces-dir` from the Workspaces path row and `repo-root-dir` from Root path into `P9` and its icon-menu `cFn`. The complete `g4i` predicate excludes `workspaces-dir`. It permits `repo-root-dir` on `/settings/repos/` through `pvs`. Only a permitted default-app row renders `Ss`.

On baseline main `405c19089cf3549502d9457b2821693bcaef5012`, both actual Settings callers share `PathLine`, which supplies no hint context. `OpenInButton` renders the configured hint for either row. The difference is caller context, not path text or icon appearance.

The source asset, 13 retained spans, byte offsets, hashes and three REA evidence IDs are pinned by [the existing source packet](../icon-menu-numbering-caller/manifest.json). The verifier checks each span against that asset. It does not execute extracted Conductor code. REA caller discovery was partial and the full renderer parse exhausted its heap; the retained full caller and predicate bodies establish this bounded static contract, not runtime behavior.

## Regression

`src/features/openIn/settingsShortcutHint.test.ts` renders the actual `RepoMiscRows` through its private `PathLine` and real `OpenInButton` and app helpers. Only external settings, motion, keybinding and IPC boundaries are controlled. Unrelated Settings row effects are inert.

Nine cases cover two Workspaces default-app omissions, two Root path hints, identical-path caller distinction, both icon-only badge controls, and both exact app and copy payloads. Hosted baseline head `290b500317f6c809f958c94b3b023f946d510bf7` reproduced all three intended assertion failures. Cursor and Terminal Workspaces rows and the identical-path caller distinction incorrectly displayed `⌘⇧O`. All six controls passed. The full suite passed 3,115 cases and failed only these three. Typecheck passed before the same assertions failed in the build workflow. [The hosted receipt](hosted-red.json) pins both jobs and the decisive lines. The existing 11 numbering cases remain byte-identical, including generic icon and split-menu shortcut hints.

Verification on Reason cloud uses Python source and digest checks plus `git diff --check`. Normal hosted CI runs `node --test "src/**/*.test.ts"`. Local Node, Rust, browser and native execution are not admitted for this lane.

## Repair boundary

After observed hosted assertion-level RED, the Workspaces row passes a presentation-only `showShortcutHint={false}` through `PathLine`. `OpenInButton` defaults the option to true. Root path, generic icon menus, split menus, numeric registration, app eligibility, invocation and all frozen fixtures remain unchanged.

## Acceptance limits

Hosted assertion RED is confirmed. Candidate source verification passed; unchanged-fixture hosted GREEN is pending. Native GUI, physical key delivery, shortcut dispatch, app activation, clipboard behavior, side-by-side screenshots and full checkpoint restoration are unverified. There is no screenshot because this lane has no browser or native runtime admission. Component assertions are not native parity.
