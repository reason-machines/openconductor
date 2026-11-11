# Run → in-app Browser preview

Owner: Conductor Rebuild, terminal/scripts lane.

## Reproduced gap

Re-read the relevant handler at default-branch head `887964ad496b1069e6ef0fb54f16df373e82932a`; it still has the gap originally reproduced at `aad6fcc3421adc3ac30d3a90936ffb94c8c5ecfb`.
The persisted `experimental_in_app_browser_preview` setting is exposed and defaults to false, but Run's Open handler always calls the external opener.

`node --test --test-concurrency=1 src/scripts/inAppPreview.test.ts` before product edits: **3 failed, 2 passed**. The failing mounted `PanelStrip` → `ScriptsPanel` behaviors are enabled Open, the enabled shortcut after switching from workspace A to B, and a live setting transition. The external fallback controls pass. These five tests remain unchanged for the GREEN run.

## Retained shipped-source contract

Conductor 0.87.6's renderer was previously acquired with REA from Sven's authorized Mac. No new acquisition or target JavaScript execution occurred. Original identity and exact UTF-8 half-open spans/hashes are recorded in [reference.json](reference.json).

- `kwa`, `[11142536,11148368)`: complete 5,832-byte view. A sandboxed iframe, Reload, locked scheme/hostname, editable port/path, and explicit Open in browser. The URL/reload count form the iframe key.
- `Huo`/`ule`, `[7518286,7521016)`: workspace+URL surface identity, park-on-anchor-unregister, removal when browser tabs close.
- `KVn`/`P8i`, `[7521016,7522640)`: measured workspace anchor registration, resize/visibility updates and cleanup.
- `Lwa`/`Mwa`, `[11149754,11150920)`: persistent app-root surface host. Hidden surfaces move offscreen rather than unmounting.
- Earlier complete producer packet: `nro`'s `lr` chooses `Wd.navigateToBrowser(url,{reload:true})` when the persisted flag is enabled; otherwise external opening. `Ps.addBrowserTab` retains one URL per workspace, replacing its previous URL. Existing workspace/port identity checks remain closed, not new findings.

Recheck inert bytes with:

```bash
python3 evidence/browser/run-preview/verify-source.py /path/to/retained/renderApp-D_fmY7hW.js
```

Passed: full asset SHA-256, seven complete spans, thirteen static lifecycle joins. `Xlo`'s additional complete span `[7427223,7427439)` confirms a host/port tab label and “Close browser view”. Static source does not prove app execution or native parity. No REA tool failure occurred in this closure.

## Design boundary

One owner map holds a credential-free HTTP(S) preview per workspace. The app's own origin is excluded from embedding because the sandbox permits both scripts and same-origin behavior. An app-root host retains iframe instances; a workspace anchor supplies their visible placement. Closing or replacing a preview disposes its old frame. Hidden chat/Home/workspace transitions park it. Reopening Run's preview reloads the same URL. URL validation and a manual external escape are boundary safety choices, not claims about unobserved reference behavior.

Excluded: annotation overlay and proxy, annotation-to-chat messages, local-server enumeration, native webview changes, cloud-workspace UI and provider execution. The existing native CSP/ACL/permissions are untouched. Browser refusal via X-Frame-Options/CSP is not reliably observable from a cross-origin iframe; no timer or `load` event is presented as proof of successful page contents. Explicit external opening remains available.

## Verification checkpoint

- Source verifier: passed.
- Frozen mounted Run routing regressions: **5 passed** after integration (the same three former failures and two fallback controls). The test file is byte-identical to regression commit `048509b56`.
- `node --test --test-concurrency=1 src/scripts/*.test.ts src/features/browser/*.test.ts`: **98 passed**. This includes the eight new model/mounted-host checks and existing setup, preview, config-load, Run-error, Spotlight and completion controls.
- Initial hosted frontend/keybinding jobs exposed ten fixture failures: nine terminal SSR loads did not stub the newly imported preference boundary, and the extracted real chat-host JSX lacked its new `showBrowser` binding. Reproduced locally: **10 failed / 2 passed**. Added the preference boundary stub and expanded the actual-host shortcut checks to cover Browser visibility without removing any terminal case: **13 passed**.
- `node --test --test-concurrency=1 "src/**/*.test.ts"`: **2,416 passed / 0 failed** after the fixture corrections. No check was disabled or weakened.
- `npm run typecheck`: passed after integration.
- `git diff --check`: passed. Existing #973/#977/#981/#989 control files are unchanged.
- The next exact-head hosted keybindings run exposed a real integration regression: opening Settings remounted the existing toast (`sidebar-motion.e2e.mjs:204`, `same: false`, `animating: 1`). The new browser host existed only in App's normal return, changing the Toaster's sibling index and unmounting the browser on the Settings/Diagnostics early returns. Added two `BrowserPreviewHost` siblings before the existing Toaster in those returns; the normal return and existing E2E assertions are unchanged.
- Added a real-App-root JSX identity regression in commit `d8e23d63e`: page contents alone are substituted; actual outer return siblings and the real Browser host execute in React. `node --test --test-concurrency=1 --test-name-pattern='actual App roots' src/features/browser/BrowserPreview.test.ts`: **2 failed before / 2 passed after**, with the regression byte-identical (`sha256 faf744911ae788d716ec552b1ee53a4bb13f6b51249dd22ab8e6e1d39a29388b`). Both toast and iframe identity persist through Settings, workspace, Diagnostics, Settings and workspace; parked/visible behavior is checked.
- After the root correction, `node --test --test-concurrency=1 src/scripts/*.test.ts src/features/browser/*.test.ts src/keybindings/*.test.ts`: **196 passed / 0 failed**. `npm run typecheck` and `git diff --check`: **passed**. Frozen Run routing test remains byte-identical to `048509b56`.
- Full frontend rerun after this correction: **partial**, killed by the 150-second local command timeout after test 2,297, with no failing test reported before termination. The earlier complete 2,416-test result above belongs to the prior fixture-repair head, not this root correction. Hosted full frontend and unchanged real-browser toast assertions must validate the new published head.
- Actual full-app rendering and navigation: not yet observed. Component tests exercise the real Run/strip, preview host, and App outer-return structure with page/IPC/DOM boundaries substituted.
- Browser screenshot/server: not launched; the single reserved Vite capture still requires serialized admission.
- Installed/native/provider/E2E/side-by-side visual parity: not run.
