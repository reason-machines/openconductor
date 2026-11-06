# Sidebar repository actions and Home review

Conductor Rebuild, 2026-11-06. Base main `8e84738`.

## Evidence

The reference is Conductor 0.87.6's unmodified frontend extracted from `/Applications/Conductor.app` on Sven's authorized `sven m5 max`. Its provenance is recorded in [the frontend evidence](../frontend/README.md). The source archive used here has SHA-256 `9ccec1c2a83aacfd5d4d939c0a7872a397fb6e709627719ff4b2789b2431777a`.

`renderApp-D_fmY7hW.js`, function `uBi` at character offset 10,030,179, draws the same five icons for both menu types. Only the shortcut hints depend on `menuType === "context"`. `Dra` immediately after it swaps the repository badge for a chevron only while the header itself is hovered, not while its sibling actions trigger is hovered. The popup uses `my` and `yu`, documented in [ContextMenu.tsx](../../src/components/menu/ContextMenu.tsx). The live reference DOM confirms Base UI Menu, bottom/end alignment, 4px gap, 14px text, 32px rows, and 16px icons.

REA `capture-browser-scenario` captured both applications at 1280×820, dark, with the populated synthetic fixture. OpenConductor uses the existing Stone setting for an equivalent palette. This does not verify or change the default Neutral palette. Tauri commands are mocked and no real user repositories or agent credentials are used.

[Capture and comparison IDs](captures.json) retain screenshot hashes and the exact crop coordinates. REA `compare-web-screenshots` compares raw pixels at thresholds 0 and 24. Crops use identical coordinates on both sides without shifting, recolouring, resizing, or masking fields. The enlarged menu image is for inspection only and is not the comparison input.

## Verdicts

- **Repository actions menu matches the captured state exactly.** The 169×179 crop at x45/y247 has zero changed pixels at both thresholds. [Menu detail](menu-detail.png).
- **Sidebar is partial, not exact.** In the captured populated, collapsed state with the repository menu open, 0.373% differs at threshold 24 and 4.742% at threshold 0. The Home active state and trigger styling still differ. [Sidebar pair](sidebar-pair.png).
- **Home is partial, not exact.** The main content crop differs by 5.126% at threshold 24 and 5.268% at threshold 0. OpenConductor retains its own shorter-height wordmark, 103-city catalogue instead of 385, heavier card icons, and a larger cities footer. [Home pair](home-pair.png). The own branding and Home navigation were intentional earlier project decisions recorded in [Home evidence](../screens/home.md).

The new component is also used by section action menus, but section menus were not independently captured in this change. My workspaces retains its existing custom filter menu. No claim of complete sidebar-menu parity is made.

## Verification

- Before the fix, `sidebar-actions.check.mjs` failed with `0 !== 5` at the per-action icon assertion.
- After the fix, the same check passes five icons, omitted context-only shortcuts, Home/End, Escape, trigger focus return, and keyboard selection of Hide repository on isolated fixture data.
- `npm run build` passes, including TypeScript checking.
- `npm run lint:colors` passes with no colour literals or hue leaks under Neutral.
- `node --experimental-strip-types --test src/state/sidebarOrder.test.ts src/components/sidebarLabel.test.ts` passes all 15 tests.
- Native macOS, Tauri/WebKit, light theme, section menu interaction, and every other sidebar state are not run locally here. CI and the program's native E2E owner cover separate checks; their results must be read separately.

No new REA failures were encountered. This capture still has the existing extracted-frontend limitation: mocked IPC is not a native-app interaction test.

## Reproduce

Build the frontend and install the existing reference fixture dependency with `npm ci --prefix tools/screens --ignore-scripts`. Supply the same extracted frontend at `.rea-work/dist`, or set `DIST_REF` to its directory. Start this foreground command through Reason's `preview_start` on port 4682:

```bash
node tools/side-by-side/main-shell.mjs --check --capture
```

The one server serves Conductor at `conductor.localhost:4682` and OpenConductor at `localhost:4682`. Browser checks and REA run in the server's execution environment because a separate cloud Bash call cannot reach that preview's localhost. `SHELL_STATES=repo-menu` limits capture to that state. `SHELL_OUT` selects the output directory. Stop the preview after the bounded capture to release shared capacity.
