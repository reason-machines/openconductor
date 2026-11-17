# Clear-scrollback keys in the alternate buffer

Conductor Rebuild qualified this correction against main `1c8e9593099bce8ebfbc19d83052cbfd47df5ad0` on Reason Cloud.

## Source contract

The retained real-app acquisition is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The complete caller and transport declarations, import/export joins, asset hashes, and byte ranges are in the existing [clear-redraw source manifest](../clear-redraw-1f/source/reference.json).

The ordinary surface `lSa` renders `eSa`. Its terminal hook and runtime binding supply the terminal reference and the resolved clear callback through `Zwa` to `$wa`. Complete `$wa` handles the newline action first, then returns `true` when `terminal.buffer.active !== terminal.buffer.normal`. It reaches `terminal.clearScrollback` only in the normal buffer. That callback reaches `$kt.clearScrollback` and the selected `V9` session.

OpenConductor's `startTab` callback instead canceled a resolved clear-scrollback key and called `clearTab` in either buffer. The correction adds one early return for this command in a non-normal buffer. It does not change direct `clearTab`, newline or line-edit dispatch, tab or Find commands, Unicode 11, line-feed conversion, or PTY lifecycle.

## Checks

- `node --test src/features/terminal/alternateClear.test.ts` failed before the product edit. The three intended failures were alternate modes 47, 1047, and 1049. Each returned `false` and canceled the key instead of returning `true`. Seven controls passed. See [RED](red.tap).
- The same command passed all ten cases after the one-line edit. The [frozen fixture hash](fixture.sha256) is unchanged. See [GREEN](green.tap).
- `node --test --test-concurrency=1 src/features/terminal/*.test.ts` passed all 179 cases. See [focused result](focused.tap).
- The first focused run failed three cases before their assertions because two preexisting normal-only test doubles lacked xterm's buffer API. Each now has a normal buffer object and an active reference to that same object. No existing assertions or test inputs changed.
- `python3 evidence/terminal/alternate-clear/verify_source.py --originals .oc-tmp/vio-received-72733982/originals` passed. It rehashed both complete original assets and all 14 retained spans, compared their byte ranges, checked the caller/guard order, and verified the exact product diff, frozen fixture, mock-only additions, and preserved files.
- Local typecheck produced no verdict. A combined tests/typecheck command timed out after 240 seconds, with the tests already passing. A standalone `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck` also timed out at 240 seconds without diagnostics. Its [log](typecheck.log) records the invocation. Automatic PR CI owns the remaining typecheck and build verdicts.

The new tests feed actual escape sequences through the production session's data route into the installed xterm parser. They inspect public normal/alternate buffer state and invoke the installed application key callback. DOM attachment, fit, transport, and persistence are mocked. This proves the headless parser/callback/request contract, not browser key propagation, actual PTY execution, a running full-screen process, glyph rendering, or native visual acceptance. No app or browser was launched and no native/provider action ran. There is no screenshot for that reason.

## Bounded census

The source census also compared the scrollback parser and row conversion through `w9e`'s imports and the index exports. Its 10 MB default, 1 MB to 1 GB clamp, and 160-byte row divisor match the current frontend. Legacy-setting migration was not newly implemented or tested.

Complete `xkt`, `Pkt`, `ubt`, and `lbt` match the current chunk-local shell-mark splitting and active-command output limits. An incomplete mark staying local to a chunk is not a newly identified parity defect. Reference `V9.clearScrollback` also clears tracked commands. OpenConductor retains private command-tracking state, but no current output consumer was found exporting it, so this census does not claim a copied-output leak.

This is retained source evidence, not a fresh extraction, new AST pass, or runtime observation of Conductor. Existing REA tracing limitations remain in the earlier evidence. Package inclusion stays with the existing package owner. Native terminal acceptance stays with the existing native queue and was not admitted by these checks.
