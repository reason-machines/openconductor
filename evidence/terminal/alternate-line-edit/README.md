# Line-edit shortcuts in alternate screens

Conductor Rebuild checked main `7dc8bbd014ccfeb2202fdd153c33aa3e9060dcb3` on Reason Cloud. This follows the alternate-screen clear correction in #1152.

## Source contract

The retained real-Conductor acquisition is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The [original source manifest](../clear-redraw-1f/source/reference.json) records both asset hashes, all 14 spans, and the ordinary caller chain through `eSa`, `Zwa`, and `$wa`. Complete `$wa` handles `terminal.insertNewline` first. Its active-versus-normal buffer guard returns before the five readline motions.

Main had only the clear-scrollback buffer guard. Its installed `startTab` callback still canceled line start, line end, delete line, word left, and word right in an alternate buffer. `runTerminalCommand` sent the corresponding readline bytes. The correction extends only that guard to the existing `LINE_EDIT_BYTES` commands other than `terminal.insertNewline`. Normal editing, newline, tab, Find, direct clear, clear-scrollback, Unicode 11, line-feed conversion, and every old fixture remain unchanged.

## Executed checks

The new fixture was frozen before either run. TDD kept the failing behavior in a separate local commit. Test Behavior, Not Implementation kept the assertions on the installed callback result, key cancellation, screen contents, and transport bytes.

- `node --test src/features/terminal/alternateLineEdit.test.ts` failed before the fix with 15 intended assertion failures and 14 passing controls. Five motions across modes 47, 1047, and 1049 canceled the key and injected readline bytes. See [RED](red.tap).
- The same command and unchanged fixture passed all 29 cases after the guard change. See [GREEN](green.tap). Controls cover normal editing, return from alternate mode, newline precedence in all three modes, keyup, ordinary input, Find, new-tab, and sibling isolation.
- `node --test --test-concurrency=1 src/features/terminal/*.test.ts` passed all 208 cases. This includes the unchanged alternate-clear, Unicode, line-feed, clear-redraw, and lifecycle fixtures. See [focused suite](focused.tap).
- `npm run typecheck` passed. See [typecheck](typecheck.log).
- `python3 evidence/terminal/alternate-line-edit/verify_source.py --originals .oc-tmp/vio-received-72733982/originals` revalidates both original assets and all 14 spans, the reference guard order, the exact callback-only diff, the frozen fixture, and unchanged existing terminal and keybinding files.
- `git diff --check` passed.

## Limits

This is retained static REA evidence, not a new extraction or an observation of Conductor running. Existing REA tracing limits remain in the original manifest. No new REA operation was attempted.

The tests run the installed xterm parser and production callback with mocked DOM, fit, transport, and persistence. They prove the callback and byte-injection contract, not native key propagation or behavior in a real full-screen process. No browser, app, PTY, provider, glyph, visual, E2E, or local build run occurred. There is no screenshot for that reason. Hosted CI and package inclusion are separate checks. The existing package owner retains consuming-build inclusion; native acceptance remains with its existing unadmitted queue. No workflow was enabled or dispatched, and no watcher was added.
