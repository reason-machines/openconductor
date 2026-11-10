# Quit confirmation outside-pointer dismissal

Conductor Rebuild, 2026-11-10. Scope is outside mouse-down dismissal in Quit confirmation. Cancel, Escape, Close, autofocus, explicit Quit, primary-action shortcuts, layout, motion, and all other Modal callers retain their behavior.

## Retained reference evidence

The REA-decoded Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its original analysis is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The incomplete whole-program graph is not proof. These complete retained literal receipts were re-read as untrusted data, without a new acquisition, extraction, analyzer, app launch, or native interaction. Byte ranges are zero-based UTF-8, end-exclusive. Vendor source is not copied here.

- Complete Quit caller `y5a` at `[11118132,11119850)`, fragment SHA-256 `957aeff5163bf10ea2015761871ed1ab3badeb1f2f961188bb2f01efadfce4d8`, renders `Tg` around `Im` without a pointer-dismissal override. Complete `Tg` at `[1983870,1984773)` forwards remaining props through `Oos`. The full receipt is [renderer-owner Session](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3) source `b3ce19be-f34e-4e4c-9369-efcbd127b563`, revision `25750252`, containing message `20b3fde0-1ce6-4121-816b-22972654fb23`. Initial-focus evidence remains in [the earlier Quit note](../quit-focus/README.md).
- Complete `Oos` at `[1983759,1983804)` invokes `_3i` as an alert dialog. Its literal is retained in renderer-owner source `0627c89b-6c6d-4912-863d-a0c63a88c8af`, revision `25750047`, also returned in source `8ea70f4f-f45a-491a-b9c8-107f8825f547`, revision `25955698`.
- Complete `_3i` within `[1908550,1909740)` forces `disablePointerDismissal` for alert dialogs. The complete `Vrs.outsidePress` predicate within `[1904600,1907400)` returns false when this flag is true. Their retained sources are `cf8a3d09-7ec4-4177-a458-a655da36dd4e`, revision `23825940`, and `eb39cb1f-01b4-48f8-98ab-ccc5eb9850f0`, revision `23825656`.
- Complete `G3i` at `[1985538,1986040)` and `FXe` at `[1903496,1903919)` provide overlay presentation and refs, not an independent close handler. Complete `SZ` at `[480188,485653)` short-circuits outside-close dispatch for the false-returning predicate. These complete literals are retained in source `262f10ec-3779-484d-bf7d-20cdcebd5d4c`, revision `25956296`. [The Reset dismissal note](../reset-chat-dismissal/README.md) records the same primitive chain and its limits.

This closes the earlier Quit note's bounded outside-pointer source gap. It establishes source-level non-dismissal, not reference runtime event delivery, physical-key behavior, touch or pen acceptance, installed-app behavior, or visual parity. No new REA failure was encountered in this retained-source pass.

## Fresh main and correction boundary

Fetched default main was `d7d316031d97acaff81ebd08ad0884a70c4e57e0`. The assigned branch was merged with it before editing and its tracked tree matched main. Relevant baseline Git blobs are:

- `src/components/Dialogs.tsx`: `1e4cef1e6737a57df0c2ecf1dfa2e2c66ec8aaa3`.
- `src/features/quit/QuitDialog.tsx`: `8ce801d9f6f2ea0afa0f38726f98e8308ea5c1be`.
- `tests/e2e/quit.e2e.mjs`: `87a78858b883f1e3d1f7f60005bf5677dd4fe102`.

Before the correction, Quit delegates to generic `Modal`, whose outer backdrop calls `onClose` on matching-target mouse-down, contradicting the reference chain above. The correction adds an optional `disablePointerDismissal` boolean to Modal, defaulting to false, and enables it only for Quit. Only the existing matching-target handler gains this condition. For an opted-in backdrop, the handler also prevents the mouse-down default instead of allowing that input to move focus out of the dialog. Inner control events are not prevented. Other Modal callers, including those with alert motion, keep their current default. No other component behavior changes.

Before the production edit, fetched main `314aef7f20d0bacc08450b38d2af409048e9c0e5` retained exactly the same three baseline blobs listed above. The published regression-only head `7a1c74f9283a5e1ae8a0e7bdefc52ef76c033d4c` was reconciled into the assigned branch without changing its tree. The six-case Quit test file remains byte-identical to that RED head.

This four-file boundary excludes #916's onboarding, installer, pairing, transcript, and chat-continuation work. The historical #903 and #911 composer failures remain separate and unresolved by this change.

## Regression and verification

Two cases extend the existing `tests/e2e/quit.e2e.mjs` suite. They open actual Quit confirmation on synthetic demo data, deliver outside mouse-down or a full outside click, and require the dialog to stay visible without a quit event, including after pointer release. They then verify explicit Cancel or Escape still dismisses without quitting. The four existing cases, covering immediate quit, explicit primary-action confirmation, Cancel autofocus, and plain Enter, remain unchanged.

The unchanged Keybindings workflow builds the app and runs `npm run test:e2e`, which expands to `node --test tests/e2e/*.e2e.mjs`. No workflow, dependencies, startup fixture, or shared harness is changed. The browser fallback quit event is counted. No native process is quit and no real workspace data is used.

- **Hosted RED verified:** [automatic Keybindings run 42851876175, job 129954452475](https://github.com/reason-machines/openconductor/actions/runs/42851876175/job/129954452475), published head `7a1c74f9283a5e1ae8a0e7bdefc52ef76c033d4c`. Both new cases failed at `tests/e2e/quit.e2e.mjs:104` with `outside pointer input must not dismiss Quit confirmation`, actual dialog count `0`, expected `1`. All four prior Quit cases passed.
- The same job's third failure was the separate composer case `disabled conversion and exact lower boundaries retain ordinary editor paste`. Its evidence was routed to the existing composer owner. This correction does not change composer code or tests and makes no claim about that failure's cause or resolution.
- **First correction partial:** [automatic Keybindings run 42854811944, job 129964826883](https://github.com/reason-machines/openconductor/actions/runs/42854811944/job/129964826883), exact head `98bb06a29dbb063b6eef392f0277b2db14ef1aa7`, passed the four original Quit cases and outside mouse-down with Cancel. The full outside-click case passed every non-dismissal and no-quit assertion, then timed out at line 112 waiting for Escape to detach the dialog. The separate composer case failed its empty precondition at line 134 with 270 characters left. Its three isolated paste Undo/Redo controls passed. The composer failure remains with its existing owner.
- **Follow-up source diagnosis:** fetched default main `314aef7f20d0bacc08450b38d2af409048e9c0e5` still has the three baseline blobs above. On the first correction, `Modal` suppresses `onClose` but does not cancel backdrop mouse-down's default. Its Escape handler is on the inner `.modal`, while initial focus is on Quit's Cancel button. Focus loss explains the surviving Escape failure, but the hosted trace does not record `activeElement`, so the mechanism remains an inference until corrected behavior is checked. The minimal follow-up prevents the default only for matching backdrop input with `disablePointerDismissal`; it does not add a global Escape handler or change test timing/assertions. This is an implementation correction to preserve explicit dismissal, not a new claim about Conductor's internal focus implementation.
- **Hosted GREEN pending:** the same six unchanged Quit cases must pass on the follow-up's published head. Full-suite and merged-main results remain separate from this scoped behavior proof.
- Local source hygiene: `git diff --check`, the staged equivalent, and `git diff --exit-code 7a1c74f9 -- tests/e2e/quit.e2e.mjs` are recorded at publication. These are not behavioral checks.
- Local Node, tests, typecheck, build, dependency installation, browser, app, native interaction, and screenshots: not run under the existing capacity policy and #847 FULL STOP. The existing hosted suite does not retain screenshots of these cases, so no fresh screenshot is supplied.
- Hosted Chrome, when it runs, cannot establish native WebKit, installed macOS behavior, filesystem persistence, or final side-by-side acceptance. Those remain unverified.
