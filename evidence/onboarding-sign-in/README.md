# Local sign-in lifecycle

Conductor Rebuild, 2026-11-06. This increment fixes local onboarding's asynchronous sign-in presentation, not a native authentication or final-parity verdict.

## Reproduced failure and fix

The actual app root mounts React StrictMode. In development, React runs effect setup, cleanup, then setup again. `SignUp` initialized its `live` ref to true, set it false during cleanup, and never restored it on setup. The event handlers still started login, but subsequent login and account-poll results were discarded.

The fix rearms `live` in effect setup. Cleanup still clears it, so a genuinely unmounted sign-up ignores its late result. No authentication backend, credentials, cloud UI, generic Modal, Reset chat, or filesystem path changes.

The fixture mounts the real `LoginScreen` and `SignUp`. Its Tauri IPC boundary returns synthetic login and status responses. It never invokes Reason, opens the supplied dummy URL, reads or writes a database, or uses real accounts/workspaces. `TEST-CODE` is hard-coded fixture data, not a credential.

## Checks

Both before and after use `node --test tests/e2e/onboarding-sign-in.e2e.mjs` in the supported preview process namespace, with `TEST_BASE_URL=http://localhost:4392`.

- Before on main `623b0936`: **5 passed, 4 failed**. Every StrictMode case failed: confirmation code, account polling completion, failed-start retry, and already-signed-in completion. The normal-mount cases and late-result suppression passed.
- After: **9 passed, 0 failed**, with the same checks and inputs. Raw results are in `checks-before.tap` and `checks-after.tap`.
- `npm run build`: **passed**, including TypeScript checking. Existing bundle-size warnings remain.
- `npm run lint:colors`: **passed**.
- `node --test "src/**/*.test.ts"`: **passed**, 1,252 tests.
- `git diff --check`: **passed**.
- Native macOS WebKit, actual `reason login`, real browser sign-in and packaged-app authentication: **not run**. Normal mounting is tested in the Vite fixture, not by running the production bundle.

To reproduce the baseline without changing working files, start `PORT=4392 BASELINE_REF=623b0936 CHECK_SUITE=tests/e2e/onboarding-sign-in.e2e.mjs CHECK_LOG=.rea-work/sign-in-before.tap SIGN_IN_EVIDENCE=.rea-work/sign-in-before node tools/dialogs/serve.mjs --check` through `preview_start`. Omit `BASELINE_REF` and use separate output paths for the fixed check. Stop the preview when finished. The normal CI browser suite also discovers this `*.e2e.mjs` test.

## REA source and visible evidence

The extracted Conductor 0.87.6 frontend is the same identity verified for [the preceding dialog pass](../dialogs/NOTES.md). The local decoded `renderApp-D_fmY7hW.js` SHA-256 was rechecked as `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

`xBi` occupies byte offsets 10,146,096–10,147,776 in that decoded chunk. Its sign-up component changes the button to "Opening browser...", displays "Finish signing in in the browser window.", and clears the opening state on an initiation failure so the inline error appears. These static observations support the intended presentation, not actual sign-in execution. Existing [first-run evidence](../screens/first-run-onboarding.md) records the gate and auto-advance behavior.

The Conductor control crop is reused from [the checked-in opening-browser screenshot](../screens/onboarding--sign-up-opening-browser--dark.png), not recaptured. Its [manifest entry](../screens/manifest.json) records REA `capture_browser_scenario` evidence `ev_891ca5d616b9606560d6b5051c50a7b9fc99e5e7547e549f9bed3666b033d51c` and image SHA-256 `fbe4a4c0b898331dd218e401de49a29dd4c019c55d6716da3555e3e8728e7ae3`. That frontend harness swallows the browser opener. It does not authenticate.

`before.png` and `after.png` show the actual OpenConductor component in isolated Chromium under StrictMode. `before-after.png` compares its control crops. `reference-after.png` places the reused Conductor control crop beside the fixed OpenConductor crop. All were viewed before publication. The reference full viewport is 1440×900 and OpenConductor is 1280×820; crops preserve scale, but they are not full-screen parity evidence or a pixel-score comparison. OpenConductor intentionally adds its local skip link and Reason confirmation code.

`images.json` preserves screenshot identities and crop coordinates. `python3 tools/onboarding/compose-evidence.py` regenerates the crops, comparison images and self-contained `report.html` from the retained full images. No new REA bug was encountered. Existing gaps remain: extracted-frontend observations are not native execution, and synthetic IPC does not prove actual CLI/browser sign-in. The area's native final verdict remains **partial**. No aggregate UI-map row is promoted by this increment.
