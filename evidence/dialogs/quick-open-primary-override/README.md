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

## Admitted browser replay

The inert browser fixture has identical 30-input graphs (18 actual source modules) for baseline/treatment, frozen entry/IO/build/CSS/plan, actual KeybindingsProvider, synthetic backend only, and CSP denying connections/forms. The sole 15-minute runtime grant started **18:08:30Z** on 17 November 2026; the tab/preview/process group were closed and explicitly released **18:16:04Z**, before the 18:23:30Z deadline. No server restart or new runtime scope was used.

The same eight controls on each build yielded **baseline 3 passing / 5 intended failures → treatment 8/8 passing**:

- Default Meta+Enter opens the first diff (passing control).
- Custom Meta+D opens the first diff (failed baseline, passed treatment).
- Removed-default Meta+Enter falls back to first file (baseline incorrectly opened diff; treatment file).
- Plain Enter opens the first file (passing control).
- Additional Ctrl+Shift+Y opens the first diff (failed baseline, passed treatment).
- Physical Alt+KeyD with logical key `∂` opens the first diff (failed baseline, passed treatment).
- ArrowUp selects second row; CDP mouse press/release at its observed bounds opens second file (passing control).
- Empty custom primary opens nothing and consumes the event (baseline did not consume; treatment did).

All captured keydown events were trusted and all readbacks reported no errors. `browser-readbacks.ndjson` preserves the actual witness values. Pointer selection opens on mousedown, so the fixture's click-only event log does not include a click after the row unmounts; the mouse protocol receipts and observed selected-row bounds are in `browser-notes.md`. No claim is made that a click event was recorded. Two inspected screenshots are retained as PNGs and published in `media.json`.

**Telemetry qualification:** the frozen capture-listener microtask observed `defaultPrevented: false` even before a treatment action's final dispatch completed. This field was preserved unchanged, not normalized or used to claim final consumption. For the empty control only, an identical additive read-only post-dispatch observer on both builds recorded trusted, cancelable Meta+D with final default-prevented **false → true**. The original baseline empty readback was identical to the corroborating replay. No frozen fixture or component changed, no event was fabricated, and no backend/storage state was modified by the observer. See its exact expression and raw settled values in `browser-notes.md` / NDJSON.

`python3 evidence/dialogs/quick-open-primary-override/audit_browser.py` **passed** (16 case records, exact expected outcomes, 3/8 baseline and 8/8 treatment). Cleanup receipts: tabs `[]`, published preview stopped/listening null, own server processes `[]`, ended process group, independent command-namespace port bind passed. The bind is explicitly separate from the preview namespace, not a substitute for its stopped/listening-null receipt.

**Not run:** live-original side-by-side, full-App, macOS/WebKit, native/provider behavior and packaged inclusion. Source/mounted/Linux Chrome evidence does not establish those. Existing release/native custodians retain their lanes.
