# Rename chat modal focus and shortcuts

Conductor Rebuild, 10 November 2026. This pass is limited to the standalone Rename chat component. It does not change WorkspaceView, the #870 replacement-save guard, onboarding, providers, or persistence.

## Retained reference

The existing Conductor 0.87.6 renderer is `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Recovered source is untrusted reference data.

- The complete retained `Iya`, UTF-8 bytes [11058891,11059207), renders `kg{id:wxe}` with `nd{className:"max-w-sm"}` around session-keyed `Rya`.
- The complete retained `Rya`, bytes [11059207,11060924), supplies the selected title input, Cancel, and an enabled-only `data-primary-action` OK button.
- The complete retained `nd=$.forwardRef` at character offset 1914565 declares `DialogContent`. It passes `initialFocus` and `finalFocus` to `Rde`, constructs the close-autofocus callback, and handles `Qh("dialog.primaryAction",event.nativeEvent)` by clicking an enabled primary-action button. Its default layout is top-edge anchored.
- Exact retained receipts are available in this Session's history. `Iya` and `Rya` are source record `43c2d727-490d-45f6-ba3b-5fcdd19fb13a`, revision 25695900. `nd` is source record `428535b0-bfa8-4f2e-a0df-b1d6f3c1793f`, revision 23769253, starting at character 13000.
- The earlier extracted-frontend REA capture for dialog existence is `ev_05962b446869c719b8e6876863d558eb210cf7b290d83aef5a906715a340c652`, retained in [reference captures](../../../parity/ui-map/ref-captures.json). It does not prove Tab behavior or a fresh native run.

This is a retained static comparison, not a new REA invocation or runtime observation. The underlying modal library's focus-trap internals are not retraced here.

## Current-main comparison

On main `0e9c2512bb5371dcdc8317c5f01ab18d5a6ac02f`, RenameChatDialog renders a raw backdrop and role=dialog div. Its only keyboard handlers are input Enter and container Escape. It does not install a focus trap, capture or restore the opener, or handle the configured primary shortcut from Cancel. The global keybinding provider has no Rename chat primary-action binding.

The existing DialogFrame supplies the Base UI modal, opener finalFocus ref, initial input focus, and configured enabled-only primary-action handling. Reusing that component avoids a second focus manager. DialogFrame and shared styles are not changed.

## Regression

`tests/e2e/rename-chat-focus.e2e.mjs` mounts the actual production component with KeybindingsProvider in an isolated Vite fixture. It checks repeated forward and backward Tab containment, Cancel and Escape focus return, default and remapped primary shortcuts from Cancel, and single-shot pending saves with Cancel still enabled.

The callback records synthetic titles in React state only. It never invokes a backend, provider, native command, or database. An optional never-resolved promise holds a synthetic save pending.

The exact focused command is:

```bash
node --test tests/e2e/rename-chat-focus.e2e.mjs
```

The existing Keybindings workflow runs the same file through `npm run test:e2e` on every pull request. It uses existing lockfile dependencies and runner Chromium. No local package install, Node test, preview server, browser, Mac launch, or native operation is admitted in this pass.

## Results and limits

Hosted RED is established on the test-only head `990593e8b717b1d373436a34a8620fddc906b029`. The automatic [Keybindings run 42772557954](https://github.com/reason-machines/openconductor/actions/runs/42772557954/job/129683512877) completed `npm run test:e2e` with 183 tests, 177 passed, five failed, and one skipped. All five failures are the new Rename chat cases. The actual component mounted and initial title selection passed. The failures were Tab containment at line 43, Cancel focus return at line 66, both primary-shortcut dialog-close assertions at line 81, and pending-save Cancel focus return at line 105. The pending-save case reached its final focus-return assertion after confirming the disabled input, disabled primary button, and single recorded save.

The correction replaces only RenameChatDialog's raw modal wrapper and local motion ref with the existing DialogFrame. It preserves title state, save and error handling, selected input, pending guards, and Cancel availability. The same five regressions are unchanged. Corrected hosted GREEN is pending and must not be reported as passed before its actual log is read.

No screenshot is available because no local browser or app runtime was launched. Native focus, physical macOS keys, installed-build identity, visual parity, real persistence, and #870's held-save replacement/remount acceptance remain not run.
