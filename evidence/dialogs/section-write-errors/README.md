# Section write failure feedback

Conductor Rebuild. This is the test-only baseline for a focused failure-feedback change. Hosted execution is pending. No behavioral RED or candidate success is claimed yet.

## Source qualification

The retained Conductor renderer and index assets were extracted from the real app through REA. Their complete identities, declaration ranges, import/export joins and source limitations are recorded in `source.json`. The joined route covers `Aya`, `qoo/Koo`, `p1e`, the installed navigation-section service, local create/edit actions, optimistic rollback and rethrow, and the local backend's storage boundary.

The original form closes immediately after calling mutate. The mutation wrapper schedules the action and retains its success/error callbacks independently of the form. `Aya` supplies the visible messages "Couldn't create section" and "Couldn't edit section". This supports failure feedback after close, not an awaited-close or busy-state rewrite.

At main `838ab2a1c76d11f8048a89c9d4c01ba822db2204`, the actual App callback dispatches a synchronous section action. The actual store persists the layout separately. Rejection logs the error and reloads the saved layout, without a toast channel. All five scoped source files are identical to the earlier qualified main `405c19089cf3549502d9457b2821693bcaef5012`.

## Hosted regression

`src/components/sectionWriteError.test.ts` mounts the actual section form, shared Modal, application store hook and Toaster. It extracts the actual App `submitSection` initializer with the TypeScript AST and binds it to that mounted store and toast hook. It does not copy the submit handler or replace the persistence effect.

Only Tauri transport, disposable preference data, unused unrelated store dependencies and nonessential motion/icons are stubbed. A deferred synthetic DB-write rejection occurs after the actual dialog unmounts. The assertions require the original mode-specific visible message, retain reload behavior and reject diagnostic leakage. Other cases cover success, a superseded layout, Cancel, stale callbacks, out-of-order settlement and coalesced callbacks.

Hosted command: `node --test "src/**/*.test.ts"`. The normal automatic CI runs it. The fixture hash is sealed in `fixture.sha256`; the same fixture must run unchanged on the candidate.

Test Behavior, Not Implementation shaped the assertions around rendered toast text and dialog lifetime. Laziness Protocol keeps the proposed fix in section callback delivery, with no reducer or shared Modal rewrite.

## Limits

No local Node, browser, native app, installation, new executor or workflow dispatch was run. Native database/queue execution, physical IME and visual acceptance remain unverified. No screenshot is supplied because this lane has no native/browser runtime admission. The strict physical acceptance gate remains unmet.

The eight frozen files from the earlier section-input work are unchanged. No cloud UI, provider path, busy state, awaited-close behavior or shared Modal policy is part of this unit.
