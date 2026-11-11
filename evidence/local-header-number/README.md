# Local workspace header numbers

Conductor Rebuild, 2026-11-07. Reconciled main `cb4c03a56` before changing product source. Prior #757's collapsed-section shortcut correction is already merged and remains unchanged.

## Corrected reference interpretation

Read-only inspection on authorized sven m5 max verified the installed `/Applications/Conductor.app` version 0.87.6 and binary SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. The retained extracted renderApp bundle matches SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

[Static excerpts and scope](local-header-static.json) retain `Dlo`, `Plo`, `Llo`, and the header host dispatch. `Plo` renders W-<n> and `Dlo` provides its Copy link / Copy ID menu. The dispatch sends non-local workspaces to `Mlo`, which calls `Plo`, and local workspaces to `Llo`, which does not. The old sidebar-ws-numbers evidence omitted that host condition and incorrectly described this as a general workspace header feature.

OpenConductor's current scope excludes remote/cloud-workspace UI. The local workspace badge is therefore removed, along with its unused prop, import, and CSS. Home and palette workspace numbers remain. Copy link remains available through existing actions and shortcuts. This is a deletion of a misplaced feature, not the addition of a remote header menu.

Model-the-domain and type-system-discipline shaped the change by keeping the existing local-only workspace header shape, rather than adding a remote-host flag or an unused optional badge callback.

## REA gap

REA 6.7.0 `analyze-javascript-application` analyzed the selected renderApp source on Sven's Mac with a 20-second per-source deadline and a 2,000-node semantic budget. Evidence ID `ev_118f9505f2b69a7f36f24659a649ccc235c40e8a64f65a2b1d8fd0371ba7f4bb` records that the owned JavaScript worker exhausted its heap. The result's graph is incomplete. It does not prove semantic execution or absence of callers. The exact source hash, bounded inert-text excerpts, and extracted-frontend runtime check supply the narrower evidence here. No native UI action, app launch, database read, or app modification occurred on the Mac.

## Regression and verification

Start the existing shell preview with:

```bash
SHELL_OUT=evidence/local-header-number/after node tools/side-by-side/main-shell.mjs --local-header-check
```

Use the supported preview lifecycle on port 4682. Both sides run on Reason cloud Chromium at 1280 by 820 with synthetic data and mocked backends. The reference uses the extracted Conductor frontend, not its native process.

Before the correction, [the regression](before/run.json) failed with `oc/dark: local header must not render the remote-only workspace-number badge`, actual 1, expected 0. Both the setting's actual enabled value and the workspace's actual number 1 are asserted, preventing an absent number or disabled setting from creating a false pass. [Before results](before/results.json) show the reference without a badge and OpenConductor with one.

After the correction, the same header check passes in both themes. The driver also visits Home's All workspaces list and the palette to assert that W-1 still renders. OpenConductor's Home list check uses its explicit seeded home selection because its sidebar Home currently opens the entry-card root; that separate navigation gap is not normalized away or claimed fixed here. See [runtime results](after/results.json).

- `npm run build` passed, including TypeScript. The existing large-chunk warning remains.
- `npm run lint:colors` passed.
- `node --experimental-strip-types --test src/palette/shortcutOrder.test.ts src/state/workspaceNumber.test.ts src/home/allWorkspaces.test.ts src/workspace/link.test.ts` passed 30 tests.
- `node --experimental-strip-types --test 'src/**/*.test.ts'` passed all 1,325 tests.
- `git diff --check` passed.

Full screenshots retain the surrounding differences rather than hiding them. The composed header images crop every input at the same coordinates, x=256 through 1280 and y=0 through 80, with no scaling. Dark comparison includes reference, before, and after. Light comparison includes reference and after because no light failing-before capture was taken. All screenshots used as evidence were viewed.

## Limits and next owned gaps

The local header is still not visually equivalent overall. Reference layout puts the repository icon/name and branch on the left, with the workspace label near Open in. OpenConductor still puts its workspace name on the left, then branch and target chips. Its sidebar Home selects entry cards rather than the reference All workspaces route. These are separate owned gaps, not successful verdicts for this increment.

Actual macOS modifier-number activation, native WebKit rendering, native installation, real authentication, agents, and final native side-by-side parity are NOT RUN here. Native access remains coordinated with the active sign-in and logo owners. The existing cloud 42-context shortcut proof remains partial and is not promoted to native proof. No E2E workflow was dispatched or rerun. All owned preview processes were stopped; receipts are retained with the evidence.
