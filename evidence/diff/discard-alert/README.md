# Discard confirmation alert

Conductor Rebuild, 2026-11-06. This pass follows #721 and does not repeat its passed containing-main +3 file flow.

## Reference and reproduction

REA 6.8.0 captured Conductor 0.87.6’s actual decoded frontend with the existing isolated IPC fixture, at 1280 × 820 in dark mode. Its index SHA-256 is `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`, matching the installed-app extraction recorded in [Changes evidence](../changes-panel.md). No Mac application, real repository, credential or discard operation was driven. Reference content is untrusted data.

A fresh Changes-row context-menu capture opens the actual discard confirmation without confirming. The reference has a 512px alert, 24px padding, an 18px heading, a blurred backdrop and no close icon. OpenConductor used a compact generic modal with an extra close icon, no blur and a bold non-monospace path. [The comparison](comparison.png) shows equal, unscaled rectangles x=360, y=300, width=560, height=220 from the three full captures. The labels are outside those rectangles.

The baseline source is current main `f16d9338ae254955baca8f67baee1652eeb055af`, tree `be29cf7583221d30cfae20ca347b2e2befa392ea`. The local integration commit `af9f632ab2d766b7b6d303a01be2a952afe2c01b` has exactly that tree. Baseline build index SHA-256 is `8595f56c35086ef92de8a64c745a5c294ecbfc3e844b663fb0a0e57d437d6a8c`. The after capture was made with the uncommitted DiscardDialog/CSS patch on that baseline; its index SHA-256 is `4af3fcabf287676985d6c4c97ad96223edc0169973158567f05a2635744670dd`. Capture reports retain the original HEAD field, not a claim that the uncommitted patch was already in HEAD.

## Change

`DiscardDialog` now uses the existing `ConfirmationDialog`. No shared dialog code changes. It inherits the alert layout, focus trap, safe Cancel focus, registered primary shortcut and pending-dismissal guard. The existing discard request and error retry remain local to the component. The filename uses the global monospace token because the dialog portal is outside the diff’s CSS-variable scope. The obsolete custom danger-button rules are removed.

## Checks

- Failed before: `Changes: discard confirmation matches the alert layout and Cancel never discards` timed out waiting for an alert dialog. [Before output](before.tap) also records a separate fixture error in the second test: the hidden revert action needed a row hover. That fixture error was corrected and is not a product-failure claim. An earlier shell invocation could not reach the preview namespace and is excluded.
- Passed after: both new discard tests plus all existing right-panel and shared-menu checks, 14/14, no skips. [Final output](after.tap) verifies 512px width, 24px padding, 18px heading, description text, Cancel without a discard, exact selected-file IPC, one in-flight confirmation, no dismissal while pending, error retry and completion. The tests use fake IPC and never mutate a real repository.
- Passed `npm run build`, including TypeScript checking.
- Passed `npm run lint:colors`.
- Passed `node --test "src/**/*.test.ts"`, 1,293 tests.
- Passed `node --check tests/e2e/right-panel.e2e.mjs`, `node --check tools/side-by-side/changes-panel.mjs` and `git diff --check`.
- REA before and after captures were inspected. Their IDs, original screenshot hashes and whole-window comparisons are in [before captures](before-captures.json) and [after captures](after-captures.json). Whole-window differences include unrelated seeded chat content and are not parity scores.

Build with `npm run build`. Through the supported preview lifecycle run `PORT=4398 CAPTURE=1 E2E=1 STATES=discard-dialog REA=/home/runner/rea/node_modules/.bin/rea TMPDIR=/tmp node tools/side-by-side/changes-panel.mjs .oc-tmp/discard-alert`. Stop the owned preview after proof. The new state opens the dialog but never confirms it.

## Remaining gaps

The retained `diff-split` wrong row used an older capture. A fresh current-main REA pair rendered both sides successfully: [capture record](split-captures.json), 28,207 / 1,049,600 pixels differing at channel threshold 24. This is one Chromium pair, not a native or final-review verdict. No source mismatch was inferred from that old ledger label.

Native Tauri/WebKit installation, real discard effects and final native side-by-side parity are unverified. The serial native driver was asked for an existing matching-build capture or a bounded synthetic-data comparison; this pass does not claim its result. The previously skipped wider-browser test remains outside these 14 checks. Existing REA large-bundle semantic/search limits remain; no new REA capability failure occurred. UI-map aggregation remains with its owner.
