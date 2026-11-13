# Review-comment discard stays inside the app

Conductor Rebuild compared retained Conductor 0.87.6 with OpenConductor main
`73c1e4dacc1f6643e7a7cb2a19f4bfa4c6d84e10` on 2026-11-10. This is a
bounded shipped-source comparison, not rendered or native parity proof.

## Retained reference

REA application evidence
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
has incomplete large-renderer semantic coverage. Hash-checked literal reads
supplement it without evaluating target code. Existing limitations remain in
[REA gaps](../../tools/ui-map/REA-GAPS.md). No new REA failure occurred.

The complete retained `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
This lane rehashed it against [the extraction manifest](historical-chip/extraction.json).
Its retained locator is `.oc-tmp/chip-reference/renderApp-D_fmY7hW.js`.
No acquisition, analyzer, device, browser, or app was started.

All following ranges are UTF-8 bytes, zero-based and half-open. Each range
contains the complete named component, function, assignment, or dialog block.

- Composer `SVo`, `[9413099,9416741)`, 3,642 bytes, SHA-256
  `1e6bca0b0cdf23c9b84cdb0c057e3b0929ad26176e714615132c938dd13f7e83`.
- Cancel callback, `[9414482,9414543)`, 61 bytes, SHA-256
  `ec99d0a978a254ab308009936ff932a70f100e433568f81d88b915c73d9e370e`.
  Its literal is
  `R=()=>{if(g?_!==(n.body??""):_.trim()!==""){m(!0);return}I()}`.
- Dismiss callback, `[9414270,9414364)`, 94 bytes, SHA-256
  `f8f1b99ba29b430ee0b3ea0613b3bcfe70246fb8f50261ee352731e55a9579b7`.
- Dialog construction, `[9415755,9416521)`, 766 bytes, SHA-256
  `892f48ff987015bed006221680a18bbe294b38e7b8b6c5c896755abbd89c5f23`.

In `SVo`, `g` distinguishes an existing comment from a new draft. Cancel
opens local state `h` through `m(true)` when the body is dirty and returns
without calling dismissal `I`. Both the Cancel button and editor `onCancel`
use that callback. The dialog binds `open: h` and `onOpenChange: m`.

The title is "Discard comment?". Existing comments say "Your changes to this
comment will be lost."; new drafts say "This comment will be lost.". The
cancel action says "Keep editing". Only the destructive "Discard" action
binds `onClick: I`. The recovered dismissal callback also clears the reference
app's draft and focus stores. This change does not copy those store operations.

## Controlled-alert dependency closure

The dialog symbols above are local definitions in the same hash-matched
renderer, not unresolved imports:

- `Tg`, `[1983870,1984773)`, 903 bytes, SHA-256
  `4f7b93660718d8e44f87fa32f4fb1eba733f538d3ecf96747182aaf27efc637a`.
  It passes controlled open state and its change callback through `jZ` to `Oos`.
- `jZ`, `[1910696,1910985)`, 289 bytes, SHA-256
  `c57fce88a6519630e130eb81d6098bf2e07cefee72f81375de5a3cd640862c9f`.
  Supplied `open` controls the returned value; changes invoke `onOpenChange`.
- `Oos`, `[1983759,1983804)`, 45 bytes, SHA-256
  `0abf461395f1cf33902d693f3406ca5ebd519abd08ca463e3df524e1758fe19e`.
  It delegates to `_3i("alert-dialog", props)`.
- `_3i`, `[1908711,1909725)`, 1,014 bytes, SHA-256
  `09260b99d1bbeb1ea8ba9de4aead815f033feb6b9ab33a423289b663a971d532`.
  This root selects `alertdialog`, modal behavior, and disabled pointer
  dismissal, and registers the controlled change callback with its store.
- Content `Im`, `[1986046,1988633)`, 2,587 bytes, SHA-256
  `beb65b39a01d82a2900e25add3857daaec2a75ea608c69514adc516a97083b76`.
- Cancel action `Dm`, `[1991418,1992254)`, 836 bytes, SHA-256
  `d3dc21b648a6e3aab9f05b19fdb7bb897b74098f91f5ec85e18badb475eee691`.
  It wraps the close button `MZ`, without the composer's dismissal callback.
- `MZ`, `[1903920,1904245)`, 325 bytes, SHA-256
  `f82673211063fd6645575bf08dc8388f76d1b353ae5b94c044104de88e4db17c`.
  Its click handler requests `setOpen(false)` on the dialog store.
- Discard action `Ag`, `[1990481,1991376)`, 895 bytes, SHA-256
  `dcf625f925cae40befd7efd4fffe39bf1c5b05b82625a2c32e2d88b2176f0aab`.
  It forwards the supplied click callback through the close-button component.

These complete assignments establish the controlled-alert and action wiring.
They do not prove native focus, keyboard timing, animation, or layout. The
underlying browser and store implementations were not executed.

## Distinct OpenConductor mismatch

At the comparison pin, `ReviewComments.tsx` is Git blob
`d819a20eb210f8fc4781e496ccee5bd38eb0ccaf`. Its `Composer.cancel` has the
correct dirty-text predicate from #926 but still calls blocking
`window.confirm("Discard this comment? What you wrote will be lost.")`.
It has no app-controlled alert, no Keep editing button, and no separate
saved-comment description. #926 explicitly left that difference open.

The lease `DE6-05` covers only the composer's local discard state, alert
rendering, and `DialogFrame` import; the mounted cancel test; an inert import
boundary in the Delete test; and this receipt. `DialogFrame`, shared CSS,
save, Delete, focus handling, outside interactions, comment stores, SQL,
attachments, and turn footers remain unchanged. No cloud UI is added.

## Regression checkpoint

`commentCancel.test.ts` still mounts the actual private `Composer`, exposed
only in its transpiled test VM. The same nine input states run through Cancel
and Escape, plus accepting discard of a cleared saved body through each entry
point. These twenty cases retain the #926 dirty-body, exact-text, dismissal,
no-submit, and prevent-default requirements. Their driver now expects an
in-app alert rather than a browser confirmation.

Eight additional cases cover new and saved drafts through both entry points:
Keep editing, change the text, reopen, and discard; and the dialog's close
callback preserving the exact draft. Assertions include the title, distinct
descriptions, safe-cancel marker, destructive Discard button, and absence of
browser confirmation. The shared portal boundary is replaced by a section
that forwards the actual composer's children and close callback. It does not
simulate the composer's predicate or actions. Portal rendering, native keys,
focus, and layout are outside this component test.

The existing six mounted Delete controls retain every assertion. Their only
change registers the newly imported dialog dependency as an unexpected-call
boundary. Rendering a dialog from those cards would still fail the test.

Ordinary automatic hosted workflow command:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

## Hosted failing-before result

The test-and-evidence-only head
`8d669c195b8ac08b2e23a109ad6c4dc96319eed8` kept production and the shared
dialog byte-identical to the comparison pin. The ordinary automatic
[Diff frontend job 130107983381](https://github.com/reason-machines/openconductor/actions/runs/42895654291/job/130107983381)
ran the command above. It reported 229 tests, 207 passed, 22 failed, and none
skipped. All 22 failures were the intended dirty-comment alert cases, log
lines 446 through 1050. They report browser-confirmation count `1 !== 0`
or missing in-app alert count `0 !== 1`. There was no dependency or fixture
setup failure. The six clean-cancellation controls and six Delete controls
passed. The latter are tests 75 through 80, log lines 1051 through 1086.

## Minimal correction checkpoint

The correction adds one local `discardOpen` state to `Composer` and renders
its alert with the unchanged `DialogFrame` and existing confirmation CSS.
The dirty predicate is unchanged. Dirty cancellation opens the alert without
dismissing. Keep editing and the dialog's close callback close only the
alert; explicit Discard closes the alert and calls the existing dismissal
boundary. Clean cancellation still dismisses immediately. Save and Delete
remain unchanged.

The passing-after checkpoint retains both test files byte-for-byte from the
failing-before head. `commentCancel.test.ts` is Git blob
`e4826d605aae20419cf7018cd73e99fce36f5af7`; `commentDelete.test.ts` is
`ba7fe93d51c793973e8dfdf82d6cc6447a4d9515`. Hosted GREEN is pending.

Local `git diff --check`, full retained-renderer and fragment hashes,
unchanged-regression checks, and source-only diff review passed. Local
dependencies, tests, typecheck, build, server, browser, native execution,
installation, and screenshots were not run under #847 FULL STOP. There was
no acquisition, dispatch, rerun, or new worker or observer. Packaging is not
installation, deployment, or native parity.
