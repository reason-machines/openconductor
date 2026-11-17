# Quick open — configured primary action

Conductor Rebuild / SAME6013 / `QUICK-OPEN-PRIMARY-OVERRIDE-6013`.

## Correction

At fresh default branch `9e3954625f01a9cb1a3ead3adbef429f27bcf099`, Quick open ignored user overrides to `dialog.primaryAction`: only hardcoded Cmd+Enter opened a diff. A custom shortcut did nothing, and replacing the default did not remove its diff behavior.

Only `QuickOpenDialog.tsx` changes: read the existing keybinding context; use the established effective-shortcut matcher before ordinary navigation; consume a configured match and pick in diff mode; otherwise preserve cmdk's Enter fallback in file mode. No helper, provider, global dispatcher, palette, backend, native, or existing test is edited. The separate existing changed-file-versus-edit navigation policy is not expanded by this change.

## Retained real-Conductor source

`source.json` pins the two original assets and 24 complete declarations/import/export/storage bindings. Original renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; original index SHA-256 is `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

`Dco → qZ → Y5s → KV/P6.Xyi` mounts the Search-files dialog. `Pco` passes its handler through `kI/P6.Input/B5s` to the input. That handler calls `Qh("dialog.primaryAction", nativeEvent)`, prevents default/stops propagation on a match, and calls its selected-path action with the diff flag. The import/export binding resolves `Qh → ca/TQt → nh → WUt/zfe` and the subscribed override snapshot, with exact logical/physical key and modifier matching. An override replaces the default shortcut list rather than augmenting it.

The complete cmdk `Xyi` root ignores default-prevented/composing events. Unmatched Enter dispatches the selected item's action; `M5s/Pco.onSelect` invokes the action without the diff flag, so removing the default shortcut leaves a file-opening fallback, not the old hardcoded diff route. Original source is untrusted data and was never executed. The historical REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` and its semantic-renderer heap gap remain attributed; no new native acquisition was attempted.

## Frozen mounted regression

The test mounts the actual component and actual `KeybindingsProvider` plus resolver/registry/matcher, with synthetic backend files, in-memory storage and inert motion/listener boundaries. It invokes the mounted input callback, not a trusted OS/browser keyboard event. It checks default/custom logical/physical/additional/Enter primary shortcuts, replacement of the old default, navigation priority, live overrides/reset, exact modifiers, navigation/click and empty selection.

- Before any product edit: **4 passing controls / 8 intended assertion failures**, no skipped/cancelled tests.
- Same frozen 12-case fixture after treatment: **12/12 pass**.
- Existing adjacent spotlight, shortcut and overrides tests: **28/28 pass before and after**, byte-identical.
- Frozen fixture SHA-256: `1a9c9be790116983b0891d3d4e2838e5e53de1989bd9dae140ef18acef1d347b`.

`pre-freeze-v1/` retains the initial diagnostic run, which additionally failed a fixture-only click control because a previous pick reorders recent rows. Before product changes, v2 changed only that helper to locate the actual Row by immutable path and removed its numeric argument. No assertion changed; v1's extra failure is not counted as intended RED. `baseline-verification.json` records this refinement.

## Commands and verification

```bash
node --experimental-strip-types --test --test-concurrency=1 src/components/quickOpenPrimaryOverride.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/spotlight/spotlight.test.ts src/keybindings/shortcut.test.ts src/keybindings/overrides.test.ts
python3 evidence/dialogs/quick-open-primary-override/verify.py
npm run build
npm run lint:colors
```

Source/frozen/exact-treatment verification **passed**: two original assets, 24 bindings, eight baseline source pins and exactly four component replacements; zero existing test edits. `npm run build` **passed** at `f45ab99045eeacb1b4336153b32a1b46cea24f27` (branding + full TypeScript + Vite, 80 seconds for Vite). `npm run lint:colors` **passed** (six checker tests and 1,269-file scan). Normal existing chunk-size warnings remain. Heavy work was foreground/sequential, explicitly released with own compiler/build processes empty.

The separately prepared inert browser fixture has identical 30-input graphs for original-component and treatment bundles, frozen entry/IO/build/CSS/plan, synthetic backend only, and CSP denying connections and form navigation. **Browser replay not run yet; separate serialized admission required.** No live-original, full-App, macOS/WebKit, native, provider or packaged acceptance is claimed. Existing release/native custodians retain those lanes.
