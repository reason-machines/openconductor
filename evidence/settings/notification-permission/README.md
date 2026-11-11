# Agent notification permission gate

Conductor Rebuild compared retained Conductor 0.87.6 source against OpenConductor main `248b6c359c830c6ac5e050721bae18e44e168068` on 2026-11-11. This is source and mounted-component evidence, not native or visual parity.

## Reference

The existing real-app REA extraction identifies renderer `renderApp-D_fmY7hW.js` (SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`) and index `index-BGEQ8YjU.js` (SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`). `provenance.json` records the exact UTF-8 half-open byte spans and excerpt hashes.

- Renderer `mei`, bytes 10707680–10708400, disables immediately. Enabling awaits the permission check and, when necessary, the request. It does not invoke the setting writer on denial.
- Index `Aue`, bytes 2538380–2538571, reads browser permission. Only the `default` state queries `plugin:notification|is_permission_granted`.
- Index `Iue`, bytes 2538571–2538645, awaits `window.Notification.requestPermission()`.
- The retained aliases connect those helpers to `mei`; the retained registry row connects `mei` to `notifications_enabled`.

These excerpts are untrusted reference data. They are not evaluated. The existing REA renderer semantic-analysis heap-exhaustion limitation remains unresolved; this change reuses the retained extraction without claiming a new analysis or capture.

## Reproduction and change

The actual General Settings Agent notifications checkbox previously saved `send_native_notification=true` immediately. With permission denied, it therefore persisted an enabled preference that the reference refuses to save.

The focused change checks permission before enabling and awaits the request result. Disabling bypasses permission checks. A ref supplies the latest settings after the asynchronous request so another settings edit is not replaced by the pre-prompt snapshot. No capabilities, persistence schema, provider paths or other Settings controls change.

The unchanged fixture covers disabling, already-granted permission, the default/native-granted fallback, a granted request, denied requests from both default and denied states, and an unresolved request. It mounts the real GeneralPage, Toggle and settings model. Only permission, persistence and unrelated UI boundaries are substituted. It asserts saved values, checked state, call counts, and preservation of unknown and unrelated settings.

## Verification

Run from the repository root after `npm ci`:

```bash
NOTIFICATION_DEPS="$PWD" NOTIFICATION_SOURCE_ROOT="$PWD" node --test evidence/settings/notification-permission/replay/notificationGate.test.cjs
node --test src/settings/notificationPermission.test.ts
```

The same fixture and replay harness were used for both runs:

- Fixture SHA-256 `d27729fbf1c3df418708a3fcbb4ac2977cf71ea2e5c1dcea02250e46f4aa6140`.
- Harness SHA-256 `815f2e5cf14044e64dbda174cd44a9f68028251434ef2aa38d84296f620d3c1d`.
- Baseline main: two controls passed; five intended assertions failed. No setup failures or skips.
- Candidate: all seven cases passed. `baseline.tap` and `candidate.tap` retain the results.

The publication owner independently replayed fresh main `248b6c359c830c6ac5e050721bae18e44e168068` before applying the patch. The unchanged fixture produced five assertion failures: two missing native-fallback query counts, two denied-request writes, and one premature pending-request write. Both controls passed. The candidate then passed all seven cases, and the ordinary CI-discovered TypeScript wrapper passed its one test. The committed TAP files are those independent runs. Fixture and harness bytes remain unchanged.

The local checks used the already retained public React 18.3.1, react-test-renderer 18.3.1 and TypeScript 5.9.3 fixture dependencies under `.oc-tmp/ssh-reset/deps`. Each Node command ran at niceness 15 with a 10-second CPU limit and a 45-second wall limit. No installation was needed. They ran on Reason cloud without a browser, native app or provider execution. The original fixture preserves unrelated values but does not exercise an unrelated edit arriving during a pending permission prompt. A separate [concurrent-settings regression](concurrent-settings/README.md) now covers that scenario without changing the original seven cases. Its candidate/mutant pair proves sealed PR source; normal automatic CI exercises the follow-up's current-main source graph.

## Existing Sync regression integration

On published head `a1024078777a1756c8a827aa80969a98f3dc9f12`, both hosted frontend jobs passed dependency installation and the build job passed `npm run typecheck`. Each then failed the same seven existing Sync tests with `Unexpected import: ./notificationPermission` in `configSyncHarness.cjs`. The notification replay itself passed. This was a loader integration failure, not a type error or permission assertion failure.

The Sync harness now treats `notificationPermissionGranted` like its other unrelated UI boundaries: importing GeneralPage is allowed, but invoking the permission helper records a forbidden boundary and throws. All existing Sync test bodies, the notification fixture and its replay harness remain unchanged. Clean-root hosted checks verify this correction; no local Node run or dependency installation is claimed for this follow-up.

Native permission prompts, actual browser event delivery, native persistence, notification delivery and visual parity were not run. No screenshot is supplied because runtime/native admission and the existing frozen proof queue were deliberately unchanged. Hosted CI, protected merge and consuming-main package results are reported separately on the pull request.
