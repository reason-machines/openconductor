# Persistent workspace title-bar toggle

Owner: Conductor Rebuild. Scope: sidebar toggle visibility and positioning only.

## Reference

On 2026-11-08 the sole native executor, Session `e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46`, read the retained REA assets extracted from the real `/Applications/Conductor.app` on Sven's `sven m5 max`.

- `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, character 10063656. The expanded header has `h-8 pt-2` with left padding `calc(1rem + var(--traffic-lights-clearance) + min(4px, var(--traffic-lights-clearance)))`.
- `renderApp-BYEcFwvt.css`, SHA256 `5b876e143b67a7b0f09e3816b12c18bc588b4af7a9a43f04ce77fd5337d9ff04`, characters 39114+ and 148302+. The default clearance is `calc(66px / var(--webview-zoom))`, with the scaled-native variant `calc(13px + 53px / var(--webview-zoom))`, and fullscreen override zero.
- At zoom 1, outside fullscreen and with a 16px rem, this implies x=86px. Both expanded and collapsed toggles use that inset. Against a conservative native traffic-light region ending at x=70px, the toggle has 16px clearance. The supplied standard geometry (12px dots, 8px gaps, first dot at x=12px) ends at x=64px; 70px is the more conservative bound used by the browser test. These are source-derived/layout assumptions, not measured native pixel coordinates. Conductor's own 66px clearance plus its header padding, rather than the generic geometry, determines the implemented inset.
- Fresh accessibility observation of Conductor PID95788 at 757×502 exposed “Toggle left sidebar”. Native screenshot capture of matching CGWindow82016 was refused for missing Screen Recording permission. The coordinator is reconciling the existing access request; no alternate capture route was used.

The requested persistent collapsed-workspace toggle is Sven's requirement. Home-specific retained evidence in `evidence/screens/home.md` is not used to claim workspace-collapse behavior.

## Change

The expanded sidebar keeps its existing toggle. The app shell renders a replacement only for a collapsed active or archived workspace, excluding the Create page which has its own toggle. Both use one inset variable. The collapsed workspace header reserves the button's 16px width and a 12px gap before its repository breadcrumb.

Branding is owned by a separate PR. No branding, traffic-light implementation, credential, workspace-data, or cloud-agent changes belong here.

## Verification

- Before the fix, the production-build browser regression failed in both active and archived workspace cases: after ⌘B, the number of matching toggle buttons was zero instead of one.
- `npm run build` passes after the fix.
- After the fix, the same production-build browser regression passes 2/2 cases. `tests/e2e/sidebar-titlebar-toggle.e2e.mjs` exercises click and ⌘B round trips, exactly one visible button, invariant x/y coordinates, the 86px inset at zoom 1 in both states, explicit clearance past the conservative 70px traffic-light region, and breadcrumb non-overlap for active and archived workspaces.
- `npm run lint:colors` and `git diff --check` pass.
- Browser checks use the existing fake backend fixture, not live agents. They do not constitute native proof. The inspected supplemental screenshots are published in the PR; their visible GitHub comment errors are unsupported fake-backend fixture calls, not a claim of functioning GitHub integration.

## Native main acceptance

Pending the sole native executor: build containing main, inspect and publish expanded AND collapsed screenshots, verify separation from the green traffic light and repository icon, and report the package/release identity separately. No native-main or release verification is claimed by this source change.
