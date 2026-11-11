# Ctrl+ArrowUp preserves Composer focus

Conductor Rebuild compared retained shipped renderer bytes with main `b34ba2de9ad45365715d21a0bfe24d9c36b335fb`. The Composer file is byte-identical to the earlier `b98e5924` comparison.

## Source contract

The retained `uqn` producer returns `ArrowUp`. The visible `lHt` handler checks that Shift, Meta, Ctrl, and Alt are all absent before calling its top-of-editor callback. The `ITo` caller binds that callback to `Z8i.focusLast` outside queue editing. The registry checks the active session, and `GTo` registers the nonempty visible queue and focuses its last row.

OpenConductor's matching guard excludes Shift, Meta, and Alt, but not Ctrl. With an empty draft, a collapsed caret at zero, no suggestions, and a nonempty queue outside editing, Ctrl+ArrowUp therefore prevents the default action and focuses the last row. The correction adds only `!e.ctrlKey` to that guard.

[Source receipt](source.json) records the retained artifact hash, current-source hash, same-input conditions, and exact check commands. [Retained spans](reference-spans.json) contains seven bounded original-code spans with UTF-8 offsets and hashes. Shipped text is inert evidence, never executed.

## Regression

The new `composerQueueFocus.test.ts` mounts the actual transpiled Composer and calls the callback it passes to ComposerEditor. The editor is a boundary double, not a mounted native editor. A DOM endpoint double records queue selectors and focus calls. The test asserts key consumption and focus, not the spelling of the guard.

The seven frozen cases cover Ctrl+ArrowUp, plain ArrowUp, Shift, Meta, Alt, a non-start caret, and an empty queue. The baseline selects only the Ctrl case from the pinned main revision. The expected failure is `preventDefault` being called when false is expected, not a missing module or fixture error. The patched run includes the existing prefix, atom, and root slash tests unchanged.

The admitted checks ran on Reason cloud against candidate `d7bc73619f56f358b28947192fd958e87fe628f5`. The baseline failed for the intended consumed-key assertion (`actual: true`, `expected: false`). The patched four-suite run passed all 31 tests, and `npm run typecheck` passed. [Execution receipt](execution.json) records literal commands, timestamps, exits, log digests, and preservation checks.

Before publication, the candidate was rebased onto main `11a5f73df99faa0d33bcc0c19b78606bc2c0b992`. The Composer baseline, Editor, three existing suites, package manifest, and lockfile were byte-identical to the tested baseline. Local typecheck ran before that rebase, so hosted checks verify the combined tree. No install, browser, native keyboard, IME, or real-provider check ran. Static reference evidence does not establish native acceptance. No screenshot is available because this unit is restricted to source and the serialized Node checks.
