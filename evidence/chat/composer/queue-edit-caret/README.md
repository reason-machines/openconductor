# Queue-edit caret placement — `QUEUE-EDIT-CARET-END-135-01`

## Gap

When a queued message enters edit mode, Conductor schedules `focus("end")` in a
microtask, explicitly positioning the caret at the document end. OpenConductor's
`QueueRow` previously called `editor.current?.focus()` with no position
argument, which preserves the editor's existing selection rather than moving to
the end. `ComposerEditor` only selects `TextSelection.atEnd` when given the
explicit `"end"` argument.

## Conductor evidence

Renderer: `renderApp-D_fmY7hW.js`, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Evidence ID: `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
Reference spans in `.ara-state/queue-edit-caret/source-result.json`:
- `queue-edit-end-effect`: the ITo effect that schedules `B.commands.focus("end")`
  in a microtask, guarded against a destroyed editor.
- `queue-edit-prop`: the `JNi` caller that passes the queued message to `ITo`.

## Change

`src/features/chat/Composer.tsx` `QueueRow.useLayoutEffect`:
```
- editor.current?.focus();
+ queueMicrotask(() => { editor.current?.focus("end"); });
```

`queueMicrotask` defers focus until after the same-layout-commit `setValue` state
update and `ComposerEditor`'s subsequent content-sync effect, matching Conductor's
pattern. The guard `editor.current?.` preserves safety against a destroyed ref.

## Tests

5 new cases added to `composerQueueFocus.test.ts` via `editFocusFixture`:
1. Entering edit mode calls `focus("end")` on the queue-edit editor.
2. Re-entering after cancel still calls `focus("end")`.
3. Switching to a different queued row calls `focus("end")` for that row.
4. Leaving edit mode does not call focus on the edit editor.
5. Starting in edit mode on mount calls `focus("end")`.

`queueMicrotask` is stubbed synchronously in the test sandbox so the focus call
is observable within `act()`. No real browser focus, layout, or native behavior
tested.

## Limits

Caret placement after `ComposerEditor`'s content-sync for the stale-state
(reopen-after-cancel) case is not runtime-proven; the deferred microtask
establishes the correct ordering by design. Browser and native visual
verification remain separate required gaps.
