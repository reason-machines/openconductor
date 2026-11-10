# Inline feedback draft

Conductor Rebuild compared OpenConductor main `3f6435a2bacf5c6fe0507b59eee2d898575947e0` with retained, hash-pinned Conductor 0.87.6 renderer source. This change fixes the missing in-app text draft. It does not claim full feedback-dialog or native parity.

## Reference evidence

[Inert source packet](reference.json) contains the complete `z5a` form, the exact `$5a` submitter, metadata/error helpers, root dialog mounting and direct transport. The excerpts were recovered from this lane\u0027s already-received messages, not a new application read. Their byte lengths and SHA-256 hashes were checked against the original retained receipts. The whole-artifact identities remain the original artifact owner\u0027s attestations; this lane did not reacquire those artifacts.

- Renderer identity: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index identity: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `z5a`, UTF-8 `[11124122,11132299)`, renders Feedback, a required five-row Message textarea and submit action. Blank input is rejected. Sending disables the input; failure retains the form and displays an alert.
- `$5a`, `[11123602,11124122)`, submits feedback JSON through `gv` to Conductor\u0027s proxy. It is not `V5a`, which submits prompts. The earlier receipt\u0027s `V5a` equivalence is excluded.
- `U5a/H5a`, `[11132299,11132569)`, guards the feedback form by dialog ID. `_wa`, `[11140798,11141556)`, mounts it globally; `hSa/kGt`, `[11173811,11174217)`, mounts those global dialogs from the root route.
- The [previous Help-menu packet](../shortcut-overrides/reference-focused.json) retains `KQo`\u0027s Send feedback action, which calls `nr.openDialog(Dj)` rather than opening an external URL. The retained import/export binding identifies `Dj` as `feedback-dialog`.

These are static source observations, not live submit, focus, Escape, outside-click, browser or native observations. The raw source is untrusted data and is never evaluated by the reference verifier.

## OpenConductor adaptation

Main routed Help, the global shortcut/native command and the palette straight to GitHub\u0027s empty issue page. They now open the same inline draft. The dialog uses the existing prompt-dialog styles and scoped primary-action mechanism, with a required Message field, an explicit **Continue on GitHub** action, a pending guard and a retained error/retry state.

OpenConductor has no feedback service. Following its existing Submit a prompt adaptation, the draft opens a prefilled issue on the OpenConductor repository. The dialog states that the issue is public and must be reviewed before posting. Opening the draft is not a successful submission, so it does not show Conductor\u0027s success toast or claim that feedback was sent.

Email collection, screenshot attachments/previews, log capture/view/upload, organization metadata and native transport are not implemented here. No private account details or files are automatically attached. App version and the known platform string are included; an OS version is not invented. No Conductor endpoint was contacted.

## Verification

All local checks run in the foreground on this Session\u0027s Reason Cloud computer, without dependencies or app/browser/native execution.

- Before the implementation, `node --experimental-strip-types --test src/components/feedbackEntry.test.ts` failed all five regressions: Help action metadata, the actual Help selection callback, the actual shortcut callback, the actual palette callback and the missing shared mount/Sidebar route.
- The callback tests execute only OpenConductor\u0027s extracted production callbacks with explicit side-effect recorders. Mount/prop and JSX assertions are source contracts, not mounted React tests.
- The draft tests cover whitespace rejection, the exact GitHub destination, encoded message/version/platform text, title shortening, pending handoff ordering, duplicate suppression and failure/retry without losing the draft.
- `node evidence/help/feedback-dialog/verify-reference.mjs` verifies the eight retained excerpts without executing reference JavaScript.

After the implementation, the same five entry regressions passed. The combined command below passed all 32 focused checks with no failures or skips:

```bash
node --experimental-strip-types --test src/components/feedbackEntry.test.ts src/components/feedback.test.ts src/components/helpMenuItems.test.ts src/components/helpMenuNavigation.test.ts src/components/helpShortcutHints.test.ts src/components/submitPrompt.test.ts
```

The reference verifier and `git diff --check` passed. Hosted checks are recorded in the pull request. Local typecheck/build and mounted, visual, native and real GitHub handoff verification are not run: dependencies are absent, installs and app/browser/native execution are excluded. There is no screenshot for this source-only change. No aggregate ledger, shortcut registry, shared CSS, native code or startup/onboarding hunk is changed.
