# Section write failure feedback

Conductor Rebuild. The corrected hosted baseline reproduces four missing-toast failures with eight passing controls and a successful build. The minimal candidate retains each write's callbacks after the dialog closes. Candidate hosted verification is pending.

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

## Hosted baseline correction

At published head `631e1f9b7ded78d60a3fd6afffb477853611a593`, the [hosted unit job](https://github.com/reason-machines/openconductor/actions/runs/43110349781/job/130824389650) exercised all 12 new cases: four missing-toast assertions failed and eight controls passed. The [build job](https://github.com/reason-machines/openconductor/actions/runs/43110349781/job/130824389758) separately rejected two hook calls because TypeScript does not preserve their runtime type narrowing inside a hoisted function declaration. This is not a clean executable baseline for the unchanged-fixture comparison.

The corrected baseline uses an arrow declaration for the same Harness, after the existing export checks. All assertions and event sequences remain byte-identical. The corrected fixture is resealed in `fixture.sha256`; automatic hosted execution is pending before any product patch. No type assertion or suppression was added.

Rechecked fresh main `812af41eb4df443dab474283c886f20dc2146461`: all five scoped product files still matched the pinned source hashes before the baseline correction.

## Qualified baseline and candidate

At corrected baseline `27fc9769ac98e22d395bd847ced484ebf707b542`, the [hosted unit job](https://github.com/reason-machines/openconductor/actions/runs/43113588611/job/130835709919) reports 3,137 passing tests and four failures. All four failures are empty toast lists instead of the original create or edit error message. The eight success, superseded-layout, Cancel and stale-callback controls pass. The [keybindings job](https://github.com/reason-machines/openconductor/actions/runs/43113588727/job/130835710559) separately completes `npm run build` successfully. The baseline is recorded in `hosted-baseline.json`.

Immediately before the product patch, fresh main `1a0a2bef734686d3dbfc9c11155562595d9df9e6` still has the same five scoped source hashes. The candidate adds optional create/edit error callbacks to the existing Action union. The store captures the pending callbacks for each persistence invocation and delivers only that invocation's callbacks on rejection. Coalesced actions retain both callbacks, while separate writes retain separate arrays. App uses the existing error toast channel and original mode-specific copy.

Model the Domain shaped this callback array around one persisted write rather than one mutable last callback. Test Behavior, Not Implementation keeps the sealed fixture focused on rendered messages after unmount. The reducer, immediate close, reload, shared Modal, all eight frozen files and the sealed regression are unchanged. Candidate GREEN and native acceptance are not yet claimed.
