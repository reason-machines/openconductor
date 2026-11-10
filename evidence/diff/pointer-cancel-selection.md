# Cancelled pointer selection in the diff viewer

Conductor Rebuild owns this independent callback correction. Scope is the controlled
line highlight when commenting is allowed; no draft, comment-store, persistence,
save-IPC or native behavior is changed.

## Retained reference source

The retained Conductor 0.87.6 `renderApp-D_fmY7hW.js` is 11,600,457 bytes with
SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The complete `kqo` function is UTF-8 `[9628186,9633515)`, UTF-16
`[9582658,9587987)`, SHA-256
`3af80b1ec23526b5f7da46310901c69f22cb9965ef67fba947801071ede1bcc1`.
Its inert literal receipt is retained in this Session's
`.oc-tmp/retained-kqo.json` and in Reason source record
`31adb556-6382-43ce-818a-9ff54dfe2f00`, revision `25657779`, source sequence 145,
under Session `de6c02f4-4880-4a0d-bf8f-9e3954522753`.

The complete closure establishes these bindings, not just a matching string:

- `OMi(e,t)` supplies `isReadOnly:I`; `R=!I` and `Ye=R` gate commenting.
- `[Qe,Ue]=useState(null)` holds the selected range.
- `We` writes `on?.range??null` to `Ue`; `Ve` maps `Qe` to the controlled
  CodeView value `{id:_6e,range:Qe}` or `null`.
- `ft=useCallback(()=>{Ue(null)},[])` clears that same state.
- The containing div passes `onPointerCancelCapture:Ye?ft:void 0`.
- Its CodeView receives `selectedLines:Ve` and `onSelectedLinesChange:We`.

This is a retained static-source claim, not native runtime evidence. The retained
application code was read as data, not evaluated. No new extraction or REA runtime
was performed for this correction. There is no new REA tooling gap in this unit.

## OpenConductor baseline and regression

The assigned branch was merged with main `0e2d5c217ec9ea25d73a4484690690c3f7ae4300`.
`git diff origin/main` was empty before this unit. At that baseline,
`FileDiffView.tsx`'s `Code` controls Pierre's `selectedLines` using React state and
`onSelectedLinesChange`, but provides no pointer-cancel handler. `clickable`,
derived from the presence of `onLineClick`, already gates commenting.

`pointerCancel.test.ts` transpiles and mounts the actual `FileDiffView` module
with real React and react-test-renderer. Pierre rendering, theme/navigation hooks
and native boundaries are isolated. It invokes the production event callbacks
and reads the resulting controlled CodeView props; it does not duplicate the
selection transition in a test helper.

The four cases cover editable and noneditable text, repeated cancellation, a new
drag after cancellation, unchanged versus changed parent ranges, and commenting
being enabled and disabled. Cancellation must not invoke comment creation or edit
save/change callbacks.

## Verification status

- **Passed:** source-only `git diff --check`.
- **Not run locally:** Node, React tests, dependency installation, typecheck,
  build, browser and native execution, under the serialized capacity restriction.
- **Hosted RED pending:** ordinary automatic CI runs the new tests against the
  unchanged production component in the first source milestone.
- **Hosted GREEN pending:** the callback fix follows the captured RED result.

Focused command for the existing validation queue:

```bash
node --experimental-strip-types --test src/features/diff/pointerCancel.test.ts
```

The existing Diff workflow's ordinary `npm ci` supplies React 18.3.1,
react-test-renderer 18.3.1 and TypeScript; its default
`node --experimental-strip-types --test src/features/diff/*.test.ts` glob includes
the new file. No workflow, timeout, assertion or dependency change is needed.

No screenshot is claimed: DOM pointer propagation, Pierre's actual highlight,
mounted browser/native interaction and visual parity remain unverified. The
separate #855 external-refresh mounted/Pierre/save-IPC proof remains NOT RUN.
