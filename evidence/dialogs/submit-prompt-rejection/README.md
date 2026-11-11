# Preserve a prompt when opening its draft fails

Conductor Rebuild fixed Submit Prompt closing before its asynchronous `openUrl`
call finished. A rejected opener discarded the mounted form, including the
prompt and credit name. The dialog now waits for success, keeps both fields on
failure, shows an accessible error, and permits retry. Pending fields and submit
are disabled. Form and shortcut submission share the same in-flight guard.
Escape and outside presses remain explicit dismissals.

OpenConductor still opens a GitHub issue draft on its own repository. This is
an intentional adaptation, not a copy of Conductor's feedback service. An opener
success means that the handoff resolved, not that a GitHub issue was submitted.

## Retained source

[The span receipt](reference.json) identifies the original retained renderer,
REA receipt, full declaration bytes, offsets, hashes and exact literals.
The complete `W5a` declaration awaits the directly preceding lexical `V5a`
function. `V5a` throws on a non-OK response. `W5a` clears both fields and closes
only in its successful `try` path. Its `catch` reports failure without clearing
or closing, and `finally` resets pending state. The two fields and submit button
receive the pending flag. A direct `p.jsx(W5a,{})` mount is retained.

The archive identity, safe member names, full renderer hash and all three
span hashes passed. The original semantic REA renderer analysis exhausted its
heap. This comparison uses already-held verified shipped bytes; no reference
JavaScript ran. The source declarations establish local control flow, not an
observed native rejection or the behavior of the external feedback service.

The own-code counterexample was refreshed against authoritative main
`2fd9759216603cb040cfcffb4a258833948d4120`. Its `SubmitPromptDialog` discarded
`openUrl`'s promise and immediately called `onClose`. The native backend path
awaits `invoke("plugin:opener|open_url", { url })`, so an opener rejection can
reach this dialog's await. No backend or provider code changed.

## Regression proof

The test mounts the actual `SubmitPromptDialog` under a parent that unmounts it
on close. React test renderer runs its real state updates and form callbacks.
The backend opener is a manually resolved or rejected promise; keyboard
registration, motion and shortcut glyph boundaries are stubbed. The actual
prompt URL builder runs, with captured arguments asserted. No URL is opened.
A separate catch observes the synthetic promise to prevent the old discarded
promise from causing unrelated process-level unhandled-rejection noise; the
component receives the original promise unchanged.

Before the production edit:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test src/components/submitPromptRejection.test.ts
```

The result was **3 passed, 4 failed**:

```text
not ok 2 - submit waits for the draft opener before closing and keeps captured arguments
not ok 3 - submit rejection preserves the prompt and name and allows retry
not ok 4 - shortcut rejection preserves the prompt and name and allows retry
not ok 5 - form and shortcut cannot start duplicate pending openers in the same render
# pass 3
# fail 4
```

The first three failures observed `onClose` once rather than zero times. The
fourth observed two pending opener calls rather than one. Empty-input, Escape
and outside-press controls passed. The regression-only local commit
`a79007579` precedes the fix. The final collision reservation renames the file
from `submitPromptRejection.test.ts` to `submitPromptSubmission.test.ts` without
changing its bytes. The test is unchanged between RED and both GREEN runs:
`85cad10aa72044af3ed20b9b78cce9a9098fcf10826a5e117ac5e00d3da2d3de`.

After the fix and final filename alignment:

```bash
NODE_PATH="$PWD/.ara-state/github-dismissal-deps/node_modules" \
  node --experimental-strip-types --test \
  src/components/submitPromptSubmission.test.ts src/components/submitPrompt.test.ts \
  src/components/feedback.test.ts src/components/feedbackEntry.test.ts \
  src/components/githubRepoDismissal.test.ts src/components/clonePendingInputs.test.ts
```

The result was **37 passed, 0 failed**. The seven new mounted tests exercise
pending completion, rejection through form and shortcut callbacks, retained
untrimmed field values, captured URL arguments, retry with changed text,
successful close, duplicate in-flight prevention, empty input, Escape and
outside versus inside presses. `git diff --check` passed.

## Acceptance limits

Full typecheck, build and hosted suites run in CI, not this constrained local
check. No screenshot is included because browser and native execution remain
serialized with other owners and this lane has no admission. Physical input,
focus, shortcut delivery, layout, error rendering, real OS opener behavior,
GitHub submission, installed-app behavior and native parity remain unverified.
Synthetic component tests and static reference source are not native acceptance.
