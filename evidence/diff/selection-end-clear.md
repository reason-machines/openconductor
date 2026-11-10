# Clear a null diff selection end

Conductor Rebuild owns this callback correction. Only the comment-enabled
controlled highlight changes. Parent drafts, comment storage, file editing and
save IPC remain outside this unit.

## Retained reference

Conductor 0.87.6 `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The complete `kqo` function occupies UTF-8 `[9628186,9633515)`, UTF-16
`[9582658,9587987)`, SHA-256
`3af80b1ec23526b5f7da46310901c69f22cb9965ef67fba947801071ede1bcc1`.
Its retained inert receipt is Reason source record
`31adb556-6382-43ce-818a-9ff54dfe2f00`, revision `25657779`, sequence 145,
in Session `de6c02f4-4880-4a0d-bf8f-9e3954522753`.

The complete closure binds `isReadOnly:I` from `OMi(e,t)`, `R=!I` and `Ye=R`.
`[Qe,Ue]=useState(null)` owns the selected range. `Ve` maps that range to
CodeView's controlled `selectedLines`, while `We` follows selection changes.
The `He` callback begins `if(!on){Ue(null);return}`. Its non-null branch
normalizes the line bounds and calls `E` to add a comment. `Tt` includes
`onLineSelectionEnd:He` only when `Ye` allows commenting, and `Vn` passes those
options to the same CodeView.

This is a complete retained static-source callback claim, not a native behavior
claim. No application code was evaluated, and no new extraction, acquisition or
REA runtime was used. No new REA tooling gap was encountered.

## OpenConductor comparison

At the zero-net main baseline `f9203ffa`, `Code` in `FileDiffView.tsx` controls
Pierre's `selectedLines` with local state. Its comment-enabled
`onLineSelectionEnd` handles only non-null ranges, leaving a cancelled highlight
unchanged. The correction belongs only in that callback's null branch. The
existing parent-range effect, non-null callback and #881 pointer-cancel handler
must remain unchanged.

The existing `pointerCancel.test.ts` mounts the actual component with real React
and react-test-renderer, isolating Pierre rendering and native boundaries. Five
new cases invoke its actual selection-end callback and inspect the controlled
CodeView props: editable and noneditable text, repeated clears, a later drag,
unchanged and changed parent ranges, commenting-disabled views and the existing
non-null comment callback. All four pointer-cancel cases remain intact.

## Verification

Focused command, allowed only in ordinary hosted CI for this unit:

```bash
node --experimental-strip-types --test src/features/diff/pointerCancel.test.ts
```

The ordinary Diff workflow installs existing dependencies with `npm ci` and runs:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

React 18.3.1, react-test-renderer 18.3.1 and TypeScript are existing dependencies.
No workflow, fixture infrastructure, dependency or compiler setting changes are
needed.

- Hosted failing-before evidence: [Diff run 42781985285, job 129713952114](https://github.com/reason-machines/openconductor/actions/runs/42781985285/job/129713952114) at regression-only head `4d83b8c0415a402149ffd9e3e18cf631fb97a126` completed with 161 passing and four failing tests. Tests 124–127 failed because `selectedLines` retained the previous range instead of becoming null. The non-null callback case and all four #881 pointer-cancel cases passed.
- The fix adds only `else setSelection(null)` in the existing comment-enabled selection-end callback. The test assertions are unchanged from the failing checkpoint.
- Hosted passing-after evidence: pending the ordinary CI run for the production fix.
- Local Node, dependency installation, typecheck and build: not run under the serialized capacity restriction.
- Native pointer propagation, Pierre DOM highlighting, mounted browser acceptance and screenshots: not run.
- #855 and #866 mounted refresh, real save IPC and native acceptance: not run here and remain with their existing owners.
