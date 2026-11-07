# Help popover fill correction

Conductor Rebuild reproduced the Help background mismatch in Chromium on Reason Cloud. The reference is Conductor 0.87.6's decoded frontend from the real Mac app, not an installed native run. Both valid dark captures use Stone at 1280×820. The reference assets match the recorded SHA256 values in [provenance](../../open-in/switcher/provenance.json).

The reference Help function `KQo` declares `ring-1 ring-popover-ring bg-popover text-popover-foreground` and `focus:bg-popover-accent hover:bg-popover-accent`. REA analyzed the inert Help slice as `ev_a5741d7426810a0ccab286f8c817898a562e9fbc21ce0a38984b760ec3230f5c`. Static analysis does not establish execution. The rendered reference capture is `ev_6827aa14339c210296dfb9f46b81c93bd7e082edb74e05326631595007638c59`.

The original Help menu used the generic panel fill, hover overlay, and a layout border. The correction uses the existing popover tokens and an outline shadow, confined to the Help selector block in `src/styles.css`. No tokens, menu actions, or shared components changed.

## Verification

The pixel check reads two samples from the unmodified screenshots. It fails against the before capture and passes against the rebuilt after capture.

```bash
python3 tools/help-menu/check-popover.py evidence/help-menu/popover/reference-dark.png evidence/help-menu/popover/before-dark.png
python3 tools/help-menu/check-popover.py evidence/help-menu/popover/reference-dark.png evidence/help-menu/popover/after-dark.png
```

The background changes from RGB 31,28,26 to the reference's 44,40,38. The focused row changes from 42,39,37 to the reference's 54,50,49. Visible-browser computed styles also confirmed the reference's zero-width layout border and 1px shadow ring after rebuilding. The after image comes from the visible browser, not a REA scenario.

Passed after the correction:

- `npm run build`
- `npm run lint:colors`
- `node --experimental-strip-types --test src/components/helpMenuItems.test.ts src/keybindings/help.test.ts src/palette/*.test.ts`, 53 tests.

## Limits

The full images deliberately retain brand, account, project-count, menu-content, and layout differences. The reference includes its own Discord link. A whole-screen image comparison is not zero and this patch does not claim whole-screen parity.

The attempted light-theme scenario was invalid. The implementation fixture rejected `update_settings` and stayed dark. Projects screenshots contain different repository datasets, so they cannot establish visual parity. Neither observation justifies another product patch. Keyboard navigation was not exercised by this capture. Installed macOS rendering, clipboard behavior, external-app launches, and other palettes remain unverified. The cloud preview was stopped after the bounded proof.
