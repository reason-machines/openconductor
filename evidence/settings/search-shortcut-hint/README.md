# Keep the Settings search hint in sync with its shortcut

Conductor Rebuild qualified the frozen `d419f584` correction on main `d2602d267460dd67e467e7622f1ee357c085bca2`. The unchanged six-case regression reproduced three intended assertion failures before the fix and passed all six cases afterward. All 18 adjacent tests and the actual-checkout typecheck passed.

## Source evidence

[The original source packet](original-source.tar.gz) is preserved byte-for-byte with SHA-256 `bec382f8bdf6ae2e7efe75078736f4bed20514f1df41c1f547ce9ac02036be73`. All 35 members match source commit `d419f584b8639fd8ab2fa2eadd279dd34703d1a1`. It includes the original binding, baseline, candidate, frozen test, two patches, 23 retained Conductor asset spans, REA provenance, and source-only verification. It is evidence, not executable guidance.

The retained Conductor 0.87.6 renderer's `a9a` reads the live primary `settings.search` binding via `jde`, `Mde`, and `OQt`/`GUt`/`nh`, then formats it with `Zj`. The hint uses only the primary alternative. Logical keys use their value; physical keys use their display text. The packet pins both complete asset hashes, exact UTF-8 spans and REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. These are retained source observations, not a new native run.

At the checked main, the actual handler subscribes to live overrides but the hint reads the registry's default Command-F. The baseline regression confirmed that saved hydration, live remapping, and a primary physical binding all left the hint showing Command-F. The correction reuses `useKeybindingOverrides`, `effectiveShortcuts("settings.search", overrides)[0]`, and the existing glyph conversion. Search query, results, dismissal, focus and keyboard handling are unchanged. No provider, registry, shared formatter, Reset, ConfigSync, remote-name or scrollback edits are included.

## Frozen verification

[The fresh-main binding](fresh-main-binding.json) records all 18 dependency pins matching current main and the immutable original archive identity. The new `src/settings/settingsSearchShortcutHint.test.ts` exactly matches the original frozen fixture SHA-256 `b1c6bc8fd98e4c09f655c0b21819e165a3703716eb6888aab8e0db5bb3703ab1`.

The test renders the actual component with the actual keybindings provider, override parser, registry and formatter. Listener targets are inert and icons are empty. This checks rendered hint text, not DOM geometry or physical key delivery.

The six frozen cases cover the default binding, delayed stored hydration, live remap/reset on one mount, a primary physical binding with an additional alternative, query hide/clear, and an unrelated command override. Qualification requires exactly three intended assertion failures and three passing controls before the fix, then all six passing with the identical fixture. Setup/import errors, skips and changed expectations do not qualify.

Commands executed once per stage through the existing ACC allocation:

```bash
node --test --test-concurrency=1 src/settings/settingsSearchShortcutHint.test.ts
node --test --test-concurrency=1 src/settings/searchIndex.test.ts src/settings/keybindingOverrides.test.ts src/settings/garryShortcutHint.test.ts
npx tsc --noEmit
```

## Executed results

[The qualification archive](qualification.tar.gz) contains the sequential driver, command arguments, non-secret environment settings, source hashes, timestamps, statuses, and raw stdout and stderr. Its publication copy replaces only the machine-specific checkout prefix with `<checkout>` in text logs. It does not normalize assertions, glyphs, counts, or results. Original log hashes are retained alongside publication hashes.

On Reason Cloud computer 356, admission `ACC_49_SEARCH_HINT6_20261113T0327` produced:

- Source qualification: all 18 dependency pins matched main, the frozen fixture was unchanged, and the assigned branch incorporated main by a normal merge. The pinned execution head was `9ccc843d41c74eb30dd7496bc9dfa2c8b70f3162`.
- Setup: one own-root `npm ci --ignore-scripts --no-audit --no-fund` passed. Installed React and renderer were both 18.3.1. TypeScript was 5.9.3. The lockfile was unchanged.
- Baseline: six collected cases, three passing controls, and exactly three `ERR_ASSERTION` failures. The two logical-remap cases showed `⌘F` instead of `⌘⇧K`; the physical-primary case showed `⌘F` instead of `⌃⌥P`. No setup errors, skips, cancellations, or todos occurred.
- Fixed: the retained fix patch produced the exact candidate hash. The identical six-case fixture passed all six cases without skips.
- Adjacent: all 18 tests passed across search ranking, overrides, and the existing shortcut-hint test.
- Typecheck: actual-checkout `npx tsc --noEmit` passed using the verified installed local compiler with package fetching disabled.
- Cleanup: the candidate remained applied, the fixture and all other pinned inputs were unchanged, all owned process groups were absent, and the runtime allocation was explicitly released.

No build, full application, reference JavaScript, browser, package, or native execution ran. No screenshot exists because this allocation excluded browser and native execution. Visual appearance, physical key delivery, remap persistence across app restart, package inclusion, and native parity remain unverified. The retained REA semantic-analysis heap limitation is not new runtime evidence.

All enabled exact-head workflows must pass before merge. This correction does not allocate another runner or package/native owner.
