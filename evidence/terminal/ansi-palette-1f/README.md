# Ordinary terminal ANSI palette

Conductor Rebuild adds the 16 existing terminal CSS color tokens to the ordinary terminal's xterm constructor theme. The product change is confined to `src/features/terminal/session.ts`. Cursor lifecycle, input, selection, Unicode 11, line-feed conversion, and every existing terminal fixture are unchanged. ScriptOutput and live-theme handling are outside this change.

## Reference source

Checked main `e89bede5597767d131b1c4c9199fb38403d31209`, which contains #1156. The retained real-app REA acquisition is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

Both original shipped artifacts and seven complete retained caller spans were revalidated against their SHA-256 hashes and byte ranges. The ordinary terminal path is `eSa → w9e → dno → uno → cno → lno → IJe`. `lno` supplies `IJe({showCursor:r})` to xterm. `IJe` maps all 16 normal and bright ANSI fields through `F3("--terminal-…")`. OpenConductor's ordinary constructor omitted these fields even though ScriptOutput already used the same CSS tokens.

[Source manifest](source.json) records the full spans, field mapping, checked main hashes, and evidence limits. The verifier reads the original artifacts from a supplied directory, rather than treating extracted snippets as original bytes:

```bash
python3 evidence/terminal/ansi-palette-1f/verify_source.py --originals .oc-tmp/vio-received-72733982/originals
```

The verifier also requires the exact 16-line product insertion, unchanged existing terminal files and ScriptOutput, both frozen fixture identities, and the recorded test counts.

## Regression and fixture repair

The [production regression](../../../src/features/terminal/terminalAnsiTheme.test.ts) loads the real session module, real xterm constructor, and real Unicode 11 addon. DOM, fit, transport, storage, font preferences, and scrollback preferences are boundary substitutes. Assertions read xterm's public `options.theme`, including after ready and exit events.

The original frozen 20-case fixture, SHA-256 `7bfa12faf155a0dbcc496f21016ba9863e1fa377046c6d6cfb38248e8fc0531c`, produced **17 failures and 3 passes**. Sixteen failures were missing palette values. The independent-terminal control also compared a VM-realm object directly with a host-realm object. That control failed despite identical displayed fields. This first run is not a clean baseline. [Original fixture](fixture-original.test.ts.txt), [first-run display](red-original.tap), and [exact raw first-run bytes](red-original.tap.raw.gz) are retained.

Only that comparison changed to `assert.deepEqual({ ...first.screen.options.theme }, before)`. No case, field expectation, or input changed. The repaired fixture was frozen as `da98de47b2473d9cf68518d57eb70a239aa8ae37d1372fd7473e5161aaab3699` before any product edit. Its actual baseline produced exactly **16 intended palette failures and 4 passing controls**, confirming the comparison-boundary diagnosis. The identical fixture passed **20 of 20** after the constructor-only fix. [Freeze metadata](frozen.json), [clean baseline](red.tap), and [candidate result](green.tap) preserve this sequence.

Controls cover unset CSS tokens, cursor and input lifecycle, background and selection colors, line-feed conversion, Unicode 11, and independent terminal options. The 16 field cases check values at construction, ready, and exit. No transport writes occur.

## Executed checks

All checks ran sequentially on Reason Cloud computer 352 using the existing lock-matched dependencies. No install was needed. The ordinary test slot was explicitly released at 09:55Z on 2026-11-12, with no lingering job.

- Failed before as intended, then passed after: `node --test src/features/terminal/terminalAnsiTheme.test.ts`. Corrected baseline 16 failures and 4 passes, candidate 20 passes. Fixture hash unchanged between those runs.
- Passed: the exact 24-file adjacent command below, **208 of 208**. [Log](adjacent.tap).
- Passed: `npm run typecheck`, run once. [Log](typecheck.txt).
- Passed: retained-source and fixture-integrity verifier above.

Each test command and typecheck had a 120-second limit. None timed out. Text logs strip trailing whitespace and excess terminal blank lines for repository whitespace checks. Every unmodified command output is also retained in a deterministic `.raw.gz` file. [Log hashes and transformations](logs.json) are checked by the verifier; assertions and results are not normalized.

```bash
node --test --test-concurrency=1 src/features/terminal/alternateClear.test.ts src/features/terminal/alternateLineEdit.test.ts src/features/terminal/bigTerminal.test.ts src/features/terminal/capture.test.ts src/features/terminal/clearRedraw.test.ts src/features/terminal/cursorState.test.ts src/features/terminal/find.test.ts src/features/terminal/font.test.ts src/features/terminal/nonrunningInput.test.ts src/features/terminal/resizeState.test.ts src/features/terminal/restore.test.ts src/features/terminal/scrollback.test.ts src/features/terminal/selectionAddToChat.test.ts src/features/terminal/selectionChatCaller.test.ts src/features/terminal/selectionChatFocus.test.ts src/features/terminal/sessionLineFeed.test.ts src/features/terminal/sessionUnicode.test.ts src/features/terminal/shellIntegration.test.ts src/features/terminal/shortcuts.test.ts src/features/terminal/spawnFailure.test.ts src/features/terminal/startingBody.test.ts src/features/terminal/tabList.test.ts src/features/terminal/terminal.test.ts src/features/terminal/writeQueue.test.ts
```

## Limits

This is retained-source qualification and a headless public-option regression, not observed native behavior or rendered-color parity. The CSS computed-style boundary is substituted. No browser, app, PTY, provider, native, glyph, visual, E2E, or local build check ran. There is no screenshot because native or browser execution was not admitted. The original assets were rehashed, not freshly acquired from the installed app.

Inherited REA renderer semantic-heap and full-Babel timeout limits remain recorded in the source manifest. No new REA operation was attempted for this bounded reuse, so no new REA failure was encountered.

This unit is outside the existing fixed package cut. Package and native owners remain unchanged. No workflow was enabled, dispatched, or watched. Hosted exact-head CI, package inclusion, executable identity, and native acceptance remain separate checks.
