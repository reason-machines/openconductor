# Sidebar number hints follow saved shortcuts

Conductor Rebuild prepared the regression on main `621ed16e9a24615a6bbecaf976be9589b70c0e5d` and rebound the same five inputs on fresh main `1d9c4027909205d1dba9006031d922a5f2f2287a` before the correction. The focused fix makes modifier-held number hints read current primary and additional shortcuts on each event. Shortcut activation, labels and row order are unchanged.

## Retained Conductor source

[The source record](source.json) binds two complete retained REA-decoded Conductor 0.87.6 assets, 18 exact byte spans and five current-main inputs. All ranges are zero-based, half-open UTF-8 byte ranges. The original provenance and existing renderer heap and index graph-budget gaps remain in [the shortcut resolver record](../../help/shortcut-overrides/reference-provenance.md). No new REA extraction or runtime was started.

The local sidebar supplies `_ea` with its workspace list. Its `EFi.Provider` makes hint visibility and the first nine local IDs available to `bea`; the row passes the resulting number and visibility to `SFi`, then `v6e` and `uea`. The hint delay is 500 milliseconds. The accessible label remains `Switch with Command-N`, including after a remap.

`_ea` sends keyboard and pointer modifier states to `dAn("workspace.switchTo1", event)`. The renderer imports `nH as dAn`; the index exports `PQt as nH`. `PQt` checks every effective primary or additional shortcut through `nh`. A nonempty modifier set matches when all its flags are held, even with extra flags. `nh` reads `WUt`, which parses the current `ud` snapshot with `zfe`. `EUt` and `jUt` connect that snapshot to stored keybinding overrides.

On the inspected main, `useShortcutHints` instead captures the registry default in `SWITCH_MODIFIERS` and checks it using `holdsExactly`. It has no override subscription. Saving Ctrl+1 therefore leaves the hint tied to Command. This is a static source counterexample, not an observed native failure.

## Frozen regression

The new test mounts the actual exported hook inside the actual `KeybindingsProvider`. It supplies a controlled window event target and clock. Unused row integrations are substituted; the hook, provider, override resolver and hint constants are real production modules. It does not mount the whole sidebar or dispatch a workspace switch.

Nine cases cover the default 500-millisecond delay and release, saved primary and additional modifiers, rejection of the old default after replacement, extra held modifiers, a shortcut without modifiers, live provider changes and reset without remounting, pending cancellation on pointer release, and focus loss. Each fixture unmounts and checks pending timer cleanup.

On regression-only published head `7dfef22016f4470c805f0cc4c06419fd54f8ba0c`, ordinary hosted CI observed exactly the six intended visibility assertion failures and three passing controls. The unit job reached the actual hook and provider; these were `ERR_ASSERTION` failures, not setup failures. The frontend build job failed at the same six tests. [The losslessly compressed baseline log](baseline.log.gz) and [receipt](baseline.json) identify the jobs and outcomes. Unchanged-fixture candidate GREEN is pending. [The digest file](fixture.sha256) freezes the new test and preserves the seven-case Archive tooltip and seven-case busy-visibility tests byte for byte.

## Verification

Source checks on Reason Cloud passed with:

```bash
python3 evidence/sidebar/number-hint-overrides/verify_source.py --renderer .ara-state/retained-conductor-renderer.js --index .ara-state/sidebar-rename-qualification/shared-index-retained.js --baseline
sha256sum -c evidence/sidebar/number-hint-overrides/fixture.sha256
git diff --check
```

These checks validate original asset identities, every retained span, historical main inputs and frozen fixtures. They do not execute the product or the tests. The commands above passed before the product correction, including `--baseline` after rebinding fresh main. After the correction, the same source verifier runs without `--baseline`, preserving the original historical source pins. Ordinary automatic GitHub CI supplied behavioral RED before the product fix. A loader, import, typecheck or setup failure does not qualify as that RED. Every exact-head check must pass before the protected merge, followed by consuming-main and package verification.

Local Node, Rust, dependency installation, browser, native application and installed-package checks were not run. No new screenshot is available because no browser or native runtime ran for this increment. Native acceptance remains with its existing owner. A workspace checkpoint capture timed out; preserved local evidence and the attached preparation archive are not a verified whole-workspace checkpoint.

## Boundary

Only the local `useShortcutHints` subscription and modifier predicate, this new regression, and this evidence directory belong to the correction. Shortcut dispatch, global registry or resolver changes, numbering order, labels, Archive behavior and its two frozen fixtures, navigation, permission policy and cloud UI are excluded. The separately identified Home Meta+Arrow endpoint gap is not part of this unit.
