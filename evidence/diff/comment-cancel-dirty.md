# Review-comment cancel preserves cleared and whitespace edits

Conductor Rebuild compared retained Conductor 0.87.6 with OpenConductor main
`a82efd74f08012b0b1cb47be0085e26c536141ce` on 2026-11-10. This is a bounded
shipped-source comparison, not running-app or native parity proof.

## Retained reference

The retained REA application evidence is
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
Its large-renderer semantic coverage is incomplete. Hash-checked literal
reads supplement that evidence without executing target code or claiming
original source. Existing limitations are recorded in
[REA gaps](../../tools/ui-map/REA-GAPS.md). No new REA failure occurred.

This lane rehashed its complete retained `renderApp-D_fmY7hW.js`, 11,600,457
bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
It matches [the extraction manifest](historical-chip/extraction.json).
The retained local locator is `.oc-tmp/chip-reference/renderApp-D_fmY7hW.js`.
No acquisition, device read, analyzer, application, or target-code execution
was performed.

All following offsets are UTF-8 bytes, zero-based and half-open.

- Complete comment composer `SVo`, `[9413099,9416741)`, 3,642 bytes,
  SHA-256 `1e6bca0b0cdf23c9b84cdb0c057e3b0929ad26176e714615132c938dd13f7e83`.
- Complete cancel callback assignment, `[9414482,9414543)`, 61 bytes,
  SHA-256 `ec99d0a978a254ab308009936ff932a70f100e433568f81d88b915c73d9e370e`.
  Its complete body is
  `R=()=>{if(g?_!==(n.body??""):_.trim()!==""){m(!0);return}I()}`.
- Complete editor wrapper `bVo`, `[9406060,9407645)`, 1,585 bytes,
  SHA-256 `bf9a99fe150ac706cf181b4588e2a4d5a87bb8324c9bfe0feb26471d11ae9b9f`.

Within `SVo`, `g` distinguishes an existing comment from a new draft using
`n.state !== "draft"`. `_` is the current draft body, falling back to the
local text state. The cancel callback compares an existing comment's exact
body against its saved body, including empty text and whitespace differences.
For a new draft it checks only whether trimmed text is nonempty. A dirty
comment opens the controlled discard dialog and returns without dismissing.
Otherwise it invokes the existing dismissal callback `I`.

The same complete component binds that callback through `O = R` to both the
Cancel button and the editor's `onCancel`. Its discard dialog offers Keep
editing and Discard. Only Discard invokes `I`. The editor wrapper forwards
its cancel-key callback to the supplied `onCancel`. No claim about the native
keyboard, focus, or outside-pointer behavior follows from these static bytes.
The complete `SVo` includes the local dismissal callback, draft-state update,
submit callback, and dialog wiring. No imported persistence function is needed
to establish this pre-dismissal dirty predicate.

## Distinct OpenConductor mismatch

At the comparison pin, `ReviewComments.tsx` is Git blob
`15423daf8c36508f42d56f75def21d86f3ffcdd3`. Its `Composer.cancel` requires
nonempty trimmed text and compares trimmed bodies before asking for
confirmation. That treats these saved-comment edits as clean:

- Clearing the saved body.
- Replacing the saved body with whitespace.
- Adding only leading spaces, trailing spaces, or a trailing newline.

Cancel or Escape then dismisses the editor without giving the user a chance
to keep editing. New blank or whitespace-only drafts are correctly dismissed
without confirmation and must retain that behavior. Ordinary changed text
already requests confirmation, and unchanged saved text does not.

The source-only lease `DIFF-COMMENT-CANCEL-DE6-04` covers only this dirty
predicate, the focused regression, and this receipt. Shared dialogs, save,
Delete, focus, outside interactions, SQL, comment stores, attachments,
ReviewButton, and turn footers are excluded. OpenConductor's existing browser
confirmation remains an implementation difference from Conductor's controlled
discard dialog. This correction does not claim to close dialog or native parity.

## Regression checkpoint

`commentCancel.test.ts` uses the existing `commentDelete.test.ts` approach to
transpile the actual `ReviewComments.tsx` module and expose its private
`Composer` only in the test VM. React test renderer mounts that component.
The tests edit its actual textarea and invoke its actual Cancel and Escape
handlers. They do not copy the production dirty predicate into a helper.

Twenty cases cover the same nine input states through both entry points,
plus accepting discard of a cleared saved body through each entry point.
A rejecting confirmation must leave dirty drafts open with their exact text.
Blank new drafts and unchanged saved bodies must dismiss without confirmation.
No case may submit the comment, and Escape must prevent its default action.
Unused external boundaries throw if called. No app, IPC, server, browser, or
native process starts.

Ordinary automatic hosted workflow command:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

This first checkpoint changes only the regression and evidence. Production is
unchanged pending hosted failing-before results. Local tests, dependency
installation, typecheck, build, browser, app, native execution, and screenshots
are not admitted and were not run. No rerun, dispatch, acquisition, or additional
observer was started. #847 FULL STOP remains intact.
